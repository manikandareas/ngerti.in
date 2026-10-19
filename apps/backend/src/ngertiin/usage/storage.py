"""Owned S3 I/O telemetry. Storage operations are sponsored, including downloads at zero balance."""

from uuid import UUID, uuid4

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from ngertiin.config import get_settings
from ngertiin.usage import ledger, prices


def begin(key, operation, size=0):
    parts = key.split("/")
    if len(parts) < 3 or parts[0] != "accounts":
        return None
    try:
        owner = UUID(parts[1])
    except ValueError:
        return None
    settings = get_settings()
    # Conservative standard S3-equivalent accounting for local MinIO; no invoice claim.
    # Includes 30-day object capacity on PUT. Provider retries are reserved separately.
    per_attempt = prices.ceiling(
        (0 if operation == "delete" else 4.5 if operation == "put" else 0.36)
        + (size * 15000 / 1_000_000_000 if operation == "put" else 0)
    )
    cap = per_attempt * 3
    with psycopg.connect(settings.database_url.get_secret_value(), row_factory=dict_row) as conn:
        account = conn.execute(
            "SELECT id FROM accounts WHERE id=%s FOR UPDATE", (owner,)
        ).fetchone()
        if not account:
            return None
        values = ledger.period_values(
            owner, conn.execute(ledger.WINDOW, (owner, owner, owner)).fetchone()
        )
        conn.execute(ledger.PERIOD_INSERT, values)
        wid, eid = uuid4(), uuid4()
        price = {
            "version": "s3-configured-2026-10-19",
            "route": "configured-standard-equivalent",
            "per_attempt_microusd": per_attempt,
            "capacity_days": 30 if operation == "put" else 0,
            "billing": "sponsored",
            "currency": "USD",
            "invoice_confirmed": False,
        }
        conn.execute(
            "INSERT INTO compute_work(id,owner_id,period_id,resource_key,kind,title,cap,"
            "policy,state) VALUES (%s,%s,%s,%s,'storage','Penyimpanan file',%s,%s,'refunded')",
            (wid, owner, values[0], f"storage:{eid}", cap, values[5]),
        )
        conn.execute(
            "INSERT INTO compute_events(id,work_id,identity,category,provider,price,"
            "reserved,amount,state,customer_refunded) VALUES (%s,%s,%s,'storage','s3',"
            "%s,%s,%s,'reserved',true)",
            (eid, wid, f"storage:{eid}", Jsonb(price), cap, cap),
        )
        conn.execute(
            "INSERT INTO compute_audit(work_id,event_id,action,amount,state) "
            "VALUES (%s,%s,'sponsored_reserve',%s,'reserved')",
            (wid, eid, cap),
        )
    return {
        "owner": owner,
        "work": wid,
        "id": eid,
        "rate": per_attempt,
        "cap": cap,
        "operation": operation,
        "bytes": size,
    }


def finish(receipt, response=None, *, bytes_read=0):
    if not receipt:
        return
    confirmed = response is not None
    retries = (response or {}).get("ResponseMetadata", {}).get("RetryAttempts", 0)
    attempts = 1 + retries if type(retries) is int and retries >= 0 else 3
    amount = receipt["rate"] * attempts if confirmed else receipt["cap"]
    quantity = {
        "operation": receipt["operation"],
        "bytes": bytes_read or receipt["bytes"],
        "attempts": attempts if confirmed else None,
        "quantity_state": "confirmed" if confirmed else "unknown",
        "capacity": "30-day upper estimate on put",
        "egress_cost_state": "unknown",
        "sponsored": True,
    }
    with psycopg.connect(get_settings().database_url.get_secret_value()) as conn:
        conn.execute("SELECT id FROM accounts WHERE id=%s FOR UPDATE", (receipt["owner"],))
        row = conn.execute(
            "UPDATE compute_events SET amount=%s,state=%s,quantity=%s,updated_at=now() "
            "WHERE id=%s AND state='reserved' RETURNING id",
            (amount, "estimated" if confirmed else "unknown", Jsonb(quantity), receipt["id"]),
        ).fetchone()
        if row:
            conn.execute(
                "INSERT INTO compute_audit(work_id,event_id,action,amount,state) "
                "VALUES (%s,%s,%s,%s,%s)",
                (
                    receipt["work"],
                    receipt["id"],
                    "sponsored_settle",
                    amount,
                    "estimated" if confirmed else "unknown",
                ),
            )
