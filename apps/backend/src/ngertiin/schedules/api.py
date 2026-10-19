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
