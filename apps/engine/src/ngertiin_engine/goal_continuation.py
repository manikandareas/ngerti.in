"""Reconcile product goal units through the existing Hermes admission authority.

Kanban cards are parked bookkeeping units, never fed to a second dispatcher.
The gateway's native session queue/leases own every model turn. Native /goal is
not set on a shared DM slot. Stable outbox/card keys survive archive and restart.
"""

import json
import time
from uuid import NAMESPACE_URL, uuid5

from ngertiin_engine.contracts import EngineError, canonical, digest
from ngertiin_engine.direct_messages import command
from ngertiin_engine.goal_lifecycle import Lifecycle


class Continuation:
    def __init__(self, adapter):
        self.adapter = adapter
        self.store = adapter.store
        self.lifecycle = Lifecycle(self.store)
        self.next_wake_poll = 0.0

    def card(self, run_id, goal):
        from hermes_cli.kanban_db import board_dir, create_board, create_task, write_txn
        from hermes_cli.kanban_db_connect import connect_closing

        if not board_dir("nma-goal-units").exists():
            create_board("nma-goal-units", name="Ngertiin execution units")
        identity = digest(
            [self.store.owner, "goal-unit", goal["goal_id"], goal["generation"], run_id]
        )
        # Separate native transaction. Query includes archived cards; raw create's
        # non-archived dedup alone is insufficient. Hold the writer through lookup/create.
        with connect_closing(board="nma-goal-units") as conn, write_txn(conn):
            row = conn.execute(
                "SELECT id FROM tasks WHERE idempotency_key=? ORDER BY created_at LIMIT 1",
                (identity,),
            ).fetchone()
            if row:
                return row[0]
            return create_task(
                conn,
                title=goal["title"],
                body=goal["objective"],
                created_by="ngertiin-gateway",
                tenant=self.store.owner,
                idempotency_key=identity,
                initial_status="blocked",
                workspace_kind="scratch",
                project_id="",
                board="nma-goal-units",
            )

    def prepare(
        self, conn, goal, parent_run, message_id, terminal_event, key, config, wake=None
    ):
        identity = str(
            uuid5(
                NAMESPACE_URL,
                canonical(
                    [
                        self.store.owner,
                        "continuation",
                        terminal_event,
                        goal["goal_id"],
                        goal["generation"],
                    ]
                ),
            )
        )
        run_id = str(uuid5(NAMESPACE_URL, self.store.owner + ":" + identity))
        text = (
            "Continue this persistent responsibility. Take the next concrete step and record "
            "continue, wait, block or evidence-based completion using responsibility. "
            "This is an internal continuation, not a new user instruction.\n"
            + canonical(
                {
                    "goal_id": goal["goal_id"],
                    "objective": goal["objective"],
                    "progress": goal["progress"],
                }
            )
        )
        if wake:
            text += "\nScheduled wake (data): " + canonical(wake)
            if wake["configuration"]["kind"] == "heartbeat":
                from hermes_cli.heartbeat import HeartbeatState

                text += (
                    "\n"
                    + HeartbeatState(
                        prompt=goal["objective"],
                        interval_seconds=wake["configuration"]["interval_seconds"],
                    ).render_prompt()
                )
        payload = {
            k: config[k]
            for k in ("agent_id", "thread_id", "config_revision", "context_generation")
        }
        body = command("runtime.submit", {**payload, "text": text}, identity)
        conn.execute(
            "INSERT OR IGNORE INTO nma_commands VALUES (?,?,?,?,NULL)",
            (self.store.owner, identity, digest(body), canonical(body)),
        )
        conn.execute(
            "INSERT OR IGNORE INTO nma_runtime_outbox VALUES (?,?,?,'pending',NULL)",
            (self.store.owner, identity, canonical(body)),
        )
        conn.execute(
            "INSERT OR IGNORE INTO nma_adapter_runs VALUES (?,?,?,?,NULL)",
            (self.store.owner, run_id, key, identity),
        )
        conn.execute(
            "INSERT OR IGNORE INTO nma_goal_units(owner_id,goal_id,generation,run_id,source_message_id,parent_run_id) VALUES (?,?,?,?,?,?)",
            (
                self.store.owner,
                goal["goal_id"],
                int(goal["generation"]),
                run_id,
                message_id,
                parent_run,
            ),
        )
        self.adapter.reliability.append(
            conn,
            run_id,
            config,
            "run.accepted",
            {
                "status": "queued",
                "goal": {"goal_id": goal["goal_id"]},
                "parent_run_id": parent_run,
                **({"trigger_id": wake["trigger_id"]} if wake else {}),
            },
        )

        return run_id

    def reconcile(self):
        self.adapter.reliability.reconcile()
        self.adapter.context.transcript.reconcile()
        rows = self.store.write(
            lambda conn: conn.execute(
                "SELECT u.goal_id,u.generation,u.run_id,u.source_message_id,u.verdict,u.parent_run_id,g.thread_id,g.responsible_agent_id FROM nma_goal_units u JOIN nma_goals g ON g.owner_id=u.owner_id AND g.goal_id=u.goal_id WHERE u.owner_id=? AND u.settled=0 ORDER BY u.rowid",
                (self.store.owner,),
            ).fetchall()
        )
        for row in rows:
            self.settle_unit(row)

    def settle_unit(self, row):
        (
            goal_id,
            generation,
            run_id,
            message_id,
            verdict,
            parent,
            thread_id,
            agent_id,
        ) = row

        def read(conn):
            goal = next(
                g
                for g in self.adapter.goals.listing(conn, thread_id, agent_id)
                if g["goal_id"] == goal_id
            )
            terminal = conn.execute(
                "SELECT event_id,payload FROM nma_events WHERE owner_id=? AND json_extract(payload,'$.run_id')=? AND json_extract(payload,'$.type') IN ('run.succeeded','run.failed','run.cancelled','run.indeterminate') ORDER BY sequence DESC LIMIT 1",
                (self.store.owner, run_id),
            ).fetchone()
            return goal, terminal

        active_discussion = self.store.write(
            lambda conn: conn.execute(
                "SELECT 1 FROM nma_discussion_turns t JOIN nma_discussions d USING(owner_id,discussion_id) WHERE t.owner_id=? AND t.run_id=? AND d.status='active'",
                (self.store.owner, run_id),
            ).fetchone()
        )
        if active_discussion:
            return
        goal, terminal = self.store.write(read)
        if not terminal:
            return
        status = json.loads(terminal[1])["payload"]["status"]
        key, config, binding_error = None, None, None
        if (
            status == "succeeded"
            and verdict == "continue"
            and goal["status"] == "active"
            and int(goal["generation"]) == generation
        ):
            try:
                thread = self.store.write(
                    lambda conn: self.adapter.threads.get(conn, thread_id)
                )
                agent = self.store.write(
                    lambda conn: self.adapter.agents.get(conn, agent_id)
                )
                key, config = self.adapter.binding(
                    {
                        "agent_id": agent_id,
                        "thread_id": thread_id,
                        "config_revision": agent["config_revision"],
                        "context_generation": thread["context_generation"],
                    }
                )
            except EngineError as exc:
                binding_error = exc.code

        def settle(conn):
            current = next(
                g
                for g in self.adapter.goals.listing(conn, thread_id, agent_id)
                if g["goal_id"] == goal_id
            )
            unit = conn.execute(
                "SELECT settled,verdict FROM nma_goal_units WHERE owner_id=? AND goal_id=? AND generation=? AND run_id=?",
                (self.store.owner, goal_id, generation, run_id),
            ).fetchone()
            if unit[0]:
                return
            if int(current["generation"]) == generation and current["status"] in {
                "active",
                "waiting",
                "blocked",
            }:
                cancelled = self.adapter.reliability.stopped(conn, run_id)
                reason = binding_error or (
                    "RUN_" + status.upper()
                    if status != "succeeded" or cancelled
                    else None
                )
                if reason is None and parent and unit[1] is None:
                    reason = "LIFECYCLE_DECISION_REQUIRED"
                if reason:
                    self.lifecycle.changed(conn, goal_id)
                    self.lifecycle.state(conn, goal_id, "blocked", reason)
                elif unit[1] == "continue" and current["status"] == "active" and config:
                    self.prepare(
                        conn, current, run_id, message_id, terminal[0], key, config
                    )
            conn.execute(
                "UPDATE nma_goal_units SET settled=1 WHERE owner_id=? AND goal_id=? AND generation=? AND run_id=?",
                (self.store.owner, goal_id, generation, run_id),
            )
            updated = next(
                g
                for g in self.adapter.goals.listing(conn, thread_id, agent_id)
                if g["goal_id"] == goal_id
            )
            raw = conn.execute(
                "SELECT b.config FROM nma_adapter_runs r JOIN nma_adapter_bindings b ON b.owner_id=r.owner_id AND b.binding_id=r.binding_id WHERE r.owner_id=? AND r.run_id=?",
                (self.store.owner, run_id),
            ).fetchone()[0]
            self.adapter.reliability.append(
                conn,
                run_id,
                json.loads(raw),
                "goal.changed",
                {"goal": updated, "source_message_id": message_id},
            )

        self.store.write(settle)

    async def tick(self):
        from gateway.session_authorities import owner_scope

        with owner_scope(self.adapter.authority):
            async with self.adapter.lock:
                await self.adapter.discussions.tick()
                self.reconcile()
                if time.monotonic() >= self.next_wake_poll:
                    from hermes_cli.heartbeat import POLL_SECONDS

                    from ngertiin_engine.wakes import Wakes

                    Wakes(self.store).prepare(self.adapter, self, time.time())
                    self.next_wake_poll = time.monotonic() + POLL_SECONDS
                from ngertiin_engine.webhooks import Webhooks

                Webhooks(self.adapter).prepare(self, time.time())
                await self.adapter.recover_run_stops(locked=True)
                rows = self.store.write(
                    lambda conn: conn.execute(
                        "SELECT c.body,u.run_id,u.goal_id,g.thread_id,g.responsible_agent_id,u.generation FROM nma_goal_units u JOIN nma_goals g ON g.owner_id=u.owner_id AND g.goal_id=u.goal_id JOIN nma_adapter_runs r ON r.owner_id=u.owner_id AND r.run_id=u.run_id JOIN nma_commands c ON c.owner_id=r.owner_id AND c.command_id=r.operation_id WHERE u.owner_id=? AND u.parent_run_id IS NOT NULL AND c.result IS NULL ORDER BY u.rowid",
                        (self.store.owner,),
                    ).fetchall()
                )
                for row in rows:
                    await self.deliver_unit(row)

    async def deliver_unit(self, row):
        raw, run_id, goal_id, thread_id, agent_id, generation = row
        goal = self.store.write(
            lambda conn: next(
                g
                for g in self.adapter.goals.listing(conn, thread_id, agent_id)
                if g["goal_id"] == goal_id
            )
        )
        if (
            goal["generation"] != str(generation)
            or goal["status"] != "active"
            or self.adapter.fenced(run_id)
        ):
            self.store.write(
                lambda conn: self.adapter.reliability.cancel_event(conn, run_id)
            )
        else:
            card = self.card(run_id, goal)
            self.store.write(
                lambda conn: conn.execute(
                    "UPDATE nma_goal_units SET native_card_id=? WHERE owner_id=? AND run_id=?",
                    (card, self.store.owner, run_id),
                )
            )
        body = json.loads(raw)
        try:
            await self.adapter._dispatch(body)
        except EngineError as exc:
            if exc.code in {"ENGINE_UNAVAILABLE", "AUTHORITY_LOST"}:
                raise
            self.store.finish(body, {"error_code": exc.code})
