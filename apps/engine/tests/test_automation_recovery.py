"""Scheduled route fidelity and presentation across durable recovery boundaries."""

# ruff: noqa: F811
import json
import os
import sqlite3
import threading
import time

import pytest
from ngertiin_engine.native_executor import IsolatedTools
from ngertiin_engine.wakes import utc
from test_capabilities import capability_agent
from test_connections import connect, providers  # noqa: F401
from test_direct_messages import snapshot
from test_goal_lifecycle import begin, eventually, stored_goal, tool
from test_goals import act
from test_runtime import OWNER, command, runtime  # noqa: F401
from test_workspace_delivery import catalog


@pytest.mark.parametrize("mode", ["continue", "restart", "revoke", "process"])
def test_job_selection_survives_linked_work(runtime, providers, mode):
    root, primary, call, start, *_ = runtime
    selected = providers[0]
    connection, _ = connect(call, selected, "Scheduled route " + mode)
    (root / "capabilities.json").write_text(
        json.dumps(
            {
                "skill_refs": {
                    "daily": {"enabled": True, "content": "JOB_SELECTED_SKILL_MARKER"}
                }
            }
        )
    )
    agent = capability_agent(call, "job-recovery-" + mode, skill_refs=["daily"])
    thread = call(
        command(
            "thread.create",
            {"kind": "dm", "title": "Job recovery", "agent_ids": [agent["agent_id"]]},
        )
    )["result"]["thread"]
    goal = begin(call, thread)
    ready, release = threading.Event(), threading.Event()
    handle = "process-route-" + mode

    def respond(body, text):
        if "This is an internal continuation" not in text:
            return None
        active = stored_goal(body, goal["goal_id"])
        linked = [u for u in active["units"] if u["parent_run_id"]]
        if body["messages"][-1]["role"] == "tool":
            if mode == "revoke" and len(linked) == 1:
                ready.set()
                release.wait(30)
            return {"role": "assistant", "content": "Persisted scheduled result"}
        if mode == "process" and len(linked) == 1:
            with sqlite3.connect(root / "state/state.db") as db:
                admission = db.execute(
                    "SELECT native_admission_id FROM nma_adapter_runs WHERE run_id=?",
                    (linked[-1]["run_id"],),
                ).fetchone()[0]
                db.execute(
                    "INSERT INTO nma_native_job_events VALUES (?,?,?,?,?)",
                    (
                        OWNER,
                        "route-fixture",
                        handle,
                        "running",
                        json.dumps(
                            {
                                "native_admission_id": admission,
                                "state": "running",
                                "handle": handle,
                            }
                        ),
                    ),
                )
            return tool(
                {
                    "action": "park_on_process",
                    "goal_id": goal["goal_id"],
                    "expected_revision": active["revision"],
                    "process_handle": handle,
                }
            )
        action = "continue" if len(linked) == 1 else "wait"
        return tool(
            {
                "action": action,
                "goal_id": goal["goal_id"],
                "expected_revision": active["revision"],
                "summary": "Scheduled step verified",
                **({"wake_condition": "Next user request"} if action == "wait" else {}),
            }
        )

    selected.goal_script = respond
    # If a regression uses the primary provider, settle without an infinite loop.
    primary.goal_script = respond
    act(
        call,
        thread,
        action="schedule",
        goal_id=goal["goal_id"],
        expected_revision=goal["revision"],
        wake={
            "kind": "once",
            "timezone": "UTC",
            "missed_policy": "coalesce",
            "at": utc(time.time() + 5),
            "job": {
                "mode": "model",
                "model": connection + ":test-model",
                "skills": ["daily"],
                "context": "JOB_CONTEXT_MARKER",
            },
        },
    )
    before = len(primary.requests)
    try:
        if mode == "restart":
            (root / "fault-fired").unlink(missing_ok=True)
            start.current.kill()
            start.current.wait(timeout=10)
            start("after_job_continuation_commit")
            eventually(
                lambda: start.current.poll(), lambda v: v is not None, timeout=40
            )
            assert (root / "fault-fired").read_text() == "after_job_continuation_commit"
            start()
        elif mode == "revoke":
            assert ready.wait(30)
            reply = call(
                command("connection.disconnect", {"connection_id": connection})
            )
            assert reply["result"]["status"] == "disconnected"
            release.set()
        elif mode == "process":
            eventually(
                lambda: snapshot(call, thread)["goals"][0],
                lambda g: (
                    g["status"] == "waiting"
                    and len(g["units"]) == 3
                    and all(u["settled"] for u in g["units"])
                ),
                timeout=40,
            )
            start.current.kill()
            start.current.wait(timeout=10)
            with sqlite3.connect(root / "state/state.db") as db:
                db.execute(
                    "INSERT INTO nma_native_job_events VALUES (?,?,?,?,?)",
                    (
                        OWNER,
                        "route-fixture",
                        handle,
                        "completed",
                        json.dumps(
                            {"state": "completed", "handle": handle, "exit_code": 0}
                        ),
                    ),
                )
            start()
        final = eventually(
            lambda: snapshot(call, thread)["goals"][0],
            lambda g: (
                g["status"] == "blocked"
                if mode == "revoke"
                else g["status"] == "waiting"
                and len(g["units"]) == 4
                and all(u["settled"] for u in g["units"])
            ),
            timeout=40,
        )
        assert len(primary.requests) == before
        assert selected.requests and all(
            r["model"] == "test-model" for r in selected.requests
        )
        if mode == "revoke":
            assert len([u for u in final["units"] if u["parent_run_id"]]) == 1
        else:
            with sqlite3.connect(root / "state/state.db") as db:
                configs = [
                    json.loads(r[0])
                    for r in db.execute(
                        "SELECT b.config FROM nma_goal_units u JOIN nma_adapter_runs r USING(owner_id,run_id) JOIN nma_adapter_bindings b USING(owner_id,binding_id) WHERE u.goal_id=? AND u.parent_run_id IS NOT NULL",
                        (goal["goal_id"],),
                    )
                ]
            assert len(configs) == 2
            assert all(
                c["automation"]["model"] == connection + ":test-model" for c in configs
            )
            assert all(c["automation"]["skills"] == ["daily"] for c in configs)
            for request in selected.requests:
                assert "JOB_SELECTED_SKILL_MARKER" in json.dumps(request["messages"])
                assert "JOB_CONTEXT_MARKER" in json.dumps(request["messages"])
            assert configs[0]["automation"] == configs[1]["automation"]
        agents = call(command("agent.list", {"after": None, "limit": 100}))["result"][
            "items"
        ]
        assert (
            next(a for a in agents if a["agent_id"] == agent["agent_id"])["config"][
                "model"
            ]
            == "test"
        )
    finally:
        release.set()
        primary.goal_script = None
        selected.goal_script = None


@pytest.mark.skipif(
    not os.environ.get("NMA_TEST_NATIVE_IMAGE"), reason="Requires native Linux image"
)
@pytest.mark.parametrize("silent", [True, False])
def test_final_script_step_controls_delivery_after_checkpoint_restart(runtime, silent):
    root, provider, call, start, *_ = runtime
    image = os.environ["NMA_TEST_NATIVE_IMAGE"]
    (root / "capabilities.json").write_text(json.dumps(catalog(image)))
    agent = capability_agent(
        call, "checkpoint-" + str(silent).lower(), tool_grants=["terminal"]
    )
    thread = call(
        command(
            "thread.create",
            {
                "kind": "dm",
                "title": "Checkpoint delivery",
                "agent_ids": [agent["agent_id"]],
            },
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
            "at": utc(time.time() + 5),
            "timezone": "UTC",
            "missed_policy": "coalesce",
            "job": {
                "mode": "script",
                "steps": [
                    {
                        "id": "z_first",
                        "command": "printf X >> effect-count; printf '"
                        + ("visible_intermediate" if silent else "[SILENT]")
                        + "'",
                        "depends_on": [],
                    },
                    {
                        "id": "a_final",
                        "command": "printf '"
                        + ("[SILENT]" if silent else "FINAL_RESULT")
                        + "'",
                        "depends_on": ["z_first"],
                    },
                ],
            },
        },
    )

    def unread():
        return int(
            next(
                t
                for t in call(command("conversation.list", {"after": None}))["result"][
                    "items"
                ]
                if t["thread_id"] == thread["thread_id"]
            )["unread_count"]
        )

    before, count = unread(), len(provider.requests)
    try:
        (root / "fault-fired").unlink(missing_ok=True)
        start.current.kill()
        start.current.wait(timeout=10)
        start("after_automation_outputs")
        eventually(lambda: start.current.poll(), lambda v: v is not None, timeout=60)
        assert (root / "fault-fired").read_text() == "after_automation_outputs"
        start()

        def read():
            with sqlite3.connect(root / "state/state.db") as db:
                return db.execute(
                    "SELECT j.state,j.run_id,j.outputs FROM nma_automation_jobs j JOIN nma_triggers t USING(owner_id,trigger_id) JOIN nma_trigger_definitions d USING(owner_id,definition_id) WHERE d.goal_id=?",
                    (goal["goal_id"],),
                ).fetchone()

        row = eventually(read, lambda r: r and r[0] == "completed", timeout=45)
        messages = [
            m for m in snapshot(call, thread)["messages"] if m["run_id"] == row[1]
        ]
        assert len(messages) == (0 if silent else 1)
        assert unread() == before + (0 if silent else 1)
        assert len(provider.requests) == count
        assert json.loads(row[2])["a_final"]["output"].strip() == (
            "[SILENT]" if silent else "FINAL_RESULT"
        )
        start.current.kill()
        start.current.wait(timeout=10)
        start()
        assert read() == row
        assert [
            m for m in snapshot(call, thread)["messages"] if m["run_id"] == row[1]
        ] == messages
        assert unread() == before + (0 if silent else 1)
        from ngertiin_engine.native_executor import Scope

        effects = []
        for control in (root / "state/native-execution").glob("*"):
            if (control / "isolated-tools.db").exists():
                broker = IsolatedTools(control, OWNER, image=image)
                with broker._db() as db:
                    scopes = [
                        Scope(**json.loads(r[0]))
                        for r in db.execute("SELECT scope_json FROM scopes")
                    ]
                for scope in scopes:
                    if scope.agent_id == agent["agent_id"]:
                        effects.append(broker.file_bytes(scope, "project/effect-count"))
        assert effects == [b"X"]
    finally:
        for control in (root / "state/native-execution").glob("*"):
            if (control / "isolated-tools.db").exists():
                IsolatedTools(control, OWNER, image=image).cleanup()
