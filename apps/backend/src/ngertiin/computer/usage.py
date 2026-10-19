"""Atomic shared compute caps and conservative retained-profile cost reservations."""

import math
from datetime import UTC, datetime, timedelta
from uuid import uuid4

from ngertiin.chat.store import json_value, one


async def reserve(conn, task, workspace, rules):
    usage = await one(
        conn,
        "SELECT COALESCE(sum(charged),0) AS total,"
        "COALESCE(sum(charged) FILTER(WHERE owner_id=%s),0) AS account,"
        "count(*) FILTER(WHERE active) AS active,"
        "count(*) FILTER(WHERE active AND owner_id=%s) AS account_active FROM ("
        "SELECT owner_id,charged_microusd AS charged,state<>'deleted' AS active "
        "FROM sandbox_sessions WHERE budget_day=%s OR state<>'deleted' UNION ALL "
        "SELECT owner_id,charged_microusd,state<>'stopped' FROM computer_sessions "
        "WHERE budget_day=%s OR state<>'stopped') u",
        (task["owner_id"], task["owner_id"], task["budget_day"], task["budget_day"]),
    )
    previous = await one(
        conn, "SELECT count(*) AS n FROM computer_sessions WHERE task_id=%s", (task["id"],)
    )
    cap = rules["compute_reservation"] + rules["storage_reservation"]
    if (
        usage["total"] + cap > rules["global_daily_microusd"]
        or usage["account"] + cap > rules["account_daily_microusd"]
        or previous["n"] >= rules["max_sessions"]
    ):
        raise ValueError(
            "Batas biaya komputer tercapai. Profil dan hasil tersimpan tetap tersedia."
        )
    if usage["active"] >= rules["global_concurrency"] or usage["account_active"] >= 1:
        raise ValueError("Komputasi lain masih aktif. Tunggu penghentian resource.")
    return await one(
        conn,
        "INSERT INTO computer_sessions(id,workspace_id,owner_id,task_id,"
        "task_revision,policy,budget_day,reserved_microusd,charged_microusd,storage_microusd,deadline)"
        " VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *",
        (
            uuid4(),
            workspace["id"],
            task["owner_id"],
            task["id"],
            task["revision"],
            json_value(rules),
            task["budget_day"],
            cap,
            cap,
            rules["storage_reservation"],
            datetime.now(UTC) + timedelta(seconds=rules["seconds"]),
        ),
    )


async def settle(conn, session, usage):
    elapsed = max(0, (datetime.now(UTC) - session["created_at"]).total_seconds())
    rules = session["policy"]
    charge = min(
        rules["compute_reservation"],
        math.ceil(
            min(elapsed, rules["seconds"] + rules["cleanup_seconds"])
            * rules["microusd_per_hour"]
            / 3600
        ),
    )
    # Reserve the entire retention window on every use. Deliberately conservative;
    # no claim of exact provider billing or zero idle-disk cost.
    await conn.execute(
        "UPDATE computer_sessions SET state='stopped',stopped_at=now(),"
        "cost_state='estimated',charged_microusd=%s,usage=%s WHERE id=%s AND state<>'stopped'",
        (
            charge + session["storage_microusd"],
            json_value(
                {
                    **usage,
                    "observed_wall_seconds": round(elapsed, 3),
                    "invoice_confirmed": False,
                    "storage_reservation_policy": "full_retention_window_each_use",
                }
            ),
            session["id"],
        ),
    )
