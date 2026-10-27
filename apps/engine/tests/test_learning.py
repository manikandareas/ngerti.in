"""Real Hermes tool dispatch, persistent revisions, recall and isolation."""

# ruff: noqa: F811
import json
import sqlite3
import time

from test_capabilities import capability_agent
from test_direct_messages import send
from test_runtime import command, runtime, settle  # noqa: F401


def conversation(call, agent, kind="dm", peers=()):
    return call(
        command(
            "thread.create",
            {
                "kind": kind,
                "title": "Learning",
                "agent_ids": [agent["agent_id"], *[a["agent_id"] for a in peers]],
            },
        )
    )["result"]["thread"]


def inventory(call, agent, thread):
    result = call(
        command(
            "learning.read",
            {"agent_id": agent["agent_id"], "thread_id": thread["thread_id"]},
        )
    )
    assert "result" in result, result
    return result["result"]


def invoke(provider, call, thread, name, arguments):
    def script(body, text):
        if body.get("messages", [])[-1]["role"] == "tool":
            return {"role": "assistant", "content": "Learning operation observed."}
        return {
            "role": "assistant",
            "content": None,
            "tool_calls": [
                {
                    "id": "native-learning",
                    "type": "function",
                    "function": {"name": name, "arguments": json.dumps(arguments)},
                }
            ],
        }

    provider.goal_script = script
    before = len(provider.requests)
    try:
        receipt = call(send(thread, "NMA034 learning case"))
        assert "result" in receipt, receipt
        started = time.monotonic()
        while True:
            state = call(
                command("runtime.read", {"run_id": receipt["result"]["run_id"]})
            )["result"]
            if (
                state["status"] not in {"queued", "running"}
                or time.monotonic() - started > 180
            ):
                break
            time.sleep(0.2)
        tools = [
            m
            for request in provider.requests[before:]
            for m in request.get("messages", [])
            if m["role"] == "tool"
        ]
        assert tools, (state, provider.requests[before:])
        print(
            "LEARNING_CASE",
            name,
            round(time.monotonic() - started, 3),
            state["status"],
            flush=True,
        )
        assert state["status"] == "succeeded", (state, tools[-1])
        return json.loads(tools[-1]["content"])
    finally:
        provider.goal_script = None


def test_native_memory_correction_forget_revision_and_restart(runtime):
    root, provider, call, start, *_ = runtime
    agent = capability_agent(call, "remembering")
    dm = conversation(call, agent)
    for _ in range(2):
        result = invoke(
            provider,
            call,
            dm,
            "memory",
            {
                "action": "add",
                "target": "user",
                "content": "The user prefers concise answers.",
            },
        )
        assert result.get("success"), result
    first = inventory(call, agent, dm)
    assert len(first["memories"]) == 1
    memory = first["memories"][0]
    assert memory["target"] == "user"
    start.current.kill()
    start.current.wait(timeout=10)
    start()
    assert inventory(call, agent, dm)["memories"][0] == memory
    body = command(
        "learning.memory",
        {
            "agent_id": agent["agent_id"],
            "thread_id": dm["thread_id"],
            "memory_id": memory["memory_id"],
            "action": "correct",
            "content": "The user prefers detailed answers.",
        },
    )
    body["expected_revision"] = memory["revision"]
    assert "result" in call(body)
    assert call(body) == call(body)
    changed = inventory(call, agent, dm)["memories"][0]
    assert changed["revision"] == "2" and changed["memory_id"] == memory["memory_id"]
    assert len(changed["history"]) == 2
    stale = {**body, "command_id": command("unused")["command_id"]}
    assert call(stale)["error"]["code"] == "REVISION_CONFLICT"
    before = len(provider.requests)
    settle(call, call(send(dm, "Check preference"))["result"]["run_id"])
    assert "prefers detailed" in json.dumps(provider.requests[before:])
    assert "prefers concise" not in json.dumps(provider.requests[before:])
    deleted = command("learning.memory", {**body["payload"], "action": "forget"})
    deleted["expected_revision"] = "2"
    assert "result" in call(deleted)
    assert inventory(call, agent, dm)["memories"] == []
    with sqlite3.connect(root / "state/state.db") as db:
        assert db.execute(
            "SELECT status FROM nma_memory_entries WHERE memory_id=?",
            (memory["memory_id"],),
        ).fetchone() == ("deleted",)
        assert db.execute(
            "SELECT count(*) FROM nma_memory_revisions WHERE memory_id=?",
            (memory["memory_id"],),
        ).fetchone() == (3,)


def test_native_skill_assets_learning_archive_restore_and_isolation(runtime):
    _, provider, call, start, *_ = runtime
    agent, peer = (
        capability_agent(call, "learner"),
        capability_agent(call, "peer-learner"),
    )
    dm, peer_dm = conversation(call, agent), conversation(call, peer)
    group = conversation(call, agent, "group", [peer])
    content = "---\nname: verify-report\ndescription: Verify a generated report before publication\n---\n\nRead the source, calculate totals, and check the output.\n"
    result = invoke(
        provider,
        call,
        dm,
        "skill_manage",
        {
            "operations": [
                {"action": "create", "name": "verify-report", "content": content},
                {
                    "action": "write_file",
                    "name": "verify-report",
                    "file_path": "scripts/check.py",
                    "file_content": "print('VERIFIED_REPORT')\n",
                },
            ]
        },
    )
    assert result.get("success"), result
    item = inventory(call, agent, dm)["skills"][0]
    assert item["revision"] == "1" and "scripts/check.py" in item["assets"]
    assert inventory(call, peer, peer_dm)["skills"] == []
    assert inventory(call, agent, group)["skills"] == []
    viewed = invoke(
        provider,
        call,
        dm,
        "skill_view",
        {"name": "verify-report", "file_path": "scripts/check.py"},
    )
    assert "VERIFIED_REPORT" in json.dumps(viewed), viewed
    assert viewed["skill_dir"].startswith("/work/imports/skills/")
    assert "INVALID_SKILL_PATH" in json.dumps(
        invoke(
            provider,
            call,
            dm,
            "skill_view",
            {"name": "verify-report", "file_path": "../../state.db"},
        )
    )
    archived = command(
        "learning.skill",
        {
            "agent_id": agent["agent_id"],
            "thread_id": dm["thread_id"],
            "skill_id": item["skill_id"],
            "action": "archive",
        },
    )
    archived["expected_revision"] = "1"
    assert "result" in call(archived)
    assert "NOT_FOUND" in json.dumps(
        invoke(provider, call, dm, "skill_view", {"name": "verify-report"})
    )
    restored = command("learning.skill", {**archived["payload"], "action": "restore"})
    restored["expected_revision"] = "2"
    assert "result" in call(restored)
    start.current.kill()
    start.current.wait(timeout=10)
    start()
    assert inventory(call, agent, dm)["skills"][0]["revision"] == "3"
    assert "VERIFIED_REPORT" in json.dumps(
        invoke(
            provider,
            call,
            dm,
            "skill_view",
            {"name": "verify-report", "file_path": "scripts/check.py"},
        )
    )


def test_native_recall_fts_read_time_window_and_private_boundary(runtime):
    _, _, call, start, *_ = runtime
    agent, peer = (
        capability_agent(call, "recaller"),
        capability_agent(call, "recall-peer"),
    )
    dm = conversation(call, agent)
    group = conversation(call, agent, "group", [peer])
    settle(call, call(send(dm, "PRIVATE_RECALL_ZEBRA"))["result"]["run_id"])
    settle(call, call(send(group, "SHARED_RECALL_GIRAFFE"))["result"]["run_id"])

    def recall(agent, thread, arguments):
        value = call(
            command(
                "learning.recall",
                {
                    "agent_id": agent["agent_id"],
                    "thread_id": thread["thread_id"],
                    "arguments": arguments,
                },
            )
        )
        assert "result" in value, value
        return value["result"]

    own = recall(agent, dm, {"query": "PRIVATE_RECALL_ZEBRA"})
    assert "PRIVATE_RECALL_ZEBRA" in json.dumps(own), own
    assert recall(peer, group, {"query": "PRIVATE_RECALL_ZEBRA"})["results"] == []
    assert "SHARED_RECALL_GIRAFFE" in json.dumps(
        recall(peer, group, {"query": "SHARED_RECALL_GIRAFFE"})
    )
    session = next(iter(own["sources"]))
    assert "PRIVATE_RECALL_ZEBRA" in json.dumps(
        recall(agent, dm, {"session_id": session})
    )
    denied = call(
        command(
            "learning.recall",
            {
                "agent_id": peer["agent_id"],
                "thread_id": group["thread_id"],
                "arguments": {"session_id": session},
            },
        )
    )
    assert denied["error"]["code"] == "NOT_FOUND"
    assert not recall(
        agent, dm, {"query": "PRIVATE_RECALL_ZEBRA", "before": "2000-01-01"}
    ).get("results")
    start.current.kill()
    start.current.wait(timeout=10)
    start()
    assert "PRIVATE_RECALL_ZEBRA" in json.dumps(
        recall(agent, dm, {"query": "PRIVATE_RECALL_ZEBRA"})
    )


def test_pinned_catalog_install_missing_dependency_conflict_and_rollback(runtime):
    _, provider, call, *_ = runtime
    agent = capability_agent(call, "catalog-learner")
    dm = conversation(call, agent)
    before = inventory(call, agent, dm)
    assert len(before["catalog"]) == 210
    entry = next(e for e in before["catalog"] if e["name"] == "docx")
    installed = invoke(provider, call, dm, "skill_install", {"catalog_id": entry["id"]})
    assert "skill_id" in installed, installed
    item = inventory(call, agent, dm)["skills"][0]
    assert (
        item["runtime_ready"] is False and item["reason"] == "native_workspace_required"
    )
    assert "scripts/docx_create.py" in item["assets"]
    assert "python-docx" in json.dumps(
        invoke(provider, call, dm, "skill_view", {"name": "docx"})
    )
    edited = command(
        "learning.skill",
        {
            "agent_id": agent["agent_id"],
            "thread_id": dm["thread_id"],
            "skill_id": item["skill_id"],
            "action": "correct",
            "content": item["content"] + "\nUser customization.\n",
        },
    )
    edited["expected_revision"] = "1"
    assert "result" in call(edited)
    update = command(
        "learning.install",
        {
            "agent_id": agent["agent_id"],
            "thread_id": dm["thread_id"],
            "catalog_id": entry["id"],
        },
    )
    update["expected_revision"] = "2"
    assert call(update)["error"]["code"] == "SKILL_UPDATE_CONFLICT"
    rollback = command(
        "learning.skill",
        {**edited["payload"], "action": "rollback", "source_revision": "1"},
    )
    rollback["expected_revision"] = "2"
    assert "result" in call(rollback)
    assert inventory(call, agent, dm)["skills"][0]["content"] == item["content"]
