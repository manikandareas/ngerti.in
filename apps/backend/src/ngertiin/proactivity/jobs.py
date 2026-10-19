"""Debounced evidence events and temporal checks run while the browser is closed."""

from uuid import UUID

from fastapi import HTTPException

from ngertiin.async_db import transaction
from ngertiin.chat.store import lock_account
from ngertiin.config import get_settings
from ngertiin.proactivity import runtime, store
from ngertiin.worker.queue import queue_app


@queue_app.task(name="proactive.evaluate", queue="default")
async def evaluate_job(evaluation_id: str):
    await runtime.process(UUID(evaluation_id))


async def recover():
    async with transaction() as conn:
        owners = await (
            await conn.execute(
                "SELECT DISTINCT owner_id FROM proactive_evaluations WHERE "
                "(status='running' AND lease_until<=now()) OR "
                "(status<>'invalidated' AND expires_at<=now()) LIMIT 50"
            )
        ).fetchall()
    for row in owners:
        async with transaction() as conn:
            await lock_account(conn, row["owner_id"])
            await store.refresh(conn, row["owner_id"])
            await conn.execute(
                "UPDATE proactive_evaluations SET status='failed',"
                "reason='interrupted',lease_token=NULL,lease_until=NULL,"
                "finished_at=now() WHERE owner_id=%s AND status='running' "
                "AND lease_until<=now()",
                (row["owner_id"],),
            )
            await conn.execute(
                "UPDATE proactive_cost_events SET state='unknown',settled_at=now() "
                "WHERE owner_id=%s AND state='reserved' AND evaluation_id IN "
                "(SELECT id FROM proactive_evaluations WHERE status IN "
                "('failed','invalidated'))",
                (row["owner_id"],),
            )


@queue_app.periodic(cron="* * * * *")
@queue_app.task(name="proactive.dispatch", queue="maintenance", queueing_lock="proactive-dispatch")
async def dispatch(timestamp: int | None = None):
    await recover()
    if not get_settings().proactive_enabled:
        return
    async with transaction() as conn:
        rows = await (
            await conn.execute(
                "SELECT owner_id FROM proactive_accounts WHERE enabled "
                "AND due_at<=now() ORDER BY due_at LIMIT 20"
            )
        ).fetchall()
    for row in rows:
        try:
            await store.request(row["owner_id"])
        except HTTPException as error:
            if error.status_code not in (409, 429):
                raise
        # A disabled/missing-budget account must not monopolize every minute.
        async with transaction() as conn:
            await conn.execute(
                "UPDATE proactive_accounts SET due_at=GREATEST(due_at,"
                "now()+interval '1 hour') WHERE owner_id=%s",
                (row["owner_id"],),
            )
