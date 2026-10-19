"""Owner-scoped billing controls and provider-authenticated public webhook ingress."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import PlainTextResponse

from ngertiin.accounts.auth import current_account
from ngertiin.async_db import transaction
from ngertiin.billing import lemon, lifecycle, service, store, webhooks
from ngertiin.billing.contracts import (
    CheckoutInput,
    PaymentMismatch,
    Provider,
    ProviderUnavailable,
    available,
    checkout_enabled,
    contract,
    require_available,
)
from ngertiin.models import Account

router = APIRouter(prefix="/billing", tags=["billing"])
AccountDep = Annotated[Account, Depends(current_account)]


@router.get("")
async def summary(account: AccountDep):
    async with transaction() as conn:
        rows = await (
            await conn.execute(
                "SELECT * FROM billing_orders WHERE owner_id=%s ORDER BY created_at DESC LIMIT 20",
                (account.id,),
            )
        ).fetchall()
        payments = await (
            await conn.execute(
                "SELECT p.receipt_id,p.provider,p.mode,p.amount,"
                "p.tax,p.currency,p.cycle_start,p.cycle_end,p.created_at,"
                "p.refund_state,p.refunded_amount,"
                "CASE WHEN p.provider='lemonsqueezy' THEN 100 ELSE 1 END AS unit_divisor "
                "FROM billing_payments p "
                "JOIN billing_orders o ON o.id=p.order_id WHERE o.owner_id=%s "
                "ORDER BY p.cycle_start DESC LIMIT 30",
                (account.id,),
            )
        ).fetchall()
        entitlement = await lifecycle.summary(conn, account.id)
    return {
        "offers": [
            {"provider": p, "available": available(p), "contract": contract(p)}
            for p in ("duitku", "lemonsqueezy")
            if checkout_enabled(p)
        ],
        "orders": [store.public(row) for row in rows],
        "payments": payments,
        "entitlement": entitlement,
    }


@router.post("/checkout")
async def checkout(body: CheckoutInput, account: AccountDep):
    return await service.checkout(account.id, body)


@router.get("/{ident}")
async def order(ident: UUID, account: AccountDep):
    async with transaction() as conn:
        return store.public(await store.read(conn, account.id, ident))


@router.post("/{ident}/refresh")
async def refresh(ident: UUID, account: AccountDep):
    async with transaction() as conn:
        row = await store.read(conn, account.id, ident)
        # User polling never bypasses provider backoff or creates a provider effect.
        from datetime import UTC, datetime

        if row["next_check_at"] > datetime.now(UTC):
            return store.public(row)
    await service.sync(ident)
    return await order(ident, account)


@router.post("/{ident}/cancel")
async def cancel(ident: UUID, account: AccountDep):
    return await service.cancel(account.id, ident)


@router.post("/{ident}/payment-method")
async def payment_method(ident: UUID, account: AccountDep):
    async with transaction() as conn:
        row = await store.read(conn, account.id, ident)
    if row["provider"] != "lemonsqueezy" or not row["subscription_id"]:
        raise HTTPException(409, "Metode pembayaran belum dapat diperbarui.")
    require_available(row["provider"], checkout=False)
    from ngertiin.config import get_settings

    if row["mode"] != get_settings().billing_mode:
        raise HTTPException(409, "Mode pembayaran tidak sesuai.")
    try:
        return {"url": await lemon.payment_method(row)}
    except (ProviderUnavailable, PaymentMismatch, KeyError, ValueError) as error:
        raise HTTPException(503, "Tautan pembayaran belum tersedia. Coba lagi nanti.") from error


@router.post("/webhooks/{provider}")
async def webhook(provider: Provider, request: Request):
    raw = bytearray()
    async for chunk in request.stream():
        raw.extend(chunk)
        if len(raw) > 65536:
            raise HTTPException(413, "Webhook terlalu besar.")
    await webhooks.accept(bytes(raw), request.headers, provider)
    return PlainTextResponse("SUCCESS")
