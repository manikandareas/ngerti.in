"""Paid live Jev/E2B multi-tab regression on three explicitly synthetic sources."""

import json
import shlex
import sys
from unittest.mock import patch
from uuid import uuid4

import inspect_computer as browser
import inspect_files as harness
from ngertiin import e2b
from ngertiin.computer import maintenance, policy
from ngertiin.computer.e2b import E2BComputer, running
from ngertiin.config import get_settings
from ngertiin.tasks import creation
from ngertiin.usage import ledger

URLS = [
    "https://example.com/?ngfixture=1",
    "https://example.org/?ngfixture=2",
    "https://example.net/?ngfixture=3",
]
FACTS = [
    "Study A measured 12 deployments in 2026.",
    "Study B measured 18 deployments in 2026.",
    "Study C measured 24 deployments in 2026.",
]


class Computer(E2BComputer):
    async def inject(self, workspace, index):
        html = f"<html><body><h1>Research source {index + 1} of 3</h1><article><h2>Study {chr(65 + index)}</h2><p>{FACTS[index]}</p><p>This is a synthetic controlled acceptance fixture, not a real study.</p></article>"
        if index < 2:
            html += f'<a href="{URLS[index + 1]}" target="_blank">Read source {index + 2} of 3</a>'
        html += '<span id="ticker">Loading status</span></body></html>'
        script = (
            "import sys;sys.path.insert(0,'/tmp/ng036');from cdp import call;call('Runtime.evaluate',{'expression':"
            + repr(
                "document.documentElement.innerHTML="
                + json.dumps(html)
                + "; clearInterval(window.fixtureTicker); window.fixtureTicker=setInterval("
                + "()=>document.getElementById('ticker').textContent='Status '+Date.now(),250)"
            )
            + "})"
        )
        sandbox = await running(workspace)
        result = await e2b.run(sandbox, "python3 -c " + shlex.quote(script))
        if result.exit_code:
            raise ValueError("Synthetic source injection failed")

    async def start(self, workspace, seconds):
        ident = await super().start(workspace, seconds)
        active = {**workspace, "resource_id": ident}
        sandbox = await running(active)
        script = (
            "import sys,time;sys.path.insert(0,'/tmp/ng036');from cdp import call;call('Page.navigate',{'url':"
            + repr(URLS[0])
            + "});time.sleep(2)"
        )
        result = await e2b.run(sandbox, "python3 -c " + shlex.quote(script))
        if result.exit_code:
            raise ValueError("Fixture navigation failed")
        await self.inject(active, 0)
        return ident

    async def observe_dom(self, workspace):
        page = await super().observe_dom(workspace)
        if page["url"] in URLS:
            index = URLS.index(page["url"])
            if FACTS[index] not in page["text"]:
                await self.inject(workspace, index)
                page = await super().observe_dom(workspace)
        return page


async def scenarios():
    settings = get_settings()
    settings.computer_workflow_version = 2
    settings.computer_engine = "jev"
    runtime = Computer()
    try:
        with patch.object(policy, "get_runtime", lambda *_: runtime):
            owner, thread = await harness.owner()
            task = await creation.create(
                owner,
                thread,
                uuid4(),
                "Read ALL THREE synthetic research sources using their next-source links. "
                "Write a short Markdown report listing the deployment counts in Study A, B and C "
                "and cite the URL of each source. Clearly label the studies as synthetic. "
                "Do not finish until all three sources have been read.",
                False,
                runtime_kind="browser",
            )
            for _ in range(12):
                task = await browser.run(owner, task)
                print(
                    json.dumps(
                        {
                            "status": task["status"],
                            "stage": task["stage"],
                            "error": task["error"],
                        }
                    ),
                    flush=True,
                )
                if task["status"] in ("succeeded", "failed", "cancelled"):
                    break
                if task["status"] != "queued":
                    raise AssertionError("Unexpected pause " + task["stage"])
            async with browser.tasks.transaction() as conn:
                evidence = await (
                    await conn.execute(
                        "SELECT url FROM computer_evidence WHERE task_id=%s",
                        (task["id"],),
                    )
                ).fetchall()
                calls = await (
                    await conn.execute(
                        "SELECT role,model,state,charged_units FROM task_cost_events WHERE task_id=%s ORDER BY created_at",
                        (task["id"],),
                    )
                ).fetchall()
                candidates = await (
                    await conn.execute(
                        "SELECT state,verdict FROM computer_candidates WHERE task_id=%s",
                        (task["id"],),
                    )
                ).fetchall()
            harness.REPORT.append(
                {
                    "scenario": "live_trace",
                    "passed": True,
                    "evidence_urls": [r["url"] for r in evidence],
                    "calls": calls,
                    "candidates": candidates,
                    "result": task["result"],
                }
            )
            harness.check(
                "live_three_dynamic_causal_tabs_read",
                {r["url"] for r in evidence} == set(URLS),
            )
            harness.check(
                "live_jev_decision_ledger",
                any(
                    r["role"] == "browser_decision" and r["model"].startswith("jev-")
                    for r in calls
                ),
            )
            harness.check("live_report_verified", task["status"] == "succeeded")
            async with browser.tasks.transaction() as conn:
                await conn.execute(
                    "UPDATE background_tasks SET status='waiting_user',stage='computer_upgrade_required' "
                    "WHERE id=%s",
                    (task["id"],),
                )
                await ledger.reopen(conn, owner, f"task:{task['id']}")
            upgraded = await maintenance.upgrade(owner, task["id"])
            harness.check(
                "live_retained_upgrade_cold_resume",
                upgraded
                == {
                    "upgraded": True,
                    "stopped": True,
                },
            )

    finally:
        async with browser.tasks.transaction() as conn:
            rows = await (
                await conn.execute("SELECT * FROM browser_workspaces")
            ).fetchall()
        for row in rows:
            harness.check("live_resource_deleted", await runtime.delete(row))
        await harness.close_pool()


if __name__ == "__main__":
    if "--live" not in sys.argv:
        raise SystemExit(
            "Requires --live: paid model/E2B calls; all sources are synthetic"
        )
    sys.argv.remove("--live")
    harness.scenarios = scenarios
    if len(sys.argv) == 1:
        sys.argv.extend(["--output", ".dev/computer-v2/live.json"])
    harness.main()
