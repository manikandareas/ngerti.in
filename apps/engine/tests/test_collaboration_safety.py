"""Durable peer dependencies, retry and membership/privacy fences."""

# ruff: noqa: F811
import json
import threading
import time

import pytest
from test_delegation import tool
from test_direct_messages import send, snapshot
from test_discussions import group, wait_group
from test_runtime import command, runtime, settle  # noqa: F401


def test_peer_dependencies_block_unblock_and_handoff_dedup(runtime):
    root, provider, call, start, *_ = runtime
    thread = group(call)
    first = second = None
    stage = 0
    submitted = []

    def script(body, text):
        nonlocal first, second, stage
        messages = body.get("messages", [])
        if not messages:
            return None
        prompt = next(m["content"] for m in reversed(messages) if m["role"] == "user")
        assigned = json.loads(prompt.split("Assigned tasks (data):\n")[-1])
        recent = None
        for message in reversed(messages):
            if message["role"] == "user":
                break
            if message["role"] == "tool":
                recent = json.loads(message["content"])
                break
        if "You are @researcher" in prompt:
            if stage < 2:
                if recent:
                    first = recent["task"]["task_id"]
                stage += 1
                return tool(
                    "collaboration",
                    {
                        "action": "handoff",
                        "assignee": "writer",
                        "creation_key": "first",
                        "expected_result": "Verify the source calculation",
                        **({"artifact_ids": []} if stage == 2 else {}),
                    },
                )
            if stage == 2:
                assert recent["task"]["task_id"] == first
                stage += 1
                return tool(
                    "collaboration",
                    {
                        "action": "handoff",
                        "assignee": "writer",
                        "creation_key": "dependent",
                        "expected_result": "Combine only after the verified source calculation",
                        "dependencies": [first],
                    },
                )
            if recent:
                second = recent["task"]["task_id"]
            return {"role": "assistant", "content": "Two concrete tasks are assigned."}
        if "You are @writer" in prompt or "SOUL_writer" in json.dumps(messages):
            if not assigned:
                return {"role": "assistant", "content": "PASS"}
            task = recent["task"] if recent else assigned[0]
            if recent and task["status"] == "submitting":
                submitted.append(task["task_id"])
                return {
                    "role": "assistant",
                    "content": "Verified task result submitted.",
                }
            if (
                task["task_id"] == first
                and not task["history"]
                and task["status"] != "blocked"
            ):
                return tool(
                    "collaboration",
                    {
                        "action": "block",
                        "task_id": task["task_id"],
                        "expected_revision": task["revision"],
                        "summary": "Waiting for the source verification",
                    },
                )
            if task["status"] == "blocked":
                return tool(
                    "collaboration",
                    {
                        "action": "unblock",
                        "task_id": task["task_id"],
                        "expected_revision": task["revision"],
                    },
                )
            return tool(
                "collaboration",
                {
                    "action": "submit",
                    "task_id": task["task_id"],
                    "expected_revision": task["revision"],
                    "summary": "Source verified."
                    if task["task_id"] == first
                    else "Combined the verified source.",
                },
            )
        return {"role": "assistant", "content": "PASS"}

    provider.goal_script = script
    request = send(
        thread, "@researcher assign a source check and a dependent synthesis"
    )
    assert "result" in call(request)
    snap, _ = wait_group(root, call, thread)
    deadline = time.monotonic() + 20
    while time.monotonic() < deadline:
        snap = snapshot(call, thread)
        if len(snap["collaboration_tasks"]) == 2 and all(
            t["status"] == "completed" for t in snap["collaboration_tasks"]
        ):
            break
        time.sleep(0.1)
    assert submitted == [first, second], (submitted, snap)
    assert len(snap["collaboration_tasks"]) == 2
    assert all(t["status"] == "completed" for t in snap["collaboration_tasks"]), snap
    first_task = next(t for t in snap["collaboration_tasks"] if t["task_id"] == first)
    assert [h["status"] for h in first_task["history"]] == [
        "blocked",
        "unblocked",
        "completed",
    ]
    count = len(provider.requests)
    assert call(request)["result"]["duplicate"] is True
    start.current.kill()
    start.current.wait(timeout=10)
    start()
    assert snapshot(call, thread)["collaboration_tasks"] == snap["collaboration_tasks"]
    assert len(provider.requests) == count


@pytest.mark.parametrize("remove", [False, True])
def test_peer_task_cancel_or_remove_prevents_late_publication_and_dm_leak(
    runtime, remove
):
    root, provider, call, start, *_ = runtime
    thread = group(call)
    researcher = thread["agents"][0]
    private_dm = call(
        command("thread.read", {"thread_id": researcher["primary_dm_thread_id"]})
    )["result"]
    provider.goal_script = lambda body, text: {
        "role": "assistant",
        "content": "Private note acknowledged.",
    }
    private = call(send(private_dm, "PRIVATE_DM_CANARY_DO_NOT_SHARE"))["result"]
    settle(call, private["run_id"])
    blocked, release = threading.Event(), threading.Event()
    seen = []

    def script(body, text):
        messages = body.get("messages", [])
        if not messages:
            return None
        seen.append(json.dumps(messages))
        prompt = next(m["content"] for m in reversed(messages) if m["role"] == "user")
        if "You are @researcher" in prompt:
            if messages[-1]["role"] != "tool":
                return tool(
                    "collaboration",
                    {
                        "action": "handoff",
                        "assignee": "writer",
                        "expected_result": "Produce the shared report",
                    },
                )
            return {"role": "assistant", "content": "Task assigned to the writer."}
        if "You are @writer" in prompt:
            blocked.set()
            release.wait(20)
            return {
                "role": "assistant",
                "content": "FORBIDDEN_LATE_PEER_PUBLICATION @reviewer",
            }
        return {"role": "assistant", "content": "PASS"}

    provider.goal_script = script
    receipt = call(send(thread, "@researcher delegate the shared report"))["result"]
    try:
        assert blocked.wait(15)
        if remove:
            body = command(
                "member.remove",
                {
                    "thread_id": thread["thread_id"],
                    "agent_id": thread["agents"][1]["agent_id"],
                },
            )
            body["expected_revision"] = thread["membership_revision"]
        else:
            body = command("run.cancel", {"run_id": receipt["run_id"]})
        assert "result" in call(body)
        release.set()
        snap, status = wait_group(root, call, thread)
        assert status == "cancelled"
        assert not any(
            "FORBIDDEN_LATE_PEER_PUBLICATION" in m["content"] for m in snap["messages"]
        )
        assert all("PRIVATE_DM_CANARY_DO_NOT_SHARE" not in text for text in seen)
        count = len(provider.requests)
        start.current.kill()
        start.current.wait(timeout=10)
        start()
        time.sleep(0.5)
        assert len(provider.requests) == count
        assert not any(
            t["status"] == "completed"
            for t in snapshot(call, thread)["collaboration_tasks"]
        )
    finally:
        release.set()


def test_crash_after_peer_submission_never_replays_or_verifies_unsettled_work(runtime):
    root, provider, call, start, *_ = runtime
    thread = group(call)
    blocked, release = threading.Event(), threading.Event()
    identity = None

    def script(body, text):
        nonlocal identity
        messages = body.get("messages", [])
        if not messages:
            return None
        prompt = next(m["content"] for m in reversed(messages) if m["role"] == "user")
        if "You are @researcher" in prompt:
            if messages[-1]["role"] != "tool":
                return tool(
                    "collaboration",
                    {
                        "action": "handoff",
                        "assignee": "writer",
                        "expected_result": "Verify the independent calculation",
                    },
                )
            identity = json.loads(messages[-1]["content"])["task"]["task_id"]
            return {"role": "assistant", "content": "Calculation assigned to writer."}
        if "You are @writer" in prompt:
            if messages[-1]["role"] == "tool":
                blocked.set()
                release.wait(20)
                return {
                    "role": "assistant",
                    "content": "FORBIDDEN_UNSETTLED_PEER_COMPLETION",
                }
            task = json.loads(prompt.split("Assigned tasks (data):\n")[-1])[0]
            return tool(
                "collaboration",
                {
                    "action": "submit",
                    "task_id": task["task_id"],
                    "expected_revision": task["revision"],
                    "summary": "The calculation produced 42.",
                },
            )
        return {"role": "assistant", "content": "PASS"}

    provider.goal_script = script
    call(send(thread, "@researcher hand off the calculation once"))
    try:
        assert blocked.wait(15)
        assert (
            snapshot(call, thread)["collaboration_tasks"][0]["status"] == "submitting"
        )
        start.current.kill()
        start.current.wait(timeout=10)
        release.set()
        count = len(provider.requests)
        start()
        snap, status = wait_group(root, call, thread)
        assert status == "cancelled", snap
        assert len(snap["collaboration_tasks"]) == 1
        task = snap["collaboration_tasks"][0]
        assert task["task_id"] == identity and task["status"] == "cancelled", task
        assert not any(
            "FORBIDDEN_UNSETTLED_PEER_COMPLETION" in m["content"]
            for m in snap["messages"]
        )
        assert len(provider.requests) == count
        start.current.kill()
        start.current.wait(timeout=10)
        start()
        time.sleep(0.5)
        assert len(provider.requests) == count
        assert (
            snapshot(call, thread)["collaboration_tasks"] == snap["collaboration_tasks"]
        )
    finally:
        release.set()
