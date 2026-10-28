"""Map ready structured peer units onto the existing Hermes admission outbox.

Native discussion bounds apply to informal conversation. Explicit task/review
receipts remain actionable after that envelope settles; no second dispatcher,
timer or model executor is created here.
"""

import json
from uuid import NAMESPACE_URL, uuid5

from ngertiin_engine.contracts import EngineError, canonical, digest
from ngertiin_engine.direct_messages import command


async def reconcile(adapter):
    store = adapter.store
    rows = store.write(
        lambda conn: conn.execute(
            "SELECT u.run_id,t.thread_id,b.config,u.task_id FROM nma_collaboration_units u JOIN nma_collaboration_tasks t USING(owner_id,task_id) JOIN nma_adapter_runs r USING(owner_id,run_id) JOIN nma_adapter_bindings b USING(owner_id,binding_id) WHERE u.owner_id=? AND u.settled=0 ORDER BY u.rowid",
            (store.owner,),
        ).fetchall()
    )
    for run, thread_id, raw_config, task_id in rows:
        state = adapter.reliability.snapshot(run)
        if state["status"] in {"queued", "running", "recovering"}:
            continue

        def settle(
            conn,
            run=run,
            thread_id=thread_id,
            raw_config=raw_config,
            task_id=task_id,
            state=state,
        ):
            config = json.loads(raw_config)
            adapter.collaboration.settle(conn, run, config, state["status"])
            task = adapter.collaboration.get(conn, thread_id, task_id)
            unit = conn.execute(
                "SELECT task_revision FROM nma_collaboration_units WHERE owner_id=? AND run_id=? AND settled=0",
                (store.owner, run),
            ).fetchone()
            if not unit:
                return
            if task["revision"] == str(unit[0]):
                task.update(
                    status="cancelled" if state["status"] == "cancelled" else "blocked",
                    resume_status=task["status"],
                    block_reason="The peer turn settled without a verified task transition.",
                )
                adapter.collaboration.save(conn, task, run, config)
            conn.execute(
                "UPDATE nma_collaboration_units SET settled=1 WHERE owner_id=? AND run_id=?",
                (store.owner, run),
            )

        store.write(settle)

    candidates = store.write(
        lambda conn: conn.execute(
            "SELECT t.task_id,t.thread_id,t.task,d.source_message_id,d.status FROM nma_collaboration_tasks t JOIN nma_discussions d USING(owner_id,discussion_id) WHERE t.owner_id=? AND d.status IN ('settled','bounded') AND json_extract(t.task,'$.status') IN ('pending','changes_requested','review') ORDER BY t.rowid",
            (store.owner,),
        ).fetchall()
    )
    for task_id, thread_id, raw_task, source, discussion_status in candidates:
        task = json.loads(raw_task)
        thread = adapter.threads.read({"thread_id": thread_id})
        if task["membership_revision"] != thread["membership_revision"]:
            continue
        assignee = next(
            (a for a in thread["agents"] if a["agent_id"] == task["assignee_agent_id"]),
            None,
        )
        if assignee is None:
            continue
        payload = {
            "agent_id": assignee["agent_id"],
            "thread_id": thread_id,
            "config_revision": assignee["config_revision"],
            "context_generation": thread["context_generation"],
        }
        try:
            binding, config = adapter.binding(payload)
        except EngineError:
            continue

        def prepare(
            conn,
            task_id=task_id,
            thread_id=thread_id,
            source=source,
            payload=payload,
            binding=binding,
            config=config,
        ):
            task = adapter.collaboration.get(conn, thread_id, task_id)
            if task["status"] not in {
                "pending",
                "changes_requested",
                "review",
            } or not adapter.collaboration.dependencies_ready(conn, task):
                return
            prior = conn.execute(
                "SELECT 1 FROM nma_collaboration_units WHERE owner_id=? AND task_id=? AND task_revision=?",
                (store.owner, task_id, int(task["revision"])),
            ).fetchone()
            if prior:
                return
            operation = str(
                uuid5(
                    NAMESPACE_URL,
                    canonical([store.owner, "peer-task", task_id, task["revision"]]),
                )
            )
            run = str(uuid5(NAMESPACE_URL, store.owner + ":" + operation))
            body = command(
                "runtime.submit",
                {
                    **payload,
                    "text": "Continue your explicitly assigned peer task. This is an internal task/review continuation, not a new user message. Use collaboration to submit the actual result or review; do not duplicate completed work.\n"
                    + adapter.collaboration.prompt(conn, thread_id, config["agent_id"]),
                },
                operation,
            )
            conn.execute(
                "INSERT INTO nma_commands VALUES (?,?,?,?,NULL)",
                (store.owner, operation, digest(body), canonical(body)),
            )
            conn.execute(
                "INSERT INTO nma_runtime_outbox VALUES (?,?,?,'pending',NULL)",
                (store.owner, operation, canonical(body)),
            )
            conn.execute(
                "INSERT INTO nma_adapter_runs VALUES (?,?,?,?,NULL)",
                (store.owner, run, binding, operation),
            )
            conn.execute(
                "INSERT INTO nma_collaboration_units VALUES (?,?,?,?,?,0)",
                (store.owner, task_id, int(task["revision"]), run, source),
            )
            for goal_id, generation in conn.execute(
                "SELECT goal_id,generation FROM nma_discussion_goals WHERE owner_id=? AND discussion_id=?",
                (store.owner, task["discussion_id"]),
            ).fetchall():
                conn.execute(
                    "INSERT OR IGNORE INTO nma_goal_units(owner_id,goal_id,generation,run_id,source_message_id,settled) VALUES (?,?,?,?,?,1)",
                    (store.owner, goal_id, generation, run, source),
                )
            adapter.reliability.append(
                conn,
                run,
                config,
                "run.accepted",
                {"status": "queued", "task_id": task_id},
            )

        store.write(prepare)

    pending = store.write(
        lambda conn: conn.execute(
            "SELECT c.body,u.run_id,d.status FROM nma_collaboration_units u JOIN nma_collaboration_tasks t USING(owner_id,task_id) JOIN nma_discussions d USING(owner_id,discussion_id) JOIN nma_adapter_runs r ON r.owner_id=u.owner_id AND r.run_id=u.run_id JOIN nma_commands c ON c.owner_id=r.owner_id AND c.command_id=r.operation_id JOIN nma_runtime_outbox o ON o.owner_id=c.owner_id AND o.operation_id=c.command_id WHERE u.owner_id=? AND o.state='pending'",
            (store.owner,),
        ).fetchall()
    )
    for raw, run, status in pending:
        if status == "cancelled":
            store.write(
                lambda conn, run=run: adapter.reliability.cancel_event(conn, run)
            )
        try:
            await adapter._dispatch(json.loads(raw))
        except EngineError as error:
            if error.code in {"ENGINE_UNAVAILABLE", "AUTHORITY_LOST"}:
                raise
            store.finish(json.loads(raw), {"error_code": error.code})
