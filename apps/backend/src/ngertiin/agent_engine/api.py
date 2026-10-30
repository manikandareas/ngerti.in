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
from urllib.parse import quote
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from fastapi.responses import StreamingResponse
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
        "thread.ensure_dm",
        "thread.mark_read",
        "thread.open",
        "member.add",
        "member.remove",
        "message.send",
        "run.cancel",
        "session.compress",
        "session.reset",
        "history.search",
        "history.usage",
        "history.rename",
        "history.branch",
        "history.retry",
        "portable.export",
        "portable.preview",
        "portable.import",
        "agent.presets",
        "clarification.list",
        "clarification.answer",
        "goal.pause",
        "goal.stop",
        "goal.resume",
        "goal.reopen",
        "artifact.share",
        "artifact.revoke",
        "file.begin",
        "file.part",
        "file.finalize",
        "workspace.action",
        "screen.action",
        "browser.vault",
        "learning.memory",
        "learning.install",
        "learning.skill",
        "learning.provider",
        "media.transcribe",
    ]
    expected_revision: str | None = Field(pattern=r"^[1-9][0-9]{0,18}$")
    payload: dict


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False)


def failure(code, command_id, details=None):
    status = {
        "NOT_FOUND": 404,
        "UPLOAD_INCOMPLETE": 409,
        "FILE_HASH_MISMATCH": 422,
        "WORKSPACE_BUSY": 409,
        "WORKSPACE_UNAVAILABLE": 422,
        "WORKSPACE_RUNTIME_UNAVAILABLE": 422,
        "WORKSPACE_FILE_UNAVAILABLE": 422,
        "SKILL_UNAVAILABLE": 422,
        "SKILL_NOT_INSTALLED": 422,
        "SKILL_UPDATE_CONFLICT": 409,
        "INVALID_SKILL_PATH": 422,
        "INVALID_SKILL_PACKAGE": 422,
        "SKILL_PACKAGE_TOO_LARGE": 422,
        "MEMORY_PROVIDER_SETUP_REQUIRED": 422,
        "SCREEN_ACCESS_REFUSED": 409,
        "RESTORE_CONFLICT": 409,
        "INVALID_ENDPOINT": 422,
        "UNSUPPORTED_PROTOCOL": 422,
        "PROTOCOL_UNAVAILABLE": 422,
        "CREDENTIAL_METADATA_REJECTED": 422,
        "PROVIDER_RECONNECT_REQUIRED": 409,
        "PROVIDER_ENTITLEMENT_REQUIRED": 422,
        "PROVIDER_QUOTA_EXHAUSTED": 422,
        "PROVIDER_WORKLOAD_REQUIRED": 422,
        "PROVIDER_DEPLOYMENT_UNVERIFIED": 422,
        "OAUTH_STATE_INVALID": 422,
        "OAUTH_IDENTITY_MISMATCH": 422,
        "CONNECTION_IDENTITY_CONFLICT": 409,
        "DM_RECONCILIATION_REQUIRED": 409,
        "INVALID_CURSOR": 422,
        "CURSOR_AHEAD": 409,
        "CURSOR_RESET": 409,
        "STALE_GENERATION": 409,
        "GOAL_STOPPED": 409,
        "AGENT_UNAVAILABLE": 409,
        "GROUP_UNAVAILABLE": 409,
        "INVALID_MENTION": 422,
        "CONNECTOR_UNAVAILABLE": 422,
        "APP_AUTH_FAILED": 422,
        "APP_OAUTH_CLIENT_REQUIRED": 422,
        "APP_GOOGLE_OAUTH_REQUIRED": 422,
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
        "SESSION_UNAVAILABLE": 409,
        "SESSION_BUSY": 409,
        "COMPRESSION_FAILED": 422,
        "CONTEXT_ENGINE_UNAVAILABLE": 422,
        "MEDIA_ROUTE_UNAVAILABLE": 422,
        "UNSUPPORTED_MEDIA": 422,
        "MEDIA_REFERENCE_REQUIRED": 422,
        "UNSUPPORTED_MEDIA_CONTROL": 422,
        "INVALID_CONFIGURATION": 422,
        "INVALID_INFERENCE_CONFIGURATION": 422,
        "PROVIDER_CONNECTION_REQUIRED": 422,
        "CAPABILITY_DEPENDENCY_REQUIRED": 422,
        "CAPABILITY_DEPENDENCY_CYCLE": 422,
        "PLUGIN_INVALID_SELECTION": 422,
        "PLUGIN_PIN_MISMATCH": 409,
        "PLUGIN_NOT_INSTALLED": 422,
        "PLUGIN_NOT_ENABLED": 422,
        "UNSUPPORTED_VERSION": 426,
        "RETRY_UNSAFE": 409,
        "INVALID_BUNDLE": 422,
        "INVALID_BUNDLE_PATH": 422,
        "BUNDLE_TOO_LARGE": 413,
        "CREDENTIAL_EXPORT_REJECTED": 422,
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
        return await forward_partition(owner, body, partition)
    except (OSError, ValueError, KeyError) as exc:
        raise failure("ENGINE_UNAVAILABLE", command_id) from exc


async def forward_partition(owner: str, body: dict, partition: dict):
    """Private transport for a trusted provisioner before registry publication."""
    command_id = body["command_id"]
    try:
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


class ConnectionKey(BaseModel):
    model_config = ConfigDict(extra="forbid")
    connection_id: UUID
    provider: Literal["custom", "openrouter", "opencode-zen", "opencode-go"]
    label: str = Field(min_length=1, max_length=100)
    api_key: str = Field(min_length=1, max_length=16384, repr=False)
    base_url: str = ""
    protocol: Literal["chat_completions", "codex_responses", "anthropic_messages"] = (
        "chat_completions"
    )
    workload: Literal["general", "coding"] = "general"


class ProviderLogin(BaseModel):
    model_config = ConfigDict(extra="forbid")
    provider: Literal["chatgpt", "openrouter"]
    label: str = Field(min_length=1, max_length=100)
    connection_id: UUID | None = None


def provider_command(kind, payload):
    return {
        "schema_version": "nma.v1",
        "command_id": str(uuid4()),
        "type": kind,
        "expected_revision": None,
        "payload": payload,
    }


def session_binding(request):
    session_id = getattr(request.state, "auth_session_id", None)
    if not isinstance(session_id, str) or not session_id:
        raise HTTPException(401, "Please sign in again.")
    return hashlib.sha256(session_id.encode()).hexdigest()


@router.get("/connections")
async def connections(account: AccountDep, response: Response):
    response.headers["Cache-Control"] = "no-store"
    return await forward(str(account.id), provider_command("connection.list", {}))


@router.post("/connections")
async def add_connection(body: ConnectionKey, account: AccountDep, response: Response):
    response.headers["Cache-Control"] = "no-store"
    return await forward(
        str(account.id), provider_command("connection.add_key", body.model_dump(mode="json"))
    )


@router.post("/connections/{connection_id}/models")
async def refresh_connection_models(connection_id: UUID, account: AccountDep):
    return await forward(
        str(account.id),
        provider_command("connection.models", {"connection_id": str(connection_id)}),
    )


@router.delete("/connections/{connection_id}")
async def disconnect_connection(connection_id: UUID, account: AccountDep):
    return await forward(
        str(account.id),
        provider_command("connection.disconnect", {"connection_id": str(connection_id)}),
    )


@router.post("/provider-auth")
async def start_provider_auth(
    body: ProviderLogin, account: AccountDep, request: Request, response: Response
):
    response.headers["Cache-Control"] = "no-store"
    return await forward(
        str(account.id),
        provider_command(
            "provider_auth.start",
            {
                **body.model_dump(mode="json"),
                "session_binding": session_binding(request),
            },
        ),
    )


@router.get("/provider-auth/{attempt_id}")
async def provider_auth_status(
    attempt_id: UUID, account: AccountDep, request: Request, response: Response
):
    response.headers["Cache-Control"] = "no-store"
    return await forward(
        str(account.id),
        provider_command(
            "provider_auth.status",
            {
                "attempt_id": str(attempt_id),
                "session_binding": session_binding(request),
            },
        ),
    )


@router.post("/provider-auth/{attempt_id}/retry")
async def retry_provider_auth(
    attempt_id: UUID, account: AccountDep, request: Request, response: Response
):
    response.headers["Cache-Control"] = "no-store"
    return await forward(
        str(account.id),
        provider_command(
            "provider_auth.retry",
            {
                "attempt_id": str(attempt_id),
                "session_binding": session_binding(request),
            },
        ),
    )


@router.delete("/provider-auth/{attempt_id}")
async def cancel_provider_auth(attempt_id: UUID, account: AccountDep, request: Request):
    return await forward(
        str(account.id),
        provider_command(
            "provider_auth.cancel",
            {
                "attempt_id": str(attempt_id),
                "session_binding": session_binding(request),
            },
        ),
    )


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


@router.get("/threads/{thread_id}/learning")
async def learning_history(thread_id: UUID, agent_id: UUID, account: AccountDep):
    return await forward(
        str(account.id),
        provider_command("learning.read", {"thread_id": str(thread_id), "agent_id": str(agent_id)}),
    )


@router.get("/threads/{thread_id}/session")
async def session_context(thread_id: UUID, agent_id: UUID, account: AccountDep):
    return await forward(
        str(account.id),
        {
            "schema_version": "nma.v1",
            "command_id": str(uuid4()),
            "type": "session.inspect",
            "expected_revision": None,
            "payload": {"thread_id": str(thread_id), "agent_id": str(agent_id)},
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
async def artifact(artifact_id: UUID, account: AccountDep, thread_id: UUID | None = None):
    value = await forward(
        str(account.id),
        {
            "schema_version": "nma.v1",
            "command_id": str(uuid4()),
            "type": "artifact.read",
            "expected_revision": None,
            "payload": {
                "artifact_id": str(artifact_id),
                **({"thread_id": str(thread_id)} if thread_id else {}),
            },
        },
    )
    value.pop("content", None)
    return value


@router.get("/artifacts/{artifact_id}/revisions/{revision_id}/download")
async def artifact_download(
    artifact_id: UUID, revision_id: UUID, account: AccountDep, thread_id: UUID | None = None
):
    value = await forward(
        str(account.id),
        {
            "schema_version": "nma.v1",
            "command_id": str(uuid4()),
            "type": "artifact.read",
            "expected_revision": None,
            "payload": {
                "artifact_id": str(artifact_id),
                **({"thread_id": str(thread_id)} if thread_id else {}),
            },
        },
    )
    if value["revision_id"] != str(revision_id):
        raise failure("NOT_FOUND", None)
    headers = {
        "Content-Disposition": "attachment; filename*=UTF-8''" + quote(value["filename"], safe=""),
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
        "X-Content-SHA256": value["sha256"],
    }
    if value.get("storage") == "file.v1":

        async def chunks():
            for offset in range(0, value["byte_count"], 512 * 1024):
                part = await forward(
                    str(account.id),
                    provider_command(
                        "file.read",
                        {
                            "artifact_id": str(artifact_id),
                            "offset": offset,
                            **({"thread_id": str(thread_id)} if thread_id else {}),
                        },
                    ),
                )
                yield base64.b64decode(part["data_base64"], validate=True)

        return StreamingResponse(chunks(), media_type="application/octet-stream", headers=headers)
    return Response(
        value["content"].encode("utf-8"),
        media_type="application/octet-stream",
        headers=headers,
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
