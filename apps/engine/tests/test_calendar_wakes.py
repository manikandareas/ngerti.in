"""Calendar occurrence contracts through the existing durable wake authority."""

# ruff: noqa: F811
import sqlite3
from datetime import UTC, datetime
from types import SimpleNamespace

import pytest
from ngertiin_engine.contracts import EngineError
from ngertiin_engine.wakes import Wakes, configuration, next_time, utc
from test_connections import providers  # noqa: F401
from test_direct_messages import dm, snapshot
from test_goal_lifecycle import begin
from test_goals import act
from test_runtime import OWNER, runtime  # noqa: F401


def stamp(value):
    return datetime.fromisoformat(value).timestamp()


def calendar(zone="America/New_York", expression="0 9 * * *"):
    return {
        "kind": "cron",
        "timezone": zone,
        "missed_policy": "coalesce",
        "expression": expression,
    }


@pytest.mark.parametrize(
    "base,expected",
    [
        ("2026-03-07T14:00:00Z", "2026-03-08T13:00:00Z"),
        ("2026-10-31T13:00:00Z", "2026-11-01T14:00:00Z"),
    ],
)
def test_calendar_keeps_local_hour_across_dst(base, expected):
    config, due = configuration(calendar(), stamp(base))
    assert due == stamp(expected)
    assert next_time(config, stamp(base)) == due
    # Another job's timezone must not inherit the first job's zone.
    _, makassar = configuration(calendar("Asia/Makassar"), stamp(base))
    assert datetime.fromtimestamp(makassar, UTC).hour == 1


def test_fold_is_strictly_future_and_invalid_calendar_is_rejected():
    cfg = calendar(expression="* * * * *")
    assert next_time(cfg, stamp("2026-11-01T06:30:00Z")) == stamp(
        "2026-11-01T06:31:00Z"
    )
    for expression in ("invalid", "* * * * * *", "0 25 * * *", "0 9 31 2 *", None):
        with pytest.raises(EngineError, match="INVALID_WAKE_CONFIGURATION"):
            configuration(
                calendar(expression=expression), stamp("2026-01-01T00:00:00Z")
            )


def test_calendar_restart_coalesces_one_occurrence_and_stop_fences(runtime):
    root, _, call, start, *_ = runtime
    thread = dm(call, "calendar")
    goal = begin(call, thread)
    act(
        call,
        thread,
        action="schedule",
        goal_id=goal["goal_id"],
        expected_revision=goal["revision"],
        wake=calendar("Asia/Makassar"),
    )
    goal = snapshot(call, thread)["goals"][0]
    start.current.kill()
    start.current.wait(timeout=10)
    with sqlite3.connect(root / "state/state.db") as db:
        due = db.execute(
            "SELECT next_at FROM nma_trigger_definitions WHERE goal_id=?",
            (goal["goal_id"],),
        ).fetchone()[0]
        wakes = Wakes(SimpleNamespace(owner=OWNER))
        wakes.collect(db, due - 1)
        assert db.execute("SELECT count(*) FROM nma_triggers").fetchone()[0] == 0
        wakes.collect(db, due + 86400 * 30)
        wakes.collect(db, due + 86400 * 31)
        assert db.execute("SELECT count(*) FROM nma_triggers").fetchone()[0] == 1
        assert db.execute("PRAGMA foreign_key_check").fetchall() == []
    start()
    act(call, thread, action="stop", goal_id=goal["goal_id"])
    start.current.kill()
    start.current.wait(timeout=10)
    start()
    stopped = snapshot(call, thread)["goals"][0]
    assert stopped["status"] == "stopped"
    assert stopped["wake"]["state"] == "paused"
    with sqlite3.connect(root / "state/state.db") as db:
        Wakes(SimpleNamespace(owner=OWNER)).collect(db, due + 86400 * 60)
        assert (
            db.execute(
                "SELECT count(*) FROM nma_triggers WHERE status='pending'"
            ).fetchone()[0]
            == 0
        )


def test_run_now_keeps_calendar_and_rejects_stopped_goal(runtime):
    from test_goal_lifecycle import continuation_script, eventually

    _, provider, call, *_ = runtime
    thread = dm(call, "calendar-run-now")
    goal = begin(call, thread)
    continuation_script(provider, goal["goal_id"])
    act(
        call,
        thread,
        action="schedule",
        goal_id=goal["goal_id"],
        expected_revision=goal["revision"],
        wake=calendar("Asia/Makassar"),
    )
    scheduled = snapshot(call, thread)["goals"][0]
    act(
        call,
        thread,
        action="run_now",
        goal_id=goal["goal_id"],
        expected_revision=scheduled["revision"],
    )
    final = eventually(
        lambda: snapshot(call, thread)["goals"][0],
        lambda g: (
            len(g["units"]) > len(scheduled["units"]) + 1
            and g["status"] == "waiting"
            and all(u["settled"] for u in g["units"])
        ),
    )
    assert final["wake"]["configuration"] == scheduled["wake"]["configuration"]
    assert stamp(final["wake"]["next_at"]) > datetime.now(UTC).timestamp()
    act(call, thread, action="stop", goal_id=goal["goal_id"])
    stopped = snapshot(call, thread)["goals"][0]
    act(
        call,
        thread,
        action="run_now",
        goal_id=goal["goal_id"],
        expected_revision=stopped["revision"],
    )
    assert snapshot(call, thread)["goals"][0] == stopped


def test_schedule_pause_resume_preserves_definition(runtime):
    from test_wakes import schedule

    _, _, call, start, *_ = runtime
    thread = dm(call, "schedule-controls")
    goal = begin(call, thread)
    goal = schedule(call, thread, goal, "interval")
    identity = goal["wake"]["definition_id"]
    settings = goal["wake"]["configuration"]
    act(
        call,
        thread,
        action="pause_schedule",
        goal_id=goal["goal_id"],
        expected_revision=goal["revision"],
    )
    paused = snapshot(call, thread)["goals"][0]
    assert paused["status"] == "waiting" and paused["wake"]["state"] == "paused"
    act(
        call,
        thread,
        action="pause_schedule",
        goal_id=goal["goal_id"],
        expected_revision=paused["revision"],
    )
    assert snapshot(call, thread)["goals"][0] == paused
    start.current.kill()
    start.current.wait(timeout=10)
    start()
    act(
        call,
        thread,
        action="resume_schedule",
        goal_id=goal["goal_id"],
        expected_revision=paused["revision"],
    )
    resumed = snapshot(call, thread)["goals"][0]
    assert resumed["wake"]["state"] == "enabled"
    assert resumed["wake"]["definition_id"] == identity
    assert resumed["wake"]["configuration"] == settings
    act(
        call,
        thread,
        action="resume_schedule",
        goal_id=goal["goal_id"],
        expected_revision=resumed["revision"],
    )
    assert snapshot(call, thread)["goals"][0] == resumed


def test_session_recurrence_does_not_survive_restart(runtime):
    _, _, call, start, *_ = runtime
    thread = dm(call, "session-recurrence")
    goal = begin(call, thread)
    act(
        call,
        thread,
        action="schedule",
        goal_id=goal["goal_id"],
        expected_revision=goal["revision"],
        wake={
            **calendar("UTC"),
            "job": {
                "mode": "model",
                "lifetime": "session",
                "context": "Check only during this session",
            },
        },
    )
    goal = snapshot(call, thread)["goals"][0]
    assert goal["wake"]["state"] == "enabled"
    start.current.kill()
    start.current.wait(timeout=10)
    start()
    from test_goal_lifecycle import eventually

    final = eventually(
        lambda: snapshot(call, thread)["goals"][0],
        lambda g: g["wake"]["state"] == "paused",
    )
    assert final["wake"]["next_at"] is None


def test_native_blueprint_fill_has_no_external_registration():
    from ngertiin_engine.automation import blueprint

    args = {
        "action": "instantiate_blueprint",
        "goal_id": "unused",
        "expected_revision": "1",
        "blueprint": "morning-brief",
        "timezone": "Asia/Makassar",
        "values": {"time": "09:30", "deliver": "origin"},
    }
    result = blueprint(args)
    assert result["wake"]["kind"] == "cron"
    assert result["wake"]["expression"].startswith("30 9 ")
    assert result["wake"]["job"]["mode"] == "model"
    with pytest.raises(EngineError, match="EXTERNAL_DELIVERY_UNAVAILABLE"):
        blueprint({**args, "values": {"time": "09:30", "deliver": "email"}})


def test_job_specific_model_skill_and_context_use_owner_route(runtime, providers):
    import json
    import time

    from test_capabilities import capability_agent
    from test_connections import connect
    from test_goal_lifecycle import eventually
    from test_runtime import command

    root, primary, call, *_ = runtime
    connection, _ = connect(call, providers[0], "Calendar job model")
    (root / "capabilities.json").write_text(
        json.dumps(
            {
                "skill_refs": {
                    "daily": {"enabled": True, "content": "JOB_SELECTED_SKILL_MARKER"}
                }
            }
        )
    )
    agent = capability_agent(call, "job-specific-route", skill_refs=["daily"])
    thread = call(
        command(
            "thread.create",
            {"kind": "dm", "title": "Job route", "agent_ids": [agent["agent_id"]]},
        )
    )["result"]["thread"]
    goal = begin(call, thread)
    act(
        call,
        thread,
        action="schedule",
        goal_id=goal["goal_id"],
        expected_revision=goal["revision"],
        wake={
            "kind": "once",
            "timezone": "UTC",
            "missed_policy": "coalesce",
            "at": utc(time.time() + 5),
            "job": {
                "mode": "model",
                "model": connection + ":test-model",
                "skills": ["daily"],
                "context": "JOB_CONTEXT_MARKER",
            },
        },
    )
    before = len(primary.requests)
    eventually(lambda: len(providers[0].requests), lambda n: n > 0, timeout=30)
    requests = json.dumps(providers[0].requests)
    assert "JOB_SELECTED_SKILL_MARKER" in requests
    assert "JOB_CONTEXT_MARKER" in requests
    assert all(r["model"] == "test-model" for r in providers[0].requests)
    assert len(primary.requests) == before
