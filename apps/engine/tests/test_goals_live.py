"""Opt-in paid-provider evaluation of the spike dataset through real DM HTTP.

Run only with NMA_TEST_LIVE_ENV pointing at a credential file. Labels never enter
model inputs. Four spike sessions are native session replacements in one home DM,
following ADR-03; unrelated DMs must not inherit these private responsibilities.
"""

# ruff: noqa: F811
import json
import os
import sqlite3
import time
from pathlib import Path

import pytest
from test_direct_messages import dm, public_api, send, snapshot  # noqa: F401
from test_runtime import command, runtime  # noqa: F401

pytestmark = pytest.mark.skipif(
    not os.environ.get("NMA_TEST_LIVE_ENV"), reason="Live provider evaluation is opt-in"
)


def test_spike_dataset_through_live_dm(runtime, public_api):
    root, _, call, start, *_ = runtime
    request = public_api
    thread = dm(call, "capture-evaluation")
    dataset = json.loads(
        (
            Path(__file__).resolve().parents[3]
            / "scripts/spikes/goal_capture/dataset.json"
        ).read_text()
    )
    results, labels = [], {}
    session = None
    for case in dataset:
        if session and session != case["session"]:
            agent = call(command("agent.list", {"after": None, "limit": 100}))[
                "result"
            ]["items"][0]
            update = command(
                "agent.configure",
                {
                    "agent_id": agent["agent_id"],
                    "display_name": agent["display_name"],
                    "handle": agent["handle"],
                    "config": agent["config"],
                },
            )
            update["expected_revision"] = agent["revision"]
            assert "result" in call(update)
            start.current.kill()
            start.current.wait(timeout=10)
            start()
        session = case["session"]
        before = snapshot(call, thread)["goals"]
        body = send(thread, case["text"])
        with request("/commands", body) as response:
            receipt = json.load(response)
        run_id = receipt["run_id"]
        deadline = time.monotonic() + 180
        while time.monotonic() < deadline:
            run = call(command("runtime.read", {"run_id": run_id}))["result"]
            if run["status"] not in {"queued", "running"}:
                break
            time.sleep(0.2)
        after = snapshot(call, thread)["goals"]
        prior = {g["goal_id"]: g for g in before}
        # Progress/wait/evidence revisions are lifecycle work, not new capture or correction.
        # This dataset scores responsibility identity/content/stop semantics.
        changed = [
            g
            for g in after
            if g["goal_id"] not in prior
            or (g["title"], g["objective"])
            != (prior[g["goal_id"]]["title"], prior[g["goal_id"]]["objective"])
            or (g["status"] == "stopped" and prior[g["goal_id"]]["status"] != "stopped")
        ]
        ops = [
            "create"
            if g["goal_id"] not in prior
            else "stop"
            if g["status"] == "stopped"
            else "update"
            for g in changed
        ]
        if case.get("label") and len(changed) == 1:
            labels[case["label"]] = changed[0]["goal_id"]
        target = next(
            (g for g in after if g["goal_id"] == labels.get(case.get("target"))), None
        )
        checks = {
            "run_succeeded": run["status"] == "succeeded",
            "operations": sorted(ops) == sorted(case["ops"]),
            "count": len(after) == case["count"],
            "target": not case.get("target")
            or len(changed) == 1
            and changed[0]["goal_id"] == labels.get(case["target"]),
            "requirements": all(
                term in json.dumps(target).lower() for term in case.get("contains", [])
            ),
        }
        with sqlite3.connect(root / "state/state.db") as db:
            operations = db.execute(
                "SELECT operation_id,source_message_id,result FROM nma_goal_operations WHERE source_run_id=?",
                (run_id,),
            ).fetchall()
            native_session = db.execute(
                "SELECT b.native_session_id FROM nma_adapter_runs r JOIN nma_adapter_bindings b ON b.owner_id=r.owner_id AND b.binding_id=r.binding_id WHERE r.run_id=?",
                (run_id,),
            ).fetchone()[0]
        results.append(
            {
                "model": json.loads((root / "models.json").read_text())["test"][
                    "model"
                ],
                "native_session_id": native_session,
                "tool_receipts": [
                    {
                        "operation_id": op[0],
                        "source_message_id": op[1],
                        "result": json.loads(op[2]),
                    }
                    for op in operations
                ],
                "case": case["id"],
                "session": session,
                "checks": checks,
                "operations": ops,
                "before": before,
                "after": after,
                "receipt": receipt,
                "reply": run["text"],
            }
        )
        output = Path(
            os.environ.get("NMA_TEST_LIVE_OUTPUT", str(root / "live-goals.json"))
        )
        output.write_text(json.dumps(results, indent=2) + "\n")
        print(case["id"], checks, flush=True)
    assert all(all(r["checks"].values()) for r in results), results
