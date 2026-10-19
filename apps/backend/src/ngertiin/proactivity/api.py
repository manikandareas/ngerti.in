"""Owner-scoped internal previews. No endpoint sends a message or executes a candidate."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from ngertiin.accounts.auth import current_account
from ngertiin.config import get_settings
from ngertiin.models import Account
from ngertiin.proactivity import store
from ngertiin.proactivity.contracts import ConfigureInput, EvaluationInput


def diagnostics():
    if not get_settings().diagnostics_enabled:
        raise HTTPException(404, "Tidak ditemukan.")


router = APIRouter(
    prefix="/dev/proactivity", tags=["proactive-inspection"], dependencies=[Depends(diagnostics)]
)
AccountDep = Annotated[Account, Depends(current_account)]


@router.get("")
async def listing(account: AccountDep):
    return await store.listing(account.id)


@router.post("/settings")
async def configure(body: ConfigureInput, account: AccountDep):
    return await store.configure(account.id, body.enabled, body.expected_revision)


@router.post("/evaluations", status_code=202)
async def evaluate(body: EvaluationInput, account: AccountDep):
    row = await store.request(account.id, body.thread_id)
    return {"id": row["id"], "status": row["status"], "reason": row["reason"]}


@router.get("/evaluations/{identity}")
async def detail(identity: UUID, account: AccountDep):
    return await store.detail(account.id, identity)
