"""Atomic resource admission and receipts; provider calls never hold database locks."""

import math
from dataclasses import asdict
from datetime import UTC, datetime, timedelta
from uuid import uuid4

from fastapi import HTTPException

from ngertiin.chat.store import json_value, one
from ngertiin.sandbox.contracts import RuntimePending
from ngertiin.tasks import store as tasks


async def require_reconciled(conn, task):
    row = await one(
        conn,
        "SELECT id FROM sandbox_sessions WHERE task_id=%s AND state<>'deleted' LIMIT 1",
        (task["id"],),
    )
    if row:
        raise RuntimePending("Resource sebelumnya masih diperiksa. Gunakan Periksa outcome.")


async def reserve(execution):
    rules = execution["budget_policy"]["sandbox"]
    async with tasks.locked(execution["owner_id"], execution["id"]) as (conn, task):
        tasks.fence(task, execution)
        await require_reconciled(conn, task)
        await conn.execute("SELECT pg_advisory_xact_lock(330035)")
        usage = await one(
            conn,
            "SELECT COALESCE(sum(charged_microusd),0) AS total, "
            "COALESCE(sum(charged_microusd) FILTER(WHERE owner_id=%s),0) AS account, "
            "count(*) FILTER(WHERE active) AS active, "
            "count(*) FILTER(WHERE active AND owner_id=%s) AS owner_active FROM ("
            "SELECT owner_id,charged_microusd,state<>'deleted' AS active FROM sandbox_sessions "
            "WHERE budget_day=%s OR state<>'deleted' UNION ALL "
            "SELECT owner_id,charged_microusd,state<>'stopped' FROM computer_sessions "
            "WHERE budget_day=%s OR state<>'stopped') u",
            (task["owner_id"], task["owner_id"], task["budget_day"], task["budget_day"]),
        )
        previous = await one(
            conn,
            "SELECT count(*) AS sessions,COALESCE(sum(charged_microusd),0) AS charged "
            "FROM sandbox_sessions WHERE task_id=%s",
            (task["id"],),
        )
        cap = rules["session_microusd"]
        if (
            usage["total"] + cap > rules["global_daily_microusd"]
            or usage["account"] + cap > rules["account_daily_microusd"]
            or previous["charged"] + cap > rules["task_microusd"]
            or previous["sessions"] >= rules["max_sessions"]
        ):
            raise ValueError("Batas biaya komputasi tercapai. Hasil yang tersimpan tetap tersedia.")
        if (
            usage["active"] >= rules["global_concurrency"]
            or usage["owner_active"] >= rules["account_concurrency"]
        ):
            raise ValueError("Komputasi lain masih aktif. Tunggu cleanup sebelum mencoba lagi.")
        ident = uuid4()
        return await one(
            conn,
            "INSERT INTO sandbox_sessions(id,owner_id,task_id,execution_id,task_revision,provider,"
            "resource_name,policy,budget_day,reserved_microusd,charged_microusd,deadline) "
            "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *",
            (
                ident,
                task["owner_id"],
                task["id"],
                execution["execution_id"],
                task["revision"],
                rules["provider"],
                f"ng035-{ident}",
                json_value(rules),
                task["budget_day"],
                cap,
                cap,
                datetime.now(UTC) + timedelta(minutes=rules["ttl_minutes"]),
            ),
        )


async def active_change(execution, session_id, state, *, resource_id=None):
    async with tasks.locked(execution["owner_id"], execution["id"]) as (conn, task):
        tasks.fence(task, execution)
        row = await one(
            conn,
            "UPDATE sandbox_sessions SET state=%s,resource_id=COALESCE(%s,resource_id) "
            "WHERE id=%s AND task_id=%s AND owner_id=%s AND execution_id=%s "
            "AND state IN ('reserved','provisioning','ready','running') RETURNING id",
            (
                state,
                resource_id,
                session_id,
                task["id"],
                task["owner_id"],
                execution["execution_id"],
            ),
        )
        if not row:
            raise tasks.StaleExecution()


async def dispatch(execution, session_id, position, code):
    import hashlib

    async with tasks.locked(execution["owner_id"], execution["id"]) as (conn, task):
        tasks.fence(task, execution)
        session = await one(
            conn, "SELECT * FROM sandbox_sessions WHERE id=%s FOR UPDATE", (session_id,)
        )
        if (
            session["execution_id"] != execution["execution_id"]
            or session["state"] not in ("ready", "running")
            or session["deadline"] <= datetime.now(UTC)
            or position >= session["policy"]["max_steps"]
        ):
            raise RuntimePending("Sesi komputasi tidak lagi mengizinkan dispatch.")
        pending = await one(
            conn,
            "SELECT id FROM sandbox_steps WHERE session_id=%s AND state<>'complete'",
            (session_id,),
        )
        if pending:
            raise RuntimePending("Eksekusi sebelumnya belum memiliki receipt yang pasti.")
        step = uuid4()
        await conn.execute(
            "INSERT INTO sandbox_steps(id,session_id,position,code,code_sha256,state) "
            "VALUES (%s,%s,%s,%s,%s,'dispatched')",
            (step, session_id, position, code, hashlib.sha256(code.encode()).hexdigest()),
        )
        await conn.execute("UPDATE sandbox_sessions SET state='running' WHERE id=%s", (session_id,))
        return step


async def receipt(step_id, receipt=None):
    # Receipts/cost may arrive after stop, but never grant publication authority.
    async with tasks.transaction() as conn:
        await conn.execute(
            "UPDATE sandbox_steps SET state=%s,receipt=%s,finished_at=now() "
            "WHERE id=%s AND state='dispatched'",
            (
                "complete" if receipt else "unknown",
                json_value(asdict(receipt) if receipt else {}),
                step_id,
            ),
        )


async def resource_state(session, state, error=None):
    async with tasks.transaction() as conn:
        await conn.execute(
            "UPDATE sandbox_sessions SET state=%s,error=%s,"
            "cost_state=CASE WHEN %s='unknown' THEN 'unknown' ELSE cost_state END "
            "WHERE id=%s AND state<>'deleted'",
            (state, error, state, session["id"]),
        )


async def deleted(session):
    async with tasks.transaction() as conn:
        row = await one(
            conn, "SELECT * FROM sandbox_sessions WHERE id=%s FOR UPDATE", (session["id"],)
        )
        if row["state"] == "deleted":
            return
        elapsed = (datetime.now(UTC) - row["created_at"]).total_seconds()
        maximum = row["policy"]["ttl_minutes"] * 60 + row["policy"]["cleanup_margin_seconds"]
        # Usage-derived estimate, explicitly not a provider invoice. Include all
        # observed wall time (also provisioning/stopped) and fixed reserved disk.
        charge = min(
            row["reserved_microusd"],
            math.ceil(min(elapsed, maximum) * row["policy"]["microusd_per_hour"] / 3600),
        )
        if session["state"] == "reserved" and session["resource_id"] is None:
            charge = 0  # Model work is accounted separately; no create was dispatched.
        await conn.execute(
            "UPDATE sandbox_sessions SET state='deleted',deleted_at=now(),cost_state='estimated',"
            "charged_microusd=%s,error=NULL,usage=%s WHERE id=%s",
            (
                charge,
                json_value(
                    {"observed_wall_seconds": round(elapsed, 3), "invoice_confirmed": False}
                ),
                row["id"],
            ),
        )


async def summary(conn, task):
    rows = await (
        await conn.execute(
            "SELECT id,state,reserved_microusd,charged_microusd,cost_state,usage,error,"
            "created_at,deleted_at FROM sandbox_sessions WHERE task_id=%s AND owner_id=%s "
            "ORDER BY created_at",
            (task["id"], task["owner_id"]),
        )
    ).fetchall()
    return rows


async def owned_output(conn, owner, task_id, output_id):
    task = await tasks.owned(conn, owner, task_id)
    table = "computer_outputs" if task.get("runtime_kind") == "browser" else "sandbox_outputs"
    row = await one(
        conn,
        f"SELECT * FROM {table} WHERE id=%s AND task_id=%s AND owner_id=%s AND purged_at IS NULL",
        (output_id, task_id, owner),
    )
    if not row:
        raise HTTPException(404, "Berkas komputasi tidak ditemukan.")
    if task.get("result_id"):
        result = await one(
            conn, "SELECT deleted_at FROM product_results WHERE id=%s", (task["result_id"],)
        )
        if not result or result["deleted_at"]:
            raise HTTPException(404, "Berkas komputasi tidak ditemukan.")
    return row
