"""Reconcile failed delivery without replaying an unconfirmed effect."""

from ngertiin.chat.store import one
from ngertiin.tasks import budget, store


async def reconcile_deliveries():
    async with store.transaction() as conn:
        rows = await (
            await conn.execute(
                "SELECT t.id,t.owner_id FROM background_tasks t JOIN "
                "procrastinate_jobs j ON j.id=t.job_id "
                "WHERE t.status IN ('queued','running') AND "
                "t.stage<>'preparing_inputs' AND j.status::text "
                "IN ('failed','aborted','succeeded') LIMIT 50"
            )
        ).fetchall()
    for row in rows:
        async with store.locked(row["owner_id"], row["id"]) as (conn, task):
            job = await one(
                conn, "SELECT status::text FROM procrastinate_jobs WHERE id=%s", (task["job_id"],)
            )
            if task["status"] not in ("queued", "running") or job["status"] not in (
                "failed",
                "aborted",
                "succeeded",
            ):
                continue
            await budget.abandon_calls(conn, task)
            await store.finish_execution(conn, task, "interrupted")
            if task.get("runtime_kind") == "browser":
                workspace = await one(
                    conn,
                    "SELECT id FROM browser_workspaces "
                    "WHERE active_task_id=%s AND state<>'deleted'",
                    (task["id"],),
                )
                if workspace:
                    from ngertiin.computer.jobs import cleanup_task

                    await store.change(
                        conn,
                        task,
                        status="waiting_user",
                        stage="computer_unknown",
                        lease_token=None,
                        error="Worker browser terputus; outcome diperiksa sebelum retry.",
                    )
                    await cleanup_task.configure(connection=conn).defer_async(
                        task_id=str(task["id"]), owner_id=str(task["owner_id"])
                    )
                    await store.emit(conn, task)
                    continue
            action = await one(
                conn,
                "SELECT * FROM task_actions WHERE task_id=%s AND revision=%s",
                (task["id"], task["revision"]),
            )
            if action and action["status"] == "executing":
                await conn.execute(
                    "UPDATE task_actions SET status='unknown' WHERE id=%s", (action["id"],)
                )
                await store.change(
                    conn,
                    task,
                    status="waiting_user",
                    stage="unknown",
                    lease_token=None,
                    error="Publikasi belum terkonfirmasi. Periksa outcome sebelum mencoba lagi.",
                )
            elif task["attempt"] >= 12 or task["usage_units"] >= task["budget_cap"]:
                await store.change(
                    conn,
                    task,
                    status="failed",
                    stage="failed",
                    lease_token=None,
                    error="Pemulihan mencapai batas task. Draft dan usage tetap tersimpan.",
                )
            else:
                await store.change(conn, task, status="queued", lease_token=None)
                await store.enqueue(conn, task)
            await store.emit(conn, task)
    await expire_proposals()


async def expire_proposals():
    async with store.transaction() as conn:
        expired = await (
            await conn.execute(
                "SELECT t.id,t.owner_id FROM background_tasks t JOIN task_actions a "
                "ON a.task_id=t.id AND a.revision=t.revision "
                "WHERE t.status='waiting_user' AND a.status='proposed' "
                "AND a.expires_at<=now() LIMIT 50"
            )
        ).fetchall()
    for row in expired:
        async with store.locked(row["owner_id"], row["id"]) as (conn, task):
            if task["status"] != "waiting_user":
                continue
            expired_action = await one(
                conn,
                "UPDATE task_actions SET status='expired' WHERE task_id=%s "
                "AND revision=%s AND status='proposed' AND expires_at<=now() RETURNING id",
                (task["id"], task["revision"]),
            )
            if not expired_action:
                continue
            await store.change(
                conn,
                task,
                status="failed",
                stage="expired",
                lease_token=None,
                resume=None,
                error="Proposal kedaluwarsa. Simpan versi draft baru untuk review ulang.",
            )
            await store.emit(conn, task)
