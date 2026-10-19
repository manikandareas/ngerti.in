"""Owner-bound, revocable VNC gateway. Client viewOnly is never authorization."""

import asyncio
import hashlib
import secrets
from contextlib import suppress
from datetime import UTC, datetime, timedelta
from urllib.parse import urlsplit, urlunsplit
from uuid import UUID, uuid4

from fastapi import HTTPException, Response, WebSocket
from websockets.asyncio.client import connect
from websockets.typing import Subprotocol

from ngertiin.chat.store import one
from ngertiin.computer import control, policy
from ngertiin.computer.rfb import ClientMessages
from ngertiin.config import get_settings
from ngertiin.tasks import store as tasks


async def mint(owner, task_id, response: Response):
    async with tasks.locked(owner, task_id) as (conn, task):
        row = await control.active(conn, task)
        if (
            row["state"] != "ready"
            or row["control"] not in ("agent", "human")
            or row["deadline"] <= datetime.now(UTC) + timedelta(seconds=5)
        ):
            raise HTTPException(409, "Komputer belum siap untuk viewer.")
        existing = await one(
            conn,
            "SELECT id FROM computer_viewers WHERE workspace_id=%s "
            "AND connected AND channel_deadline>now()",
            (row["id"],),
        )
        if existing:
            raise HTTPException(
                409, "Viewer lain masih tersambung. Tutup viewer tersebut sebelum menyambung."
            )
        await conn.execute(
            "UPDATE computer_viewers SET closed=true WHERE workspace_id=%s", (row["id"],)
        )
        ident, secret = uuid4(), secrets.token_urlsafe(32)
        expiry = min(row["deadline"], datetime.now(UTC) + timedelta(seconds=300))
        await conn.execute(
            "INSERT INTO computer_viewers(id,workspace_id,owner_id,control_version,"
            "secret_hash,expires_at) VALUES (%s,%s,%s,%s,%s,%s)",
            (
                ident,
                row["id"],
                owner,
                row["control_version"],
                hashlib.sha256(secret.encode()).hexdigest(),
                expiry,
            ),
        )
    response.set_cookie(
        "ngertiin-computer",
        secret,
        httponly=True,
        samesite="strict",
        secure=get_settings().app_env == "production",
        max_age=300,
        path=f"/computer/ws/{ident}",
    )
    return {
        "path": f"/computer/ws/{ident}",
        "expires_at": expiry,
        "control_version": row["control_version"],
    }


async def checked(ident, secret, *, connect_channel=False):
    async with tasks.transaction() as conn:
        row = await one(
            conn,
            "SELECT w.*,g.id AS grant_id,g.control_version AS viewer_version,"
            "g.secret_hash,g.expires_at,g.closed,g.connected FROM computer_viewers g "
            "JOIN browser_workspaces w ON w.id=g.workspace_id AND w.owner_id=g.owner_id "
            "WHERE g.id=%s",
            (ident,),
        )
        if (
            not row
            or row["closed"]
            or row["expires_at"] <= datetime.now(UTC)
            or row["state"] != "ready"
            or row["deadline"] <= datetime.now(UTC)
            or row["control"] not in ("agent", "human")
            or row["viewer_version"] != row["control_version"]
            or not secrets.compare_digest(
                row["secret_hash"], hashlib.sha256(secret.encode()).hexdigest()
            )
        ):
            raise ValueError("Viewer expired/revoked")
        if connect_channel:
            result = await one(
                conn,
                "UPDATE computer_viewers SET connected=true,"
                "channel_deadline=now()+interval '15 seconds' WHERE id=%s AND NOT "
                "connected RETURNING id",
                (ident,),
            )
            if not result:
                raise ValueError("Viewer already connected")
        else:
            await conn.execute(
                "UPDATE computer_viewers SET channel_deadline=now()+interval '15 seconds' "
                "WHERE id=%s",
                (ident,),
            )
        return row


async def gateway(websocket: WebSocket, ident: UUID):
    if websocket.headers.get("origin") not in get_settings().allowed_origins:
        await websocket.close(code=1008)
        return
    secret = websocket.cookies.get("ngertiin-computer", "")
    connected = False
    try:
        row = await checked(ident, secret, connect_channel=True)
        connected = True
        await websocket.accept(subprotocol="binary")
        runtime = policy.get_runtime(row["provider"])
        parsed = urlsplit(await runtime.preview(row))
        upstream = urlunsplit(
            ("wss", parsed.netloc, parsed.path.rstrip("/") + "/websockify", parsed.query, "")
        )
        async with connect(
            upstream,
            subprotocols=[Subprotocol("binary")],
            proxy=None,
            max_size=8 * 1024 * 1024,
            open_timeout=15,
            close_timeout=1,
        ) as remote:
            parser = ClientMessages()

            async def incoming():
                while True:
                    data = await websocket.receive_bytes()
                    current = await checked(ident, secret)
                    allowed = parser.feed(data, current["control"] == "human")
                    if allowed:
                        async with asyncio.timeout(1):
                            await remote.send(allowed)

            async def outgoing():
                async for data in remote:
                    await checked(ident, secret)
                    if isinstance(data, bytes):
                        async with asyncio.timeout(2):
                            await websocket.send_bytes(data)

            async def expiry():
                ticks = 0
                while True:
                    current = await checked(ident, secret)
                    if ticks % 120 == 0:
                        await runtime.heartbeat(current)
                    ticks += 1
                    await asyncio.sleep(0.25)

            running = [asyncio.create_task(f()) for f in (incoming, outgoing, expiry)]
            try:
                done, _ = await asyncio.wait(running, return_when=asyncio.FIRST_COMPLETED)
                for item in done:
                    item.result()
            finally:
                for item in running:
                    item.cancel()
                await asyncio.gather(*running, return_exceptions=True)
    except Exception:
        # Provider exceptions contain signed URLs. Never log/serialize them.
        with suppress(Exception):
            await websocket.close(
                code=1008, reason="Viewer berakhir. Sambungkan kembali dari Task."
            )
    finally:
        if connected:
            async with tasks.transaction() as conn:
                await conn.execute(
                    "UPDATE computer_viewers SET connected=false,closed=true WHERE id=%s", (ident,)
                )
