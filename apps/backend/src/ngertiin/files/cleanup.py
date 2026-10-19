"""Idempotent physical deletion and conservative recovery for extraction jobs."""

import asyncio

from ngertiin.async_db import transaction
from ngertiin.chat.store import lock_account, one
from ngertiin.files import inputs
from ngertiin.storage import delete_object


async def reconcile():
    async with transaction() as conn:
        rows = await (
            await conn.execute(
                "SELECT e.id,e.owner_id FROM file_extractions e LEFT JOIN procrastinate_jobs j "
                "ON j.id=e.job_id WHERE e.status IN ('running','queued') "
                "AND (j.status::text IN ('failed','aborted','succeeded') OR j.id IS NULL) LIMIT 50"
            )
        ).fetchall()
    for row in rows:
        async with transaction() as conn:
            await lock_account(conn, row["owner_id"])
            await conn.execute(
                "UPDATE file_extractions SET status=CASE WHEN reserved_pages>0 THEN 'unknown' "
                "ELSE 'failed' END,error=%s,lease_token=NULL,finished_at=now() "
                "WHERE id=%s AND status IN ('running','queued')",
                ("Ekstraksi terputus. Outcome/biaya tidak diulang otomatis.", row["id"]),
            )
        await inputs.wake(row["owner_id"])


async def cleanup():
    async with transaction() as conn:
        candidates = await (
            await conn.execute(
                "SELECT r.id,r.owner_id,r.object_key FROM file_revisions r WHERE "
                "r.purged_at IS NULL "
                "AND (r.status='deleted' OR (r.created_at<now()-interval '24 hours' "
                "AND r.source='upload' AND NOT EXISTS "
                "(SELECT 1 FROM task_file_inputs i WHERE i.revision_id=r.id))) LIMIT 100"
            )
        ).fetchall()
    for row in candidates:
        async with transaction() as conn:
            await lock_account(conn, row["owner_id"])
            current = await one(
                conn,
                "SELECT r.* FROM file_revisions r WHERE id=%s AND purged_at IS NULL "
                "AND (status='deleted' OR (created_at<now()-interval '24 hours' "
                "AND source='upload' "
                "AND NOT EXISTS (SELECT 1 FROM task_file_inputs i WHERE "
                "i.revision_id=r.id))) FOR UPDATE",
                (row["id"],),
            )
            if not current:
                continue
            await conn.execute(
                "UPDATE file_revisions SET status='deleted',search_text='' WHERE id=%s",
                (row["id"],),
            )
            await conn.execute(
                "UPDATE product_files f SET deleted_at=COALESCE(deleted_at,now()) WHERE id=%s "
                "AND NOT EXISTS (SELECT 1 FROM file_revisions r WHERE r.file_id=f.id "
                "AND r.status<>'deleted')",
                (current["file_id"],),
            )
        await asyncio.to_thread(delete_object, row["object_key"])
        async with transaction() as conn:
            await conn.execute(
                "UPDATE file_revisions SET purged_at=now() WHERE id=%s", (row["id"],)
            )
    async with transaction() as conn:
        extractions = await (
            await conn.execute(
                "SELECT e.id,e.object_key FROM file_extractions e JOIN file_revisions r "
                "ON r.id=e.revision_id WHERE r.status='deleted' AND e.purged_at IS NULL LIMIT 100"
            )
        ).fetchall()
    for row in extractions:
        if row["object_key"]:
            await asyncio.to_thread(delete_object, row["object_key"])
        async with transaction() as conn:
            await conn.execute(
                "UPDATE file_extractions SET purged_at=now(),"
                "object_key=NULL,status='failed',error='Input dihapus',lease_token=NULL "
                "WHERE id=%s",
                (row["id"],),
            )
    await reconcile()
