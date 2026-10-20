"""Private E2B desktop with authenticated ingress, bounded compute and disk retention."""

import asyncio
import base64
import hashlib
import json
import shlex
from datetime import UTC, datetime
from pathlib import Path

from e2b import AsyncSandbox

from ngertiin import e2b
from ngertiin.computer.contracts import NeedsHuman, Screen, ViewerEndpoint, public_url
from ngertiin.config import get_settings
from ngertiin.sandbox.contracts import RuntimeFailure, StagedFile


async def resource(workspace):
    value = (
        await e2b.info(workspace["resource_id"])
        if workspace.get("resource_id")
        else await e2b.find(workspace["resource_name"])
    )
    if value and value.metadata.get("ngertiin_resource") != workspace["resource_name"]:
        raise RuntimeFailure("Identitas workspace E2B tidak cocok.", unknown=True)
    return value


async def running(workspace):
    value = await resource(workspace)
    if value is None:
        raise RuntimeFailure("Workspace E2B tidak ditemukan.")
    if workspace.get("deadline") and workspace["deadline"] <= datetime.now(UTC):
        raise RuntimeFailure("Deadline komputer telah berakhir.")
    return await e2b.attach(value)


class E2BComputer:
    name = "e2b"

    async def start(self, workspace, seconds):
        value = await resource(workspace)
        if value is None:
            if workspace.get("resource_id"):
                raise RuntimeFailure(
                    "Workspace E2B tersimpan hilang. Reset browser untuk melanjutkan."
                )
            try:
                sandbox = await AsyncSandbox.create(
                    template=get_settings().e2b_computer_template,
                    timeout=seconds,
                    metadata={
                        "ngertiin_resource": workspace["resource_name"],
                        "ngertiin": "browser",
                        "workspace": str(workspace["id"]),
                    },
                    envs={"DISPLAY": ":0"},
                    network={"allow_public_traffic": False},
                    lifecycle={
                        "on_timeout": {"action": "pause", "mode": "filesystem"},
                        "auto_resume": False,
                    },
                    **e2b.options(),
                )
            except Exception as error:
                raise RuntimeFailure(
                    "Provisioning browser E2B belum terkonfirmasi.", unknown=True
                ) from error
        else:
            sandbox = await e2b.attach(value, seconds=seconds, resume=True)
        e2b.allocation(await sandbox.get_info(request_timeout=15))
        result = await e2b.run(sandbox, "mkdir -p /tmp/ng036; chmod 700 /tmp/ng036")
        if result.exit_code:
            raise RuntimeFailure("Direktori browser E2B gagal disiapkan.", unknown=True)
        for filename in ("desktop.py", "desktop_io.py", "egress.py", "cdp.py"):
            await sandbox.files.write(
                "/tmp/ng036/" + filename,
                (Path(__file__).parent / filename).read_bytes(),
                request_timeout=20,
            )
        result = await e2b.run(sandbox, "python3 /tmp/ng036/desktop_io.py setup", seconds=25)
        if result.exit_code:
            raise RuntimeFailure("Desktop atau VNC E2B belum siap.", unknown=True)
        result = await e2b.run(
            sandbox,
            "nohup python3 /tmp/ng036/desktop.py launch "
            + str(seconds)
            + " >/dev/null 2>&1 </dev/null &",
        )
        if result.exit_code:
            raise RuntimeFailure("Browser E2B gagal disiapkan.", unknown=True)
        for _ in range(20):
            result = await e2b.run(sandbox, "python3 /tmp/ng036/desktop_io.py health", seconds=5)
            if result.exit_code == 0:
                break
            await asyncio.sleep(0.25)
        else:
            raise RuntimeFailure("Browser/proxy E2B belum siap.", unknown=True)
        result = await e2b.run(
            sandbox, "python3 /tmp/ng036/desktop_io.py health --network", seconds=12
        )
        if result.exit_code:
            raise RuntimeFailure("Akses internet browser E2B belum tersedia.", unknown=True)
        remaining = int((workspace["deadline"] - datetime.now(UTC)).total_seconds())
        if remaining < 1:
            raise RuntimeFailure("Deadline komputer berakhir saat persiapan.", unknown=True)
        await sandbox.set_timeout(remaining, request_timeout=15)
        return sandbox.sandbox_id

    async def observe(self, workspace):
        sandbox = await running(workspace)
        result = await e2b.run(sandbox, "DISPLAY=:0 scrot -o /tmp/ng036/screen.png", seconds=10)
        if result.exit_code:
            raise RuntimeFailure("Layar E2B belum dapat dibaca.")
        try:
            data = bytes(
                await sandbox.files.read(
                    "/tmp/ng036/screen.png", format="bytes", request_timeout=15
                )
            )
        finally:
            await e2b.run(sandbox, "rm -f /tmp/ng036/screen.png")
        if len(data) > 2 * 1024 * 1024:
            raise RuntimeFailure("Layar melebihi batas ukuran.")
        return Screen(data)

    async def act(self, workspace, action):
        if action.kind == "navigate":
            await public_url(action.url)
        sandbox = await running(workspace)
        result = await e2b.run(
            sandbox, "python3 /tmp/ng036/desktop_io.py act " + shlex.quote(action.model_dump_json())
        )
        if result.exit_code:
            raise RuntimeFailure("Aksi browser E2B belum terkonfirmasi.", unknown=True)
        await asyncio.sleep(0.75)

    async def collect(self, workspace, filenames):
        sandbox = await running(workspace)
        result = await e2b.run(
            sandbox,
            "python3 /tmp/ng036/desktop.py collect " + shlex.quote(json.dumps(filenames)),
            seconds=20,
        )
        if result.exit_code:
            raise RuntimeFailure("Unduhan belum lengkap atau melebihi batas.")
        return [
            StagedFile(v["filename"], base64.b64decode(v["data"]))
            for v in json.loads(result.stdout)
        ]

    async def target(self, workspace, action):
        if action.kind in ("navigate", "scroll"):
            return hashlib.sha256(
                json.dumps(action.model_dump(), sort_keys=True).encode()
            ).hexdigest()
        sandbox = await running(workspace)
        result = await e2b.run(
            sandbox, "python3 /tmp/ng036/desktop.py target " + shlex.quote(action.model_dump_json())
        )
        if result.exit_code:
            raise NeedsHuman("Target belum dapat diperiksa. Ambil alih untuk melanjutkan.")
        value = json.loads(result.stdout)
        if value.get("private"):
            raise NeedsHuman("Kolom privat/iframe memerlukan takeover. Gwen tidak akan mengisinya.")
        return value["fingerprint"]

    async def stop(self, workspace):
        value = await resource(workspace)
        if value is None:
            return {"absent": True}
        usage = {}
        if str(value.state) == "running":
            sandbox = await e2b.attach(value)
            result = await e2b.run(sandbox, "python3 /tmp/ng036/desktop.py stop", seconds=20)
            if result.exit_code:
                raise RuntimeFailure("Penghentian browser E2B belum terkonfirmasi.", unknown=True)
            usage = json.loads(result.stdout)
            await sandbox.pause(mode="filesystem", request_timeout=45)
        value = await e2b.info(value.sandbox_id)
        if value and str(value.state) != "paused":
            raise RuntimeFailure("Pause komputer E2B belum terkonfirmasi.", unknown=True)
        return usage

    async def delete(self, workspace):
        value = await resource(workspace)
        if value:
            await AsyncSandbox.kill(value.sandbox_id, **e2b.options())
        return await resource(workspace) is None

    async def preview(self, workspace):
        sandbox = await running(workspace)
        if not sandbox.traffic_access_token:
            raise RuntimeFailure("Token ingress privat E2B belum tersedia.")
        return ViewerEndpoint(
            "wss://" + sandbox.get_host(6080) + "/websockify",
            {"e2b-traffic-access-token": sandbox.traffic_access_token},
        )

    async def heartbeat(self, workspace):
        # Provider expiry is absolute. A viewer must never extend the Task budget.
        value = await resource(workspace)
        if value is None or str(value.state) != "running":
            raise RuntimeFailure("Komputer E2B sudah berhenti.")

    async def inspect(self, workspace):
        value = await resource(workspace)
        return (
            "absent" if value is None else "stopped" if str(value.state) == "paused" else "running"
        )
