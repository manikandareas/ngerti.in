"""Exercise quota transactions in a temporary development database, then drop that database."""

import argparse
import asyncio
import json
import os
from datetime import UTC, datetime, timedelta
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

import psycopg
from ngertiin.async_db import close_pool, transaction
from ngertiin.chat import approvals, store
from ngertiin.quotas import (
    commit,
    grant_plus,
    release,
    reserve,
    reverse,
    usage,
)
from ngertiin.quotas.errors import QuotaConflict, QuotaExceeded, QuotaNotFound
from ngertiin.quotas.periods import current_period, one
from ngertiin.quotas.policy import PERIOD, fingerprint
from psycopg import sql
from sqlalchemy.engine import make_url

RESULTS: list[dict] = []


def check(name: str, valid: bool, **details):
    if not valid:
        raise AssertionError(name)
    RESULTS.append({"scenario": name, "passed": True, **details})


async def account():
    owner = uuid4()
    async with transaction() as conn:
        await conn.execute(
            "INSERT INTO accounts(id,clerk_user_id,created_at) VALUES (%s,%s,%s)",
            (owner, f"quota-probe:{owner}", datetime.now(UTC) - timedelta(days=2)),
        )
    return owner


async def expect(name, action, error_type):
    try:
        await action()
    except error_type:
        check(name, True)
    else:
        raise AssertionError(name)


async def allocate(owner, key, amount=1, meter="chat", at=None, content=None):
    async with transaction() as conn:
        return await reserve(
            conn, owner, meter, key, amount, fingerprint(content or key), at=at
        )


async def read_usage(owner, at=None):
    async with transaction() as conn:
        return await usage(conn, owner, at=at)


async def ledger_scenarios():
    owner = await account()
    at = datetime.now(UTC)
    await allocate(owner, "prefill", amount=99)
    initial = await read_usage(owner, at)
    check(
        "free_limits",
        [initial["meters"][m]["limit"] for m in ("chat",)] == [100],
    )
    attempts = await asyncio.gather(
        *[allocate(owner, f"concurrent:{i}") for i in range(12)], return_exceptions=True
    )
    admitted = [r for r in attempts if not isinstance(r, BaseException)]
    check(
        "last_slot_concurrency",
        len(admitted) == 1
        and sum(isinstance(r, QuotaExceeded) for r in attempts) == 11,
        requests=12,
        admitted=len(admitted),
    )
    item = admitted[0]
    async with transaction() as conn:
        key = (
            await one(
                conn,
                "SELECT resource_key FROM quota_operations WHERE id=%s",
                (item.id,),
            )
        )["resource_key"]
    replays = await asyncio.gather(*[allocate(owner, key) for _ in range(8)])
    check(
        "idempotent_reservation",
        all(r.id == item.id and r.token == item.token for r in replays),
    )
    await expect(
        "identity_input_conflict",
        lambda: allocate(owner, key, content="changed"),
        QuotaConflict,
    )
    async with transaction() as conn:
        await commit(conn, owner, item, "first_output")
        await commit(conn, owner, item, "first_output_replay")
        await release(conn, owner, item, "late_cancel_keeps_published_content")
        n = await one(
            conn,
            "SELECT count(*) AS n FROM quota_events WHERE operation_id=%s",
            (item.id,),
        )
    check("commit_and_cancel_idempotent", n["n"] == 2)
    later = await read_usage(owner, at + PERIOD)
    old_replay = await allocate(owner, key, at=at + PERIOD)
    check(
        "committed_replay_after_reset",
        old_replay.period_id == item.period_id
        and later["meters"]["chat"]["remaining"] == 100,
    )
    async with transaction() as conn:
        await reverse(conn, owner, item, "output_unusable")
        await reverse(conn, owner, item, "refund_replay")
    check(
        "late_refund_does_not_credit_new_period",
        (await read_usage(owner, at + PERIOD))["meters"]["chat"]["remaining"] == 100,
    )
    renewed = await allocate(owner, key, at=at + PERIOD)
    check(
        "explicit_retry_gets_new_fence",
        renewed.id == item.id
        and renewed.token != item.token
        and renewed.period_id != item.period_id,
    )

    async def stale_commit():
        async with transaction() as conn:
            await commit(conn, owner, item, "stale_worker")

    await expect("stale_reservation_cannot_commit", stale_commit, QuotaConflict)

    async def foreign_commit():
        async with transaction() as conn:
            await commit(conn, await account(), renewed, "foreign_owner")

    await expect("operation_owner_isolation", foreign_commit, QuotaNotFound)
    async with transaction() as conn:
        await release(conn, owner, renewed, "cancel_before_output")
    check(
        "release_recovers_capacity",
        (await read_usage(owner, at + PERIOD))["meters"]["chat"]["remaining"] == 100,
    )

    owner = await account()
    reserved = await allocate(owner, "cross_period", at=at)
    async with transaction() as conn:
        await commit(conn, owner, reserved, "late_first_output")
    check(
        "reserved_work_finishes_in_original_period",
        (await read_usage(owner, at))["meters"]["chat"]["used"] == 1
        and (await read_usage(owner, at + PERIOD))["meters"]["chat"]["used"] == 0,
    )
    rollback_owner = await account()
    try:
        async with transaction() as conn:
            await reserve(
                conn, rollback_owner, "chat", "rollback", 1, fingerprint("rollback")
            )
            raise RuntimeError("Simulated domain/queue failure")
    except RuntimeError:
        pass
    check(
        "domain_transaction_rolls_back_admission",
        (await read_usage(rollback_owner))["meters"]["chat"]["remaining"] == 100,
    )


async def period_scenarios():
    owner, key = await account(), uuid4()
    now = datetime.now(UTC)
    original = await read_usage(owner, now)
    async with transaction() as conn:
        first = await grant_plus(conn, owner, key, "probe:payment-1", at=now)
        replay = await grant_plus(
            conn, owner, key, "probe:payment-1", at=now + timedelta(days=1)
        )
        renewal = await grant_plus(
            conn, owner, uuid4(), "probe:payment-2", at=now + timedelta(days=1)
        )
    plus = await read_usage(owner, now)
    check(
        "plus_limits_and_idempotent_activation",
        first["id"] == replay["id"]
        and [plus["meters"][m]["limit"] for m in ("chat",)] == [300],
    )
    check("early_renewal_is_scheduled", renewal["starts_at"] == first["ends_at"])
    second = await read_usage(owner, first["ends_at"])
    expired = await read_usage(owner, renewal["ends_at"])
    check(
        "boundary_activates_next_plus_period",
        second["plan"] == "plus" and second["period"]["starts_at"] == first["ends_at"],
    )
    check(
        "expiry_returns_to_free",
        expired["plan"] == "free"
        and expired["period"]["starts_at"] == renewal["ends_at"],
    )
    offline = await read_usage(
        owner, renewal["ends_at"] + PERIOD * 4 + timedelta(hours=1)
    )
    check(
        "lazy_cycles_do_not_wait_for_login",
        offline["period"]["starts_at"] == renewal["ends_at"] + PERIOD * 4,
    )
    async with transaction() as conn:
        periods = await (
            await conn.execute(
                "SELECT * FROM quota_periods WHERE owner_id=%s AND plan='free' ORDER BY starts_at",
                (owner,),
            )
        ).fetchall()
    check(
        "activation_closes_old_free_period",
        periods[0]["ends_at"] == now
        and original["period"]["starts_at"] == periods[0]["starts_at"],
    )

    async def wrong_source():
        async with transaction() as conn:
            await grant_plus(conn, owner, key, "probe:different")

    await expect("activation_source_conflict", wrong_source, QuotaConflict)
    # A session timezone must not change period identity or a thirty-day duration.
    async with transaction() as conn:
        await conn.execute("SET LOCAL TIME ZONE 'America/New_York'")
        a = await current_period(conn, owner, at=now)
        await conn.execute("SET LOCAL TIME ZONE 'Asia/Makassar'")
        b = await current_period(conn, owner, at=now)
    check("timezone_stable_period_identity", a["id"] == b["id"])

    dst_owner = await account()
    dst_start = datetime(2027, 10, 1, tzinfo=UTC)
    async with transaction() as conn:
        await conn.execute("SET LOCAL TIME ZONE 'America/New_York'")
        first = await grant_plus(conn, dst_owner, uuid4(), "probe:dst-1", at=dst_start)
        next_term = await grant_plus(
            conn, dst_owner, uuid4(), "probe:dst-2", at=dst_start + timedelta(days=1)
        )
    check(
        "renewal_uses_exact_utc_duration_across_dst",
        next_term["starts_at"].astimezone(UTC) == first["ends_at"].astimezone(UTC)
        and next_term["ends_at"].astimezone(UTC)
        - next_term["starts_at"].astimezone(UTC)
        == PERIOD,
    )


async def chat_scenarios():
    from fastapi import HTTPException
    from ngertiin.chat import api as chat_api
    from ngertiin.chat.recovery import reconcile_deliveries
    from ngertiin.models import Account

    owner = await account()
    await store.bootstrap(owner)
    thread = await store.create_thread(owner, uuid4())
    key = uuid4()
    first, replay = await asyncio.gather(
        *[
            store.submit(owner, thread["id"], key, "Probe accepted turn")
            for _ in range(2)
        ]
    )
    check("chat_duplicate_request_is_one_run", first["id"] == replay["id"])
    check(
        "chat_reserves_on_acceptance",
        (await read_usage(owner))["meters"]["chat"]["reserved"] == 1,
    )
    run = await store.claim(first["id"])
    await store.publish(
        run, [{"id": "reason", "type": "reasoning", "text": "summary"}], "running"
    )
    check(
        "reasoning_does_not_commit",
        (await read_usage(owner))["meters"]["chat"]["used"] == 0,
    )
    await store.publish(run, [], "failed", error="Fixture failure before output")
    check(
        "failure_without_result_releases",
        (await read_usage(owner))["meters"]["chat"]["remaining"] == 100,
    )
    filler = await allocate(owner, "fill-chat", amount=100, meter="chat")
    try:
        await chat_api.retry(
            run["id"], chat_api.ThreadInput(request_key=uuid4()), Account(id=owner)
        )
    except QuotaExceeded:
        check("retry_after_release_rechecks_capacity", True)
    else:
        raise AssertionError("retry bypassed quota")
    async with transaction() as conn:
        await release(conn, owner, filler, "fixture_cleanup")
    await chat_api.retry(
        run["id"], chat_api.ThreadInput(request_key=uuid4()), Account(id=owner)
    )
    retried = await store.claim(run["id"])
    check(
        "chat_retry_reuses_run_with_new_quota_token",
        retried["id"] == run["id"] and retried["quota_token"] != run["quota_token"],
    )
    await expect(
        "old_chat_worker_is_fenced",
        lambda: store.publish(run, [], "running"),
        store.StaleRun,
    )
    await store.publish(
        retried, [{"id": "text", "type": "text", "text": "Jawaban sebagian"}], "running"
    )
    check(
        "public_text_commits_once",
        (await read_usage(owner))["meters"]["chat"]["used"] == 1,
    )
    await store.cancel(owner, retried["id"])
    check(
        "cancel_after_output_keeps_charge",
        (await read_usage(owner))["meters"]["chat"]["used"] == 1,
    )
    await store.submit(owner, thread["id"], key, "Probe accepted turn")
    check(
        "cancelled_submission_replay_does_not_charge",
        (await read_usage(owner))["meters"]["chat"]["used"] == 1,
    )
    try:
        await store.submit(owner, thread["id"], key, "Changed input")
    except HTTPException as error:
        check("chat_request_key_rejects_changed_input", error.status_code == 409)

    proposal_run = await store.submit(
        owner, thread["id"], uuid4(), "Probe generic approval"
    )
    proposal_run = await store.claim(proposal_run["id"])
    interrupt = SimpleNamespace(
        id="probe-interrupt",
        value={
            "type": "tool_approval",
            "name": "probe_action",
            "tool_call_id": "probe-tool",
            "args": {"description": "Probe action"},
        },
    )
    await approvals.save_interrupts(proposal_run, [interrupt], [], {})
    check(
        "approval_card_commits_chat",
        (await read_usage(owner))["meters"]["chat"]["used"] == 2,
    )
    await allocate(owner, "fill-chat-remaining", amount=98, meter="chat")
    snap = await store.snapshot(owner, thread["id"])
    proposal = snap["approvals"][0]
    decision_key = uuid4()
    await approvals.decide(owner, proposal["id"], 1, True, decision_key)
    await approvals.decide(owner, proposal["id"], 1, True, decision_key)
    resumed = await store.claim(proposal_run["id"])
    await store.publish(
        resumed,
        [{"id": "text", "type": "text", "text": "Tindakan disetujui"}],
        "complete",
    )
    check(
        "approval_at_zero_chat_does_not_charge_again",
        (await read_usage(owner))["meters"]["chat"]["remaining"] == 0,
    )
    foreign = await account()
    await expect(
        "foreign_chat_snapshot_rejected",
        lambda: store.snapshot(foreign, thread["id"]),
        HTTPException,
    )

    crash_owner = await account()
    await store.bootstrap(crash_owner)
    crash_thread = await store.create_thread(crash_owner, uuid4())
    queued = await store.submit(crash_owner, crash_thread["id"], uuid4(), "Recover me")
    crashed = await store.claim(queued["id"])
    async with transaction() as conn:
        await conn.execute(
            "UPDATE procrastinate_jobs SET status='failed' WHERE id=%s",
            (crashed["job_id"],),
        )
    await reconcile_deliveries()
    check(
        "recovery_preserves_reservation",
        (await read_usage(crash_owner))["meters"]["chat"]["reserved"] == 1,
    )
    recovered = await store.claim(queued["id"])
    async with transaction() as conn:
        await conn.execute(
            "UPDATE chat_runs SET attempt=3 WHERE id=%s", (recovered["id"],)
        )
        await conn.execute(
            "UPDATE procrastinate_jobs SET status='failed' WHERE id=%s",
            (recovered["job_id"],),
        )
    await reconcile_deliveries()
    check(
        "terminal_recovery_releases_without_output",
        (await read_usage(crash_owner))["meters"]["chat"]["remaining"] == 100,
    )
    await expect(
        "recovery_fences_previous_worker",
        lambda: store.publish(recovered, [], "running"),
        store.StaleRun,
    )


async def http_scenarios():
    import httpx
    from ngertiin.accounts.auth import current_account
    from ngertiin.api.app import app
    from ngertiin.models import Account

    owner = await account()
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://probe"
    ) as client:
        anonymous = await client.get("/quotas")
        check("usage_requires_authentication", anonymous.status_code == 401)
        app.dependency_overrides[current_account] = lambda: Account(id=owner)
        try:
            first = await client.get(
                "/quotas", params={"owner_id": str(uuid4()), "plan": "plus"}
            )
            check(
                "usage_ignores_client_owner_and_plan",
                first.status_code == 200 and first.json()["plan"] == "free",
            )
            mutation = await client.post("/quotas", json={"plan": "plus"})
            check("no_public_grant_endpoint", mutation.status_code == 405)
            await store.bootstrap(owner)
            thread = await store.create_thread(owner, uuid4())
            forged = await client.post(
                f"/chat/threads/{thread['id']}/runs",
                json={
                    "request_key": str(uuid4()),
                    "text": "Hi",
                    "plan": "plus",
                    "amount": 0,
                },
            )
            check("chat_rejects_forged_billing_fields", forged.status_code == 422)
            await allocate(owner, "full-chat", amount=100, meter="chat")
            denied = await client.post(
                f"/chat/threads/{thread['id']}/runs",
                json={
                    "request_key": str(uuid4()),
                    "text": "Keep my draft",
                },
            )
            detail = denied.json()["detail"]
            check(
                "quota_error_has_machine_readable_context",
                denied.status_code == 429
                and detail["code"] == "quota_exceeded"
                and detail["meter"] == "chat"
                and detail["remaining"] == 0
                and "reset_at" in detail
                and "Retry-After" in denied.headers,
            )
            snap = await client.get(f"/chat/threads/{thread['id']}")
            check(
                "rejected_send_creates_no_message",
                snap.status_code == 200 and not snap.json()["messages"],
            )
        finally:
            app.dependency_overrides.clear()


async def scenarios():
    try:
        await ledger_scenarios()
        await period_scenarios()
        await chat_scenarios()
        await http_scenarios()
        async with transaction() as conn:
            audit = await one(
                conn,
                """
                SELECT count(*) AS n FROM quota_operations o
                LEFT JOIN quota_events e ON e.operation_id=o.id AND e.revision=o.revision
                WHERE e.id IS NULL OR e.period_id<>o.period_id OR e.token<>o.token
            """,
            )
        check("audit_tracks_latest_operation_revision", audit["n"] == 0)
    finally:
        await close_pool()


def main():
    from ngertiin.config import get_settings
    from ngertiin.db import get_engine
    from ngertiin.setup import setup_database

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path(".dev/chat-ledger.json"))
    args = parser.parse_args()
    settings = get_settings()
    if settings.app_env != "development":
        raise RuntimeError("The inspector requires a development environment")
    original = settings.database_url.get_secret_value()
    previous_env = os.environ.get("DATABASE_URL")
    database = f"ngertiin_quota_probe_{uuid4().hex}"
    temporary = (
        make_url(original).set(database=database).render_as_string(hide_password=False)
    )
    report = {"kind": "isolated_database_contract_probe", "scenarios": RESULTS}
    with psycopg.connect(original, autocommit=True) as admin:
        admin.execute(
            sql.SQL("CREATE DATABASE {} TEMPLATE template0").format(
                sql.Identifier(database)
            )
        )
        try:
            os.environ["DATABASE_URL"] = temporary
            get_settings.cache_clear()
            setup_database()
            asyncio.run(scenarios())
            report["passed"] = len(RESULTS)
        finally:
            get_engine().dispose()
            get_engine.cache_clear()
            if previous_env is None:
                os.environ.pop("DATABASE_URL", None)
            else:
                os.environ["DATABASE_URL"] = previous_env
            get_settings.cache_clear()
            admin.execute(
                sql.SQL("DROP DATABASE {} WITH (FORCE)").format(
                    sql.Identifier(database)
                )
            )
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({"passed": len(RESULTS), "temporary_database_dropped": True}))


if __name__ == "__main__":
    main()
