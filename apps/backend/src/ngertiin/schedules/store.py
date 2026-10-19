"""Owner-scoped schedule projections keep definitions separate from Task outcomes."""

from fastapi import HTTPException

from ngertiin.async_db import transaction
from ngertiin.chat.store import one


async def owned(conn, owner, schedule_id, *, lock=False):
    row = await one(
        conn,
        "SELECT * FROM user_schedules WHERE id=%s AND owner_id=%s"
        + (" FOR UPDATE" if lock else ""),
        (schedule_id, owner),
    )
    if not row:
        raise HTTPException(404, "Jadwal tidak ditemukan.")
    return row


async def history(conn, owner, schedule_id=None):
    return await (
        await conn.execute(
            "SELECT o.*,s.spec->>'title' AS title,s.thread_id,t.status AS task_status,"
            "t.stage,t.error,t.result_id,t.usage_units,t.budget_cap,d.message_id,"
            "CASE WHEN t.status IS NOT NULL THEN t.status ELSE o.status END AS outcome "
            "FROM schedule_occurrences o JOIN user_schedules s ON s.id=o.schedule_id "
            "LEFT JOIN background_tasks t ON t.id=o.task_id "
            "LEFT JOIN task_deliveries d ON d.task_id=t.id WHERE s.owner_id=%s "
            "AND (%s::uuid IS NULL OR s.id=%s) ORDER BY o.created_at DESC,o.id LIMIT 50",
            (owner, schedule_id, schedule_id),
        )
    ).fetchall()


async def listing(owner):
    async with transaction() as conn:
        schedules = await (
            await conn.execute(
                "SELECT s.*,t.title AS thread_title FROM user_schedules s "
                "JOIN chat_threads t ON t.id=s.thread_id WHERE s.owner_id=%s "
                "ORDER BY (s.state<>'deleted') DESC,s.next_due NULLS LAST,"
                "s.created_at DESC LIMIT 150",
                (owner,),
            )
        ).fetchall()
        proposals = await (
            await conn.execute(
                "SELECT id,thread_id,preview,expires_at FROM schedule_proposals "
                "WHERE owner_id=%s AND status='pending' "
                "AND expires_at>now() ORDER BY created_at DESC LIMIT 20",
                (owner,),
            )
        ).fetchall()
        return {
            "schedules": schedules,
            "proposals": proposals,
            "occurrences": await history(conn, owner),
            "now": (await one(conn, "SELECT now() AS n"))["n"],
        }
