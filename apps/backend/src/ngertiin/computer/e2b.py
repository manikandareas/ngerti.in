"""Private E2B desktop with authenticated ingress, bounded compute and disk retention."""

import asyncio
import base64
import hashlib
import json
import shlex
import time
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

from e2b import AsyncSandbox

from ngertiin import e2b
from ngertiin.computer.contracts import (
    DomUnavailable,
    InspectedTarget,
    NeedsHuman,
    Screen,
    StaleTarget,
    ViewerEndpoint,
    public_url,
)
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
    supports_dispatch_receipts = True

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
        for filename in (
            "desktop.py",
            "desktop_io.py",
            "egress.py",
            "cdp.py",
            "actuator.py",
            "jev_runner.py",
            "targets.py",
        ):
            await sandbox.files.write(
                "/tmp/ng036/" + filename,
                (Path(__file__).parent / filename).read_bytes(),
                request_timeout=20,
            )
        for filename in ("snapshot.js", "target_context.js", "privacy.js"):
            await sandbox.files.write(
                "/tmp/ng036/" + filename,
                (Path(__file__).parent / "jev_assets" / filename).read_bytes(),
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
        ready_until = time.monotonic() + 45
        while time.monotonic() < ready_until:
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
        await self.control({**workspace, "resource_id": sandbox.sandbox_id})
        from ngertiin.computer.capability import inspect

        workspace["capability"] = await inspect(sandbox)
        return sandbox.sandbox_id

    async def command(
        self,
        workspace,
        operation,
        action=None,
        *,
        expected_target="",
        dispatch_id=None,
        strict_target=True,
    ):
        sandbox = await running(workspace)
        request = {
            "operation": operation,
            "strict_target": strict_target,
            "epoch": workspace.get("control_version", 1),
            "task": str(workspace.get("active_task_id") or workspace["id"]),
        }
        if action is not None:
            request["action"] = action.model_dump()
        if expected_target:
            request["expected_target"] = expected_target
        if operation in ("act", "dom_act", "receipt"):
            request["dispatch_id"] = str(dispatch_id or uuid4())
        if operation == "control":
            request.update(
                control=workspace.get("control", "agent"),
                deadline=workspace["deadline"].timestamp(),
            )
        # The optional DOM venv is baked into v2; legacy screenshot templates
        # continue using system Python without installing anything at runtime.
        python = "/opt/ngertiin-jev/bin/python" if operation.startswith("dom") else "python3"
        result = await e2b.run(
            sandbox,
            python + " /tmp/ng036/actuator.py " + shlex.quote(json.dumps(request)),
            seconds=25,
        )
        if result.exit_code:
            if operation == "dom" and result.exit_code == 127:
                raise DomUnavailable(
                    "Profil lama memakai jalur screenshot sampai runtime diperbarui."
                )
            raise RuntimeFailure(
                "Komputer belum mengonfirmasi langkah.", unknown=operation in ("act", "dom_act")
            )
        value = json.loads(result.stdout)
        if value.get("private"):
            if operation in ("act", "dom_act"):
                raise StaleTarget("Target menjadi privat sebelum input; amati ulang.")
            raise NeedsHuman("Halaman/kolom privat memerlukan takeover.")
        if value.get("stale"):
            raise StaleTarget("Halaman berubah; Gwen mengamati target kembali.")
        if value.get("unknown"):
            raise RuntimeFailure("Outcome aksi perlu diperiksa; input tidak diulang.", unknown=True)
        return value

    async def control(self, workspace):
        return await self.command(workspace, "control")

    async def dispatch_receipt(self, workspace, ident):
        return await self.command(workspace, "receipt", dispatch_id=ident)

    async def observe_dom(self, workspace):
        return await self.command(workspace, "dom")

    async def observe(self, workspace):
        sandbox = await running(workspace)
        await self.command(workspace, "screen")
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

    async def act(
        self, workspace, action, *, expected_target="", dispatch_id=None, strict_target=True
    ):
        if action.kind == "navigate":
            await public_url(action.url)
        await self.command(
            workspace,
            "dom_act" if action.dom else "act",
            action,
            expected_target=expected_target,
            dispatch_id=dispatch_id,
            strict_target=strict_target,
        )

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
        if action.dom:
            value = await self.command(workspace, "dom_target", action)
            return InspectedTarget(value["fingerprint"], value.get("context", {}))
        if action.kind in ("navigate", "scroll", "wait"):
            return InspectedTarget(
                hashlib.sha256(json.dumps(action.model_dump(), sort_keys=True).encode()).hexdigest()
            )
        value = await self.command(workspace, "target", action)
        if value.get("private"):
            raise NeedsHuman("Kolom privat/iframe memerlukan takeover. Gwen tidak akan mengisinya.")
        return InspectedTarget(value["fingerprint"], value.get("context", {}))

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
