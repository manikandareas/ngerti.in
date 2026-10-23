"""Owner-only usage, immutable receipts and non-binding preflight estimates."""

from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict, Field

from ngertiin.accounts.access import unlimited_usage
from ngertiin.accounts.auth import current_account
from ngertiin.async_db import transaction
from ngertiin.chat.store import one
from ngertiin.models import Account
from ngertiin.quotas.periods import current_period
from ngertiin.usage import events, ledger, policy
from ngertiin.usage.estimates import estimate

router = APIRouter(prefix="/usage", tags=["usage"])
AccountDep = Annotated[Account, Depends(current_account)]


def credits(amount):
    return round(float(amount) / policy.CREDIT, 3)


def public_work(row):
    return {
        k: row[k] for k in ("id", "kind", "title", "task_id", "thread_id", "state", "created_at")
    } | {
        "cap": credits(row["cap"]),
        "used": credits(row["used"]),
        "reserved": credits(row["reserved"]),
        "pending": credits(row["pending_cost"]),
        "refunded": row["state"] == "refunded",
        "sponsored": row["kind"] == "storage",
    }


async def summary(conn, owner, offset=0):
    await events.refresh(conn, owner)
    p = await ledger.period(conn, owner)
    totals = await one(
        conn,
        "SELECT COALESCE(sum(used),0) AS used, "
        "COALESCE(sum(reserved),0) AS reserved FROM compute_balances WHERE period_id=%s",
        (p["id"],),
    )
    limit = p["policy"][p["plan"]]
    rows = await (
        await conn.execute(
            "SELECT * FROM compute_balances WHERE owner_id=%s AND kind<>'storage' "
            "ORDER BY created_at DESC,id DESC LIMIT 31 OFFSET %s",
            (owner, offset),
        )
    ).fetchall()
    storage = await one(
        conn,
        "SELECT COALESCE(sum(size),0) AS bytes FROM ("
        "SELECT size FROM file_revisions WHERE owner_id=%s AND purged_at IS NULL UNION ALL "
        "SELECT size FROM sandbox_outputs WHERE owner_id=%s AND purged_at IS NULL) s",
        (owner, owner),
    )
    from ngertiin.config import get_settings

    return {
        "plan": p["plan"],
        "unlimited": unlimited_usage(owner),
        "plan_contract": {
            "chat_messages": (await current_period(conn, owner))["limits"]["chat"],
            "compute_credits": credits(limit),
            "period_days": policy.PLANS[p["plan"]]["period_days"],
        },
        "policy_version": p["policy"]["version"],
        "period": {"starts_at": p["starts_at"], "ends_at": p["ends_at"]},
        "compute": {
            "limit": credits(limit),
            "used": credits(totals["used"]),
            "reserved": credits(totals["reserved"]),
            "remaining": credits(max(0, limit - totals["used"] - totals["reserved"])),
        },
        "storage": {"bytes": storage["bytes"], "limit_bytes": get_settings().file_account_bytes},
        "items": [public_work(r) for r in rows[:30]],
        "next_offset": offset + 30 if len(rows) > 30 else None,
    }


@router.get("")
async def usage(account: AccountDep, offset: int = Query(default=0, ge=0, le=100000)):
    async with transaction() as conn:
        return await summary(conn, account.id, offset)


class EstimateInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    runtime_kind: Literal["text", "code", "browser"] = "text"
    inputs: list[UUID] = Field(default_factory=list, max_length=5)
    per_run_cap: int | None = Field(default=None, ge=1000, le=120000)


@router.post("/estimate")
async def work_estimate(body: EstimateInput, account: AccountDep):
    async with transaction() as conn:
        return await estimate(conn, account.id, body.runtime_kind, body.inputs, body.per_run_cap)


@router.get("/{work_id}")
async def receipt(work_id: UUID, account: AccountDep):
    from fastapi import HTTPException

    async with transaction() as conn:
        await events.refresh(conn, account.id)
        work = await one(
            conn,
            "SELECT * FROM compute_balances WHERE id=%s AND owner_id=%s",
            (work_id, account.id),
        )
        if not work:
            raise HTTPException(404, "Pemakaian tidak ditemukan.")
        costs = await (
            await conn.execute(
                "SELECT id,category,provider,model,state,quantity,price,"
                "amount,invoice_confirmed FROM compute_events WHERE work_id=%s "
                "ORDER BY created_at,id",
                (work_id,),
            )
        ).fetchall()
        audit = await (
            await conn.execute(
                "SELECT action,state,amount,created_at FROM compute_audit "
                "WHERE work_id=%s ORDER BY id",
                (work_id,),
            )
        ).fetchall()
        return {
            "work": public_work(work),
            "policy": work["policy"],
            "events": costs,
            "audit": audit,
        }
