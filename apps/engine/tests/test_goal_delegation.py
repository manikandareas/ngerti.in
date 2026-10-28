"""Goal generations fence settled parents' children and own one result continuation."""

# ruff: noqa: F811
import json
import sqlite3
import time

import pytest
from test_delegation import setup, tool
from test_direct_messages import send, snapshot
from test_goal_lifecycle import begin, eventually, stored_goal
from test_runtime import command, runtime, settle  # noqa: F401


@pytest.mark.parametrize("control", [None, "pause", "stop"])
def test_goal_delegation_continuation_and_stopped_parent_lineage(runtime, control):
    root, provider, call, start, *_ = runtime
    _, thread = setup(root, call)
    goal = begin(call, thread)
    provider.blocked.clear()
    provider.release.clear()

    def script(body, text):
        messages = body["messages"]
        if "focused subagent" in json.dumps(
            [m for m in messages if m["role"] == "system"]
        ):
            provider.blocked.set()
            provider.release.wait(30)
            return {"role": "assistant", "content": "CHILD_VERIFIED_43"}
        last_user = max(i for i, m in enumerate(messages) if m["role"] == "user")
        current = messages[last_user + 1 :]
        calls = [t for m in current for t in m.get("tool_calls", [])]
        active = stored_goal(body, goal["goal_id"])
        if "Your native temporary subagents have settled" in text:
            if calls:
                return {"role": "assistant", "content": "RESULT_FROM_CHILD_43"}
            return tool(
                "responsibility",
                {
                    "action": "wait",
                    "goal_id": goal["goal_id"],
                    "expected_revision": active["revision"],
                    "summary": "Reviewed the actual child result: 43",
                    "wake_condition": "The user provides another dataset",
                },
            )
        if not calls:
            return tool(
                "responsibility",
                {
                    "action": "continue",
                    "goal_id": goal["goal_id"],
                    "expected_revision": active["revision"],
                    "summary": "Delegate the concrete arithmetic step and review the returned result",
                },
            )
        if calls[-1]["function"]["name"] == "responsibility":
            return tool(
                "delegate_task", {"goal": "Compute 17+26 and return CHILD_VERIFIED_43"}
            )
        return {
            "role": "assistant",
            "content": "The child is working; its actual result will be reviewed when it returns.",
        }

    provider.goal_script = script
    parent = call(
        send(thread, "Delegate this goal arithmetic step to a temporary child.")
    )["result"]["run_id"]
    assert provider.blocked.wait(10)
    settle(call, parent)
    before = snapshot(call, thread)
    assert (
        len(before["delegations"]) == 1
        and before["delegations"][0]["status"] == "running"
    )
    # A generic continuation must not poll while the native child owns the next wake.
    count = len(provider.requests)
    time.sleep(0.8)
    assert len(provider.requests) == count
    try:
        if control:
            call(command("goal." + control, {"goal_id": goal["goal_id"]}))
            fenced = eventually(
                lambda: snapshot(call, thread),
                lambda s: s["delegations"][0]["status"] == "cancelled",
            )
            assert fenced["goals"][0]["status"] == (
                "paused" if control == "pause" else "stopped"
            )
            provider.release.set()
            time.sleep(0.5)
            final = snapshot(call, thread)
            assert not any(
                "RESULT_FROM_CHILD_43" in m["content"]
                or "CHILD_VERIFIED_43" in m["content"]
                for m in final["messages"]
            )
            assert (
                next(r for r in final["runs"] if r["run_id"] == parent)["status"]
                == "succeeded"
            )
            with sqlite3.connect(root / "state/state.db") as db:
                batch = db.execute(
                    "SELECT state,resume_run_id FROM nma_delegation_batches WHERE parent_run_id=?",
                    (parent,),
                ).fetchone()
                assert batch == ("cancelled", None), batch
        else:
            provider.release.set()
            final = eventually(
                lambda: snapshot(call, thread),
                lambda s: (
                    any("RESULT_FROM_CHILD_43" in m["content"] for m in s["messages"])
                    and all(u["settled"] for u in s["goals"][0]["units"])
                ),
                timeout=30,
            )
            children = [
                u for u in final["goals"][0]["units"] if u["parent_run_id"] == parent
            ]
            assert len(children) == 1, final
            assert final["goals"][0]["status"] == "waiting"
        count = len(provider.requests)
        start.current.kill()
        start.current.wait(timeout=10)
        start()
        restored = snapshot(call, thread)
        assert restored["goals"] == final["goals"]
        assert restored["delegations"] == final["delegations"]
        assert len(provider.requests) == count
    finally:
        provider.release.set()
        provider.goal_script = None
