"""Lost native completion events and partial-result crash recovery without replay."""

# ruff: noqa: F811
import json
import sqlite3
import threading
import time

from test_delegation import setup, tool
from test_direct_messages import send, snapshot
from test_runtime import runtime, settle  # noqa: F401


def recover_case(runtime, partial):
    root, provider, call, start, *_ = runtime
    _agent, dm = setup(root, call)
    blocked, release = threading.Event(), threading.Event()
    child_calls, combined = [], []

    def script(body, text):
        messages = body.get("messages", [])
        if not messages:
            return None
        prompt = next(m["content"] for m in reversed(messages) if m["role"] == "user")
        if "focused subagent" in json.dumps(
            [m for m in messages if m["role"] == "system"]
        ):
            child_calls.append(prompt)
            if not partial or "UNKNOWN_CHILD" in prompt:
                blocked.set()
                release.wait(20)
            return {"role": "assistant", "content": '{"answer":42}'}
        if "native temporary subagents have settled" in prompt:
            combined.append(prompt)
            return {
                "role": "assistant",
                "content": "KNOWN_COMPLETE_42_WITH_UNKNOWN"
                if partial
                else "KNOWN_COMPLETE_42",
            }
        if any(m["role"] == "tool" for m in messages):
            return {"role": "assistant", "content": "Independent children are working."}
        return tool(
            "delegate_task",
            {
                "tasks": [
                    {"goal": "KNOWN_CHILD: independently calculate the answer"},
                    *(
                        [{"goal": "UNKNOWN_CHILD: calculate the independent answer"}]
                        if partial
                        else []
                    ),
                ]
            },
        )

    provider.goal_script = script
    receipt = call(send(dm, "Use independent temporary assistants once"))["result"]
    try:
        assert blocked.wait(10)
        settle(call, receipt["run_id"])
        with sqlite3.connect(root / "state/state.db") as db:
            batch, native_ids = db.execute(
                "SELECT batch_id,native_ids FROM nma_delegation_batches WHERE parent_run_id=?",
                (receipt["run_id"],),
            ).fetchone()
            db.execute(
                "UPDATE nma_delegation_batches SET state='held_for_verification' WHERE batch_id=?",
                (batch,),
            )
        if not partial:
            release.set()
        deadline = time.monotonic() + 15
        while time.monotonic() < deadline:
            children = snapshot(call, dm)["delegations"]
            if any(c["status"] == "completed" for c in children):
                break
            time.sleep(0.1)
        assert any(c["status"] == "completed" for c in children), children
        # Allow native record_unit_child/finalize to persist its own receipt.
        time.sleep(0.3)
        start.current.kill()
        start.current.wait(timeout=10)
        release.set()
        with sqlite3.connect(root / "state/state.db") as db:
            db.execute(
                "UPDATE nma_delegation_batches SET state='pending' WHERE batch_id=?",
                (batch,),
            )
            if not partial:
                for identity in json.loads(native_ids):
                    row = db.execute(
                        "SELECT state,result_json FROM async_delegations WHERE delegation_id=?",
                        (identity,),
                    ).fetchone()
                    assert row[0] == "completed" and row[1], row
                    db.execute(
                        "UPDATE async_delegations SET event_json=NULL WHERE delegation_id=?",
                        (identity,),
                    )
        before = len(child_calls)
        start()
        deadline = time.monotonic() + 15
        while time.monotonic() < deadline:
            snap = snapshot(call, dm)
            if combined and any(
                m["content"].startswith("KNOWN_COMPLETE_42") for m in snap["messages"]
            ):
                break
            time.sleep(0.1)
        assert len(combined) == 1, snap
        assert len(child_calls) == before
        assert "42" in combined[0]
        assert (
            "git_state_hint" not in combined[0]
            and "transcript_tails" not in combined[0]
        )
        if partial:
            assert "unknown" in combined[0]
            assert sorted(c["status"] for c in snap["delegations"]) == [
                "completed",
                "unknown",
            ]
        else:
            assert snap["delegations"][0]["status"] == "completed"
        assert len([m for m in snap["messages"] if m["author_kind"] == "user"]) == 1
        count = len(provider.requests)
        start.current.kill()
        start.current.wait(timeout=10)
        start()
        time.sleep(0.5)
        assert len(provider.requests) == count
    finally:
        release.set()


def test_lost_completion_event_uses_native_known_result_once(runtime):
    recover_case(runtime, partial=False)


def test_partial_crash_preserves_known_and_unknown_results_without_respawn(runtime):
    recover_case(runtime, partial=True)
