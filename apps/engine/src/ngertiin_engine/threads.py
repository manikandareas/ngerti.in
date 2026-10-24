"""Persistent DM/group identity consumers; transcript delivery remains native."""

import json
from datetime import UTC, datetime
from uuid import uuid4

from ngertiin_engine.contracts import EngineError, canonical, digest, uuid

DDL = (
    "CREATE TABLE nma_threads (owner_id TEXT NOT NULL, thread_id TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('dm','group')), title TEXT NOT NULL, dm_agent_id TEXT, status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','archived')), revision INTEGER NOT NULL DEFAULT 1, membership_revision INTEGER NOT NULL DEFAULT 1, context_generation INTEGER NOT NULL DEFAULT 1, cancel_generation INTEGER NOT NULL DEFAULT 1, next_message_seq INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(owner_id,thread_id), FOREIGN KEY(owner_id) REFERENCES nma_partition(owner_id), FOREIGN KEY(owner_id,dm_agent_id) REFERENCES nma_agents(owner_id,agent_id), CHECK((kind='dm' AND dm_agent_id IS NOT NULL) OR (kind='group' AND dm_agent_id IS NULL)))",
    "CREATE TABLE nma_memberships (owner_id TEXT NOT NULL, thread_id TEXT NOT NULL, agent_id TEXT NOT NULL, position INTEGER NOT NULL CHECK(position>=0), status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','removed')), joined_revision INTEGER NOT NULL DEFAULT 1, removed_revision INTEGER, access_generation INTEGER NOT NULL DEFAULT 1, PRIMARY KEY(owner_id,thread_id,agent_id), FOREIGN KEY(owner_id,thread_id) REFERENCES nma_threads(owner_id,thread_id), FOREIGN KEY(owner_id,agent_id) REFERENCES nma_agents(owner_id,agent_id))",
    "CREATE UNIQUE INDEX nma_active_member_position ON nma_memberships(owner_id,thread_id,position) WHERE status='active'",
)


class Threads:
    def __init__(self, store, agents):
        self.store, self.agents = store, agents

    def get(self, conn, thread_id):
        row = conn.execute(
            "SELECT thread_id,kind,title,dm_agent_id,status,revision,membership_revision,context_generation FROM nma_threads WHERE owner_id=? AND thread_id=?",
            (self.store.owner, uuid(thread_id)),
        ).fetchone()
        if not row:
            raise EngineError("NOT_FOUND")
        thread = dict(
            zip(
                (
                    "thread_id",
                    "kind",
                    "title",
                    "dm_agent_id",
                    "status",
                    "revision",
                    "membership_revision",
                    "context_generation",
                ),
                row,
            )
        )
        for field in ("revision", "membership_revision", "context_generation"):
            thread[field] = str(thread[field])
        members = conn.execute(
            "SELECT agent_id FROM nma_memberships WHERE owner_id=? AND thread_id=? AND status='active' ORDER BY position",
            (self.store.owner, thread_id),
        ).fetchall()
        # Resolve the authoritative identity on every read; never duplicate profiles per channel.
        thread["agents"] = [self.agents.get(conn, member[0]) for member in members]
        return thread

    def read(self, payload):
        if set(payload) != {"thread_id"}:
            raise EngineError("INVALID_REQUEST")
        return self.store.write(lambda conn: self.get(conn, payload["thread_id"]))

    def listing(self, payload):
        if set(payload) != {"after"}:
            raise EngineError("INVALID_REQUEST")
        after = uuid(payload["after"]) if payload["after"] else ""

        def read(conn):
            rows = conn.execute(
                "SELECT thread_id,kind,title,dm_agent_id FROM nma_threads WHERE owner_id=? AND thread_id>? ORDER BY thread_id LIMIT 51",
                (self.store.owner, after),
            ).fetchall()
            return {
                "items": [
                    dict(zip(("thread_id", "kind", "title", "dm_agent_id"), row))
                    for row in rows[:50]
                ],
                "next_cursor": rows[49][0] if len(rows) > 50 else None,
            }

        return self.store.write(read)

    def create(self, body):
        def operation(conn):
            owner, command_id = self.store.owner, body["command_id"]
            prior = conn.execute(
                "SELECT payload_digest,result FROM nma_commands WHERE owner_id=? AND command_id=?",
                (owner, command_id),
            ).fetchone()
            if prior:
                if prior[0] != digest(body):
                    raise EngineError("COMMAND_CONFLICT")
                return json.loads(prior[1])
            conn.execute("SAVEPOINT thread_create")
            try:
                p = body["payload"]
                ids = p.get("agent_ids")
                if (
                    body["expected_revision"] is not None
                    or set(p) != {"kind", "title", "agent_ids"}
                    or p["kind"] not in ("dm", "group")
                    or not isinstance(p["title"], str)
                    or not 1 <= len(p["title"].strip()) <= 120
                    or not isinstance(ids, list)
                    or not 1 <= len(ids) <= 6
                ):
                    raise EngineError("INVALID_REQUEST")
                ids = [uuid(value) for value in ids]
                if (
                    len(set(ids)) != len(ids)
                    or (p["kind"] == "dm" and len(ids) != 1)
                    or (p["kind"] == "group" and len(ids) < 2)
                ):
                    raise EngineError("INVALID_REQUEST")
                for agent_id in ids:
                    if self.agents.get(conn, agent_id)["status"] != "active":
                        raise EngineError("AGENT_UNAVAILABLE")
                thread_id, now = (
                    str(uuid4()),
                    datetime.now(UTC).isoformat().replace("+00:00", "Z"),
                )
                conn.execute(
                    "INSERT INTO nma_threads(owner_id,thread_id,kind,title,dm_agent_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?)",
                    (
                        owner,
                        thread_id,
                        p["kind"],
                        p["title"].strip(),
                        ids[0] if p["kind"] == "dm" else None,
                        now,
                        now,
                    ),
                )
                conn.executemany(
                    "INSERT INTO nma_memberships(owner_id,thread_id,agent_id,position) VALUES (?,?,?,?)",
                    [
                        (owner, thread_id, agent_id, position)
                        for position, agent_id in enumerate(ids)
                    ],
                )
                seq = conn.execute(
                    "SELECT COALESCE(MAX(sequence),0)+1 FROM nma_events WHERE owner_id=?",
                    (owner,),
                ).fetchone()[0]
                result = {
                    "schema_version": "nma.v1",
                    "command_id": command_id,
                    "status": "accepted",
                    "thread": self.get(conn, thread_id),
                    "committed_seq": str(seq),
                }
                event = {
                    "schema_version": "nma.v1",
                    "type": "thread.created",
                    "event_id": command_id,
                    "occurred_at": now,
                    "thread_id": thread_id,
                    "seq": str(seq),
                    "payload": result["thread"],
                }
                conn.execute(
                    "INSERT INTO nma_events VALUES (?,?,?,?)",
                    (owner, seq, command_id, canonical(event)),
                )
            except EngineError as exc:
                conn.execute("ROLLBACK TO thread_create")
                result = {"error": {"code": exc.code, "details": exc.details}}
            conn.execute("RELEASE thread_create")
            conn.execute(
                "INSERT INTO nma_commands VALUES (?,?,?,?,?)",
                (owner, command_id, digest(body), canonical(body), canonical(result)),
            )
            return result

        result = self.store.write(operation)
        if "error" in result:
            raise EngineError(result["error"]["code"], result["error"]["details"])
        return result

    def check_binding(self, conn, payload):
        # Private foundation probes may use server-provisioned unregistered bindings.
        # Public callers cannot submit runtime commands or provision those bindings.
        if not conn.execute(
            "SELECT 1 FROM nma_threads WHERE owner_id=? AND thread_id=?",
            (self.store.owner, payload["thread_id"]),
        ).fetchone():
            return
        thread = self.get(conn, payload["thread_id"])
        if thread["status"] != "open" or payload["agent_id"] not in {
            a["agent_id"] for a in thread["agents"]
        }:
            raise EngineError("NOT_FOUND")
        if thread["context_generation"] != payload["context_generation"]:
            raise EngineError("STALE_GENERATION")
