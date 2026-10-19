"""Owner edits remain available without model calls or chat allowance."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query

from ngertiin.accounts.auth import current_account
from ngertiin.async_db import transaction
from ngertiin.chat.store import lock_account
from ngertiin.models import Account
from ngertiin.persona import service, store
from ngertiin.persona.contracts import DecisionInput, EditInput, RestoreInput

router = APIRouter(prefix="/persona", tags=["persona"])
AccountDep = Annotated[Account, Depends(current_account)]


@router.get("")
async def listing(account: AccountDep):
    async with transaction() as conn:
        await lock_account(conn, account.id)
        return await store.listing(conn, account.id)


@router.post("/edit")
async def edit(body: EditInput, account: AccountDep):
    return await service.edit(account.id, body)


@router.get("/history")
async def history(account: AccountDep, before: int = Query(default=2147483647, ge=1)):
    async with transaction() as conn:
        return await store.history(conn, account.id, before)


@router.post("/restore")
async def restore(body: RestoreInput, account: AccountDep):
    return await service.edit(account.id, body, restore=True)


@router.post("/proposals/{proposal_id}/decision")
async def decide(proposal_id: UUID, body: DecisionInput, account: AccountDep):
    return await service.decide(account.id, proposal_id, body.approved)
