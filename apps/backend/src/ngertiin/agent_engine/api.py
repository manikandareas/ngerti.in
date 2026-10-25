"""Agent configuration HTTP boundary; the gateway remains the only domain writer."""

import asyncio
import base64
import hashlib
import hmac
import json
import os
import time
from pathlib import Path
from typing import Annotated, Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from pydantic import BaseModel, ConfigDict, Field

from ngertiin.accounts.auth import current_account
from ngertiin.config import get_settings
from ngertiin.models import Account

router = APIRouter(prefix="/api/agent-engine/v1", tags=["agent-engine"])
AccountDep = Annotated[Account, Depends(current_account)]

# nma.v1 encoded frame budgets; mirrored at the separately packaged engine boundary.
MAX_REQUEST_BYTES = 2 * 1024 * 1024
MAX_RESPONSE_BYTES = 16 * 1024 * 1024


class Command(BaseModel):
    model_config = ConfigDict(extra="forbid")
    schema_version: str
    command_id: UUID
    type: Literal[
        "agent.create",
        "agent.configure",
        "agent.disable",
        "agent.archive",
        "agent.restore",
        "thread.create",
        "member.add",
        "member.remove",
        "message.send",
        "run.cancel",
        "goal.pause",
        "goal.stop",
        "goal.resume",
        "goal.reopen",
        "artifact.share",
        "artifact.revoke",
    ]
    expected_revision: str | None = Field(pattern=r"^[1-9][0-9]{0,18}$")
    payload: dict


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False)


def failure(code, command_id, details=None):
    status = {
        "NOT_FOUND": 404,
        "INVALID_CURSOR": 422,
        "CURSOR_AHEAD": 409,
        "CURSOR_RESET": 409,
        "STALE_GENERATION": 409,
        "GOAL_STOPPED": 409,
        "AGENT_UNAVAILABLE": 409,
        "GROUP_UNAVAILABLE": 409,
        "INVALID_MENTION": 422,
        "CONNECTOR_UNAVAILABLE": 422,
        "UNAUTHENTICATED": 401,
        "INVALID_REQUEST": 422,
        "REQUEST_TOO_LARGE": 413,
        "RESPONSE_TOO_LARGE": 502,
        "MODEL_UNAVAILABLE": 422,
        "CAPABILITY_UNAVAILABLE": 422,
        "CAPABILITY_DENIED": 403,
        "ACCESS_REVOKED": 409,
        "INVALID_TRANSITION": 409,
        "REVISION_CONFLICT": 409,
        "HANDLE_CONFLICT": 409,
        "COMMAND_CONFLICT": 409,
        "UNSUPPORTED_VERSION": 426,
    }.get(code, 503)
    return HTTPException(
        status,
        detail={
            "code": code,
            "message": code.replace("_", " ").capitalize(),
            "retryable": status == 503,
            "command_id": command_id,
            "details": details or {},
        },
    )


async def forward(owner: str, body: dict):
    """Resolve a provisioned partition from authenticated account identity only."""
    command_id = body["command_id"]
    registry = os.environ.get("NMA_PARTITIONS_FILE") or get_settings().nma_partitions_file
    if not registry:
        raise failure("ENGINE_UNAVAILABLE", command_id)
    try:
        partitions = json.loads(Path(registry).read_text())
        partition = partitions.get(owner)
        if not partition:
            raise failure("ENGINE_UNAVAILABLE", command_id)
        key = Path(partition["key_file"]).read_bytes()
        if len(key) < 32:
            raise ValueError("Invalid signing key")
        claims = {
            "audience": "ngertiin-engine",
            "owner_id": owner,
            "actor": "owner",
            "expires_at": int(time.time()) + 60,
            "body": body,
            "payload_digest": hashlib.sha256(canonical(body).encode()).hexdigest(),
        }
        envelope = {
            **claims,
            "signature": hmac.new(key, canonical(claims).encode(), "sha256").hexdigest(),
        }
        frame = (canonical(envelope) + "\n").encode()
        if len(frame) > MAX_REQUEST_BYTES:
            raise failure("REQUEST_TOO_LARGE", command_id)
        async with asyncio.timeout(35):
            reader, writer = await asyncio.open_unix_connection(
                partition["socket"], limit=MAX_RESPONSE_BYTES
            )
            try:
                writer.write(frame)
                await writer.drain()
                reply = json.loads(await reader.readline())
            finally:
                writer.close()
                await writer.wait_closed()
        if "error" in reply:
            raise failure(reply["error"]["code"], command_id, reply["error"].get("details"))
        return reply["result"]
    except (OSError, TimeoutError, ValueError, KeyError) as exc:
        raise failure("ENGINE_UNAVAILABLE", command_id) from exc


@router.post("/commands")
async def commands(body: Command, account: AccountDep, response: Response):
    result = await forward(str(account.id), body.model_dump(mode="json"))
    if body.type == "message.send":
        response.status_code = 200 if result.pop("duplicate", False) else 202
    return result


@router.get("/agents")
async def agents(
    account: AccountDep, after: UUID | None = None, limit: int = Query(50, ge=1, le=100)
):
    return await forward(
        str(account.id),
        {
            "schema_version": "nma.v1",
            "command_id": str(uuid4()),
            "type": "agent.list",
            "expected_revision": None,
            "payload": {"after": str(after) if after else None, "limit": limit},
        },
    )


@router.get("/threads/{thread_id}")
async def thread(thread_id: UUID, account: AccountDep):
    return await forward(
        str(account.id),
        {
            "schema_version": "nma.v1",
            "command_id": str(uuid4()),
            "type": "thread.read",
            "expected_revision": None,
            "payload": {"thread_id": str(thread_id)},
        },
    )


@router.get("/threads")
async def threads(account: AccountDep, after: UUID | None = None):
    return await forward(
        str(account.id),
        {
            "schema_version": "nma.v1",
            "command_id": str(uuid4()),
            "type": "thread.list",
            "expected_revision": None,
            "payload": {"after": str(after) if after else None},
        },
    )


@router.get("/goals/{goal_id}")
async def goal(goal_id: UUID, account: AccountDep):
    return await forward(
        str(account.id),
        {
            "schema_version": "nma.v1",
            "command_id": str(uuid4()),
            "type": "goal.read",
            "expected_revision": None,
            "payload": {"goal_id": str(goal_id)},
        },
    )


@router.get("/runs/{run_id}/diagnostics")
async def run_diagnostics(run_id: UUID, account: AccountDep):
    return await forward(
        str(account.id),
        {
            "schema_version": "nma.v1",
            "command_id": str(uuid4()),
            "type": "run.diagnostics",
            "expected_revision": None,
            "payload": {"run_id": str(run_id)},
        },
    )


@router.post("/threads/{thread_id}/computer/reconcile")
async def reconcile_computer(thread_id: UUID, account: AccountDep):
    return await forward(
        str(account.id),
        {
            "schema_version": "nma.v1",
            "command_id": str(uuid4()),
            "type": "computer.reconcile",
            "expected_revision": None,
            "payload": {"thread_id": str(thread_id)},
        },
    )


@router.get("/artifacts/{artifact_id}")
async def artifact(artifact_id: UUID, account: AccountDep):
    value = await forward(
        str(account.id),
        {
            "schema_version": "nma.v1",
            "command_id": str(uuid4()),
            "type": "artifact.read",
            "expected_revision": None,
            "payload": {"artifact_id": str(artifact_id)},
        },
    )
    value.pop("content", None)
    return value


@router.get("/artifacts/{artifact_id}/revisions/{revision_id}/download")
async def artifact_download(artifact_id: UUID, revision_id: UUID, account: AccountDep):
    value = await forward(
        str(account.id),
        {
            "schema_version": "nma.v1",
            "command_id": str(uuid4()),
            "type": "artifact.read",
            "expected_revision": None,
            "payload": {"artifact_id": str(artifact_id)},
        },
    )
    if value["revision_id"] != str(revision_id):
        raise failure("NOT_FOUND", None)
    return Response(
        value["content"].encode("utf-8"),
        media_type="application/octet-stream",
        headers={
            "Content-Disposition": 'attachment; filename="' + value["filename"] + '"',
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "private, no-store",
        },
    )


@router.post("/webhooks/{route_id}")
async def webhook(route_id: str, request: Request, response: Response):
    """Forward raw signed bytes; the engine authenticates and commits acceptance."""
    try:
        routes = json.loads(Path(os.environ["NMA_WEBHOOK_ROUTES_FILE"]).read_text())
        owner = str(UUID(routes[route_id]["owner_id"]))
    except (KeyError, OSError, ValueError) as exc:
        raise failure("NOT_FOUND", None) from exc
    raw = bytearray()
    async for chunk in request.stream():
        raw.extend(chunk)
        if len(raw) > 512 * 1024:
            raise failure("REQUEST_TOO_LARGE", None)
    result = await forward(
        owner,
        {
            "schema_version": "nma.v1",
            "command_id": str(uuid4()),
            "type": "webhook.receive",
            "expected_revision": None,
            "payload": {
                "route_id": route_id,
                "delivery_id": request.headers.get(
                    "x-github-delivery", request.headers.get("x-webhook-id", "")
                ),
                "event_type": request.headers.get(
                    "x-github-event", request.headers.get("x-webhook-event", "")
                ),
                "signature": request.headers.get("x-hub-signature-256", ""),
                "body_base64": base64.b64encode(raw).decode(),
            },
        },
    )
    response.status_code = 202 if result["status"] == "accepted" else 200
    return result
