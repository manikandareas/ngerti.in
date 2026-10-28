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


@pytest.mark.skipif(
    not os.environ.get("NMA_TEST_NATIVE_IMAGE"), reason="Requires native Linux image"
)
@pytest.mark.parametrize("fault", [None, "after_automation_effect"])
def test_script_only_dependencies_offline_restart_and_zero_model_usage(runtime, fault):
    root, provider, call, start, *_ = runtime
    image = os.environ["NMA_TEST_NATIVE_IMAGE"]
    (root / "capabilities.json").write_text(json.dumps(catalog(image)))
    agent = capability_agent(
        call, "script-worker-" + (fault or "plain"), tool_grants=["terminal"]
    )
    thread = call(
        command(
            "thread.create",
            {
                "kind": "dm",
                "title": "Script automation",
                "agent_ids": [agent["agent_id"]],
            },
        )
    )["result"]["thread"]
    goal = begin(call, thread)
    steps = [
        {
            "id": "first",
            "command": "printf X >> effect-count; printf '41'",
            "depends_on": [],
        },
        {
            "id": "next",
            "command": """python -c 'import json,os; d=json.loads(os.environ["NMA_DEPENDENCY_RESULTS"]); print(int(d["first"]["output"])+1)' """,
            "depends_on": ["first"],
        },
    ]
    act(
        call,
        thread,
        action="schedule",
        goal_id=goal["goal_id"],
        expected_revision=goal["revision"],
        wake={
            "kind": "once",
            "at": utc(time.time() + 3),
            "timezone": "UTC",
            "missed_policy": "coalesce",
            "job": {"mode": "script", "steps": steps},
        },
    )
    before = len(provider.requests)
    start.current.kill()
    start.current.wait(timeout=10)
    time.sleep(3)
    start(fault)
    if fault:
        eventually(
            lambda: start.current.poll(), lambda code: code is not None, timeout=60
        )
        start()

    def read():
        with sqlite3.connect(root / "state/state.db") as db:
            return db.execute(
                "SELECT j.state,j.outputs,j.run_id FROM nma_automation_jobs j JOIN nma_triggers t USING(owner_id,trigger_id) JOIN nma_trigger_definitions d USING(owner_id,definition_id) WHERE d.goal_id=?",
                (goal["goal_id"],),
            ).fetchall()

    try:
        rows = eventually(
            read, lambda rows: rows and rows[0][0] != "running", timeout=60
        )
        assert rows[0][0] == "completed", rows
        outputs = json.loads(rows[0][1])
        assert outputs["next"]["output"].strip() == "42", outputs
        assert len(provider.requests) == before
        diagnostic = call(command("run.diagnostics", {"run_id": rows[0][2]}))["result"]
        assert diagnostic["usage"] == {
            "available": True,
            "source": "script_only_execution",
            "inference_calls": 0,
        }
        assert diagnostic["automation"]["inference_calls"] == 0
        assert len(diagnostic["automation"]["step_operation_ids"]) == 2
        for control in (root / "state/native-execution").glob("*"):
            if (control / "isolated-tools.db").exists():
                broker = IsolatedTools(control, OWNER, image=image)
                with broker._db() as db:
                    from ngertiin_engine.native_executor import Scope

                    scopes = [
                        Scope(**json.loads(r[0]))
                        for r in db.execute("SELECT scope_json FROM scopes")
                    ]
                selected = next(
                    (s for s in scopes if s.agent_id == agent["agent_id"]), None
                )
                if selected:
                    assert broker.file_bytes(selected, "project/effect-count") == b"X"
        messages = snapshot(call, thread)["messages"]
        assert sum(m["run_id"] == rows[0][2] for m in messages) == 1
        start.current.kill()
        start.current.wait(timeout=10)
        start()
        assert read() == rows
        assert len(provider.requests) == before
        with sqlite3.connect(root / "state/state.db") as db:
            assert db.execute("PRAGMA foreign_key_check").fetchall() == []
            assert (
                db.execute(
                    "SELECT count(*) FROM nma_automation_jobs WHERE run_id=?",
                    (rows[0][2],),
                ).fetchone()[0]
                == 1
            )
    finally:
        for control in (root / "state/native-execution").glob("*"):
            if (control / "isolated-tools.db").exists():
                IsolatedTools(control, OWNER, image=image).cleanup()


@pytest.mark.skipif(
    not os.environ.get("NMA_TEST_NATIVE_IMAGE"), reason="Requires native Linux image"
)
@pytest.mark.parametrize("stop", [False, True, "replace"])
def test_failed_or_stopped_script_cannot_publish_or_run_dependents(runtime, stop):
    root, _provider, call, start, *_ = runtime
    image = os.environ["NMA_TEST_NATIVE_IMAGE"]
    (root / "capabilities.json").write_text(json.dumps(catalog(image)))
    agent = capability_agent(
        call, "script-fence-" + str(stop).lower(), tool_grants=["terminal"]
    )
    thread = call(
        command(
            "thread.create",
            {"kind": "dm", "title": "Script fence", "agent_ids": [agent["agent_id"]]},
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
            "at": utc(time.time() + 2),
            "timezone": "UTC",
            "missed_policy": "coalesce",
            "job": {
                "mode": "script",
                "steps": [
                    {
                        "id": "first",
                        "command": "sleep 15; printf LATE" if stop else "exit 7",
                        "depends_on": [],
                    },
                    {
                        "id": "forbidden",
                        "command": "printf SHOULD_NOT_RUN",
                        "depends_on": ["first"],
                    },
                ],
            },
        },
    )

    def read():
        with sqlite3.connect(root / "state/state.db") as db:
            return db.execute(
                "SELECT j.state,j.outputs,j.run_id FROM nma_automation_jobs j JOIN nma_triggers t USING(owner_id,trigger_id) JOIN nma_trigger_definitions d USING(owner_id,definition_id) WHERE d.goal_id=?",
                (goal["goal_id"],),
            ).fetchall()

    try:
        rows = eventually(read, lambda rows: bool(rows), timeout=30)
        if stop == "replace":
            current = snapshot(call, thread)["goals"][0]
            act(
                call,
                thread,
                action="schedule",
                goal_id=goal["goal_id"],
                expected_revision=current["revision"],
                wake={
                    "kind": "once",
                    "at": utc(time.time() + 120),
                    "timezone": "UTC",
                    "missed_policy": "coalesce",
                },
            )
        elif stop:
            call(command("goal.stop", {"goal_id": goal["goal_id"]}))
        rows = eventually(
            read, lambda rows: rows and rows[0][0] != "running", timeout=40
        )
        assert rows[0][0] in ({"cancelled", "indeterminate"} if stop else {"failed"}), (
            rows
        )
        assert "forbidden" not in json.loads(rows[0][1])
        snap = snapshot(call, thread)
        assert not any(m["run_id"] == rows[0][2] for m in snap["messages"])
        assert snap["goals"][0]["status"] == (
            "waiting" if stop == "replace" else "stopped" if stop else "blocked"
        )
        if stop == "replace":
            assert snap["goals"][0]["wake"]["state"] == "enabled"
        start.current.kill()
        start.current.wait(timeout=10)
        start()
        assert read() == rows
    finally:
        for control in (root / "state/native-execution").glob("*"):
            if (control / "isolated-tools.db").exists():
                IsolatedTools(control, OWNER, image=image).cleanup()


@pytest.mark.skipif(
    not os.environ.get("NMA_TEST_NATIVE_IMAGE"), reason="Requires native Linux image"
)
def test_silent_script_does_not_increment_web_unread(runtime):
    root, provider, call, *_ = runtime
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
                    {"id": "quiet", "command": "printf '[SILENT]'", "depends_on": []}
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
