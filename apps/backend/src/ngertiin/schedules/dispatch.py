"""Claim, budget, Task and enqueue commit together; tick retries never repeat an occurrence."""

import logging
from datetime import datetime
from uuid import uuid5

from fastapi import HTTPException

from ngertiin.async_db import transaction
from ngertiin.chat.store import lock_account, one, owned_thread
from ngertiin.schedules import store, timing
from ngertiin.schedules.contracts import ScheduleSpec
from ngertiin.tasks import creation
from ngertiin.tasks.budget import AdmissionDenied

logger = logging.getLogger(__name__)


async def admit(conn, schedule: dict, intended_at: datetime, *, manual_id=None):
    trigger = "manual" if manual_id else "scheduled"
    oid = manual_id or uuid5(schedule["id"], f"{schedule['revision']}:{intended_at.isoformat()}")
    previous = await one(conn, "SELECT * FROM schedule_occurrences WHERE id=%s", (oid,))
    if previous:
        return previous
    await conn.execute(
        "INSERT INTO schedule_occurrences(id,schedule_id,revision,intended_at,trigger,status) "
        "VALUES (%s,%s,%s,%s,%s,'pending')",
        (oid, schedule["id"], schedule["revision"], intended_at, trigger),
    )
    revision = await one(
        conn,
        "SELECT * FROM schedule_revisions WHERE schedule_id=%s AND revision=%s",
        (schedule["id"], schedule["revision"]),
    )
    active = await one(
        conn,
        "SELECT t.id FROM schedule_occurrences o JOIN background_tasks t ON t.id=o.task_id "
        "WHERE o.schedule_id=%s AND (t.status IN ('queued','running','waiting_user') "
        "OR t.stage IN ('unknown','sandbox_unknown','computer_unknown')) LIMIT 1",
        (schedule["id"],),
    )
    reason: str | None
    status, reason, task_id = (
        "skipped",
        "Pekerjaan sebelumnya masih aktif atau perlu pemeriksaan.",
        None,
    )
    if not active:
        spec = ScheduleSpec.model_validate(revision["spec"])
        from ngertiin.goals.work import schedule_block

        blocked = await schedule_block(
            conn, schedule["owner_id"], spec.goal.model_dump(mode="json") if spec.goal else None
        )
        if blocked:
            await conn.execute(
                "UPDATE schedule_occurrences SET status='skipped',reason=%s WHERE id=%s",
                (blocked, oid),
            )
            return await one(conn, "SELECT * FROM schedule_occurrences WHERE id=%s", (oid,))
        try:
            # Savepoint retains the occurrence/outcome on rejected admission but
            # rolls back every partially-created Task/reservation/job.
            async with conn.transaction():
                task = await creation.create(
                    schedule["owner_id"],
                    schedule["thread_id"],
                    oid,
                    spec.instruction,
                    spec.review_required,
                    inputs=[i.model_dump(mode="json") for i in spec.inputs],
                    outputs=[o.model_dump() for o in spec.outputs],
                    runtime_kind=spec.runtime_kind,
                    goal=spec.goal,
                    connection=conn,
                    scheduled={
                        "occurrence_id": oid,
                        "per_run_cap": spec.per_run_cap,
                        "input_snapshot": revision["input_snapshot"],
                        "identity": {
                            "schedule_id": str(schedule["id"]),
                            "revision": schedule["revision"],
                            "occurrence_id": str(oid),
                            "intended_at": intended_at.isoformat(),
                            "timezone": spec.timezone,
                        },
                    },
                )
                task_id, status, reason = task["id"], "queued", None
        except AdmissionDenied as error:
            status = "blocked_budget" if error.reason == "budget" else "skipped"
            reason = str(error.detail)
        except HTTPException as error:
            status = "blocked_budget" if error.status_code == 429 else "failed"
            reason = str(error.detail)
    await conn.execute(
        "UPDATE schedule_occurrences SET status=%s,reason=%s,task_id=%s WHERE id=%s",
        (status, reason, task_id, oid),
    )
    return await one(conn, "SELECT * FROM schedule_occurrences WHERE id=%s", (oid,))


async def dispatch_one(owner, schedule_id, *, now=None):
    async with transaction() as conn:
        await lock_account(conn, owner)
        schedule = await store.owned(conn, owner, schedule_id)
        await owned_thread(conn, owner, schedule["thread_id"], lock=True)
        schedule = await store.owned(conn, owner, schedule_id, lock=True)
        now = now or (await one(conn, "SELECT now() AS n"))["n"]
        if schedule["state"] != "active" or not schedule["next_due"] or schedule["next_due"] > now:
            return None
        spec = ScheduleSpec.model_validate(schedule["spec"])
        intended = timing.latest_due(spec, schedule["next_due"], now)
        occurrence = await admit(conn, schedule, intended)
        await conn.execute(
            "UPDATE user_schedules SET next_due=%s,updated_at=now() WHERE id=%s",
            (timing.next_time(spec, now), schedule_id),
        )
        return occurrence


async def tick():
    async with transaction() as conn:
        due = await (
            await conn.execute(
                "SELECT id,owner_id FROM user_schedules WHERE state='active' AND next_due<=now() "
                "ORDER BY next_due LIMIT 50"
            )
        ).fetchall()
    for row in due:
        try:
            await dispatch_one(row["owner_id"], row["id"])
        except Exception:
            logger.exception("schedule.dispatch_failed", extra={"schedule_id": str(row["id"])})
