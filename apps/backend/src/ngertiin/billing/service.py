"""Provider calls occur outside database transactions; every mutation is fenced."""

from fastapi import HTTPException
from psycopg.errors import UniqueViolation

from ngertiin.async_db import transaction
from ngertiin.billing import duitku, lemon, lifecycle, store
from ngertiin.billing.contracts import PaymentMismatch, ProviderUnavailable, require_available
from ngertiin.config import get_settings
from ngertiin.quotas.periods import one


def adapter(provider):
    return duitku if provider == "duitku" else lemon


async def checkout(owner, body):
    require_available(body.provider)
    async with transaction() as conn:
        order, fresh = await store.begin(conn, owner, body, get_settings().billing_mode)
        if not fresh:
            return store.public(order)
        order = await store.claim(conn, order["id"])
    try:
        checkout_id, url = await adapter(order["provider"]).create(order)
        async with transaction() as conn:
            await store.leased(conn, order)
            await conn.execute(
                "UPDATE billing_orders SET checkout_id=%s,payment_url=%s WHERE id=%s",
                (checkout_id, url, order["id"]),
            )
            await store.audit(conn, order, "checkout_created")
            await store.release(conn, order, "pending")
    except (ProviderUnavailable, PaymentMismatch, KeyError, ValueError) as error:
        async with transaction() as conn:
            await store.leased(conn, order)
            await store.audit(conn, order, "checkout_unconfirmed", {"type": type(error).__name__})
            await store.release(
                conn,
                order,
                "review" if isinstance(error, PaymentMismatch) else "unknown",
                "Checkout belum dapat dikonfirmasi.",
            )
    async with transaction() as conn:
        return store.public(await store.read(conn, owner, order["id"]))


async def sync(ident, candidate=None):
    async with transaction() as conn:
        order = await store.claim(conn, ident)
        if order:
            order["cycle_anchor"] = await one(
                conn,
                "SELECT cycle_start,evidence FROM billing_payments WHERE order_id=%s "
                "ORDER BY cycle_start LIMIT 1",
                (ident,),
            )
    if not order:
        return False
    try:
        require_available(order["provider"], checkout=False)
        if order["mode"] != get_settings().billing_mode:
            raise ProviderUnavailable("Old environment requires matching credentials")
        sub = order["subscription_id"] or candidate
        if sub and order["subscription_id"] and str(sub) != order["subscription_id"]:
            raise PaymentMismatch("Second subscription for the same checkout")
        if not sub:
            # Unknown creation is never retried: it could already have created a chargeable link.
            async with transaction() as conn:
                await store.leased(conn, order)
                state = "unknown" if order["status"] == "creating" else order["status"]
                # Lemon checkout expiry prevents new checkouts, but a paid event can still arrive.
                # Keep the order until provider evidence or operator confirmation resolves it.
                await store.release(conn, order, state)
            return False
        observed = await adapter(order["provider"]).observe(order, str(sub))
        if order["cancel_requested"] and not observed.cancelled:
            cancellable = order | {"subscription_id": str(sub)}
            await adapter(order["provider"]).cancel(cancellable)
            observed = await adapter(order["provider"]).observe(order, str(sub))
            if not observed.cancelled:
                raise ProviderUnavailable("Cancellation still pending")
        async with transaction() as conn:
            current = await store.leased(conn, order)
            if (
                current["subscription_id"]
                and current["subscription_id"] != observed.subscription_id
            ):
                raise PaymentMismatch("Subscription binding changed")
            await conn.execute(
                "UPDATE billing_orders SET subscription_id=%s WHERE id=%s",
                (observed.subscription_id, ident),
            )
            for payment in sorted(observed.payments, key=lambda p: p.start):
                await store.receipt(conn, current, payment)
            await lifecycle.reconcile(conn, current, observed.refunds)
            status = observed.status
            if current["cancel_requested"] and not observed.cancelled:
                status = "cancel_pending"
            await store.audit(conn, current, "provider_reconciled", {"status": status})
            await store.release(conn, order, status)
        return True
    except (
        ProviderUnavailable,
        PaymentMismatch,
        HTTPException,
        KeyError,
        ValueError,
        UniqueViolation,
    ) as error:
        async with transaction() as conn:
            current = await one(conn, "SELECT * FROM billing_orders WHERE id=%s", (ident,))
            status = (
                "review"
                if isinstance(error, (PaymentMismatch, KeyError, ValueError, UniqueViolation))
                else ("cancel_pending" if current["cancel_requested"] else current["status"])
            )
            await store.audit(
                conn, order, "reconciliation_deferred", {"type": type(error).__name__}
            )
            await store.release(conn, order, status, "Status pembayaran belum dapat dipastikan.")
        return False


async def cancel(owner, ident):
    async with transaction() as conn:
        await store.lock_account(conn, owner)
        order = await store.read(conn, owner, ident)
        if not order["subscription_id"]:
            raise HTTPException(409, "Subscription belum terhubung. Periksa status pembayaran.")
        await conn.execute(
            "UPDATE billing_orders SET cancel_requested=true,"
            "next_check_at=now(),updated_at=now() WHERE id=%s",
            (ident,),
        )
        await store.audit(conn, order, "cancellation_requested")
    await sync(ident)
    async with transaction() as conn:
        return store.public(await store.read(conn, owner, ident))


async def process_event(event):
    payload = event["payload"]
    async with transaction() as conn:
        order = None
        if payload.get("billing_order"):
            order = await one(
                conn,
                "SELECT * FROM billing_orders WHERE id=%s AND provider=%s AND mode=%s",
                (payload["billing_order"], event["provider"], event["mode"]),
            )
            if order and event["provider"] == "lemonsqueezy":
                import secrets

                if not secrets.compare_digest(order["binding_token"], payload.get("binding", "")):
                    raise PaymentMismatch("Checkout binding mismatch")
        if not order and payload.get("subscription_id"):
            order = await one(
                conn,
                "SELECT * FROM billing_orders WHERE provider=%s AND mode=%s AND subscription_id=%s",
                (event["provider"], event["mode"], payload["subscription_id"]),
            )
    if not order:
        return False
    candidate = payload.get("subscription_id")
    if order["subscription_id"] and candidate and candidate != order["subscription_id"]:
        async with transaction() as conn:
            await store.audit(
                conn, order, "duplicate_subscription_review", {"subscription_id": candidate}
            )
        return False
    done = await sync(order["id"], candidate)
    if done:
        async with transaction() as conn:
            await conn.execute(
                "UPDATE billing_events SET order_id=%s,processed_at=now(),"
                "last_error=NULL WHERE id=%s",
                (order["id"], event["id"]),
            )
    return done


async def attempt_event(event):
    error_type = None
    try:
        done = await process_event(event)
    except (PaymentMismatch, ValueError, HTTPException) as error:
        done, error_type = False, type(error).__name__
    async with transaction() as conn:
        await conn.execute(
            "UPDATE billing_events SET attempts=attempts+1,"
            "last_error=CASE WHEN processed_at IS NULL THEN %s ELSE NULL END WHERE id=%s",
            (error_type if error_type else (None if done else "AwaitingVerification"), event["id"]),
        )
    return done


async def tick():
    async with transaction() as conn:
        events = await (
            await conn.execute(
                "SELECT * FROM billing_events WHERE processed_at IS NULL "
                "AND attempts<100 ORDER BY attempts,created_at LIMIT 30"
            )
        ).fetchall()
    for event in events:
        await attempt_event(event)
    async with transaction() as conn:
        orders = await (
            await conn.execute(
                "SELECT id FROM billing_orders WHERE next_check_at<=now() "
                "AND (subscription_id IS NOT NULL OR status NOT IN ('expired','failed')) "
                "ORDER BY next_check_at LIMIT 30"
            )
        ).fetchall()
    for order in orders:
        await sync(order["id"])
