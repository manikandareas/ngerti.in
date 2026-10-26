"""Authenticated native compression/reset, with durable mutation identities."""

import json
from contextvars import ContextVar
from uuid import NAMESPACE_URL, uuid5

from ngertiin_engine.contracts import (
    EngineError,
    canonical,
    counter,
    next_sequence,
    uuid,
)
from ngertiin_engine.session_context import SessionContext

control = ContextVar("nma_session_control", default=None)


class SessionControls:
    def __init__(self, adapter):
        self.adapter, self.store = adapter, adapter.store

    def binding(self, payload):
        agent, thread = uuid(payload.get("agent_id")), uuid(payload.get("thread_id"))

        def read(conn):
            self.adapter.context.scope(conn, agent, thread)
            row = conn.execute(
                "SELECT b.binding_id,b.config,b.native_session_id FROM nma_adapter_bindings b JOIN nma_threads t ON t.owner_id=b.owner_id AND t.thread_id=json_extract(b.config,'$.thread_id') WHERE b.owner_id=? AND json_extract(b.config,'$.agent_id')=? AND t.thread_id=? AND json_extract(b.config,'$.context_generation')=CAST(t.context_generation AS TEXT) AND b.native_session_id IS NOT NULL ORDER BY b.rowid DESC LIMIT 1",
                (self.store.owner, agent, thread),
            ).fetchone()
            if not row:
                raise EngineError("SESSION_UNAVAILABLE")
            config = json.loads(row[1])
            self.adapter.threads.check_binding(conn, config)
            return row[0], config, row[2]

        return self.store.write(read)

    async def inspect(self, payload):
        if set(payload) != {"agent_id", "thread_id"}:
            raise EngineError("INVALID_REQUEST")
        key, _, sid = self.binding(payload)
        from gateway.session_contract import SessionRef

        handle = await self.adapter.authority.resolve(
            self.adapter.actor, SessionRef(self.adapter.authority.profile_id, sid)
        )
        return {
            **SessionContext(self.store).metadata(key),
            "session_revision": str(handle.revision),
            "execution_generation": str(handle.execution_generation),
            "execution_state": handle.execution_state,
        }

    async def mutate(self, body):
        p = body["payload"]
        if set(p) != {
            "agent_id",
            "thread_id",
            "native_session_id",
            "execution_generation",
        }:
            raise EngineError("INVALID_REQUEST")
        prior = self.store.receipt(body)
        if prior:
            return prior
        revision = int(counter(body["expected_revision"]))
        generation = p["execution_generation"]
        if (
            not isinstance(generation, str)
            or not generation.isascii()
            or not generation.isdecimal()
            or str(int(generation)) != generation
            or int(generation) >= 2**63
        ):
            raise EngineError("INVALID_REQUEST")
        operation = body["type"].split(".")[1]
        from gateway.session_contract import SessionRef
        from gateway.session_mutations import mutate_session
        from hermes_state_mutation_guards import MUTATION_GUARD_REFUSALS
        from hermes_state_runtime import (
            RuntimeStoreError,
            mutation_receipt_key,
            replay_mutation_receipt,
        )

        sid = p["native_session_id"]
        saved = self.store.write(
            lambda conn: conn.execute(
                "SELECT binding_id,config FROM nma_adapter_bindings WHERE owner_id=? AND native_session_id=? AND json_extract(config,'$.agent_id')=? AND json_extract(config,'$.thread_id')=?",
                (self.store.owner, sid, uuid(p["agent_id"]), uuid(p["thread_id"])),
            ).fetchone()
        )
        if not saved:
            raise EngineError("NOT_FOUND")
        key, config = saved[0], json.loads(saved[1])
        receipt_key, receipt_digest = mutation_receipt_key(
            self.adapter.actor.subject,
            sid,
            "nma:" + body["command_id"],
            operation=operation,
            payload={},
            expected_revision=revision,
            expected_generation=int(generation),
        )
        native_result = self.store.write(
            lambda conn: replay_mutation_receipt(conn, receipt_key, receipt_digest)
        )
        if native_result is None:
            current_key, _, _ = self.binding(p)
            if current_key != key:
                raise EngineError("REVISION_CONFLICT")

        self.store.admit(body)
        intent_id = str(uuid5(NAMESPACE_URL, body["command_id"] + ":context-intent"))

        def prepare(conn):
            saved = conn.execute(
                "SELECT payload FROM nma_events WHERE owner_id=? AND event_id=?",
                (self.store.owner, intent_id),
            ).fetchone()
            if saved:
                return json.loads(saved[0])["context_watermark"]
            watermark = conn.execute(
                "SELECT next_message_seq-1 FROM nma_threads WHERE owner_id=? AND thread_id=?",
                (self.store.owner, config["thread_id"]),
            ).fetchone()[0]
            sequence = next_sequence(conn, self.store.owner)
            conn.execute(
                "INSERT INTO nma_events VALUES (?,?,?,?)",
                (
                    self.store.owner,
                    sequence,
                    intent_id,
                    canonical(
                        {
                            "type": "context.change_requested",
                            "sequence": str(sequence),
                            "command_id": body["command_id"],
                            "thread_id": config["thread_id"],
                            "context_watermark": watermark,
                        }
                    ),
                ),
            )
            return watermark

        watermark = self.store.write(prepare)
        marker = {
            "command_id": body["command_id"],
            "binding_id": key,
            "authority_epoch": self.adapter.authority.epoch,
        }
        token = control.set(marker)
        try:
            if native_result is None:
                native_result = await mutate_session(
                    self.adapter.authority,
                    self.adapter.actor,
                    SessionRef(self.adapter.authority.profile_id, sid),
                    {
                        "session_id": sid,
                        "request_id": "nma:" + body["command_id"],
                        "expected_revision": revision,
                        "operation": operation,
                        "payload": {},
                        "expected_generation": int(generation),
                    },
                )
        except (RuntimeStoreError, *MUTATION_GUARD_REFUSALS) as error:
            reason = (
                error.reason if isinstance(error, RuntimeStoreError) else "session_busy"
            )
            code = {
                "session_busy": "SESSION_BUSY",
                "unknown_execution": "SESSION_BUSY",
                "revision_conflict": "REVISION_CONFLICT",
                "stale_generation": "STALE_GENERATION",
                "invalid_params": "INVALID_REQUEST",
                "compression_failed": "COMPRESSION_FAILED",
            }.get(reason)
            if code is None:
                raise
            self.store.finish(body, {"error_code": code})
            raise EngineError(code) from error
        finally:
            control.reset(token)

        # Native compression of a short history is a read-only noop: it has no
        # mutation receipt or revision fields. Finish the product command so an
        # exact retry returns the same report instead of leaving startup pending.
        if native_result.get("status") == "noop":
            handle = await self.adapter.authority.resolve(
                self.adapter.actor, SessionRef(self.adapter.authority.profile_id, sid)
            )
            native_result = {
                **native_result,
                "revision": handle.revision,
                "execution_generation": handle.execution_generation,
            }

        def record(conn):
            if operation == "reset":
                conn.execute(
                    "UPDATE nma_session_lineage SET context_watermark=MAX(context_watermark,?) WHERE owner_id=? AND binding_id=?",
                    (watermark, self.store.owner, key),
                )
            event_id = str(uuid5(NAMESPACE_URL, body["command_id"] + ":context"))
            if not conn.execute(
                "SELECT 1 FROM nma_events WHERE owner_id=? AND event_id=?",
                (self.store.owner, event_id),
            ).fetchone():
                run = conn.execute(
                    "SELECT run_id FROM nma_adapter_runs WHERE owner_id=? AND binding_id=? ORDER BY rowid DESC LIMIT 1",
                    (self.store.owner, key),
                ).fetchone()
                if run:
                    self.adapter.reliability.append(
                        conn,
                        run[0],
                        config,
                        "context." + operation,
                        {
                            **SessionContext(self.store)._metadata(conn, key),
                            "native_mutation": native_result,
                        },
                        event_id=event_id,
                    )

        self.store.write(record)
        session = SessionContext(self.store).metadata(key)
        session.update(
            native_tip=native_result.get("target_session_id", session["native_tip"]),
            session_revision=str(native_result["revision"]),
            execution_generation=str(native_result["execution_generation"]),
        )
        return self.store.finish(
            body,
            {
                "native_mutation": native_result,
                "session": session,
            },
        )


def authorize_control(store, marker, session_id):
    """Fence an auxiliary native request without inventing a model admission."""

    def check(conn):
        row = conn.execute(
            "SELECT b.config FROM nma_adapter_bindings b JOIN nma_runtime_outbox o ON o.owner_id=b.owner_id WHERE b.owner_id=? AND b.binding_id=? AND b.native_session_id=? AND o.operation_id=? AND o.state='pending' AND json_extract(o.payload,'$.type')='session.compress'",
            (store.owner, marker["binding_id"], session_id, marker["command_id"]),
        ).fetchone()
        if not row or marker["authority_epoch"] != store.authority.epoch:
            raise EngineError("ACCESS_REVOKED")
        from ngertiin_engine.agents import Agents
        from ngertiin_engine.threads import Threads

        Threads(store, Agents(store, {})).check_binding(conn, json.loads(row[0]))

    store.write(check)
