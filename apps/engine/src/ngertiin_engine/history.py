"""Scoped history navigation and explicit, inactive transcript branches."""

import json
from uuid import NAMESPACE_URL, uuid5

from ngertiin_engine.context import now
from ngertiin_engine.contracts import EngineError, canonical, counter, digest, uuid
from ngertiin_engine.conversations import record_change


def identity(*parts):
    return str(uuid5(NAMESPACE_URL, canonical(parts)))


def append_history(conn, owner, thread_id, messages, key, agent_map=None):
    """Copy text as history, never native sessions, runs, goals or resource grants."""
    agent_map = agent_map or {}
    for item in messages:
        seq = conn.execute(
            "SELECT next_message_seq FROM nma_threads WHERE owner_id=? AND thread_id=?",
            (owner, thread_id),
        ).fetchone()[0]
        conn.execute(
            "INSERT INTO nma_messages(owner_id,message_id,thread_id,message_seq,author_kind,author_agent_id,parts,source_message_id,context_generation,created_at) VALUES (?,?,?,?,?,?,?,?,1,?)",
            (
                owner,
                identity(owner, key, item["message_id"]),
                thread_id,
                seq,
                item["author_kind"],
                agent_map.get(item["author_agent_id"], item["author_agent_id"]),
                canonical([{"type": "text", "text": item["text"]}]),
                item["message_id"],
                item["created_at"],
            ),
        )
        conn.execute(
            "UPDATE nma_threads SET next_message_seq=next_message_seq+1 WHERE owner_id=? AND thread_id=?",
            (owner, thread_id),
        )
    record_change(conn, owner, thread_id, activity=True)


class History:
    def __init__(self, adapter):
        self.adapter, self.store = adapter, adapter.store

    def search(self, p):
        if (
            set(p) != {"query", "thread_id", "after"}
            or not isinstance(p["query"], str)
            or not 1 <= len(p["query"].strip()) <= 200
        ):
            raise EngineError("INVALID_REQUEST")
        after = int(counter(p["after"])) if p["after"] else 0
        self.adapter.context.transcript.reconcile()

        def read(conn):
            if p["thread_id"]:
                self.adapter.threads.get(conn, uuid(p["thread_id"]))
            # instr treats %, _ and backslash literally; no query-language injection.
            rows = conn.execute(
                "SELECT m.rowid,m.message_id,m.thread_id,m.message_seq,t.title,m.parts FROM nma_messages m JOIN nma_threads t USING(owner_id,thread_id) WHERE m.owner_id=? AND m.rowid>? AND (? IS NULL OR m.thread_id=?) AND (instr(lower(json_extract(m.parts,'$[0].text')),lower(?))>0 OR instr(lower(t.title),lower(?))>0) ORDER BY m.rowid LIMIT 51",
                (
                    self.store.owner,
                    after,
                    p["thread_id"],
                    p["thread_id"],
                    p["query"].strip(),
                    p["query"].strip(),
                ),
            ).fetchall()
            return {
                "items": [
                    {
                        "message_id": r[1],
                        "thread_id": r[2],
                        "message_seq": str(r[3]),
                        "title": r[4],
                        "preview": json.loads(r[5])[0]["text"][:320],
                    }
                    for r in rows[:50]
                ],
                "next_cursor": str(rows[49][0]) if len(rows) > 50 else None,
            }

        return self.store.write(read)

    def usage(self, p):
        if set(p) != {"thread_id", "after"}:
            raise EngineError("INVALID_REQUEST")
        after = uuid(p["after"]) if p["after"] else ""

        def read(conn):
            self.adapter.threads.get(conn, p["thread_id"])
            return conn.execute(
                "SELECT r.run_id FROM nma_adapter_runs r JOIN nma_adapter_bindings b USING(owner_id,binding_id) WHERE r.owner_id=? AND json_extract(b.config,'$.thread_id')=? AND r.run_id>? ORDER BY r.run_id LIMIT 51",
                (self.store.owner, p["thread_id"], after),
            ).fetchall()

        rows = self.store.write(read)
        from ngertiin_engine.diagnostics import Diagnostics

        details = [Diagnostics(self.adapter).read({"run_id": r[0]}) for r in rows[:50]]
        return {
            "items": [
                {"run_id": item["run"]["run_id"], "usage": item["usage"]}
                for item in details
            ],
            "next_cursor": rows[49][0] if len(rows) > 50 else None,
        }

    def retry(self, body):
        p = body["payload"]
        if set(p) != {"run_id"} or body["expected_revision"] is not None:
            raise EngineError("INVALID_REQUEST")
        run_id = uuid(p["run_id"])
        request_id = identity(self.store.owner, "safe-retry", run_id)

        def prepare(conn):
            run = self.adapter.reliability.snapshot_row(conn, run_id)
            thread = self.adapter.threads.get(conn, run["thread_id"])
            prior = conn.execute(
                "SELECT body FROM nma_commands WHERE owner_id=? AND command_id=?",
                (self.store.owner, request_id),
            ).fetchone()
            if prior:
                return json.loads(prior[0])
            if thread["kind"] != "dm" or run["status"] != "failed":
                raise EngineError("RETRY_UNSAFE")
            # Even completed external effects must not be repeated implicitly.
            if (
                conn.execute(
                    "SELECT 1 FROM nma_run_events r JOIN nma_events e USING(owner_id,sequence) WHERE r.owner_id=? AND r.run_id=? AND json_extract(e.payload,'$.type') IN ('tool.started','tool.completed') LIMIT 1",
                    (self.store.owner, run_id),
                ).fetchone()
                or conn.execute(
                    "SELECT 1 FROM nma_artifacts WHERE owner_id=? AND producing_run_id=? UNION ALL SELECT 1 FROM nma_files WHERE owner_id=? AND producing_run_id=? LIMIT 1",
                    (self.store.owner, run_id) * 2,
                ).fetchone()
            ):
                raise EngineError("RETRY_UNSAFE")
            if (
                conn.execute(
                    "SELECT 1 FROM nma_effects WHERE owner_id=? AND run_id=? LIMIT 1",
                    (self.store.owner, run_id),
                ).fetchone()
                or conn.execute(
                    "SELECT 1 FROM nma_delegated_children WHERE owner_id=? AND root_run_id=? LIMIT 1",
                    (self.store.owner, run_id),
                ).fetchone()
            ):
                raise EngineError("RETRY_UNSAFE")
            message = conn.execute(
                "SELECT message_id,parts FROM nma_messages WHERE owner_id=? AND run_id=? AND author_kind='user'",
                (self.store.owner, run_id),
            ).fetchone()
            if not message:
                raise EngineError("RETRY_UNSAFE")
            attachments = [
                r[0]
                for r in conn.execute(
                    "SELECT artifact_id FROM nma_message_files WHERE owner_id=? AND message_id=?",
                    (self.store.owner, message[0]),
                )
            ]
            return {
                "schema_version": "nma.v1",
                "command_id": request_id,
                "type": "message.send",
                "expected_revision": None,
                "payload": {
                    "thread_id": thread["thread_id"],
                    "text": json.loads(message[1])[0]["text"],
                    "attachment_ids": attachments,
                    "request_key": request_id,
                    "expected_membership_revision": thread["membership_revision"],
                },
            }

        return self.store.write(prepare)

    def mutate(self, body):
        def write(conn):
            old = conn.execute(
                "SELECT payload_digest,result FROM nma_commands WHERE owner_id=? AND command_id=?",
                (self.store.owner, body["command_id"]),
            ).fetchone()
            if old:
                if old[0] != digest(body):
                    raise EngineError("COMMAND_CONFLICT")
                return json.loads(old[1])
            p = body["payload"]
            if set(p) != (
                {"thread_id", "title"}
                if body["type"] == "history.rename"
                else {"thread_id", "title", "through_sequence"}
            ):
                raise EngineError("INVALID_REQUEST")
            thread = self.adapter.threads.get(conn, p["thread_id"])
            if body["expected_revision"] != thread["revision"]:
                raise EngineError("REVISION_CONFLICT")
            if (
                not isinstance(p["title"], str)
                or not 1 <= len(p["title"].strip()) <= 120
            ):
                raise EngineError("INVALID_REQUEST")
            thread_id = thread["thread_id"]
            inherited = None
            if body["type"] == "history.rename":
                conn.execute(
                    "UPDATE nma_threads SET title=?,revision=revision+1,updated_at=? WHERE owner_id=? AND thread_id=?",
                    (p["title"].strip(), now(), self.store.owner, thread_id),
                )
                record_change(conn, self.store.owner, thread_id)
            else:
                through = int(counter(p["through_sequence"]))
                rows = conn.execute(
                    "SELECT message_id,author_kind,author_agent_id,parts,created_at FROM nma_messages WHERE owner_id=? AND thread_id=? AND message_seq<=? ORDER BY message_seq",
                    (self.store.owner, thread_id, through),
                ).fetchall()
                if (
                    not rows
                    or not conn.execute(
                        "SELECT 1 FROM nma_messages WHERE owner_id=? AND thread_id=? AND message_seq=?",
                        (self.store.owner, thread_id, through),
                    ).fetchone()
                ):
                    raise EngineError("NOT_FOUND")
                if len(rows) > 1000:
                    raise EngineError("RESPONSE_TOO_LARGE")
                thread_id = identity(self.store.owner, "branch", body["command_id"])
                conn.execute(
                    "INSERT INTO nma_threads(owner_id,thread_id,kind,title,dm_agent_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?)",
                    (
                        self.store.owner,
                        thread_id,
                        thread["kind"],
                        p["title"].strip(),
                        thread["dm_agent_id"],
                        now(),
                        now(),
                    ),
                )
                for position, a in enumerate(thread["agents"]):
                    conn.execute(
                        "INSERT INTO nma_memberships(owner_id,thread_id,agent_id,position) VALUES (?,?,?,?)",
                        (self.store.owner, thread_id, a["agent_id"], position),
                    )
                append_history(
                    conn,
                    self.store.owner,
                    thread_id,
                    [
                        dict(
                            zip(
                                (
                                    "message_id",
                                    "author_kind",
                                    "author_agent_id",
                                    "text",
                                    "created_at",
                                ),
                                (r[0], r[1], r[2], json.loads(r[3])[0]["text"], r[4]),
                            )
                        )
                        for r in rows
                    ],
                    body["command_id"],
                )
                inherited = {
                    "source_thread_id": thread["thread_id"],
                    "through_sequence": str(through),
                    "text_messages": len(rows),
                    "agent_identities": "same",
                    "resources": [],
                    "goals": [],
                    "memory": "existing agent-private memory in DMs only",
                    "native_session": "new on next message",
                }
            result = {
                "thread": self.adapter.threads.get(conn, thread_id),
                "inheritance": inherited,
            }
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

        return self.store.write(write)
