"""Authenticated commands and replay; the subscription never starts a model."""

import asyncio
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from fastapi.sse import EventSourceResponse, ServerSentEvent
from pydantic import BaseModel, ConfigDict, Field

from ngertiin.accounts.auth import current_account
from ngertiin.async_db import transaction
from ngertiin.chat import approvals, quota, store
from ngertiin.files.contracts import FileInput, OutputSpec
from ngertiin.models import Account

router = APIRouter(prefix="/chat", tags=["chat"])
AccountDep = Annotated[Account, Depends(current_account)]


class ThreadInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    request_key: UUID


class MessageInput(ThreadInput):
    text: str = Field(min_length=1, max_length=12000)
    inputs: list[FileInput] = Field(default_factory=list, max_length=5)
    outputs: list[OutputSpec] = Field(default_factory=list, max_length=10)
    runtime_kind: Literal["text", "code", "browser"] = "text"


class DecisionInput(ThreadInput):
    revision: int = Field(ge=1)
    approved: bool


@router.get("/threads")
async def threads(account: AccountDep):
    return await store.bootstrap(account.id)


@router.post("/threads")
async def new_thread(body: ThreadInput, account: AccountDep):
    await store.bootstrap(account.id)
    return await store.create_thread(account.id, body.request_key)


@router.get("/threads/{thread_id}")
async def thread_snapshot(thread_id: UUID, account: AccountDep):
    return await store.snapshot(account.id, thread_id)


@router.post("/threads/{thread_id}/runs")
async def send(thread_id: UUID, body: MessageInput, account: AccountDep):
    text = body.text.strip()
    if not text:
        raise HTTPException(400, "Tulis pesanmu terlebih dahulu.")
    if body.inputs or body.outputs or body.runtime_kind in ("code", "browser"):
        from ngertiin.tasks.creation import create

        task = await create(
            account.id,
            thread_id,
            body.request_key,
            text,
            False,
            inputs=[v.model_dump(mode="json") for v in body.inputs],
            outputs=[v.model_dump() for v in body.outputs],
            runtime_kind=body.runtime_kind,
        )
        return {"id": task["id"], "task_id": task["id"]}
    return await store.submit(account.id, thread_id, body.request_key, text)


@router.get("/threads/{thread_id}/messages")
async def history(thread_id: UUID, account: AccountDep, before: Annotated[int, Query(ge=0)]):
    return await store.history(account.id, thread_id, before)


@router.post("/approvals/{proposal_id}/decision")
async def decide(proposal_id: UUID, body: DecisionInput, account: AccountDep):
    return await approvals.decide(
        account.id, proposal_id, body.revision, body.approved, body.request_key
    )


@router.post("/runs/{run_id}/cancel")
async def cancel(run_id: UUID, account: AccountDep):
    return await store.cancel(account.id, run_id)


@router.post("/runs/{run_id}/retry")
async def retry(run_id: UUID, body: ThreadInput, account: AccountDep):
    async with transaction() as conn:
        run = await store.one(
            conn, "SELECT * FROM chat_runs WHERE id=%s AND owner_id=%s", (run_id, account.id)
        )
        if not run:
            raise HTTPException(404, "Respons tidak ditemukan.")
        await store.lock_account(conn, account.id)
        await store.owned_thread(conn, account.id, run["thread_id"], lock=True)
        run = await store.one(conn, "SELECT * FROM chat_runs WHERE id=%s FOR UPDATE", (run_id,))
        if run["status"] in ("queued", "running"):
            return {"id": run_id}
        if run["status"] != "failed":
            raise HTTPException(409, "Hanya respons yang gagal yang dapat dicoba ulang.")
        latest = await store.one(
            conn,
            "SELECT id FROM chat_runs WHERE thread_id=%s ORDER BY created_at DESC LIMIT 1",
            (run["thread_id"],),
        )
        if latest["id"] != run_id:
            raise HTTPException(
                409, "Percakapan sudah berlanjut. Kirim pesan baru untuk melanjutkan."
            )
        await store.require_capacity(conn, account.id)
        await quota.retry(conn, run)
        await conn.execute(
            "UPDATE chat_runs SET status='queued',error=NULL,attempt=0 WHERE id=%s", (run_id,)
        )
        await store.enqueue(conn, run_id, run["thread_id"])
        await store.append_event(
            conn,
            run["thread_id"],
            {"type": "run.status", "run": {"id": str(run_id), "status": "queued"}},
        )
    return {"id": run_id}


async def event_subscription(
    thread_id: UUID,
    account: AccountDep,
    after: Annotated[int, Query(ge=0)] = 0,
    last_event_id: Annotated[str | None, Header()] = None,
):
    try:
        cursor = max(after, int(last_event_id or 0))
    except ValueError as error:
        raise HTTPException(400, "Cursor tidak valid.") from error
    async with transaction() as conn:
        thread = await store.owned_thread(conn, account.id, thread_id)
        if cursor > thread["seq"]:
            raise HTTPException(409, "Muat ulang percakapan untuk menyelaraskan pesan.")
    return thread_id, cursor


@router.get("/threads/{thread_id}/events", response_class=EventSourceResponse)
async def events(request: Request, subscription: Annotated[tuple, Depends(event_subscription)]):
    import time

    thread_id, cursor = subscription
    expires = time.monotonic() + 240
    while not await request.is_disconnected() and time.monotonic() < expires:
        async with transaction() as conn:
            rows = await (
                await conn.execute(
                    "SELECT seq,payload FROM chat_events WHERE thread_id=%s AND seq>%s "
                    "ORDER BY seq LIMIT 100",
                    (thread_id, cursor),
                )
            ).fetchall()
        for row in rows:
            cursor = row["seq"]
            yield ServerSentEvent(data=row["payload"], id=str(cursor), event="chat")
        await asyncio.sleep(0.15 if rows else 0.4)
