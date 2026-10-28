"""Parallel native child tools use isolated capsules and actual Git worktrees."""

# ruff: noqa: F811
import json
import os
import sqlite3
import time

import pytest
from ngertiin_engine.native_executor import IsolatedTools
from test_capabilities import capability_agent
from test_delegation import tool
from test_direct_messages import send, snapshot
from test_learning import conversation
from test_runtime import OWNER, command, runtime  # noqa: F401
from test_workspace_delivery import catalog

pytestmark = pytest.mark.skipif(
    not os.environ.get("NMA_TEST_NATIVE_IMAGE"),
    reason="Requires the reviewed native image",
)


def test_parallel_native_children_worktrees_and_artifact_lineage(runtime):
    root, provider, call, _start, *_ = runtime
    image = os.environ["NMA_TEST_NATIVE_IMAGE"]
    data = catalog(image)
    data["execution_surfaces"]["children"] = {
        "kind": "scoped_delegation",
        "ready": True,
    }
    data["tool_grants"]["delegation"] = {
        "enabled": True,
        "toolset": "delegation",
        "execution_surface": "children",
    }
    (root / "capabilities.json").write_text(json.dumps(data))
    agent = capability_agent(
        call, "child-workspaces", tool_grants=list(data["tool_grants"])
    )
    thread = conversation(call, agent)
    outputs = []
    worktrees = []
    failures = []

    def script(body, text):
        messages = body.get("messages", [])
        if not messages:
            return None
        child = "focused subagent" in json.dumps(
            [m for m in messages if m["role"] == "system"]
        )
        if not child:
            if any(m["role"] == "tool" for m in messages):
                return {
                    "role": "assistant",
                    "content": "Child workspace results observed.",
                }
            return tool(
                "delegate_task",
                {
                    "tasks": [
                        {"goal": "Create the first private Git worktree and artifact"},
                        {"goal": "Create the second private Git worktree and artifact"},
                    ]
                },
            )
        goal = next(m["content"] for m in reversed(messages) if m["role"] == "user")
        marker = "FIRST_CHILD" if "first private" in goal else "SECOND_CHILD"
        recent = []
        for message in reversed(messages):
            if message["role"] == "user":
                break
            if message["role"] == "tool":
                name = next(
                    call["function"]["name"]
                    for entry in messages
                    if entry["role"] == "assistant"
                    for call in entry.get("tool_calls", [])
                    if call["id"] == message["tool_call_id"]
                )
                try:
                    value = json.loads(message["content"])
                except ValueError:
                    value = {"native_text": message["content"]}
                recent.append((name, value))
        if not recent:
            code = (
                "import subprocess,time;from pathlib import Path;p=Path('/work/project');p.mkdir(parents=True,exist_ok=True);subprocess.run(['git','init','-q',str(p)],check=True);subprocess.run(['git','-C',str(p),'config','user.email','fixture@example.invalid'],check=True);subprocess.run(['git','-C',str(p),'config','user.name','Fixture'],check=True);(p/'child.txt').write_text("
                + repr(marker)
                + ");subprocess.run(['git','-C',str(p),'add','child.txt'],check=True);subprocess.run(['git','-C',str(p),'commit','-qm','Seed child workspace'],check=True);time.sleep(2);print((p/'child.txt').read_text())"
            )
            return tool("terminal", {"command": "python -c " + repr(code)})
        name, value = recent[0]
        if name == "tool_call":
            entries = value.get("results", [])
            if entries:
                value = entries[0].get("result", entries[0])
                if isinstance(value, str):
                    value = json.loads(value)
            name = "coding"
        if value.get("error"):
            failures.append(value)
            return {
                "role": "assistant",
                "content": "The native tool reported a failure.",
            }
        if name == "terminal":
            if marker not in json.dumps(value):
                failures.append(value)
                return {
                    "role": "assistant",
                    "content": "The expected native output was absent.",
                }
            outputs.append(marker)
            return tool(
                "tool_call",
                {"calls": [{"name": "coding", "arguments": {"action": "worktree"}}]},
            )
        if name == "coding":
            if not value.get("worktree_id"):
                failures.append(value)
                return {
                    "role": "assistant",
                    "content": "No actual worktree was returned.",
                }
            worktrees.append(value)
            return tool(
                "workspace",
                {
                    "action": "publish_file",
                    "path": "project/child.txt",
                    "filename": marker + ".txt",
                },
            )
        assert name == "workspace", recent
        return {
            "role": "assistant",
            "content": "Verified " + marker + " private worktree and artifact.",
        }

    provider.goal_script = script
    try:
        assert "result" in call(
            send(thread, "Use two temporary assistants, each in its own Git worktree")
        )
        deadline = time.monotonic() + 180
        while time.monotonic() < deadline:
            snap = snapshot(call, thread)
            if len(snap["delegations"]) == 2 and all(
                c["status"] != "running" for c in snap["delegations"]
            ):
                break
            time.sleep(0.2)
        assert all(c["status"] == "completed" for c in snap["delegations"]), snap
        assert not failures, failures
        assert sorted(outputs) == ["FIRST_CHILD", "SECOND_CHILD"]
        assert len(worktrees) == 2
        assert all(len(c.get("artifact_ids", [])) == 1 for c in snap["delegations"]), (
            snap["delegations"]
        )
        assert {
            identity
            for c in snap["delegations"]
            for identity in c.get("worktree_ids", [])
        } == {w["worktree_id"] for w in worktrees}
        assert {a["filename"] for a in snap["artifacts"]} == {
            "FIRST_CHILD.txt",
            "SECOND_CHILD.txt",
        }
        journals = list((root / "state/native-execution").glob("*/isolated-tools.db"))
        assert len(journals) == 1
        with sqlite3.connect(journals[0]) as db:
            assert (
                db.execute("SELECT count(DISTINCT scope_key) FROM scopes").fetchone()[0]
                == 2
            )
            assert (
                db.execute(
                    "SELECT count(*) FROM operations WHERE state='returned'"
                ).fetchone()[0]
                >= 4
            )
        with sqlite3.connect(root / "state/state.db") as db:
            unknown = db.execute(
                "SELECT count(*) FROM nma_effects WHERE status='dispatching'"
            ).fetchone()[0]
            assert unknown == 0
    finally:
        provider.goal_script = None
        for path in (root / "state/native-execution").glob("*/isolated-tools.db"):
            IsolatedTools(path.parent, OWNER, image=image).cleanup()
