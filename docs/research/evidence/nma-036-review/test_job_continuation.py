"""Independent gateway reproduction of scheduled route continuation fidelity."""
from test_connections import providers
from test_runtime import runtime
from test_goal_lifecycle import begin
from test_goals import act
from test_direct_messages import snapshot
from ngertiin_engine.wakes import utc

def test_job_route_survives_linked_continuation(runtime, providers):
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
    from test_goal_lifecycle import continuation_script
    continuation_script(providers[0], goal["goal_id"], verdict="continue")
    continuation_script(primary, goal["goal_id"], verdict="wait")
    before = len(primary.requests)
    eventually(lambda: len(providers[0].requests), lambda n: n > 0, timeout=30)
    eventually(lambda: snapshot(call, thread)["goals"][0],
               lambda g: len(g["units"]) >= 4 and all(u["settled"] for u in g["units"]), timeout=30)
    requests = json.dumps(providers[0].requests)
    assert "JOB_SELECTED_SKILL_MARKER" in requests
    assert "JOB_CONTEXT_MARKER" in requests
    assert all(r["model"] == "test-model" for r in providers[0].requests)
    assert len(primary.requests) == before
