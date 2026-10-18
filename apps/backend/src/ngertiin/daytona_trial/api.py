"""Authenticated, development-only NG-031 commands and bounded desktop proxy."""

import asyncio
import time
from contextlib import suppress
from urllib.parse import urlsplit, urlunsplit

import structlog
from fastapi import APIRouter, WebSocket
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field
from websockets.asyncio.client import connect
from websockets.typing import Subprotocol

from ngertiin.api.diagnostics import AccountDep
from ngertiin.config import get_settings
from ngertiin.daytona_trial import provider, store
from ngertiin.daytona_trial.rfb import ClientMessages

router = APIRouter(prefix="/dev/daytona", tags=["daytona-trial"])
COOKIE = "ngertiin_daytona_viewer"
VNC_PORT = 6080


class CreateInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    ttl_minutes: int = Field(default=30, ge=1, le=30)


class ControlInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    destination: str


def public(row: dict) -> dict:
    return {
        key: bool(row[key]) if key == "busy" else row[key]
        for key in [
            "id",
            "sandbox_id",
            "created_at",
            "deadline",
            "reserved_usd",
            "status",
            "mode",
            "version",
            "busy",
            "unknown_effect",
        ]
    }


@router.get("/preflight")
async def preflight(account: AccountDep):
    return await provider.preflight()


@router.get("/sessions")
def sessions(account: AccountDep):
    return [public(row) for row in store.sessions(str(account.id))]


@router.post("/sessions")
async def create(body: CreateInput, account: AccountDep):
    return public(await provider.create(str(account.id), body.ttl_minutes))


@router.post("/sessions/{ident}/control")
async def control(ident: str, body: ControlInput, account: AccountDep):
    return public(await provider.control(ident, str(account.id), body.destination))


@router.delete("/sessions/{ident}")
async def cleanup(ident: str, account: AccountDep):
    return await provider.cleanup(ident, str(account.id))


@router.post("/sessions/{ident}/viewer")
def viewer(ident: str, account: AccountDep, seconds: int = 60):
    seconds = min(max(seconds, 1), 60)
    grant, secret = store.mint_grant(ident, str(account.id), seconds)
    result = JSONResponse(
        {
            "path": f"/dev/daytona/ws/{grant}",
            "expires_in": seconds,
        }
    )
    result.set_cookie(
        COOKIE,
        secret,
        max_age=seconds,
        httponly=True,
        secure=get_settings().app_env == "production",
        samesite="strict",
        path="/dev/daytona",
    )
    result.headers["Cache-Control"] = "no-store"
    return result


@router.delete("/sessions/{ident}/viewer", status_code=204)
def revoke(ident: str, account: AccountDep):
    store.owned(ident, str(account.id))
    with store.database() as conn:
        conn.execute("DELETE FROM grants WHERE session_id=?", (ident,))


async def preview(row: dict) -> str:
    async with provider.client() as api:
        sandbox = await api.get(row["sandbox_id"], request_timeout=15)
        signed = await sandbox.create_signed_preview_url(VNC_PORT, expires_in_seconds=60)
        return signed.url


def upstream(base: str, path: str, *, websocket: bool = False) -> str:
    url = urlsplit(base)
    return urlunsplit(
        (
            "wss" if websocket else "https",
            url.netloc,
            url.path.rstrip("/") + "/" + path,
            url.query,
            "",
        )
    )


@router.websocket("/ws/{grant}")
async def desktop(websocket: WebSocket, grant: str):
    settings = get_settings()
    if websocket.headers.get("origin") not in settings.allowed_origins + [
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ]:
        await websocket.close(code=1008)
        return
    secret = websocket.cookies.get(COOKIE, "")
    try:
        row = store.check_grant(grant, secret)
    except store.TrialError:
        await websocket.close(code=1008)
        return
    await websocket.accept(subprotocol="binary")
    parser = ClientMessages()
    started = time.monotonic()
    channel = None
    try:
        url = upstream(await preview(row), "websockify", websocket=True)
        async with connect(
            url,
            subprotocols=[Subprotocol("binary")],
            max_size=8 * 1024 * 1024,
            open_timeout=15,
            proxy=None,
            close_timeout=2,
        ) as remote:
            store.check_grant(grant, secret)
            channel = store.open_channel(row)
            store.event(
                row["id"],
                "viewer.connected",
                {
                    "connect_ms": round((time.monotonic() - started) * 1000),
                    "mode": row["mode"],
                    "version": row["version"],
                },
            )

            async def client_to_remote():
                while True:
                    data = await websocket.receive_bytes()
                    current = store.check_grant(grant, secret)
                    allowed = parser.feed(data, current["mode"] == "human")
                    if allowed:
                        await remote.send(allowed)

            async def remote_to_client():
                async for data in remote:
                    store.check_grant(grant, secret)
                    if isinstance(data, bytes):
                        await websocket.send_bytes(data)

            async def expiry():
                while True:
                    store.check_grant(grant, secret)
                    await asyncio.sleep(0.25)

            tasks = [
                asyncio.create_task(f())
                for f in [
                    client_to_remote,
                    remote_to_client,
                    expiry,
                ]
            ]
            try:
                done, _ = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
                for task in done:
                    task.result()
            finally:
                for task in tasks:
                    task.cancel()
                await asyncio.gather(*tasks, return_exceptions=True)
    except Exception as error:
        # Provider exceptions can contain signed URLs. Never serialize/log them.
        structlog.get_logger().info(
            "daytona.viewer.closed",
            error_type=type(error).__name__,
            status=getattr(getattr(error, "response", None), "status_code", None),
            rfb_handshake=parser.handshake,
            blocked_inputs=parser.blocked_inputs,
        )
        store.event(
            row["id"],
            "viewer.closed",
            {
                "error_type": type(error).__name__,
                "status": getattr(getattr(error, "response", None), "status_code", None),
                "rfb_handshake": parser.handshake,
                "blocked_inputs": parser.blocked_inputs,
            },
        )
        with suppress(Exception):
            await websocket.close(code=1008, reason="Sesi viewer berakhir.")

    finally:
        if channel is not None:
            store.close_channel(channel)
