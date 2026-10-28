"""Real native room routing, durable task review and shared artifact receipts."""

# ruff: noqa: F811
import json
import sqlite3
import time

import pytest
from test_delegation import tool
from test_direct_messages import send, snapshot
from test_discussions import group, wait_group
from test_runtime import command, runtime  # noqa: F401


@pytest.mark.parametrize("addressed", [False, True])
def test_peer_handoff_review_changes_artifact_and_restart(runtime, addressed):
    root, provider, call, start, *_ = runtime
    (root / "capabilities.json").write_text(
        json.dumps(
            {"tool_grants": {"files": {"enabled": True, "toolset": "nma_workspace"}}}
        )
    )
    thread = group(call)
    for agent in thread["agents"]:
        edit = command(
            "agent.configure",
            {
                "agent_id": agent["agent_id"],
                "display_name": agent["display_name"],
                "handle": agent["handle"],
                "config": {**agent["config"], "tool_grants": ["files"]},
            },
        )
        edit["expected_revision"] = agent["revision"]
        assert "result" in call(edit)
    thread = call(command("thread.read", {"thread_id": thread["thread_id"]}))["result"]
    task_id = None
    artifact_id = None
    reviews = 0

    def script(body, text):
        nonlocal task_id, artifact_id, reviews
        if not body.get("messages"):
            return None
        messages = body["messages"]
        prompt = next(m["content"] for m in reversed(messages) if m["role"] == "user")
        assigned = json.loads(prompt.split("Assigned tasks (data):\n")[-1])
        recent = []
        for message in reversed(messages):
            if message["role"] == "user":
                break
            if message["role"] == "tool":
                recent.append(json.loads(message["content"]))
        systems = json.dumps([m for m in messages if m["role"] == "system"])
        is_researcher = "You are @researcher" in prompt or "SOUL_researcher" in systems
        is_writer = "You are @writer" in prompt or "SOUL_writer" in systems
        if is_researcher:
            if not recent:
                return tool(
                    "collaboration",
                    {
                        "action": "handoff",
                        "assignee": "writer",
                        "expected_result": "Publish the verified report, ask reviewer to inspect its exact artifact, and apply any requested changes.",
                    },
                )
            task_id = recent[0]["task"]["task_id"]
            return {"role": "assistant", "content": "Research is ready for the writer."}
        if is_writer:
            pending = next(
                (
                    t
                    for t in assigned
                    if t["status"] in {"pending", "changes_requested"}
                ),
                None,
            )
            if not pending:
                return {"role": "assistant", "content": "PASS"}
            if not recent:
                return tool(
                    "workspace",
                    {
                        "action": "publish",
                        "filename": "report.txt",
                        "content": "Verified report revision " + pending["revision"],
                    },
                )
            if "artifact_id" in recent[0]:
                artifact_id = recent[0]["artifact_id"]
                return tool(
                    "collaboration",
                    {
                        "action": "submit",
                        "task_id": pending["task_id"],
                        "expected_revision": pending["revision"],
                        "summary": "Actual report artifact published.",
                        "artifact_ids": [artifact_id],
                        "reviewer": "reviewer",
                    },
                )
            assert "task" in recent[0], recent
            return {
                "role": "assistant",
                "content": "Report submitted for independent review.",
            }
        pending = next((t for t in assigned if t["status"] == "review"), None)
        if not pending:
            return {"role": "assistant", "content": "PASS"}
        if not recent:
            return tool(
                "workspace",
                {"action": "read", "artifact_id": pending["artifact_ids"][0]},
            )
        if "task" not in recent[0]:
            assert "Verified report revision" in json.dumps(recent[0]), recent
            reviews += 1
            return tool(
                "collaboration",
                {
                    "action": "review",
                    "task_id": pending["task_id"],
                    "expected_revision": pending["revision"],
                    "decision": "request_changes" if reviews == 1 else "approve",
                    "summary": "Inspected exact stored report; clarify the title."
                    if reviews == 1
                    else "Inspected the corrected artifact; accepted.",
                },
            )
        return {
            "role": "assistant",
            "content": "Changes requested."
            if reviews == 1
            else "Verified report accepted.",
        }

    provider.goal_script = script
    result = call(
        send(
            thread,
            ("@researcher. " if addressed else "")
            + "Work together to produce and review a report",
        )
    )
    assert "result" in result, result
    snap, status = wait_group(root, call, thread)
    deadline = time.monotonic() + 20
    while (
        snap["collaboration_tasks"][0]["status"] != "completed"
        and time.monotonic() < deadline
    ):
        time.sleep(0.1)
        snap = snapshot(call, thread)
    assert status in {"settled", "bounded"}, snap
    tasks = snap["collaboration_tasks"]
    assert len(tasks) == 1, snap
    task = tasks[0]
    assert task["status"] == "completed", task
    assert [h["status"] for h in task["history"]] == [
        "review",
        "changes_requested",
        "review",
        "completed",
    ], task
    assert reviews == 2
    assert task["task_id"] == task_id
    assert task["artifact_ids"] == [artifact_id]
    assert len(snap["artifacts"]) == 2
    count = len(provider.requests)
    start.current.kill()
    start.current.wait(timeout=10)
    start()
    assert snapshot(call, thread)["collaboration_tasks"] == tasks
    assert len(provider.requests) == count
    boards = list((root / "state/kanban/boards").glob("nma-peers-*/kanban.db"))
    matching = []
    for board in boards:
        with sqlite3.connect(board) as db:
            if db.execute(
                "SELECT 1 FROM nma_peer_projection WHERE task_id=?", (task_id,)
            ).fetchone():
                matching.append(board)
    assert len(matching) == 1
    with sqlite3.connect(matching[0]) as db:
        assert db.execute("SELECT status FROM tasks").fetchall() == [("done",)]
