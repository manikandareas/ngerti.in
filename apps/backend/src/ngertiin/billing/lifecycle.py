"""Monotone refund reconciliation; existing work retains its original budget and evidence."""

from ngertiin.billing import store
from ngertiin.billing.contracts import PaymentMismatch
from ngertiin.quotas.periods import current_period, one


async def reconcile(conn, order, refunds):
    if order["lifecycle_policy"]["version"] != "subscription-lifecycle-v1":
        raise PaymentMismatch("Unsupported lifecycle policy")
    for refund in refunds:
        payment = refund.payment
        # Refunds observed before the first paid event never activate allowance.
        await store.receipt(conn, order, payment, grant=False)
        row = await one(
            conn,
            "SELECT * FROM billing_payments WHERE order_id=%s AND receipt_id=%s FOR UPDATE",
            (order["id"], payment.receipt_id),
        )
        if row["refund_state"] == "full":
            continue
        state = "full" if refund.full else "partial"
        if row["refund_state"] == state and row["refunded_amount"] >= refund.amount:
            continue
        await conn.execute(
            "UPDATE billing_payments SET refund_state=%s,refunded_amount=%s,"
            "refund_seen_at=now() WHERE id=%s",
            (state, max(refund.amount, row["refunded_amount"]), row["id"]),
        )
        if refund.full and row["grant_id"]:
            await conn.execute(
                "UPDATE quota_grants SET revoked_at=COALESCE(revoked_at,now()) WHERE id=%s",
                (row["grant_id"],),
            )
        await store.audit(
            conn,
            order,
            "payment_refund_" + state,
            {
                "receipt": payment.receipt_id,
                "amount": refund.amount,
                "policy": order["lifecycle_policy"],
                "grant": str(row["grant_id"]) if row["grant_id"] else None,
            },
        )
    await conn.execute(
        "UPDATE billing_orders SET paid_through=(SELECT max(p.cycle_end) "
        "FROM billing_payments p JOIN quota_grants g ON g.id=p.grant_id "
        "WHERE p.order_id=%s AND g.revoked_at IS NULL) WHERE id=%s",
        (order["id"], order["id"]),
    )
    partial = await one(
        conn,
        "SELECT id FROM billing_payments WHERE order_id=%s AND refund_state='partial' LIMIT 1",
        (order["id"],),
    )
    await conn.execute(
        "UPDATE billing_orders SET refund_review_required=%s WHERE id=%s",
        (bool(partial), order["id"]),
    )
    return bool(partial)


async def summary(conn, owner):
    p = await current_period(conn, owner)
    tasks = await one(
        conn,
        "SELECT count(*) AS n FROM background_tasks WHERE owner_id=%s "
        "AND status IN ('queued','running','waiting_user')",
        (owner,),
    )
    schedules = await one(
        conn,
        "SELECT count(*) AS n FROM user_schedules WHERE owner_id=%s AND state='active'",
        (owner,),
    )
    return {
        "plan": p["plan"],
        "reset_at": p["ends_at"],
        "plus_ends_at": p["ends_at"] if p["plan"] == "plus" else None,
        "chat_limit": p["limits"]["chat"],
        "accepted_tasks": tasks["n"],
        "active_schedules": schedules["n"],
        "grace_credits": 0,
    }
