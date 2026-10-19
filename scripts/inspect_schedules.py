"""Schedule timing, owner, revision, admission and crash contracts in disposable PostgreSQL."""

import argparse
import asyncio
import json
import os
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import uuid4

import psycopg
from fastapi import HTTPException
from inspect_tasks import Model, owner
from ngertiin.async_db import close_pool, transaction
from ngertiin.chat import store as chat
from ngertiin.config import get_settings
from ngertiin.quotas.policy import fingerprint
from ngertiin.schedules import dispatch, service, store, timing
from ngertiin.schedules.contracts import ProposalInput, ScheduleSpec
from ngertiin.tasks import commands, runtime, workflow
from psycopg import sql
from pydantic import ValidationError
from sqlalchemy.engine import make_url

RESULTS = []


def check(name, condition):
    if not condition:
        raise AssertionError(name)
    RESULTS.append({"scenario": name, "passed": True})


async def rejected(name, operation, status):
    try:
        await operation
    except HTTPException as error:
        check(name, error.status_code == status)
    else:
        raise AssertionError(name)


def spec(**changes):
    return ScheduleSpec.model_validate(
        {
            "title": "Jadwal audit",
            "instruction": "Tulis rencana singkat.",
            "timezone": "Asia/Makassar",
            "frequency": "daily",
            "start_date": "2026-10-19",
            "local_time": "09:00",
            "per_run_cap": 30000,
            **changes,
        }
    )


async def proposal(
    account, thread, operation="create", schedule=None, value=None, key=None
):
    return await service.propose(
        account,
        ProposalInput(
            request_key=key or uuid4(),
            thread_id=thread,
            operation=operation,
            schedule_id=schedule["id"] if schedule else None,
            expected_revision=schedule["revision"] if schedule else None,
            spec=value or (spec() if operation == "create" else None),
        ),
    )


async def create(account, thread, value=None):
    p = await proposal(account, thread, value=value)
    await service.decide(account, p["id"], True)
    return (await store.listing(account))["schedules"][0]


def timing_contracts():
    first = timing.next_time(spec(), datetime(2026, 10, 19, 0, tzinfo=UTC))
    check("iana_wall_clock_to_utc", first == datetime(2026, 10, 19, 1, tzinfo=UTC))
    weekly = spec(frequency="weekly", weekdays=[0, 2])
    check(
        "weekly_next_selected_day",
        timing.next_time(weekly, first) == datetime(2026, 10, 21, 1, tzinfo=UTC),
    )
    spring = spec(
        timezone="America/New_York", start_date="2027-03-13", local_time="02:30"
    )
    check(
        "dst_missing_time_skipped",
        timing.next_time(spring, datetime(2027, 3, 13, 8, tzinfo=UTC))
        == datetime(2027, 3, 15, 6, 30, tzinfo=UTC),
    )
    fall = spec(
        timezone="America/New_York", start_date="2027-11-07", local_time="01:30"
    )
    fold = datetime(2027, 11, 7, 5, 30, tzinfo=UTC)
    check(
        "dst_fold_first_instant",
        timing.next_time(fall, fold - timedelta(minutes=1)) == fold,
    )
    check(
        "dst_fold_does_not_run_twice",
        timing.next_time(fall, fold) == datetime(2027, 11, 8, 6, 30, tzinfo=UTC),
    )
    once = spec(
        frequency="once",
        start_date="2027-03-14",
        local_time="02:30",
        timezone="America/New_York",
    )
    check(
        "invalid_one_shot_dst_has_no_preview",
        not timing.preview(once, datetime(2027, 3, 13, tzinfo=UTC)),
    )
    check("preview_three_times", len(timing.preview(spec(), first)) == 3)
    check(
        "misfire_picks_latest",
        timing.latest_due(spec(), first, first + timedelta(days=800, hours=1))
        == first + timedelta(days=800),
    )
    for name, patch in [
        ("invalid_timezone", {"timezone": "../../bad"}),
        ("weekly_requires_days", {"frequency": "weekly"}),
        ("invalid_weekday", {"weekdays": [9]}),
        ("reject_owner_in_spec", {"owner_id": str(uuid4())}),
    ]:
        try:
            spec(**patch)
        except ValidationError:
            check(name, True)
        else:
            raise AssertionError(name)


def interval_timing_contracts():
    value = spec(frequency="interval", interval_hours=3)
    anchor = datetime(2026, 10, 19, 1, tzinfo=UTC)
    check(
        "interval_before_start",
        timing.next_time(value, anchor - timedelta(days=1)) == anchor,
    )
    check(
        "interval_inclusive_boundary",
        timing.next_time(value, anchor, inclusive=True) == anchor,
    )
    check(
        "interval_exclusive_boundary",
        timing.next_time(value, anchor) == anchor + timedelta(hours=3),
    )
    check(
        "interval_between_boundaries",
        timing.next_time(value, anchor + timedelta(hours=4))
        == anchor + timedelta(hours=6),
    )
    check(
        "interval_preview_three_anchored_times",
        timing.preview(value, anchor)
        == [anchor + timedelta(hours=h) for h in (3, 6, 9)],
    )
    check(
        "interval_crosses_midnight",
        timing.next_time(value, anchor + timedelta(hours=23))
        == anchor + timedelta(hours=24),
    )
    long = spec(frequency="interval", interval_hours=25)
    check(
        "interval_can_exceed_one_day",
        timing.next_time(long, anchor) == anchor + timedelta(hours=25),
    )
    check(
        "interval_downtime_arithmetic",
        timing.latest_due(value, anchor, anchor + timedelta(days=800, hours=4))
        == anchor + timedelta(days=800, hours=3),
    )
    for name, day, expected in [
        ("spring", "2027-03-14", datetime(2027, 3, 14, 9, 30, tzinfo=UTC)),
        ("fall", "2027-11-07", datetime(2027, 11, 7, 8, 30, tzinfo=UTC)),
    ]:
        dst = spec(
            frequency="interval",
            interval_hours=3,
            timezone="America/New_York",
            start_date=day,
            local_time="01:30",
        )
        first = timing.instant(dst, dst.start_date)
        check(
            f"interval_{name}_dst_keeps_elapsed_hours",
            timing.next_time(dst, first) == expected,
        )
    invalid_anchor = spec(
        frequency="interval",
        interval_hours=3,
        timezone="America/New_York",
        start_date="2027-03-14",
        local_time="02:30",
    )
    check(
        "interval_missing_dst_anchor_has_no_preview",
        not timing.preview(invalid_anchor, anchor),
    )
    check("legacy_spec_has_no_interval", spec().interval_hours is None)
    check("calendar_ignores_interval", spec(interval_hours=3).interval_hours is None)
    for name, hours in [
        ("missing", None),
        ("zero", 0),
        ("negative", -1),
        ("fraction", 1.5),
        ("boolean", True),
        ("string", "3"),
        ("too_large", 8761),
    ]:
        try:
            spec(frequency="interval", interval_hours=hours)
        except ValidationError:
            check(f"interval_rejects_{name}_hours", True)
        else:
            raise AssertionError(name)


async def interval_lifecycle():
    a, thread = await owner()
    # A stored pre-interval proposal must still accept its original request key.
    body = ProposalInput(
        request_key=uuid4(), thread_id=thread, operation="create", spec=spec()
    )
    old = await service.propose(a, body)
    identity = body.model_dump(mode="json", exclude={"request_key"})
    identity["spec"].pop("interval_hours")
    async with transaction() as conn:
        await conn.execute(
            "UPDATE schedule_proposals SET fingerprint=%s WHERE id=%s",
            (fingerprint(identity), old["id"]),
        )
        now = (await chat.one(conn, "SELECT now() AS n"))["n"]
    check(
        "legacy_proposal_key_replays_after_upgrade",
        (await service.propose(a, body))["id"] == old["id"],
    )
    value = spec(
        frequency="interval",
        interval_hours=3,
        timezone="UTC",
        start_date=now.date().isoformat(),
        local_time="00:00",
    )
    p = await proposal(a, thread, value=value)
    check(
        "interval_preview_explains_anchor",
        "Interval dihitung" in p["preview"]["timing_policy"]
        and p["preview"]["spec"]["interval_hours"] == 3,
    )
    await service.decide(a, p["id"], True)
    schedule = (await store.listing(a))["schedules"][0]
    due = schedule["next_due"]
    await asyncio.gather(
        *[dispatch.dispatch_one(a, schedule["id"], now=due) for _ in range(6)]
    )
    data = await store.listing(a)
    check(
        "interval_duplicate_tick_admits_once",
        len(data["occurrences"]) == 1 and data["occurrences"][0]["task_id"] is not None,
    )
    await dispatch.dispatch_one(a, schedule["id"], now=due + timedelta(hours=3))
    data = await store.listing(a)
    check("interval_overlap_skipped", data["occurrences"][0]["outcome"] == "skipped")
    await commands.cancel(a, data["occurrences"][1]["task_id"])
    late = due + timedelta(days=40, hours=4)
    await dispatch.dispatch_one(a, schedule["id"], now=late)
    data = await store.listing(a)
    check(
        "interval_downtime_coalesces_latest",
        len(data["occurrences"]) == 3
        and data["occurrences"][0]["intended_at"] == due + timedelta(days=40, hours=3),
    )
    check(
        "interval_next_due_stays_on_anchor",
        data["schedules"][0]["next_due"] == due + timedelta(days=40, hours=6),
    )
    await commands.cancel(a, data["occurrences"][0]["task_id"])
    settings, cap = get_settings(), get_settings().task_account_daily_units
    settings.task_account_daily_units = 1
    try:
        await dispatch.dispatch_one(
            a, schedule["id"], now=data["schedules"][0]["next_due"]
        )
        check(
            "interval_budget_rechecked",
            (await store.listing(a))["occurrences"][0]["outcome"] == "blocked_budget",
        )
    finally:
        settings.task_account_daily_units = cap
    current = (await store.listing(a))["schedules"][0]
    pause = await proposal(a, thread, "pause", current)
    await service.decide(a, pause["id"], True)
    paused = (await store.listing(a))["schedules"][0]
    check("interval_pause_removes_due", paused["next_due"] is None)
    resume = await proposal(a, thread, "resume", paused)
    await service.decide(a, resume["id"], True)
    resumed = (await store.listing(a))["schedules"][0]
    anchor = timing.instant(value, value.start_date)
    check(
        "interval_resume_preserves_anchor",
        resumed["spec"]["start_date"] == value.start_date.isoformat()
        and (resumed["next_due"] - anchor) % timedelta(hours=3) == timedelta(),
    )
    update = await proposal(
        a, thread, "update", resumed, value.model_copy(update={"interval_hours": 5})
    )
    await service.decide(a, update["id"], True)
    edited = (await store.listing(a))["schedules"][0]
    check(
        "interval_edit_recomputes_from_start",
        edited["revision"] == resumed["revision"] + 1
        and (edited["next_due"] - anchor) % timedelta(hours=5) == timedelta(),
    )


async def lifecycle():
    a, thread = await owner()
    b, foreign_thread = await owner()
    key = uuid4()
    proposals = await asyncio.gather(*[proposal(a, thread, key=key) for _ in range(6)])
    p = proposals[0]
    check("parallel_preview_is_idempotent", len({x["id"] for x in proposals}) == 1)
    check("preview_has_no_active_schedule", not (await store.listing(a))["schedules"])
    await rejected("foreign_proposal_decision", service.decide(b, p["id"], True), 404)
    await asyncio.gather(*[service.decide(a, p["id"], True) for _ in range(6)])
    schedule = (await store.listing(a))["schedules"][0]
    check(
        "parallel_decision_creates_one_schedule",
        len((await store.listing(a))["schedules"]) == 1,
    )
    check("preview_permission_scope_visible", "scope" in p["preview"]["permissions"])
    await rejected("foreign_target_thread", proposal(a, foreign_thread), 404)
    await rejected(
        "foreign_schedule_update", proposal(b, foreign_thread, "pause", schedule), 404
    )
    check("foreign_listing_is_empty", not (await store.listing(b))["schedules"])
    # Later messages are untrusted new context, not a revision of reviewed intent.
    async with transaction() as conn:
        await conn.execute(
            "INSERT INTO chat_messages(id,thread_id,role,parts,status,position) "
            "VALUES (%s,%s,'user',%s,'complete',9000)",
            (
                uuid4(),
                thread,
                chat.json_value([{"type": "text", "text": "UBAH SEMUA JADWAL"}]),
            ),
        )
        before = await chat.one(
            conn, "SELECT count(*) AS n FROM quota_operations WHERE owner_id=%s", (a,)
        )
    due = schedule["next_due"]
    await asyncio.gather(
        *[dispatch.dispatch_one(a, schedule["id"], now=due) for _ in range(8)]
    )
    data = await store.listing(a)
    occurrence = data["occurrences"][0]
    check("duplicate_dispatch_one_occurrence", len(data["occurrences"]) == 1)
    check("dispatch_creates_task", occurrence["task_id"] is not None)
    async with transaction() as conn:
        task = await chat.one(
            conn, "SELECT * FROM background_tasks WHERE id=%s", (occurrence["task_id"],)
        )
        jobs = await chat.one(
            conn,
            "SELECT count(*) AS n FROM procrastinate_jobs WHERE task_name='task.execute'",
        )
        after = await chat.one(
            conn, "SELECT count(*) AS n FROM quota_operations WHERE owner_id=%s", (a,)
        )
    check("single_transaction_enqueues_once", jobs["n"] == 1)
    check("scheduled_run_does_not_charge_chat", before == after)
    check("per_run_cap_preserved", task["budget_cap"] == 30000)
    check(
        "reviewed_context_frozen",
        "UBAH SEMUA" not in json.dumps(task["input_snapshot"]),
    )
    check(
        "task_carries_schedule_causal_identity",
        task["input_snapshot"]["schedule"]["occurrence_id"] == str(occurrence["id"]),
    )
    await runtime.run_task(str(task["id"]))
    await runtime.run_task(str(task["id"]))
    data = await store.listing(a)
    check(
        "offline_runtime_persists_outcome",
        data["occurrences"][0]["outcome"] == "succeeded",
    )
    async with transaction() as conn:
        deliveries = await chat.one(
            conn,
            "SELECT count(*) AS n FROM task_deliveries WHERE task_id=%s",
            (task["id"],),
        )
    check("duplicate_worker_has_single_delivery", deliveries["n"] == 1)
    # Pause versus due is linearized by account -> thread -> schedule locking.
    schedule = data["schedules"][0]
    pause = await proposal(a, thread, "pause", schedule)
    stale = await proposal(a, thread, "delete", schedule)
    await service.decide(a, pause["id"], True)
    await rejected(
        "stale_revision_cannot_apply", service.decide(a, stale["id"], True), 409
    )
    check(
        "paused_schedule_not_dispatched",
        await dispatch.dispatch_one(a, schedule["id"], now=due + timedelta(days=20))
        is None,
    )
    schedule = (await store.listing(a))["schedules"][0]
    manual = await proposal(a, thread, "run", schedule)
    await asyncio.gather(*[service.decide(a, manual["id"], True) for _ in range(6)])
    data = await store.listing(a)
    check("run_now_idempotent", len(data["occurrences"]) == 2)
    active = data["occurrences"][0]
    delete = await proposal(a, thread, "delete", schedule)
    await service.decide(a, delete["id"], True)
    data = await store.listing(a)
    check(
        "delete_keeps_admitted_task", data["occurrences"][0]["task_status"] == "queued"
    )
    check(
        "deleted_schedule_preserves_history",
        len(data["occurrences"]) == 2 and data["schedules"][0]["state"] == "deleted",
    )
    await commands.cancel(a, active["task_id"])
    check(
        "explicit_stop_cancels_task",
        (await store.listing(a))["occurrences"][0]["outcome"] == "cancelled",
    )


async def recovery_and_limits():
    a, thread = await owner()
    schedule = await create(a, thread)
    first = schedule["next_due"]
    now = first + timedelta(days=12, hours=1)
    await dispatch.dispatch_one(a, schedule["id"], now=now)
    data = await store.listing(a)
    check(
        "downtime_coalesces_one_latest_run",
        len(data["occurrences"]) == 1
        and data["occurrences"][0]["intended_at"] == first + timedelta(days=12),
    )
    await dispatch.dispatch_one(a, schedule["id"], now=now + timedelta(days=1))
    data = await store.listing(a)
    check(
        "overlap_skips_previous_queued", data["occurrences"][0]["outcome"] == "skipped"
    )
    task_id = data["occurrences"][1]["task_id"]
    async with transaction() as conn:
        await conn.execute(
            "UPDATE background_tasks SET status='waiting_user' WHERE id=%s", (task_id,)
        )
    await dispatch.dispatch_one(a, schedule["id"], now=now + timedelta(days=2))
    check(
        "overlap_includes_waiting_user",
        (await store.listing(a))["occurrences"][0]["outcome"] == "skipped",
    )
    await commands.cancel(a, task_id)
    # Reservation exhaustion never creates jobs or charged retries.
    settings = get_settings()
    old_cap = settings.task_account_daily_units
    settings.task_account_daily_units = 1
    try:
        await dispatch.dispatch_one(a, schedule["id"], now=now + timedelta(days=3))
        before = len((await store.listing(a))["occurrences"])
        await dispatch.dispatch_one(a, schedule["id"], now=now + timedelta(days=3))
        data = await store.listing(a)
        check(
            "budget_zero_has_explicit_outcome",
            data["occurrences"][0]["outcome"] == "blocked_budget"
            and data["occurrences"][0]["task_id"] is None,
        )
        check("blocked_budget_no_paid_tick_retry", len(data["occurrences"]) == before)
    finally:
        settings.task_account_daily_units = old_cap
    p = await proposal(a, thread)
    await service.decide(a, p["id"], False)
    check(
        "rejected_preview_has_no_schedule",
        len((await store.listing(a))["schedules"]) == 1,
    )
    p = await proposal(a, thread)
    async with transaction() as conn:
        await conn.execute(
            "UPDATE schedule_proposals SET expires_at=now()-interval '1 second' WHERE id=%s",
            (p["id"],),
        )
    await rejected(
        "expired_preview_cannot_apply", service.decide(a, p["id"], True), 409
    )
    # Failure after admission rolls back occurrence, Task, budget and job together.
    schedule = await create(a, thread)
    original = dispatch.creation.create

    async def interrupted(*args, **kwargs):
        await original(*args, **kwargs)
        raise RuntimeError("controlled death before commit")

    dispatch.creation.create = interrupted
    try:
        try:
            await dispatch.dispatch_one(a, schedule["id"], now=schedule["next_due"])
        except RuntimeError:
            pass
    finally:
        dispatch.creation.create = original
    async with transaction() as conn:
        count = await chat.one(
            conn,
            "SELECT count(*) AS n FROM schedule_occurrences WHERE schedule_id=%s",
            (schedule["id"],),
        )
    check("crash_before_commit_has_no_partial_occurrence", count["n"] == 0)
    await dispatch.dispatch_one(a, schedule["id"], now=schedule["next_due"])
    async with transaction() as conn:
        count = await chat.one(
            conn,
            "SELECT count(*) AS n FROM schedule_occurrences WHERE schedule_id=%s",
            (schedule["id"],),
        )
    check("restart_after_rollback_admits_once", count["n"] == 1)


async def scenarios():
    original = workflow.ChatOpenAI
    workflow.ChatOpenAI = Model
    Model.started, Model.release = asyncio.Event(), asyncio.Event()
    try:
        timing_contracts()
        interval_timing_contracts()
        await lifecycle()
        await recovery_and_limits()
        await api_and_control_contracts()
        await interval_lifecycle()
    finally:
        workflow.ChatOpenAI = original
        await close_pool()


async def api_and_control_contracts():
    from types import SimpleNamespace

    import httpx
    from ngertiin.accounts.auth import current_account
    from ngertiin.api.app import app

    a, thread = await owner()
    schedule = await create(a, thread)
    await rejected(
        "stale_chat_cannot_propose",
        service.propose(
            a,
            ProposalInput(
                request_key=uuid4(), thread_id=thread, operation="create", spec=spec()
            ),
            source_run={"id": uuid4(), "lease_token": uuid4()},
        ),
        409,
    )
    # Revoked/deleted inputs must never trap the owner in an unpausable schedule.
    broken = {**schedule["spec"], "inputs": [{"revision_id": str(uuid4()), "start": 1}]}
    async with transaction() as conn:
        await conn.execute(
            "UPDATE user_schedules SET spec=%s WHERE id=%s",
            (chat.json_value(broken), schedule["id"]),
        )
        await conn.execute(
            "UPDATE schedule_revisions SET spec=%s WHERE schedule_id=%s",
            (chat.json_value(broken), schedule["id"]),
        )
    pause = await proposal(a, thread, "pause", schedule)
    await service.decide(a, pause["id"], True)
    check(
        "missing_input_does_not_block_pause",
        (await store.listing(a))["schedules"][0]["state"] == "paused",
    )
    schedule = (await store.listing(a))["schedules"][0]
    run = await proposal(a, thread, "run", schedule)
    await service.decide(a, run["id"], True)
    data = await store.listing(a)
    check(
        "deleted_input_fails_without_substitution",
        data["occurrences"][0]["outcome"] == "failed"
        and data["occurrences"][0]["task_id"] is None,
    )
    delete = await proposal(a, thread, "delete", schedule)
    await service.decide(a, delete["id"], True)
    check(
        "missing_input_does_not_block_delete",
        (await store.listing(a))["schedules"][0]["state"] == "deleted",
    )
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        check("http_requires_auth", (await client.get("/schedules")).status_code == 401)
        app.dependency_overrides[current_account] = lambda: SimpleNamespace(id=a)
        try:
            response = await client.post(
                "/schedules/proposals",
                json={
                    "thread_id": str(thread),
                    "operation": "create",
                    "request_key": str(uuid4()),
                    "spec": spec().model_dump(mode="json"),
                    "owner_id": str(uuid4()),
                },
            )
            check("http_rejects_client_selected_owner", response.status_code == 422)
            response = await client.get("/schedules")
            check(
                "http_returns_upcoming_history_proposals",
                response.status_code == 200
                and set(response.json())
                == {"schedules", "proposals", "occurrences", "now"},
            )
        finally:
            app.dependency_overrides.clear()
    a, thread = await owner()
    first, second = await create(a, thread), await create(a, thread)
    settings, previous = get_settings(), get_settings().task_account_daily_units
    settings.task_account_daily_units = 30000
    try:
        await asyncio.gather(
            dispatch.dispatch_one(a, first["id"], now=first["next_due"]),
            dispatch.dispatch_one(a, second["id"], now=second["next_due"]),
        )
        outcomes = [r["outcome"] for r in (await store.listing(a))["occurrences"]]
        check(
            "competing_schedules_share_atomic_account_budget",
            sorted(outcomes) == ["blocked_budget", "queued"],
        )
    finally:
        settings.task_account_daily_units = previous


def main():
    from ngertiin.db import get_engine
    from ngertiin.setup import setup_database

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output", type=Path, default=Path(".dev/schedule-contracts.json")
    )
    args = parser.parse_args()
    settings = get_settings()
    if settings.app_env != "development":
        raise RuntimeError("Inspector requires development")
    original = settings.database_url.get_secret_value()
    previous = os.environ.get("DATABASE_URL")
    name = f"ngertiin_schedule_probe_{uuid4().hex}"
    temporary = (
        make_url(original).set(database=name).render_as_string(hide_password=False)
    )
    with psycopg.connect(original, autocommit=True) as admin:
        admin.execute(
            sql.SQL("CREATE DATABASE {} TEMPLATE template0").format(
                sql.Identifier(name)
            )
        )
        try:
            os.environ["DATABASE_URL"] = temporary
            get_settings.cache_clear()
            setup_database()
            asyncio.run(scenarios())
        finally:
            get_engine().dispose()
            get_engine.cache_clear()
            if previous is None:
                os.environ.pop("DATABASE_URL", None)
            else:
                os.environ["DATABASE_URL"] = previous
            get_settings.cache_clear()
            admin.execute(
                sql.SQL("DROP DATABASE {} WITH (FORCE)").format(sql.Identifier(name))
            )
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(
                json.dumps({"passed": len(RESULTS), "scenarios": RESULTS}, indent=2)
                + "\n"
            )
    print(json.dumps({"passed": len(RESULTS), "temporary_database_dropped": True}))


if __name__ == "__main__":
    main()
