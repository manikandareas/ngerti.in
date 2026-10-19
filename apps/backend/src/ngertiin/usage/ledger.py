"""Atomic allowance admission; provider cost remains auditable after customer refunds."""

from uuid import uuid5

from psycopg.types.json import Jsonb

from ngertiin.chat.store import lock_account, one
from ngertiin.tasks.budget import AdmissionDenied
from ngertiin.usage import policy

# Mirrors the trusted grant/free-window contract, shared with the synchronous memory adapter.
WINDOW = """
WITH clock AS (SELECT clock_timestamp() AS t), a AS (
 SELECT * FROM accounts WHERE id=%s
), g AS (
 SELECT * FROM quota_grants WHERE owner_id=%s
 AND starts_at<=(SELECT t FROM clock) AND ends_at>(SELECT t FROM clock)
), anchor AS (
 SELECT COALESCE((SELECT max(ends_at) FROM quota_grants
 WHERE owner_id=a.id AND ends_at<=(SELECT t FROM clock)), a.created_at) AS t FROM a
), win AS (
 SELECT t + floor(extract(epoch FROM ((SELECT t FROM clock)-t))/2592000)
 *interval '30 days' AS t FROM anchor
)
SELECT CASE WHEN g.id IS NULL THEN 'free' ELSE 'plus' END AS plan,
 COALESCE(g.starts_at,win.t) AS starts_at,
 COALESCE(g.ends_at,LEAST(win.t+interval '30 days',
 (SELECT min(starts_at) FROM quota_grants
 WHERE owner_id=%s AND starts_at>(SELECT t FROM clock)))) AS ends_at
FROM win LEFT JOIN g ON true
"""
PERIOD_INSERT = """INSERT INTO compute_periods(id,owner_id,starts_at,ends_at,plan,policy)
VALUES (%s,%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING"""
TOTALS = """SELECT COALESCE(sum(used+reserved) FILTER(WHERE period_id=%s),0) AS period,
COALESCE(sum(GREATEST(vendor_cost,CASE WHEN state='active' THEN cap ELSE 0 END))
 FILTER(WHERE period_id=%s),0) AS vendor_period,
COALESCE(sum(GREATEST(vendor_cost,CASE WHEN state='active' THEN cap ELSE 0 END))
 FILTER(WHERE owner_id=%s AND budget_day=%s),0) AS account,
COALESCE(sum(GREATEST(vendor_cost,CASE WHEN state='active' THEN cap ELSE 0 END))
 FILTER(WHERE budget_day=%s),0) AS global FROM compute_balances"""


def period_values(owner, window):
    pid = uuid5(owner, f"compute:{window['plan']}:{window['starts_at'].isoformat()}")
    return (
        pid,
        owner,
        window["starts_at"],
        window["ends_at"],
        window["plan"],
        Jsonb(policy.snapshot()),
    )


async def period(conn, owner):
    await lock_account(conn, owner)
    values = period_values(owner, await one(conn, WINDOW, (owner, owner, owner)))
    await conn.execute(PERIOD_INSERT, values)
    # A newly verified grant can shorten the current Free cycle.
    await conn.execute(
        "UPDATE compute_periods SET ends_at=LEAST(ends_at,%s) WHERE id=%s", (values[3], values[0])
    )
    return await one(conn, "SELECT * FROM compute_periods WHERE id=%s", (values[0],))


def ensure_capacity(totals, p, rules, amount):
    if totals["period"] + amount > p["policy"][p["plan"]]:
        raise AdmissionDenied(
            "budget",
            "Sisa komputasi tidak cukup untuk batas pekerjaan ini. "
            "Lihat Penggunaan untuk cadangan aktif dan waktu reset.",
        )
    if (
        totals["vendor_period"] + amount
        > p["policy"][p["plan"]] * p["policy"].get("vendor_period_percent", 120) // 100
    ):
        raise AdmissionDenied(
            "budget",
            "Batas operasional komputasi periode ini tercapai. "
            "Allowance yang dikembalikan tetap tercatat; hasil dan kontrol tetap tersedia.",
        )
    if totals["account"] + amount > rules["account_daily_cap"]:
        raise AdmissionDenied(
            "budget",
            "Batas komputasi harian akun tercapai. "
            "Hasil dan kontrol tetap tersedia. Coba pekerjaan baru setelah pergantian hari UTC.",
        )
    if totals["global"] + amount > rules["global_daily_cap"]:
        raise AdmissionDenied(
            "budget",
            "Kapasitas komputasi layanan hari ini tercapai. "
            "Hasil dan kontrol tetap tersedia. Coba pekerjaan baru setelah pergantian hari UTC.",
        )


async def open_work(conn, owner, key, kind, title, cap, *, task=None, thread=None):
    await lock_account(conn, owner)
    previous = await one(
        conn, "SELECT * FROM compute_work WHERE owner_id=%s AND resource_key=%s", (owner, key)
    )
    if previous:
        return previous
    p = await period(conn, owner)
    rules = p["policy"]
    await conn.execute("SELECT pg_advisory_xact_lock(400040)")
    day = (await one(conn, "SELECT (now() AT TIME ZONE 'UTC')::date AS d"))["d"]
    totals = await one(conn, TOTALS, (p["id"], p["id"], owner, day, day))
    ensure_capacity(totals, p, rules, cap)
    work = await one(
        conn,
        "INSERT INTO compute_work(id,owner_id,period_id,resource_key,kind,"
        "title,cap,policy,task_id,thread_id) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) "
        "RETURNING *",
        (
            uuid5(owner, "compute:" + key),
            owner,
            p["id"],
            key,
            kind,
            title[:120],
            cap,
            Jsonb(rules),
            task,
            thread,
        ),
    )
    await audit(conn, work["id"], "reserve", cap, "active")
    return work


async def audit(conn, work, action, amount, state, event=None):
    await conn.execute(
        "INSERT INTO compute_audit(work_id,event_id,action,amount,state) VALUES (%s,%s,%s,%s,%s)",
        (work, event, action, amount, state),
    )


async def finish(conn, owner, key, *, refund=False):
    await lock_account(conn, owner)
    row = await one(
        conn,
        "UPDATE compute_work SET state=%s,updated_at=now() WHERE owner_id=%s "
        "AND resource_key=%s AND state='active' RETURNING *",
        ("refunded" if refund else "settled", owner, key),
    )
    if row:
        if refund:
            await conn.execute(
                "UPDATE compute_events SET customer_refunded=true WHERE work_id=%s", (row["id"],)
            )
        await audit(conn, row["id"], "refund" if refund else "settle", row["cap"], row["state"])


async def reopen(conn, owner, key):
    await lock_account(conn, owner)
    row = await one(
        conn, "SELECT * FROM compute_balances WHERE owner_id=%s AND resource_key=%s", (owner, key)
    )
    if not row or row["state"] == "active":
        return
    p = await one(conn, "SELECT * FROM compute_periods WHERE id=%s", (row["period_id"],))
    await conn.execute("SELECT pg_advisory_xact_lock(400040)")
    totals = await one(
        conn, TOTALS, (p["id"], p["id"], owner, row["budget_day"], row["budget_day"])
    )
    ensure_capacity(totals, p, row["policy"], row["cap"] - row["used"] - row["reserved"])
    await conn.execute(
        "UPDATE compute_work SET state='active',updated_at=now() WHERE id=%s", (row["id"],)
    )
    await audit(conn, row["id"], "retry", row["cap"], "active")


async def reserve_event(conn, work, identity, category, provider, price, amount, *, model=None):
    await lock_account(conn, work["owner_id"])
    eid = uuid5(work["owner_id"], "cost:" + identity)
    previous = await one(conn, "SELECT * FROM compute_events WHERE id=%s", (eid,))
    if previous:
        if previous["work_id"] != work["id"] or previous["reserved"] != amount:
            raise ValueError("Identitas biaya dipakai untuk pekerjaan berbeda.")
        return previous
    current = await one(conn, "SELECT * FROM compute_balances WHERE id=%s", (work["id"],))
    if current["state"] != "active" or current["vendor_cost"] + amount > work["cap"]:
        raise AdmissionDenied(
            "budget", "Batas komputasi pekerjaan tercapai. Hasil tetap tersimpan."
        )
    event = await one(
        conn,
        "INSERT INTO compute_events(id,work_id,identity,category,provider,model,"
        "price,reserved,amount,state) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,'reserved') "
        "RETURNING *",
        (eid, work["id"], identity, category, provider, model, Jsonb(price), amount, amount),
    )
    await audit(conn, work["id"], "dispatch", amount, "reserved", eid)
    return event


async def settle_event(conn, owner, identity, amount, state, quantity):
    await lock_account(conn, owner)
    event = await one(
        conn,
        "SELECT e.* FROM compute_events e JOIN compute_work w ON w.id=e.work_id "
        "WHERE e.identity=%s AND w.owner_id=%s FOR UPDATE OF e",
        (identity, owner),
    )
    if not event:
        return  # Historical attempts are never charged retroactively.
    eid = event["id"]
    if event["state"] in ("confirmed", "estimated"):
        return
    if event["state"] == state and event["amount"] == amount and event["quantity"] == quantity:
        return
    await conn.execute(
        "UPDATE compute_events SET amount=%s,state=%s,quantity=%s,updated_at=now() WHERE id=%s",
        (amount, state, Jsonb(quantity), eid),
    )
    await audit(conn, event["work_id"], "cost_settled", amount, state, eid)
