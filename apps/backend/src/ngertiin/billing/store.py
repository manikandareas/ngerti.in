"""Account locks serialize checkout and receipts; leases fence provider observations."""

import secrets
from datetime import UTC, datetime, timedelta
from uuid import uuid4, uuid5

from fastapi import HTTPException
from psycopg.types.json import Jsonb

from ngertiin.billing.contracts import PERIOD, PaymentMismatch, contract
from ngertiin.quotas.periods import lock_account, one


async def audit(conn, order, action, detail=None):
    await conn.execute(
        "INSERT INTO billing_audit(order_id,action,detail) VALUES (%s,%s,%s)",
        (order["id"], action, Jsonb(detail or {})),
    )


async def read(conn, owner, ident):
    row = await one(
        conn, "SELECT * FROM billing_orders WHERE owner_id=%s AND id=%s", (owner, ident)
    )
    if not row:
        raise HTTPException(404, "Pembayaran tidak ditemukan.")
    return row


async def begin(conn, owner, body, mode):
    await lock_account(conn, owner)
    old = await one(
        conn,
        "SELECT * FROM billing_orders WHERE owner_id=%s AND request_key=%s",
        (owner, body.request_key),
    )
    if old:
        if old["provider"] != body.provider:
            raise HTTPException(409, "Permintaan ini sudah digunakan untuk gateway lain.")
        return old, False
    occupied = await one(
        conn,
        "SELECT id FROM billing_orders WHERE owner_id=%s AND "
        "(status NOT IN ('expired','failed','cancelled') OR paid_through>now()) LIMIT 1",
        (owner,),
    )
    if occupied:
        raise HTTPException(
            409,
            "Masih ada langganan atau pembayaran yang belum selesai. "
            "Periksa status sebelum membuat yang baru.",
        )
    # Existing trusted grants must not be overwritten by a second commercial subscription.
    active = await one(
        conn,
        "SELECT id FROM quota_grants WHERE owner_id=%s AND ends_at>now() AND revoked_at IS NULL",
        (owner,),
    )
    if active:
        raise HTTPException(409, "Plus masih aktif. Tunggu sampai periode berakhir.")
    ident = uuid4()
    await conn.execute(
        "INSERT INTO billing_orders(id,owner_id,request_key,provider,mode,contract,"
        "contact,binding_token) VALUES (%s,%s,%s,%s,%s,%s,%s,%s)",
        (
            ident,
            owner,
            body.request_key,
            body.provider,
            mode,
            Jsonb(contract(body.provider)),
            Jsonb(body.model_dump(include={"email", "first_name", "last_name"})),
            secrets.token_hex(16),
        ),
    )
    row = await read(conn, owner, ident)
    await audit(
        conn,
        row,
        "checkout_requested",
        {"consent": True, "contract": row["contract"], "lifecycle": row["lifecycle_policy"]},
    )
    return row, True


async def claim(conn, ident):
    token = uuid4()
    return await one(
        conn,
        "UPDATE billing_orders SET lease_token=%s,"
        "lease_until=now()+interval '180 seconds' WHERE id=%s AND "
        "(lease_until IS NULL OR lease_until<now()) RETURNING *",
        (token, ident),
    )


async def leased(conn, order):
    await lock_account(conn, order["owner_id"])
    current = await one(conn, "SELECT * FROM billing_orders WHERE id=%s FOR UPDATE", (order["id"],))
    if (
        current["lease_token"] != order["lease_token"]
        or not current["lease_until"]
        or current["lease_until"] <= datetime.now(UTC)
    ):
        raise HTTPException(409, "Status sedang diperbarui. Coba kembali.")
    return current


async def release(conn, order, status, error=None):
    await conn.execute(
        "UPDATE billing_orders SET status=%s,last_error=%s,lease_until=NULL,"
        "lease_token=NULL,updated_at=now(),next_check_at=now()+interval '5 minutes' "
        "WHERE id=%s AND lease_token=%s",
        (status, error, order["id"], order["lease_token"]),
    )


async def receipt(conn, order, payment, *, grant=True):
    c = order["contract"]
    quote = payment.validated_quote if payment.validated_quote is not None else payment.amount
    if (
        quote != c["amount"]
        or payment.currency != c["currency"]
        or payment.tax < 0
        or payment.amount <= 0
    ):
        raise PaymentMismatch("Receipt contract mismatch")
    if payment.start > datetime.now(UTC) + timedelta(minutes=5):
        raise PaymentMismatch("Payment timestamp is in the future")
    old = await one(
        conn,
        "SELECT * FROM billing_payments WHERE provider=%s AND mode=%s AND receipt_id=%s",
        (order["provider"], order["mode"], payment.receipt_id),
    )
    if old:
        if old["order_id"] != order["id"]:
            raise PaymentMismatch("Receipt already belongs to another order")
        if (old["amount"], old["tax"], old["currency"], old["cycle_start"]) != (
            payment.amount,
            payment.tax,
            payment.currency,
            payment.start,
        ):
            raise PaymentMismatch("Receipt financial identity changed")
        return
    start, end = payment.start, payment.start + PERIOD
    overlap = await one(
        conn,
        "SELECT * FROM quota_grants WHERE owner_id=%s AND starts_at<%s AND ends_at>%s "
        "AND revoked_at IS NULL",
        (order["owner_id"], end, start),
    )
    if overlap and grant:
        raise PaymentMismatch("Paid cycles overlap; operator reconciliation required")
    gid = uuid5(order["id"], "payment:" + payment.receipt_id)
    snapshot = {
        "chat_policy": c["chat_policy"],
        "chat_messages": c["chat_messages"],
        "compute_policy": c["compute_policy"],
        "compute_credits": c["compute_credits"],
    }
    if grant:
        await conn.execute(
            "INSERT INTO quota_grants(id,owner_id,request_key,source,starts_at,ends_at,"
            "policy_snapshot) VALUES (%s,%s,%s,%s,%s,%s,%s)",
            (
                gid,
                order["owner_id"],
                gid,
                f"billing:{order['provider']}:{payment.receipt_id}",
                start,
                end,
                Jsonb(snapshot),
            ),
        )
    await conn.execute(
        "INSERT INTO billing_payments(id,order_id,provider,mode,receipt_id,cycle_start,"
        "cycle_end,amount,tax,currency,grant_id,evidence) "
        "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
        (
            gid,
            order["id"],
            order["provider"],
            order["mode"],
            payment.receipt_id,
            start,
            end,
            payment.amount,
            payment.tax,
            payment.currency,
            gid if grant else None,
            Jsonb(payment.evidence),
        ),
    )
    if grant:
        for table in ("quota_periods", "compute_periods"):
            await conn.execute(
                f"UPDATE {table} SET ends_at=LEAST(ends_at,%s) WHERE owner_id=%s "
                "AND plan='free' AND starts_at<%s AND ends_at>%s",
                (start, order["owner_id"], start, start),
            )
        await conn.execute(
            "UPDATE billing_orders SET paid_through=GREATEST(paid_through,%s) WHERE id=%s",
            (end, order["id"]),
        )
        await audit(
            conn,
            order,
            "paid_cycle_granted",
            {"receipt": payment.receipt_id, "start": start.isoformat(), "end": end.isoformat()},
        )


def public(row):
    return {
        key: row[key]
        for key in (
            "id",
            "provider",
            "mode",
            "status",
            "contract",
            "lifecycle_policy",
            "paid_through",
            "cancel_requested",
            "expires_at",
            "created_at",
            "updated_at",
        )
    } | {
        "payment_url": row["payment_url"]
        if row["status"] == "pending" and row["expires_at"] > datetime.now(UTC)
        else None,
        "needs_review": row["status"] in ("review", "unknown") or row["refund_review_required"],
        "can_update_payment_method": row["provider"] == "lemonsqueezy"
        and bool(row["subscription_id"]),
        "can_cancel": bool(row["subscription_id"])
        and not row["cancel_requested"]
        and row["status"] not in ("cancelled", "expired", "failed"),
    }
