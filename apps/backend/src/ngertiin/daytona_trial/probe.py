"""Deterministic live probes; evidence never contains provider credentials."""

import asyncio
import hashlib
import json
import time
from pathlib import Path

import httpx
from websockets.asyncio.client import connect
from websockets.typing import Subprotocol

from ngertiin.daytona_trial import provider, store
from ngertiin.daytona_trial.api import upstream


async def capabilities(row: dict, output: Path) -> dict:
    output.mkdir(parents=True, exist_ok=True)
    report: dict = {"session_id": row["id"], "sandbox_id": row["sandbox_id"], "checks": {}}

    async def measured(name, action):
        started = time.monotonic()
        value = await action
        report["checks"][name] = {
            "duration_ms": round((time.monotonic() - started) * 1000),
            "actual": value,
        }
        (output / "capabilities.json").write_text(json.dumps(report, indent=2) + "\n")
        return value

    token = store.begin_action(row["id"], row["owner_id"], row["version"])
    unknown = True
    try:
        async with provider.client() as api:
            sandbox = await api.get(row["sandbox_id"])
            report["provider_state"] = str(sandbox.state)
            report["target"] = getattr(sandbox, "target", None)
            report["configuration"] = await provider.preflight()

            async def code():
                result = await sandbox.process.code_run("print(6 * 7)", timeout=15)
                assert result.exit_code == 0 and "42" in result.result
                return {"exit_code": result.exit_code, "output": result.result[:100]}

            await measured("python_code", code())

            async def files():
                data = b"NG031 durable workspace\n"
                path = "/home/daytona/trial/upload.txt"
                await sandbox.fs.upload_file(data, path)
                downloaded = await sandbox.fs.download_file(path)
                assert data == downloaded
                return {"bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}

            await measured("file_roundtrip", files())

            async def desktop():
                await sandbox.computer_use.mouse.click(220, 460)
                await sandbox.computer_use.keyboard.press("a", ["ctrl"])
                await sandbox.computer_use.keyboard.type("AGENT-NG031-SAME-SESSION")
                await sandbox.computer_use.mouse.click(240, 540)
                (output / "agent-marker.png").write_bytes(await provider.screenshot(row))
                return {"marker": "AGENT-NG031-SAME-SESSION", "screenshot": "agent-marker.png"}

            await measured("computer_use", desktop())

            async def signed_urls():
                async with httpx.AsyncClient(timeout=15, follow_redirects=True) as http:
                    signed = await sandbox.create_signed_preview_url(6080, expires_in_seconds=30)
                    before = (await http.get(signed.url + "/vnc.html")).status_code
                    async with connect(
                        upstream(signed.url, "websockify", websocket=True),
                        subprotocols=[Subprotocol("binary")],
                        proxy=None,
                        open_timeout=15,
                    ) as ws:
                        banner = await ws.recv()
                        assert isinstance(banner, bytes) and banner.startswith(b"RFB ")
                        await sandbox.expire_signed_preview_url(6080, signed.token)
                        revoked = (await http.get(signed.url + "/vnc.html")).status_code
                        try:
                            await ws.send(b"RFB 003.008\n")
                            reply = await asyncio.wait_for(ws.recv(), 3)
                            existing_survives = bool(reply)
                        except Exception:
                            existing_survives = False
                    short = await sandbox.create_signed_preview_url(6080, expires_in_seconds=8)
                    short_before = (await http.get(short.url + "/vnc.html")).status_code
                    await asyncio.sleep(9)
                    expired = (await http.get(short.url + "/vnc.html")).status_code
                    assert before == 200 and short_before == 200
                    assert revoked in {401, 403, 404} and expired in {401, 403, 404}
                    return {
                        "initial_http": before,
                        "revoked_http": revoked,
                        "expired_http": expired,
                        "existing_socket_survived_revoke": existing_survives,
                    }

            unknown = False  # Remaining probes cannot mutate desktop/process state.
            await measured("signed_preview_expiry_revoke", signed_urls())

            async def network():
                result = await sandbox.process.exec(
                    "for u in https://github.com https://example.com; do "
                    "printf '%s ' $u; curl -ILs --max-time 8 -o /dev/null "
                    "-w '%{http_code}\\n' $u; done",
                    timeout=20,
                )
                return {"output": result.result[:500], "exit_code": result.exit_code}

            await measured("network_destinations", network())
            unknown = False
    finally:
        store.finish_action(row["id"], token, unknown=unknown)
    return report
