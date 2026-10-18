"""Explicit live P10/P11/P12 probes through the product ledger and runtime interface."""

import argparse
import asyncio
import json
import time
from dataclasses import asdict
from pathlib import Path
from uuid import UUID, uuid4

from ngertiin.config import get_settings
from ngertiin.files import results
from ngertiin.sandbox import lifecycle, outputs, policy
from ngertiin.sandbox import store as resources
from ngertiin.sandbox.contracts import RuntimeFailure, SessionSpec, StagedFile
from ngertiin.tasks import actions, creation, store
from ngertiin.tasks.jobs import task_job
from ngertiin.worker.queue import queue_app

SECURITY = r"""
import ctypes,json,os,resource,socket,subprocess
from pathlib import Path
checks={}
try:
    socket.socket()
    checks['network_denied']=False
except PermissionError:
    checks['network_denied']=True
try:
    Path('/proc/1/environ').read_bytes()
    checks['root_process_environment_denied']=False
except PermissionError:
    checks['root_process_environment_denied']=True
checks['uid_unprivileged']=os.getuid()==65534
checks['secrets_absent']=set(os.environ)<= {'PATH','HOME','LANG','OPENBLAS_NUM_THREADS','OMP_NUM_THREADS'}
checks['sudo_denied']=subprocess.run(['sudo','-n','id'],capture_output=True,timeout=3).returncode!=0
checks['child_network_denied']=subprocess.run(['python3','-c','import socket;socket.socket()'],capture_output=True,timeout=3).returncode!=0
try:
    resource.setrlimit(resource.RLIMIT_FSIZE,(20000000,20000000))
    checks['hard_limit_cannot_be_raised']=False
except ValueError:
    checks['hard_limit_cannot_be_raised']=True
lib=ctypes.CDLL(None,use_errno=True)
checks['io_uring_denied']=lib.syscall(425,1,ctypes.create_string_buffer(256))==-1 and ctypes.get_errno()==1
checks['memory_hard_bytes']=resource.getrlimit(resource.RLIMIT_AS)[1]
checks['file_hard_bytes']=resource.getrlimit(resource.RLIMIT_FSIZE)[1]
checks['process_hard_count']=resource.getrlimit(resource.RLIMIT_NPROC)[1]
Path('/tmp/ngertiin-work/outputs/probe.json').write_text(json.dumps(checks))
Path('/tmp/ngertiin-work/outputs/escape.txt').symlink_to('/etc/passwd')
print(json.dumps(checks))
"""

LIMITS = r"""
import json,subprocess
from pathlib import Path
memory=subprocess.run(['python3','-c','x=bytearray(3*1024**3)'],capture_output=True,timeout=5)
disk=subprocess.run(['python3','-c',"open('/tmp/ngertiin-work/outputs/large.tmp','wb').truncate(11*1024**2)"],capture_output=True,timeout=5)
Path('/tmp/ngertiin-work/outputs/limits.json').write_text(json.dumps({'memory_stopped':memory.returncode!=0,'oversize_file_stopped':disk.returncode!=0}))
print('x'*20000)
"""


async def probe(owner, destination):
    if get_settings().app_env != "development":
        raise RuntimeError("Live diagnostics require development")
    from ngertiin.chat.store import bootstrap

    adapter = policy.get_runtime()
    report = {"kind": "live_controlled_runtime_contract", "started_at": time.time()}
    session, execution, job_id = None, None, None
    destination.parent.mkdir(parents=True, exist_ok=True)
    original_enqueue = store.enqueue

    async def held(conn, task):
        job = await task_job.configure(
            connection=conn, queue="sandbox-inspection", lock=f"task:{task['id']}"
        ).defer_async(task_id=str(task["id"]))
        await store.change(conn, task, job_id=job)

    try:
        thread = (await bootstrap(owner))["threads"][0]["id"]
        store.enqueue = held
        task = await creation.create(
            owner,
            thread,
            uuid4(),
            "NG-035: uji isolasi dan batas runtime terkontrol, lalu simpan buktinya.",
            False,
            runtime_kind="code",
            outputs=[{"filename": "probe.json", "format": "json"}],
        )
        store.enqueue = original_enqueue
        execution = await store.claim(task["id"])
        job_id = execution["job_id"]
        session = await resources.reserve(execution)
        report.update(
            task_id=str(task["id"]),
            session_id=str(session["id"]),
            ceiling_microusd=session["reserved_microusd"],
            info=asdict(await adapter.preflight()),
        )
        destination.write_text(json.dumps(report, indent=2) + "\n")
        await resources.active_change(execution, session["id"], "provisioning")
        session["state"] = "provisioning"
        ref = await adapter.create(
            SessionSpec(session["resource_name"], str(task["id"]), str(owner), 3)
        )
        session.update(state="ready", resource_id=ref.id)
        await resources.active_change(
            execution, session["id"], "ready", resource_id=ref.id
        )
        await adapter.stage(ref, [])
        step = await resources.dispatch(execution, session["id"], 0, SECURITY)
        receipt = await adapter.execute(ref, SECURITY, 15)
        await resources.receipt(step, receipt)
        report["security_receipt"] = asdict(receipt)
        if receipt.exit_code:
            raise AssertionError("Security probe producer failed")
        security_files = await adapter.collect(ref, ["probe.json"])
        report["security"] = json.loads(security_files[0].data)
        assert all(
            v
            for k, v in report["security"].items()
            if k.endswith(("denied", "absent", "unprivileged", "raised"))
        )
        try:
            await adapter.collect(ref, ["escape.txt"])
        except RuntimeFailure:
            report["symlink_collection_rejected"] = True
        else:
            raise AssertionError("Symlink accepted")
        step = await resources.dispatch(execution, session["id"], 1, LIMITS)
        receipt = await adapter.execute(ref, LIMITS, 15)
        await resources.receipt(step, receipt)
        report["stdout_bound"] = {
            "bytes": len(receipt.stdout.encode()),
            "exit_code": receipt.exit_code,
        }
        assert len(receipt.stdout.encode()) <= 16000
        limit_files = await adapter.collect(ref, ["limits.json"])
        report["limits"] = json.loads(limit_files[0].data)
        assert all(report["limits"].values())
        step = await resources.dispatch(execution, session["id"], 2, "while True: pass")
        receipt = await adapter.execute(ref, "while True: pass", 2)
        await resources.receipt(step, receipt)
        report["timeout"] = asdict(receipt)
        assert receipt.exit_code in (124, 137, 152) and receipt.duration_ms < 10000
        await outputs.persist(
            execution,
            session,
            [StagedFile("probe.json", security_files[0].data)],
            "P10/P11: isolasi dan resource caps teruji pada Daytona nyata.",
        )
        report["cleanup_confirmed"] = await lifecycle.cleanup(session, adapter)
        assert report["cleanup_confirmed"]
        proposal = await actions.ensure(execution)
        await actions.begin(execution, proposal["id"])
        manifest = await results.prepare(execution)
        await actions.publish(execution, proposal["id"], version_id=manifest)
        report["result_id"] = str(task["result_id"])
        async with store.transaction() as conn:
            report["costs"] = await resources.summary(conn, execution)
        _, after = await outputs.content(
            owner,
            task["id"],
            UUID(
                json.loads((await store.detail(owner, task["id"]))["draft"])["files"][
                    0
                ]["staged_output_id"]
            ),
        )
        report["bytes_after_sandbox_deletion"] = after == security_files[0].data
        report["passed"] = True
    finally:
        store.enqueue = original_enqueue
        if session and not report.get("cleanup_confirmed"):
            report["cleanup_confirmed"] = await lifecycle.cleanup(session, adapter)
        if execution and not report.get("passed"):
            from contextlib import suppress

            with suppress(store.StaleExecution):
                await store.fail(execution, "Probe runtime terhenti; periksa evidence.")
        if job_id:
            async with queue_app.open_async():
                await queue_app.job_manager.cancel_job_by_id_async(job_id, abort=True)
        report["seconds"] = round(time.time() - report["started_at"], 3)
        destination.write_text(json.dumps(report, indent=2, default=str) + "\n")
    print(
        json.dumps(
            {
                k: report.get(k)
                for k in (
                    "passed",
                    "cleanup_confirmed",
                    "task_id",
                    "result_id",
                    "seconds",
                )
            }
        )
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--live", action="store_true", required=True)
    parser.add_argument("--owner-file", type=Path, required=True)
    parser.add_argument(
        "--output", type=Path, default=Path(".dev/ng035-live-runtime.json")
    )
    args = parser.parse_args()
    asyncio.run(
        probe(UUID(json.loads(args.owner_file.read_text())["owner_id"]), args.output)
    )
