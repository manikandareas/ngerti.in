"""Durable DM ingress and owner-scoped reads inside the gateway authority."""

import json
from uuid import NAMESPACE_URL, uuid5

from ngertiin_engine.contracts import EngineError, canonical, counter, digest, uuid

DDL = (
    "CREATE TABLE nma_dm_requests (owner_id TEXT NOT NULL, thread_id TEXT NOT NULL, request_key TEXT NOT NULL, payload_digest TEXT NOT NULL, command_id TEXT NOT NULL, runtime_command TEXT NOT NULL, PRIMARY KEY(owner_id,thread_id,request_key), FOREIGN KEY(owner_id,command_id) REFERENCES nma_commands(owner_id,command_id), FOREIGN KEY(owner_id,thread_id) REFERENCES nma_threads(owner_id,thread_id))",
)


def command(kind, payload, identity):
    return {
        "schema_version": "nma.v1",
        "command_id": identity,
        "type": kind,
        "expected_revision": None,
        "payload": payload,
    }


class DirectMessages:
    def __init__(self, adapter):
        self.adapter = adapter
        self.store = adapter.store

    def thread(self, conn, thread_id):
        thread = self.adapter.threads.get(conn, thread_id)
        if thread["kind"] != "dm":
            raise EngineError("NOT_FOUND")
        return thread

    def prepare(self, body):
        p = body["payload"]
        if (
            body["expected_revision"] is not None
            or set(p)
            != {
                "thread_id",
                "text",
                "attachment_ids",
                "request_key",
                "expected_membership_revision",
            }
            or not isinstance(p["text"], str)
            or not p["text"].strip()
            or not 1 <= len(p["text"]) <= 100000
            or p["attachment_ids"] != []
        ):
            raise EngineError("INVALID_REQUEST")
        uuid(p["thread_id"])
        uuid(p["request_key"])
        counter(p["expected_membership_revision"])
        prior = self.store.receipt(body)
        if prior:
            return prior, None, True

        def existing(conn):
            self.thread(conn, p["thread_id"])
            return conn.execute(
                "SELECT payload_digest,command_id,runtime_command FROM nma_dm_requests WHERE owner_id=? AND thread_id=? AND request_key=?",
                (self.store.owner, p["thread_id"], p["request_key"]),
            ).fetchone()

        saved = self.store.write(existing)
        if saved:
            if saved[0] != digest(p):
                raise EngineError("COMMAND_CONFLICT")
            self.store.admit(body)
            return None, json.loads(saved[2]), True

        thread = self.store.write(lambda conn: self.thread(conn, p["thread_id"]))
        if thread["membership_revision"] != p["expected_membership_revision"]:
            raise EngineError("REVISION_CONFLICT")
        agent = thread["agents"][0]
        payload = {
            "agent_id": thread["dm_agent_id"],
            "thread_id": p["thread_id"],
            "config_revision": agent["config_revision"],
            "context_generation": thread["context_generation"],
            "text": p["text"],
        }
        key, config = self.adapter.binding(payload)
        identity = str(
            uuid5(
                NAMESPACE_URL,
                canonical([self.store.owner, "dm", p["thread_id"], p["request_key"]]),
            )
        )
        native = command("runtime.submit", payload, identity)
        run_id = str(uuid5(NAMESPACE_URL, self.store.owner + ":" + identity))

        def prepare(conn):
            for item in (body, native):
                conn.execute(
                    "INSERT INTO nma_commands VALUES (?,?,?,?,NULL)",
                    (
                        self.store.owner,
                        item["command_id"],
                        digest(item),
                        canonical(item),
                    ),
                )
                conn.execute(
                    "INSERT INTO nma_runtime_outbox VALUES (?,?,?,'pending',NULL)",
                    (self.store.owner, item["command_id"], canonical(item)),
                )
            # User ingress suppresses even a terminal parent's not-yet-delivered continuation.
            conn.execute(
                "UPDATE nma_goal_units SET settled=1 WHERE owner_id=? AND settled=0 AND goal_id IN (SELECT goal_id FROM nma_goals WHERE owner_id=? AND thread_id=?)",
                (self.store.owner, self.store.owner, p["thread_id"]),
            )
            # Freeze the interrupted set with ingress, including work not yet delivered.
            rows = conn.execute(
                "SELECT r.run_id FROM nma_adapter_runs r JOIN nma_adapter_bindings b ON b.owner_id=r.owner_id AND b.binding_id=r.binding_id LEFT JOIN session_admissions a ON a.admission_id=r.native_admission_id WHERE r.owner_id=? AND json_extract(b.config,'$.thread_id')=? AND (a.status IS NULL OR a.status!='terminal')",
                (self.store.owner, p["thread_id"]),
            ).fetchall()
            for (old_run,) in rows:
                cancel = command(
                    "run.cancel",
                    {"run_id": old_run},
                    str(uuid5(NAMESPACE_URL, identity + ":interrupt:" + old_run)),
                )
                conn.execute(
                    "INSERT INTO nma_commands VALUES (?,?,?,?,NULL)",
                    (
                        self.store.owner,
                        cancel["command_id"],
                        digest(cancel),
                        canonical(cancel),
                    ),
                )
                conn.execute(
                    "INSERT INTO nma_runtime_outbox VALUES (?,?,?,'pending',NULL)",
                    (self.store.owner, cancel["command_id"], canonical(cancel)),
                )
                self.adapter.reliability.cancel_event(conn, old_run)
            conn.execute(
                "INSERT INTO nma_adapter_runs VALUES (?,?,?,?,NULL)",
                (self.store.owner, run_id, key, identity),
            )
            conn.execute(
                "INSERT INTO nma_dm_requests VALUES (?,?,?,?,?,?)",
                (
                    self.store.owner,
                    p["thread_id"],
                    p["request_key"],
                    digest(p),
                    body["command_id"],
                    canonical(native),
                ),
            )
            self.adapter.context.transcript.append(
                conn, run_id, config, "user", p["text"]
            )
            self.adapter.reliability.append(
                conn, run_id, config, "run.accepted", {"status": "queued"}
            )

        self.store.write(prepare)
        return None, native, False

    async def send(self, body):
        try:
            prior, native, duplicate = self.prepare(body)
        except EngineError as exc:
            if exc.code != "COMMAND_CONFLICT":
                self.store.admit(body)
                self.store.finish(body, {"error_code": exc.code})
            raise
        if prior:
            return {**prior, "duplicate": True}
        # Dispatch internally under the existing adapter lock, not a second executor.
        await self.adapter.recover_run_stops(locked=True)
        try:
            result = await self.adapter._dispatch(native)
        except EngineError as exc:
            if exc.code in {"ENGINE_UNAVAILABLE", "AUTHORITY_LOST"}:
                raise
            self.store.finish(native, {"error_code": exc.code})
            self.store.finish(body, {"error_code": exc.code})
            raise
        result = {
            k: v
            for k, v in result.items()
            if k not in {"command_id", "committed_seq", "status", "schema_version"}
        }
        result["message_id"] = str(
            uuid5(NAMESPACE_URL, self.store.owner + ":" + result["run_id"] + ":user")
        )
        receipt = self.store.finish(body, result)
        return {**receipt, "duplicate": True} if duplicate else receipt

    def snapshot(self, payload):
        if set(payload) not in ({"thread_id"}, {"thread_id", "before_message_seq"}):
            raise EngineError("INVALID_REQUEST")
        before = payload.get("before_message_seq")
        if before is not None:
            counter(before)
        self.adapter.reliability.reconcile()
        self.adapter.context.transcript.reconcile()

        def read(conn):
            thread = self.adapter.threads.get(conn, payload["thread_id"])
            ids = conn.execute(
                "SELECT message_id FROM nma_messages WHERE owner_id=? AND thread_id=? AND (? IS NULL OR message_seq<?) ORDER BY message_seq DESC LIMIT 101",
                (
                    self.store.owner,
                    thread["thread_id"],
                    before,
                    int(before) if before else None,
                ),
            ).fetchall()
            messages, runs, size = [], {}, 0
            for (message_id,) in ids[:100]:
                message = self.adapter.context.transcript.message(conn, message_id)
                run = (
                    None
                    if message["run_id"] is None or message["run_id"] in runs
                    else self.adapter.reliability.snapshot_row(conn, message["run_id"])
                )
                cost = len(canonical([message, run]).encode())
                if size + cost > 4 * 1024 * 1024:
                    if not messages:
                        raise EngineError("RESPONSE_TOO_LARGE")
                    break
                messages.append(message)
                if run:
                    runs[message["run_id"]] = run
                size += cost
            next_before = (
                messages[-1]["message_seq"]
                if messages and len(ids) > len(messages)
                else None
            )
            # Continuations have no synthetic user message. Include their live runs
            # so reload restores partial output and interruption controls as well.
            pending = conn.execute(
                "SELECT DISTINCT u.run_id FROM nma_goal_units u JOIN nma_goals g ON g.owner_id=u.owner_id AND g.goal_id=u.goal_id WHERE u.owner_id=? AND g.thread_id=? AND u.settled=0 AND NOT EXISTS (SELECT 1 FROM nma_run_terminals t WHERE t.owner_id=u.owner_id AND t.run_id=u.run_id)",
                (self.store.owner, thread["thread_id"]),
            ).fetchall()
            pending += conn.execute(
                "SELECT t.run_id FROM nma_discussion_turns t JOIN nma_discussions d USING(owner_id,discussion_id) WHERE t.owner_id=? AND d.thread_id=? AND d.rowid=(SELECT MAX(latest.rowid) FROM nma_discussions latest WHERE latest.owner_id=d.owner_id AND latest.thread_id=d.thread_id)",
                (self.store.owner, thread["thread_id"]),
            ).fetchall()
            for (run_id,) in pending:
                if run_id in runs:
                    continue
                run = self.adapter.reliability.snapshot_row(conn, run_id)
                size += len(canonical(run).encode())
                if size > 4 * 1024 * 1024:
                    raise EngineError("RESPONSE_TOO_LARGE")
                runs[run_id] = run
            discussion = conn.execute(
                "SELECT discussion_id,status,reason FROM nma_discussions WHERE owner_id=? AND thread_id=? ORDER BY rowid DESC LIMIT 1",
                (self.store.owner, thread["thread_id"]),
            ).fetchone()
            # The helper uses this same connection; state and watermark are atomic.
            from ngertiin_engine.artifacts import Artifacts

            epoch, seq = self.watermark(conn)
            return {
                "schema_version": "nma.v1",
                "discussion": dict(
                    zip(("discussion_id", "status", "reason"), discussion)
                )
                if discussion
                else None,
                "thread": thread,
                "artifacts": Artifacts(self.store).listing(conn, thread["thread_id"]),
                "messages": list(reversed(messages)),
                "runs": list(reversed(list(runs.values()))),
                "next_before_message_seq": next_before,
                "goals": self.adapter.goals.listing(
                    conn, thread["thread_id"], thread["dm_agent_id"]
                ),
                "replay_epoch": epoch,
                "through_sequence": str(seq),
            }

        return self.store.write(read)

    def watermark(self, conn):
        epoch = conn.execute(
            "SELECT incarnation FROM nma_stream WHERE owner_id=?", (self.store.owner,)
        ).fetchone()[0]
        seq = conn.execute(
            "SELECT COALESCE(MAX(sequence),0) FROM nma_events WHERE owner_id=?",
            (self.store.owner,),
        ).fetchone()[0]
        return epoch, seq

    def events(self, payload):
        if set(payload) != {"thread_id", "replay_epoch", "last_sequence"}:
            raise EngineError("INVALID_REQUEST")
        sequence = payload["last_sequence"]
        if sequence != "0":
            counter(sequence)
        self.adapter.reliability.reconcile()
        self.adapter.context.transcript.reconcile()

        def read(conn):
            self.adapter.threads.get(conn, payload["thread_id"])
            epoch, latest = self.watermark(conn)
            if payload["replay_epoch"] not in (None, epoch):
                raise EngineError("CURSOR_RESET")
            if int(sequence) > latest:
                raise EngineError("CURSOR_AHEAD")
            rows = conn.execute(
                "SELECT payload,sequence FROM nma_events WHERE owner_id=? AND sequence>? AND json_extract(payload,'$.thread_id')=? AND json_extract(payload,'$.type') IS NOT NULL AND json_extract(payload,'$.type')!='conversation.changed' ORDER BY sequence LIMIT 128",
                (self.store.owner, int(sequence), payload["thread_id"]),
            ).fetchall()
            events, size = [], 0
            for raw, seq in rows:
                size += len(raw.encode())
                if size > 4 * 1024 * 1024:
                    if not events:
                        raise EngineError("RESPONSE_TOO_LARGE")
                    break
                events.append(json.loads(raw))
            more = len(events) < len(rows) or len(rows) == 128
            return {
                "events": events,
                "replay_epoch": epoch,
                "last_sequence": str(rows[len(events) - 1][1] if more else latest),
                "has_more": more,
            }

        return self.store.write(read)
