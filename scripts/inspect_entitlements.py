"""NG-022 lifecycle contracts on disposable PostgreSQL; provider HTTP is controlled."""

import asyncio
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import httpx
import inspect_billing as billing
import inspect_files as fixture
from ngertiin.accounts.auth import current_account
from ngertiin.api.app import app
from ngertiin.async_db import close_pool, transaction
from ngertiin.billing import http, lifecycle, service, store
from ngertiin.billing.contracts import Payment, PaymentMismatch, Refund
from ngertiin.config import get_settings
from ngertiin.models import Account
from ngertiin.quotas import ledger as chat_ledger
from ngertiin.quotas.periods import current_period, one
from ngertiin.schedules import dispatch
from ngertiin.schedules import service as schedules
from ngertiin.schedules.contracts import ProposalInput, ScheduleSpec
from ngertiin.storage import get_object, put_object
from ngertiin.tasks import actions, commands, creation
from ngertiin.tasks import store as tasks
from ngertiin.usage import ledger
from ngertiin.usage.api import summary as usage
from pydantic import SecretStr

check = fixture.check
NOW = billing.NOW


async def paid(owner, sub, *, start=None):
    order = await billing.full_order(owner, "lemonsqueezy", sub)
    billing.SUBS[sub] = {
        "status": "active",
        "invoices": [billing.invoice(sub, sub, start)],
    }
    check("verified_cycle_" + sub, await service.sync(order["id"], sub))
    async with transaction() as conn:
        return await store.read(conn, owner, order["id"])


async def scenarios():
    s = get_settings()
    values = {
        "billing_public_api_url": "https://synthetic.example.com",
        "billing_mode": "test",
        "lemonsqueezy_enabled": True,
        "lemonsqueezy_store_id": "1",
        "lemonsqueezy_variant_id": "2",
        "lemonsqueezy_api_key": SecretStr("probe-key"),
        "openai_api_key": SecretStr("probe-key"),
        "lemonsqueezy_currency": "USD",
        "lemonsqueezy_price_minor": 1500,
    }
    previous = {key: getattr(s, key) for key in values}
    old_http = http.request
    for key, value in values.items():
        setattr(s, key, value)
    http.request = billing.fake_http
    try:
        a, thread = await fixture.owner()
        order = await paid(a, "101")
        task = await creation.create(
            a, thread, uuid4(), "Tuliskan hasil sintetis.", True
        )
        execution = await tasks.claim(task["id"])
        async with transaction() as conn:
            await conn.execute(
                "UPDATE background_tasks SET draft='Hasil tersimpan.' WHERE id=%s",
                (task["id"],),
            )
        action = await actions.ensure(execution)
        async with transaction() as conn:
            await conn.execute(
                "UPDATE background_tasks SET status='waiting_user' WHERE id=%s",
                (task["id"],),
            )
            work = await ledger.open_work(
                conn, a, "before-refund", "task", "Accepted", 10000
            )
            event = await ledger.reserve_event(
                conn, work, "used-before-refund", "model", "probe", {}, 1000
            )
            await ledger.settle_event(conn, a, event["identity"], 1000, "estimated", {})
            before = await one(
                conn, "SELECT * FROM compute_work WHERE id=%s", (work["id"],)
            )
        # A partial refund retains existing paid rights but requires explicit review.
        invoice = billing.SUBS["101"]["invoices"][0]["attributes"]
        invoice.update(status="partial_refund", refunded_amount=500)
        await service.sync(order["id"])
        async with transaction() as conn:
            row = await store.read(conn, a, order["id"])
            check("partial_refund_review", row["refund_review_required"])
            check(
                "partial_refund_retains_existing_rights",
                (await current_period(conn, a))["plan"] == "plus",
            )
            check(
                "policy_is_snapshotted", row["lifecycle_policy"]["grace_credits"] == 0
            )
        # Full refund revokes admission without rewriting accepted work or vendor costs.
        invoice.update(status="refunded", refunded=True, refunded_amount=1650)
        await service.sync(order["id"])
        async with transaction() as conn:
            q, u = await current_period(conn, a), await usage(conn, a)
            check(
                "full_refund_downgrades_chat_and_compute",
                q["plan"] == u["plan"] == "free",
            )
            check(
                "free_allowances_after_revocation",
                q["limits"]["chat"] == 100 and u["compute"]["limit"] == 1000,
            )
            check(
                "chat_compute_refund_window_agrees",
                q["starts_at"] == u["period"]["starts_at"],
            )
            after = await one(
                conn, "SELECT * FROM compute_work WHERE id=%s", (work["id"],)
            )
            check("accepted_work_snapshot_unchanged", before == after)
            cost = await one(
                conn, "SELECT * FROM compute_events WHERE id=%s", (event["id"],)
            )
            check(
                "payment_refund_keeps_vendor_and_customer_history",
                cost["amount"] == 1000 and not cost["customer_refunded"],
            )
            await ledger.reserve_event(
                conn, work, "after-downgrade", "model", "probe", {}, 500
            )
            check("accepted_work_continues_with_original_budget", True)
            row = await store.read(conn, a, order["id"])
            check(
                "refunded_cycle_not_advertised_paid_through",
                row["paid_through"] is None,
            )
            rev = await one(
                conn,
                "SELECT revoked_at,ends_at FROM quota_grants WHERE owner_id=%s",
                (a,),
            )
            check(
                "revocation_does_not_rewrite_original_cycle",
                rev["revoked_at"] < rev["ends_at"],
            )
        # A stale paid response and duplicate refunds can never restore allowance.
        invoice.update(status="paid", refunded=False, refunded_amount=0)
        await service.sync(order["id"])
        invoice.update(status="refunded", refunded=True, refunded_amount=1650)
        await asyncio.gather(service.sync(order["id"]), service.sync(order["id"]))
        async with transaction() as conn:
            check(
                "stale_paid_and_concurrent_refunds_never_regrant",
                (await current_period(conn, a))["plan"] == "free",
            )
            audit = await one(
                conn,
                "SELECT count(*) AS n FROM billing_audit WHERE order_id=%s AND action='payment_refund_full'",
                (order["id"],),
            )
            check("refund_audit_deduplicated", audit["n"] == 1)
        # Zero both allowances, then exercise controls and existing approval.
        spec = ScheduleSpec(
            title="Synthetic",
            instruction="Ringkas.",
            timezone="UTC",
            frequency="daily",
            start_date=(NOW + timedelta(days=1)).date(),
            local_time="12:00",
        )
        proposal = await schedules.propose(
            a,
            ProposalInput(
                request_key=uuid4(), thread_id=thread, operation="create", spec=spec
            ),
        )
        applied = await schedules.decide(a, proposal["id"], True)
        sid = applied["schedule_id"]
        async with transaction() as conn:
            hold = await chat_ledger.reserve(conn, a, "chat", "zero", 100, "a" * 64)
            await chat_ledger.commit(conn, a, hold, "synthetic zero")
            zero = await ledger.open_work(
                conn, a, "zero-compute", "task", "Zero", 1_000_000
            )
            await ledger.reserve_event(
                conn, zero, "zero-cost", "model", "probe", {}, 1_000_000
            )
            schedule = await one(
                conn, "SELECT * FROM user_schedules WHERE id=%s", (sid,)
            )
            occurrence = await dispatch.admit(conn, schedule, datetime.now(UTC))
            check(
                "schedule_checks_downgraded_allowance",
                occurrence["status"] == "blocked_budget"
                and occurrence["task_id"] is None
                and bool(occurrence["reason"]),
            )
        result = await actions.decide(
            a, action["id"], action["revision"], True, uuid4()
        )
        check("approval_at_zero_after_refund", result["status"] == "queued")
        stopped = await commands.cancel(a, task["id"])
        check("stop_at_zero_after_refund", stopped["status"] == "cancelled")
        pause = await schedules.propose(
            a,
            ProposalInput(
                request_key=uuid4(),
                thread_id=thread,
                operation="pause",
                schedule_id=sid,
                expected_revision=1,
            ),
        )
        await schedules.decide(a, pause["id"], True)
        async with transaction() as conn:
            schedule = await one(
                conn, "SELECT state FROM user_schedules WHERE id=%s", (sid,)
            )
            check("pause_schedule_at_zero", schedule["state"] == "paused")
        key = f"accounts/{a}/lifecycle-probe/retained.txt"
        await asyncio.to_thread(put_object, key, b"retained result", "text/plain")
        check(
            "download_at_zero_after_refund",
            await asyncio.to_thread(get_object, key) == b"retained result",
        )
        account = Account(id=a, clerk_user_id="synthetic")
        app.dependency_overrides[current_account] = lambda: account
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            check(
                "memory_controls_at_zero",
                (await client.get("/memory")).status_code == 200,
            )
            payload = (await client.get("/billing")).json()
            check(
                "public_lifecycle_and_refund_history",
                payload["entitlement"]["plan"] == "free"
                and payload["payments"][0]["refund_state"] == "full",
            )
            check(
                "history_has_no_signed_url_or_binding",
                "binding_token" not in str(payload)
                and "signature=" not in str(payload),
            )
            check(
                "refunded_active_subscription_still_cancellable",
                payload["orders"][0]["can_cancel"],
            )
            result = await client.post(f"/billing/{order['id']}/payment-method")
            check(
                "payment_method_fetched_for_owner",
                result.status_code == 200
                and result.json()["url"].startswith("https://test.lemonsqueezy.com/"),
            )
            billing.SUBS["101"]["payment_method_url"] = (
                "https://attacker.example/payment"
            )
            check(
                "foreign_payment_host_rejected",
                (
                    await client.post(f"/billing/{order['id']}/payment-method")
                ).status_code
                == 503,
            )
            other, _ = await fixture.owner()
            account = Account(id=other, clerk_user_id="synthetic-other")
            check(
                "foreign_payment_method_hidden",
                (
                    await client.post(f"/billing/{order['id']}/payment-method")
                ).status_code
                == 404,
            )
        await lifecycle_cases()
    finally:
        app.dependency_overrides.clear()
        http.request = old_http
        for key, value in previous.items():
            setattr(s, key, value)
        await close_pool()


async def lifecycle_cases():
    # Verify exact expiry and renewal using historical cycles, with no clock mutation.
    owner, _ = await fixture.owner()
    async with transaction() as conn:
        await conn.execute(
            "UPDATE accounts SET created_at=%s WHERE id=%s",
            (NOW - timedelta(days=70), owner),
        )
    order = await paid(owner, "102", start=NOW - timedelta(days=31))
    billing.SUBS["102"]["status"] = "past_due"
    await service.sync(order["id"])
    async with transaction() as conn:
        q, u = await current_period(conn, owner), await usage(conn, owner)
        check("failed_renewal_no_grace_chat_compute", q["plan"] == u["plan"] == "free")
        end = NOW - timedelta(days=1)
        check(
            "exact_paid_through_boundary_free",
            (await current_period(conn, owner, at=end))["plan"] == "free",
        )
        check(
            "before_boundary_still_plus",
            (await current_period(conn, owner, at=end - timedelta(microseconds=1)))[
                "plan"
            ]
            == "plus",
        )
    billing.SUBS["102"]["invoices"].append(
        billing.invoice("102", "102-renewal", NOW - timedelta(days=1), "renewal")
    )
    billing.SUBS["102"]["status"] = "active"
    await service.sync(order["id"])
    await service.sync(order["id"])
    async with transaction() as conn:
        check(
            "recovered_renewal_restores_plus",
            (await current_period(conn, owner))["plan"] == "plus",
        )
        count = await one(
            conn, "SELECT count(*) AS n FROM quota_grants WHERE owner_id=%s", (owner,)
        )
        check("renewal_once_despite_replay", count["n"] == 2)
    initial = billing.SUBS["102"]["invoices"][0]["attributes"]
    initial.update(status="refunded", refunded=True, refunded_amount=1650)
    await service.sync(order["id"])
    async with transaction() as conn:
        check(
            "historical_refund_keeps_unrelated_paid_renewal",
            (await current_period(conn, owner))["plan"] == "plus",
        )
    cancelled_owner, _ = await fixture.owner()
    cancelled_order = await paid(cancelled_owner, "106")
    billing.SUBS["106"]["invoices"][0]["attributes"].update(
        status="partial_refund", refunded_amount=500
    )
    await service.sync(cancelled_order["id"])
    result = await service.cancel(cancelled_owner, cancelled_order["id"])
    check(
        "partial_refund_review_does_not_hide_cancellation",
        result["status"] == "cancelled" and result["needs_review"],
    )
    # Refund before initial paid event cannot activate Plus, partial or full.
    for sub, full in [("103", True), ("104", False)]:
        owner, _ = await fixture.owner()
        order = await billing.full_order(owner, "lemonsqueezy", sub)
        inv = billing.invoice(sub, sub)
        inv["attributes"].update(
            status="refunded" if full else "partial_refund",
            refunded=full,
            refunded_amount=1650 if full else 500,
        )
        billing.SUBS[sub] = {"status": "active", "invoices": [inv]}
        await service.sync(order["id"], sub)
        async with transaction() as conn:
            check(
                "refund_before_initial_no_grant_" + sub,
                (await current_period(conn, owner))["plan"] == "free",
            )
            check(
                "refund_receipt_retained_" + sub,
                (
                    await one(
                        conn,
                        "SELECT count(*) AS n FROM billing_payments WHERE order_id=%s",
                        (order["id"],),
                    )
                )["n"]
                == 1,
            )
    # Atomic rollback of the financial observation and revocation.
    owner, _ = await fixture.owner()
    order = await paid(owner, "105")
    async with transaction() as conn:
        try:
            async with conn.transaction():
                await lifecycle.reconcile(
                    conn, order, [Refund(Payment("105", NOW, 1500, 150), True, 1650)]
                )
                raise RuntimeError("synthetic crash")
        except RuntimeError:
            pass
        check(
            "refund_crash_rolls_back_entitlement",
            (await current_period(conn, owner))["plan"] == "plus",
        )
        row = await one(
            conn,
            "SELECT refund_state FROM billing_payments WHERE order_id=%s",
            (order["id"],),
        )
        check("refund_crash_rolls_back_receipt_state", row["refund_state"] == "none")
        try:
            await store.receipt(conn, order, Payment("105", NOW, 1500, 0))
        except PaymentMismatch:
            check("receipt_financial_identity_immutable", True)
        else:
            raise AssertionError("receipt identity")


if __name__ == "__main__":
    fixture.scenarios = scenarios
    fixture.main()
