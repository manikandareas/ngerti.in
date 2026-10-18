"""Queue attempts drive checkpoints without holding a worker during human review."""

import asyncio
from contextlib import suppress
from uuid import UUID

import psycopg
import structlog
from langgraph.types import Command
from psycopg.rows import dict_row

from ngertiin.chat.store import one
from ngertiin.config import get_settings
from ngertiin.sandbox.contracts import RuntimePending
from ngertiin.tasks import budget, store, workflow
from ngertiin.tasks.checkpoints import TaskSaver

logger = structlog.get_logger()


async def execute(execution: dict):
    from ngertiin.files.inputs import prepare

    if not await prepare(execution):
        return
    settings = get_settings()
    config = {
        "configurable": {"thread_id": f"task:{execution['id']}:r{execution['revision']}"},
        "recursion_limit": 12,
    }
    async with await psycopg.AsyncConnection.connect(
        settings.database_url.get_secret_value(),
        autocommit=True,
        prepare_threshold=0,
        row_factory=dict_row,
    ) as connection:
        graph = workflow.build(execution, TaskSaver(connection, execution))
        saved = await graph.aget_state(config)
        resume = execution["resume"]
        if saved.interrupts and not resume:
            async with store.transaction() as conn:
                action = await one(
                    conn,
                    "SELECT id FROM task_actions WHERE task_id=%s AND "
                    "revision=%s AND status='approved'",
                    (execution["id"], execution["revision"]),
                )
            if action:
                resume = {"action_id": str(action["id"])}
        value = (
            Command(resume=resume)
            if saved.interrupts and resume
            else (None if saved.values else await store.initial_graph_input(execution))
        )
        output = await graph.ainvoke(value, config, durability="sync")
        saved = await graph.aget_state(config)
        if saved.interrupts:
            async with store.locked(execution["owner_id"], execution["id"]) as (conn, task):
                store.fence(task, execution)
                await store.release_waiting(conn, task)
        else:
            # Final publication follows the final checkpoint, so changing the
            # task to terminal does not race a subsequent checkpoint write.
            await workflow.finalize(execution, output)


async def watch(execution: dict, running: asyncio.Task):
    while not running.done():
        await asyncio.sleep(0.5)
        async with store.transaction() as conn:
            row = await one(
                conn,
                "SELECT id FROM background_tasks WHERE id=%s AND "
                "lease_token=%s AND status='running'",
                (execution["id"], execution["lease_token"]),
            )
        if not row:
            running.cancel()
            return


async def run_task(task_id: str):
    execution = await store.claim(UUID(task_id))
    if not execution:
        return
    running = asyncio.create_task(execute(execution))
    watcher = asyncio.create_task(watch(execution, running))
    try:
        async with asyncio.timeout(execution["budget_policy"]["timeout_seconds"]):
            await running
    except store.StaleExecution:
        pass
    except RuntimePending as error:
        from ngertiin.sandbox.lifecycle import pending

        with suppress(store.StaleExecution):
            await pending(execution, str(error))
    except asyncio.CancelledError:
        # A graceful worker shutdown fences this attempt and leaves recovery to
        # the durable job/domain reconciler. A user stop already revoked it.
        async with store.locked(execution["owner_id"], execution["id"]) as (conn, task):
            if task["lease_token"] == execution["lease_token"] and task["status"] == "running":
                await budget.abandon_calls(conn, task)
                await store.finish_execution(conn, task, "interrupted")
                await store.change(conn, task, status="queued", lease_token=None)
                await store.emit(conn, task)
                raise
    except Exception as error:
        logger.warning("task.failed", task_id=task_id, error_type=type(error).__name__)
        message = (
            str(error)
            if isinstance(error, ValueError)
            else "Pekerjaan terhenti. Draft tetap tersimpan; kamu dapat mencoba lagi."
        )
        with suppress(store.StaleExecution):
            await store.fail(execution, message)
    finally:
        running.cancel()
        watcher.cancel()
        await asyncio.gather(running, watcher, return_exceptions=True)
