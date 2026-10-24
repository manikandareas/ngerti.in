"""Durable boundaries within the native gateway; never schedule or retry execution."""

import json
from contextvars import ContextVar
from datetime import UTC, datetime
from uuid import NAMESPACE_URL, uuid4, uuid5

from ngertiin_engine.contracts import EngineError, canonical, digest
from ngertiin_engine.redaction import result as redact

execution = ContextVar("nma_execution", default=None)
DDL = (
    "CREATE TABLE nma_run_terminals (owner_id TEXT NOT NULL, run_id TEXT NOT NULL, status TEXT NOT NULL, PRIMARY KEY(owner_id,run_id,status), FOREIGN KEY(owner_id,run_id) REFERENCES nma_adapter_runs(owner_id,run_id))",
    "CREATE TABLE nma_run_stops (owner_id TEXT NOT NULL, run_id TEXT NOT NULL, PRIMARY KEY(owner_id,run_id), FOREIGN KEY(owner_id,run_id) REFERENCES nma_adapter_runs(owner_id,run_id))",
    "CREATE TABLE nma_stream (owner_id TEXT PRIMARY KEY, incarnation TEXT NOT NULL, FOREIGN KEY(owner_id) REFERENCES nma_partition(owner_id))",
    "CREATE TABLE nma_run_events (owner_id TEXT NOT NULL, sequence INTEGER NOT NULL, run_id TEXT NOT NULL, PRIMARY KEY(owner_id,sequence), FOREIGN KEY(owner_id,sequence) REFERENCES nma_events(owner_id,sequence), FOREIGN KEY(owner_id,run_id) REFERENCES nma_adapter_runs(owner_id,run_id))",
    "CREATE INDEX nma_run_events_replay ON nma_run_events(owner_id,run_id,sequence)",
    "CREATE TABLE nma_effects (owner_id TEXT NOT NULL, run_id TEXT NOT NULL, operation_id TEXT NOT NULL, intent_digest TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('dispatching','confirmed')), receipt TEXT, PRIMARY KEY(owner_id,run_id,operation_id), FOREIGN KEY(owner_id,run_id) REFERENCES nma_adapter_runs(owner_id,run_id))",
)
EVENTS = {
    "message.delta": "message.delta",
    "message.complete": "message.completed",
    "tool.start": "tool.started",
    "tool.result": "tool.completed",
    "tool.complete": "tool.completed",
    "error": "run.error",
    "message.start": "run.started",
}


class Reliability:
    def __init__(self, store):
        self.store = store

    def stopped(self, conn, run_id):
        return (
            conn.execute(
                "SELECT 1 FROM nma_run_stops WHERE owner_id=? AND run_id=? UNION ALL SELECT 1 FROM nma_agent_run_fences WHERE owner_id=? AND run_id=? UNION ALL SELECT 1 FROM nma_context_run_fences WHERE owner_id=? AND run_id=?",
                (self.store.owner, run_id) * 3,
            ).fetchone()
            is not None
        )

    def native(self, conn, admission):
        return conn.execute(
            "SELECT r.run_id,b.config,a.status,a.owner_epoch,a.generation FROM session_admissions a JOIN nma_adapter_runs r ON a.request_id='nma:'||r.operation_id JOIN nma_adapter_bindings b ON b.owner_id=r.owner_id AND b.binding_id=r.binding_id WHERE r.owner_id=? AND a.admission_id=? AND a.principal_id=? AND a.target_session_id=b.native_session_id",
            (self.store.owner, admission, "nma:" + self.store.owner),
        ).fetchone()

    def check(self, conn, stamp):
        row = self.native(conn, stamp.get("admission_id"))
        if row is None:
            return None
        if self.stopped(conn, row[0]):
            raise EngineError("RUN_CANCELLED")
        if (
            row[2] != "started"
            or row[3] != self.store.authority.epoch
            or row[4] != stamp.get("execution_generation")
            or stamp.get("authority_epoch") != self.store.authority.epoch
        ):
            raise EngineError("STALE_GENERATION")
        return row

    def append(self, conn, run_id, config, kind, payload):
        seq = conn.execute(
            "SELECT COALESCE(MAX(sequence),0)+1 FROM nma_events WHERE owner_id=?",
            (self.store.owner,),
        ).fetchone()[0]
        event_id = str(uuid4())
        event = {
            "schema_version": "nma.v1",
            "event_id": event_id,
            "occurred_at": datetime.now(UTC).isoformat(),
            "sequence": str(seq),
            "run_id": run_id,
            "goal_id": payload.get("goal", {}).get("goal_id"),
            "agent_id": config["agent_id"],
            "thread_id": config["thread_id"],
            "config_revision": config["config_revision"],
            "type": kind,
            "payload": redact(payload),
        }
        conn.execute(
            "INSERT INTO nma_events VALUES (?,?,?,?)",
            (self.store.owner, seq, event_id, canonical(event)),
        )
        conn.execute(
            "INSERT INTO nma_run_events VALUES (?,?,?)", (self.store.owner, seq, run_id)
        )

    def reconcile(self):
        from gateway.session_results import admission_result

        def refusals(conn):
            rows = conn.execute(
                "SELECT r.run_id,b.config,c.result FROM nma_adapter_runs r JOIN nma_adapter_bindings b ON b.owner_id=r.owner_id AND b.binding_id=r.binding_id JOIN nma_commands c ON c.owner_id=r.owner_id AND c.command_id=r.operation_id WHERE r.owner_id=? AND r.native_admission_id IS NULL AND json_extract(c.result,'$.error_code') IS NOT NULL",
                (self.store.owner,),
            ).fetchall()
            for run_id, config, result in rows:
                if (
                    not self.stopped(conn, run_id)
                    and conn.execute(
                        "INSERT OR IGNORE INTO nma_run_terminals VALUES (?,?,'failed')",
                        (self.store.owner, run_id),
                    ).rowcount
                ):
                    self.append(
                        conn,
                        run_id,
                        json.loads(config),
                        "run.failed",
                        {
                            "status": "failed",
                            "error_code": json.loads(result)["error_code"],
                            "text": "",
                        },
                    )

        self.store.write(refusals)
        rows = self.store.write(
            lambda conn: conn.execute(
                "SELECT r.run_id,a.admission_id,b.config,a.status,a.outcome FROM nma_adapter_runs r JOIN nma_adapter_bindings b ON b.owner_id=r.owner_id AND b.binding_id=r.binding_id JOIN session_admissions a ON a.request_id='nma:'||r.operation_id AND a.target_session_id=b.native_session_id AND a.principal_id=? WHERE r.owner_id=? AND a.status IN ('terminal','unknown')",
                ("nma:" + self.store.owner, self.store.owner),
            ).fetchall()
        )
        for run_id, admission, config, native_status, outcome in rows:
            result = (
                admission_result(self.store.authority.db, admission)
                if native_status == "terminal"
                else None
            )

            def record(
                conn,
                run_id=run_id,
                admission=admission,
                config=config,
                native_status=native_status,
                outcome=outcome,
                result=result,
            ):
                conn.execute(
                    "UPDATE nma_adapter_runs SET native_admission_id=? WHERE owner_id=? AND run_id=?",
                    (admission, self.store.owner, run_id),
                )
                status = (
                    "indeterminate"
                    if native_status == "unknown"
                    else {
                        "completed": "succeeded",
                        "cancelled": "cancelled",
                        "interrupted": "cancelled",
                    }.get(outcome, "failed")
                )
                if conn.execute(
                    "SELECT 1 FROM nma_effects WHERE owner_id=? AND run_id=? AND status='dispatching'",
                    (self.store.owner, run_id),
                ).fetchone():
                    status = "indeterminate"
                if self.stopped(conn, run_id):
                    status = "cancelled"
                if conn.execute(
                    "INSERT OR IGNORE INTO nma_run_terminals VALUES (?,?,?)",
                    (self.store.owner, run_id, status),
                ).rowcount:
                    value = result.get("result", {}) if result else {}
                    if status == "succeeded":
                        self.append(
                            conn,
                            run_id,
                            json.loads(config),
                            "message.completed",
                            {"text": value.get("final_response", "")},
                        )
                    self.append(
                        conn,
                        run_id,
                        json.loads(config),
                        "run." + status,
                        {
                            "status": status,
                            "error_code": "RUNTIME_FAILED"
                            if status == "failed"
                            else (
                                "INDETERMINATE" if status == "indeterminate" else None
                            ),
                            "message_id": str(
                                uuid5(
                                    NAMESPACE_URL,
                                    self.store.owner + ":" + run_id + ":agent",
                                )
                            )
                            if status == "succeeded"
                            else None,
                            "text": value.get("final_response", "")
                            if status == "succeeded"
                            else "",
                        },
                    )

            self.store.write(record)

    def publish(self, stamp, kind, payload):
        if kind == "message.complete":
            self.reconcile()
            return
        if kind not in EVENTS:
            return

        def write(conn):
            row = self.check(conn, stamp)
            if row is None:
                return
            fields = {
                key: payload[key]
                for key in ("text", "tool_name", "tool_call_id", "is_error", "status")
                if key in payload
            }
            if kind == "message.delta" and not isinstance(fields.get("text"), str):
                return
            if kind == "error":
                fields = {"code": "RUNTIME_FAILED"}
            self.append(conn, row[0], json.loads(row[1]), EVENTS[kind], fields)

        self.store.write(write)

    def stop(self, body, run_id):
        # Admission intent and fence share one write. Delivery can be repeated safely.
        def write(conn):
            row = conn.execute(
                "SELECT payload_digest,result FROM nma_commands WHERE owner_id=? AND command_id=?",
                (self.store.owner, body["command_id"]),
            ).fetchone()
            if row:
                if row[0] != digest(body):
                    raise EngineError("COMMAND_CONFLICT")
                if row[1]:
                    return json.loads(row[1])
            else:
                conn.execute(
                    "INSERT INTO nma_commands VALUES (?,?,?,?,NULL)",
                    (
                        self.store.owner,
                        body["command_id"],
                        digest(body),
                        canonical(body),
                    ),
                )
                conn.execute(
                    "INSERT INTO nma_runtime_outbox VALUES (?,?,?,'pending',NULL)",
                    (self.store.owner, body["command_id"], canonical(body)),
                )
            native = conn.execute(
                "SELECT a.status FROM nma_adapter_runs r LEFT JOIN session_admissions a ON a.request_id='nma:'||r.operation_id AND a.principal_id=? WHERE r.owner_id=? AND r.run_id=?",
                ("nma:" + self.store.owner, self.store.owner, run_id),
            ).fetchone()
            if not native:
                raise EngineError("NOT_FOUND")
            discussion = conn.execute(
                "SELECT discussion_id FROM nma_discussion_turns WHERE owner_id=? AND run_id=?",
                (self.store.owner, run_id),
            ).fetchone()
            if discussion:
                conn.execute(
                    "UPDATE nma_discussions SET status='cancelled',reason='user_stopped' WHERE owner_id=? AND discussion_id=?",
                    (self.store.owner, discussion[0]),
                )
                for (peer,) in conn.execute(
                    "SELECT run_id FROM nma_discussion_turns WHERE owner_id=? AND discussion_id=? AND published=0",
                    (self.store.owner, discussion[0]),
                ).fetchall():
                    self.cancel_event(conn, peer)
            self.cancel_descendants(conn, run_id)
            if native[0] != "terminal":
                self.cancel_event(conn, run_id)

        return self.store.write(write)

    def cancel_descendants(self, conn, run_id):
        from ngertiin_engine.direct_messages import command

        rows = conn.execute(
            "WITH RECURSIVE descendants(run_id) AS (SELECT ? UNION SELECT u.run_id FROM nma_goal_units u JOIN descendants d ON u.parent_run_id=d.run_id WHERE u.owner_id=?) SELECT run_id FROM descendants",
            (run_id, self.store.owner),
        ).fetchall()
        for (child,) in rows:
            conn.execute(
                "UPDATE nma_goal_units SET settled=1 WHERE owner_id=? AND run_id=?",
                (self.store.owner, child),
            )
            if (
                child == run_id
                or conn.execute(
                    "SELECT 1 FROM nma_run_terminals WHERE owner_id=? AND run_id=?",
                    (self.store.owner, child),
                ).fetchone()
            ):
                continue
            body = command(
                "run.cancel",
                {"run_id": child},
                str(
                    uuid5(NAMESPACE_URL, self.store.owner + ":descendant-stop:" + child)
                ),
            )
            conn.execute(
                "INSERT OR IGNORE INTO nma_commands VALUES (?,?,?,?,NULL)",
                (self.store.owner, body["command_id"], digest(body), canonical(body)),
            )
            conn.execute(
                "INSERT OR IGNORE INTO nma_runtime_outbox VALUES (?,?,?,'pending',NULL)",
                (self.store.owner, body["command_id"], canonical(body)),
            )
            self.cancel_event(conn, child)

    def cancel_event(self, conn, run_id):
        conn.execute(
            "INSERT OR IGNORE INTO nma_run_stops VALUES (?,?)",
            (self.store.owner, run_id),
        )
        if conn.execute(
            "INSERT OR IGNORE INTO nma_run_terminals VALUES (?,?,'cancelled')",
            (self.store.owner, run_id),
        ).rowcount:
            config = json.loads(
                conn.execute(
                    "SELECT b.config FROM nma_adapter_runs r JOIN nma_adapter_bindings b ON b.owner_id=r.owner_id AND b.binding_id=r.binding_id WHERE r.owner_id=? AND r.run_id=?",
                    (self.store.owner, run_id),
                ).fetchone()[0]
            )
            self.append(
                conn,
                run_id,
                config,
                "run.cancelled",
                {"status": "cancelled", "text": "", "error_code": "RUN_CANCELLED"},
            )

    def snapshot(self, run_id):
        self.reconcile()

        return self.store.write(lambda conn: self.snapshot_row(conn, run_id))

    def snapshot_row(self, conn, run_id):
        from hermes_state_terminal import RESULT_PREFIX, load_result

        row = conn.execute(
            "SELECT b.config,a.admission_id,a.status,a.outcome FROM nma_adapter_runs r JOIN nma_adapter_bindings b ON b.owner_id=r.owner_id AND b.binding_id=r.binding_id LEFT JOIN session_admissions a ON a.admission_id=r.native_admission_id WHERE r.owner_id=? AND r.run_id=?",
            (self.store.owner, run_id),
        ).fetchone()
        if not row:
            raise EngineError("NOT_FOUND")
        config = json.loads(row[0])
        status = {
            "queued": "queued",
            "started": "running",
            "unknown": "indeterminate",
        }.get(
            row[2],
            {
                "completed": "succeeded",
                "cancelled": "cancelled",
                "interrupted": "cancelled",
            }.get(row[3], "recovering"),
        )
        refusal = conn.execute(
            "SELECT c.result FROM nma_adapter_runs r JOIN nma_commands c ON c.owner_id=r.owner_id AND c.command_id=r.operation_id WHERE r.owner_id=? AND r.run_id=?",
            (self.store.owner, run_id),
        ).fetchone()
        refusal_code = (
            json.loads(refusal[0]).get("error_code") if refusal and refusal[0] else None
        )
        if refusal_code:
            status = "failed"
        if row[2] == "terminal" and status == "recovering":
            status = "failed"
        value = conn.execute(
            "SELECT value FROM state_meta WHERE key=?",
            (RESULT_PREFIX + (row[1] or ""),),
        ).fetchone()
        value = load_result(value[0]).get("result", {}) if value else {}
        text = value.get("final_response", "") if status == "succeeded" else ""
        if status == "running":
            deltas = conn.execute(
                "SELECT e.payload FROM nma_events e JOIN nma_run_events r ON r.owner_id=e.owner_id AND r.sequence=e.sequence WHERE r.owner_id=? AND r.run_id=? ORDER BY r.sequence",
                (self.store.owner, run_id),
            ).fetchall()
            text = "".join(
                event.get("payload", {}).get("text", "")
                for (raw,) in deltas
                if (event := json.loads(raw))["type"] == "message.delta"
                and isinstance(event.get("payload", {}).get("text"), str)
            )
        if (
            status in {"succeeded", "failed"}
            and conn.execute(
                "SELECT 1 FROM nma_effects WHERE owner_id=? AND run_id=? AND status='dispatching'",
                (self.store.owner, run_id),
            ).fetchone()
        ):
            status, text = "indeterminate", ""
        if self.stopped(conn, run_id):
            status, text = "cancelled", ""
        seq = conn.execute(
            "SELECT COALESCE(MAX(sequence),0) FROM nma_events WHERE owner_id=?",
            (self.store.owner,),
        ).fetchone()[0]
        incarnation = conn.execute(
            "SELECT incarnation FROM nma_stream WHERE owner_id=?",
            (self.store.owner,),
        ).fetchone()[0]
        return {
            "schema_version": "nma.v1",
            "run_id": run_id,
            "status": status,
            "error_code": "RUNTIME_FAILED"
            if status == "failed"
            else ("INDETERMINATE" if status == "indeterminate" else None),
            "text": redact(text),
            "thread_id": config["thread_id"],
            "agent_id": config["agent_id"],
            "config_revision": config["config_revision"],
            "context_generation": config["context_generation"],
            "through_sequence": str(seq),
            "replay_epoch": incarnation,
        }

    def events(self, run_id, epoch, sequence):
        self.reconcile()

        def read(conn):
            incarnation = conn.execute(
                "SELECT incarnation FROM nma_stream WHERE owner_id=?",
                (self.store.owner,),
            ).fetchone()[0]
            latest = conn.execute(
                "SELECT COALESCE(MAX(sequence),0) FROM nma_events WHERE owner_id=?",
                (self.store.owner,),
            ).fetchone()[0]
            if epoch is not None and epoch != incarnation:
                return {
                    "events": [],
                    "last_sequence": str(latest),
                    "replay_epoch": incarnation,
                    "snapshot_required": True,
                }
            if sequence > latest:
                raise EngineError("CURSOR_AHEAD")
            rows = conn.execute(
                "SELECT e.payload,e.sequence FROM nma_run_events r JOIN nma_events e ON e.owner_id=r.owner_id AND e.sequence=r.sequence WHERE r.owner_id=? AND r.run_id=? AND r.sequence>? ORDER BY r.sequence LIMIT 256",
                (self.store.owner, run_id, sequence),
            ).fetchall()
            fenced = self.stopped(conn, run_id)
            return {
                "events": [] if fenced else [json.loads(r[0]) for r in rows],
                "last_sequence": str(rows[-1][1] if len(rows) == 256 else latest),
                "replay_epoch": incarnation,
                "snapshot_required": fenced,
            }

        return self.store.write(read)

    def tool(self, stamp, name, args, ids, invoke):
        from ngertiin_engine.goals import TOOL, Goals

        if name == TOOL:
            return Goals(self.store).tool(stamp, args, ids)
        operation_id = digest([ids.turn_id, ids.tool_call_id, name])
        intent = digest([name, args])

        def prepare(conn):
            row = self.check(conn, stamp)
            if row is None:
                raise EngineError("NOT_FOUND")
            previous = conn.execute(
                "SELECT intent_digest,status,receipt FROM nma_effects WHERE owner_id=? AND run_id=? AND operation_id=?",
                (self.store.owner, row[0], operation_id),
            ).fetchone()
            if previous:
                if previous[0] != intent:
                    raise EngineError("EFFECT_CONFLICT")
                if previous[1] != "confirmed":
                    raise EngineError("INDETERMINATE")
                return row[0], json.loads(previous[2])
            conn.execute(
                "INSERT INTO nma_effects VALUES (?,?,?,?,'dispatching',NULL)",
                (self.store.owner, row[0], operation_id, intent),
            )
            return row[0], None

        run_id, receipt = self.store.write(prepare)
        if receipt is not None:
            return receipt["value"]
        value = invoke()
        # A late receipt is evidence, not permission to publish or execute again.
        self.store.write(
            lambda conn: conn.execute(
                "UPDATE nma_effects SET status='confirmed',receipt=? WHERE owner_id=? AND run_id=? AND operation_id=?",
                (
                    canonical({"value": redact(value)}),
                    self.store.owner,
                    run_id,
                    operation_id,
                ),
            )
        )
        return value


def install(runner, owner):
    """Install before native startup can recover and schedule queued admissions."""
    import model_tools
    from gateway.session_authorities import active_authority
    from gateway.session_events import SessionEvents

    from ngertiin_engine.store import Store

    def reliability():
        return Reliability(Store(active_authority(runner), owner))

    original_publish = SessionEvents.publish

    def publish(
        stream, session_id, payload, *, event_type="message.complete", execution=None
    ):
        with stream.lock:
            stamp = stream.execution if execution is None else execution
            if stamp.get("admission_id"):
                try:
                    reliability().publish(stamp, event_type, payload)
                except EngineError as exc:
                    if exc.code in {"RUN_CANCELLED", "STALE_GENERATION"}:
                        return False
                    raise
            return original_publish(
                stream, session_id, payload, event_type=event_type, execution=execution
            )

    SessionEvents.publish = publish

    original_tool = model_tools._execute_tool

    def tool(name, args, original_args, ids, **kwargs):
        current = execution.get()
        invoke = lambda: original_tool(name, args, original_args, ids, **kwargs)
        if current is None:
            return invoke()
        return reliability().tool(current, name, args, ids, invoke)

    model_tools._execute_tool = tool
