"""Live idle-stop/reconnect checks with a durable file and an in-memory process."""

import asyncio
import hashlib
import json
import time
from pathlib import Path

from ngertiin.daytona_trial import provider, store


async def lifecycle(row: dict, output: Path) -> dict:
    output.mkdir(parents=True, exist_ok=True)
    report: dict = {"session_id": row["id"], "sandbox_id": row["sandbox_id"], "states": []}

    def save():
        (output / "lifecycle.json").write_text(json.dumps(report, indent=2) + "\n")

    token = store.begin_action(row["id"], row["owner_id"], row["version"])
    unknown = True
    try:
        async with provider.client() as api:
            sandbox = await api.get(row["sandbox_id"])
            data = await sandbox.fs.download_file("/home/daytona/trial/upload.txt")
            report["file_before_sha256"] = hashlib.sha256(data).hexdigest()
            process = await sandbox.process.exec(
                "nohup bash -c 'exec -a ng031-ram-probe python3 -c "
                '"import time; memory_counter=42; time.sleep(1800)"'
                "' "
                ">/tmp/ng031-memory.log 2>&1 </dev/null & echo $!",
                timeout=10,
            )
            report["ram_process_pid_before"] = process.result.strip()
            report["target"] = sandbox.target
            await sandbox.set_autostop_interval(1)
            idle_started = time.monotonic()
            save()
            print("Waiting for provider idle-stop with background processes alive.", flush=True)
            for delay in [75, 45, 45]:
                await asyncio.sleep(delay)
                sandbox = await api.get(row["sandbox_id"])
                report["states"].append(
                    {
                        "elapsed_seconds": round(time.monotonic() - idle_started, 2),
                        "state": str(sandbox.state),
                    }
                )
                save()
                if str(sandbox.state).endswith("STOPPED"):
                    break
            assert str(sandbox.state).endswith("STOPPED"), "Idle-stop was not observed"
            report["idle_stop_observed"] = True
            start = time.monotonic()
            await sandbox.start(timeout=90)
            restored = await sandbox.fs.download_file("/home/daytona/trial/upload.txt")
            report["restart_ms"] = round((time.monotonic() - start) * 1000)
            report["file_after_sha256"] = hashlib.sha256(restored).hexdigest()
            assert data == restored
            output.joinpath("recovered-workspace.txt").write_bytes(restored)
            ram = await sandbox.process.exec("pgrep -f '^ng031-ram-probe' || true", timeout=10)
            report["old_ram_process_after_start"] = ram.result.strip()
            assert not ram.result.strip()
            report["filesystem_persisted"] = True
            report["ram_process_persisted"] = False
            # Keep TTL fixed; extend only the idle interval for final viewer checks.
            await sandbox.set_autostop_interval(5)
            save()
            unknown = False
    finally:
        store.finish_action(row["id"], token, unknown=unknown)
    return report
