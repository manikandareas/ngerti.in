"""Memory controls work without chat allowance or provider availability."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends

from ngertiin.accounts.auth import current_account
from ngertiin.async_db import transaction
from ngertiin.memory import service, store
from ngertiin.memory.contracts import CaptureInput, EditInput, ForgetInput, SettingsInput
from ngertiin.models import Account

router = APIRouter(prefix="/memory", tags=["memory"])
AccountDep = Annotated[Account, Depends(current_account)]


@router.get("")
async def listing(account: AccountDep, before: UUID | None = None):
    async with transaction() as conn:
        return await store.listing(conn, account.id, before)


@router.get("/{entry_id}/history")
async def history(entry_id: UUID, account: AccountDep):
    async with transaction() as conn:
        return await store.history(conn, account.id, entry_id)


@router.post("/{entry_id}/edit")
async def edit(entry_id: UUID, body: EditInput, account: AccountDep):
    return await service.correct(account.id, entry_id, body)


@router.post("/{entry_id}/forget")
async def forget(entry_id: UUID, body: ForgetInput, account: AccountDep):
    return await service.forget(account.id, entry_id, body)


@router.post("/settings")
async def configure(body: SettingsInput, account: AccountDep):
    return await service.configure(account.id, body)


@router.post("/capture")
async def capture(body: CaptureInput, account: AccountDep):
    return await service.enqueue_source(
        account.id, body.source_kind, body.source_id, body.source_revision
    )
