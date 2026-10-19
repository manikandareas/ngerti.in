"""Reconcile abandoned reservations without retrying any provider effect."""

from ngertiin.async_db import transaction
from ngertiin.chat.store import one
from ngertiin.usage import events, ledger


async def reconcile():
    async with transaction() as conn:
        owners = await (
            await conn.execute(
                "SELECT owner_id FROM compute_work WHERE "
                "state='active' OR EXISTS (SELECT 1 FROM compute_events e WHERE "
                "e.work_id=compute_work.id AND e.state IN ('reserved','unknown')) "
                "GROUP BY owner_id ORDER BY min(updated_at) LIMIT 100"
            )
        ).fetchall()
    for row in owners:
        async with transaction() as conn:
            owner = row["owner_id"]
            await events.refresh(conn, owner)
            tasks = await (
                await conn.execute(
                    "SELECT t.* FROM background_tasks t JOIN "
                    "compute_work w ON w.task_id=t.id WHERE t.owner_id=%s AND w.state='active' "
                    "AND t.status IN ('succeeded','failed','cancelled')",
                    (owner,),
                )
            ).fetchall()
            for task in tasks:
                await ledger.finish(
                    conn, owner, f"task:{task['id']}", refund=not (task["draft"] or task["result"])
                )
            chats = await (
                await conn.execute(
                    "SELECT w.resource_key,r.id,r.status FROM compute_work w "
                    "JOIN chat_runs r ON w.resource_key='chat:'||r.id::text WHERE w.owner_id=%s "
                    "AND w.state='active' AND r.status IN ('complete','failed','cancelled')",
                    (owner,),
                )
            ).fetchall()
            for chat in chats:
                pending = await (
                    await conn.execute(
                        "SELECT e.identity,e.reserved FROM compute_events e JOIN compute_work w "
                        "ON w.id=e.work_id WHERE w.owner_id=%s AND w.resource_key=%s "
                        "AND e.state='reserved'",
                        (owner, chat["resource_key"]),
                    )
                ).fetchall()
                for event in pending:
                    await ledger.settle_event(
                        conn, owner, event["identity"], event["reserved"], "unknown", {}
                    )
                message = await one(
                    conn,
                    "SELECT parts FROM chat_messages WHERE run_id=%s AND role='assistant'",
                    (chat["id"],),
                )
                await ledger.finish(
                    conn,
                    owner,
                    chat["resource_key"],
                    refund=not any(
                        p.get("text", "").strip() for p in (message or {}).get("parts", [])
                    ),
                )

            storage = await (
                await conn.execute(
                    "SELECT e.identity,e.reserved FROM compute_events e "
                    "JOIN compute_work w ON w.id=e.work_id "
                    "WHERE w.owner_id=%s AND e.category='storage' AND e.state='reserved' "
                    "AND e.created_at<now()-interval '10 minutes'",
                    (owner,),
                )
            ).fetchall()
            for event in storage:
                await ledger.settle_event(
                    conn, owner, event["identity"], event["reserved"], "unknown", {}
                )
            await conn.execute(
                "UPDATE compute_work SET updated_at=now() WHERE owner_id=%s", (owner,)
            )
