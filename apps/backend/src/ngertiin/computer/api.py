"""Authenticated computer commands. Owners and provider identities are server derived."""

from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, WebSocket
from pydantic import BaseModel, ConfigDict, Field

from ngertiin.accounts.auth import current_account
from ngertiin.computer import control, lifecycle, store, viewer
from ngertiin.models import Account
from ngertiin.tasks import store as tasks

router = APIRouter(prefix="/computer", tags=["computer"])
AccountDep = Annotated[Account, Depends(current_account)]


class ControlInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version: int = Field(ge=1)
    destination: Literal["agent", "human"]


class DecisionInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version: int = Field(ge=1)
    approved: bool


class Confirmation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    confirmed: bool


@router.get("/workspace")
async def workspace(account: AccountDep):
    from ngertiin.chat.store import one

    async with tasks.transaction() as conn:
        row = await one(
            conn,
            "SELECT * FROM browser_workspaces WHERE owner_id=%s AND state<>'deleted'",
            (account.id,),
        )
        return {"workspace": store.public(row) if row else None}


@router.get("/tasks/{task_id}")
async def task_state(task_id: UUID, account: AccountDep):
    async with tasks.transaction() as conn:
        task = await tasks.owned(conn, account.id, task_id)
        return await store.summary(conn, task)


@router.post("/tasks/{task_id}/control")
async def change(task_id: UUID, body: ControlInput, account: AccountDep):
    return await control.change(account.id, task_id, body.version, body.destination)


@router.post("/tasks/{task_id}/actions/{step_id}")
async def decision(task_id: UUID, step_id: UUID, body: DecisionInput, account: AccountDep):
    return await control.decide(account.id, task_id, step_id, body.version, body.approved)


@router.post("/tasks/{task_id}/viewer")
async def mint(task_id: UUID, response: Response, account: AccountDep):
    return await viewer.mint(account.id, task_id, response)


@router.post("/tasks/{task_id}/acknowledge")
async def acknowledge(task_id: UUID, body: Confirmation, account: AccountDep):
    if not body.confirmed:
        raise HTTPException(
            422, "Konfirmasikan pemeriksaan situs dan jangan ulangi aksi yang belum pasti."
        )
    await lifecycle.acknowledge(account.id, task_id)
    return await tasks.detail(account.id, task_id)


@router.post("/workspaces/{workspace_id}/reset")
async def reset(workspace_id: UUID, body: Confirmation, account: AccountDep):
    if not body.confirmed:
        raise HTTPException(422, "Reset memerlukan konfirmasi penghapusan login tersimpan.")
    return await lifecycle.reset(account.id, workspace_id)


@router.websocket("/ws/{ident}")
async def desktop(websocket: WebSocket, ident: UUID):
    await viewer.gateway(websocket, ident)
