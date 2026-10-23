"""Adapters reuse native attempt identities; lifecycle reconciliation never dispatches work."""

from uuid import uuid5

from psycopg.types.json import Jsonb

from ngertiin.chat.store import one
from ngertiin.usage import ledger, prices


async def work_for_task(conn, task):
    return await one(
        conn,
        "SELECT * FROM compute_work WHERE owner_id=%s AND resource_key=%s",
        (task["owner_id"], f"task:{task['id']}"),
    )


async def model_reserve(conn, owner, identity, model, tokens, *, work=None, kind="background"):
    if work is None:
        p = await ledger.period(conn, owner)
        price = p["policy"]["prices"].get(model, prices.snapshot(model))
        work = await ledger.open_work(
            conn,
            owner,
            identity,
            kind,
            {"memory": "Pemrosesan memory", "proactive": "Evaluasi proaktif"}.get(
                kind, "Pemrosesan background"
            ),
            prices.maximum(tokens, price),
        )
    price = work["policy"]["prices"].get(model, prices.snapshot(model))
    return await ledger.reserve_event(
        conn,
        work,
        identity,
        kind,
        "typesafe" if model.startswith("jev-") else "openai-compatible",
        price,
        prices.maximum(tokens, price),
        model=model,
    )


async def resource_reserve(conn, task, row, kind):
    work = await work_for_task(conn, task)
    if work:
        await ledger.reserve_event(
            conn,
            work,
            f"{kind}:{row['id']}",
            kind,
            row["policy"]["provider"],
            {key: value for key, value in row["policy"].items() if key not in ("allowed_urls",)},
            row["reserved_microusd"],
        )


# Fixed queries only; none of these table names are selected by the client or model.
SOURCES = {
    "task-model": "SELECT state,usage,charged_units FROM task_cost_events WHERE id=%s",
    "memory": "SELECT state,usage,charged_units FROM memory_cost_events WHERE id=%s",
    "proactive": "SELECT state,usage,charged_units FROM proactive_cost_events WHERE id=%s",
    "sandbox": "SELECT cost_state AS state,charged_microusd AS amount,usage "
    "FROM sandbox_sessions WHERE id=%s",
    "computer": "SELECT cost_state AS state,charged_microusd AS amount,usage "
    "FROM computer_sessions WHERE id=%s",
    "ocr": "SELECT status AS state,charged_pages,usage FROM file_extractions WHERE id=%s",
}


async def refresh(conn, owner):
    await ledger.period(conn, owner)
    rows = await (
        await conn.execute(
            "SELECT e.*,w.owner_id,w.resource_key,w.kind FROM compute_events e JOIN compute_work w "
            "ON w.id=e.work_id WHERE w.owner_id=%s AND e.state IN ('reserved','unknown') "
            "ORDER BY e.updated_at LIMIT 200",
            (owner,),
        )
    ).fetchall()
    for event in rows:
        kind, key = event["identity"].split(":", 1)
        if kind not in SOURCES:
            continue
        await conn.execute("UPDATE compute_events SET updated_at=now() WHERE id=%s", (event["id"],))
        native = await one(conn, SOURCES[kind], (key,))
        if not native or native["state"] in ("reserved", "running", "queued"):
            continue
        if kind in ("sandbox", "computer"):
            amount, state = native["amount"], native["state"]
        elif kind == "ocr":
            amount = prices.ceiling(native["charged_pages"] * event["price"]["microusd_per_page"])
            state = "estimated" if native["state"] in ("ready", "failed") else "unknown"
        else:
            amount, state = prices.model_cost(native["usage"], event["price"], event["reserved"])
            if native["state"] == "unknown":
                amount, state = event["reserved"], "unknown"
        await ledger.settle_event(conn, owner, event["identity"], amount, state, native["usage"])
        if event["kind"] in ("memory", "proactive", "ocr"):
            await ledger.finish(conn, owner, event["resource_key"])


def memory_reserve(conn, owner, call, model, tokens):
    """Synchronous SDK hook, using the same statements/policy as async admission."""

    price = prices.snapshot(model)
    amount = prices.maximum(tokens, price)
    key = f"memory:{call}"
    values = ledger.period_values(
        owner, conn.execute(ledger.WINDOW, (owner, owner, owner)).fetchone()
    )
    conn.execute(ledger.PERIOD_INSERT, values)
    p = conn.execute("SELECT * FROM compute_periods WHERE id=%s", (values[0],)).fetchone()
    price = p["policy"]["prices"].get(model, price)
    amount = prices.maximum(tokens, price)
    conn.execute("SELECT pg_advisory_xact_lock(400040)")
    day = conn.execute("SELECT (now() AT TIME ZONE 'UTC')::date AS d").fetchone()["d"]
    totals = conn.execute(ledger.TOTALS, (p["id"], p["id"], owner, day, day)).fetchone()
    ledger.ensure_capacity(totals, p, p["policy"], amount)
    wid, eid = uuid5(owner, "compute:" + key), uuid5(owner, "cost:" + key)
    conn.execute(
        "INSERT INTO compute_work(id,owner_id,period_id,resource_key,kind,title,cap,policy) "
        "VALUES (%s,%s,%s,%s,'memory','Pemrosesan memory',%s,%s)",
        (wid, owner, p["id"], key, amount, Jsonb(p["policy"])),
    )
    conn.execute(
        "INSERT INTO compute_events(id,work_id,identity,category,provider,model,price,"
        "reserved,amount,state) VALUES (%s,%s,%s,'memory','openai-compatible',%s,%s,%s,%s,"
        "'reserved')",
        (eid, wid, key, model, Jsonb(price), amount, amount),
    )
    conn.execute(
        "INSERT INTO compute_audit(work_id,event_id,action,amount,state) VALUES "
        "(%s,%s,'dispatch',%s,'reserved')",
        (wid, eid, amount),
    )
