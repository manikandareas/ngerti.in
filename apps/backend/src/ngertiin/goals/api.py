"""Authenticated goal reads and explicit proposal decisions."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends

from ngertiin.accounts.auth import current_account
from ngertiin.goals import service, store
from ngertiin.goals.contracts import DecisionInput, ProposalInput
from ngertiin.models import Account

router = APIRouter(tags=["goals"])
AccountDep = Annotated[Account, Depends(current_account)]


@router.get("/goals")
async def listing(account: AccountDep):
    return await store.listing(account.id)


@router.get("/goals/{goal_id}")
async def detail(goal_id: UUID, account: AccountDep):
    return await store.detail(account.id, goal_id)


@router.post("/goals/proposals", status_code=201)
async def propose(body: ProposalInput, account: AccountDep):
    return await service.propose(account.id, body)


@router.post("/goals/proposals/{proposal_id}/decision")
async def decide(proposal_id: UUID, body: DecisionInput, account: AccountDep):
    return await service.decide(account.id, proposal_id, body.approved)
