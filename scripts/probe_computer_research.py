"""Paid real-web research probe; no injected HTML, disposable owner and resources."""

import json
import sys
from unittest.mock import patch
from uuid import uuid4

import inspect_computer as browser
import inspect_files as harness
from ngertiin.computer import policy
from ngertiin.computer.e2b import E2BComputer
from ngertiin.config import get_settings
from ngertiin.tasks import creation


async def scenarios():
    settings = get_settings()
    settings.computer_workflow_version = 2
    settings.computer_engine = "jev"
    runtime = E2BComputer()
    try:
        with patch.object(policy, "get_runtime", lambda *_: runtime):
            owner, thread = await harness.owner()
            task = await creation.create(
                owner,
                thread,
                uuid4(),
                "Riset tren AI agent menuju 2027. Baca minimal tiga artikel sumber asli "
                "yang berbeda, lalu tulis laporan Markdown singkat dalam bahasa Indonesia "
                "dengan URL sumber dan bedakan fakta dari proyeksi. "
                "Jangan gunakan ringkasan Google sebagai bukti artikel. Tidak perlu login.",
                False,
                runtime_kind="browser",
            )
            for _ in range(15):
                task = await browser.run(owner, task)
                print(
                    json.dumps({k: task.get(k) for k in ("status", "stage", "error")}),
                    flush=True,
                )
                if task["status"] != "queued":
                    break
            async with browser.tasks.transaction() as conn:
                rows = await (
                    await conn.execute(
                        "SELECT url,title FROM computer_evidence WHERE task_id=%s ORDER BY created_at",
                        (task["id"],),
                    )
                ).fetchall()
                steps = await (
                    await conn.execute(
                        "SELECT kind,state,action,decision FROM computer_steps WHERE task_id=%s "
                        "AND kind<>'observe' ORDER BY created_at",
                        (task["id"],),
                    )
                ).fetchall()
                calls = await (
                    await conn.execute(
                        "SELECT role,count(*) AS n,sum(charged_units) AS units FROM task_cost_events "
                        "WHERE task_id=%s GROUP BY role",
                        (task["id"],),
                    )
                ).fetchall()
            harness.REPORT.append(
                {
                    "scenario": "real_web_trace",
                    "passed": True,
                    "task": {k: task.get(k) for k in ("status", "stage", "error")},
                    "sources": rows,
                    "steps": steps,
                    "calls": calls,
                }
            )
            harness.check("real_research_verified", task["status"] == "succeeded")
            harness.check("three_original_urls", len({r["url"] for r in rows}) >= 3)
    finally:
        async with browser.tasks.transaction() as conn:
            rows = await (
                await conn.execute("SELECT * FROM browser_workspaces")
            ).fetchall()
        for row in rows:
            harness.check("live_resource_deleted", await runtime.delete(row))
        # Persist diagnostic evidence even if a completion assertion fails.
        from pathlib import Path

        Path(".dev/computer-v2/real-research-trace.json").write_text(
            json.dumps(harness.REPORT, default=str, ensure_ascii=False, indent=2)
        )
        await harness.close_pool()


if __name__ == "__main__":
    if "--live" not in sys.argv:
        raise SystemExit("Requires --live: paid E2B/model calls against real websites")
    sys.argv.remove("--live")
    harness.scenarios = scenarios
    if len(sys.argv) == 1:
        sys.argv.extend(["--output", ".dev/computer-v2/real-research.json"])
    harness.main()
