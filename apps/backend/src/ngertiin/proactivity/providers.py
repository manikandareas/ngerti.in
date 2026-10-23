"""One metered attempt per stage. No SDK retries, raw prompts, or provider errors in logs."""

import json
from uuid import uuid4

import httpx

from ngertiin.accounts.access import unlimited_usage
from ngertiin.async_db import transaction
from ngertiin.chat.store import json_value, lock_account, one
from ngertiin.config import get_settings
from ngertiin.proactivity import policy, store
from ngertiin.proactivity.contracts import Proposals


class EvaluationUnavailable(Exception):
    pass


async def reserve(job, stage, model, body):
    ceiling = len(json.dumps(body, ensure_ascii=False).encode()) + 10000
    settings = get_settings()
    async with transaction() as conn:
        await lock_account(conn, job["owner_id"])
        if not await store.fence(conn, job):
            raise EvaluationUnavailable("source_changed")
        if await one(
            conn,
            "SELECT 1 FROM proactive_cost_events WHERE evaluation_id=%s AND stage=%s",
            (job["id"], stage),
        ):
            raise EvaluationUnavailable("attempt_already_recorded")
        await conn.execute("SELECT pg_advisory_xact_lock(190019)")
        totals = await one(
            conn,
            "SELECT COALESCE(sum(charged_units) FILTER(WHERE created_at>="
            "date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'),0) AS total,"
            "COALESCE(sum(charged_units) FILTER(WHERE owner_id=%s AND created_at>="
            "date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'),0) AS account,"
            "COALESCE(sum(charged_units) FILTER(WHERE evaluation_id=%s),0) AS job "
            "FROM proactive_cost_events WHERE created_at>=date_trunc('day',"
            "now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' OR evaluation_id=%s",
            (job["owner_id"], job["id"], job["id"]),
        )
        if (
            not unlimited_usage(job["owner_id"])
            and (
                totals["total"] + ceiling > settings.proactive_global_daily_units
                or totals["account"] + ceiling > settings.proactive_account_daily_units
            )
        ) or totals["job"] + ceiling > settings.proactive_evaluation_units:
            raise EvaluationUnavailable("budget_exhausted")
        identity = uuid4()
        await conn.execute(
            "INSERT INTO proactive_cost_events(id,owner_id,evaluation_id,stage,"
            "model,reserved_units,charged_units,state) VALUES (%s,%s,%s,%s,%s,%s,%s,"
            "'reserved')",
            (identity, job["owner_id"], job["id"], stage, model, ceiling, ceiling),
        )
        from ngertiin.usage.events import model_reserve

        await model_reserve(
            conn, job["owner_id"], f"proactive:{identity}", model, ceiling, kind="proactive"
        )
        return identity


async def settle(identity, usage):
    counts = {k: v for k, v in usage.items() if type(v) is int and v >= 0}
    total = counts.get("total_tokens")
    if total is None and "input_tokens" in counts and "output_tokens" in counts:
        total = counts["input_tokens"] + counts["output_tokens"]
    async with transaction() as conn:
        owner = await one(
            conn, "SELECT owner_id FROM proactive_cost_events WHERE id=%s", (identity,)
        )
        await lock_account(conn, owner["owner_id"])
        row = await one(
            conn, "SELECT * FROM proactive_cost_events WHERE id=%s FOR UPDATE", (identity,)
        )
        confirmed = type(total) is int and 0 < total <= 1_000_000_000
        await conn.execute(
            "UPDATE proactive_cost_events SET state=%s,charged_units=%s,usage=%s,"
            "settled_at=now() WHERE id=%s",
            (
                "confirmed" if confirmed else "unknown",
                total if confirmed else row["reserved_units"],
                json_value(counts),
                identity,
            ),
        )

        from ngertiin.usage.events import refresh

        await refresh(conn, row["owner_id"])


async def post(job, stage, model, url, key, body):
    if not key:
        raise EvaluationUnavailable("provider_not_configured")
    identity = await reserve(job, stage, model, body)
    payload = {}
    try:
        async with httpx.AsyncClient(timeout=60, follow_redirects=False) as client:
            response = await client.post(url, json=body, headers={"Authorization": f"Bearer {key}"})
            response.raise_for_status()
            payload = response.json()
            return payload
    finally:
        await settle(identity, payload.get("usage", {}) if isinstance(payload, dict) else {})


def model_state(job):
    state = {k: v for k, v in job["snapshot"].items() if k != "refs"}
    state["evaluated_at"] = job["created_at"].isoformat()
    state["capabilities"] = {
        "available": [
            "draft text or a table using supplied information",
            "offer to prepare a task for user review",
        ],
        "candidate_effect": "preview only; no execution, new permission or message delivery",
        "source_interpretation": "user messages are attributed reports, "
        "not independent verification",
    }
    return state


async def generate(job):
    settings = get_settings()
    schema = json.dumps(Proposals.model_json_schema())
    body = {
        "model": settings.proactive_generation_model,
        "messages": [
            {"role": "system", "content": policy.GENERATION + schema},
            {
                "role": "user",
                "content": json.dumps(model_state(job), default=str, ensure_ascii=False),
            },
        ],
        "max_completion_tokens": 4000,
        "reasoning_effort": "low",
        "store": False,
        "response_format": {"type": "json_object"},
    }
    payload = await post(
        job,
        "generate",
        settings.proactive_generation_model,
        settings.openai_base_url.rstrip("/") + "/chat/completions",
        settings.openai_api_key.get_secret_value(),
        body,
    )
    return Proposals.model_validate_json(payload["choices"][0]["message"]["content"])


async def judge(job, candidates):
    settings = get_settings()
    state = {**model_state(job), "candidates": [c.model_dump(mode="json") for c in candidates]}
    body = {
        "model": settings.typesafe_model,
        "state": state,
        "questions": policy.questions(candidates),
    }
    payload = await post(
        job,
        "judge",
        settings.typesafe_model,
        "https://api.typesafe.ai/v1/systemone",
        settings.typesafe_api_key.get_secret_value(),
        body,
    )
    return {
        "model": payload.get("model"),
        "questions": body["questions"],
        "answers": policy.read_judgments(payload, len(candidates)),
    }
