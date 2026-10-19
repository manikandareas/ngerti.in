"""Daytona adapter for one private browser; profile bytes never cross this interface."""

import asyncio
import base64
import hashlib
import json
import shlex
from pathlib import Path

from daytona import AsyncDaytona, CreateSandboxFromSnapshotParams, DaytonaConfig

from ngertiin.computer.contracts import Action, NeedsHuman, Screen, public_url
from ngertiin.config import get_settings
from ngertiin.sandbox.contracts import RuntimeFailure, StagedFile


def client():
    s = get_settings()
    return AsyncDaytona(
        DaytonaConfig(
            api_key=s.daytona_api_key.get_secret_value(),
            api_url=s.daytona_api_url,
            target=s.daytona_target or None,
            otel_enabled=False,
        )
    )


def missing(error):
    return getattr(error, "status_code", None) == 404 or "not found" in str(error).lower()


class DaytonaComputer:
    name = "daytona"

    async def start(self, workspace, seconds):
        async with client() as api:
            # Unknown provisioning must be reconciled by the application, never
            # retried here under a fresh identity.
            try:
                sandbox = await api.get(workspace["resource_name"], request_timeout=15)
            except Exception as error:
                if not missing(error):
                    raise RuntimeFailure(
                        "Provider komputer belum dapat dihubungi.", unknown=True
                    ) from None
                if workspace["resource_id"]:
                    raise RuntimeFailure(
                        "Workspace tersimpan hilang. Reset browser untuk membuat profil baru."
                    ) from None
                snapshot = await api.snapshot.get("daytona-medium")
                if (snapshot.cpu, snapshot.mem, snapshot.disk, snapshot.gpu) != (2, 4, 8, 0):
                    raise RuntimeFailure(
                        "Alokasi komputer berubah; provisioning diblokir."
                    ) from None
                sandbox = await api.create(
                    CreateSandboxFromSnapshotParams(
                        name=workspace["resource_name"],
                        snapshot="daytona-medium",
                        public=False,
                        labels={"ngertiin": "browser", "workspace": str(workspace["id"])},
                        auto_stop_interval=2,
                        auto_archive_interval=0,
                        auto_delete_interval=workspace["policy"]["retention_days"] * 1440,
                        env_vars={"VNC_RESOLUTION": "1280x720"},
                    ),
                    timeout=90,
                )
            if (sandbox.cpu, sandbox.memory, sandbox.disk) != (2, 4, 8):
                raise RuntimeFailure("Alokasi komputer tidak cocok.", unknown=True)
            if "STARTED" not in str(sandbox.state).upper():
                await sandbox.start(timeout=60)
            await sandbox.computer_use.start(request_timeout=20)
            await sandbox.process.exec("mkdir -p /tmp/ng036; chmod 700 /tmp/ng036", timeout=10)
            for filename in ("desktop.py", "egress.py", "cdp.py"):
                await sandbox.fs.upload_file(
                    (Path(__file__).parent / filename).read_bytes(), "/tmp/ng036/" + filename
                )
            result = await sandbox.process.exec(
                "nohup python3 /tmp/ng036/desktop.py launch "
                + str(seconds)
                + " >/dev/null 2>&1 </dev/null &",
                timeout=10,
            )
            if result.exit_code:
                raise RuntimeFailure("Browser gagal disiapkan.", unknown=True)
            await asyncio.sleep(2)
            return sandbox.id

    async def observe(self, workspace):
        async with client() as api:
            sandbox = await api.get(workspace["resource_name"], request_timeout=15)
            result = await sandbox.computer_use.screenshot.take_full_screen(request_timeout=15)
            data = base64.b64decode(result.screenshot)
            if len(data) > 2 * 1024 * 1024:
                raise RuntimeFailure("Layar melebihi batas ukuran.")
            return Screen(data)

    async def act(self, workspace, action: Action):
        if action.kind == "navigate":
            await public_url(action.url)
        async with client() as api:
            sandbox = await api.get(workspace["resource_name"], request_timeout=15)
            cu = sandbox.computer_use
            if action.kind == "navigate":
                await cu.keyboard.press("l", ["ctrl"], request_timeout=10)
                await cu.keyboard.type(action.url, request_timeout=10)
                await cu.keyboard.press("Return", request_timeout=10)
            elif action.kind == "click":
                await cu.mouse.click(action.x, action.y, request_timeout=10)
            elif action.kind == "type":
                await cu.keyboard.type(action.text, request_timeout=10)
            elif action.kind == "key":
                await cu.keyboard.press(
                    "Return" if action.key == "Enter" else action.key, request_timeout=10
                )
            elif action.kind == "scroll":
                await cu.mouse.scroll(
                    action.x, action.y, action.direction, action.amount, request_timeout=10
                )
            else:
                raise RuntimeFailure("Aksi komputer tidak tersedia.")
            await asyncio.sleep(0.75)

    async def collect(self, workspace, filenames):
        async with client() as api:
            sandbox = await api.get(workspace["resource_name"], request_timeout=15)
            result = await sandbox.process.exec(
                "python3 /tmp/ng036/desktop.py collect " + shlex.quote(json.dumps(filenames)),
                timeout=20,
            )
            if result.exit_code:
                raise RuntimeFailure("Unduhan belum lengkap atau melebihi batas.")
            return [
                StagedFile(v["filename"], base64.b64decode(v["data"]))
                for v in json.loads(result.result)
            ]

    async def target(self, workspace, action):
        if action.kind in ("navigate", "scroll"):
            return hashlib.sha256(
                json.dumps(action.model_dump(), sort_keys=True).encode()
            ).hexdigest()
        async with client() as api:
            sandbox = await api.get(workspace["resource_name"], request_timeout=15)
            result = await sandbox.process.exec(
                "python3 /tmp/ng036/desktop.py target "
                + shlex.quote(json.dumps(action.model_dump())),
                timeout=10,
            )
            if result.exit_code:
                raise NeedsHuman("Target belum dapat diperiksa. Ambil alih untuk melanjutkan.")
            value = json.loads(result.result)
            if value.get("private"):
                raise NeedsHuman(
                    "Kolom privat/iframe memerlukan takeover. Gwen tidak akan mengisinya."
                )
            return value["fingerprint"]

    async def stop(self, workspace):
        async with client() as api:
            try:
                sandbox = await api.get(workspace["resource_name"], request_timeout=15)
            except Exception as error:
                if missing(error):
                    return {"absent": True}
                raise
            usage = {}
            if "STARTED" in str(sandbox.state).upper():
                result = await sandbox.process.exec(
                    "python3 /tmp/ng036/desktop.py stop", timeout=15
                )
                if result.exit_code == 0:
                    usage = json.loads(result.result)
                await sandbox.stop(timeout=45)
            await sandbox.refresh_data()
            if "STOPPED" not in str(sandbox.state).upper():
                raise RuntimeFailure("Penghentian komputer belum terkonfirmasi.", unknown=True)
            return usage

    async def delete(self, workspace):
        async with client() as api:
            try:
                sandbox = await api.get(workspace["resource_name"], request_timeout=15)
                await api.delete(sandbox, timeout=45)
                await api.get(workspace["resource_name"], request_timeout=15)
                return False
            except Exception as error:
                if missing(error):
                    return True
                raise

    async def preview(self, workspace):
        async with client() as api:
            sandbox = await api.get(workspace["resource_name"], request_timeout=15)
            return (await sandbox.create_signed_preview_url(6080, expires_in_seconds=60)).url

    async def heartbeat(self, workspace):
        async with client() as api:
            sandbox = await api.get(workspace["resource_name"], request_timeout=10)
            await sandbox.refresh_activity(request_timeout=10)
