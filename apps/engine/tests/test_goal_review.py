"""Evidence-bound subgoal contracts and the real native judge route."""

# ruff: noqa: F811
import json

from test_direct_messages import dm, snapshot
from test_goal_lifecycle import begin, continuation_script, continue_goal, eventually
from test_goals import act
from test_runtime import runtime  # noqa: F401


def test_contract_subgoal_evidence_and_native_judge(runtime):
    _, provider, call, start, *_ = runtime
    thread = dm(call, "subgoal-review")
    goal = begin(call, thread)
    contract = {
        "outcome": "Calculate fuel consumption",
        "subgoals": ["Verified calculation"],
        "judge_required": True,
    }
    act(
        call,
        thread,
        action="configure_goal",
        goal_id=goal["goal_id"],
        expected_revision=goal["revision"],
        completion_contract=contract,
    )
    goal = snapshot(call, thread)["goals"][0]
    assert goal["completion_contract"] == contract
    assert goal["subgoals"][0]["evidence_ids"] == []
    continuation_script(provider, goal["goal_id"])
    continue_goal(call, thread, goal)
    goal = eventually(
        lambda: snapshot(call, thread)["goals"][0],
        lambda g: g["status"] == "waiting" and all(u["settled"] for u in g["units"]),
    )
    persisted = [u for u in goal["units"] if u["result_message_id"]]
    assert persisted and any("12 litres" in u["result_preview"] for u in persisted)
    source = next(
        m
        for m in reversed(snapshot(call, thread)["messages"])
        if m["author_kind"] == "agent" and m["run_id"] == goal["units"][-1]["run_id"]
    )
    act(
        call,
        thread,
        action="submit_evidence",
        goal_id=goal["goal_id"],
        expected_revision=goal["revision"],
        source_message_id=source["message_id"],
        criterion="Verified calculation",
        summary="12 litres per 100 km",
    )
    goal = snapshot(call, thread)["goals"][0]
    evidence = [goal["evidence"][0]["evidence_id"]]
    assert goal["subgoals"][0]["evidence_ids"] == evidence
    act(
        call,
        thread,
        action="complete",
        goal_id=goal["goal_id"],
        expected_revision=goal["revision"],
        evidence_ids=evidence,
    )
    assert snapshot(call, thread)["goals"][0]["status"] == "waiting"
    old = provider.goal_script
    verdict = {
        "verdict": "blocked",
        "reason": "Additional arithmetic verification needed",
    }

    def respond(body, text):
        if str(body["messages"][0].get("content", "")).startswith(
            "You are a strict judge"
        ):
            return {
                "role": "assistant",
                "content": json.dumps(verdict),
            }
        return old(body, text)

    provider.goal_script = respond
    act(
        call,
        thread,
        action="verify_goal",
        goal_id=goal["goal_id"],
        expected_revision=goal["revision"],
        evidence_ids=evidence,
    )
    goal = snapshot(call, thread)["goals"][0]
    assert goal["status"] == "blocked"
    assert goal["reviews"][-1]["verdict"] == "blocked"
    assert goal["reviews"][-1]["evidence_ids"] == evidence
    verdict.update(verdict="done", reason="Persisted calculation satisfies criterion")
    act(
        call,
        thread,
        action="verify_goal",
        goal_id=goal["goal_id"],
        expected_revision=goal["revision"],
        evidence_ids=evidence,
    )
    goal = snapshot(call, thread)["goals"][0]
    assert goal["reviews"][-1]["verdict"] == "done", json.dumps(
        goal["reviews"][-1]
    ) + str([r["messages"][-1]["content"][:300] for r in provider.requests[-4:]])
    assert goal["reviews"][-1]["evidence_ids"] == evidence
    act(
        call,
        thread,
        action="complete",
        goal_id=goal["goal_id"],
        expected_revision=goal["revision"],
        evidence_ids=evidence,
    )
    goal = snapshot(call, thread)["goals"][0]
    assert goal["status"] == "completed"
    start.current.kill()
    start.current.wait(timeout=10)
    start()
    assert snapshot(call, thread)["goals"][0] == goal


def test_process_wait_receipt_lineage_and_stop_fence(runtime):
    import sqlite3

    from test_runtime import OWNER

    root, provider, call, start, *_ = runtime
    thread = dm(call, "process-wait")
    goal = begin(call, thread)
    handle = "process-linked-proof"
    with sqlite3.connect(root / "state/state.db") as db:
        admission = db.execute(
            "SELECT native_admission_id FROM nma_adapter_runs WHERE run_id=?",
            (goal["source_run_id"],),
        ).fetchone()[0]
        db.execute(
            "INSERT INTO nma_native_job_events VALUES (?,?,?,?,?)",
            (
                OWNER,
                "scope-fixture",
                handle,
                "running",
                json.dumps(
                    {
                        "handle": handle,
                        "state": "running",
                        "native_admission_id": admission,
                    }
                ),
            ),
        )
    act(
        call,
        thread,
        action="park_on_process",
        goal_id=goal["goal_id"],
        expected_revision=goal["revision"],
        process_handle=handle,
    )
    parked = snapshot(call, thread)["goals"][0]
    assert parked["status"] == "waiting"
    count = len(provider.requests)
    continuation_script(provider, goal["goal_id"])
    with sqlite3.connect(root / "state/state.db") as db:
        db.execute(
            "INSERT INTO nma_native_job_events VALUES (?,?,?,?,?)",
            (
                OWNER,
                "scope-fixture",
                handle,
                "completed",
                json.dumps(
                    {
                        "handle": handle,
                        "state": "completed",
                        "native_admission_id": admission,
                        "exit_code": 0,
                    }
                ),
            ),
        )
    final = eventually(
        lambda: snapshot(call, thread)["goals"][0],
        lambda g: (
            len(g["units"]) > len(parked["units"])
            and g["status"] == "waiting"
            and all(u["settled"] for u in g["units"])
        ),
    )
    assert len(provider.requests) > count
    assert final["units"][-1]["parent_run_id"] == parked["units"][-1]["run_id"]
    act(call, thread, action="stop", goal_id=goal["goal_id"])
    count = len(provider.requests)
    start.current.kill()
    start.current.wait(timeout=10)
    start()
    assert snapshot(call, thread)["goals"][0]["status"] == "stopped"
    assert len(provider.requests) == count


def test_completion_contract_snapshot_restore_preserves_verified_results(
    runtime, tmp_path
):
    import signal

    from ngertiin_engine.backup import QUARANTINE, backup, restore
    from test_runtime import OWNER

    root, provider, call, start, *_ = runtime
    items = call(__import__("test_runtime").command("thread.list", {"after": None}))[
        "result"
    ]["items"]
    thread = next(t for t in items if t["title"] == "subgoal-review")
    original = snapshot(call, thread)
    assert original["goals"][0]["status"] == "completed"
    count = len(provider.requests)
    start.current.send_signal(signal.SIGINT)
    start.current.wait(timeout=25)
    destination = tmp_path / "verified-backup"
    manifest = backup(root / "state", destination)
    assert manifest["schema_version"] == 20
    restore(destination, tmp_path / "restored", OWNER)
    (root / "state").rename(root / "retained-pre-restore")
    (tmp_path / "restored").rename(root / "state")
    assert (root / "state" / QUARANTINE).exists()
    (root / "state" / QUARANTINE).unlink()
    start()
    restored = snapshot(call, thread)
    assert restored["goals"] == original["goals"]
    assert restored["messages"] == original["messages"]
    assert len(provider.requests) == count
