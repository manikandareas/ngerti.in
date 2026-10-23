"""Owner-bound conversation memory and explicit selected-content grants.

Native terminal receipts remain the transcript authority. Their immutable public
text is reconciled here for scoped retrieval and stable source-message provenance.
No profile memory files or owner-wide retrieval are used.
"""

import json
from datetime import UTC, datetime
from uuid import NAMESPACE_URL, uuid5

from ngertiin_engine.contracts import EngineError, canonical, counter, digest, uuid
from ngertiin_engine.transcript import Transcript

DDL = (
    "CREATE TABLE nma_context_run_fences (owner_id TEXT NOT NULL, run_id TEXT NOT NULL, thread_id TEXT NOT NULL, PRIMARY KEY(owner_id,run_id), FOREIGN KEY(owner_id,run_id) REFERENCES nma_adapter_runs(owner_id,run_id), FOREIGN KEY(owner_id,thread_id) REFERENCES nma_threads(owner_id,thread_id))",
    "CREATE TABLE nma_context_receipts (owner_id TEXT NOT NULL, run_id TEXT NOT NULL, PRIMARY KEY(owner_id,run_id), FOREIGN KEY(owner_id,run_id) REFERENCES nma_adapter_runs(owner_id,run_id))",
    "CREATE TABLE nma_messages (owner_id TEXT NOT NULL, message_id TEXT NOT NULL, thread_id TEXT NOT NULL, message_seq INTEGER NOT NULL, author_kind TEXT NOT NULL CHECK(author_kind IN ('user','agent')), author_agent_id TEXT, run_id TEXT, parts TEXT NOT NULL, source_message_id TEXT, revision INTEGER NOT NULL DEFAULT 1, context_generation INTEGER NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(owner_id,message_id), UNIQUE(owner_id,thread_id,message_seq), UNIQUE(owner_id,run_id,author_kind), FOREIGN KEY(owner_id,thread_id) REFERENCES nma_threads(owner_id,thread_id), FOREIGN KEY(owner_id,author_agent_id) REFERENCES nma_agents(owner_id,agent_id), FOREIGN KEY(owner_id,run_id) REFERENCES nma_adapter_runs(owner_id,run_id), CHECK((author_kind='user' AND author_agent_id IS NULL) OR (author_kind='agent' AND author_agent_id IS NOT NULL)))",
    "CREATE TABLE nma_memory_entries (owner_id TEXT NOT NULL, memory_id TEXT NOT NULL, scope_kind TEXT NOT NULL CHECK(scope_kind IN ('agent_private','thread_shared')), agent_id TEXT, thread_id TEXT, content TEXT NOT NULL, source_message_ids TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','deleted')), generation INTEGER NOT NULL DEFAULT 1, revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(owner_id,memory_id), FOREIGN KEY(owner_id) REFERENCES nma_partition(owner_id), FOREIGN KEY(owner_id,agent_id) REFERENCES nma_agents(owner_id,agent_id), FOREIGN KEY(owner_id,thread_id) REFERENCES nma_threads(owner_id,thread_id), CHECK((scope_kind='agent_private' AND agent_id IS NOT NULL AND thread_id IS NULL) OR (scope_kind='thread_shared' AND agent_id IS NULL AND thread_id IS NOT NULL)))",
    "CREATE INDEX nma_memory_scope ON nma_memory_entries(owner_id,scope_kind,agent_id,thread_id,status,generation)",
    "CREATE TABLE nma_scope_grants (owner_id TEXT NOT NULL, grant_id TEXT NOT NULL, source_kind TEXT NOT NULL CHECK(source_kind IN ('memory','message')), source_id TEXT NOT NULL, target_thread_id TEXT NOT NULL, source_revision INTEGER NOT NULL, created_by_run_id TEXT, source_message_id TEXT NOT NULL, reason TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','revoked')), generation INTEGER NOT NULL DEFAULT 1, revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(owner_id,grant_id), FOREIGN KEY(owner_id,target_thread_id) REFERENCES nma_threads(owner_id,thread_id), FOREIGN KEY(owner_id,source_message_id) REFERENCES nma_messages(owner_id,message_id))",
    "CREATE INDEX nma_grant_scope ON nma_scope_grants(owner_id,target_thread_id,status,generation)",
)


def now():
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


class Context:
    def __init__(self, store, threads):
        self.store, self.threads = store, threads
        self.transcript = Transcript(store)

    def scope(self, conn, agent_id, thread_id):
        thread = self.threads.get(conn, uuid(thread_id))
        agent_id = uuid(agent_id)
        if thread["status"] != "open" or not any(
            a["agent_id"] == agent_id and a["status"] == "active"
            for a in thread["agents"]
        ):
            raise EngineError("NOT_FOUND")
        return thread

    def memory(self, conn, memory_id):
        row = conn.execute(
            "SELECT memory_id,scope_kind,agent_id,thread_id,content,source_message_ids,status,generation,revision FROM nma_memory_entries WHERE owner_id=? AND memory_id=?",
            (self.store.owner, uuid(memory_id)),
        ).fetchone()
        if not row:
            raise EngineError("NOT_FOUND")
        item = dict(
            zip(
                (
                    "memory_id",
                    "scope_kind",
                    "agent_id",
                    "thread_id",
                    "content",
                    "source_message_ids",
                    "status",
                    "generation",
                    "revision",
                ),
                row,
            )
        )
        item["source_message_ids"] = json.loads(item["source_message_ids"])
        for key in ("generation", "revision"):
            item[key] = str(item[key])
        return item

    def source(self, conn, kind, source_id):
        if kind == "message":
            return self.transcript.message(conn, source_id)
        if kind == "memory":
            item = self.memory(conn, source_id)
            if item["status"] == "active":
                return item
            raise EngineError("NOT_FOUND")
        raise EngineError("INVALID_REQUEST")

    def retrieve(self, conn, agent_id, thread_id):
        thread = self.scope(conn, agent_id, thread_id)
        rows = conn.execute(
            "SELECT memory_id FROM nma_memory_entries WHERE owner_id=? AND status='active' AND ((scope_kind='thread_shared' AND thread_id=?) OR (scope_kind='agent_private' AND agent_id=? AND ?='dm')) ORDER BY memory_id",
            (self.store.owner, thread_id, agent_id, thread["kind"]),
        ).fetchall()
        memories = [self.memory(conn, row[0]) for row in rows]
        grants = []
        for (
            grant_id,
            kind,
            source_id,
            revision,
            source_message_id,
            reason,
            generation,
        ) in conn.execute(
            "SELECT grant_id,source_kind,source_id,source_revision,source_message_id,reason,generation FROM nma_scope_grants WHERE owner_id=? AND target_thread_id=? AND status='active' ORDER BY grant_id",
            (self.store.owner, thread_id),
        ).fetchall():
            try:
                source = self.source(conn, kind, source_id)
            except EngineError as exc:
                if exc.code == "NOT_FOUND":
                    continue
                raise
            if source["revision"] == str(revision):
                # Expose only the selected source, never its private source-message contents.
                grants.append(
                    {
                        "grant_id": grant_id,
                        "source_kind": kind,
                        "source_id": source_id,
                        "source_revision": str(revision),
                        "source_message_id": source_message_id,
                        "reason": reason,
                        "generation": str(generation),
                        "content": source["content"],
                    }
                )
        messages = [
            self.transcript.message(conn, row[0])
            for row in conn.execute(
                "SELECT message_id FROM nma_messages WHERE owner_id=? AND thread_id=? ORDER BY message_seq",
                (self.store.owner, thread_id),
            ).fetchall()
        ]
        return {
            "thread_id": thread_id,
            "agent_id": agent_id,
            "context_generation": thread["context_generation"],
            "memory": memories,
            "grants": grants,
            "messages": messages,
        }

    def read(self, payload):
        if set(payload) != {"agent_id", "thread_id"}:
            raise EngineError("INVALID_REQUEST")
        self.transcript.reconcile()
        return self.store.write(lambda conn: self.retrieve(conn, **payload))

    def invalidate(self, conn, thread_ids):
        for thread_id in set(thread_ids):
            fence_context_runs(conn, self.store.owner, thread_id)
            conn.execute(
                "UPDATE nma_threads SET context_generation=context_generation+1,revision=revision+1,updated_at=? WHERE owner_id=? AND thread_id=?",
                (now(), self.store.owner, thread_id),
            )

    def mutate(self, body):
        """Only the authenticated owner service can create/revoke scope grants."""
        self.transcript.reconcile()

        def operation(conn):
            prior = conn.execute(
                "SELECT payload_digest,result FROM nma_commands WHERE owner_id=? AND command_id=?",
                (self.store.owner, body["command_id"]),
            ).fetchone()
            if prior:
                if prior[0] != digest(body):
                    raise EngineError("COMMAND_CONFLICT")
                return json.loads(prior[1])
            conn.execute("SAVEPOINT context_mutation")
            try:
                result = self.apply(conn, body)
                seq = conn.execute(
                    "SELECT COALESCE(MAX(sequence),0)+1 FROM nma_events WHERE owner_id=?",
                    (self.store.owner,),
                ).fetchone()[0]
                result = {
                    "schema_version": "nma.v1",
                    "command_id": body["command_id"],
                    "status": "accepted",
                    "committed_seq": str(seq),
                    **result,
                }
                # General events carry identity only, never memory or private source content.
                conn.execute(
                    "INSERT INTO nma_events VALUES (?,?,?,?)",
                    (
                        self.store.owner,
                        seq,
                        body["command_id"],
                        canonical(
                            {
                                "type": body["type"],
                                "command_id": body["command_id"],
                                "seq": str(seq),
                            }
                        ),
                    ),
                )
            except EngineError as exc:
                conn.execute("ROLLBACK TO context_mutation")
                result = {"error": {"code": exc.code, "details": exc.details}}
            conn.execute("RELEASE context_mutation")
            conn.execute(
                "INSERT INTO nma_commands VALUES (?,?,?,?,?)",
                (
                    self.store.owner,
                    body["command_id"],
                    digest(body),
                    canonical(body),
                    canonical(result),
                ),
            )
            return result

        result = self.store.write(operation)
        if "error" in result:
            raise EngineError(result["error"]["code"], result["error"]["details"])
        return result

    def apply(self, conn, body):
        p, kind = body["payload"], body["type"]
        identity = str(
            uuid5(NAMESPACE_URL, self.store.owner + ":" + body["command_id"])
        )
        timestamp = now()
        if kind == "memory.create":
            if (
                set(p)
                != {
                    "scope_kind",
                    "agent_id",
                    "thread_id",
                    "content",
                    "source_message_ids",
                }
                or body["expected_revision"] is not None
            ):
                raise EngineError("INVALID_REQUEST")
            if (
                not isinstance(p["content"], str)
                or not 1 <= len(p["content"].strip()) <= 16000
                or not isinstance(p["source_message_ids"], list)
                or not 1 <= len(p["source_message_ids"]) <= 32
            ):
                raise EngineError("INVALID_REQUEST")
            sources = [
                self.transcript.message(conn, value)
                for value in p["source_message_ids"]
            ]
            if p["scope_kind"] == "agent_private" and p["thread_id"] is None:
                for source in sources:
                    if (
                        self.scope(conn, p["agent_id"], source["thread_id"])["kind"]
                        != "dm"
                    ):
                        raise EngineError("SCOPE_MISMATCH")
            elif p["scope_kind"] == "thread_shared" and p["agent_id"] is None:
                self.threads.get(conn, uuid(p["thread_id"]))
                if any(s["thread_id"] != p["thread_id"] for s in sources):
                    raise EngineError("SCOPE_MISMATCH")
            else:
                raise EngineError("INVALID_REQUEST")
            conn.execute(
                "INSERT INTO nma_memory_entries(owner_id,memory_id,scope_kind,agent_id,thread_id,content,source_message_ids,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)",
                (
                    self.store.owner,
                    identity,
                    p["scope_kind"],
                    p["agent_id"],
                    p["thread_id"],
                    p["content"],
                    canonical(p["source_message_ids"]),
                    timestamp,
                    timestamp,
                ),
            )
            return {"memory_id": identity, "revision": "1"}
        if kind == "memory.delete":
            if set(p) != {"memory_id"}:
                raise EngineError("INVALID_REQUEST")
            item = self.memory(conn, p["memory_id"])
            if body["expected_revision"] != item["revision"]:
                raise EngineError("REVISION_CONFLICT")
            affected = (
                [item["thread_id"]]
                if item["thread_id"]
                else [
                    r[0]
                    for r in conn.execute(
                        "SELECT thread_id FROM nma_threads WHERE owner_id=? AND kind='dm' AND dm_agent_id=?",
                        (self.store.owner, item["agent_id"]),
                    ).fetchall()
                ]
            )
            affected += [
                r[0]
                for r in conn.execute(
                    "SELECT target_thread_id FROM nma_scope_grants WHERE owner_id=? AND source_kind='memory' AND source_id=? AND status='active'",
                    (self.store.owner, p["memory_id"]),
                ).fetchall()
            ]
            conn.execute(
                "UPDATE nma_memory_entries SET status='deleted',generation=generation+1,revision=revision+1,updated_at=? WHERE owner_id=? AND memory_id=?",
                (timestamp, self.store.owner, p["memory_id"]),
            )
            self.invalidate(conn, affected)
            return {
                "memory_id": p["memory_id"],
                "revision": str(int(item["revision"]) + 1),
            }
        if kind == "scope.grant":
            if (
                set(p)
                != {
                    "source_kind",
                    "source_id",
                    "source_revision",
                    "target_thread_id",
                    "source_message_id",
                    "reason",
                }
                or body["expected_revision"] is not None
            ):
                raise EngineError("INVALID_REQUEST")
            if (
                not isinstance(p["reason"], str)
                or not 1 <= len(p["reason"].strip()) <= 1000
            ):
                raise EngineError("INVALID_REQUEST")
            self.threads.get(conn, uuid(p["target_thread_id"]))
            source = self.source(conn, p["source_kind"], p["source_id"])
            instruction = self.transcript.message(conn, p["source_message_id"])
            if instruction["author_kind"] != "user":
                raise EngineError("SCOPE_MISMATCH")
            if counter(p["source_revision"]) != source["revision"]:
                raise EngineError("REVISION_CONFLICT")
            conn.execute(
                "INSERT INTO nma_scope_grants(owner_id,grant_id,source_kind,source_id,target_thread_id,source_revision,source_message_id,reason,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
                (
                    self.store.owner,
                    identity,
                    p["source_kind"],
                    p["source_id"],
                    p["target_thread_id"],
                    int(p["source_revision"]),
                    p["source_message_id"],
                    p["reason"],
                    timestamp,
                    timestamp,
                ),
            )
            return {"grant_id": identity, "revision": "1"}
        if kind == "scope.revoke":
            if set(p) != {"grant_id"}:
                raise EngineError("INVALID_REQUEST")
            row = conn.execute(
                "SELECT target_thread_id,revision FROM nma_scope_grants WHERE owner_id=? AND grant_id=?",
                (self.store.owner, uuid(p["grant_id"])),
            ).fetchone()
            if not row:
                raise EngineError("NOT_FOUND")
            if body["expected_revision"] != str(row[1]):
                raise EngineError("REVISION_CONFLICT")
            conn.execute(
                "UPDATE nma_scope_grants SET status='revoked',generation=generation+1,revision=revision+1,updated_at=? WHERE owner_id=? AND grant_id=?",
                (timestamp, self.store.owner, p["grant_id"]),
            )
            self.invalidate(conn, [row[0]])
            return {"grant_id": p["grant_id"], "revision": str(row[1] + 1)}
        raise EngineError("INVALID_REQUEST")


def authorize_context(policy, database, owner, native_session_id=None):
    """Validate current membership/generation, including pre-migration sessions."""
    import sqlite3

    marker = policy.config(secrets=False).get("nma_context")
    product_scope = marker is not None
    with sqlite3.connect(f"file:{database}?mode=ro", uri=True) as conn:
        if marker is None and native_session_id is not None:
            row = conn.execute(
                "SELECT config FROM nma_adapter_bindings WHERE owner_id=? AND native_session_id=?",
                (owner, native_session_id),
            ).fetchone()
            marker = json.loads(row[0]) if row else None
        if marker is None:
            return None
        row = conn.execute(
            "SELECT t.context_generation,t.status,m.status,a.status FROM nma_threads t LEFT JOIN nma_memberships m ON m.owner_id=t.owner_id AND m.thread_id=t.thread_id AND m.agent_id=? LEFT JOIN nma_agents a ON a.owner_id=m.owner_id AND a.agent_id=m.agent_id WHERE t.owner_id=? AND t.thread_id=?",
            (marker["agent_id"], owner, marker["thread_id"]),
        ).fetchone()
    if not row:
        if product_scope:
            raise EngineError("ACCESS_REVOKED")
        return None  # Server-provisioned foundation probes have no product thread.
    if str(row[0]) != marker["context_generation"] or tuple(row[1:]) != (
        "open",
        "active",
        "active",
    ):
        raise EngineError("ACCESS_REVOKED")
    return {key: marker[key] for key in ("agent_id", "thread_id", "context_generation")}


def fence_context_runs(conn, owner, thread_id):
    conn.execute(
        "INSERT OR IGNORE INTO nma_context_run_fences SELECT r.owner_id,r.run_id,? FROM nma_adapter_runs r JOIN nma_adapter_bindings b ON b.owner_id=r.owner_id AND b.binding_id=r.binding_id LEFT JOIN session_admissions n ON n.admission_id=r.native_admission_id WHERE r.owner_id=? AND json_extract(b.config,'$.thread_id')=? AND (n.status IS NULL OR n.status!='terminal')",
        (thread_id, owner, thread_id),
    )
