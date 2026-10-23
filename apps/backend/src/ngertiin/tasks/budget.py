"""Reserve finite work before admission/calls; uncertain provider work remains charged."""

from uuid import uuid4

from fastapi import HTTPException

from ngertiin.accounts.access import unlimited_usage
from ngertiin.chat.store import json_value, one
from ngertiin.tasks import store
from ngertiin.tasks.policy import snapshot


class AdmissionDenied(HTTPException):
    def __init__(self, reason: str, message: str):
        super().__init__(429, message)
        self.reason = reason


class BudgetExhausted(ValueError):
    """No provider request was admitted; the caller can finalize existing evidence."""


def metered_browser(policy):
    return policy.get("unit") == "metered_browser_work"


async def admit(conn, owner, policy: dict, *, day=None):
    # All callers already hold owner -> thread -> task locks. Never acquire an
    # owner lock after this global admission lock.
    await conn.execute("SELECT pg_advisory_xact_lock(330033)")
    usage = await one(
        conn,
        "SELECT COALESCE(sum(CASE WHEN status IN ('succeeded','failed','cancelled') "
        "THEN usage_units ELSE budget_cap END),0) AS total, "
        "COALESCE(sum(CASE WHEN owner_id=%s THEN CASE "
        "WHEN status IN ('succeeded','failed','cancelled') THEN usage_units ELSE budget_cap END "
        "ELSE 0 END),0) AS account FROM background_tasks "
        "WHERE budget_day=COALESCE(%s::date,(now() AT TIME ZONE 'UTC')::date) "
        "AND budget_policy->>'unit'<>'metered_browser_work'",
        (owner, day),
    )
    if (
        not unlimited_usage(owner)
        and not metered_browser(policy)
        and (
            usage["account"] + policy["task_cap"] > policy["account_daily_cap"]
            or usage["total"] + policy["task_cap"] > policy["global_daily_cap"]
        )
    ):
        raise AdmissionDenied(
            "budget", "Batas komputasi task hari ini tercapai. Coba lagi besok (UTC)."
        )
    active = await one(
        conn,
        "SELECT count(*) AS n FROM background_tasks WHERE owner_id=%s "
        "AND status IN ('queued','running')",
        (owner,),
    )
    if active["n"] >= 2:
        raise AdmissionDenied(
            "capacity", "Dua task sedang berjalan. Tunggu atau hentikan salah satunya."
        )


async def reserve_call(
    execution: dict, ceiling: int, *, model: str | None = None, role: str = "task"
):
    async with store.locked(execution["owner_id"], execution["id"]) as (conn, task):
        store.fence(task, execution)
        policy = task["budget_policy"]
        model = model or policy["model"]
        # Browser work is metered, not stopped by a second byte-based token cap.
        # Two calls remain available for synthesis/verification after exploration.
        exploration = role in ("browser_decision", "browser_text", "browser_vision")
        reserve_calls = exploration and policy.get("computer", {}).get("workflow_version", 1) >= 2
        limit = policy["max_calls"] - (2 if reserve_calls else 0)
        if task["model_calls"] >= limit or (
            not metered_browser(policy) and task["usage_units"] + ceiling > task["budget_cap"]
        ):
            raise BudgetExhausted("Batas panggilan tercapai; selesaikan bukti yang tersedia.")
        call_id = uuid4()
        await conn.execute(
            "INSERT INTO task_cost_events(id,task_id,execution_id,provider,model,policy_version,"
            "reserved_units,charged_units,state,role) VALUES "
            "(%s,%s,%s,%s,%s,%s,%s,%s,'reserved',%s)",
            (
                call_id,
                task["id"],
                execution["execution_id"],
                "typesafe" if model.startswith("jev-") else "openai-compatible",
                model,
                policy["version"],
                ceiling,
                ceiling,
                role,
            ),
        )
        from ngertiin.usage.events import model_reserve, work_for_task

        work = await work_for_task(conn, task)
        if work:
            await model_reserve(
                conn,
                task["owner_id"],
                f"task-model:{call_id}",
                model,
                ceiling,
                work=work,
                kind="model",
            )
        await store.change(
            conn,
            task,
            usage_units=task["usage_units"] + ceiling,
            model_calls=task["model_calls"] + 1,
        )
        await store.emit(conn, task)
        return call_id


async def settle_call(execution: dict, call_id, usage: dict | None):
    # Usage reconciliation is allowed after cancellation; content/checkpoint
    # publication still requires the live lease. Never invent zero vendor cost.
    async with store.locked(execution["owner_id"], execution["id"]) as (conn, task):
        event = await one(
            conn,
            "SELECT * FROM task_cost_events WHERE id=%s AND task_id=%s FOR UPDATE",
            (call_id, task["id"]),
        )
        if not event or event["state"] == "confirmed":
            return
        total = (usage or {}).get("total_tokens")
        confirmed = type(total) is int and 0 < total <= event["reserved_units"]
        charged = total if confirmed else event["reserved_units"]
        await conn.execute(
            "UPDATE task_cost_events SET "
            "state=%s,charged_units=%s,usage=%s,settled_at=now() WHERE id=%s",
            ("confirmed" if confirmed else "unknown", charged, json_value(usage or {}), call_id),
        )
        await store.change(
            conn, task, usage_units=task["usage_units"] - event["charged_units"] + charged
        )
        from ngertiin.usage.events import refresh

        await refresh(conn, task["owner_id"])
        await store.emit(conn, task)


async def abandon_calls(conn, task: dict):
    await conn.execute(
        "UPDATE task_cost_events SET state='unknown',settled_at=now() "
        "WHERE task_id=%s AND state='reserved'",
        (task["id"],),
    )


async def summary(owner):
    async with store.transaction() as conn:
        rows = await (
            await conn.execute(
                "SELECT status,budget_cap,usage_units FROM background_tasks WHERE owner_id=%s "
                "AND budget_day=(now() AT TIME ZONE 'UTC')::date "
                "AND budget_policy->>'unit'<>'metered_browser_work'",
                (owner,),
            )
        ).fetchall()
    return {
        "policy": snapshot(),
        "used": sum(row["usage_units"] for row in rows),
        "reserved": sum(
            row["budget_cap"] - row["usage_units"]
            for row in rows
            if row["status"] not in ("succeeded", "failed", "cancelled")
        ),
    }
