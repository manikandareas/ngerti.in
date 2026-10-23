"""Explicit paid E2B/Jev integration probe on disposable DB and synthetic form only."""

import json
import shlex
import sys
import time
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4

import inspect_computer as browser
import inspect_files as harness
from ngertiin import e2b
from ngertiin.computer import control, jev, permissions, policy
from ngertiin.computer.contracts import Action, DomTarget
from ngertiin.computer.e2b import E2BComputer, running
from ngertiin.config import get_settings
from ngertiin.sandbox.contracts import RuntimeFailure
from ngertiin.tasks import creation

FIXTURE = """<html><body><h1>Hotel search test</h1>
<form role="search" onsubmit="event.preventDefault();document.body.innerHTML='<h1>Results for '+document.querySelector('input').value+'</h1><p>Casa Flora, Lisbon. Free cancellation.</p>'">
<label>City <input id="city" type="search"></label><button>Search hotels</button></form>
<button onclick="window.__testSends=(window.__testSends||0)+1"><span>Send report</span></button>
</body></html>"""


class FixtureComputer(E2BComputer):
    def __init__(self):
        self.timings = []

    async def observe(self, workspace):
        screen = await super().observe(workspace)
        Path(".dev/jev-browser-last-screen.png").write_bytes(screen.png)
        return screen

    async def command(
        self,
        workspace,
        operation,
        action=None,
        *,
        expected_target="",
        dispatch_id=None,
        strict_target=True,
    ):
        started = time.monotonic()
        try:
            return await super().command(
                workspace,
                operation,
                action,
                expected_target=expected_target,
                dispatch_id=dispatch_id,
                strict_target=strict_target,
            )
        except Exception as error:
            print("probe_operation", operation, type(error).__name__, str(error))
            raise
        finally:
            self.timings.append(
                {
                    "operation": operation,
                    "elapsed_ms": round((time.monotonic() - started) * 1000),
                }
            )

    async def start(self, workspace, seconds):
        try:
            ident = await super().start(workspace, seconds)
        except Exception:
            value = await e2b.find(workspace["resource_name"])
            if value:
                sandbox = await e2b.attach(value)
                result = await e2b.run(
                    sandbox,
                    "tail -30 /tmp/ng036/probe-launch.log /tmp/ng036/probe-browser.log",
                )
                print("probe_start_diagnostic", result.stdout, flush=True)
            raise
        active = {**workspace, "resource_id": ident}
        sandbox = await running(active)
        # Fixed test code only. The page has no form action/network submission.
        script = (
            "import sys;sys.path.insert(0,'/tmp/ng036');from cdp import call;"
            "call('Page.navigate',{'url':'https://example.com'});import time;time.sleep(2);"
            "call('Runtime.evaluate',{'expression':"
            + repr("document.documentElement.innerHTML=" + json.dumps(FIXTURE))
            + "})"
        )
        value = await e2b.run(sandbox, "python3 -c " + shlex.quote(script))
        if value.exit_code:
            raise RuntimeError("Fixture setup failed")
        return ident


async def scenarios():
    started = time.monotonic()
    settings = get_settings()
    settings.computer_engine = "jev"
    settings.computer_workflow_version = 1
    settings.computer_model_calls = 24
    settings.e2b_computer_template = "ngertiin-desktop-v2"
    runtime = FixtureComputer()
    original_run = e2b.run

    async def diagnostic_run(*args, **kwargs):
        if len(args) > 1 and "desktop.py launch" in args[1]:
            args = (
                args[0],
                args[1].replace(">/dev/null 2>&1", ">/tmp/ng036/probe-launch.log 2>&1"),
            )
            args = (
                args[0],
                args[1].replace(
                    "nohup python3", "NGERTIIN_STARTUP_DIAGNOSTICS=1 nohup python3"
                ),
            )
        result = await original_run(*args, **kwargs)
        if result.exit_code:
            print(
                "probe_command_failure",
                result.exit_code,
                result.stderr[:2000],
                result.stdout[:500],
            )
        return result

    workspaces = []
    takeover_tested = False
    mutation_proposed = False
    approvals = []
    original_propose = jev.propose

    async def probe_propose(execution, page, history):
        nonlocal mutation_proposed
        if not takeover_tested:
            return Action(
                kind="ask_user", description="Probe kendali privat sebelum pencarian."
            )
        if not mutation_proposed:
            mutation_proposed = True
            async with browser.tasks.transaction() as conn:
                active = await browser.one(
                    conn,
                    "SELECT * FROM browser_workspaces WHERE active_task_id=%s",
                    (execution["id"],),
                )
            sandbox = await running(active)
            focus = (
                "import sys;sys.path.insert(0,'/tmp/ng036');from cdp import call;"
                "call('Runtime.evaluate',{'expression':\"document.querySelector('input').focus()\"})"
            )
            value = await e2b.run(sandbox, "python3 -c " + shlex.quote(focus))
            if value.exit_code:
                raise AssertionError("Fixture focus failed")
            query = Action(kind="type", description="Search", text="Lisbon")
            observed = await runtime.target(active, query)
            harness.check(
                "live_coordinate_search_target_auto",
                not permissions.requires_approval(query, observed),
            )
            selected = next(a for a in page["actions"] if a["label"] == "Send report")
            return Action(
                kind="click",
                description="Send report",
                dom=DomTarget(
                    target_id=page["target_id"],
                    document=page["document"],
                    node=selected["node"],
                    guard=selected["guard"],
                    operation="click",
                ),
            )
        return await original_propose(execution, page, history)

    try:
        with (
            patch.object(policy, "get_runtime", lambda *_: runtime),
            patch.object(e2b, "run", diagnostic_run),
            patch.object(jev, "propose", probe_propose),
        ):
            owner, thread = await harness.owner()
            task = await creation.create(
                owner,
                thread,
                uuid4(),
                "On the hotel search test page, enter Lisbon in City, click Search hotels, "
                "and report the matching hotel and cancellation policy. Save the report.",
                False,
                runtime_kind="browser",
            )
            for _ in range(12):
                task = await browser.run(owner, task)
                print(
                    "probe_task",
                    task["status"],
                    task["stage"],
                    task["error"],
                    flush=True,
                )
                workspace = task["computer"]["workspace"]
                if workspace:
                    workspaces.append(workspace)
                if task["status"] in ("succeeded", "failed", "cancelled"):
                    break
                proposal = task["computer"]["action"]
                if task["stage"] == "computer_human" and not takeover_tested:
                    async with browser.tasks.transaction() as conn:
                        old = await browser.one(
                            conn,
                            "SELECT * FROM browser_workspaces WHERE id=%s",
                            (workspace["id"],),
                        )
                    await control.change(
                        owner, task["id"], workspace["control_version"], "human"
                    )
                    try:
                        await runtime.observe_dom(old)
                    except RuntimeFailure:
                        harness.check(
                            "live_human_control_blocks_stale_dom_worker", True
                        )
                    else:
                        raise AssertionError("Stale worker observed during takeover")
                    current = await browser.tasks.detail(owner, task["id"])
                    await control.change(
                        owner,
                        task["id"],
                        current["computer"]["workspace"]["control_version"],
                        "agent",
                    )
                    takeover_tested = True
                    continue
                if task["stage"] == "computer_approval" and proposal:
                    approvals.append(proposal["action"])
                    if proposal["action"]["description"] != "Send report":
                        async with browser.tasks.transaction() as conn:
                            active = await browser.one(
                                conn,
                                "SELECT * FROM browser_workspaces WHERE id=%s",
                                (workspace["id"],),
                            )
                        proposed = Action.model_validate(proposal["action"])
                        observed = await runtime.target(active, proposed)
                        print(
                            "probe_unexpected_approval",
                            proposed.kind,
                            proposed.description,
                            observed.context,
                            flush=True,
                        )
                        raise AssertionError(
                            "Routine search unexpectedly required approval"
                        )
                    await control.decide(
                        owner,
                        task["id"],
                        proposal["id"],
                        workspace["control_version"],
                        True,
                    )
                elif task["status"] != "queued":
                    raise AssertionError("Unexpected pause: " + task["stage"])
            harness.check("live_jev_form_verified", task["status"] == "succeeded")
            harness.check(
                "live_search_auto_and_only_mutation_approved", len(approvals) == 1
            )
            async with browser.tasks.transaction() as conn:
                row = await browser.one(
                    conn,
                    "SELECT count(*) AS n FROM task_cost_events WHERE task_id=%s AND model LIKE 'jev-%%'",
                    (task["id"],),
                )
            harness.check("live_jev_metered", row["n"] > 0)
            async with browser.tasks.transaction() as conn:
                balance = await browser.one(
                    conn,
                    "SELECT vendor_cost FROM compute_balances WHERE resource_key=%s",
                    (f"task:{task['id']}",),
                )
                calls = await (
                    await conn.execute(
                        "SELECT model,state,charged_units,usage->'latency_ms' AS latency_ms "
                        "FROM task_cost_events WHERE task_id=%s ORDER BY created_at",
                        (task["id"],),
                    )
                ).fetchall()
            harness.REPORT.append(
                {
                    "scenario": "live_latency_and_cost_metrics",
                    "passed": True,
                    "metrics": {
                        "wall_seconds": round(time.monotonic() - started, 3),
                        "attempts": task["attempt"],
                        "model_calls": task["model_calls"],
                        "token_work": task["usage_units"],
                        "vendor_microusd_estimate": balance["vendor_cost"],
                        "invoice_confirmed": False,
                        "model_attempts": calls,
                        "actuator_calls": runtime.timings,
                    },
                }
            )
    finally:
        async with browser.tasks.transaction() as conn:
            rows = await (
                await conn.execute("SELECT * FROM browser_workspaces")
            ).fetchall()
        async with browser.tasks.transaction() as conn:
            trace = await (
                await conn.execute(
                    "SELECT kind,state,action FROM computer_steps WHERE kind<>'observe' ORDER BY created_at"
                )
            ).fetchall()
        Path(".dev/computer-v2/approval-steps.json").write_text(
            json.dumps(trace, default=str, ensure_ascii=False, indent=2)
        )
        for row in rows:
            harness.check("live_resource_deleted", await runtime.delete(row))
        await harness.close_pool()


async def model_scenarios():
    get_settings().computer_engine = "jev"
    owner, thread = await harness.owner()
    task = await browser.create(owner, thread)
    execution = await browser.tasks.claim(task["id"])
    execution["instruction"] = "Enter Lisbon in City."
    page = {
        "url": "https://example.com",
        "title": "Test",
        "text": "City",
        "target_id": "test",
        "document": "test",
        "actions": [
            {
                "id": "e1",
                "kind": "fill",
                "label": "City",
                "role": "textbox",
                "node": 1,
                "value": "",
                "guard": "a" * 64,
            }
        ],
    }
    try:
        action = await jev.propose(execution, page, [])
        harness.check(
            "typesafe_and_text_model_compatible",
            action is not None and action.kind == "type" and action.text == "Lisbon",
        )
    finally:
        await harness.close_pool()


if __name__ == "__main__":
    if "--live" not in sys.argv:
        raise SystemExit(
            "Requires --live: paid model/E2B calls on synthetic disposable resources"
        )
    sys.argv.remove("--live")
    harness.scenarios = model_scenarios if "--models-only" in sys.argv else scenarios
    if "--models-only" in sys.argv:
        sys.argv.remove("--models-only")
    if len(sys.argv) == 1:
        sys.argv.extend(["--output", ".dev/jev-live-contracts.json"])
    harness.main()
