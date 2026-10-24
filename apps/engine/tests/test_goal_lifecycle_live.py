"""Opt-in real-model acceptance through authenticated DM HTTP and native Hermes."""

# ruff: noqa: F811
import json
import os
import time
from pathlib import Path

import pytest
from test_direct_messages import dm, public_api, send, snapshot  # noqa: F401
from test_runtime import command, runtime  # noqa: F401

pytestmark = pytest.mark.skipif(
    not os.environ.get("NMA_TEST_LIVE_ENV"), reason="Live provider evaluation is opt-in"
)


def test_ordinary_conversation_to_verified_completion(runtime, public_api):
    root, _, call, start, *_ = runtime
    thread = dm(call, "goal-lifecycle-live")
    body = send(
        thread,
        "Please take responsibility for preparing a short fuel-efficiency report from these readings: 360 km travelled and 45 litres consumed. Produce the calculation in litres per 100 km and a short interpretation, then independently check the arithmetic and finish the work. Keep working through the result and its verification without waiting for another message from me.",
    )
    with public_api("/commands", body) as response:
        receipt = json.load(response)
    deadline = time.monotonic() + 180
    while time.monotonic() < deadline:
        snap = snapshot(call, thread)
        if snap["goals"] and all(
            g["status"] in {"completed", "blocked", "waiting"}
            and all(u["settled"] for u in g["units"])
            for g in snap["goals"]
        ):
            break
        time.sleep(0.3)
    report = {
        "model": json.loads((root / "models.json").read_text())["test"]["model"],
        "receipt": receipt,
        "snapshot": snap,
    }
    output = os.environ.get("NMA_TEST_LIFECYCLE_OUTPUT")
    if output:
        Path(output).write_text(json.dumps(report, indent=2) + "\n")
    assert len(snap["goals"]) == 1, snap
    goal = snap["goals"][0]
    assert goal["status"] == "completed", goal
    assert len(goal["units"]) >= 2 and goal["evidence"], goal
    assert len([m for m in snap["messages"] if m["author_kind"] == "user"]) == 1
    results = {
        m["message_id"]: m for m in snap["messages"] if m["author_kind"] == "agent"
    }
    assert any(
        "12.5" in results[e["source_message_id"]]["content"] for e in goal["evidence"]
    )
    start.current.kill()
    start.current.wait(timeout=10)
    start()
    restored = snapshot(call, thread)
    assert restored["goals"] == snap["goals"]
    assert restored["messages"] == snap["messages"]
