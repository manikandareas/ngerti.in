"""Subscription invariants on disposable PostgreSQL; all gateway responses are controlled."""

import asyncio
import hashlib
import hmac
import json
from datetime import UTC, datetime, timedelta
from urllib.parse import urlencode
from uuid import uuid4

import httpx
import inspect_files as fixture
from fastapi import HTTPException
from ngertiin.async_db import close_pool, transaction
from ngertiin.billing import http, recovery, service, store, webhooks
from ngertiin.billing.contracts import (
    CheckoutInput,
    Payment,
    PaymentMismatch,
    ProviderUnavailable,
)
from ngertiin.config import get_settings
from ngertiin.quotas.ledger import usage as quota_snapshot
from ngertiin.quotas.periods import one
from ngertiin.usage import ledger
from ngertiin.usage.api import summary as usage_summary
from pydantic import SecretStr, ValidationError

check, reject = fixture.check, fixture.reject
NOW = datetime.now(UTC)
SUBS: dict = {}
CALLS: list = []
ORDERS: dict = {}


def body(provider, key=None):
    return CheckoutInput(
        request_key=key or uuid4(),
        provider=provider,
        email="synthetic@example.com",
        first_name="Synthetic",
        last_name="Probe",
        consent=True,
    )


def price():
    return {
        "variant_id": 2,
        "category": "subscription",
        "scheme": "standard",
        "unit_price": get_settings().lemonsqueezy_price_minor,
        "renewal_interval_unit": "day",
        "renewal_interval_quantity": 30,
        "created_at": NOW.isoformat(),
        "setup_fee_enabled": False,
    }


def invoice(sub, ident="1", start=None, reason="initial"):
    return {
        "id": ident,
        "attributes": {
            "subscription_id": int(sub),
            "store_id": 1,
            "test_mode": True,
            "status": "paid",
            "subtotal": 1500,
            "tax": 150,
            "tax_inclusive": False,
            "total": 1650,
            "discount_total": 0,
            "currency": "USD",
            "billing_reason": reason,
            "created_at": (start or NOW).isoformat(),
        },
    }


async def fake_http(method, url, **kwargs):
    CALLS.append((method, url, kwargs))
    if url.endswith("/stores/1"):
        return {
            "data": {"attributes": {"currency": get_settings().lemonsqueezy_currency}}
        }
    if "/prices" in url:
        p = {"id": "3", "attributes": price()}
        return {"data": [p] if url.endswith("/prices") else p}
    if url.endswith("/checkouts"):
        b = kwargs["json"]["data"]["attributes"]
        check(
            "lemon_server_sets_price_and_quantity",
            b["custom_price"] == get_settings().lemonsqueezy_price_minor
            and b["checkout_data"]["variant_quantities"][0]["quantity"] == 1,
        )
        return {
            "data": {
                "id": "checkout-1",
                "attributes": {"url": "https://test.lemonsqueezy.com/checkout/probe"},
            }
        }
    if "/subscription-invoices" in url:
        sub = str(kwargs["params"]["filter[subscription_id]"])
        return {"data": SUBS[sub]["invoices"], "links": {"next": None}}
    if "/subscriptions/" in url:
        sub = url.rsplit("/", 1)[-1]
        state = SUBS[sub]
        if method == "DELETE":
            if state.get("cancel_timeout"):
                raise ProviderUnavailable("Synthetic timeout")
            state["status"], state["cancelled"] = "cancelled", True
        return {
            "data": {
                "id": sub,
                "attributes": {
                    "store_id": 1,
                    "variant_id": 2,
                    "test_mode": True,
                    "status": state["status"],
                    "cancelled": state.get("cancelled", False),
                    "urls": {
                        "update_payment_method": state.get(
                            "payment_method_url",
                            "https://test.lemonsqueezy.com/subscription/payment-details",
                        )
                    },
                    "first_subscription_item": {"quantity": 1, "price_id": 3},
                },
            }
        }
    if url.endswith("/inquiry"):
        b = kwargs["json"]
        check(
            "duitku_recurring_thirty_days",
            b["isSubscription"]
            and b["subscriptionDetail"]["frequencyType"] == 1
            and b["subscriptionDetail"]["frequencyInterval"] == 30
            and b["subscriptionDetail"]["totalNoOfCycles"] == 0,
        )
        return {
            "statusCode": "00",
            "merchantCode": "probe",
            "reference": "reference",
            "paymentUrl": "https://sandbox.duitku.com/probe",
        }
    if "/subscription/detail/" in url:
        sub = url.rsplit("/", 1)[-1]
        state, order = SUBS[sub], ORDERS[sub]
        if method == "PUT":
            state["status"] = 5
        return {
            "statusCode": "00",
            "subscriptionId": sub,
            "subscriptionAmount": 149000,
            "subscriptionDescription": "ngertiin:"
            + str(order["id"])
            + ":"
            + order["binding_token"],
            "frequencyType": 1,
            "frequencyInterval": 30,
            "subscriptionStatus": state["status"],
            "currentCycle": state.get("cycle", 1),
            "lastRunStatus": state.get("last_status", 0),
            "lastRunDate": state.get("last_date", NOW.isoformat()),
        }
    raise AssertionError((method, url))


async def full_order(owner, provider, sub):
    result = await service.checkout(owner, body(provider))
    async with transaction() as conn:
        row = await store.read(conn, owner, result["id"])
    ORDERS[sub] = row
    return row


def lemon_event(order, sub, mode=True, binding=None):
    raw = json.dumps(
        {
            "meta": {
                "test_mode": mode,
                "event_name": "subscription_created",
                "custom_data": {
                    "billing_order": str(order["id"]),
                    "binding": binding or order["binding_token"],
                },
            },
            "data": {"id": sub, "type": "subscriptions", "attributes": {}},
        }
    ).encode()
    signature = hmac.new(b"probe-secret", raw, hashlib.sha256).hexdigest()
    return raw, {"x-signature": signature}


async def event_rows():
    async with transaction() as conn:
        return await (
            await conn.execute(
                "SELECT * FROM billing_events WHERE processed_at IS NULL ORDER BY id"
            )
        ).fetchall()


async def scenarios():
    settings = get_settings()
    names = [
        "billing_public_api_url",
        "billing_mode",
        "duitku_enabled",
        "duitku_merchant_code",
        "duitku_api_key",
        "lemonsqueezy_enabled",
        "lemonsqueezy_store_id",
        "lemonsqueezy_variant_id",
        "lemonsqueezy_api_key",
        "lemonsqueezy_webhook_secret",
        "lemonsqueezy_currency",
        "lemonsqueezy_price_minor",
    ]
    saved = {name: getattr(settings, name) for name in names}
    previous = http.request
    try:
        settings.billing_public_api_url = "https://synthetic.example.com"
        settings.billing_mode = "test"
        settings.duitku_enabled = settings.lemonsqueezy_enabled = True
        settings.duitku_merchant_code = "probe"
        settings.duitku_api_key = SecretStr("probe-key")
        settings.lemonsqueezy_api_key = SecretStr("probe-key")
        settings.lemonsqueezy_webhook_secret = SecretStr("probe-secret")
        settings.lemonsqueezy_store_id, settings.lemonsqueezy_variant_id = "1", "2"
        settings.lemonsqueezy_currency, settings.lemonsqueezy_price_minor = "USD", 1500
        http.request = fake_http
        a, _ = await fixture.owner()
        b, _ = await fixture.owner()
        async with transaction() as conn:
            native = await ledger.open_work(
                conn, a, "pre-upgrade", "task", "Old work", 1000
            )
        order = await full_order(a, "lemonsqueezy", "10")
        SUBS["10"] = {"status": "active", "invoices": [invoice("10")]}
        check(
            "public_order_hides_contact_binding_and_secrets",
            not {"contact", "binding_token", "lease_token"}
            & store.public(order).keys(),
        )
        calls = len(CALLS)
        replay = await service.checkout(a, body("lemonsqueezy", order["request_key"]))
        check(
            "checkout_replay_no_provider_effect",
            replay["id"] == order["id"] and len(CALLS) == calls,
        )
        await reject(
            "parallel_gateway_checkout_blocked",
            service.checkout(a, body("duitku")),
            409,
        )
        async with transaction() as conn:
            await reject(
                "other_owner_order_hidden", store.read(conn, b, order["id"]), 404
            )
        try:
            CheckoutInput.model_validate(body("duitku").model_dump() | {"amount": 1})
        except ValidationError:
            check("client_price_rejected", True)
        raw, headers = lemon_event(order, "10")
        await reject(
            "forged_webhook_rejected",
            webhooks.accept(raw, {"x-signature": "x"}, "lemonsqueezy"),
            403,
        )
        live, live_headers = lemon_event(order, "10", mode=False)
        await reject(
            "live_event_rejected_by_test_server",
            webhooks.accept(live, live_headers, "lemonsqueezy"),
            403,
        )
        await webhooks.accept(raw, headers, "lemonsqueezy")
        await webhooks.accept(raw, headers, "lemonsqueezy")
        rows = await event_rows()
        check("duplicate_webhook_one_inbox_entry", len(rows) == 1)
        check(
            "durable_inbox_survives_closed_browser",
            await service.process_event(rows[0]),
        )
        async with transaction() as conn:
            q, u = await quota_snapshot(conn, a), await usage_summary(conn, a)
            check(
                "verified_payment_activates_plus_chat",
                q["plan"] == "plus" and q["meters"]["chat"]["limit"] == 300,
            )
            check(
                "verified_payment_activates_plus_compute",
                u["plan"] == "plus" and u["compute"]["limit"] == 5000,
            )
            check(
                "usage_contract_does_not_advertise_legacy_checkout_price",
                "price_idr" not in u["plan_contract"],
            )
            old = await one(
                conn, "SELECT * FROM compute_work WHERE id=%s", (native["id"],)
            )
            check(
                "accepted_work_keeps_original_period",
                old["period_id"] == native["period_id"],
            )
            check(
                "chat_compute_share_paid_period",
                q["period"]["ends_at"] == u["period"]["ends_at"],
            )
        await service.sync(order["id"])
        async with transaction() as conn:
            n = await one(
                conn, "SELECT count(*) AS n FROM quota_grants WHERE owner_id=%s", (a,)
            )
            check("webhook_and_reconciliation_grant_once", n["n"] == 1)
        SUBS["10"]["cancel_timeout"] = True
        result = await service.cancel(a, order["id"])
        check(
            "cancel_timeout_is_pending_not_success",
            result["status"] == "cancel_pending",
        )
        SUBS["10"]["cancel_timeout"] = False
        await service.sync(order["id"])
        async with transaction() as conn:
            result = await store.read(conn, a, order["id"])
            check(
                "worker_recovers_pending_cancellation", result["status"] == "cancelled"
            )
            check(
                "cancellation_keeps_paid_access",
                (await quota_snapshot(conn, a))["plan"] == "plus",
            )
        # A callback with a valid signature but wrong custom binding cannot attach a different owner.
        forged, forged_headers = lemon_event(order, "11", binding="incorrect")
        await webhooks.accept(forged, forged_headers, "lemonsqueezy")
        try:
            await service.process_event((await event_rows())[0])
        except PaymentMismatch:
            check("signed_event_wrong_binding_rejected", True)
        # Real adapter verification rejects price drift and leaves no grant.
        mismatch = await full_order(b, "lemonsqueezy", "20")
        bad = invoice("20", "2")
        bad["attributes"]["subtotal"] = 1
        SUBS["20"] = {"status": "active", "invoices": [bad]}
        check(
            "wrong_amount_cannot_activate", not await service.sync(mismatch["id"], "20")
        )
        async with transaction() as conn:
            n = await one(
                conn, "SELECT count(*) AS n FROM quota_grants WHERE owner_id=%s", (b,)
            )
            check("wrong_amount_has_no_grant", n["n"] == 0)
        # A known subscription is enough for reconciliation after webhook delivery is lost.
        SUBS["20"]["invoices"] = [invoice("20", "2")]
        await service.sync(mismatch["id"], "20")
        SUBS["20"]["status"] = "past_due"
        failed = invoice("20", "3", reason="renewal")
        failed["attributes"]["status"] = "pending"
        SUBS["20"]["invoices"].append(failed)
        await service.sync(mismatch["id"])
        async with transaction() as conn:
            n = await one(
                conn, "SELECT count(*) AS n FROM quota_grants WHERE owner_id=%s", (b,)
            )
            check("failed_renewal_never_refills_allowance", n["n"] == 1)
        # Subscription API success, callback replay, authoritative cycle, cancellation.
        d, _ = await fixture.owner()
        order_d = await full_order(d, "duitku", "d1")
        SUBS["d1"] = {"status": 2}
        values = {
            "merchantCode": "probe",
            "amount": "149000",
            "merchantOrderId": str(order_d["id"]),
            "subscriptionId": "d1",
            "signature": service.duitku.signature("probe149000" + str(order_d["id"])),
        }
        callback = urlencode(values).encode()
        await webhooks.accept(
            callback, {"content-type": "application/x-www-form-urlencoded"}, "duitku"
        )
        event = next(e for e in await event_rows() if e["provider"] == "duitku")
        check("duitku_callback_reconciled", await service.process_event(event))
        await service.sync(order_d["id"])
        async with transaction() as conn:
            check(
                "duitku_cycle_grants_plus",
                (await quota_snapshot(conn, d))["plan"] == "plus",
            )
            n = await one(
                conn, "SELECT count(*) AS n FROM quota_grants WHERE owner_id=%s", (d,)
            )
            check("duitku_cycle_deduplicated", n["n"] == 1)
        result = await service.cancel(d, order_d["id"])
        check("duitku_cancel_confirmed", result["status"] == "cancelled")
        # Concurrent admission across providers is serialized by the same account lock.
        c, _ = await fixture.owner()

        async def competing(provider):
            try:
                await service.checkout(c, body(provider))
                return True
            except HTTPException as error:
                if error.status_code != 409:
                    raise
                return False

        check(
            "cross_gateway_race_one_checkout",
            sum(await asyncio.gather(competing("duitku"), competing("lemonsqueezy")))
            == 1,
        )
        # A timed-out create must not dispatch another payment link on replay/recovery.
        e, _ = await fixture.owner()
        original_create = service.lemon.create

        async def timeout(order):
            raise ProviderUnavailable("Synthetic creation timeout")

        service.lemon.create = timeout
        pending_body = body("lemonsqueezy")
        try:
            pending = await service.checkout(e, pending_body)
            check("creation_timeout_unknown", pending["status"] == "unknown")
            await service.sync(pending["id"])
            again = await service.checkout(e, pending_body)
            check("unknown_creation_not_redispatched", again["status"] == "unknown")
        finally:
            service.lemon.create = original_create
        # Receipt transaction rollback simulates a worker dying between payment and grant.
        f, _ = await fixture.owner()
        order_f = await full_order(f, "lemonsqueezy", "40")
        async with transaction() as conn:
            try:
                async with conn.transaction():
                    await store.receipt(conn, order_f, Payment("crash", NOW, 1500))
                    raise RuntimeError("Synthetic crash")
            except RuntimeError:
                pass
            check(
                "crash_rolls_back_payment_and_grant",
                (
                    await one(
                        conn,
                        "SELECT count(*) AS n FROM quota_grants WHERE owner_id=%s",
                        (f,),
                    )
                )["n"]
                == 0,
            )
            await store.receipt(conn, order_f, Payment("crash", NOW, 1500))
            check(
                "recovery_creates_single_grant",
                (
                    await one(
                        conn,
                        "SELECT count(*) AS n FROM quota_grants WHERE owner_id=%s",
                        (f,),
                    )
                )["n"]
                == 1,
            )
        # Renewal uses a distinct receipt and fixed adjacent period, not a reset on replay.
        r, _ = await fixture.owner()
        order_r = await full_order(r, "lemonsqueezy", "50")
        async with transaction() as conn:
            await conn.execute(
                "UPDATE accounts SET created_at=%s WHERE id=%s",
                (NOW - timedelta(days=40), r),
            )
            await store.receipt(
                conn, order_r, Payment("old", NOW - timedelta(days=30), 1500)
            )
            await store.receipt(conn, order_r, Payment("new", NOW, 1500))
            await store.receipt(conn, order_r, Payment("new", NOW, 1500))
            check(
                "renewal_new_period_once",
                (
                    await one(
                        conn,
                        "SELECT count(*) AS n FROM quota_grants WHERE owner_id=%s",
                        (r,),
                    )
                )["n"]
                == 2,
            )
            check(
                "renewal_allowance_current_cycle",
                (await usage_summary(conn, r))["compute"]["limit"] == 5000,
            )
        await api_scenarios(a, b, order)
        await recovery_scenarios()
        settings.lemonsqueezy_currency, settings.lemonsqueezy_price_minor = (
            "IDR",
            27075000,
        )
        i, _ = await fixture.owner()
        order_i = await full_order(i, "lemonsqueezy", "60")
        paid_idr = invoice("60", "idr-invoice")
        paid_idr["attributes"].update(
            currency="IDR", subtotal=27075000, tax=0, total=27075000
        )
        SUBS["60"] = {"status": "active", "invoices": [paid_idr]}
        check(
            "idr_store_fixed_usd_equivalent_verified",
            await service.sync(order_i["id"], "60"),
        )
        async with transaction() as conn:
            check(
                "idr_price_keeps_same_plus_allowance",
                (await usage_summary(conn, i))["compute"]["limit"] == 5000,
            )
        # Real sandbox invoice reproduces the USD-cent round trip of an IDR price.
        actual = {
            "subtotal": 27069432,
            "currency_rate": "0.00005545",
            "subtotal_usd": 1501,
            "discount_total_usd": 0,
            "tax_usd": 0,
            "total_usd": 1501,
        }
        service.lemon.verify_settlement_amount(actual, order_i["contract"])
        check("idr_usd_cent_rounding_explained", True)
        for label, changes in [
            ("underpayment", {"subtotal": 26000000}),
            ("wrong_usd_total", {"total_usd": 1}),
            ("no_conversion_evidence", {"currency_rate": "0"}),
        ]:
            try:
                service.lemon.verify_settlement_amount(
                    actual | changes, order_i["contract"]
                )
            except PaymentMismatch:
                check("fx_rounding_rejects_" + label, True)
            else:
                raise AssertionError(label)
        async with transaction() as conn:
            lease = await store.claim(conn, order_i["id"])
            await conn.execute(
                "UPDATE billing_orders SET lease_until=now()-interval '1 second' "
                "WHERE id=%s",
                (order_i["id"],),
            )
            replacement = await store.claim(conn, order_i["id"])
            await reject(
                "old_worker_fenced_after_lease_replacement",
                store.leased(conn, lease),
                409,
            )
            await store.release(conn, replacement, "active")
        settings.lemonsqueezy_enabled = False
        check(
            "disabled_checkout_still_allows_existing_reconciliation",
            await service.sync(order_i["id"]),
        )
    finally:
        http.request = previous
        for name, value in saved.items():
            setattr(settings, name, value)
        await close_pool()


async def recovery_scenarios():
    owner, _ = await fixture.owner()
    order = await full_order(owner, "lemonsqueezy", "70")
    SUBS["70"] = {"status": "active", "invoices": [invoice("70", "recover-initial")]}
    calls = len(CALLS)
    before = await recovery.inspect(order["id"])
    check(
        "operator_inspection_is_read_only_and_hides_secrets",
        len(CALLS) == calls
        and before["requires_signed_replay"]
        and not {"contact", "binding_token", "payment_url", "lease_token"}
        & before.keys(),
    )
    empty = await recovery.recover(order["id"])
    check(
        "missing_initial_callback_stays_unconfirmed_without_guessing_owner",
        empty["requires_signed_replay"]
        and empty["grants"] == 0
        and len(CALLS) == calls,
    )
    # The provider resends the original authenticated event after a lost delivery.
    raw, headers = lemon_event(order, "70")
    await webhooks.accept(raw, headers, "lemonsqueezy")
    restored = await recovery.recover(order["id"])
    check(
        "signed_initial_resend_recovers_missing_binding",
        restored["subscription_bound"]
        and restored["grants"] == 1
        and restored["pending_events"] == 0,
    )
    await webhooks.accept(raw, headers, "lemonsqueezy")
    replayed = await recovery.recover(order["id"])
    check(
        "operator_replay_cannot_double_grant",
        replayed["grants"] == replayed["receipts"] == 1,
    )

    stranded, _ = await fixture.owner()
    order_s = await full_order(stranded, "lemonsqueezy", "71")
    SUBS["71"] = {"status": "active", "invoices": [invoice("71", "recover-exhausted")]}
    raw_s, headers_s = lemon_event(order_s, "71")
    await webhooks.accept(raw_s, headers_s, "lemonsqueezy")
    async with transaction() as conn:
        await conn.execute(
            "UPDATE billing_events SET attempts=100 WHERE payload->>'billing_order'=%s",
            (str(order_s["id"]),),
        )
    check(
        "exhausted_inbox_visible_to_operator",
        (await recovery.inspect(order_s["id"]))["exhausted_events"] == 1,
    )
    check(
        "operator_recovers_exhausted_verified_inbox",
        (await recovery.recover(order_s["id"]))["grants"] == 1,
    )

    wrong, _ = await fixture.owner()
    wrong_order = await full_order(wrong, "lemonsqueezy", "72")
    raw_bad, headers_bad = lemon_event(wrong_order, "70", binding="wrong-binding")
    await webhooks.accept(raw_bad, headers_bad, "lemonsqueezy")
    rejected = await recovery.recover(wrong_order["id"])
    check(
        "operator_recovery_does_not_override_binding_validation",
        rejected["grants"] == 0 and rejected["pending_events"] == 1,
    )
    async with transaction() as conn:
        error = await one(
            conn,
            "SELECT last_error FROM billing_events WHERE payload->>'billing_order'=%s",
            (str(wrong_order["id"]),),
        )
        check(
            "invalid_inbox_has_safe_operator_diagnostic",
            error["last_error"] == "PaymentMismatch",
        )

    settings = get_settings()
    try:
        settings.billing_mode = "live"
        await reject(
            "operator_recovery_rejects_wrong_environment",
            recovery.recover(order["id"]),
            409,
        )
    finally:
        settings.billing_mode = "test"
    # Even a valid API receipt cannot bind a subscription already owned by another order.
    check(
        "foreign_subscription_binding_is_reviewed",
        not await service.sync(wrong_order["id"], "70"),
    )
    async with transaction() as conn:
        row = await store.read(conn, wrong, wrong_order["id"])
        check(
            "foreign_subscription_conflict_never_grants_or_stops_worker",
            row["status"] == "review" and row["subscription_id"] is None,
        )


async def api_scenarios(a, b, order):
    from ngertiin.accounts.auth import current_account
    from ngertiin.api.app import app
    from ngertiin.models import Account

    account = Account(id=a, clerk_user_id="synthetic")
    app.dependency_overrides[current_account] = lambda: account
    try:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            result = await client.get("/billing")
            check(
                "http_billing_owner_only",
                result.status_code == 200 and len(result.json()["orders"]) == 1,
            )
            settings = get_settings()
            try:
                settings.duitku_enabled = False
                offers = (await client.get("/billing")).json()["offers"]
                check(
                    "paused_duitku_hidden_from_checkout_catalog",
                    [o["provider"] for o in offers] == ["lemonsqueezy"],
                )
                calls = len(CALLS)
                rejected = await client.post(
                    "/billing/checkout", json=body("duitku").model_dump(mode="json")
                )
                check(
                    "paused_duitku_rejected_before_provider_effect",
                    rejected.status_code == 503 and len(CALLS) == calls,
                )
                settings.lemonsqueezy_enabled = False
                paused = (await client.get("/billing")).json()
                check(
                    "paused_checkout_keeps_existing_order_and_receipt_history",
                    paused["offers"] == []
                    and len(paused["orders"]) == 1
                    and len(paused["payments"]) == 1,
                )
            finally:
                settings.duitku_enabled = settings.lemonsqueezy_enabled = True
            account = Account(id=b, clerk_user_id="synthetic-b")
            check(
                "http_foreign_order_404",
                (await client.get(f"/billing/{order['id']}")).status_code == 404,
            )
            check(
                "http_forged_webhook_403",
                (
                    await client.post(
                        "/billing/webhooks/lemonsqueezy",
                        content=b"{}",
                        headers={"x-signature": "no"},
                    )
                ).status_code
                == 403,
            )
            check(
                "http_webhook_size_bound",
                (
                    await client.post(
                        "/billing/webhooks/lemonsqueezy", content=b"x" * 65537
                    )
                ).status_code
                == 413,
            )
    finally:
        app.dependency_overrides.clear()


if __name__ == "__main__":
    fixture.scenarios = scenarios
    fixture.main()
