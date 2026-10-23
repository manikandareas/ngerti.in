"""Continuation contracts on disposable PostgreSQL and controlled browser I/O."""

import asyncio
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import inspect_computer as browser
import inspect_files as harness
from ngertiin.computer import (
    actuator,
    continuation,
    desktop_io,
    lifecycle,
    model,
    steps,
    store,
)
from ngertiin.computer import e2b as adapter
from ngertiin.computer.contracts import (
    Action,
    ComputerPaused,
    DomUnavailable,
    StaleTarget,
)
from ngertiin.computer.e2b import E2BComputer


async def scenarios():
    # Legacy actor fixtures retain their explicit workflow contract.
    from ngertiin.config import get_settings

    get_settings().computer_workflow_version = 1
    original = browser.policy.get_runtime
    browser.policy.get_runtime = lambda *_: browser.COMPUTER
    try:
        for label, first in (
            (
                "invalid_decision_corrected",
                ValueError("Keputusan browser belum valid."),
            ),
            (
                "invalid_output_corrected",
                Action(kind="finish", description="Hasil", files=[]),
            ),
        ):
            owner, thread = await harness.owner()
            task = await browser.create(owner, thread)
            final = Action(
                kind="finish",
                description="Hasil lengkap.",
                files=[
                    {"filename": f["filename"], "content": "# Hasil\nTerverifikasi."}
                    for f in task["output_spec"]
                ],
            )
            with patch.object(model, "propose", AsyncMock(side_effect=[first, final])):
                result = await browser.run(owner, task)
            harness.check(label, result["status"] == "succeeded")
        owner, thread = await harness.owner()
        task = await browser.create(owner, thread)
        execution = await browser.tasks.claim(task["id"])
        workspace, session, _ = await store.acquire(execution)
        workspace = await lifecycle.start(
            execution, workspace, session, browser.COMPUTER
        )
        await continuation.checkpoint(execution, "Halaman pertama selesai diperiksa.")
        try:
            await continuation.yield_execution(execution)
        except ComputerPaused:
            pass
        task = await browser.tasks.detail(owner, task["id"])
        harness.check(
            "yield_requeues_without_stopping_browser",
            task["status"] == "queued" and workspace["id"] in browser.COMPUTER.running,
        )
        execution = await browser.tasks.claim(task["id"])
        harness.check(
            "progress_survives_new_execution",
            execution["runtime_state"]["completed_steps"] == 1,
        )
        harness.check(
            "scheduled_yield_not_failed_attempt",
            not browser.tasks.exhausted(
                {**execution, "attempt": 41, "runtime_state": {"yields": 2}}
            ),
        )
        async with browser.tasks.transaction() as conn:
            await conn.execute(
                "UPDATE browser_workspaces SET updated_at=now()-interval '10 minutes',"
                "heartbeat_at=now() WHERE id=%s",
                (workspace["id"],),
            )
        await lifecycle.sweep()
        harness.check(
            "healthy_heartbeat_prevents_idle_stop",
            workspace["id"] in browser.COMPUTER.running,
        )
        async with browser.tasks.locked(owner, task["id"]) as (conn, current):
            harness.check(
                "read_only_worker_loss_recovers",
                await continuation.recover(conn, current, "worker_recovered"),
            )
        execution = await browser.tasks.claim(task["id"])
        step = await steps.begin(
            execution,
            workspace,
            session,
            Action(kind="scroll", description="Baca", direction="down"),
        )
        async with browser.tasks.locked(owner, task["id"]) as (conn, current):
            harness.check(
                "inflight_action_is_not_replayed",
                not await continuation.recover(conn, current, "worker_recovered"),
            )
        await steps.receipt(workspace["id"], step["id"], confirmed=True)
        await browser.commands.cancel(owner, task["id"])
        await lifecycle.stop_task(owner, task["id"])
        owner, thread = await harness.owner()
        task = await browser.create(owner, thread)
        started = asyncio.Event()

        async def delayed_model(*_):
            started.set()
            await asyncio.Event().wait()

        with patch.object(model, "propose", delayed_model):
            running = asyncio.create_task(browser.run(owner, task))
            await asyncio.wait_for(started.wait(), 5)
            running.cancel()
            try:
                await running
            except asyncio.CancelledError:
                pass
        resumed = await browser.tasks.detail(owner, task["id"])
        harness.check(
            "shutdown_commits_continuation_before_reraising",
            resumed["status"] == "queued" and resumed["stage"] == "computer_continuing",
        )
        await browser.commands.cancel(owner, task["id"])
        await lifecycle.stop_task(owner, task["id"])
        with (
            patch.object(adapter, "running", AsyncMock()),
            patch.object(
                adapter.e2b,
                "run",
                AsyncMock(return_value=SimpleNamespace(exit_code=127)),
            ),
        ):
            try:
                await E2BComputer().observe_dom({"id": "legacy"})
            except DomUnavailable:
                harness.check("legacy_template_fallback_preserves_resource", True)
            else:
                raise AssertionError(
                    "Missing DOM runtime must use explicit compatibility fallback"
                )
        with (
            tempfile.TemporaryDirectory() as folder,
            patch.object(actuator, "ROOT", Path(folder)),
        ):
            lease = {
                "epoch": 2,
                "task": "test",
                "deadline": time.time() + 60,
                "operation": "control",
                "control": "human",
            }
            actuator.dispatch(lease)
            for label, request in (
                ("human_control_blocks_observation", {**lease, "operation": "screen"}),
                ("old_control_epoch_rejected", {**lease, "epoch": 1}),
            ):
                try:
                    actuator.dispatch(request)
                except ValueError:
                    harness.check(label, True)
                else:
                    harness.check(label, False)
        with patch.object(
            desktop_io.subprocess,
            "run",
            side_effect=subprocess.TimeoutExpired("xdpyinfo", 1),
        ):
            harness.check(
                "display_timeout_is_retryable_readiness", not desktop_io.display_ready()
            )
        owner, thread = await harness.owner()
        with patch.object(
            model,
            "propose",
            AsyncMock(
                return_value=Action(
                    kind="click",
                    description="Buka hasil",
                    x=50,
                    y=50,
                )
            ),
        ):
            task = await browser.run(owner, await browser.create(owner, thread))
        proposal = task["computer"]["action"]
        await browser.control.decide(
            owner,
            task["id"],
            proposal["id"],
            task["computer"]["workspace"]["control_version"],
            True,
        )
        with patch.object(
            browser.COMPUTER, "target", AsyncMock(side_effect=StaleTarget("changed"))
        ):
            task = await browser.run(owner, task)
        harness.check(
            "stale_approved_target_yields_instead_of_looping",
            task["status"] == "waiting_user" and task["stage"] == "computer_human",
        )
        await browser.commands.cancel(owner, task["id"])
        await lifecycle.stop_task(owner, task["id"])
    finally:
        browser.policy.get_runtime = original
        await harness.close_pool()


if __name__ == "__main__":
    harness.scenarios = scenarios
    if len(sys.argv) == 1:
        sys.argv.extend(["--output", ".dev/browser-runtime-contracts.json"])
    harness.main()
