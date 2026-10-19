"""Pinned Mem0 integration. Each operation has ephemeral SDK history and metered HTTP."""

import json
import os
from contextlib import suppress

import psycopg
from openai import DefaultHttpxClient, OpenAI

from ngertiin.config import get_settings
from ngertiin.memory import policy
from ngertiin.memory.contracts import Admission
from ngertiin.memory.costs import ProviderBudget


class ExtractionModel:
    """Mem0 supplies extraction prompts; our provider adapter enforces output/usage caps."""

    def __init__(self, client):
        self.client = client

    def generate_response(self, messages, response_format=None, **_):
        response = self.client.chat.completions.create(
            model=get_settings().memory_extraction_model,
            messages=messages,
            response_format=response_format,
            max_completion_tokens=2000,
            reasoning_effort="low",
            store=False,
        )
        payload = json.loads(response.choices[0].message.content or "{}")
        memories = payload.get("memories", [])
        payload["memories"] = (
            [
                item
                for item in memories[:5]
                if isinstance(item, dict)
                and isinstance(item.get("text"), str)
                and len(item["text"]) <= 500
                and policy.safe_text(item["text"])
            ]
            if isinstance(memories, list)
            else []
        )
        return json.dumps(payload, ensure_ascii=False)


class Engine:
    def __init__(self, owner, generation, operation, job=None, token=None):
        self.owner, self.generation, self.job = owner, generation, job
        self.budget = ProviderBudget(owner, generation, operation, job, token)
        self.stores: dict = {}

    def __enter__(self):
        os.environ["MEM0_TELEMETRY"] = "false"
        settings = get_settings()
        self.http = DefaultHttpxClient(
            timeout=30,
            event_hooks={"request": [self.budget.before], "response": [self.budget.after]},
        )
        self.client = OpenAI(
            api_key=settings.openai_api_key.get_secret_value(),
            base_url=settings.openai_base_url,
            max_retries=0,
            timeout=30,
            http_client=self.http,
        )
        return self

    def store(self, collection: str):
        from mem0 import Memory

        if collection in self.stores:
            return self.stores[collection]
        settings = get_settings()
        identity = policy.digest(
            f"{settings.memory_embedding_model}:{settings.memory_embedding_dims}"
        )
        with psycopg.connect(settings.database_url.get_secret_value()) as conn:
            conn.execute("SELECT pg_advisory_xact_lock(170018)")
            conn.execute(
                "INSERT INTO runtime_schema_versions(component,version) VALUES (%s,"
                "%s) ON CONFLICT DO NOTHING",
                (f"memory:{collection}", identity),
            )
            stored = conn.execute(
                "SELECT version FROM runtime_schema_versions WHERE component=%s",
                (f"memory:{collection}",),
            ).fetchone()
            if not stored or stored[0] != identity:
                raise ValueError(
                    "Embedding configuration changed; rebuild the memory index explicitly."
                )
        model = settings.memory_extraction_model
        memory = Memory.from_config(
            {
                "history_db_path": ":memory:",
                "custom_instructions": policy.INSTRUCTIONS,
                "llm": {
                    "provider": "openai",
                    "config": {
                        "model": model,
                        "api_key": settings.openai_api_key.get_secret_value(),
                        "openai_base_url": settings.openai_base_url,
                        "max_tokens": 2000,
                        "reasoning_effort": "low",
                        "store": False,
                    },
                },
                "embedder": {
                    "provider": "openai",
                    "config": {
                        "model": settings.memory_embedding_model,
                        "embedding_dims": settings.memory_embedding_dims,
                        "api_key": settings.openai_api_key.get_secret_value(),
                        "openai_base_url": settings.openai_base_url,
                    },
                },
                "vector_store": {
                    "provider": "pgvector",
                    "config": {
                        "connection_string": settings.database_url.get_secret_value(),
                        "collection_name": collection,
                        "embedding_model_dims": settings.memory_embedding_dims,
                        "minconn": 0,
                        "maxconn": 2,
                        "hnsw": True,
                    },
                },
            }
        )
        # Configure the supported providers' clients once. All internal retries/fallbacks
        # cross the same metered HTTP hooks; no unaccounted SDK transport remains.
        memory.llm.client.close()
        memory.embedding_model.client.close()
        memory.llm = ExtractionModel(self.client)
        memory.embedding_model.client = self.client
        self.stores[collection] = memory
        return memory

    def extract(self, text: str):
        memory = self.store(policy.CANDIDATE_COLLECTION)
        existing = memory.get_all(filters={"user_id": str(self.owner), "run_id": str(self.job)})[
            "results"
        ]
        if existing:
            return [item["memory"] for item in existing][:5]
        output = memory.add(
            [{"role": "user", "content": text}],
            user_id=str(self.owner),
            run_id=str(self.job),
            metadata={"capture_job_id": str(self.job)},
        )
        return [item["memory"] for item in output["results"]][:5]

    def admit(self, text: str, candidates: list[str], existing: list[dict]):
        result = self.client.chat.completions.create(
            model=get_settings().memory_extraction_model,
            messages=[
                {"role": "system", "content": policy.ADMISSION},
                {
                    "role": "user",
                    "content": json.dumps(
                        {
                            "original_evidence": text,
                            "candidates": candidates,
                            "existing": existing,
                        },
                        ensure_ascii=False,
                        default=str,
                    ),
                },
            ],
            response_format={"type": "json_object"},
            max_completion_tokens=2000,
            reasoning_effort="low",
            store=False,
        )
        return Admission.model_validate_json(result.choices[0].message.content or "{}")

    def search(self, query: str):
        result = self.store(policy.ACTIVE_COLLECTION).search(
            query,
            filters={"user_id": str(self.owner)},
            top_k=12,
            threshold=0.0,
        )
        return [row.get("metadata", {}).get("app_revision") for row in result["results"]]

    def project(self, revision: dict):
        memory = self.store(policy.ACTIVE_COLLECTION)
        filters = {"user_id": str(self.owner), "app_revision": str(revision["id"])}
        existing = memory.get_all(filters=filters)["results"]
        if existing:
            return [row["id"] for row in existing]
        result = memory.add(
            [{"role": "user", "content": revision["statement"]}],
            user_id=str(self.owner),
            infer=False,
            metadata={
                "app_revision": str(revision["id"]),
                "app_entry": str(revision["entry_id"]),
                "embedding_model": get_settings().memory_embedding_model,
            },
        )
        return [row["id"] for row in result["results"]]

    def purge(self, revision_id):
        memory = self.store(policy.ACTIVE_COLLECTION)
        rows = memory.get_all(
            filters={"user_id": str(self.owner), "app_revision": str(revision_id)}
        )["results"]
        for row in rows:
            memory.delete(row["id"])

    def cleanup_candidates(self):
        memory = self.store(policy.CANDIDATE_COLLECTION)
        rows = memory.get_all(filters={"user_id": str(self.owner), "run_id": str(self.job)})[
            "results"
        ]
        for row in rows:
            memory.delete(row["id"])

    def __exit__(self, *_):
        for memory in self.stores.values():
            memory.db.close()
            for store in (memory.vector_store, memory._entity_store):
                if store:
                    with suppress(Exception):
                        store.connection_pool.close()
        self.client.close()
        self.http.close()
