"""Park product responsibilities on authorized native process completion receipts."""

import json
from uuid import NAMESPACE_URL, uuid5

from ngertiin_engine.contracts import EngineError, counter, digest

DDL = (
    "CREATE TABLE nma_goal_process_waits (owner_id TEXT NOT NULL, goal_id TEXT NOT NULL, generation INTEGER NOT NULL, scope_key TEXT NOT NULL, handle TEXT NOT NULL, source_message_id TEXT NOT NULL, source_run_id TEXT NOT NULL, state TEXT NOT NULL, PRIMARY KEY(owner_id,goal_id,generation), FOREIGN KEY(owner_id,goal_id) REFERENCES nma_goals(owner_id,goal_id))",
)


def park(store, conn, goal, run, message, args):
    from ngertiin_engine.goal_lifecycle import Lifecycle

    if set(args) != {
        "action",
        "goal_id",
        "expected_revision",
        "process_handle",
    } or not isinstance(args["process_handle"], str):
        raise EngineError("INVALID_REQUEST")
    if counter(args["expected_revision"]) != goal["revision"]:
        raise EngineError("REVISION_CONFLICT")
    if goal["status"] not in {"active", "waiting", "blocked"}:
        raise EngineError("GOAL_STOPPED")
    row = conn.execute(
        "SELECT e.scope_key FROM nma_native_job_events e JOIN nma_adapter_runs r ON r.owner_id=e.owner_id AND r.native_admission_id=json_extract(e.receipt,'$.native_admission_id') JOIN nma_goal_units u USING(owner_id,run_id) WHERE e.owner_id=? AND e.handle=? AND u.goal_id=? AND u.generation=? ORDER BY e.rowid DESC LIMIT 1",
        (store.owner, args["process_handle"], goal["goal_id"], int(goal["generation"])),
    ).fetchone()
    if not row:
        raise EngineError("PROCESS_NOT_FOUND")
    conn.execute(
        "INSERT INTO nma_goal_process_waits VALUES (?,?,?,?,?,?,?,'waiting') ON CONFLICT(owner_id,goal_id,generation) DO UPDATE SET scope_key=excluded.scope_key,handle=excluded.handle,source_message_id=excluded.source_message_id,source_run_id=excluded.source_run_id,state='waiting'",
        (
            store.owner,
            goal["goal_id"],
            int(goal["generation"]),
            row[0],
            args["process_handle"],
            message,
            run,
        ),
    )
    lifecycle = Lifecycle(store)
    lifecycle.link(conn, goal, run, message, "wait")
    lifecycle.changed(conn, goal["goal_id"])
    lifecycle.state(
        conn,
        goal["goal_id"],
        "waiting",
        goal["progress"],
        "Native process " + args["process_handle"],
    )
    return True


def prepare(adapter, bridge):
    from ngertiin_engine.goal_commands import GoalCommands
    from ngertiin_engine.wakes import Wakes

    store = adapter.store
    rows = store.write(
        lambda c: c.execute(
            "SELECT goal_id,generation,scope_key,handle,source_message_id,source_run_id FROM nma_goal_process_waits WHERE owner_id=? AND state='waiting'",
            (store.owner,),
        ).fetchall()
    )
    for goal_id, generation, scope, handle, message, parent in rows:
        goal = store.write(
            lambda c, goal_id=goal_id: GoalCommands(adapter).get(c, goal_id)
        )
        if goal["generation"] != str(generation) or goal["status"] != "waiting":
            store.write(
                lambda c, goal_id=goal_id, generation=generation: c.execute(
                    "UPDATE nma_goal_process_waits SET state='cancelled' WHERE owner_id=? AND goal_id=? AND generation=?",
                    (store.owner, goal_id, generation),
                )
            )
            continue
        receipt = store.write(
            lambda c, scope=scope, handle=handle: c.execute(
                "SELECT state,receipt FROM nma_native_job_events WHERE owner_id=? AND scope_key=? AND handle=? AND state!='running' ORDER BY rowid DESC LIMIT 1",
                (store.owner, scope, handle),
            ).fetchone()
        )
        if not receipt or store.write(
            lambda c, goal=goal: Wakes(store).busy(c, goal["thread_id"])
        ):
            continue
        thread = store.write(
            lambda c, goal=goal: adapter.threads.get(c, goal["thread_id"])
        )
        agent = store.write(
            lambda c, goal=goal: adapter.agents.get(c, goal["responsible_agent_id"])
        )
        try:
            key, config = adapter.binding(
                {
                    "thread_id": goal["thread_id"],
                    "agent_id": goal["responsible_agent_id"],
                    "config_revision": agent["config_revision"],
                    "context_generation": thread["context_generation"],
                }
            )
            from ngertiin_engine.automation import continuation_binding

            key, config = continuation_binding(adapter, key, config, parent)
        except EngineError as exc:
            if exc.code in {"AUTHORITY_LOST", "ENGINE_UNAVAILABLE"}:
                raise

            def blocked(
                conn, goal=goal, parent=parent, generation=generation, reason=exc.code
            ):
                current = GoalCommands(adapter).get(conn, goal["goal_id"])
                if (
                    current["generation"] != str(generation)
                    or current["status"] != "waiting"
                ):
                    return
                conn.execute(
                    "UPDATE nma_goal_process_waits SET state='blocked' WHERE owner_id=? AND goal_id=? AND generation=?",
                    (store.owner, goal["goal_id"], generation),
                )
                bridge.lifecycle.changed(conn, goal["goal_id"])
                bridge.lifecycle.state(conn, goal["goal_id"], "blocked", reason)
                previous = conn.execute(
                    "SELECT b.config FROM nma_adapter_runs r JOIN nma_adapter_bindings b USING(owner_id,binding_id) WHERE r.owner_id=? AND r.run_id=?",
                    (store.owner, parent),
                ).fetchone()
                adapter.reliability.append(
                    conn,
                    parent,
                    json.loads(previous[0]),
                    "goal.changed",
                    {"goal": GoalCommands(adapter).get(conn, goal["goal_id"])},
                )

            store.write(blocked)
            continue

        def settle(
            conn,
            goal=goal,
            receipt=receipt,
            key=key,
            config=config,
            generation=generation,
            scope=scope,
            handle=handle,
            message=message,
            parent=parent,
        ):
            current = GoalCommands(adapter).get(conn, goal["goal_id"])
            row = conn.execute(
                "SELECT state FROM nma_goal_process_waits WHERE owner_id=? AND goal_id=? AND generation=?",
                (store.owner, goal["goal_id"], generation),
            ).fetchone()
            if (
                current["generation"] != str(generation)
                or current["status"] != "waiting"
                or not row
                or row[0] != "waiting"
                or Wakes(store).busy(conn, current["thread_id"])
            ):
                return
            conn.execute(
                "UPDATE nma_goal_process_waits SET state='settled' WHERE owner_id=? AND goal_id=? AND generation=?",
                (store.owner, goal["goal_id"], generation),
            )
            bridge.lifecycle.changed(conn, goal["goal_id"])

            def changed():
                adapter.reliability.append(
                    conn,
                    parent,
                    config,
                    "goal.changed",
                    {
                        "goal": GoalCommands(adapter).get(conn, goal["goal_id"]),
                        "source_message_id": message,
                    },
                )

            if receipt[0] not in {"completed", "exited"}:
                bridge.lifecycle.state(
                    conn, goal["goal_id"], "blocked", "Native process " + receipt[0]
                )
                changed()
                return
            bridge.lifecycle.state(
                conn, goal["goal_id"], "active", "Native process completed"
            )
            event = str(
                uuid5(
                    NAMESPACE_URL,
                    digest([store.owner, goal["goal_id"], generation, scope, handle]),
                )
            )
            bridge.prepare(
                conn,
                current,
                parent,
                message,
                event,
                key,
                config,
                {
                    "trigger_id": event,
                    "configuration": {
                        "kind": "process",
                        "receipt": json.loads(receipt[1]),
                    },
                },
            )
            changed()

        store.write(settle)
