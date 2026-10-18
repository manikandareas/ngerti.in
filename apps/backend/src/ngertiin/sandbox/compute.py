"""Generate → bounded dispatch → validate/persist → confirmed cleanup → review."""

import asyncio
import math
from dataclasses import asdict
from datetime import UTC, datetime

from ngertiin.sandbox import inputs, lifecycle, model, outputs, policy, store
from ngertiin.sandbox.contracts import (
    RuntimeFailure,
    RuntimePending,
    SandboxRef,
    SandboxRuntime,
    SessionSpec,
)
from ngertiin.tasks import store as tasks


async def draft(execution, runtime: SandboxRuntime | None = None):
    async with tasks.locked(execution["owner_id"], execution["id"]) as (conn, task):
        tasks.fence(task, execution)
        if task["draft"].strip() and task["stage"] in ("review", "draft_ready", "publishing"):
            await store.require_reconciled(conn, task)
            return
    rules = execution["budget_policy"]["sandbox"]
    runtime = runtime or policy.get_runtime(rules["provider"])
    staged, context = await inputs.prepare(execution)
    session = await store.reserve(execution)
    try:
        # Generate before provisioning so model latency does not consume runtime.
        code = await model.generate(execution, context)
        await tasks.progress(execution, "provisioning")
        await store.active_change(execution, session["id"], "provisioning")
        session["state"] = "provisioning"
        ttl = math.floor((session["deadline"] - datetime.now(UTC)).total_seconds() / 60)
        if ttl < 1:
            raise ValueError("Deadline komputasi habis sebelum provisioning.")
        try:
            ref = await runtime.create(
                SessionSpec(
                    session["resource_name"],
                    str(execution["id"]),
                    str(execution["owner_id"]),
                    ttl,
                )
            )
        except RuntimeFailure as error:
            if not error.unknown:
                session["state"] = "reserved"  # Definitive rejection before allocation.
                await store.resource_state(session, "reserved")
            raise
        session.update(resource_id=ref.id, state="ready")
        await store.active_change(execution, session["id"], "ready", resource_id=ref.id)
        await runtime.stage(ref, staged)
        await run_steps(execution, session, ref, code, context, runtime)
    finally:
        # Cleanup is durable/periodic as well as best-effort in this worker.
        cleanup_task = asyncio.create_task(lifecycle.cleanup(session, runtime))
        try:
            confirmed = await asyncio.shield(cleanup_task)
        except asyncio.CancelledError:
            confirmed = await cleanup_task
            raise
        if not confirmed:
            raise RuntimePending(
                "Resource masih diperiksa. Tidak ada eksekusi baru sampai cleanup terkonfirmasi."
            )


async def run_steps(execution, session, ref: SandboxRef, code, context, runtime: SandboxRuntime):
    rules = session["policy"]
    previous_error = None
    for position in range(rules["max_steps"]):
        if position:
            code = await model.generate(execution, context, previous_error)
        await tasks.progress(execution, "executing_code")
        step = await store.dispatch(execution, session["id"], position, code)
        receipt = None
        try:
            receipt = await runtime.execute(ref, code, rules["command_seconds"])
        finally:
            await store.receipt(step, receipt)
        if receipt.exit_code != 0:
            previous_error = {"code": code, "receipt": asdict(receipt)}
            if receipt.exit_code in (124, 137, 152, 153):
                raise ValueError(
                    "Komputasi dihentikan oleh batas waktu/resource. Hasil lengkap belum tersedia."
                )
            continue
        await tasks.progress(execution, "collecting_outputs")
        try:
            files = await runtime.collect(ref, [s["filename"] for s in execution["output_spec"]])
        except RuntimeFailure as error:
            if error.unknown:
                raise
            previous_error = {"code": code, "error": str(error)}
            continue
        await outputs.persist(
            execution,
            session,
            files,
            receipt.stdout.strip() or "Komputasi selesai; berkas hasil siap ditinjau.",
        )
        return
    raise ValueError(
        "Program belum menghasilkan berkas lengkap setelah batas perbaikan. "
        "Detail percobaan tersimpan."
    )
