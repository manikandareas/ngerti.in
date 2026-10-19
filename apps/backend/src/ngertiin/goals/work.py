"""Admission binds work to reviewed intent and the remaining parent budget."""

from fastapi import HTTPException

from ngertiin.chat.store import one
from ngertiin.goals import store
from ngertiin.goals.contracts import GoalRef
from ngertiin.tasks.budget import AdmissionDenied


async def capture(conn, owner, ref: GoalRef):
    goal = await store.owned(conn, owner, ref.id, lock=True)
    if goal["state"] != "active" or goal["plan_revision"] != ref.revision:
        raise HTTPException(409, "Tujuan dijeda/selesai atau target berubah. Tinjau rencana baru.")
    return goal


async def admit(conn, owner, ref: GoalRef, policy, *, task=None):
    goal = await capture(conn, owner, ref)
    spent = await store.budget(conn, goal["id"], exclude_task=task["id"] if task else None)
    remaining = goal["spec"]["budget_cap"] - spent["committed"]
    if task:
        remaining -= task["usage_units"]
        required = task["budget_cap"] - task["usage_units"]
        if remaining < required:
            raise AdmissionDenied("budget", "Sisa batas kerja tujuan tidak cukup untuk retry.")
    if remaining < 1:
        raise AdmissionDenied(
            "budget", "Batas kerja tujuan tercapai. Tinjau tujuan sebelum lanjut."
        )
    policy["task_cap"] = min(policy["task_cap"], remaining)
    return {
        "id": str(goal["id"]),
        "revision": goal["plan_revision"],
        "record_revision": goal["revision"],
        "spec": goal["spec"],
    }


async def schedule_block(conn, owner, ref):
    if not ref:
        return None
    goal = await one(
        conn, "SELECT * FROM user_goals WHERE id=%s AND owner_id=%s", (ref["id"], owner)
    )
    if not goal or goal["state"] != "active":
        return "Tujuan dijeda, selesai atau diarsipkan; tidak membuat Task baru."
    if goal["plan_revision"] != ref["revision"]:
        return "Target tujuan berubah. Tinjau ulang jadwal dan revisi target sebelum lanjut."
    return None
