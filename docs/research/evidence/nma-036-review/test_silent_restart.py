"""Actual scoped script-only chains through durable Hermes gateway occurrences."""

# ruff: noqa: F811
import json
import os
import sqlite3
import time

import pytest
from ngertiin_engine.native_executor import IsolatedTools
from ngertiin_engine.wakes import utc
from test_capabilities import capability_agent
from test_direct_messages import snapshot
from test_goal_lifecycle import begin, eventually
from test_goals import act
from test_runtime import OWNER, command, runtime  # noqa: F401
from test_workspace_delivery import catalog


def test_silent_final_step_survives_output_checkpoint_restart(runtime, monkeypatch):
    root, provider, call, start, *_ = runtime
    image = os.environ["NMA_TEST_NATIVE_IMAGE"]
    (root / "capabilities.json").write_text(json.dumps(catalog(image)))
    agent = capability_agent(call, "silent-script", tool_grants=["terminal"])
    thread = call(
        command(
            "thread.create",
            {"kind": "dm", "title": "Silent script", "agent_ids": [agent["agent_id"]]},
        )
    )["result"]["thread"]
    goal = begin(call, thread)
    act(
        call,
        thread,
        action="schedule",
        goal_id=goal["goal_id"],
        expected_revision=goal["revision"],
        wake={
            "kind": "once",
            "at": utc(time.time() + 4),
            "timezone": "UTC",
            "missed_policy": "coalesce",
            "job": {
                "mode": "script",
                "steps": [
                    {"id": "z_first", "command": "printf visible_intermediate", "depends_on": []},
                    {"id": "a_final", "command": "printf '[SILENT]'", "depends_on": ["z_first"]}
                ],
            },
        },
    )

    def summary():
        return next(
            t
            for t in call(command("conversation.list", {"after": None}))["result"][
                "items"
            ]
            if t["thread_id"] == thread["thread_id"]
        )

    before = summary()["unread_count"]
    import subprocess
    from pathlib import Path
    original = subprocess.Popen
    launcher = str(Path(__file__).with_name("output_checkpoint_launcher.py").resolve())
    def popen(args, **kwargs):
        if kwargs.get("env", {}).get("NMA_TEST_FAULT") == "review_output_checkpoint":
            args = [args[0], launcher]
        return original(args, **kwargs)
    monkeypatch.setattr(subprocess, "Popen", popen)
    start.current.kill()
    start.current.wait(timeout=10)
    start("review_output_checkpoint")
    eventually(lambda: start.current.poll(), lambda v: v is not None, timeout=60)
    assert (root / "fault-fired").read_text() == "all_outputs_committed"
    start()
    count = len(provider.requests)

    def read():
        with sqlite3.connect(root / "state/state.db") as db:
            return db.execute(
                "SELECT j.state,j.run_id FROM nma_automation_jobs j JOIN nma_triggers t USING(owner_id,trigger_id) JOIN nma_trigger_definitions d USING(owner_id,definition_id) WHERE d.goal_id=?",
                (goal["goal_id"],),
            ).fetchone()

    try:
        row = eventually(read, lambda r: r and r[0] != "running", timeout=45)
        assert row[0] == "completed", row
        assert summary()["unread_count"] == before
        assert len(provider.requests) == count
        assert not any(
            m["run_id"] == row[1] for m in snapshot(call, thread)["messages"]
        )
    finally:
        for control in (root / "state/native-execution").glob("*"):
            if (control / "isolated-tools.db").exists():
                IsolatedTools(control, OWNER, image=image).cleanup()
