"""A narrow, fixed-size Daytona trial; no host or application secrets enter it."""

import asyncio
import base64
import time
from importlib.metadata import version

from daytona import AsyncDaytona, CreateSandboxFromSnapshotParams, DaytonaConfig
from daytona_api_client_async import ConfigApi

from ngertiin.config import get_settings
from ngertiin.daytona_trial import store

SNAPSHOT = "daytona-medium"
MAX_FILE_BYTES = 2 * 1024 * 1024


def client() -> AsyncDaytona:
    settings = get_settings()
    if not settings.daytona_api_key.get_secret_value():
        raise store.TrialError("DAYTONA_API_KEY belum dikonfigurasi.")
    if not settings.daytona_api_url.startswith("https://"):
        raise store.TrialError("DAYTONA_API_URL wajib HTTPS.")
    return AsyncDaytona(
        DaytonaConfig(
            api_key=settings.daytona_api_key.get_secret_value(),
            api_url=settings.daytona_api_url,
            target=settings.daytona_target or None,
            otel_enabled=False,
        )
    )


async def preflight() -> dict:
    async with client() as api:
        snap = await api.snapshot.get(SNAPSHOT)
        if (snap.cpu, snap.mem, snap.disk, snap.gpu) != (2, 4, 8, 0):
            raise store.TrialError("Alokasi snapshot berubah; tinjau kembali batas biaya.")
        cfg = await ConfigApi(api._api_client).config_controller_get_config()
        return {
            "sdk": version("daytona"),
            "provider": cfg.version,
            "snapshot": SNAPSHOT,
            "snapshot_id": snap.id,
            "cpu": snap.cpu,
            "ram_gib": snap.mem,
            "disk_gib": snap.disk,
            "budget_usd": store.BUDGET_USD,
            "max_ttl_minutes": store.MAX_TTL_MINUTES,
            "existing_trial_sessions": len(store.sessions()),
        }


async def create(owner_id: str, ttl: int = 30) -> dict:
    await preflight()
    row = store.reserve(owner_id, ttl)
    async with client() as api:
        # A deterministic name and durable reservation reconcile uncertain create
        # outcomes. Never retry a create with a new name after a network timeout.
        sandbox = await api.create(
            CreateSandboxFromSnapshotParams(
                name=f"ng031-{row['id']}",
                snapshot=SNAPSHOT,
                public=False,
                labels={"ngertiin-trial": "ng031", "trial-id": row["id"]},
                ttl_minutes=ttl,
                auto_stop_interval=5,
                auto_delete_interval=-1,
                env_vars={"VNC_RESOLUTION": "1280x720"},
            ),
            timeout=90,
        )
        store.provisioned(row["id"], sandbox.id)
    return store.owned(row["id"], owner_id)


async def execute(ident: str, owner_id: str, revision: int, command: str) -> dict:
    if len(command) > 12000:
        raise store.TrialError("Command trial terlalu panjang.")
    row = store.owned(ident, owner_id)
    token = store.begin_action(ident, owner_id, revision)
    unknown = True
    try:
        async with client() as api:
            sandbox = await api.get(row["sandbox_id"], request_timeout=15)
            started = time.monotonic()
            result = await sandbox.process.exec(
                # Resource/output bounds apply inside the sandbox, too. External
                # timeout alone is insufficient to kill a child process.
                "timeout --kill-after=2s 20s bash -c "
                + shell_quote(
                    "set -o pipefail; ulimit -f 4096; ulimit -u 512; ( "
                    + command
                    + " ) 2>&1 | head -c 16000"
                ),
                timeout=25,
            )
            unknown = False
            return {
                "exit_code": result.exit_code,
                "output": result.result[:16000],
                "duration_ms": round((time.monotonic() - started) * 1000),
            }
    finally:
        store.finish_action(ident, token, unknown=unknown)


def shell_quote(value: str) -> str:
    import shlex

    return shlex.quote(value)


async def screenshot(row: dict) -> bytes:
    async with client() as api:
        sandbox = await api.get(row["sandbox_id"], request_timeout=15)
        result = await sandbox.computer_use.screenshot.take_full_screen(request_timeout=15)
        data = base64.b64decode(result.screenshot)
        if len(data) > MAX_FILE_BYTES:
            raise store.TrialError("Screenshot melampaui batas trial.")
        return data


async def control(ident: str, owner_id: str, destination: str) -> dict:
    row = store.request_control(ident, owner_id, destination)
    # Every existing viewer checks version within 250 ms. Wait for its input
    # channel to close before the next controller is allowed to dispatch.
    await asyncio.sleep(0.35)
    for _ in range(40):
        row = store.owned(ident, owner_id)
        if not row["busy"] and not store.channels_open(ident):
            break
        await asyncio.sleep(0.25)
    if row["busy"] or row["unknown_effect"] or store.channels_open(ident):
        raise store.TrialError("Handoff menunggu rekonsiliasi aksi.")
    if destination == "agent":
        observed = await screenshot(row)
        import hashlib

        store.event(
            ident,
            "control.fresh_observation",
            {
                "sha256": hashlib.sha256(observed).hexdigest(),
                "version": row["version"],
            },
        )
    return store.complete_control(ident, owner_id, row["version"], destination)


async def cleanup(ident: str, owner_id: str) -> dict:
    row = store.begin_cleanup(ident, owner_id)
    async with client() as api:
        found = [s async for s in api.list() if s.name == f"ng031-{ident}"]
        if not found and not row["sandbox_id"] and time.time() < row["deadline"] + 120:
            raise store.TrialError(
                "Unknown create: tunggu TTL sebelum mengizinkan resource berikutnya."
            )
        for sandbox in found:
            await api.delete(sandbox, wait=True, timeout=90)
        remaining = [s.id async for s in api.list() if s.name == f"ng031-{ident}"]
        if remaining:
            raise store.TrialError("Penghapusan provider belum terkonfirmasi.")
    store.deleted(row["id"])
    return {"session_id": ident, "remaining_resources": remaining, "status": "deleted"}
