"""Native controls, nested cancellation and owner-local provider overrides."""

# ruff: noqa: F811
import json
import sqlite3
import threading
import time

import pytest
from test_connections import connect, providers  # noqa: F401
from test_delegation import setup, tool
from test_direct_messages import send, snapshot
from test_runtime import command, runtime, settle  # noqa: F401


@pytest.mark.parametrize("revoke", [False, True])
def test_nested_children_cancel_or_revoke_before_late_results(runtime, revoke):
    root, provider, call, start, *_ = runtime
    config = json.loads((root / "state/config.yaml").read_text())
    config["delegation"] = {"max_spawn_depth": 2}
    (root / "state/config.yaml").write_text(json.dumps(config))
    start.current.kill()
    start.current.wait(timeout=10)
    start()
    agent, thread = setup(root, call)
    blocked, release = threading.Event(), threading.Event()

    def script(body, text):
        messages = body.get("messages", [])
        if not messages:
            return None
        prompt = next(m["content"] for m in reversed(messages) if m["role"] == "user")
        child = "focused subagent" in json.dumps(
            [m for m in messages if m["role"] == "system"]
        )
        if child and "GRANDCHILD_CALCULATION" in prompt:
            blocked.set()
            release.wait(20)
            return {"role": "assistant", "content": "FORBIDDEN_NESTED_LATE_RESULT"}
        if any(m["role"] == "tool" for m in messages):
            return {"role": "assistant", "content": "The delegated work is running."}
        return tool(
            "delegate_task",
            {
                "goal": "GRANDCHILD_CALCULATION"
                if child
                else "Delegate one independent calculation to a nested assistant"
            },
        )

    provider.goal_script = script
    receipt = call(send(thread, "Use a nested temporary assistant"))["result"]
    try:
        assert blocked.wait(15)
        children = snapshot(call, thread)["delegations"]
        assert (
            len(children) == 2
            and sum(c["parent_child_id"] is not None for c in children) == 1
        ), children
        if revoke:
            edit = command(
                "agent.configure",
                {
                    "agent_id": agent["agent_id"],
                    "display_name": agent["display_name"],
                    "handle": agent["handle"],
                    "config": {**agent["config"], "tool_grants": []},
                },
            )
            edit["expected_revision"] = agent["revision"]
            assert "result" in call(edit)
        else:
            assert "result" in call(
                command("run.cancel", {"run_id": receipt["run_id"]})
            )
        release.set()
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline:
            snap = snapshot(call, thread)
            if all(c["status"] == "cancelled" for c in snap["delegations"]):
                break
            time.sleep(0.1)
        assert all(
            c["status"] == "cancelled" and c["result"] is None
            for c in snap["delegations"]
        ), snap
        assert not any(
            "FORBIDDEN_NESTED_LATE_RESULT" in m["content"] for m in snap["messages"]
        )
    finally:
        release.set()


def test_native_list_steer_stop_fences_child(runtime):
    root, provider, call, *_ = runtime
    _agent, thread = setup(root, call)
    blocked, release = threading.Event(), threading.Event()
    actions = []

    def script(body, text):
        messages = body.get("messages", [])
        if not messages:
            return None
        if "focused subagent" in json.dumps(
            [m for m in messages if m["role"] == "system"]
        ):
            blocked.set()
            release.wait(20)
            return {"role": "assistant", "content": "STOPPED_CHILD_MUST_NOT_PUBLISH"}
        recent = next(
            (
                json.loads(m["content"])
                for m in reversed(messages)
                if m["role"] == "tool"
            ),
            None,
        )
        if recent is None:
            return tool(
                "delegate_task", {"goal": "Wait for the native parent control test"}
            )
        action = recent.get("action")
        if action is None and recent.get("status") == "dispatched":
            assert blocked.wait(10)
            return tool("delegate_task", {"action": "list"})
        if action == "list":
            actions.append("list")
            assert recent["count"] == 1, recent
            return tool(
                "delegate_task",
                {
                    "action": "steer",
                    "subagent_id": recent["subagents"][0]["subagent_id"],
                    "message": "Preserve the calculation context",
                },
            )
        if action == "steer":
            actions.append("steer")
            return tool(
                "delegate_task",
                {"action": "stop", "subagent_id": recent["subagent_id"]},
            )
        if action == "stop":
            actions.append("stop")
            release.set()
        return {"role": "assistant", "content": "Native child controls acknowledged."}

    provider.goal_script = script
    try:
        receipt = call(
            send(thread, "Start, inspect, steer, then stop a temporary assistant")
        )["result"]
        settle(call, receipt["run_id"])
        assert actions == ["list", "steer", "stop"]
        snap = snapshot(call, thread)
        assert snap["delegations"][0]["status"] == "cancelled", snap
        assert snap["delegations"][0]["result"] is None
    finally:
        release.set()


def test_child_selects_distinct_owner_connection_and_attributed_usage(
    runtime, providers
):
    root, provider, call, *_ = runtime
    _agent, thread = setup(root, call)
    connection, _ = connect(call, providers[0], "Child specialist connection")
    providers[0].goal_script = lambda body, text: {
        "role": "assistant",
        "content": '{"answer":42}',
    }

    def script(body, text):
        messages = body.get("messages", [])
        if not messages:
            return None
        if any(m["role"] == "tool" for m in messages):
            return {
                "role": "assistant",
                "content": "The specialist result was requested.",
            }
        return tool(
            "delegate_task",
            {
                "tasks": [
                    {
                        "goal": "Calculate the specialist answer",
                        "model_ref": connection + ":test-model",
                        "allowed_toolsets": [],
                    }
                ]
            },
        )

    provider.goal_script = script
    receipt = call(send(thread, "Use the connected specialist model"))["result"]
    settle(call, receipt["run_id"])
    deadline = time.monotonic() + 15
    while time.monotonic() < deadline:
        snap = snapshot(call, thread)
        if snap["delegations"] and snap["delegations"][0]["status"] == "completed":
            break
        time.sleep(0.1)
    child = snap["delegations"][0]
    assert child["status"] == "completed", snap
    assert providers[0].requests and set(providers[0].auth) == {
        "Bearer " + providers[0].key
    }
    with sqlite3.connect(root / "state/state.db") as db:
        events = [
            json.loads(r[0])
            for r in db.execute(
                "SELECT payload FROM nma_events WHERE json_extract(payload,'$.type')='provider.attempt'"
            )
        ]
    attributed = [
        e["payload"]
        for e in events
        if e["payload"].get("child_session_id") == child["child_session_id"]
    ]
    assert len(attributed) == 1 and attributed[0]["connection_id"] == connection, (
        attributed
    )
    assert attributed[0]["usage"]["total_tokens"] == 15
