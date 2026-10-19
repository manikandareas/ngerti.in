"""Authenticated discovery endpoints shared with agent tools."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel, ConfigDict, Field

from ngertiin.accounts.auth import current_account
from ngertiin.async_db import transaction
from ngertiin.chat.store import owned_thread
from ngertiin.library import capabilities, reader, search, selection
from ngertiin.library.contracts import ResourceRef, SearchInput
from ngertiin.models import Account

router = APIRouter(prefix="/library", tags=["library"])
AccountDep = Annotated[Account, Depends(current_account)]


class SelectionInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    ref: ResourceRef | None


@router.post("/search")
async def find(body: SearchInput, account: AccountDep, response: Response):
    response.headers["Cache-Control"] = "no-store"
    return await search.search(account.id, body)


@router.post("/read")
async def read(body: ResourceRef, account: AccountDep, response: Response):
    response.headers["Cache-Control"] = "no-store"
    return await reader.read(account.id, body)


@router.get("/capabilities")
async def available(account: AccountDep):
    return capabilities.inventory()


@router.get("/threads/{thread_id}/selection")
async def selected(thread_id: UUID, account: AccountDep):
    async with transaction() as conn:
        await owned_thread(conn, account.id, thread_id)
        return {"selection": await selection.current(conn, account.id, thread_id)}


@router.post("/threads/{thread_id}/selection")
async def choose(thread_id: UUID, body: SelectionInput, account: AccountDep):
    return await selection.select(account.id, thread_id, body.ref)


class HitInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    refs: list[ResourceRef] = Field(max_length=50)


@router.post("/hits")
async def hits(body: HitInput, account: AccountDep, response: Response):
    from fastapi import HTTPException

    response.headers["Cache-Control"] = "no-store"
    items = []
    async with transaction() as conn:
        for ref in body.refs:
            try:
                value = await reader.resolve(conn, account.id, ref)
            except HTTPException:
                continue
            items.append({k: value[k] for k in ("ref", "title", "status", "thread_id")})
    return {"items": items}
