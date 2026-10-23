"""Additive foundation tables in the gateway-owned root database.

All writes use Hermes's transaction writer and epoch fence. Native operations are
separate transactions; pending outbox rows retain their identities on failure.
"""

import hashlib
import json

from ngertiin_engine.contracts import EngineError, canonical, digest

DDL = (
    "CREATE TABLE nma_partition (owner_id TEXT PRIMARY KEY, authority_epoch INTEGER NOT NULL, schema_version INTEGER NOT NULL, singleton INTEGER NOT NULL DEFAULT 1 UNIQUE CHECK(singleton=1))",
    "CREATE TABLE nma_schema_migrations (owner_id TEXT NOT NULL, version INTEGER NOT NULL, checksum TEXT NOT NULL, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(owner_id,version), FOREIGN KEY(owner_id) REFERENCES nma_partition(owner_id))",
    "CREATE TABLE nma_commands (owner_id TEXT NOT NULL, command_id TEXT NOT NULL, payload_digest TEXT NOT NULL, body TEXT NOT NULL, result TEXT, PRIMARY KEY(owner_id,command_id), FOREIGN KEY(owner_id) REFERENCES nma_partition(owner_id))",
    "CREATE TABLE nma_runtime_outbox (owner_id TEXT NOT NULL, operation_id TEXT NOT NULL, payload TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('pending','applied')), result TEXT, PRIMARY KEY(owner_id,operation_id), FOREIGN KEY(owner_id,operation_id) REFERENCES nma_commands(owner_id,command_id))",
    "CREATE TABLE nma_events (owner_id TEXT NOT NULL, sequence INTEGER NOT NULL, event_id TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(owner_id,sequence), UNIQUE(owner_id,event_id), FOREIGN KEY(owner_id) REFERENCES nma_partition(owner_id))",
    "CREATE TABLE nma_adapter_bindings (owner_id TEXT NOT NULL, binding_id TEXT NOT NULL, config_digest TEXT NOT NULL, config TEXT NOT NULL, native_session_id TEXT, PRIMARY KEY(owner_id,binding_id), FOREIGN KEY(owner_id) REFERENCES nma_partition(owner_id))",
    "CREATE TABLE nma_adapter_runs (owner_id TEXT NOT NULL, run_id TEXT NOT NULL, binding_id TEXT NOT NULL, operation_id TEXT NOT NULL, native_admission_id TEXT, PRIMARY KEY(owner_id,run_id), UNIQUE(owner_id,operation_id), FOREIGN KEY(owner_id,binding_id) REFERENCES nma_adapter_bindings(owner_id,binding_id), FOREIGN KEY(owner_id,operation_id) REFERENCES nma_commands(owner_id,command_id))",
)
CHECKSUM = hashlib.sha256("\n".join(DDL).encode()).hexdigest()


class Store:
    def __init__(self, authority, owner: str):
        self.authority, self.owner = authority, owner
        self.write(self._bootstrap, bootstrap=True)

    def write(self, operation, *, bootstrap=False):
        def fenced(conn):
            from hermes_state_runtime import _epoch

            _epoch(conn, self.authority.epoch)
            if not conn.execute("PRAGMA foreign_keys").fetchone()[0]:
                raise EngineError("FOREIGN_KEYS_REQUIRED")
            if not bootstrap:
                row = conn.execute(
                    "SELECT owner_id,authority_epoch FROM nma_partition"
                ).fetchone()
                if tuple(row) != (self.owner, self.authority.epoch):
                    raise EngineError("AUTHORITY_LOST")
            return operation(conn)

        return self.authority.db._execute_write(fenced)

    def _bootstrap(self, conn):
        exists = conn.execute(
            "SELECT 1 FROM sqlite_master WHERE name='nma_partition'"
        ).fetchone()
        if not exists:
            for statement in DDL:
                conn.execute(statement)
            conn.execute(
                "INSERT INTO nma_partition(owner_id,authority_epoch,schema_version) VALUES (?,?,1)",
                (self.owner, self.authority.epoch),
            )
            conn.execute(
                "INSERT INTO nma_schema_migrations(owner_id,version,checksum) VALUES (?,1,?)",
                (self.owner, CHECKSUM),
            )
        else:
            rows = conn.execute(
                "SELECT owner_id,authority_epoch,schema_version FROM nma_partition"
            ).fetchall()
            if len(rows) != 1 or rows[0][0] != self.owner:
                raise EngineError("PARTITION_MISMATCH")
            saved = conn.execute(
                "SELECT checksum FROM nma_schema_migrations WHERE owner_id=? AND version=1",
                (self.owner,),
            ).fetchone()
            if rows[0][2] != 1 or not saved or saved[0] != CHECKSUM:
                raise EngineError("UNSUPPORTED_SCHEMA")
            if rows[0][1] > self.authority.epoch:
                raise EngineError("AUTHORITY_LOST")
            conn.execute(
                "UPDATE nma_partition SET authority_epoch=? WHERE owner_id=?",
                (self.authority.epoch, self.owner),
            )

    def admit(self, body):
        def operation(conn):
            row = conn.execute(
                "SELECT payload_digest,result FROM nma_commands WHERE owner_id=? AND command_id=?",
                (self.owner, body["command_id"]),
            ).fetchone()
            if row:
                if row[0] != digest(body):
                    raise EngineError("COMMAND_CONFLICT")
                return json.loads(row[1]) if row[1] else None
            conn.execute(
                "INSERT INTO nma_commands VALUES (?,?,?,?,NULL)",
                (self.owner, body["command_id"], digest(body), canonical(body)),
            )
            conn.execute(
                "INSERT INTO nma_runtime_outbox VALUES (?,?,?,'pending',NULL)",
                (self.owner, body["command_id"], canonical(body)),
            )

        return self.write(operation)

    def finish(self, body, result):
        def operation(conn):
            event_id = body["command_id"]
            existing = conn.execute(
                "SELECT result FROM nma_commands WHERE owner_id=? AND command_id=?",
                (self.owner, event_id),
            ).fetchone()
            if existing[0]:
                return json.loads(existing[0])
            sequence = conn.execute(
                "SELECT COALESCE(MAX(sequence),0)+1 FROM nma_events WHERE owner_id=?",
                (self.owner,),
            ).fetchone()[0]
            receipt = {
                "schema_version": "nma.v1",
                "command_id": event_id,
                "status": "accepted",
                "committed_seq": str(sequence),
                **result,
            }
            encoded = canonical(receipt)
            conn.execute(
                "INSERT INTO nma_events VALUES (?,?,?,?)",
                (self.owner, sequence, event_id, encoded),
            )
            conn.execute(
                "UPDATE nma_commands SET result=? WHERE owner_id=? AND command_id=?",
                (encoded, self.owner, event_id),
            )
            conn.execute(
                "UPDATE nma_runtime_outbox SET state='applied',result=? WHERE owner_id=? AND operation_id=?",
                (encoded, self.owner, event_id),
            )
            return receipt

        return self.write(operation)
