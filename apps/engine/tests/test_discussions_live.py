"""Opt-in real-model three-peer collaboration through public HTTP."""

# ruff: noqa: F811
import json
import os
import time
from pathlib import Path

import pytest
from test_direct_messages import public_api, send, snapshot  # noqa: F401
from test_discussions import group
from test_runtime import runtime  # noqa: F401

pytestmark = pytest.mark.skipif(
    not os.environ.get("NMA_TEST_LIVE_ENV"), reason="Real model acceptance is opt-in"
)


def test_real_group_goal_handoff(runtime, public_api):
    root, _, call, *_ = runtime
    thread = group(call)
    text = (
        "@researcher take responsibility for a short fuel-efficiency report: 360 km and 45 litres. "
        "Calculate litres per 100 km, then explicitly mention @writer to draft the report. "
        "Writer: use the existing shared goal and mention @reviewer to check your report. "
        "Reviewer: verify the calculation and give the final review. Each peer must contribute its own result. "
        "Researcher remains responsible for the goal lifecycle and should verify peer results before completing. "
        "Keep working without another user message."
    )
    receipt = json.load(public_api("/commands", send(thread, text)))
    deadline = time.monotonic() + 240
    while time.monotonic() < deadline:
        snap = snapshot(call, thread)
        authors = {
            m["author_agent_id"]
            for m in snap["messages"]
            if m["author_kind"] == "agent"
        }
        if (
            len(authors) == 3
            and snap["goals"]
            and any(
                g["status"] == "completed" and all(u["settled"] for u in g["units"])
                for g in snap["goals"]
            )
        ):
            break
        time.sleep(0.5)
    report = {
        "model": json.loads((root / "models.json").read_text())["test"]["model"],
        "receipt": receipt,
        "snapshot": snap,
    }
    Path(os.environ.get("NMA_GROUP_OUTPUT", "/tmp/nma-group-live.json")).write_text(
        json.dumps(report, indent=2) + "\n"
    )
    assert len(authors) == 3, snap
    assert len(snap["goals"]) == 1, snap
    assert snap["goals"][0]["status"] == "completed", snap
    assert len([m for m in snap["messages"] if m["author_kind"] == "user"]) == 1
    assert any(
        "12.5" in m["content"] for m in snap["messages"] if m["author_kind"] == "agent"
    )
