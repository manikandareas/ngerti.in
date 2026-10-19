"""Bounded browser work yields durable decisions, then reuses existing result review."""

import asyncio
import time
from contextlib import suppress
from uuid import uuid4

from ngertiin.chat.store import json_value, one
from ngertiin.computer import lifecycle, model, policy, steps, store
from ngertiin.computer.contracts import Action, ComputerPaused, NeedsHuman
from ngertiin.sandbox import outputs
from ngertiin.sandbox.contracts import StagedFile
from ngertiin.tasks import store as tasks


async def finish(execution, workspace, session, action, runtime):
    specs = execution["output_spec"]
    values = {f.get("filename"): f for f in action.files}
    if len(values) != len(action.files) or set(values) != {s["filename"] for s in specs}:
        raise ValueError("Berkas hasil browser belum sesuai format yang diminta.")
    downloaded = [s["filename"] for s in specs if values[s["filename"]].get("download") is True]
    files = (
        {f.filename: f for f in await runtime.collect(workspace, downloaded)} if downloaded else {}
    )
    for spec in specs:
        name = spec["filename"]
        if name not in files:
            content = values[name].get("content")
            if not isinstance(content, str) or not content.strip():
                raise ValueError("Berkas hasil browser belum lengkap.")
            files[name] = StagedFile(name, content.encode())
    await outputs.persist(
        execution, session, [files[s["filename"]] for s in specs], action.description
    )
    if not await lifecycle.stop_task(execution["owner_id"], execution["id"], runtime):
        await lifecycle.pending(execution, "Hasil tersimpan; penghentian komputer perlu diperiksa.")
        raise ComputerPaused()


async def draft(execution):
    async with tasks.locked(execution["owner_id"], execution["id"]) as (conn, task):
        tasks.fence(task, execution)
        prepared = bool(task["draft"].strip()) and task["stage"] in (
            "review",
            "draft_ready",
            "publishing",
        )
    if prepared:
        if not await lifecycle.stop_task(execution["owner_id"], execution["id"]):
            await lifecycle.pending(
                execution, "Hasil tersimpan; penghentian komputer perlu diperiksa."
            )
            raise ComputerPaused()
        return
    runtime = policy.get_runtime(execution["budget_policy"]["computer"]["provider"])
    workspace, session, starting = await store.acquire(execution)
    try:
        if starting:
            await tasks.progress(execution, "computer_starting")
            workspace = await lifecycle.start(execution, workspace, session, runtime)
        slice_started = time.monotonic()
        while True:
            workspace = await store.current(execution, workspace["id"])
            await tasks.progress(execution, "computer_observing")
            screen = await steps.observe(execution, workspace, session, runtime)
            async with tasks.transaction() as conn:
                approved = await one(
                    conn,
                    "SELECT * FROM computer_steps WHERE task_id=%s "
                    "AND state='approved' ORDER BY created_at LIMIT 1",
                    (execution["id"],),
                )
                history = await (
                    await conn.execute(
                        "SELECT action,state FROM computer_steps "
                        "WHERE task_id=%s AND kind<>'observe' ORDER BY created_at DESC LIMIT 8",
                        (execution["id"],),
                    )
                ).fetchall()
                count = await one(
                    conn,
                    "SELECT count(*) AS n FROM computer_steps WHERE task_id=%s AND kind<>'observe'",
                    (execution["id"],),
                )
            if approved:
                action = Action.model_validate(approved["action"])
            else:
                if count["n"] >= session["policy"]["max_steps"]:
                    raise ValueError("Batas langkah browser tercapai; hasil sebelumnya tersimpan.")
                action = await model.propose(execution, screen, list(reversed(history)))
            # Discard a model response from before a handoff; it cannot act under a new lease.
            await store.current(execution, workspace["id"])
            if action.kind == "finish":
                await finish(execution, workspace, session, action, runtime)
                return
            if action.kind == "ask_user":
                async with tasks.locked(execution["owner_id"], execution["id"]) as (conn, task):
                    tasks.fence(task, execution)
                    await conn.execute(
                        "INSERT INTO computer_steps(id,session_id,task_id,control_version,"
                        "kind,action,screen_hash,state,expires_at,finished_at) "
                        "VALUES (%s,%s,%s,%s,'ask_user',%s,%s,'complete',%s,now())",
                        (
                            uuid4(),
                            session["id"],
                            task["id"],
                            workspace["control_version"],
                            json_value(action.model_dump()),
                            screen.fingerprint,
                            workspace["deadline"],
                        ),
                    )
                    await store.yield_task(conn, task, "computer_human", action.description)
                raise ComputerPaused()
            await tasks.progress(execution, "computer_working")
            await steps.execute(
                execution,
                workspace,
                session,
                runtime,
                action,
                approved_id=approved["id"] if approved else None,
            )
            if time.monotonic() - slice_started > 90:
                async with tasks.locked(execution["owner_id"], execution["id"]) as (conn, task):
                    tasks.fence(task, execution)
                    await tasks.finish_execution(conn, task, "interrupted")
                    await tasks.change(conn, task, status="queued", lease_token=None)
                    await tasks.enqueue(conn, task)
                    await tasks.emit(conn, task)
                raise ComputerPaused()
    except (ComputerPaused, tasks.StaleExecution):
        raise
    except NeedsHuman as error:
        async with tasks.locked(execution["owner_id"], execution["id"]) as (conn, task):
            tasks.fence(task, execution)
            await store.yield_task(conn, task, "computer_human", str(error))
        raise ComputerPaused() from None
    except asyncio.CancelledError:
        async with tasks.transaction() as conn:
            row = await store.owned(conn, execution["owner_id"], workspace["id"])
        if row["control"] not in ("handoff", "human", "resuming"):
            await asyncio.shield(
                lifecycle.stop_task(execution["owner_id"], execution["id"], runtime)
            )
        raise
    except BaseException:
        stopped = await asyncio.shield(
            lifecycle.stop_task(execution["owner_id"], execution["id"], runtime)
        )
        if not stopped:
            with suppress(tasks.StaleExecution):
                await lifecycle.pending(
                    execution,
                    "Outcome/cleanup browser belum pasti. Aksi tidak akan diulang otomatis.",
                )
            raise ComputerPaused() from None
        raise
