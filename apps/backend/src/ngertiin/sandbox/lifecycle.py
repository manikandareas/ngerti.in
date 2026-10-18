"""Reconcile resources after cancellation/crash without replaying code or create."""

from datetime import UTC, datetime, timedelta
from uuid import UUID

from ngertiin.sandbox import policy, store
from ngertiin.sandbox.contracts import RuntimePending, SandboxRuntime
from ngertiin.tasks import store as tasks


async def cleanup(session, runtime: SandboxRuntime | None = None):
    runtime = runtime or policy.get_runtime(session["provider"])
    await store.resource_state(session, "deleting")
    try:
        # A timed-out create can arrive after an initial 404. Keep its reservation
        # until the absolute provider TTL plus cleanup margin has elapsed.
        if session["resource_id"] is None and session["state"] != "reserved":
            observation = await runtime.inspect(session["resource_name"])
            safe_after = session["deadline"] + timedelta(
                seconds=session["policy"]["cleanup_margin_seconds"]
            )
            if observation.state == "absent" and datetime.now(UTC) < safe_after:
                raise RuntimePending("Provisioning belum pasti; menunggu konfirmasi resource/TTL.")
        if not await runtime.delete(session["resource_name"]):
            raise RuntimePending("Penghentian resource belum terkonfirmasi.")
        await store.deleted(session)
        return True
    except Exception:
        await store.resource_state(
            session, "unknown", "Cleanup belum terkonfirmasi; reservasi tetap dihitung."
        )
        return False


async def for_task(owner, task_id, runtime: SandboxRuntime | None = None):
    async with tasks.locked(owner, task_id) as (conn, task):
        rows = await store.summary(conn, task)
        sessions = await (
            await conn.execute(
                "SELECT * FROM sandbox_sessions WHERE task_id=%s AND owner_id=%s "
                "AND state<>'deleted'",
                (task_id, owner),
            )
        ).fetchall()
    confirmed = True
    for session in sessions:
        confirmed = await cleanup(session, runtime) and confirmed
    if rows:
        async with tasks.locked(owner, task_id) as (conn, task):
            await tasks.emit(conn, task)
    return confirmed


async def reconcile(owner: UUID, task_id: UUID):
    async with tasks.locked(owner, task_id) as (conn, task):
        if task["stage"] != "sandbox_unknown":
            from fastapi import HTTPException

            raise HTTPException(409, "Tidak ada resource task yang perlu direkonsiliasi.")
    if not await for_task(owner, task_id):
        return await tasks.detail(owner, task_id)
    async with tasks.locked(owner, task_id) as (conn, task):
        if task["status"] == "waiting_user" and task["stage"] == "sandbox_unknown":
            await tasks.change(
                conn,
                task,
                status="failed",
                stage="failed",
                error="Resource sudah dibersihkan. Kamu dapat mencoba lagi dalam sisa budget.",
            )
            await tasks.emit(conn, task)
        elif task["status"] == "cancelled" and task["stage"] == "sandbox_unknown":
            await tasks.change(conn, task, stage="cancelled", error=None)
            await tasks.emit(conn, task)
        return await tasks.view(conn, task)


async def sweep():
    from ngertiin.sandbox.cleanup import candidates

    async with tasks.transaction() as conn:
        sessions = await (
            await conn.execute(
                "SELECT s.* FROM sandbox_sessions s JOIN background_tasks t ON t.id=s.task_id "
                "JOIN task_executions e ON e.id=s.execution_id WHERE s.state<>'deleted' AND "
                "(s.deadline<=now() OR s.state IN ('deleting','unknown') OR "
                "t.status<>'running' OR e.lease_token IS DISTINCT FROM t.lease_token) "
                "ORDER BY s.created_at LIMIT 50"
            )
        ).fetchall()
    for session in sessions:
        await cleanup(session)
        async with tasks.locked(session["owner_id"], session["task_id"]) as (conn, task):
            await tasks.emit(conn, task)
    await candidates()


async def pending(execution, message):
    async with tasks.locked(execution["owner_id"], execution["id"]) as (conn, task):
        tasks.fence(task, execution)
        await tasks.finish_execution(conn, task, "interrupted")
        await tasks.change(
            conn,
            task,
            status="waiting_user",
            stage="sandbox_unknown",
            lease_token=None,
            error=message,
        )
        await tasks.emit(conn, task)
