"""Opt-in real configured-provider acceptance through the Ngertiin native path."""

# ruff: noqa: F811
import json
import os

import pytest
from test_connections import agent
from test_direct_messages import send
from test_runtime import command, runtime, settle  # noqa: F401


@pytest.mark.skipif(
    not os.environ.get("NMA_TEST_LIVE_ENV"),
    reason="Explicit real-provider environment required",
)
def test_live_existing_connection_stream_and_native_tool(runtime):
    root, _, call, *_ = runtime
    (root / "capabilities.json").write_text(
        json.dumps({"tool_grants": {"tasks": {"enabled": True, "toolset": "todo"}}})
    )
    current = agent(call, "test", "live-provider-proof")
    thread = call(
        command("thread.read", {"thread_id": current["primary_dm_thread_id"]})
    )["result"]
    result = call(
        send(
            thread,
            "Use the todo_list tool to record one completed item named 'Provider integration verified'. After the tool succeeds, reply with one short sentence. Do not create a goal or invoke other tools.",
        )
    )
    assert "result" in result, result
    run_id = result["result"]["run_id"]
    value = settle(call, run_id)
    assert value["text"].strip()
    events = call(
        command(
            "runtime.events",
            {"run_id": run_id, "replay_epoch": None, "last_sequence": "0"},
        )
    )["result"]["events"]
    assert {"tool.started", "tool.completed", "message.completed"} <= {
        e["type"] for e in events
    }, events
    assert "todo_list" in json.dumps(events), events
