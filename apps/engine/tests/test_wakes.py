"""Durable offline wakes through the real Hermes gateway and controlled clocks."""

# ruff: noqa: F811
import sqlite3
import threading
import time
from datetime import UTC, datetime
from types import SimpleNamespace

import pytest
from ngertiin_engine.contracts import EngineError
from ngertiin_engine.wakes import Wakes, configuration, next_time, utc
from test_direct_messages import dm, snapshot
from test_goal_lifecycle import begin, continuation_script, eventually
from test_goals import act
from test_runtime import OWNER, command, runtime  # noqa: F401


def schedule(call, thread, goal, kind="once", seconds=3):
    wake = {"kind": kind, "timezone": "Asia/Makassar", "missed_policy": "coalesce"}
    wake.update(
        {"at": utc(time.time() + seconds)}
        if kind == "once"
        else {"interval_seconds": 60}
    )
    act(
        call,
        thread,
        action="schedule",
        goal_id=goal["goal_id"],
        expected_revision=goal["revision"],
        wake=wake,
    )
    value = snapshot(call, thread)["goals"][0]
    assert value["wake"] is not None
    return value


def test_clock_configuration_and_dst():
    now = datetime(2026, 3, 8, 6, 30, tzinfo=UTC).timestamp()
    cfg, due = configuration(
        {
            "kind": "interval",
            "timezone": "America/New_York",
            "missed_policy": "coalesce",
            "interval_seconds": 3600,
        },
        now,
    )
    assert due == now + 3600
    assert next_time(cfg, now) == now + 3600  # elapsed hour across spring DST
    for bad in (
        {
            "kind": "heartbeat",
            "timezone": "UTC",
            "missed_policy": "coalesce",
            "interval_seconds": 1,
        },
        {
            "kind": "once",
            "timezone": "UTC",
            "missed_policy": "coalesce",
            "at": "2027-01-01T00:00:00",
        },
    ):
        with pytest.raises(EngineError):
            configuration(bad, now)


def test_offline_once_restart_receipt_and_wait(runtime):
    root, provider, call, start, *_ = runtime
    thread = dm(call, "wake-once")
    goal = begin(call, thread)
    continuation_script(provider, goal["goal_id"])
    scheduled = schedule(call, thread, goal, seconds=4)
    start.current.kill()
    start.current.wait(timeout=10)
    time.sleep(4)
    start()
    # No browser or snapshot request is needed for execution.
    eventually(
        lambda: len(provider.requests),
        lambda n: any(
            "This is an internal continuation" in str(r) for r in provider.requests[-2:]
        ),
    )
    final = eventually(
        lambda: snapshot(call, thread)["goals"][0],
        lambda g: (
            len(g["units"]) > len(scheduled["units"])
            and g["status"] == "waiting"
            and all(u["settled"] for u in g["units"])
        ),
    )
    count = len(provider.requests)
    time.sleep(6)
    assert len(provider.requests) == count
    start.current.kill()
    start.current.wait(timeout=10)
    start()
    assert snapshot(call, thread)["goals"][0]["units"] == final["units"]
    with sqlite3.connect(root / "state/state.db") as db:
        rows = db.execute(
            "SELECT status,run_id FROM nma_triggers WHERE definition_id=?",
            (final["wake"]["definition_id"],),
        ).fetchall()
        assert len(rows) == 1 and rows[0][1]
        assert db.execute("PRAGMA foreign_key_check").fetchall() == []


def test_heartbeat_clock_coalesces_and_pause_survives(runtime):
    root, provider, call, start, *_ = runtime
    thread = dm(call, "wake-heartbeat")
    goal = begin(call, thread)
    scheduled = schedule(call, thread, goal, "heartbeat")
    start.current.kill()
    start.current.wait(timeout=10)
    with sqlite3.connect(root / "state/state.db") as db:
        due = db.execute(
            "SELECT next_at FROM nma_trigger_definitions WHERE goal_id=?",
            (goal["goal_id"],),
        ).fetchone()[0]
        wakes = Wakes(SimpleNamespace(owner=OWNER))
        wakes.collect(db, due - 1)
        assert (
            db.execute(
                "SELECT count(*) FROM nma_triggers WHERE definition_id=?",
                (scheduled["wake"]["definition_id"],),
            ).fetchone()[0]
            == 0
        )
        wakes.collect(db, due + 3600)
        wakes.collect(db, due + 7200)
        assert (
            db.execute(
                "SELECT count(*) FROM nma_triggers WHERE definition_id=?",
                (scheduled["wake"]["definition_id"],),
            ).fetchone()[0]
            == 1
        )
        # Keep it future in wall-clock time until pause is accepted.
    start()
    call(command("goal.pause", {"goal_id": goal["goal_id"]}))
    start.current.kill()
    start.current.wait(timeout=10)
    with sqlite3.connect(root / "state/state.db") as db:
        Wakes(SimpleNamespace(owner=OWNER)).collect(db, due + 86400)
        assert (
            db.execute(
                "SELECT state FROM nma_trigger_definitions WHERE goal_id=?",
                (goal["goal_id"],),
            ).fetchone()[0]
            == "paused"
        )
        assert (
            db.execute(
                "SELECT count(*) FROM nma_triggers WHERE definition_id=? AND status='pending'",
                (scheduled["wake"]["definition_id"],),
            ).fetchone()[0]
            == 0
        )
    start()
    assert snapshot(call, thread)["goals"][0]["status"] == "paused"
    provider.goal_script = None


def force_due(root, goal_id):
    with sqlite3.connect(root / "state/state.db") as db:
        db.execute(
            "UPDATE nma_trigger_definitions SET next_at=? WHERE goal_id=?",
            (time.time() - 3600, goal_id),
        )


@pytest.mark.parametrize(
    "fault",
    [
        "before_continuation_commit",
        "after_continuation_commit",
        "after_goal_card",
        "after_goal_admission",
    ],
)
def test_wake_crash_boundaries_keep_one_identity(runtime, fault):
    root, provider, call, start, *_ = runtime
    provider.goal_script = None
    thread = dm(call, "wake-" + fault)
    goal = begin(call, thread)
    continuation_script(provider, goal["goal_id"])
    schedule(call, thread, goal, seconds=120)
    start.current.kill()
    start.current.wait(timeout=10)
    (root / "fault-fired").unlink(missing_ok=True)
    start(fault)
    force_due(root, goal["goal_id"])
    eventually(lambda: start.current.poll(), lambda code: code is not None)
    start()
    final = eventually(
        lambda: snapshot(call, thread)["goals"][0],
        lambda g: (
            any(u["parent_run_id"] for u in g["units"])
            and all(u["settled"] for u in g["units"])
        ),
    )
    with sqlite3.connect(root / "state/state.db") as db:
        rows = db.execute(
            "SELECT trigger_id,run_id FROM nma_triggers WHERE definition_id=?",
            (final["wake"]["definition_id"],),
        ).fetchall()
        assert len(rows) == 1 and rows[0][1]
        assert len([u for u in final["units"] if u["parent_run_id"]]) == 1
        assert (
            db.execute(
                "SELECT count(*) FROM nma_adapter_runs WHERE run_id=?", (rows[0][1],)
            ).fetchone()[0]
            == 1
        )
    provider.goal_script = None


def test_user_input_defers_heartbeat_and_interrupts_wake(runtime):
    from test_direct_messages import send
    from test_runtime import settle

    root, provider, call, _start, *_ = runtime
    provider.goal_script = None
    provider.blocked.clear()
    provider.release.clear()
    thread = dm(call, "wake-priority")
    goal = begin(call, thread)
    schedule(call, thread, goal, "heartbeat")
    human = call(send(thread, "BLOCK_STARTED"))["result"]
    assert provider.blocked.wait(10)
    force_due(root, goal["goal_id"])
    count = len(provider.requests)
    time.sleep(6)
    assert len(provider.requests) == count
    with sqlite3.connect(root / "state/state.db") as db:
        assert (
            db.execute(
                "SELECT count(*) FROM nma_triggers WHERE definition_id=(SELECT definition_id FROM nma_trigger_definitions WHERE goal_id=?) AND status='pending'",
                (goal["goal_id"],),
            ).fetchone()[0]
            == 1
        )
    wake_started, wake_release = threading.Event(), threading.Event()
    continuation_script(provider, goal["goal_id"])
    respond = provider.goal_script

    def hold_wake(body, _text):
        # The generic fixture strips text before the last blank line for its
        # simple command probes. Native heartbeat instructions contain blank
        # lines, so inspect the actual model input for this behavioral probe.
        text = next(
            m["content"] for m in reversed(body["messages"]) if m["role"] == "user"
        )
        if "This is an internal continuation" in text:
            wake_started.set()
            wake_release.wait(30)
        return respond(body, text)

    # Install the next-turn behavior before releasing the user turn. Separate
    # gates prevent a fast gateway from consuming the wake with a default reply.
    provider.goal_script = hold_wake
    provider.release.set()
    settle(call, human["run_id"])
    assert wake_started.wait(15)
    newer = call(send(thread, "USER_PRIORITY"))["result"]
    wake_release.set()
    settle(call, newer["run_id"])
    final = snapshot(call, thread)
    assert any(
        m["run_id"] == newer["run_id"] and m["author_kind"] == "agent"
        for m in final["messages"]
    )
    assert not any("RESULT: fuel" in m["content"] for m in final["messages"])
    call(command("goal.pause", {"goal_id": goal["goal_id"]}))
    provider.goal_script = None


def test_definition_replacement_and_additive_upgrade(runtime):
    root, provider, call, start, *_ = runtime
    provider.goal_script = None
    thread = dm(call, "wake-migration")
    goal = begin(call, thread)
    first = schedule(call, thread, goal, seconds=120)
    second = schedule(call, thread, first, "interval")
    assert first["wake"]["definition_id"] == second["wake"]["definition_id"]
    assert second["wake"]["revision"] == "2"
    assert int(second["generation"]) == int(first["generation"]) + 1
    paused = call(command("goal.pause", {"goal_id": goal["goal_id"]}))["result"]["goal"]
    assert paused["wake"]["state"] == "paused"
    before = snapshot(call, thread)
    start.current.kill()
    start.current.wait(timeout=10)
    with sqlite3.connect(root / "state/state.db") as db:
        checksums = db.execute(
            "SELECT version,checksum FROM nma_schema_migrations WHERE version<=8 ORDER BY version"
        ).fetchall()
        db.execute("DROP TABLE nma_discussion_goals")
        db.execute("DROP TABLE nma_discussion_turns")
        db.execute("DROP TABLE nma_discussions")
        db.execute("DELETE FROM nma_schema_migrations WHERE version=11")
        db.execute("DROP TABLE nma_webhook_events")
        db.execute("DROP TABLE nma_webhook_batches")
        db.execute("DROP TABLE nma_triggers")
        db.execute("DROP TABLE nma_trigger_definitions")
        db.execute("DELETE FROM nma_schema_migrations WHERE version>=9")
        db.execute("UPDATE nma_partition SET schema_version=8")
    start()
    after = snapshot(call, thread)
    before["goals"][0]["wake"] = None
    assert after["messages"] == before["messages"]
    assert after["goals"] == before["goals"]
    with sqlite3.connect(root / "state/state.db") as db:
        assert (
            db.execute(
                "SELECT version,checksum FROM nma_schema_migrations WHERE version<=8 ORDER BY version"
            ).fetchall()
            == checksums
        )
        assert (
            db.execute("SELECT schema_version FROM nma_partition").fetchone()[0] == 11
        )
        assert db.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
        assert db.execute("PRAGMA foreign_key_check").fetchall() == []


def test_rejected_binding_blocks_watch_without_replay(runtime):
    from ngertiin_engine.agents import Agents
    from ngertiin_engine.goal_lifecycle import Lifecycle
    from ngertiin_engine.goals import Goals
    from ngertiin_engine.reliability import Reliability
    from ngertiin_engine.threads import Threads

    root, provider, call, start, *_ = runtime
    provider.goal_script = None
    thread = dm(call, "wake-binding-refused")
    goal = begin(call, thread)
    schedule(call, thread, goal, seconds=120)
    start.current.kill()
    start.current.wait(timeout=10)
    force_due(root, goal["goal_id"])
    with sqlite3.connect(root / "state/state.db") as db:
        store = SimpleNamespace(owner=OWNER, write=lambda operation: operation(db))
        agents = Agents(store, {})

        def refused(_payload):
            raise EngineError("ACCESS_REVOKED")

        adapter = SimpleNamespace(
            store=store,
            goals=Goals(store),
            agents=agents,
            threads=Threads(store, agents),
            binding=refused,
            reliability=Reliability(store),
        )
        bridge = SimpleNamespace(lifecycle=Lifecycle(store))
        Wakes(store).prepare(adapter, bridge, time.time())
        assert db.execute(
            "SELECT status,progress FROM nma_goal_lifecycle WHERE goal_id=?",
            (goal["goal_id"],),
        ).fetchone() == ("blocked", "ACCESS_REVOKED")
        assert (
            db.execute(
                "SELECT status FROM nma_triggers WHERE definition_id=(SELECT definition_id FROM nma_trigger_definitions WHERE goal_id=?)",
                (goal["goal_id"],),
            ).fetchone()[0]
            == "rejected"
        )
    count = len(provider.requests)
    start()
    time.sleep(6)
    assert len(provider.requests) == count
    assert snapshot(call, thread)["goals"][0]["wake"]["state"] == "paused"
