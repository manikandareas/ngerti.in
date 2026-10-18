"""Prove provider TTL independently of the local worker (deliberate SIGKILL)."""

import asyncio
import json
import subprocess
import sys
import time
from pathlib import Path

from ngertiin.daytona_trial import provider, store


async def ttl_probe(owner_id: str, output: Path) -> dict:
    output.mkdir(parents=True, exist_ok=True)
    child = (
        "import asyncio,os,signal; from ngertiin.daytona_trial import provider; "
        f"asyncio.run(provider.create({owner_id!r},2)); "
        "os.kill(os.getpid(),signal.SIGKILL)"
    )
    process = await asyncio.create_subprocess_exec(
        sys.executable,
        "-c",
        child,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    returncode = await process.wait()
    assert returncode == -9, "Worker did not reach intentional SIGKILL"
    row = store.sessions(owner_id)[0]
    assert row["status"] == "ready" and row["sandbox_id"]
    report: dict = {
        "session_id": row["id"],
        "sandbox_id": row["sandbox_id"],
        "worker_exit_code": returncode,
        "ttl_minutes": 2,
        "observations": [],
    }

    def save():
        (output / "ttl-worker-crash.json").write_text(json.dumps(report, indent=2) + "\n")

    save()
    print("Worker killed; waiting for provider-owned TTL cleanup.", flush=True)
    async with provider.client() as api:
        for _ in range(40):
            resources = [s async for s in api.list() if s.name == f"ng031-{row['id']}"]
            elapsed = round(time.time() - row["created_at"], 2)
            report["observations"].append(
                {
                    "elapsed_seconds": elapsed,
                    "resource_count": len(resources),
                    "states": [str(s.state) for s in resources],
                }
            )
            save()
            if not resources:
                assert elapsed >= 110, "Resource disappeared before the TTL experiment"
                report["provider_cleanup_after_worker_crash"] = True
                report["cleanup"] = await provider.cleanup(row["id"], owner_id)
                save()
                return report
            await asyncio.sleep(5)
    raise store.TrialError("TTL cleanup belum terkonfirmasi; jalankan cleanup eksplisit.")
