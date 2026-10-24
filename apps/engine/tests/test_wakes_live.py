"""Opt-in ordinary-language scheduling through the configured real provider."""

# ruff: noqa: F811
import json
import os
import time
from pathlib import Path

import pytest
from ngertiin_engine.wakes import utc
from test_direct_messages import dm, public_api, send, snapshot  # noqa: F401
from test_goal_lifecycle import eventually
from test_runtime import command, runtime  # noqa: F401

pytestmark = pytest.mark.skipif(
    not os.environ.get("NMA_TEST_LIVE_ENV"), reason="Live provider evaluation is opt-in"
)


def test_conversation_schedules_offline_result(runtime, public_api):
    root, _, call, start, *_ = runtime
    thread = dm(call, "live-scheduled-work")
    due = time.time() + 90
    body = send(
        thread,
        f"Please take responsibility for a one-time calculation report. At {utc(due)} (UTC), calculate 14 multiplied by 17 and report the result here. Schedule that work and wait until then; I will be offline. This is a real instruction, not a hypothetical. Do not calculate it early or ask me to activate anything.",
    )
    with public_api("/commands", body) as response:
        receipt = json.load(response)
    first = eventually(
        lambda: snapshot(call, thread),
        lambda s: (
            bool(s["goals"])
            and s["goals"][0].get("wake") is not None
            and all(u["settled"] for u in s["goals"][0]["units"])
        ),
        timeout=70,
    )
    assert len(first["goals"]) == 1 and first["goals"][0]["status"] == "waiting"
    assert first["goals"][0]["wake"]["configuration"]["kind"] == "once"
    start.current.kill()
    start.current.wait(timeout=10)
    start()
    # No HTTP, socket or snapshot requests during this offline interval.
    time.sleep(max(0, due - time.time()) + 5)
    final = eventually(
        lambda: snapshot(call, thread),
        lambda s: any(
            m["author_kind"] == "agent"
            and "238" in m["content"]
            and m["message_id"] not in {old["message_id"] for old in first["messages"]}
            for m in s["messages"]
        ),
        timeout=80,
    )
    output = os.environ.get("NMA_TEST_WAKE_OUTPUT")
    if output:
        Path(output).write_text(
            json.dumps(
                {
                    "model": json.loads((root / "models.json").read_text())["test"][
                        "model"
                    ],
                    "receipt": receipt,
                    "scheduled": first,
                    "result": final,
                },
                indent=2,
            )
            + "\n"
        )
    assert len([m for m in final["messages"] if m["author_kind"] == "user"]) == 1
    assert final["goals"][0]["goal_id"] == first["goals"][0]["goal_id"]
    call(command("goal.stop", {"goal_id": first["goals"][0]["goal_id"]}))
