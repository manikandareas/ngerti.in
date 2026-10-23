"""Explicit, bounded P12 trial: publish real sandbox bytes, delete it, read results."""

import argparse
import asyncio
import base64
import hashlib
import json
import shlex
import time
from pathlib import Path
from uuid import UUID, uuid4

from e2b import AsyncSandbox
from ngertiin import e2b
from ngertiin.chat.store import bootstrap
from ngertiin.config import get_settings
from ngertiin.files import results
from ngertiin.files import store as files
from ngertiin.sandbox.e2b import E2BAdapter
from ngertiin.tasks import actions, creation, store
from ngertiin.tasks.jobs import task_job
from ngertiin.worker.queue import queue_app


async def probe(owner: UUID, output: Path):
    if get_settings().app_env != "development":
        raise RuntimeError("Requires development")
    report = {"kind": "live_e2b_output_persistence", "started_at": time.time()}
    sandbox = None
    job_id = None
    output.parent.mkdir(parents=True, exist_ok=True)
    try:
        info = await E2BAdapter().preflight()
        report["preflight"] = {"provider": info.provider}
        sandbox = await AsyncSandbox.create(
            template=get_settings().e2b_sandbox_template,
            timeout=180,
            metadata={"ngertiin": "file-persistence-probe"},
            allow_internet_access=False,
            network={"allow_public_traffic": False},
            lifecycle={"on_timeout": "kill", "auto_resume": False},
            **e2b.options(),
        )
        report.update(sandbox_id=sandbox.sandbox_id, ttl_minutes=3)
        payloads = {
            "sandbox-note.md": "# Hasil dari sandbox\nBerkas ini harus tetap ada sesudah sandbox dihapus.\n",
            "sandbox-data.csv": "item,jumlah\nBuku,12\nPensil,24\n",
            "preview-isolation.html": (
                "<!doctype html><h1>Preview terisolasi</h1><p>Konten aman tetap terbaca.</p>"
                "<script>window.ng034ScriptRan=true;parent.ng034Escaped=true;"
                "fetch('https://example.invalid/ng034-preview-probe')</script>"
                "<img src='https://example.invalid/ng034-preview-image'>"
                "<form action='https://example.invalid/ng034-preview-form'><button>Kirim uji</button></form>"
            ),
        }
        encoded = base64.b64encode(json.dumps(payloads).encode()).decode()
        command = "python3 -c " + shlex.quote(
            "import base64,json,pathlib; "
            "p=pathlib.Path('/tmp/ng034');p.mkdir(exist_ok=True); "
            f"data=json.loads(base64.b64decode('{encoded}')); "
            "[(p/n).write_text(v) for n,v in data.items()];print('ng034-fixtures-written')"
        )
        execution = await e2b.run(sandbox, command)
        if execution.exit_code != 0:
            raise RuntimeError("Sandbox fixture producer failed")
        report["producer"] = {"exit_code": execution.exit_code}
        bodies = {}
        for name in payloads:
            data = await sandbox.files.read("/tmp/ng034/" + name, format="bytes")
            bodies[name] = bytes(data)
            if len(bodies[name]) > 10 * 1024 * 1024:
                raise RuntimeError("Producer output exceeded bound")
        thread = (await bootstrap(owner))["threads"][0]["id"]
        original_enqueue = store.enqueue

        async def held(conn, task):
            job = await task_job.configure(
                connection=conn, queue="ng034-inspection", lock=f"task:{task['id']}"
            ).defer_async(task_id=str(task["id"]))
            await store.change(conn, task, job_id=job)

        store.enqueue = held
        try:
            task = await creation.create(
                owner,
                thread,
                uuid4(),
                "P12: simpan keluaran fixture sandbox dan uji preview terisolasi.",
                False,
                outputs=[
                    {"filename": name, "format": name.rsplit(".", 1)[1]}
                    for name in bodies
                ],
            )
        finally:
            store.enqueue = original_enqueue
        claimed = await store.claim(task["id"])
        job_id = claimed["job_id"]
        draft = json.dumps(
            {
                "summary": "P12: tiga berkas berasal dari sandbox yang sudah dihapus.",
                "files": [
                    {"filename": name, "content": data.decode()}
                    for name, data in bodies.items()
                ],
            }
        )
        await store.progress(claimed, "draft_ready", draft=draft)
        proposal = await actions.ensure(claimed)
        await actions.begin(claimed, proposal["id"])
        manifest_id = await results.prepare(claimed)
        await actions.publish(claimed, proposal["id"], version_id=manifest_id)
        report.update(
            task_id=str(task["id"]),
            result_id=str(task["result_id"]),
            manifest_id=str(manifest_id),
            source="bounded_static_fixture_adapter",
        )
        await sandbox.kill(request_timeout=20)
        report["cleanup"] = {"deleted": await e2b.info(sandbox.sandbox_id) is None}
        if not report["cleanup"]["deleted"]:
            raise AssertionError("Sandbox deletion was not confirmed")
        async with store.transaction() as conn:
            result = await results.detail(conn, owner, task["result_id"])
        verified = []
        for file in result["selected"]["manifest"]["files"]:
            _, data = await files.content(owner, UUID(file["revision_id"]))
            if data != bodies[file["filename"]]:
                raise AssertionError("Output changed after sandbox deletion")
            verified.append(
                {
                    "filename": file["filename"],
                    "revision_id": file["revision_id"],
                    "sha256": hashlib.sha256(data).hexdigest(),
                    "bytes": len(data),
                }
            )
        report.update(
            files_after_deletion=verified,
            passed=True,
            seconds=time.time() - report["started_at"],
        )
    finally:
        if sandbox and not report.get("cleanup", {}).get("deleted"):
            await sandbox.kill(request_timeout=20)
            report["cleanup"] = {"deleted": await e2b.info(sandbox.sandbox_id) is None}
        if job_id:
            async with queue_app.open_async():
                await queue_app.job_manager.cancel_job_by_id_async(job_id, abort=True)
        output.write_text(json.dumps(report, indent=2) + "\n")
    print(
        json.dumps(
            {
                "passed": report.get("passed", False),
                "cleanup": report.get("cleanup"),
                "result_id": report.get("result_id"),
                "seconds": round(report.get("seconds", 0), 2),
            }
        )
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--live", action="store_true", required=True)
    parser.add_argument("--owner", type=UUID, required=True)
    parser.add_argument("--output", type=Path, default=Path(".dev/files-p12.json"))
    args = parser.parse_args()
    asyncio.run(probe(args.owner, args.output))


if __name__ == "__main__":
    main()
