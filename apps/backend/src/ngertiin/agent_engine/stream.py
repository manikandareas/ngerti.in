"""Authenticated SSE transport over durable gateway events; no execution ownership."""

import asyncio
import base64
import json
from uuid import UUID, uuid4

from fastapi import APIRouter, Header, HTTPException, Query, Request
from fastapi.responses import StreamingResponse

from ngertiin.agent_engine.api import AccountDep, canonical, failure, forward

router = APIRouter(prefix="/api/agent-engine/v1", tags=["agent-engine"])


def read_command(kind, payload):
    return {
        "schema_version": "nma.v1",
        "command_id": str(uuid4()),
        "type": kind,
        "expected_revision": None,
        "payload": payload,
    }


def cursor(owner, thread, epoch, sequence):
    return (
        base64.urlsafe_b64encode(canonical([owner, thread, epoch, sequence]).encode())
        .decode()
        .rstrip("=")
    )


def decode(value, owner, thread):
    try:
        if len(value) > 512:
            raise ValueError
        claims = json.loads(base64.urlsafe_b64decode(value + "=" * (-len(value) % 4)))
        if (
            not isinstance(claims, list)
            or len(claims) != 4
            or claims[:2] != [owner, thread]
            or not isinstance(claims[2], str)
            or str(UUID(claims[2])) != claims[2]
            or not isinstance(claims[3], str)
            or not claims[3].isascii()
            or not claims[3].isdecimal()
            or str(int(claims[3])) != claims[3]
            or not 0 <= int(claims[3]) <= 2**63 - 1
        ):
            raise ValueError
        return claims[2:]
    except (ValueError, TypeError, UnicodeError) as exc:
        raise failure("INVALID_CURSOR", None) from exc


def public_event(event):
    kind = {"run.succeeded": "run.completed", "message.delta": "run.delta"}.get(
        event["type"], event["type"]
    )
    return {
        **event,
        "type": kind,
        "seq": event.get("sequence", event.get("seq")),
        "goal_id": event.get("goal_id"),
    }


@router.get("/threads/{thread_id}/snapshot")
async def snapshot(
    thread_id: UUID,
    account: AccountDep,
    before_message_seq: str | None = Query(None, pattern=r"^[1-9][0-9]{0,18}$"),
):
    owner, thread = str(account.id), str(thread_id)
    result = await forward(
        owner,
        read_command(
            "thread.snapshot", {"thread_id": thread, "before_message_seq": before_message_seq}
        ),
    )
    result["through_cursor"] = cursor(
        owner, thread, result.pop("replay_epoch"), result.pop("through_sequence")
    )
    return result


@router.get("/runs/{run_id}")
async def run(run_id: UUID, account: AccountDep):
    return await forward(str(account.id), read_command("runtime.snapshot", {"run_id": str(run_id)}))


@router.get("/commands/{command_id}")
async def receipt(command_id: UUID, account: AccountDep):
    return await forward(
        str(account.id), read_command("command.read", {"command_id": str(command_id)})
    )


@router.get("/conversations/events")
async def conversation_events(
    request: Request, account: AccountDep, last_event_id: str | None = Header(None)
):
    return await event_stream(
        request, str(account.id), "conversations", last_event_id, "conversation.events"
    )


@router.get("/events")
async def events(
    request: Request, thread_id: UUID, account: AccountDep, last_event_id: str | None = Header(None)
):
    return await event_stream(
        request, str(account.id), str(thread_id), last_event_id, "thread.events"
    )


async def event_stream(request, owner, thread, last_event_id, kind):
    epoch, sequence = decode(last_event_id, owner, thread) if last_event_id else (None, "0")

    async def page(epoch, sequence):
        return await forward(
            owner,
            read_command(
                kind,
                {
                    **({"thread_id": thread} if kind == "thread.events" else {}),
                    "replay_epoch": epoch,
                    "last_sequence": sequence,
                },
            ),
        )

    # Authorization/cursor failures must retain HTTP status before headers are sent.
    first = await page(epoch, sequence)

    async def generate():
        current = first
        while not await request.is_disconnected():
            for event in current["events"]:
                frame = public_event(event)
                event_cursor = cursor(owner, thread, current["replay_epoch"], frame["seq"])
                yield f"id: {event_cursor}\nevent: {frame['type']}\ndata: {canonical(frame)}\n\n"
            epoch, sequence = current["replay_epoch"], current["last_sequence"]
            yield ": keepalive\n\n"
            if not current.get("has_more"):
                await asyncio.sleep(0.25)
            try:
                current = await page(epoch, sequence)
            except HTTPException as exc:
                # End this transport; retry the same cursor, or resnapshot on reset.
                yield f"event: stream.error\ndata: {canonical(exc.detail)}\n\n"
                return

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
        },
    )
