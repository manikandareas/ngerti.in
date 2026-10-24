"""Actual Hermes tool-loop capture, transactional receipts and private DM state."""

# ruff: noqa: F811
import json
import sqlite3
import time
from types import SimpleNamespace

import pytest
from test_direct_messages import dm, public_api, send, snapshot  # noqa: F401
from test_runtime import OWNER, command, runtime, settle  # noqa: F401


def act(call, thread, **args):
    request = send(thread, "RESPONSIBILITY:" + json.dumps(args))
    result = call(request)["result"]
    settle(call, result["run_id"])
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        units = [
            u
            for g in snapshot(call, thread)["goals"]
            for u in g.get("units", [])
            if u["run_id"] == result["run_id"]
        ]
        if all(u["settled"] for u in units):
            break
        time.sleep(0.05)
    return result, request


def create(call, thread, key="fuel"):
    return act(
        call,
        thread,
        action="create",
        creation_key=key,
        title="Fuel report",
        objective="Prepare fuel report for Friday",
    )


def test_capture_correction_repetition_stop_restart_and_provenance(runtime):
    root, provider, call, start, *_ = runtime
    thread = dm(call, "goal-capture")
    first, request = create(call, thread)
    goals = snapshot(call, thread)["goals"]
    assert len(goals) == 1, provider.requests[-1]
    goal = goals[0]
    assert goal["source_message_id"] == first["message_id"]
    assert goal["source_run_id"] == first["run_id"]
    assert goal["status"] == "active" and goal["revision"] == "1"
    assert any(
        t["function"]["name"] == "responsibility"
        for t in provider.requests[-1]["tools"]
    )
    correction, _ = act(
        call,
        thread,
        action="update",
        goal_id=goal["goal_id"],
        expected_revision="1",
        title="Fuel report",
        objective="Prepare Alpha fuel report for Monday, litres per 100 km",
    )
    updated = snapshot(call, thread)["goals"][0]
    assert updated["goal_id"] == goal["goal_id"] and updated["revision"] == "2"
    assert updated["source_message_id"] == first["message_id"]
    create(
        call, thread
    )  # A new model tool ID/turn still reuses the semantic creation key.
    assert snapshot(call, thread)["goals"] == [updated]
    act(
        call,
        thread,
        action="update",
        goal_id=goal["goal_id"],
        expected_revision="1",
        title="Stale",
        objective="Stale correction",
    )
    assert snapshot(call, thread)["goals"] == [updated]
    act(call, thread, action="stop", goal_id=goal["goal_id"])
    stopped = snapshot(call, thread)["goals"][0]
    assert stopped["status"] == "stopped" and stopped["generation"] == "3"
    start.current.kill()
    start.current.wait(timeout=10)
    start()
    assert snapshot(call, thread)["goals"] == [stopped]
    assert call(request)["result"]["run_id"] == first["run_id"]
    create(call, thread)
    act(
        call,
        thread,
        action="update",
        goal_id=goal["goal_id"],
        expected_revision="3",
        title="Revive",
        objective="Revive",
    )
    assert snapshot(call, thread)["goals"] == [stopped]
    with sqlite3.connect(root / "state/state.db") as db:
        ops = db.execute(
            "SELECT source_message_id,result FROM nma_goal_operations WHERE source_run_id=?",
            (correction["run_id"],),
        ).fetchall()
        assert ops[0][0] == correction["message_id"]
        assert json.loads(ops[0][1])["goal"]["revision"] == "2"
    events = call(
        command(
            "thread.events",
            {
                "thread_id": thread["thread_id"],
                "replay_epoch": None,
                "last_sequence": "0",
            },
        )
    )["result"]["events"]
    assert (
        len(
            [
                e
                for e in events
                if e["type"] == "goal.changed" and e["payload"].get("operation_id")
            ]
        )
        == 3
    )


def test_goal_scope_cannot_be_selected_by_model(runtime):
    _, provider, call, *_ = runtime
    a, b = dm(call, "goal-private-a"), dm(call, "goal-private-b")
    create(call, a, "private-sentinel")
    goal = snapshot(call, a)["goals"][0]
    act(call, b, action="stop", goal_id=goal["goal_id"])
    assert snapshot(call, a)["goals"][0]["status"] == "active"
    assert not snapshot(call, b)["goals"]
    sibling = call(
        command(
            "thread.create",
            {
                "kind": "dm",
                "title": "Same agent private thread",
                "agent_ids": [a["dm_agent_id"]],
            },
        )
    )["result"]["thread"]
    act(call, sibling, action="stop", goal_id=goal["goal_id"])
    assert not snapshot(call, sibling)["goals"]
    assert snapshot(call, a)["goals"][0]["status"] == "active"
    assert "private-sentinel" not in json.dumps(provider.requests[-1])
    act(
        call,
        b,
        action="create",
        creation_key="bad",
        title="Bad",
        objective="Bad",
        thread_id=a["thread_id"],
    )
    assert not snapshot(call, b)["goals"]


def test_goal_transaction_replay_and_rollback(runtime, monkeypatch):
    """Exercise a live blocked admission with the real epoch-fenced SQLite writer."""
    from hermes_state import SessionDB
    from ngertiin_engine.goals import Goals
    from ngertiin_engine.reliability import Reliability
    from ngertiin_engine.store import Store

    root, provider, call, *_ = runtime
    thread = dm(call, "goal-atomic")
    provider.release.clear()
    provider.blocked.clear()
    run = call(send(thread, "BLOCK_STARTED"))["result"]
    assert provider.blocked.wait(10)
    # A non-revoking config change affects future runs, not this admitted snapshot.
    agent = next(
        a
        for a in call(command("agent.list", {"after": None, "limit": 100}))["result"][
            "items"
        ]
        if a["agent_id"] == thread["dm_agent_id"]
    )
    update = command(
        "agent.configure",
        {
            "agent_id": agent["agent_id"],
            "display_name": agent["display_name"],
            "handle": agent["handle"],
            "config": agent["config"],
        },
    )
    update["expected_revision"] = agent["revision"]
    assert "result" in call(update)
    db = SessionDB(db_path=root / "state/state.db")
    epoch = db._execute_write(
        lambda conn: conn.execute(
            "SELECT authority_epoch FROM nma_partition"
        ).fetchone()[0]
    )
    store = Store(SimpleNamespace(db=db, epoch=epoch), OWNER)
    native = store.write(
        lambda conn: conn.execute(
            "SELECT a.admission_id,a.generation FROM session_admissions a JOIN nma_adapter_runs r ON a.request_id='nma:'||r.operation_id WHERE r.run_id=?",
            (run["run_id"],),
        ).fetchone()
    )
    stamp = {
        "admission_id": native[0],
        "execution_generation": native[1],
        "authority_epoch": epoch,
    }
    reliability = Reliability(store)

    def null_delta(conn):
        row = reliability.native(conn, native[0])
        reliability.append(
            conn, run["run_id"], json.loads(row[1]), "message.delta", {"text": None}
        )

    store.write(null_delta)
    assert (
        next(r for r in snapshot(call, thread)["runs"] if r["run_id"] == run["run_id"])[
            "text"
        ]
        == ""
    )
    goals = Goals(store)
    ids = SimpleNamespace(turn_id="stable-turn", tool_call_id="stable-call")
    args = {
        "action": "create",
        "creation_key": "atomic",
        "title": "Atomic",
        "objective": "Atomic responsibility",
    }
    append = Reliability.append

    def fail(*args):
        raise RuntimeError("Injected pre-commit failure")

    monkeypatch.setattr(Reliability, "append", fail)
    with pytest.raises(RuntimeError):
        goals.tool(stamp, args, ids)
    assert snapshot(call, thread)["goals"] == []
    monkeypatch.setattr(Reliability, "append", append)
    result = goals.tool(stamp, args, ids)
    assert goals.tool(stamp, args, ids) == result
    assert (
        json.loads(goals.tool(stamp, {**args, "title": "Changed"}, ids))["error"]
        == "COMMAND_CONFLICT"
    )
    assert len(snapshot(call, thread)["goals"]) == 1
    call(command("run.cancel", {"run_id": run["run_id"]}))
    assert (
        json.loads(
            goals.tool(
                stamp,
                {**args, "creation_key": "late"},
                SimpleNamespace(turn_id="late", tool_call_id="late"),
            )
        )["error"]
        == "RUN_CANCELLED"
    )
    provider.release.set()
    db.close()


@pytest.mark.parametrize(
    "point,count", [("before_goal_commit", 0), ("after_goal_commit", 1)]
)
def test_goal_hard_crash_boundary(runtime, point, count):
    root, provider, call, start, *_ = runtime
    thread = dm(call, "crash-" + point.replace("_", "-"))
    start.current.kill()
    start.current.wait(timeout=10)
    (root / "fault-fired").unlink(missing_ok=True)
    start(point)
    args = {
        "action": "create",
        "creation_key": "crash-proof",
        "title": "Crash proof",
        "objective": "Preserve capture across restart",
    }
    request = send(thread, "RESPONSIBILITY:" + json.dumps(args))
    receipt = call(request)["result"]
    start.current.wait(timeout=15)
    assert (root / "fault-fired").read_text() == point
    before = len(provider.requests)
    start()
    snap = snapshot(call, thread)
    assert len(snap["goals"]) == count
    assert call(request)["result"]["run_id"] == receipt["run_id"]
    assert len(provider.requests) == before
    with sqlite3.connect(root / "state/state.db") as db:
        assert (
            db.execute(
                "SELECT count(*) FROM nma_goal_operations WHERE source_run_id=?",
                (receipt["run_id"],),
            ).fetchone()[0]
            == count
        )
        assert (
            db.execute(
                "SELECT count(*) FROM nma_events WHERE json_extract(payload,'$.run_id')=? AND json_extract(payload,'$.type')='goal.changed' AND json_extract(payload,'$.payload.operation_id') IS NOT NULL",
                (receipt["run_id"],),
            ).fetchone()[0]
            == count
        )
        assert db.execute("PRAGMA foreign_key_check").fetchall() == []


def test_goal_schema_upgrade_preserves_prior_data(runtime):
    root, _, call, start, *_ = runtime
    thread = dm(call, "goal-upgrade")
    result = call(send(thread, "PRE_UPGRADE_MESSAGE"))["result"]
    settle(call, result["run_id"])
    before = snapshot(call, thread)
    start.current.kill()
    start.current.wait(timeout=10)
    with sqlite3.connect(root / "state/state.db") as db:
        checksums = db.execute(
            "SELECT version,checksum FROM nma_schema_migrations WHERE version<7 ORDER BY version"
        ).fetchall()
        for table in (
            "nma_webhook_events",
            "nma_webhook_batches",
            "nma_triggers",
            "nma_trigger_definitions",
            "nma_goal_evidence",
            "nma_goal_units",
            "nma_goal_lifecycle",
        ):
            db.execute("DROP TABLE " + table)
        db.execute("DELETE FROM nma_schema_migrations WHERE version>=8")
        db.execute("DROP TABLE nma_goal_operations")
        db.execute("DROP TABLE nma_goals")
        db.execute("DELETE FROM nma_schema_migrations WHERE version=7")
        db.execute("UPDATE nma_partition SET schema_version=6")
    start()
    assert snapshot(call, thread) == before
    create(call, thread)
    assert len(snapshot(call, thread)["goals"]) == 1
    with sqlite3.connect(root / "state/state.db") as db:
        assert (
            db.execute(
                "SELECT version,checksum FROM nma_schema_migrations WHERE version<7 ORDER BY version"
            ).fetchall()
            == checksums
        )
        assert db.execute("PRAGMA integrity_check").fetchone()[0] == "ok"


def test_goal_http_snapshot_and_sse(runtime, public_api):
    _, _, call, *_ = runtime
    thread = dm(call, "goal-http")
    path = "/threads/" + thread["thread_id"] + "/snapshot"
    before = json.load(public_api(path))
    create(call, thread)
    after = json.load(public_api(path))
    assert len(after["goals"]) == 1
    with public_api(
        "/events?thread_id=" + thread["thread_id"],
        headers={"Last-Event-ID": before["through_cursor"]},
    ) as stream:
        while True:
            line = stream.readline().decode().strip()
            if line.startswith("data: "):
                event = json.loads(line[6:])
                if event["type"] == "goal.changed":
                    assert event["goal_id"] == after["goals"][0]["goal_id"]
                    emitted = event["payload"]["goal"]
                    assert emitted["goal_id"] == after["goals"][0]["goal_id"]
                    assert emitted["revision"] == after["goals"][0]["revision"]
                    assert (
                        emitted["source_message_id"]
                        == after["goals"][0]["source_message_id"]
                    )
                    break
