"""Explicit operator commands; default invocation never creates resources."""

import argparse
import asyncio
import json
import time
from pathlib import Path

from ngertiin.daytona_trial import provider, store


async def setup(row: dict) -> dict:
    async with provider.client() as api:
        sandbox = await api.get(row["sandbox_id"])
        await sandbox.computer_use.start(request_timeout=20)
        for _ in range(30):
            if (await sandbox.computer_use.get_status()).status == "active":
                break
            await asyncio.sleep(0.5)
        await sandbox.fs.upload_file(
            (Path(__file__).parent / "fixture.html").read_bytes(),
            "/home/daytona/trial.html",
        )
        result = await sandbox.process.exec(
            "mkdir -p /home/daytona/trial; "
            "cp /home/daytona/trial.html /home/daytona/trial/index.html; "
            "printf 'NG031 durable workspace\\n' > /home/daytona/trial/persistent.txt; "
            "nohup python3 -m http.server 8765 --bind 127.0.0.1 "
            "--directory /home/daytona/trial >/tmp/ng031-http.log 2>&1 </dev/null & "
            "DISPLAY=:0 nohup chromium --no-sandbox --disable-dev-shm-usage --no-first-run "
            "--user-data-dir=/home/daytona/trial/profile --window-size=1200,650 "
            "http://127.0.0.1:8765 >/tmp/ng031-chromium.log 2>&1 </dev/null &",
            timeout=15,
        )
        await asyncio.sleep(2)
        ports = await sandbox.process.exec("ss -lnt | head -20; command -v chromium", timeout=10)
        return {"exit_code": result.exit_code, "ports": ports.result}


async def main(args):
    if args.command == "preflight":
        return await provider.preflight()
    if args.command == "ttl-probe":
        from ngertiin.daytona_trial.ttl_probe import ttl_probe

        return await ttl_probe(args.owner, Path(args.output))
    if args.command == "list":
        return store.sessions(args.owner)
    if args.command == "create":
        return await provider.create(args.owner, args.ttl)
    row = store.owned(args.session, args.owner)
    if args.command == "cleanup":
        return await provider.cleanup(args.session, args.owner)
    if args.command == "setup":
        token = store.begin_action(row["id"], args.owner, row["version"])
        try:
            result = await setup(row)
        except Exception:
            store.finish_action(row["id"], token, unknown=True)
            raise
        store.finish_action(row["id"], token)
        return result
    if args.command == "exec":
        return await provider.execute(row["id"], args.owner, row["version"], args.code)
    if args.command == "lifecycle":
        from ngertiin.daytona_trial.lifecycle import lifecycle

        return await lifecycle(row, Path(args.output))
    if args.command == "probe":
        from ngertiin.daytona_trial.probe import capabilities

        return await capabilities(row, Path(args.output))
    if args.command == "screenshot":
        Path(args.output).write_bytes(await provider.screenshot(row))
        return {"output": args.output}
    if args.command == "control":
        return await provider.control(row["id"], args.owner, args.destination)
    raise store.TrialError("Command tidak dikenal.")


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument(
    "command",
    choices=[
        "preflight",
        "list",
        "create",
        "cleanup",
        "setup",
        "exec",
        "screenshot",
        "control",
        "probe",
        "lifecycle",
        "ttl-probe",
    ],
)
parser.add_argument("--owner")
parser.add_argument("--session")
parser.add_argument("--ttl", type=int, default=30)
parser.add_argument("--code", default="printf 'NG031 shell ready\\n'")
parser.add_argument("--output", default=".dev/daytona-desktop.png")
parser.add_argument("--destination", choices=["agent", "human"], default="human")
args = parser.parse_args()
started = time.monotonic()
try:
    result = asyncio.run(main(args))
    print(
        json.dumps(
            {"result": result, "duration_ms": round((time.monotonic() - started) * 1000)},
            ensure_ascii=False,
            default=str,
        )
    )
except Exception as error:
    # Provider exception strings may contain credentials or signed URLs.
    print(
        json.dumps(
            {
                "error_type": type(error).__name__,
                "status": getattr(error, "status", None),
                "detail": str(error)
                if isinstance(error, store.TrialError)
                else "Provider call failed; reconcile session before retry.",
            }
        )
    )
    raise SystemExit(1) from None
