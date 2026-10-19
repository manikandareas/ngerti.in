"""Authenticated schedule previews, decisions, Upcoming and run history."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends

from ngertiin.accounts.auth import current_account
from ngertiin.models import Account
from ngertiin.schedules import service, store
from ngertiin.schedules.contracts import DecisionInput, ProposalInput

router = APIRouter(tags=["schedules"])
AccountDep = Annotated[Account, Depends(current_account)]


@router.get("/schedules")
async def listing(account: AccountDep):
    return await store.listing(account.id)


@router.post("/schedules/proposals", status_code=201)
async def propose(body: ProposalInput, account: AccountDep):
    return await service.propose(account.id, body)


@router.post("/schedules/proposals/{proposal_id}/decision")
async def decide(proposal_id: UUID, body: DecisionInput, account: AccountDep):
    return await service.decide(account.id, proposal_id, body.approved)


@router.get("/schedules/{schedule_id}")
async def detail(schedule_id: UUID, account: AccountDep):
    from fastapi import HTTPException

    from ngertiin.async_db import transaction
    from ngertiin.chat.store import one

    async with transaction() as conn:
        row = await one(
            conn,
            "SELECT s.*,t.title AS thread_title,g.state AS goal_state, "
            "g.plan_revision AS goal_plan_revision,g.spec->>'title' AS goal_title "
            "FROM user_schedules s JOIN chat_threads t ON t.id=s.thread_id "
            "LEFT JOIN user_goals g ON g.id::text=s.spec->'goal'->>'id' "
            "AND g.owner_id=s.owner_id WHERE s.id=%s "
            "AND s.owner_id=%s AND s.state<>'deleted'",
            (schedule_id, account.id),
        )
        if not row:
            raise HTTPException(404, "Jadwal tidak ditemukan.")
        return row
