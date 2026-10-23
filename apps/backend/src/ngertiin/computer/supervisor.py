"""Version-two durable browser supervisor. Jev chooses actions; code owns effects."""

import asyncio
import hashlib
import json
import time
from contextlib import suppress

from ngertiin.chat.store import one
from ngertiin.computer import (
    candidates,
    continuation,
    evidence,
    jev,
    lifecycle,
    model,
    policy,
    reporting,
    resilience,
    steps,
    store,
)
from ngertiin.computer.contracts import (
    Action,
    ComputerPaused,
    DomUnavailable,
    NeedsHuman,
    StaleTarget,
)
from ngertiin.sandbox.contracts import StagedFile
from ngertiin.tasks import budget
from ngertiin.tasks import store as tasks


async def checkpoint_wait(execution, stage, reason):
    async with tasks.locked(execution["owner_id"], execution["id"]) as (conn, task):
        tasks.fence(task, execution)
        await store.yield_task(conn, task, stage, reason)
    raise ComputerPaused()


async def save_candidate(execution, session, action, rows, runtime, workspace):
    specs = execution["output_spec"]
    values = {f.get("filename"): f for f in action.files}
    if len(values) != len(action.files) or set(values) != {s["filename"] for s in specs}:
        raise ValueError("Berkas kandidat belum sesuai kontrak hasil.")
    names = [s["filename"] for s in specs if values[s["filename"]].get("download")]
    downloaded = {f.filename: f for f in await runtime.collect(workspace, names)} if names else {}
    files = []
    for spec in specs:
        name = spec["filename"]
        if name in downloaded:
            files.append(downloaded[name])
        else:
            text = values[name].get("content")
            if not isinstance(text, str) or not text.strip():
                raise ValueError("Kandidat hasil kosong.")
            files.append(StagedFile(name, text.encode()))
    return await candidates.save(
        execution, session, files, action.description, [r["id"] for r in rows]
    )


async def finalize(execution, workspace, session, runtime, *, reason=None):
    rows = await evidence.load(execution)
    if not rows:
        await checkpoint_wait(
            execution,
            "computer_blocked",
            reason
            or "Belum ada evidence yang cukup. Ambil alih atau lanjutkan dengan arahan baru.",
        )
    await continuation.update(execution, phase="synthesize")
    partial = False
    ident = None
    if reason:
        await continuation.update(execution, feedback=reason, finish_reason=reason)
    if not partial:
        try:
            report = await resilience.model_result(reporting.synthesize, execution, rows)
            action = Action(
                kind="finish",
                description=report.summary[:600] or "Kandidat hasil.",
                files=[f.model_dump() for f in report.files],
            )
            ident = await save_candidate(execution, session, action, rows, runtime, workspace)
            await continuation.update(execution, pending_candidate=str(ident), phase="verify")
            verdict = await resilience.model_result(reporting.verify, execution, report, rows)
            await candidates.verdict(execution, ident, verdict.status, verdict.model_dump())
            if verdict.status != "passed" or not report.complete:
                reason = "Bukti belum cukup untuk hasil lengkap. " + verdict.reason[:300]
                partial = True
        except (budget.BudgetExhausted, budget.AdmissionDenied, ValueError):
            reason = "Finalisasi lengkap belum dapat diverifikasi dalam budget yang tersedia."
            partial = True
    if partial:
        await continuation.update(execution, phase="partial", finish_reason=reason)
        action = reporting.partial(execution, rows, reason or "Cakupan belum lengkap.")
        ident = await save_candidate(execution, session, action, rows, runtime, workspace)
        await candidates.verdict(
            execution, ident, "partial", {"reason": reason, "renderer": "original_excerpts"}
        )
    assert ident is not None
    if not partial:
        await continuation.update(execution, phase="verified")
    await candidates.promote(execution, ident)
    if not await lifecycle.stop_task(execution["owner_id"], execution["id"], runtime):
        await lifecycle.pending(execution, "Hasil tersimpan; cleanup perlu diperiksa.")
        raise ComputerPaused()


def action_key(action):
    value = action.model_dump(exclude={"description", "files"})
    if value.get("dom"):
        value["dom"].pop("guard", None)
        value["dom"].pop("document", None)
    return hashlib.sha256(json.dumps(value, sort_keys=True).encode()).hexdigest()


async def draft(execution):
    async with tasks.locked(execution["owner_id"], execution["id"]) as (conn, task):
        tasks.fence(task, execution)
        prepared = bool(task["draft"].strip()) and task["stage"] in (
            "review",
            "draft_ready",
            "publishing",
        )
        if prepared:
            await candidates.require_publishable(conn, task)
    if prepared:
        if not await lifecycle.stop_task(execution["owner_id"], execution["id"]):
            await lifecycle.pending(execution, "Penghentian komputer perlu diperiksa.")
            raise ComputerPaused()
        return
    runtime = policy.get_runtime(execution["budget_policy"]["computer"]["provider"])
    workspace, session, starting = await store.acquire(execution)
    try:
        if starting:
            await tasks.progress(execution, "computer_starting")
            workspace = await lifecycle.start(execution, workspace, session, runtime)
        if session["policy"]["engine"] == "jev" and not workspace.get("capability", {}).get("dom"):
            await lifecycle.stop_task(execution["owner_id"], execution["id"], runtime)
            await checkpoint_wait(
                execution,
                "computer_upgrade_required",
                "Runtime Jev belum siap. Profil dipertahankan; maintenance diperlukan "
                "sebelum Task dilanjutkan.",
            )
        await continuation.update(
            execution,
            schema_version=2,
            subgoal=execution.get("runtime_state", {}).get(
                "subgoal", "Cari sumber relevan, buka, baca, dan simpan bukti sebelum sintesis."
            ),
        )
        started = time.monotonic()
        while True:
            workspace = await store.current(execution, workspace["id"])
            if (
                time.monotonic() - started > 60
                or execution.get("attempt_deadline", float("inf")) - time.monotonic() < 110
            ):
                await continuation.yield_execution(execution)
            async with tasks.transaction() as conn:
                approved = await one(
                    conn,
                    "SELECT * FROM computer_steps WHERE task_id=%s AND "
                    "state='approved' ORDER BY created_at LIMIT 1",
                    (execution["id"],),
                )
                history = await (
                    await conn.execute(
                        "SELECT action,state FROM computer_steps WHERE task_id=%s AND "
                        "kind<>'observe' ORDER BY created_at DESC LIMIT 8",
                        (execution["id"],),
                    )
                ).fetchall()
                count = await one(
                    conn,
                    "SELECT count(*) AS n FROM computer_steps WHERE task_id=%s AND kind<>'observe'",
                    (execution["id"],),
                )
            rows = await evidence.load(execution)
            execution["browser_evidence"] = evidence.bundle(rows, 1800)
            if count["n"] >= session["policy"]["max_steps"]:
                return await finalize(
                    execution,
                    workspace,
                    session,
                    runtime,
                    reason="Batas langkah eksplorasi tercapai.",
                )
            if approved:
                action = Action.model_validate(approved["action"])
            else:
                try:
                    new = False
                    if session["policy"]["engine"] == "jev":
                        page = await steps.observe_dom(execution, workspace, session, runtime)
                        fingerprint = hashlib.sha256(
                            (page["url"] + page["text"]).encode()
                        ).hexdigest()
                        await continuation.update(execution, engine="jev", phase="read_source")
                        # Bootstrap a blank browser with a deterministic public search.
                        if page["url"].startswith("chrome-error:"):
                            state = execution.get("runtime_state", {})
                            failures = state.get("navigation_failures", 0) + 1
                            previous = state.get("last_readable_url")
                            if not previous or failures > 3:
                                return await finalize(
                                    execution,
                                    workspace,
                                    session,
                                    runtime,
                                    reason="Situs tidak dapat dibuka setelah mencoba alternatif.",
                                )
                            await continuation.update(
                                execution,
                                navigation_failures=failures,
                                feedback="Sumber sebelumnya gagal dibuka. Pilih link sumber lain; "
                                "jangan ulangi sumber yang sama atau halaman login.",
                            )
                            action = Action(
                                kind="navigate",
                                url=previous,
                                description="Kembali untuk memilih sumber lain.",
                            )
                        elif page["url"] in ("about:blank", "chrome://newtab/"):
                            from urllib.parse import quote

                            action = Action(
                                kind="navigate",
                                url="https://www.google.com/search?q="
                                + quote(execution["instruction"].split(". ", 1)[0][:180]),
                                description="Mencari sumber sesuai tujuan.",
                            )
                        else:
                            if page["url"].startswith("https://"):
                                await continuation.update(execution, last_readable_url=page["url"])
                            decision = await jev.decide(execution, page, list(reversed(history)))
                            if decision.relevant:
                                new = await evidence.save(execution, page)
                            if decision.kind == "human":
                                raise NeedsHuman(
                                    "Halaman membutuhkan input privat atau bantuan manusia."
                                )
                            if decision.kind == "done":
                                return await finalize(execution, workspace, session, runtime)
                            if decision.kind == "blocked":
                                used = execution.get("runtime_state", {}).get("fallbacks", 0)
                                if used >= 2:
                                    return await finalize(
                                        execution,
                                        workspace,
                                        session,
                                        runtime,
                                        reason="Fallback terbatas belum berhasil.",
                                    )
                                await continuation.update(
                                    execution,
                                    engine="screenshot",
                                    fallbacks=used + 1,
                                    fallback_reason="dom_blocked",
                                )
                                screen = await steps.observe(execution, workspace, session, runtime)
                                action = await model.propose(
                                    execution, screen, list(reversed(history))
                                )
                            else:
                                action = decision.action
                    else:
                        screen = await steps.observe(execution, workspace, session, runtime)
                        fingerprint = screen.fingerprint
                        action = await model.propose(execution, screen, list(reversed(history)))
                    looped = await evidence.observe_progress(execution, fingerprint, new)
                    if looped:
                        state = execution.get("runtime_state", {})
                        if state.get("replanned"):
                            return await finalize(
                                execution,
                                workspace,
                                session,
                                runtime,
                                reason="Tidak ada kemajuan baru setelah strategi diperbaiki.",
                            )
                        await continuation.update(
                            execution,
                            replanned=True,
                            observations=[],
                            no_progress=0,
                            action_repeats=0,
                            feedback="Tidak ada kemajuan. Pilih sumber atau strategi lain.",
                            subgoal="Cari sumber alternatif yang menambah bukti.",
                        )
                        continue
                except budget.BudgetExhausted:
                    return await finalize(
                        execution,
                        workspace,
                        session,
                        runtime,
                        reason="Batas eksplorasi tercapai; finalisasi bukti tersedia.",
                    )
                except DomUnavailable:
                    await lifecycle.stop_task(execution["owner_id"], execution["id"], runtime)
                    await checkpoint_wait(
                        execution,
                        "computer_upgrade_required",
                        "Capability Jev hilang; periksa runtime sebelum melanjutkan.",
                    )
                except ValueError as error:
                    if isinstance(error, NeedsHuman) or not str(error).startswith(
                        ("Keputusan browser", "Argumen aksi browser")
                    ):
                        raise
                    await continuation.correction(execution, str(error))
                    if "sementara" in str(error) or "terputus" in str(error):
                        await continuation.yield_execution(execution, "provider_retry")
                    continue
            if action is None:
                raise ValueError("Supervisor tidak menerima keputusan aksi.")
            await store.current(execution, workspace["id"])
            if action.kind == "finish":
                # A screenshot actor cannot bypass source-bound finalization.
                return await finalize(execution, workspace, session, runtime)
            if action.kind == "ask_user":
                raise NeedsHuman(action.description)
            key = action_key(action)
            state = execution.get("runtime_state", {})
            if (
                not approved
                and state.get("no_progress", 0) > 0
                and state.get("last_action") == key
                and state.get("action_repeats", 0) >= 4
            ):
                return await finalize(
                    execution,
                    workspace,
                    session,
                    runtime,
                    reason="Aksi yang sama tidak menghasilkan kemajuan.",
                )
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
                            "UPDATE computer_steps SET state='stale' WHERE id=%s AND "
                            "state='approved'",
                            (approved["id"],),
                        )
                    await checkpoint_wait(
                        execution,
                        "computer_human",
                        "Halaman berubah setelah approval. Tinjau ulang target.",
                    )
                await continuation.update(execution, feedback="Target berubah; pilih ulang.")
                continue
            await continuation.update(
                execution,
                last_action=key,
                action_repeats=state.get("action_repeats", 0) + 1
                if state.get("last_action") == key
                else 1,
            )
            await continuation.checkpoint(execution, action.description)
    except (ComputerPaused, tasks.StaleExecution, asyncio.CancelledError):
        raise
    except NeedsHuman as error:
        await checkpoint_wait(execution, "computer_human", str(error))
    except Exception as error:
        if await resilience.recover(execution, error):
            raise ComputerPaused() from None
        stopped = await asyncio.shield(
            lifecycle.stop_task(execution["owner_id"], execution["id"], runtime)
        )
        if not stopped:
            with suppress(tasks.StaleExecution):
                await lifecycle.pending(
                    execution, "Outcome browser belum pasti; aksi tidak akan diulang otomatis."
                )
            raise ComputerPaused() from None
        await tasks.fail(
            execution,
            "Gangguan berulang belum pulih. Progres tersimpan; pilih Coba lagi untuk melanjutkan.",
        )
        raise ComputerPaused() from None
