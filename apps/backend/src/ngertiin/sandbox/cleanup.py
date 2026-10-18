"""Sweep orphan candidates and revoke/purge deleted result copies without losing costs."""

import asyncio
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from mypy_boto3_s3.type_defs import ObjectIdentifierTypeDef

from ngertiin.chat.store import one
from ngertiin.storage import s3_client
from ngertiin.tasks import store


def purge(prefix, keep):
    client = s3_client()
    from ngertiin.config import get_settings

    bucket = get_settings().s3_bucket
    for page in client.get_paginator("list_objects_v2").paginate(Bucket=bucket, Prefix=prefix):
        keys: list[ObjectIdentifierTypeDef] = [
            {"Key": row["Key"]} for row in page.get("Contents", []) if row["Key"] not in keep
        ]
        if keys:
            client.delete_objects(Bucket=bucket, Delete={"Objects": keys})


async def candidates():
    async with store.transaction() as conn:
        sessions = await (
            await conn.execute(
                "SELECT s.*,r.deleted_at AS result_deleted,t.status AS task_status "
                "FROM sandbox_sessions s JOIN background_tasks t ON t.id=s.task_id "
                "LEFT JOIN product_results r ON r.id=t.result_id WHERE s.state='deleted' "
                "ORDER BY COALESCE((s.usage->>'gc_checked_at')::timestamptz,s.created_at) LIMIT 50"
            )
        ).fetchall()
    for session in sessions:
        async with store.locked(session["owner_id"], session["task_id"]) as (conn, task):
            expired = await one(
                conn,
                "SELECT %s::timestamptz<now()-interval '7 days' AS expired",
                (session["created_at"],),
            )
            remove = bool(session["result_deleted"]) or (
                task["status"] in ("failed", "cancelled") and expired["expired"]
            )
            if remove:
                await conn.execute(
                    "UPDATE sandbox_outputs SET purged_at=now() WHERE session_id=%s "
                    "AND purged_at IS NULL",
                    (session["id"],),
                )
            rows = await (
                await conn.execute(
                    "SELECT object_key FROM sandbox_outputs WHERE session_id=%s "
                    "AND purged_at IS NULL",
                    (session["id"],),
                )
            ).fetchall()
        prefix = f"accounts/{session['owner_id']}/sandbox/{session['id']}/"
        await asyncio.to_thread(purge, prefix, {row["object_key"] for row in rows})
        async with store.transaction() as conn:
            await conn.execute(
                "UPDATE sandbox_sessions SET usage=usage || "
                "jsonb_build_object('gc_checked_at',now()) WHERE id=%s",
                (session["id"],),
            )
