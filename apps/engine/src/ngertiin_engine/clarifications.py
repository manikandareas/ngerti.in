"""Authenticated web projection of Hermes's generation-bound clarify waiters."""

import json

from ngertiin_engine.contracts import EngineError, canonical, counter, digest, uuid
from ngertiin_engine.redaction import result as redact


class Clarifications:
    def __init__(self, adapter):
        self.adapter, self.store = adapter, adapter.store

    def candidates(self, thread_id):
        def read(conn):
            self.adapter.threads.get(conn, thread_id)
            rows = conn.execute(
                "SELECT b.native_session_id,b.config,r.run_id FROM nma_adapter_bindings b JOIN nma_adapter_runs r USING(owner_id,binding_id) JOIN session_admissions a ON a.admission_id=r.native_admission_id WHERE b.owner_id=? AND json_extract(b.config,'$.thread_id')=? AND a.status='started'",
                (self.store.owner, thread_id),
            ).fetchall()
            selected = []
            for sid, raw, run_id in rows:
                config = json.loads(raw)
                try:
                    self.adapter.context.scope(conn, config["agent_id"], thread_id)
                    self.adapter.threads.check_binding(conn, config)
                    if conn.execute(
                        "SELECT 1 FROM nma_agent_run_fences WHERE owner_id=? AND run_id=? UNION ALL SELECT 1 FROM nma_context_run_fences WHERE owner_id=? AND run_id=? UNION ALL SELECT 1 FROM nma_run_stops WHERE owner_id=? AND run_id=?",
                        (self.store.owner, run_id) * 3,
                    ).fetchone():
                        continue
                except EngineError:
                    continue
                selected.append((sid, config, run_id))
            return selected

        return self.store.write(read)

    def listing(self, p):
        if set(p) != {"thread_id"}:
            raise EngineError("INVALID_REQUEST")
        items = []
        for sid, config, run_id in self.candidates(uuid(p["thread_id"])):
            live = self.adapter.authority.sessions.get(sid)
            generation = self.adapter.authority.executing.get(sid)
            if live is None or generation is None:
                continue
            for prompt in live.controls.snapshot(sid, generation):
                if prompt["kind"] == "clarify":
                    items.append(
                        {
                            **redact(prompt),
                            "native_session_id": sid,
                            "execution_generation": str(generation),
                            "agent_id": config["agent_id"],
                            "run_id": run_id,
                            "thread_id": p["thread_id"],
                        }
                    )
        return {"items": items}

    async def answer(self, body):
        p = body["payload"]
        if (
            body["expected_revision"] is not None
            or set(p)
            != {
                "thread_id",
                "native_session_id",
                "execution_generation",
                "prompt_id",
                "answer",
            }
            or not isinstance(p["prompt_id"], str)
            or not 1 <= len(p["prompt_id"]) <= 200
            or not isinstance(p["answer"], str)
            or len(p["answer"]) > 16000
        ):
            raise EngineError("INVALID_REQUEST")
        saved = self.store.receipt(body)
        if saved:
            return saved
        generation = int(counter(p["execution_generation"]))
        if p["native_session_id"] not in {
            r[0] for r in self.candidates(uuid(p["thread_id"]))
        }:
            raise EngineError("STALE_GENERATION")
        from gateway.session_contract import SessionRef
        from hermes_state_runtime import RuntimeStoreError

        ref = SessionRef(self.adapter.authority.profile_id, p["native_session_id"])
        attached = await self.adapter.authority.attach(self.adapter.actor, ref)
        try:
            result = await self.adapter.authority.respond(
                self.adapter.actor,
                ref,
                generation,
                p["prompt_id"],
                {"answer": p["answer"]},
                kind="clarify",
            )
        except RuntimeStoreError as error:
            raise EngineError(
                "STALE_GENERATION"
                if error.reason in {"stale_generation", "not_found"}
                else "INVALID_REQUEST"
            ) from error
        finally:
            await self.adapter.authority.detach(
                self.adapter.actor, attached.subscription_id
            )

        def record(conn):
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

        return self.store.write(record)
