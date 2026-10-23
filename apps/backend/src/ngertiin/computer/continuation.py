"""Checkpoint operational progress and yield only at confirmed effect boundaries."""

from datetime import UTC, datetime
from random import randint

from ngertiin.chat.store import json_value, one
from ngertiin.computer.contracts import ComputerPaused
from ngertiin.tasks import budget, store


async def update(execution, **values):
    async with store.locked(execution["owner_id"], execution["id"]) as (conn, task):
        store.fence(task, execution)
        state = {**task.get("runtime_state", {}), **values}
        await store.change(conn, task, runtime_state=json_value(state))
        execution["runtime_state"] = state
        await store.emit(conn, task)


async def correction(execution, message):
    state = execution.get("runtime_state", {})
    count = state.get("corrections", 0) + 1
    if count > 2:
        raise ValueError("Keputusan/hasil belum valid setelah dua perbaikan. " + message)
    await update(execution, corrections=count, feedback=message[:600], reason="correcting_output")
    await store.progress(execution, "computer_correcting")


async def checkpoint(execution, description):
    state = execution.get("runtime_state", {})
    await update(
        execution,
        completed_steps=state.get("completed_steps", 0) + 1,
        progress=[*state.get("progress", []), description[:300]][-20:],
        reason="working",
    )


async def requeue(conn, task, reason):
    state = {**task.get("runtime_state", {})}
    state.update(reason=reason, yields=state.get("yields", 0) + 1)
    # Scheduled continuation is not a failed retry. Still finite through the
    # absolute session deadline, model calls, steps and work budget.
    await budget.abandon_calls(conn, task)
    await store.finish_execution(conn, task, "interrupted")
    await store.change(
        conn,
        task,
        status="queued",
        stage="computer_continuing",
        lease_token=None,
        runtime_state=json_value(state),
        error=None,
    )
    delay = (
        min(30, 2 ** max(state.get("corrections", 0), state.get("recovery_attempts", 0)))
        + randint(0, 2)
        if reason == "provider_retry"
        else 0
    )
    await store.enqueue(conn, task, delay_seconds=delay)
    await store.emit(conn, task)


async def yield_execution(execution, reason="attempt_yielded"):
    async with store.locked(execution["owner_id"], execution["id"]) as (conn, task):
        store.fence(task, execution)
        await requeue(conn, task, reason)
    raise ComputerPaused()


async def recover(conn, task, reason):
    """Used after the old job/lease is revoked, never from an unfenced raw retry."""
    workspace = await one(
        conn,
        "SELECT * FROM browser_workspaces WHERE active_task_id=%s AND state<>'deleted' FOR UPDATE",
        (task["id"],),
    )
    if not workspace:
        return False
    uncertain = await one(
        conn,
        "SELECT id FROM computer_steps WHERE task_id=%s AND kind<>'observe' "
        "AND state IN ('dispatched','unknown') LIMIT 1",
        (task["id"],),
    )
    if (
        workspace["state"] == "ready"
        and workspace["control"] == "agent"
        and not workspace["unknown_effect"]
        and not uncertain
        and workspace["deadline"] > datetime.now(UTC)
        and (
            budget.metered_browser(task["budget_policy"])
            or task["usage_units"] < task["budget_cap"]
        )
    ):
        await conn.execute(
            "UPDATE computer_steps SET state='stale',finished_at=now() "
            "WHERE task_id=%s AND kind='observe' AND state='observing'",
            (task["id"],),
        )
        await conn.execute(
            "UPDATE browser_workspaces SET busy=NULL WHERE id=%s",
            (workspace["id"],),
        )
        await requeue(conn, task, reason)
        return True
    return False
