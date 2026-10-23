"""Bounded browser work yields durable decisions, then reuses existing result review."""

import asyncio
import hashlib
import json
import time
from contextlib import suppress
from uuid import uuid4

from openai import APIConnectionError, InternalServerError, RateLimitError

from ngertiin.chat.store import json_value, one
from ngertiin.computer import continuation, lifecycle, model, policy, steps, store
from ngertiin.computer.contracts import (
    Action,
    ComputerPaused,
    DomUnavailable,
    NeedsHuman,
    StaleTarget,
)
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
        if not prepared and task["draft"].strip():
            try:
                candidate = json.loads(task["draft"])
                prepared = bool(candidate.get("files")) and all(
                    f.get("staged_output_id") for f in candidate["files"]
                )
            except (ValueError, AttributeError, TypeError):
                prepared = False
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
            screen = None
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
                action: Action | None
                action = Action.model_validate(approved["action"])
            else:
                if count["n"] >= session["policy"]["max_steps"]:
                    raise ValueError("Batas langkah browser tercapai; hasil sebelumnya tersimpan.")
                if (
                    time.monotonic() - slice_started > 60
                    or execution.get("attempt_deadline", float("inf")) - time.monotonic() < 110
                ):
                    await continuation.yield_execution(execution)
                try:
                    history = list(reversed(history))
                    if (
                        session["policy"].get("engine") == "jev"
                        and execution.get("runtime_state", {}).get("engine") != "screenshot"
                        and hasattr(runtime, "observe_dom")
                    ):
                        from ngertiin.computer import jev

                        await tasks.progress(execution, "computer_dom")
                        try:
                            page = await steps.observe_dom(execution, workspace, session, runtime)
                        except DomUnavailable:
                            await continuation.update(
                                execution, engine="screenshot", reason="legacy_template"
                            )
                            continue
                        fingerprint = hashlib.sha256(
                            json.dumps(
                                {k: page[k] for k in ("url", "text", "document")},
                                sort_keys=True,
                            ).encode()
                        ).hexdigest()
                        previous = execution.get("runtime_state", {})
                        unchanged = (
                            previous.get("unchanged", 0) + 1
                            if previous.get("observation") == fingerprint
                            else 0
                        )
                        await continuation.update(
                            execution, observation=fingerprint, unchanged=unchanged
                        )
                        if previous.get("observation") != fingerprint:
                            await continuation.update(
                                execution,
                                evidence=[
                                    *previous.get("evidence", []),
                                    {
                                        "url": page["url"][:2048],
                                        "title": page["title"][:200],
                                        "text": page["text"][:800],
                                    },
                                ][-12:],
                            )
                        action = (
                            await jev.propose(execution, page, history)
                            if page["url"].startswith("https://") and unchanged < 3
                            else None
                        )
                    else:
                        action = None
                    if action is None:
                        screen = await steps.observe(execution, workspace, session, runtime)
                        action = await model.propose(execution, screen, history)
                except ValueError as error:
                    if not str(error).startswith(("Keputusan browser", "Argumen aksi browser")):
                        raise
                    await continuation.correction(execution, str(error))
                    if "sementara" in str(error) or "terputus" in str(error):
                        await continuation.yield_execution(execution, "provider_retry")
                    continue
                except (APIConnectionError, InternalServerError, RateLimitError):
                    await continuation.correction(execution, "Provider sementara tidak tersedia.")
                    await continuation.yield_execution(execution, "provider_retry")
            assert action is not None
            # Discard a model response from before a handoff; it cannot act under a new lease.
            await store.current(execution, workspace["id"])
            if execution.get("attempt_deadline", float("inf")) - time.monotonic() < 35:
                await continuation.yield_execution(execution)
            if action.kind == "finish":
                try:
                    if session["policy"].get("verify_results") and hasattr(runtime, "observe_dom"):
                        from ngertiin.computer.verification import verify

                        await tasks.progress(execution, "computer_verifying")
                        fresh = await steps.observe(execution, workspace, session, runtime)
                        await verify(execution, fresh, action)
                    await finish(execution, workspace, session, action, runtime)
                    return
                except ValueError as error:
                    if str(error).startswith("Model menolak"):
                        raise
                    await continuation.correction(execution, str(error))
                    continue
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
                            screen.fingerprint if screen else "dom-private-handoff",
                            workspace["deadline"],
                        ),
                    )
                    await store.yield_task(conn, task, "computer_human", action.description)
                raise ComputerPaused()
            await tasks.progress(execution, "computer_working")
            try:
                await steps.execute(
                    execution,
                    workspace,
                    session,
                    runtime,
                    action,
                    approved_id=approved["id"] if approved else None,
                )
            except StaleTarget:
                if approved:
                    async with tasks.locked(execution["owner_id"], execution["id"]) as (conn, task):
                        tasks.fence(task, execution)
                        await conn.execute(
                            "UPDATE computer_steps SET state='stale' WHERE id=%s "
                            "AND state='approved'",
                            (approved["id"],),
                        )
                        await store.yield_task(
                            conn,
                            task,
                            "computer_human",
                            "Target berubah setelah persetujuan. Lanjutkan untuk menilai ulang.",
                        )
                    raise ComputerPaused() from None
                await continuation.update(execution, feedback="Target berubah; pilih ulang.")
                continue
            await continuation.checkpoint(execution, action.description)
            if time.monotonic() - slice_started > 90:
                await continuation.yield_execution(execution)
    except (ComputerPaused, tasks.StaleExecution):
        raise
    except NeedsHuman as error:
        async with tasks.locked(execution["owner_id"], execution["id"]) as (conn, task):
            tasks.fence(task, execution)
            await store.yield_task(conn, task, "computer_human", str(error))
        raise ComputerPaused() from None
    except asyncio.CancelledError:
        # Receipt finalizers run first. The domain reconciler distinguishes
        # confirmed reads/actions from unknown effects; cancellation is not Stop.
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
