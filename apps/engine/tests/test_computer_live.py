"""Opt-in real E2B browser through the gateway and three persistent agents."""

# ruff: noqa: F811
import json
import os
import sqlite3
import subprocess
import time
from pathlib import Path

import pytest

pytestmark = pytest.mark.skip(
    reason="Historical E2B browser routing is retired; native browser/desktop live acceptance is recorded under nma-032."
)
from test_capabilities import capability_agent
from test_direct_messages import send, snapshot
from test_runtime import command, runtime  # noqa: F401


@pytest.mark.skipif(
    not os.environ.get("NMA_TEST_COMPUTER_COMMAND"), reason="Opt-in real E2B resources"
)
def test_browser_writer_reviewer_and_cleanup(runtime):
    root, provider, call, start, *_ = runtime
    (root / "capabilities.json").write_text(
        json.dumps(
            {
                "tool_grants": {
                    "browser": {"enabled": True, "toolset": "nma_computer"},
                    "files": {"enabled": True, "toolset": "nma_workspace"},
                }
            }
        )
    )
    agents = [
        capability_agent(call, handle, tool_grants=grants)
        for handle, grants in (
            ("researcher", ["browser"]),
            ("writer", ["files"]),
            ("reviewer", ["files"]),
        )
    ]
    thread = call(
        command(
            "thread.create",
            {
                "kind": "group",
                "title": "Browser report",
                "agent_ids": [a["agent_id"] for a in agents],
            },
        )
    )["result"]["thread"]
    proof = {}

    def tool(name, args, ident):
        return {
            "role": "assistant",
            "content": None,
            "tool_calls": [
                {
                    "id": ident,
                    "type": "function",
                    "function": {"name": name, "arguments": json.dumps(args)},
                }
            ],
        }

    def script(body, _text):
        if not body.get("messages"):
            return None
        prompt = next(
            m["content"] for m in reversed(body["messages"]) if m["role"] == "user"
        )
        last = body["messages"][-1]
        value = json.loads(last["content"]) if last["role"] == "tool" else None
        if "You are @researcher" in prompt:
            if value is None:
                return tool(
                    "computer",
                    {
                        "operation": "act",
                        "action": {
                            "kind": "navigate",
                            "description": "Read the public example page",
                            "url": "https://example.com",
                        },
                    },
                    "navigate",
                )
            if "observation" in value:
                proof["observation"] = value["observation"]
                return tool("computer", {"operation": "pause"}, "pause")
            return {
                "role": "assistant",
                "content": "Browsed Example Domain. @writer publish a report about the observed page.",
            }
        if "You are @writer" in prompt:
            if value is None:
                return tool(
                    "workspace",
                    {
                        "action": "publish",
                        "filename": "browser-report.md",
                        "content": "# Browser report\n"
                        + proof.get("observation", {}).get("title", "NO_OBSERVATION")
                        + "\nhttps://example.com/",
                    },
                    "publish",
                )
            proof["artifact"] = value
            return {
                "role": "assistant",
                "content": "Published artifact "
                + value.get("artifact_id", "ERROR")
                + ". @reviewer read and verify it.",
            }
        if value is None:
            return tool(
                "workspace",
                {"action": "read", "artifact_id": proof["artifact"]["artifact_id"]},
                "read",
            )
        proof["review"] = value
        return {
            "role": "assistant",
            "content": "Reviewed the file: Example Domain and source URL are present.",
        }

    provider.goal_script = script
    try:
        receipt = call(
            send(thread, "@researcher browse and prepare a file for peer review")
        )
        assert "result" in receipt, receipt
        deadline = time.monotonic() + 240
        while time.monotonic() < deadline:
            final = snapshot(call, thread)
            if final["discussion"] and final["discussion"]["status"] != "active":
                break
            time.sleep(1)
        assert final["discussion"]["status"] == "settled", final
        assert proof["observation"]["title"] == "Example Domain", proof
        assert "Example Domain" in proof["review"]["content"], proof
        assert len(final["artifacts"]) == 1
        diagnoses = [
            call(command("run.diagnostics", {"run_id": r["run_id"]}))["result"]
            for r in final["runs"]
        ]
        assert all(d["discussion_ids"] and d["handoff_ids"] for d in diagnoses)
        start.current.kill()
        start.current.wait(timeout=10)
        start()
        assert snapshot(call, thread)["messages"] == final["messages"]
        proof.update(snapshot=final, diagnoses=diagnoses)
    finally:
        provider.goal_script = None
        with sqlite3.connect(root / "state/state.db") as db:
            row = db.execute(
                "SELECT workspace_id,resource_id FROM nma_computers WHERE thread_id=?",
                (thread["thread_id"],),
            ).fetchone()
        if row:
            request = {
                "operation": "delete",
                "workspace": {
                    "id": row[0],
                    "resource_name": "nma-" + row[0],
                    "resource_id": row[1],
                },
            }
            cleanup = subprocess.run(
                json.loads(os.environ["NMA_TEST_COMPUTER_COMMAND"]),
                input=json.dumps(request),
                capture_output=True,
                text=True,
                timeout=90,
                check=True,
            )
            proof["cleanup"] = json.loads(cleanup.stdout)
            assert proof["cleanup"] == {"deleted": True}, proof["cleanup"]
        output = Path(
            os.environ.get("NMA_COMPUTER_OUTPUT", "/tmp/nma-computer-live.json")
        )
        output.write_text(json.dumps(proof, indent=2) + "\n")
