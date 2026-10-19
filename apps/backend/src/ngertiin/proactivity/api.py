"""Owner-scoped product controls and diagnostics; only the dispatcher publishes messages."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from ngertiin.accounts.auth import current_account
from ngertiin.async_db import transaction
from ngertiin.chat.store import owned_thread
from ngertiin.config import get_settings
from ngertiin.models import Account
from ngertiin.proactivity import preferences, store
from ngertiin.proactivity.contracts import ConfigureInput, EvaluationInput, PreferenceInput


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


product_router = APIRouter(prefix="/proactivity", tags=["proactivity"])


@product_router.get("")
async def product_listing(account: AccountDep):
    return await preferences.listing(account.id)


@product_router.get("/scope/{scope}/{identity}")
async def scoped_preferences(scope: str, identity: UUID, account: AccountDep):
    if scope not in ("thread", "goal"):
        raise HTTPException(422, "Cakupan tidak valid.")
    async with transaction() as conn:
        return await preferences.scoped(conn, account.id, scope, identity)


@product_router.post("/preferences")
async def change_preferences(body: PreferenceInput, account: AccountDep):
    return await preferences.change(account.id, body)


@product_router.post("/read/{thread_id}/{position}")
async def mark_read(thread_id: UUID, position: int, account: AccountDep):
    async with transaction() as conn:
        thread = await owned_thread(conn, account.id, thread_id, lock=True)
        if position < 0 or position > thread["seq"]:
            raise HTTPException(422, "Posisi pesan tidak valid.")
        await conn.execute(
            "UPDATE chat_threads SET proactive_read_position=GREATEST("
            "proactive_read_position,%s) WHERE id=%s",
            (position, thread_id),
        )
    return {"read": True}
