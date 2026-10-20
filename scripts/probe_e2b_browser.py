"""Explicit live browser probe: private ingress, public web, restart and retained profile."""

import argparse
import asyncio
import json
import shlex
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import uuid4

import httpx
from ngertiin import e2b
from ngertiin.computer.contracts import Action
from ngertiin.computer.e2b import E2BComputer, running
from websockets.asyncio.client import connect


async def main(output):
    ident = uuid4()
    workspace = {
        "id": ident,
        "resource_name": f"ngertiin-browser-probe-{ident}",
        "resource_id": None,
        "policy": {"retention_days": 7},
        "deadline": datetime.now(UTC) + timedelta(minutes=7),
    }
    runtime, report = E2BComputer(), {"at": datetime.now(UTC).isoformat(), "checks": {}}
    checks = report["checks"]
    output.parent.mkdir(parents=True, exist_ok=True)
    try:
        workspace["resource_id"] = await runtime.start(workspace, 420)
        report["sandbox_id"] = workspace["resource_id"]
        sandbox = await running(workspace)
        i = await sandbox.get_info(request_timeout=15)
        checks["allocation_2cpu_4gib"] = (i.cpu_count, i.memory_mb) == (2, 4096)
        checks["public_ingress_disabled"] = (
            i.network.get("allow_public_traffic") is False
        )
        destination = await runtime.preview(workspace)
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.get(
                "https://" + sandbox.get_host(6080) + "/vnc.html"
            )
            checks["viewer_without_token_rejected"] = response.status_code in (401, 403)
        async with connect(
            destination.url,
            additional_headers=destination.headers,
            subprotocols=["binary"],
            proxy=None,
            open_timeout=15,
        ) as socket:
            checks["authenticated_rfb_38"] = (
                await asyncio.wait_for(socket.recv(), 10) == b"RFB 003.008\n"
            )
        for name, url in (
            ("example", "https://example.com"),
            ("google", "https://www.google.com"),
        ):
            await runtime.act(
                workspace,
                Action(kind="navigate", description="Probe internet", url=url),
            )
            await asyncio.sleep(2)
            expression = "JSON.stringify({title:document.title,error:!!document.querySelector('#main-frame-error'),host:location.hostname})"
            command = (
                "import sys,json;sys.path.insert(0,'/tmp/ng036');from cdp import call;print(json.dumps(call('Runtime.evaluate',{'expression':"
                + repr(expression)
                + ",'returnByValue':True})))"
            )
            result = await e2b.run(sandbox, "python3 -c " + shlex.quote(command))
            state = json.loads(json.loads(result.stdout)["result"]["value"])
            report[name] = state
            checks[name + "_loaded"] = not state["error"] and bool(state["title"])
            (output.parent / (name + ".png")).write_bytes(
                (await runtime.observe(workspace)).png
            )
        await e2b.run(
            sandbox,
            "printf retained >/home/user/.ngertiin-browser/ngertiin-probe-marker; printf evidence >/tmp/ng036/downloads/probe.txt",
        )
        files = await runtime.collect(workspace, ["probe.txt"])
        checks["download_bytes_exact"] = files[0].data == b"evidence"
        await runtime.stop(workspace)
        checks["pause_confirmed"] = await runtime.inspect(workspace) == "stopped"
        # A new adapter/client imitates a new durable worker; no SDK Desktop object is reused.
        runtime = E2BComputer()
        remaining = int((workspace["deadline"] - datetime.now(UTC)).total_seconds())
        checks["same_sandbox_after_resume"] = (
            await runtime.start(workspace, remaining) == workspace["resource_id"]
        )
        sandbox = await running(workspace)
        marker = await e2b.run(
            sandbox,
            'test "$(cat /home/user/.ngertiin-browser/ngertiin-probe-marker)" = retained',
        )
        checks["profile_survives_worker_restart"] = marker.exit_code == 0
        checks["screen_after_resume"] = (
            len((await runtime.observe(workspace)).png) > 1000
        )
        checks["passed"] = all(checks.values())
    finally:
        checks["deleted_confirmed"] = await runtime.delete(workspace)
        output.write_text(json.dumps(report, indent=2, default=str) + "\n")
    print(json.dumps(report, indent=2))
    assert all(checks.values()), "Browser probe failed"


async def deadline_probe(output):
    ident = uuid4()
    workspace = {
        "id": ident,
        "resource_name": f"ngertiin-deadline-probe-{ident}",
        "resource_id": None,
        "deadline": datetime.now(UTC) + timedelta(seconds=60),
    }
    runtime = E2BComputer()
    report = {"deadline": workspace["deadline"].isoformat()}
    try:
        workspace["resource_id"] = await runtime.start(workspace, 60)
        report["sandbox_id"] = workspace["resource_id"]
        # No heartbeat, SDK connect, or worker cleanup during this interval.
        while datetime.now(UTC) < workspace["deadline"] + timedelta(seconds=45):
            value = await e2b.info(workspace["resource_id"])
            if value and str(value.state) == "paused":
                report["paused_at"] = datetime.now(UTC).isoformat()
                break
            await asyncio.sleep(3)
        report["paused_without_worker"] = await runtime.inspect(workspace) == "stopped"
        assert report["paused_without_worker"]
    finally:
        report["deleted_confirmed"] = await runtime.delete(workspace)
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--live", action="store_true", required=True)
    parser.add_argument("--deadline", action="store_true")
    parser.add_argument(
        "--output", type=Path, default=Path(".dev/e2b-migration/browser-live.json")
    )
    args = parser.parse_args()
    asyncio.run((deadline_probe if args.deadline else main)(args.output))
