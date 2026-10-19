"""Host-only inspection and bounded replay of previously authenticated billing events."""

import argparse
import asyncio
import json
from uuid import UUID

from fastapi import HTTPException

from ngertiin.async_db import close_pool, transaction
from ngertiin.billing import service, store
from ngertiin.config import get_settings
from ngertiin.quotas.periods import one


async def read(conn, ident):
    order = await one(conn, "SELECT * FROM billing_orders WHERE id=%s", (ident,))
    if not order:
        raise HTTPException(404, "Billing order not found")
    if order["mode"] != get_settings().billing_mode:
        raise HTTPException(409, "Use credentials matching the order environment")
    return order


async def pending_events(conn, order):
    return await (
        await conn.execute(
            "SELECT * FROM billing_events WHERE provider=%s AND mode=%s "
            "AND processed_at IS NULL AND (order_id=%s OR payload->>'billing_order'=%s "
            "OR (%s::text IS NOT NULL AND payload->>'subscription_id'=%s)) "
            "ORDER BY id LIMIT 100",
            (
                order["provider"],
                order["mode"],
                order["id"],
                str(order["id"]),
                order["subscription_id"],
                order["subscription_id"],
            ),
        )
    ).fetchall()


async def inspect(ident):
    async with transaction() as conn:
        order = await read(conn, ident)
        counts = await one(
            conn,
            "SELECT count(*) AS receipts,count(DISTINCT grant_id) AS grants "
            "FROM billing_payments WHERE order_id=%s",
            (ident,),
        )
        events = await pending_events(conn, order)
    return {
        "order_id": str(ident),
        "provider": order["provider"],
        "mode": order["mode"],
        "status": order["status"],
        "subscription_bound": bool(order["subscription_id"]),
        "paid_through": order["paid_through"],
        "receipts": counts["receipts"],
        "grants": counts["grants"],
        "pending_events": len(events),
        "exhausted_events": sum(e["attempts"] >= 100 for e in events),
        "requires_signed_replay": not order["subscription_id"],
        "reconciliation_pending": bool(order["last_error"])
        or order["status"] in ("creating", "pending", "unknown", "review", "cancel_pending"),
        "next_action": "Resend the original signed webhook from the provider dashboard."
        if not order["subscription_id"]
        else "Retry the verified inbox or reconcile the bound subscription.",
    }


async def recover(ident):
    async with transaction() as conn:
        order = await read(conn, ident)
        await store.lock_account(conn, order["owner_id"])
        events = await pending_events(conn, order)
        if events:
            await conn.execute(
                "UPDATE billing_events SET attempts=0,last_error=NULL "
                "WHERE id=ANY(%s) AND processed_at IS NULL",
                ([e["id"] for e in events],),
            )
        await store.audit(conn, order, "inbox_recovery_requested", {"events": len(events)})
    for event in events:
        await service.attempt_event(event)
    await service.sync(ident)
    return await inspect(ident)


async def run(args):
    try:
        result = await (recover if args.command == "retry" else inspect)(args.order_id)
        print(json.dumps(result, default=str, indent=2))
        return 2 if result["reconciliation_pending"] or result["pending_events"] else 0
    except HTTPException as error:
        print(json.dumps({"error": error.detail, "status_code": error.status_code}))
        return 2
    finally:
        await close_pool()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("inspect", "retry"))
    parser.add_argument("--order-id", type=UUID, required=True)
    raise SystemExit(asyncio.run(run(parser.parse_args())))
