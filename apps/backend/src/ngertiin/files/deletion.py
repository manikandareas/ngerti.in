"""Revoke access before asynchronous physical cleanup; preserve derived results."""

from fastapi import HTTPException

from ngertiin.async_db import transaction
from ngertiin.chat.store import lock_account, one
from ngertiin.tasks import store as tasks


async def fail_dependents(owner, revision_ids):
    async with transaction() as conn:
        rows = await (
            await conn.execute(
                "SELECT DISTINCT t.id FROM background_tasks t JOIN "
                "task_file_inputs i ON i.task_id=t.id "
                "WHERE t.owner_id=%s AND i.revision_id=ANY(%s) "
                "AND t.status IN ('queued','running','waiting_user')",
                (owner, revision_ids),
            )
        ).fetchall()
    for row in rows:
        async with tasks.locked(owner, row["id"]) as (conn, task):
            if task["status"] not in ("queued", "running", "waiting_user"):
                continue
            await tasks.finish_execution(conn, task, "failed")
            await conn.execute(
                "UPDATE task_actions SET status='cancelled' WHERE task_id=%s "
                "AND status IN ('proposed','approved','executing')",
                (task["id"],),
            )
            await tasks.change(
                conn,
                task,
                status="failed",
                stage="input_deleted",
                lease_token=None,
                error="File input telah dihapus. Task tidak memakai revision pengganti.",
            )
            await tasks.emit(conn, task)


async def file(owner, file_id):
    async with transaction() as conn:
        await lock_account(conn, owner)
        row = await one(
            conn, "SELECT * FROM product_files WHERE id=%s AND owner_id=%s", (file_id, owner)
        )
        if not row:
            raise HTTPException(404, "File tidak ditemukan.")
        await conn.execute(
            "UPDATE product_files SET deleted_at=COALESCE(deleted_at,now()) WHERE id=%s", (file_id,)
        )
        revisions = await (
            await conn.execute(
                "UPDATE file_revisions SET status='deleted' WHERE file_id=%s RETURNING id",
                (file_id,),
            )
        ).fetchall()
    await fail_dependents(owner, [row["id"] for row in revisions])


async def result(owner, result_id):
    async with transaction() as conn:
        await lock_account(conn, owner)
        row = await one(
            conn, "SELECT * FROM product_results WHERE id=%s AND owner_id=%s", (result_id, owner)
        )
        if not row:
            raise HTTPException(404, "Hasil tidak ditemukan.")
        await conn.execute(
            "UPDATE product_results SET deleted_at=COALESCE(deleted_at,now()) WHERE id=%s",
            (result_id,),
        )
        versions = await (
            await conn.execute(
                "SELECT manifest FROM result_revisions WHERE result_id=%s", (result_id,)
            )
        ).fetchall()
        file_ids = {f["file_id"] for version in versions for f in version["manifest"]["files"]}
        from uuid import UUID

        ids = [UUID(value) for value in file_ids]
        await conn.execute(
            "UPDATE product_files SET deleted_at=COALESCE(deleted_at,now()) WHERE id=ANY(%s)",
            (ids,),
        )
        revoked = await (
            await conn.execute(
                "UPDATE file_revisions SET status='deleted' WHERE file_id=ANY(%s) RETURNING id",
                (ids,),
            )
        ).fetchall()

    from ngertiin.tasks.commands import cancel

    if row["active_task_id"]:
        await cancel(owner, row["active_task_id"])
    await fail_dependents(owner, [value["id"] for value in revoked])
