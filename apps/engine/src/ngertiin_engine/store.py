"""Additive foundation tables in the gateway-owned root database.

All writes use Hermes's transaction writer and epoch fence. Native operations are
separate transactions; pending outbox rows retain their identities on failure.
"""

import hashlib
import json

from ngertiin_engine.agents import DDL as AGENT_DDL
from ngertiin_engine.artifacts import DDL as ARTIFACT_DDL
from ngertiin_engine.computer import DDL as COMPUTER_DDL
from ngertiin_engine.connections import DDL as CONNECTION_DDL
from ngertiin_engine.context import DDL as CONTEXT_DDL
from ngertiin_engine.context import fence_context_runs
from ngertiin_engine.contracts import EngineError, canonical, digest, next_sequence
from ngertiin_engine.conversations import DDL as CONVERSATION_DDL
from ngertiin_engine.conversations import backfill
from ngertiin_engine.direct_messages import DDL as DM_DDL
from ngertiin_engine.discussions import DDL as DISCUSSION_DDL
from ngertiin_engine.goal_lifecycle import DDL as LIFECYCLE_DDL
from ngertiin_engine.goals import DDL as GOAL_DDL
from ngertiin_engine.outcomes import DDL as OUTCOME_DDL
from ngertiin_engine.reliability import DDL as RELIABILITY_DDL
from ngertiin_engine.threads import DDL as THREAD_DDL
from ngertiin_engine.wakes import DDL as WAKE_DDL
from ngertiin_engine.webhooks import DDL as WEBHOOK_DDL

DDL = (
    "CREATE TABLE nma_partition (owner_id TEXT PRIMARY KEY, authority_epoch INTEGER NOT NULL, schema_version INTEGER NOT NULL, singleton INTEGER NOT NULL DEFAULT 1 UNIQUE CHECK(singleton=1))",
    "CREATE TABLE nma_schema_migrations (owner_id TEXT NOT NULL, version INTEGER NOT NULL, checksum TEXT NOT NULL, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(owner_id,version), FOREIGN KEY(owner_id) REFERENCES nma_partition(owner_id))",
    "CREATE TABLE nma_commands (owner_id TEXT NOT NULL, command_id TEXT NOT NULL, payload_digest TEXT NOT NULL, body TEXT NOT NULL, result TEXT, PRIMARY KEY(owner_id,command_id), FOREIGN KEY(owner_id) REFERENCES nma_partition(owner_id))",
    "CREATE TABLE nma_runtime_outbox (owner_id TEXT NOT NULL, operation_id TEXT NOT NULL, payload TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('pending','applied')), result TEXT, PRIMARY KEY(owner_id,operation_id), FOREIGN KEY(owner_id,operation_id) REFERENCES nma_commands(owner_id,command_id))",
    "CREATE TABLE nma_events (owner_id TEXT NOT NULL, sequence INTEGER NOT NULL, event_id TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(owner_id,sequence), UNIQUE(owner_id,event_id), FOREIGN KEY(owner_id) REFERENCES nma_partition(owner_id))",
    "CREATE TABLE nma_adapter_bindings (owner_id TEXT NOT NULL, binding_id TEXT NOT NULL, config_digest TEXT NOT NULL, config TEXT NOT NULL, native_session_id TEXT, PRIMARY KEY(owner_id,binding_id), FOREIGN KEY(owner_id) REFERENCES nma_partition(owner_id))",
    "CREATE TABLE nma_adapter_runs (owner_id TEXT NOT NULL, run_id TEXT NOT NULL, binding_id TEXT NOT NULL, operation_id TEXT NOT NULL, native_admission_id TEXT, PRIMARY KEY(owner_id,run_id), UNIQUE(owner_id,operation_id), FOREIGN KEY(owner_id,binding_id) REFERENCES nma_adapter_bindings(owner_id,binding_id), FOREIGN KEY(owner_id,operation_id) REFERENCES nma_commands(owner_id,command_id))",
)
OUTCOME_CHECKSUM = hashlib.sha256("\n".join(OUTCOME_DDL).encode()).hexdigest()
CONNECTION_CHECKSUM = hashlib.sha256("\n".join(CONNECTION_DDL).encode()).hexdigest()
CONVERSATION_CHECKSUM = hashlib.sha256("\n".join(CONVERSATION_DDL).encode()).hexdigest()
DISCUSSION_CHECKSUM = hashlib.sha256("\n".join(DISCUSSION_DDL).encode()).hexdigest()
INTEGRATION_DDL = (*ARTIFACT_DDL, *COMPUTER_DDL)
ARTIFACT_CHECKSUM = hashlib.sha256("\n".join(INTEGRATION_DDL).encode()).hexdigest()
WEBHOOK_CHECKSUM = hashlib.sha256("\n".join(WEBHOOK_DDL).encode()).hexdigest()
WAKE_CHECKSUM = hashlib.sha256("\n".join(WAKE_DDL).encode()).hexdigest()
LIFECYCLE_CHECKSUM = hashlib.sha256("\n".join(LIFECYCLE_DDL).encode()).hexdigest()
GOAL_CHECKSUM = hashlib.sha256("\n".join(GOAL_DDL).encode()).hexdigest()
DM_CHECKSUM = hashlib.sha256("\n".join(DM_DDL).encode()).hexdigest()
RELIABILITY_CHECKSUM = hashlib.sha256("\n".join(RELIABILITY_DDL).encode()).hexdigest()
AGENT_CHECKSUM = hashlib.sha256("\n".join(AGENT_DDL).encode()).hexdigest()
CHECKSUM = hashlib.sha256("\n".join(DDL).encode()).hexdigest()
CONTEXT_CHECKSUM = hashlib.sha256("\n".join(CONTEXT_DDL).encode()).hexdigest()
THREAD_CHECKSUM = hashlib.sha256("\n".join(THREAD_DDL).encode()).hexdigest()


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
            if rows[0][2] not in range(1, 16) or not saved or saved[0] != CHECKSUM:
                raise EngineError("UNSUPPORTED_SCHEMA")
            if rows[0][1] > self.authority.epoch:
                raise EngineError("AUTHORITY_LOST")
            conn.execute(
                "UPDATE nma_partition SET authority_epoch=? WHERE owner_id=?",
                (self.authority.epoch, self.owner),
            )

        version = conn.execute("SELECT schema_version FROM nma_partition").fetchone()[0]
        if version == 1:
            for statement in AGENT_DDL:
                conn.execute(statement)
            conn.execute(
                "INSERT INTO nma_schema_migrations(owner_id,version,checksum) VALUES (?,2,?)",
                (self.owner, AGENT_CHECKSUM),
            )
            conn.execute("UPDATE nma_partition SET schema_version=2")
        else:
            saved = conn.execute(
                "SELECT checksum FROM nma_schema_migrations WHERE owner_id=? AND version=2",
                (self.owner,),
            ).fetchone()
            if not saved or saved[0] != AGENT_CHECKSUM:
                raise EngineError("UNSUPPORTED_SCHEMA")

        version = conn.execute("SELECT schema_version FROM nma_partition").fetchone()[0]
        if version == 2:
            for statement in THREAD_DDL:
                conn.execute(statement)
            conn.execute(
                "INSERT INTO nma_schema_migrations(owner_id,version,checksum) VALUES (?,3,?)",
                (self.owner, THREAD_CHECKSUM),
            )
            conn.execute("UPDATE nma_partition SET schema_version=3")
        else:
            saved = conn.execute(
                "SELECT checksum FROM nma_schema_migrations WHERE owner_id=? AND version=3",
                (self.owner,),
            ).fetchone()
            if not saved or saved[0] != THREAD_CHECKSUM:
                raise EngineError("UNSUPPORTED_SCHEMA")

        version = conn.execute("SELECT schema_version FROM nma_partition").fetchone()[0]
        if version == 3:
            for statement in CONTEXT_DDL:
                conn.execute(statement)
            conn.execute(
                "INSERT INTO nma_schema_migrations(owner_id,version,checksum) VALUES (?,4,?)",
                (self.owner, CONTEXT_CHECKSUM),
            )
            for row in conn.execute(
                "SELECT thread_id FROM nma_threads WHERE owner_id=?", (self.owner,)
            ).fetchall():
                fence_context_runs(conn, self.owner, row[0])
            # Existing sessions lack the context marker; require fresh scoped bindings.
            conn.execute(
                "UPDATE nma_threads SET context_generation=context_generation+1,revision=revision+1"
            )
            conn.execute("UPDATE nma_partition SET schema_version=4")
        else:
            saved = conn.execute(
                "SELECT checksum FROM nma_schema_migrations WHERE owner_id=? AND version=4",
                (self.owner,),
            ).fetchone()
            if not saved or saved[0] != CONTEXT_CHECKSUM:
                raise EngineError("UNSUPPORTED_SCHEMA")

        version = conn.execute("SELECT schema_version FROM nma_partition").fetchone()[0]
        if version == 4:
            from uuid import uuid4

            for statement in RELIABILITY_DDL:
                conn.execute(statement)
            conn.execute(
                "INSERT INTO nma_stream VALUES (?,?)", (self.owner, str(uuid4()))
            )
            conn.execute(
                "INSERT INTO nma_schema_migrations(owner_id,version,checksum) VALUES (?,5,?)",
                (self.owner, RELIABILITY_CHECKSUM),
            )
            conn.execute("UPDATE nma_partition SET schema_version=5")
        else:
            saved = conn.execute(
                "SELECT checksum FROM nma_schema_migrations WHERE owner_id=? AND version=5",
                (self.owner,),
            ).fetchone()
            if not saved or saved[0] != RELIABILITY_CHECKSUM:
                raise EngineError("UNSUPPORTED_SCHEMA")

        version = conn.execute("SELECT schema_version FROM nma_partition").fetchone()[0]
        if version == 5:
            for statement in DM_DDL:
                conn.execute(statement)
            conn.execute(
                "INSERT INTO nma_schema_migrations(owner_id,version,checksum) VALUES (?,6,?)",
                (self.owner, DM_CHECKSUM),
            )
            conn.execute("UPDATE nma_partition SET schema_version=6")
        else:
            saved = conn.execute(
                "SELECT checksum FROM nma_schema_migrations WHERE owner_id=? AND version=6",
                (self.owner,),
            ).fetchone()
            if not saved or saved[0] != DM_CHECKSUM:
                raise EngineError("UNSUPPORTED_SCHEMA")

        version = conn.execute("SELECT schema_version FROM nma_partition").fetchone()[0]
        if version == 6:
            for statement in GOAL_DDL:
                conn.execute(statement)
            conn.execute(
                "INSERT INTO nma_schema_migrations(owner_id,version,checksum) VALUES (?,7,?)",
                (self.owner, GOAL_CHECKSUM),
            )
            conn.execute("UPDATE nma_partition SET schema_version=7")
        else:
            saved = conn.execute(
                "SELECT checksum FROM nma_schema_migrations WHERE owner_id=? AND version=7",
                (self.owner,),
            ).fetchone()
            if not saved or saved[0] != GOAL_CHECKSUM:
                raise EngineError("UNSUPPORTED_SCHEMA")

        version = conn.execute("SELECT schema_version FROM nma_partition").fetchone()[0]
        if version == 7:
            for statement in LIFECYCLE_DDL:
                conn.execute(statement)
            conn.execute(
                "INSERT INTO nma_schema_migrations(owner_id,version,checksum) VALUES (?,8,?)",
                (self.owner, LIFECYCLE_CHECKSUM),
            )
            conn.execute("UPDATE nma_partition SET schema_version=8")
        else:
            saved = conn.execute(
                "SELECT checksum FROM nma_schema_migrations WHERE owner_id=? AND version=8",
                (self.owner,),
            ).fetchone()
            if not saved or saved[0] != LIFECYCLE_CHECKSUM:
                raise EngineError("UNSUPPORTED_SCHEMA")

        version = conn.execute("SELECT schema_version FROM nma_partition").fetchone()[0]
        if version == 8:
            for statement in WAKE_DDL:
                conn.execute(statement)
            conn.execute(
                "INSERT INTO nma_schema_migrations(owner_id,version,checksum) VALUES (?,9,?)",
                (self.owner, WAKE_CHECKSUM),
            )
            conn.execute("UPDATE nma_partition SET schema_version=9")
        else:
            saved = conn.execute(
                "SELECT checksum FROM nma_schema_migrations WHERE owner_id=? AND version=9",
                (self.owner,),
            ).fetchone()
            if not saved or saved[0] != WAKE_CHECKSUM:
                raise EngineError("UNSUPPORTED_SCHEMA")

        version = conn.execute("SELECT schema_version FROM nma_partition").fetchone()[0]
        if version == 9:
            for statement in WEBHOOK_DDL:
                conn.execute(statement)
            conn.execute(
                "INSERT INTO nma_schema_migrations(owner_id,version,checksum) VALUES (?,10,?)",
                (self.owner, WEBHOOK_CHECKSUM),
            )
            conn.execute("UPDATE nma_partition SET schema_version=10")
        else:
            saved = conn.execute(
                "SELECT checksum FROM nma_schema_migrations WHERE owner_id=? AND version=10",
                (self.owner,),
            ).fetchone()
            if not saved or saved[0] != WEBHOOK_CHECKSUM:
                raise EngineError("UNSUPPORTED_SCHEMA")

        version = conn.execute("SELECT schema_version FROM nma_partition").fetchone()[0]
        if version == 10:
            for statement in DISCUSSION_DDL:
                conn.execute(statement)
            conn.execute(
                "INSERT INTO nma_schema_migrations(owner_id,version,checksum) VALUES (?,11,?)",
                (self.owner, DISCUSSION_CHECKSUM),
            )
            conn.execute("UPDATE nma_partition SET schema_version=11")
        else:
            saved = conn.execute(
                "SELECT checksum FROM nma_schema_migrations WHERE owner_id=? AND version=11",
                (self.owner,),
            ).fetchone()
            if not saved or saved[0] != DISCUSSION_CHECKSUM:
                raise EngineError("UNSUPPORTED_SCHEMA")

        version = conn.execute("SELECT schema_version FROM nma_partition").fetchone()[0]
        if version == 11:
            for statement in INTEGRATION_DDL:
                conn.execute(statement)
            conn.execute(
                "INSERT INTO nma_schema_migrations(owner_id,version,checksum) VALUES (?,12,?)",
                (self.owner, ARTIFACT_CHECKSUM),
            )
            conn.execute("UPDATE nma_partition SET schema_version=12")
        else:
            saved = conn.execute(
                "SELECT checksum FROM nma_schema_migrations WHERE owner_id=? AND version=12",
                (self.owner,),
            ).fetchone()
            if not saved or saved[0] != ARTIFACT_CHECKSUM:
                raise EngineError("UNSUPPORTED_SCHEMA")

        version = conn.execute("SELECT schema_version FROM nma_partition").fetchone()[0]
        if version == 12:
            for statement in CONVERSATION_DDL:
                conn.execute(statement)
            backfill(conn, self.owner)
            conn.execute(
                "INSERT INTO nma_schema_migrations(owner_id,version,checksum) VALUES (?,13,?)",
                (self.owner, CONVERSATION_CHECKSUM),
            )
            conn.execute("UPDATE nma_partition SET schema_version=13")
        else:
            saved = conn.execute(
                "SELECT checksum FROM nma_schema_migrations WHERE owner_id=? AND version=13",
                (self.owner,),
            ).fetchone()
            if not saved or saved[0] != CONVERSATION_CHECKSUM:
                raise EngineError("UNSUPPORTED_SCHEMA")

        version = conn.execute("SELECT schema_version FROM nma_partition").fetchone()[0]
        if version == 13:
            for statement in CONNECTION_DDL:
                conn.execute(statement)
            conn.execute(
                "INSERT INTO nma_schema_migrations(owner_id,version,checksum) VALUES (?,14,?)",
                (self.owner, CONNECTION_CHECKSUM),
            )
            conn.execute("UPDATE nma_partition SET schema_version=14")
        else:
            saved = conn.execute(
                "SELECT checksum FROM nma_schema_migrations WHERE owner_id=? AND version=14",
                (self.owner,),
            ).fetchone()
            if not saved or saved[0] != CONNECTION_CHECKSUM:
                raise EngineError("UNSUPPORTED_SCHEMA")

        version = conn.execute("SELECT schema_version FROM nma_partition").fetchone()[0]
        if version == 14:
            from ngertiin_engine.outcomes import decode, evidence

            for statement in OUTCOME_DDL:
                conn.execute(statement)
            from uuid import NAMESPACE_URL, uuid5

            for key, raw, sid in conn.execute(
                "SELECT binding_id,config,native_session_id FROM nma_adapter_bindings WHERE owner_id=?",
                (self.owner,),
            ).fetchall():
                config = json.loads(raw)
                logical = str(
                    uuid5(
                        NAMESPACE_URL,
                        canonical(
                            [
                                self.owner,
                                config["agent_id"],
                                config["thread_id"],
                                "logical-session",
                            ]
                        ),
                    )
                )
                conn.execute(
                    "INSERT INTO nma_session_lineage VALUES (?,?,?,NULL,?,0)",
                    (self.owner, key, logical, sid),
                )
            for run_id, operation_id, status, receipt in conn.execute(
                "SELECT run_id,operation_id,status,receipt FROM nma_effects WHERE owner_id=?",
                (self.owner,),
            ).fetchall():
                phase = (
                    "unknown"
                    if status == "dispatching"
                    else evidence(decode(receipt).get("value"))
                )
                conn.execute(
                    "INSERT INTO nma_effect_outcomes VALUES (?,?,?,NULL,'mutation',?,NULL,?,NULL)",
                    (self.owner, run_id, operation_id, phase, receipt),
                )
                if phase == "unknown":
                    # Correct historical error-to-success mapping, retaining exact receipt bytes.
                    conn.execute(
                        "UPDATE nma_effects SET status='dispatching' WHERE owner_id=? AND run_id=? AND operation_id=?",
                        (self.owner, run_id, operation_id),
                    )
            conn.execute(
                "INSERT INTO nma_schema_migrations(owner_id,version,checksum) VALUES (?,15,?)",
                (self.owner, OUTCOME_CHECKSUM),
            )
            conn.execute("UPDATE nma_partition SET schema_version=15")
        else:
            saved = conn.execute(
                "SELECT checksum FROM nma_schema_migrations WHERE owner_id=? AND version=15",
                (self.owner,),
            ).fetchone()
            if not saved or saved[0] != OUTCOME_CHECKSUM:
                raise EngineError("UNSUPPORTED_SCHEMA")

    def receipt(self, body):
        def read(conn):
            row = conn.execute(
                "SELECT payload_digest,result FROM nma_commands WHERE owner_id=? AND command_id=?",
                (self.owner, body["command_id"]),
            ).fetchone()
            if row:
                if row[0] != digest(body):
                    raise EngineError("COMMAND_CONFLICT")
                value = json.loads(row[1]) if row[1] else None
                if value and value.get("error_code"):
                    raise EngineError(value["error_code"])
                return value

        return self.write(read)

    def native_submission(self, body, principal):
        """Reconcile a pending operation from durable native identity, without resubmitting."""

        def read(conn):
            row = conn.execute(
                "SELECT r.run_id,r.binding_id,b.config,b.native_session_id FROM nma_commands c JOIN nma_adapter_runs r ON r.owner_id=c.owner_id AND r.operation_id=c.command_id JOIN nma_adapter_bindings b ON b.owner_id=r.owner_id AND b.binding_id=r.binding_id WHERE c.owner_id=? AND c.command_id=? AND c.result IS NULL",
                (self.owner, body["command_id"]),
            ).fetchone()
            if not row or not row[3]:
                return None
            native = conn.execute(
                "SELECT admission_id FROM session_admissions WHERE principal_id=? AND target_session_id=? AND request_id=?",
                (principal, row[3], "nma:" + body["command_id"]),
            ).fetchone()
            if not native:
                return None
            conn.execute(
                "UPDATE nma_adapter_runs SET native_admission_id=? WHERE owner_id=? AND run_id=?",
                (native[0], self.owner, row[0]),
            )
            return row[0], json.loads(row[2])

        return self.write(read)

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
            sequence = next_sequence(conn, self.owner)
            receipt = {
                "schema_version": "nma.v1",
                "command_id": event_id,
                "status": "rejected" if result.get("error_code") else "accepted",
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
