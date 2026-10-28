"""Durable projections of native children, never an executor or a spawn queue."""

import json

from ngertiin_engine.contracts import EngineError, canonical
from ngertiin_engine.redaction import result as redact

DDL = (
    "CREATE TABLE nma_delegated_children (owner_id TEXT NOT NULL, child_session_id TEXT NOT NULL, root_run_id TEXT NOT NULL, parent_child_id TEXT, subagent_id TEXT NOT NULL, authority_epoch INTEGER NOT NULL, status TEXT NOT NULL, descriptor TEXT NOT NULL, result TEXT, PRIMARY KEY(owner_id,child_session_id), FOREIGN KEY(owner_id,root_run_id) REFERENCES nma_adapter_runs(owner_id,run_id))",
    "CREATE INDEX nma_delegated_parent ON nma_delegated_children(owner_id,root_run_id,status)",
    "CREATE TABLE nma_delegation_batches (owner_id TEXT NOT NULL, batch_id TEXT NOT NULL, parent_run_id TEXT NOT NULL, source_message_id TEXT NOT NULL, native_ids TEXT NOT NULL, state TEXT NOT NULL, resume_run_id TEXT, PRIMARY KEY(owner_id,batch_id), FOREIGN KEY(owner_id,parent_run_id) REFERENCES nma_adapter_runs(owner_id,run_id), FOREIGN KEY(owner_id,source_message_id) REFERENCES nma_messages(owner_id,message_id))",
)


class Children:
    def __init__(self, store):
        self.store = store

    def check(self, conn, stamp, parent):
        child_id = stamp.get("child_session_id")
        if not child_id:
            return False
        row = conn.execute(
            "SELECT root_run_id,status,authority_epoch FROM nma_delegated_children WHERE owner_id=? AND child_session_id=?",
            (self.store.owner, child_id),
        ).fetchone()
        if (
            not row
            or not parent
            or row[0] != parent[0]
            or row[1] != "running"
            or row[2] != self.store.authority.epoch
            or parent[2] not in {"started", "terminal"}
        ):
            raise EngineError("ACCESS_REVOKED")
        return True

    def register(self, stamp, child, descriptor):
        from ngertiin_engine.reliability import Reliability

        def write(conn):
            row = Reliability(self.store).check(conn, stamp)
            if not row:
                raise EngineError("ACCESS_REVOKED")
            conn.execute(
                "INSERT INTO nma_delegated_children VALUES (?,?,?,?,?,?,'running',?,NULL)",
                (
                    self.store.owner,
                    child.session_id,
                    row[0],
                    stamp.get("child_session_id"),
                    child._subagent_id,
                    self.store.authority.epoch,
                    canonical(redact(descriptor)),
                ),
            )
            self.changed(conn, row[0], json.loads(row[1]), child.session_id)

        self.store.write(write)

    def finish(self, stamp, child, value):
        from ngertiin_engine.reliability import Reliability

        def write(conn):
            reliability = Reliability(self.store)
            row = reliability.native(conn, stamp.get("admission_id"))
            if not row:
                return
            status = value.get("status", "unknown")
            if value.get("schema_valid") is False:
                status = "schema_invalid"
            if reliability.stopped(conn, row[0]):
                status = "cancelled"
            changed = conn.execute(
                "UPDATE nma_delegated_children SET status=?,result=? WHERE owner_id=? AND child_session_id=? AND status='running' AND authority_epoch=?",
                (
                    status,
                    None if status == "cancelled" else canonical(redact(value)),
                    self.store.owner,
                    child.session_id,
                    self.store.authority.epoch,
                ),
            ).rowcount
            if changed:
                self.changed(conn, row[0], json.loads(row[1]), child.session_id)

        self.store.write(write)

    def changed(self, conn, run, config, child_id):
        from ngertiin_engine.reliability import Reliability

        row = conn.execute(
            "SELECT child_session_id,root_run_id,parent_child_id,subagent_id,status,descriptor,result FROM nma_delegated_children WHERE owner_id=? AND child_session_id=?",
            (self.store.owner, child_id),
        ).fetchone()
        child = self.public(row)
        Reliability(self.store).append(
            conn, run, config, "delegation.changed", {"child": child}
        )

    def progress(self, conn, run, config, child_id, name, operation):
        conn.execute(
            "UPDATE nma_delegated_children SET descriptor=json_set(descriptor,'$.activity',?,'$.operation_id',?) WHERE owner_id=? AND child_session_id=? AND status='running'",
            (name, operation, self.store.owner, child_id),
        )
        self.changed(conn, run, config, child_id)

    def cancel_tree(self, subagent_id):
        def write(conn):
            rows = conn.execute(
                "WITH RECURSIVE tree(child_session_id) AS (SELECT child_session_id FROM nma_delegated_children WHERE owner_id=? AND subagent_id=? UNION SELECT c.child_session_id FROM nma_delegated_children c JOIN tree t ON c.parent_child_id=t.child_session_id WHERE c.owner_id=?) SELECT c.child_session_id,c.root_run_id,b.config FROM tree t JOIN nma_delegated_children c USING(child_session_id) JOIN nma_adapter_runs r ON r.owner_id=c.owner_id AND r.run_id=c.root_run_id JOIN nma_adapter_bindings b USING(owner_id,binding_id) WHERE c.owner_id=? AND c.status='running'",
                (self.store.owner, subagent_id, self.store.owner, self.store.owner),
            ).fetchall()
            for child, run, config in rows:
                conn.execute(
                    "UPDATE nma_delegated_children SET status='cancelled' WHERE owner_id=? AND child_session_id=?",
                    (self.store.owner, child),
                )
                self.changed(conn, run, json.loads(config), child)

        self.store.write(write)

    def cancel_run(self, conn, run):
        children = conn.execute(
            "UPDATE nma_delegated_children SET status='cancelled' WHERE owner_id=? AND root_run_id=? AND status='running' RETURNING child_session_id",
            (self.store.owner, run),
        ).fetchall()
        if not children:
            return
        config = json.loads(
            conn.execute(
                "SELECT b.config FROM nma_adapter_runs r JOIN nma_adapter_bindings b USING(owner_id,binding_id) WHERE r.owner_id=? AND r.run_id=?",
                (self.store.owner, run),
            ).fetchone()[0]
        )
        for (child,) in children:
            self.changed(conn, run, config, child)

    def receipt(self, stamp, name, value):
        if not stamp.get("child_session_id") or name not in {"workspace", "coding"}:
            return
        try:
            result = json.loads(value) if isinstance(value, str) else value
        except (ValueError, TypeError):
            return
        if not isinstance(result, dict) or result.get("error"):
            return
        references = {
            key: result[field]
            for key, field in (
                ("artifact_ids", "artifact_id"),
                ("worktree_ids", "worktree_id"),
            )
            if isinstance(result.get(field), str)
        }
        if not references:
            return

        def write(conn):
            from ngertiin_engine.reliability import Reliability

            row = Reliability(self.store).check(conn, stamp)
            child = stamp["child_session_id"]
            raw = conn.execute(
                "SELECT descriptor FROM nma_delegated_children WHERE owner_id=? AND child_session_id=?",
                (self.store.owner, child),
            ).fetchone()
            descriptor = json.loads(raw[0])
            for key, identity in references.items():
                descriptor[key] = list(
                    dict.fromkeys([*descriptor.get(key, []), identity])
                )
            conn.execute(
                "UPDATE nma_delegated_children SET descriptor=? WHERE owner_id=? AND child_session_id=?",
                (canonical(descriptor), self.store.owner, child),
            )
            self.changed(conn, row[0], json.loads(row[1]), child)

        self.store.write(write)

    def listing(self, conn, thread_id):
        rows = conn.execute(
            "SELECT c.child_session_id,c.root_run_id,c.parent_child_id,c.subagent_id,c.status,c.descriptor,c.result FROM nma_delegated_children c JOIN nma_adapter_runs r ON r.owner_id=c.owner_id AND r.run_id=c.root_run_id JOIN nma_adapter_bindings b USING(owner_id,binding_id) WHERE c.owner_id=? AND json_extract(b.config,'$.thread_id')=? ORDER BY c.rowid DESC LIMIT 100",
            (self.store.owner, thread_id),
        ).fetchall()
        return [self.public(row) for row in rows]

    def public(self, row):
        sid, run, parent, subagent, status, descriptor, result = row
        return {
            "child_session_id": sid,
            "parent_run_id": run,
            "parent_child_id": parent,
            "subagent_id": subagent,
            "status": status,
            "kind": "temporary_subagent",
            **json.loads(descriptor),
            "result": self.result_summary(result),
        }

    @staticmethod
    def result_summary(result):
        if not result:
            return None
        value = json.loads(result)
        return {
            key: value[key][:8000] if isinstance(value[key], str) else value[key]
            for key in (
                "summary",
                "error",
                "schema_valid",
                "api_calls",
                "duration_seconds",
            )
            if key in value
        }

    def recover(self, conn):
        # A dead native worker is never a request to spawn a replacement. Completed
        # child rows are retained even when its parent's completion event was lost.
        conn.execute(
            "UPDATE nma_delegated_children SET status='unknown' WHERE owner_id=? AND status='running' AND authority_epoch<>?",
            (self.store.owner, self.store.authority.epoch),
        )

    def sweep(self):
        from tools.delegate_tool_registry import interrupt_subagent

        from ngertiin_engine.reliability import Reliability

        def fence(conn):
            rows = conn.execute(
                "SELECT child_session_id,subagent_id,root_run_id,status FROM nma_delegated_children WHERE owner_id=? AND status IN ('running','cancelled')",
                (self.store.owner,),
            ).fetchall()
            stopped = []
            for sid, subagent, run, status in rows:
                if status == "cancelled" or Reliability(self.store).stopped(conn, run):
                    self.cancel_run(conn, run)
                    stopped.append(subagent)
            return stopped

        for subagent in self.store.write(fence):
            interrupt_subagent(subagent)
