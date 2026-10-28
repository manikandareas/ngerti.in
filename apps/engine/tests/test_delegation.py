"""Native child lifecycle through actual product admission and provider HTTP."""

# ruff: noqa: F811
import json
import sqlite3
import threading
import time
from uuid import uuid4

from test_capabilities import capability_agent
from test_direct_messages import send, snapshot
from test_learning import conversation
from test_runtime import command, runtime, settle  # noqa: F401


def tool(name, arguments):
    return {
        "role": "assistant",
        "content": None,
        "tool_calls": [
            {
                "id": str(uuid4()),
                "type": "function",
                "function": {"name": name, "arguments": json.dumps(arguments)},
            }
        ],
    }


def setup(root, call):
    (root / "capabilities.json").write_text(
        json.dumps(
            {
                "execution_surfaces": {
                    "children": {"kind": "scoped_delegation", "ready": True}
                },
                "tool_grants": {
                    "delegation": {
                        "enabled": True,
                        "toolset": "delegation",
                        "execution_surface": "children",
                    }
                },
            }
        )
    )
    agent = capability_agent(
        call, "coordinator-" + uuid4().hex[:8], tool_grants=["delegation"]
    )
    return agent, conversation(call, agent)


def test_native_parallel_children_results_and_restart(runtime):
    root, provider, call, start, *_ = runtime
    agent, thread = setup(root, call)
    seen = set()
    barrier = threading.Barrier(2)

    def script(body, text):
        messages = body.get("messages", [])
        systems = json.dumps([m for m in messages if m["role"] == "system"])
        if "focused subagent" in systems:
            seen.add(text)
            barrier.wait(timeout=10)
            return {"role": "assistant", "content": '{"answer":42}'}
        if any(m["role"] == "tool" for m in messages):
            return {"role": "assistant", "content": "Delegation results observed."}
        return tool(
            "delegate_task",
            {
                "tasks": [
                    {
                        "goal": "Calculate the first independent answer",
                        "output_schema": {
                            "type": "object",
                            "required": ["answer"],
                            "properties": {"answer": {"type": "integer"}},
                        },
                    },
                    {
                        "goal": "Calculate the second independent answer",
                        "model_ref": "test",
                        "allowed_toolsets": [],
                    },
                ]
            },
        )

    provider.goal_script = script
    receipt = call(send(thread, "Calculate using two temporary assistants"))
    assert "result" in receipt, receipt
    run = receipt["result"]["run_id"]
    settle(call, run)
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        snap = snapshot(call, thread)
        children = snap.get("delegations", [])
        if len(children) == 2 and all(c["status"] != "running" for c in children):
            break
        time.sleep(0.1)
    assert len(children) == 2, (snap, provider.requests)
    assert all(c["status"] == "completed" for c in children), children
    assert all(c["kind"] == "temporary_subagent" for c in children)
    assert len(seen) == 2, seen
    assert any(c["result"].get("schema_valid") is True for c in children), children
    assert [a["agent_id"] for a in snap["thread"]["agents"]] == [agent["agent_id"]]
    deadline = time.monotonic() + 15
    while time.monotonic() < deadline:
        with sqlite3.connect(root / "state/state.db") as db:
            batch = db.execute(
                "SELECT state,resume_run_id FROM nma_delegation_batches WHERE parent_run_id=?",
                (run,),
            ).fetchone()
        snap = snapshot(call, thread)
        if batch[0] == "admitted" and any(
            r["run_id"] == batch[1] and r["status"] == "succeeded" for r in snap["runs"]
        ):
            break
        time.sleep(0.1)
    assert batch[0] == "admitted", batch
    count = len(provider.requests)
    start.current.kill()
    start.current.wait(timeout=10)
    start()
    assert snapshot(call, thread)["delegations"] == children
    assert len(provider.requests) == count
    with sqlite3.connect(root / "state/state.db") as db:
        assert db.execute("PRAGMA foreign_key_check").fetchall() == []


def test_child_cancel_fences_late_results(runtime):
    root, provider, call, _start, *_ = runtime
    _agent, thread = setup(root, call)
    provider.release.clear()
    provider.blocked.clear()

    def script(body, text):
        messages = body.get("messages", [])
        if not messages:
            return None
        if "focused subagent" in json.dumps(
            [m for m in messages if m["role"] == "system"]
        ):
            provider.blocked.set()
            provider.release.wait(15)
            return {"role": "assistant", "content": "FORBIDDEN_LATE_CHILD_RESULT"}
        if any(m["role"] == "tool" for m in messages):
            return {"role": "assistant", "content": "Child delegation started."}
        return tool(
            "delegate_task", {"goal": "Wait for the independent child calculation"}
        )

    provider.goal_script = script
    receipt = call(send(thread, "Use a temporary child"))["result"]
    assert provider.blocked.wait(10)
    assert "result" in call(command("run.cancel", {"run_id": receipt["run_id"]}))
    provider.release.set()
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        snap = snapshot(call, thread)
        children = snap["delegations"]
        if children and children[0]["status"] != "running":
            break
        time.sleep(0.1)
    assert children and children[0]["status"] == "cancelled", snap
    assert children[0]["result"] is None
    time.sleep(0.5)
    assert not any(
        "FORBIDDEN_LATE_CHILD_RESULT" in m["content"]
        for m in snapshot(call, thread)["messages"]
    )
    with sqlite3.connect(root / "state/state.db") as db:
        attempts = [
            json.loads(row[0])["payload"]
            for row in db.execute(
                "SELECT payload FROM nma_events WHERE json_extract(payload,'$.type')='provider.attempt' AND json_extract(payload,'$.payload.child_session_id')=?",
                (children[0]["child_session_id"],),
            )
        ]
    assert len(attempts) == 1 and attempts[0]["late_receipt"] is True, attempts
    assert attempts[0]["usage"]["total_tokens"] == 15


def test_background_completion_resumes_parent_once_without_user_input(runtime):
    root, provider, call, start, *_ = runtime
    _agent, thread = setup(root, call)
    release = threading.Event()
    blocked = threading.Event()
    combined = []

    def script(body, text):
        messages = body.get("messages", [])
        if not messages:
            return None
        if "focused subagent" in json.dumps(
            [m for m in messages if m["role"] == "system"]
        ):
            blocked.set()
            release.wait(15)
            return {"role": "assistant", "content": '{"answer":42}'}
        prompt = next(m["content"] for m in reversed(messages) if m["role"] == "user")
        if "native temporary subagents have settled" in prompt:
            combined.append(prompt)
            return {"role": "assistant", "content": "COMBINED_RESULT_42"}
        if any(m["role"] == "tool" for m in messages):
            return {
                "role": "assistant",
                "content": "The temporary assistant is working.",
            }
        return tool(
            "delegate_task", {"goal": "Produce the independent calculation answer"}
        )

    provider.goal_script = script
    receipt = call(send(thread, "Calculate with a temporary assistant"))["result"]
    try:
        assert blocked.wait(10)
        settle(call, receipt["run_id"])
        assert snapshot(call, thread)["delegations"][0]["status"] == "running"
        release.set()
        deadline = time.monotonic() + 15
        while time.monotonic() < deadline:
            snap = snapshot(call, thread)
            if any(m["content"] == "COMBINED_RESULT_42" for m in snap["messages"]):
                break
            time.sleep(0.1)
        assert len(combined) == 1, snap
        assert (
            len([m for m in snap["messages"] if m["content"] == "COMBINED_RESULT_42"])
            == 1
        )
        assert len([m for m in snap["messages"] if m["author_kind"] == "user"]) == 1
        count = len(provider.requests)
        start.current.kill()
        start.current.wait(timeout=10)
        start()
        time.sleep(0.5)
        assert len(provider.requests) == count
        assert snapshot(call, thread)["messages"] == snap["messages"]
    finally:
        release.set()


def test_child_crash_recovery_never_restarts_unknown_work(runtime):
    root, provider, call, start, *_ = runtime
    _agent, thread = setup(root, call)
    provider.release.clear()
    provider.blocked.clear()

    def script(body, text):
        messages = body.get("messages", [])
        if not messages:
            return None
        if "focused subagent" in json.dumps(
            [m for m in messages if m["role"] == "system"]
        ):
            provider.blocked.set()
            provider.release.wait(15)
            return {"role": "assistant", "content": "Uncertain child result"}
        if any(m["role"] == "tool" for m in messages):
            return {"role": "assistant", "content": "Child running."}
        return tool(
            "delegate_task",
            {"goal": "Compute an independent result and preserve its receipt"},
        )

    provider.goal_script = script
    call(send(thread, "Run a temporary child calculation"))
    assert provider.blocked.wait(10)
    start.current.kill()
    start.current.wait(timeout=10)
    provider.release.set()
    count = len(provider.requests)
    start()
    snap = snapshot(call, thread)
    assert len(snap["delegations"]) == 1
    assert snap["delegations"][0]["status"] == "unknown", snap
    time.sleep(0.5)
    assert len(provider.requests) == count


def test_explicit_empty_child_tools_and_schema_failure(runtime):
    root, provider, call, _start, *_ = runtime
    _agent, thread = setup(root, call)
    child_requests = []

    def script(body, text):
        messages = body.get("messages", [])
        if not messages:
            return None
        if "focused subagent" in json.dumps(
            [m for m in messages if m["role"] == "system"]
        ):
            child_requests.append(body)
            return {"role": "assistant", "content": "Invalid structured output"}
        if any(m["role"] == "tool" for m in messages):
            return {"role": "assistant", "content": "The child format requires repair."}
        return tool(
            "delegate_task",
            {
                "tasks": [
                    {
                        "goal": "Return the independent structured calculation",
                        "allowed_toolsets": [],
                        "output_schema": {
                            "type": "object",
                            "required": ["answer"],
                            "properties": {"answer": {"type": "integer"}},
                        },
                    }
                ]
            },
        )

    provider.goal_script = script
    receipt = call(send(thread, "Run the structured child"))["result"]
    settle(call, receipt["run_id"])
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        children = snapshot(call, thread)["delegations"]
        if children and children[0]["status"] != "running":
            break
        time.sleep(0.1)
    assert len(children) == 1 and children[0]["status"] == "schema_invalid", children
    assert children[0]["toolsets"] == []
    assert children[0]["result"]["schema_valid"] is False
    assert len(child_requests) == 2  # Native's one bounded schema repair attempt.
    assert all(not request.get("tools") for request in child_requests)
