"""Map trusted domain bindings to the existing Hermes authority, never execute models."""

import asyncio
from uuid import NAMESPACE_URL, uuid5

from ngertiin_engine.contracts import EngineError, canonical, counter, digest, uuid
from ngertiin_engine.store import Store

ERRORS = {
    "not_found": "NOT_FOUND",
    "permission_denied": "NOT_FOUND",
    "profile_mismatch": "NOT_FOUND",
    "admission_conflict": "COMMAND_CONFLICT",
    "invalid_params": "INVALID_REQUEST",
    "stale_generation": "STALE_GENERATION",
    "runtime_draining": "ENGINE_UNAVAILABLE",
    "unknown_execution": "INDETERMINATE",
    "storage_unavailable": "ENGINE_UNAVAILABLE",
}
EVENTS = {
    "message.delta": "message.delta",
    "message.complete": "message.completed",
    "tool.start": "tool.started",
    "tool.result": "tool.completed",
    "tool.complete": "tool.completed",
    "error": "run.error",
    "message.start": "run.started",
}


class Adapter:
    def __init__(self, authority, owner: str, configurations: list[dict]):
        from gateway.session_contract import Principal

        self.authority, self.owner = authority, uuid(owner)
        self.store = Store(authority, owner)
        self.actor = Principal(
            "nma:" + owner,
            authority.profile_id,
            frozenset(
                {"session:create", "session:read", "session:submit", "session:control"}
            ),
            "nma:" + owner,
        )
        self.bindings = {}
        self.lock = asyncio.Lock()
        for config in configurations:
            required = {
                "agent_id",
                "thread_id",
                "config_revision",
                "context_generation",
                "model",
                "provider",
                "base_url",
                "toolsets",
                "cwd",
            }
            if set(config) != required:
                raise EngineError("INVALID_CONFIGURATION")
            uuid(config["agent_id"])
            uuid(config["thread_id"])
            counter(config["config_revision"])
            counter(config["context_generation"])
            key = digest(
                [
                    config[k]
                    for k in (
                        "agent_id",
                        "thread_id",
                        "config_revision",
                        "context_generation",
                    )
                ]
            )
            self.bindings[key] = config

            def install(conn, key=key, config=config):
                row = conn.execute(
                    "SELECT config_digest FROM nma_adapter_bindings WHERE owner_id=? AND binding_id=?",
                    (owner, key),
                ).fetchone()
                if row and row[0] != digest(config):
                    raise EngineError("CONFIG_REVISION_CONFLICT")
                conn.execute(
                    "INSERT OR IGNORE INTO nma_adapter_bindings VALUES (?,?,?,?,NULL)",
                    (owner, key, digest(config), canonical(config)),
                )

            self.store.write(install)

    def binding(self, payload):
        fields = ("agent_id", "thread_id", "config_revision", "context_generation")
        uuid(payload.get("agent_id"))
        uuid(payload.get("thread_id"))
        counter(payload.get("config_revision"))
        counter(payload.get("context_generation"))
        key = digest([payload[k] for k in fields])
        if key not in self.bindings:
            raise EngineError("NOT_FOUND")
        return key, self.bindings[key]

    def row(self, run_id):
        uuid(run_id)

        def read(conn):
            return conn.execute(
                "SELECT r.binding_id,r.native_admission_id,b.native_session_id FROM nma_adapter_runs r JOIN nma_adapter_bindings b ON b.owner_id=r.owner_id AND b.binding_id=r.binding_id WHERE r.owner_id=? AND r.run_id=?",
                (self.owner, run_id),
            ).fetchone()

        row = self.store.write(read)
        if not row or row[0] not in self.bindings:
            raise EngineError("NOT_FOUND")
        return row

    async def session(self, key, config):
        from gateway.session_local import stage_local_session
        from gateway.session_local_recovery import restore_local_session
        from gateway.session_policy import build_policy
        from hermes_state_local import commit_local_session

        params = {
            "request_id": "nma:" + key,
            "source": "tool",
            "cwd": config["cwd"],
            "model": config["model"],
            "toolsets": config["toolsets"],
        }
        frozen = {
            "model": {
                "default": config["model"],
                "provider": config["provider"],
                "base_url": config["base_url"],
            },
            "agent": {"max_turns": 8},
            "auxiliary": {"title_generation": {"enabled": False}},
            "platform_toolsets": {"cli": config["toolsets"]},
        }
        policy = build_policy(
            params, frozen, private_secrets={}, profile_terminal=False
        )
        staged = stage_local_session(
            self.authority, self.actor, params, trusted_policy=policy
        )
        if isinstance(staged, dict):
            await asyncio.to_thread(
                commit_local_session,
                self.authority.db,
                epoch=self.authority.epoch,
                receipt=staged,
            )
            ref = restore_local_session(self.authority, staged["session_id"])
        else:
            ref = staged
        self.store.write(
            lambda conn: conn.execute(
                "UPDATE nma_adapter_bindings SET native_session_id=? WHERE owner_id=? AND binding_id=?",
                (ref.session_id, self.owner, key),
            )
        )
        return ref

    async def dispatch(self, body):
        from gateway.session_authorities import owner_scope
        from hermes_state_runtime import RuntimeStoreError

        try:
            with owner_scope(self.authority):
                async with self.lock:
                    return await self._dispatch(body)
        except RuntimeStoreError as exc:
            raise EngineError(ERRORS.get(exc.reason, "ENGINE_UNAVAILABLE")) from exc

    async def _dispatch(self, body):
        kind, payload = body["type"], body["payload"]
        if kind == "runtime.describe":
            if payload:
                raise EngineError("INVALID_REQUEST")
            return {
                "schema_version": "nma.v1",
                "authority_epoch": str(self.authority.epoch),
                "capabilities": [
                    "runtime.submit",
                    "run.cancel",
                    "runtime.read",
                    "runtime.events",
                ],
                "production_ready": False,
            }
        if kind == "runtime.submit":
            if set(payload) != {
                "agent_id",
                "thread_id",
                "config_revision",
                "context_generation",
                "text",
            }:
                raise EngineError("INVALID_REQUEST")
            if (
                not isinstance(payload["text"], str)
                or not 1 <= len(payload["text"]) <= 100000
            ):
                raise EngineError("INVALID_REQUEST")
            key, config = self.binding(payload)
            prior = self.store.admit(body)
            if prior:
                return prior
            ref = await self.session(key, config)
            run_id = str(uuid5(NAMESPACE_URL, self.owner + ":" + body["command_id"]))
            self.store.write(
                lambda conn: conn.execute(
                    "INSERT OR IGNORE INTO nma_adapter_runs VALUES (?,?,?,?,NULL)",
                    (self.owner, run_id, key, body["command_id"]),
                )
            )
            from gateway.session_contract import Submission

            receipt = await self.authority.submit(
                self.actor,
                Submission(
                    "nma:" + body["command_id"], ref, {"text": payload["text"]}, "queue"
                ),
            )
            self.store.write(
                lambda conn: conn.execute(
                    "UPDATE nma_adapter_runs SET native_admission_id=? WHERE owner_id=? AND run_id=?",
                    (receipt.admission_id, self.owner, run_id),
                )
            )
            return self.store.finish(
                body,
                {
                    "run_id": run_id,
                    **{
                        k: config[k]
                        for k in (
                            "agent_id",
                            "thread_id",
                            "config_revision",
                            "context_generation",
                        )
                    },
                },
            )
        if kind == "runtime.events":
            return await self.events(payload)
        if kind not in {"run.cancel", "runtime.read"} or set(payload) != {"run_id"}:
            raise EngineError("INVALID_REQUEST")
        row = self.row(payload["run_id"])
        from gateway.session_contract import SessionRef

        ref = SessionRef(self.authority.profile_id, row[2])
        await self.authority.resolve(self.actor, ref)
        if not row[1]:
            raise EngineError("ENGINE_UNAVAILABLE")
        receipt = await self.authority.receipt(self.actor, ref, row[1])
        if kind == "run.cancel":
            prior = self.store.admit(body)
            if prior:
                return prior
            if receipt.status == "queued":
                claimed = await self.authority.cancel_or_claimed(
                    self.actor, ref, row[1]
                )
                if claimed:
                    await self.interrupt(ref, claimed["generation"])
            elif receipt.status == "started":
                await self.interrupt(ref, receipt.execution_generation)
            elif receipt.status == "unknown":
                raise EngineError("INDETERMINATE")
            return self.store.finish(
                body,
                {
                    "run_id": payload["run_id"],
                    "cancel_requested": receipt.status != "terminal",
                },
            )
        from gateway.session_results import admission_result

        result = await asyncio.to_thread(
            admission_result, self.authority.db, receipt.admission_id
        )
        status = {
            "queued": "queued",
            "started": "running",
            "unknown": "indeterminate",
        }.get(receipt.status)
        if status is None:
            status = {
                "completed": "succeeded",
                "cancelled": "cancelled",
                "interrupted": "cancelled",
            }.get(receipt.outcome, "failed")
        config = self.bindings[row[0]]
        value = result["result"] if result else {}
        # Raw native errors/metadata can include paths and credentials. Publish stable codes only.
        return {
            "schema_version": "nma.v1",
            "run_id": payload["run_id"],
            "status": status,
            **{
                k: config[k]
                for k in (
                    "agent_id",
                    "thread_id",
                    "config_revision",
                    "context_generation",
                )
            },
            "text": value.get("final_response", "") if status == "succeeded" else "",
            "error_code": "RUNTIME_FAILED" if status == "failed" else None,
        }

    async def interrupt(self, ref, generation):
        from gateway.session_managed_worker import interrupt_managed

        if not interrupt_managed(self.authority, self.actor, ref, generation):
            await self.authority.interrupt(self.actor, ref, generation)

    async def events(self, payload):
        from gateway.session_contract import SessionRef

        if set(payload) != {"run_id", "replay_epoch", "last_sequence"}:
            raise EngineError("INVALID_REQUEST")
        sequence = payload["last_sequence"]
        if sequence != "0":
            counter(sequence)
        if payload["replay_epoch"] is not None and not isinstance(
            payload["replay_epoch"], str
        ):
            raise EngineError("INVALID_REQUEST")
        row = self.row(payload["run_id"])
        ref = SessionRef(self.authority.profile_id, row[2])
        await self.authority.resolve(self.actor, ref)
        stream = self.authority.sessions[ref.session_id].event_stream
        replay = stream.since(payload["replay_epoch"], int(sequence))
        events = []
        config = self.bindings[row[0]]
        for frame in replay["events"]:
            if frame.get("admission_id") != row[1] or frame["type"] not in EVENTS:
                continue
            raw = frame.get("payload", {})
            fields = {
                k: raw[k]
                for k in ("text", "tool_name", "tool_call_id", "is_error", "status")
                if k in raw
            }
            if frame["type"] == "error":
                fields = {"code": "RUNTIME_FAILED"}
            events.append(
                {
                    "schema_version": "nma.v1",
                    "run_id": payload["run_id"],
                    "agent_id": config["agent_id"],
                    "thread_id": config["thread_id"],
                    "config_revision": config["config_revision"],
                    "sequence": str(frame["seq"]),
                    "type": EVENTS[frame["type"]],
                    "payload": fields,
                }
            )
        return {
            "events": events,
            "last_sequence": str(replay["last_sequence"]),
            "replay_epoch": replay["replay_epoch"],
            "snapshot_required": replay["snapshot_required"],
        }
