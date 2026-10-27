"""Scoped Hindsight adapter implementing Hermes's native MemoryProvider contract.

Canonical corrections stay in the domain journal. The external service receives
immutable authorized snapshots; a changed snapshot never queries an older bank.
"""

import json
import os
import time
from pathlib import Path
from urllib.parse import urlsplit

import httpx
from agent.memory_provider import MemoryProvider

from ngertiin_engine.contracts import EngineError, canonical, digest
from ngertiin_engine.learning_store import identity, namespace
from ngertiin_engine.provider_secrets import Vault
from ngertiin_engine.redaction import remember

SCHEMA = {
    "name": "hindsight_recall",
    "description": "Search this conversation's authorized persistent memories in the configured self-hosted Hindsight provider. Missing setup is reported explicitly.",
    "parameters": {
        "type": "object",
        "properties": {"query": {"type": "string"}},
        "required": ["query"],
        "additionalProperties": False,
    },
}


def configuration():
    path = os.environ.get("NMA_MEMORY_PROVIDER_FILE")
    if not path:
        return None
    try:
        value = json.loads(Path(path).read_text())
        parsed = urlsplit(value["base_url"])
        if (
            value.get("provider") != "hindsight"
            or parsed.scheme not in {"http", "https"}
            or not parsed.hostname
            or parsed.username
            or parsed.password
            or parsed.query
            or parsed.fragment
        ):
            raise ValueError
        value["base_url"] = value["base_url"].rstrip("/")
        key_file = value.get("api_key_file")
        if key_file:
            value["api_key"] = Path(key_file).read_text().strip()
        remember({"headers": [{"value": value.get("api_key", "")}]})
        return value
    except (OSError, ValueError, TypeError, KeyError):
        raise EngineError("MEMORY_PROVIDER_SETUP_REQUIRED") from None


class HindsightMemoryProvider(MemoryProvider):
    name = "hindsight"

    def __init__(self, learning, scope):
        self.learning, self.scope = learning, scope
        self.store = learning.store
        self.config = configuration()

    def initialize(self, **kwargs):
        return self.config is not None

    def is_available(self):
        return self.config is not None

    def get_tool_schemas(self):
        return [SCHEMA]

    def snapshot(self):
        def read(conn):
            thread = self.learning.context.scope(conn, **self.scope)
            memories = self.learning.memories.inventory(conn, self.scope)
            ns = namespace(self.scope, thread) + ":context:" + self.scope["thread_id"]
            content = [
                {
                    key: item[key]
                    for key in (
                        "memory_id",
                        "revision",
                        "content",
                        "source_message_ids",
                    )
                }
                for item in memories
            ]
            fingerprint = digest(content)
            return (
                ns,
                "nma-" + digest([self.store.owner, ns, fingerprint])[:48],
                content,
            )

        return self.store.write(read)

    def request(self, method, path, **kwargs):
        if self.config is None:
            raise EngineError(
                "MEMORY_PROVIDER_UNAVAILABLE",
                {"reason": "Configure the self-hosted memory provider first"},
            )
        headers = (
            {"Authorization": "Bearer " + self.config["api_key"]}
            if self.config.get("api_key")
            else {}
        )
        try:
            response = httpx.request(
                method,
                self.config["base_url"] + path,
                headers=headers,
                timeout=30,
                follow_redirects=False,
                trust_env=False,
                **kwargs,
            )
            if response.status_code == 404:
                return None
            response.raise_for_status()
            return response.json() if response.content else {}
        except (httpx.HTTPError, ValueError):
            raise EngineError(
                "MEMORY_PROVIDER_UNAVAILABLE",
                {"reason": "Check the Hindsight service and its model connection"},
            ) from None

    def sync(self):
        if self.config is None:
            raise EngineError("MEMORY_PROVIDER_UNAVAILABLE")
        ns, bank, memories = self.snapshot()
        vault = Vault(
            Path(self.store.authority.db.db_path).parent,
            self.store.owner,
            directory="memory-provider-locks",
        )
        base_namespace = ns.rsplit(":context:", 1)[0] + ":context:"
        with vault.locked(identity(self.store.owner, base_namespace)):
            state = self.store.write(
                lambda conn: conn.execute(
                    "SELECT status FROM nma_memory_provider_banks WHERE owner_id=? AND namespace=? AND bank_id=?",
                    (self.store.owner, ns, bank),
                ).fetchone()
            )
            if not state or state[0] != "ready":
                self.store.write(
                    lambda conn: conn.execute(
                        "INSERT INTO nma_memory_provider_banks VALUES (?,?,?,?,?) ON CONFLICT(owner_id,namespace,bank_id) DO NOTHING",
                        (self.store.owner, ns, bank, digest(memories), "pending"),
                    )
                )
                if memories:
                    operation_id = identity(self.store.owner, ns, bank, "retain")
                    self.request(
                        "POST",
                        f"/v1/default/banks/{bank}/memories",
                        json={
                            "async": True,
                            "operation_id": operation_id,
                            "items": [
                                {
                                    "content": item["content"],
                                    "document_id": item["memory_id"],
                                    "context": "Authorized Ngertiin curated memory",
                                    "tags": ["revision:" + item["revision"]],
                                }
                                for item in memories
                            ],
                        },
                    )
                    deadline = time.monotonic() + 20
                    while True:
                        operation = self.request(
                            "GET", f"/v1/default/banks/{bank}/operations/{operation_id}"
                        )
                        if operation and operation.get("status") == "completed":
                            break
                        if operation and operation.get("error_message"):
                            raise EngineError(
                                "MEMORY_PROVIDER_UNAVAILABLE",
                                {
                                    "reason": "The memory service reported an indexing error; inspect its operation receipt"
                                },
                            )
                        if (
                            not operation
                            or operation.get("status") in {"failed", "cancelled"}
                            or time.monotonic() >= deadline
                        ):
                            raise EngineError(
                                "MEMORY_PROVIDER_UNAVAILABLE",
                                {
                                    "reason": "Memory indexing did not complete; the stable operation ID is retained"
                                },
                            )
                        time.sleep(0.5)
                if self.snapshot() != (ns, bank, memories):
                    raise EngineError("ACCESS_REVOKED")
                self.store.write(
                    lambda conn: conn.execute(
                        "UPDATE nma_memory_provider_banks SET status='ready' WHERE owner_id=? AND namespace=? AND bank_id=?",
                        (self.store.owner, ns, bank),
                    )
                )
            old = self.store.write(
                lambda conn: conn.execute(
                    "SELECT namespace,bank_id FROM nma_memory_provider_banks WHERE owner_id=? AND substr(namespace,1,?)=? AND bank_id<>? AND status<>'deleted'",
                    (self.store.owner, len(base_namespace), base_namespace, bank),
                ).fetchall()
            )
            for previous_ns, previous in old:
                # A correction in one DM must retire stale replicas in the
                # agent's other DMs too, without evicting their current banks.
                other = HindsightMemoryProvider(
                    self.learning,
                    {**self.scope, "thread_id": previous_ns.rsplit(":context:", 1)[1]},
                )
                try:
                    if other.snapshot()[1] == previous:
                        continue
                except EngineError:
                    pass  # Revoked/closed contexts no longer have a live bank.
                self.request("DELETE", f"/v1/default/banks/{previous}")
                self.store.write(
                    lambda conn, previous=previous, previous_ns=previous_ns: (
                        conn.execute(
                            "UPDATE nma_memory_provider_banks SET status='deleted' WHERE owner_id=? AND namespace=? AND bank_id=?",
                            (self.store.owner, previous_ns, previous),
                        )
                    )
                )
        return ns, bank, memories

    def handle_tool_call(self, tool_name, args, **kwargs):
        if (
            tool_name != SCHEMA["name"]
            or set(args) != {"query"}
            or not isinstance(args["query"], str)
            or not 1 <= len(args["query"]) <= 4000
        ):
            raise EngineError("INVALID_REQUEST")
        ns, bank, memories = self.sync()
        result = (
            self.request(
                "POST",
                f"/v1/default/banks/{bank}/memories/recall",
                json={"query": args["query"], "budget": "low", "max_tokens": 1500},
            )
            if memories
            else {"results": []}
        )
        if self.snapshot() != (ns, bank, memories):
            raise EngineError("ACCESS_REVOKED")
        return canonical(
            {
                "provider": "hindsight",
                "bank_id": bank,
                "result": result,
                "sources": memories,
            }
        )

    def export(self):
        ns, bank, memories = self.sync()
        documents = []
        for item in memories:
            documents.append(
                self.request(
                    "GET", f"/v1/default/banks/{bank}/documents/{item['memory_id']}"
                )
            )
        if self.snapshot() != (ns, bank, memories):
            raise EngineError("ACCESS_REVOKED")
        return {
            "provider": "hindsight",
            "bank_id": bank,
            "documents": documents,
            "canonical_memories": memories,
        }
