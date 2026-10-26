"""Revocation and ambiguous external effects at the real gateway dispatch boundary."""

import json
import os
import sqlite3
import tempfile
from pathlib import Path

import pytest
from test_capabilities import capability_agent
from test_direct_messages import send, snapshot
from test_goal_lifecycle import eventually
from test_runtime import command, settle
from test_runtime import runtime as native_runtime


@pytest.fixture(scope="module")
def runtime(tmp_path_factory):
    root = Path(tempfile.mkdtemp(prefix="nma-actuator-"))
    (root / "calls").touch()
    script = root / "actuator.py"
    script.write_text("""import json,sys,time
from pathlib import Path
root=Path(__file__).parent
request=json.load(sys.stdin)
with (root/'calls').open('a') as f: f.write(json.dumps(request)+'\\n')
if request['operation']=='receipt':
 receipt=root/('receipt-'+request['receipt_operation_id'])
 print(receipt.read_text() if receipt.exists() else json.dumps({'outcome':'indeterminate'}))
 sys.exit(0)
mode=request.get('action',{}).get('description','')
if mode=='block':
 (root/'started').touch()
 until=time.monotonic()+30
 while not (root/'release').exists() and time.monotonic()<until: time.sleep(.05)
if mode=='unknown': sys.exit(1)
print(json.dumps({'resource_id':'private-provider-id','observation':{'title':'PRIVATE_BROWSER_CANARY'}}))
""")
    previous = os.environ.get("NMA_TEST_COMPUTER_COMMAND")
    os.environ["NMA_TEST_COMPUTER_COMMAND"] = json.dumps(
        [os.environ.get("NMA_TEST_RUNTIME_PYTHON", "python3"), str(script)]
    )
    generator = native_runtime.__wrapped__(tmp_path_factory)
    state = next(generator)
    try:
        yield (*state, root)
    finally:
        next(generator, None)
        if previous is None:
            os.environ.pop("NMA_TEST_COMPUTER_COMMAND", None)
        else:
            os.environ["NMA_TEST_COMPUTER_COMMAND"] = previous


def setup(runtime, handle):
    root, provider, call, *_ = runtime
    (root / "capabilities.json").write_text(
        json.dumps(
            {"tool_grants": {"browser": {"enabled": True, "toolset": "nma_computer"}}}
        )
    )
    agent = capability_agent(call, handle, tool_grants=["browser"])
    thread = call(
        command(
            "thread.create",
            {"kind": "dm", "title": handle, "agent_ids": [agent["agent_id"]]},
        )
    )["result"]["thread"]

    def script(body, text):
        if not body.get("messages"):
            return None
        if body["messages"][-1]["role"] == "tool":
            return {"role": "assistant", "content": body["messages"][-1]["content"]}
        if text.startswith("BROWSER:"):
            return {
                "role": "assistant",
                "content": None,
                "tool_calls": [
                    {
                        "id": "browser-test",
                        "type": "function",
                        "function": {
                            "name": "computer",
                            "arguments": json.dumps(
                                {"operation": "observe"}
                                if text == "BROWSER:observe"
                                else {
                                    "operation": "act",
                                    "action": {
                                        "kind": "navigate",
                                        "url": "https://example.com",
                                        "description": text.split(":")[1],
                                    },
                                }
                            ),
                        },
                    }
                ],
            }
        return None

    provider.goal_script = script
    return agent, thread


def test_active_revoke_fences_browser_result(runtime):
    _, provider, call, _, *_, actuator = runtime
    agent, thread = setup(runtime, "active-browser-revoke")
    request = call(send(thread, "BROWSER:block"))["result"]
    eventually(lambda: (actuator / "started").exists(), bool)
    disabled = command("agent.disable", {"agent_id": agent["agent_id"]})
    disabled["expected_revision"] = agent["revision"]
    assert "result" in call(disabled)
    (actuator / "release").touch()
    settle(call, request["run_id"], "cancelled")
    final = snapshot(call, thread)
    assert "PRIVATE_BROWSER_CANARY" not in json.dumps(final)
    provider.goal_script = None


def test_unknown_action_keeps_evidence_while_safe_observation_continues(runtime):
    root, provider, call, _start, *_, actuator = runtime
    _, thread = setup(runtime, "observed-browser-failure")
    before = len((actuator / "calls").read_text().splitlines())
    request = call(send(thread, "BROWSER:unknown"))["result"]
    settle(call, request["run_id"], "indeterminate")
    # The answer remains in completed conversation history; action uncertainty
    # is independently visible and is not converted to proof of rejection.
    assert "INDETERMINATE" in json.dumps(snapshot(call, thread)["messages"])
    with sqlite3.connect(root / "state/state.db") as db:
        effects = db.execute(
            "SELECT status,receipt FROM nma_effects WHERE run_id=?",
            (request["run_id"],),
        ).fetchall()
        assert len(effects) == 1
        assert effects[0][0] == "dispatching"
        assert "INDETERMINATE" in effects[0][1]
        assert (
            db.execute(
                "SELECT COUNT(*) FROM nma_effects WHERE run_id=? AND status='dispatching'",
                (request["run_id"],),
            ).fetchone()[0]
            == 1
        )
    # Safe observation is available even while the original mutation is unknown.
    recovered = call(send(thread, "BROWSER:observe"))["result"]
    settle(call, recovered["run_id"], "succeeded")
    assert len((actuator / "calls").read_text().splitlines()) == before + 2
    blocked = call(send(thread, "BROWSER:another-mutation"))["result"]
    settle(call, blocked["run_id"], "succeeded")
    assert len((actuator / "calls").read_text().splitlines()) == before + 2
    unresolved = call(
        command("computer.reconcile", {"thread_id": thread["thread_id"]})
    )["result"]
    assert unresolved == {
        "thread_id": thread["thread_id"],
        "reconciled": 0,
        "unresolved": 1,
    }
    provider.goal_script = None


def test_lost_outcome_blocks_until_reconciled(runtime):
    root, provider, call, start, *_, actuator = runtime
    _, thread = setup(runtime, "lost-browser-effect")
    before = len((actuator / "calls").read_text().splitlines())
    (actuator / "started").unlink(missing_ok=True)
    (actuator / "release").unlink(missing_ok=True)
    request = call(send(thread, "BROWSER:block"))["result"]

    def pending():
        with sqlite3.connect(root / "state/state.db") as db:
            return (
                db.execute(
                    "SELECT COUNT(*) FROM nma_effects WHERE run_id=? AND status='dispatching'",
                    (request["run_id"],),
                ).fetchone()[0]
                > 0
            )

    eventually(pending, bool)
    # The engine dies mid-dispatch, so nobody observes the attempt's outcome.
    start.current.kill()
    start.current.wait(timeout=10)
    (actuator / "release").touch()
    start()
    settle(call, request["run_id"], "indeterminate")
    with sqlite3.connect(root / "state/state.db") as db:
        pending = db.execute(
            "SELECT COUNT(*) FROM nma_effects WHERE run_id=? AND status='dispatching'",
            (request["run_id"],),
        ).fetchone()[0]
    assert pending == 1
    # A new mutation is refused without dispatch; safe observation remains usable.
    for _ in range(2):
        fresh = call(send(thread, "BROWSER:new-mutation"))["result"]
        settle(call, fresh["run_id"], "succeeded")
    assert len((actuator / "calls").read_text().splitlines()) == before + 1
    with sqlite3.connect(root / "state/state.db") as db:
        pending = db.execute(
            "SELECT COUNT(*) FROM nma_effects WHERE run_id=? AND status='dispatching'",
            (request["run_id"],),
        ).fetchone()[0]
    assert pending == 1
    # A late durable provider receipt settles the original operation without replay.
    with sqlite3.connect(root / "state/state.db") as db:
        operation = db.execute(
            "SELECT provider_operation_id FROM nma_effect_outcomes WHERE run_id=?",
            (request["run_id"],),
        ).fetchone()[0]
    (actuator / ("receipt-" + operation)).write_text(
        json.dumps(
            {
                "outcome": "completed",
                "execution": {"clicked": True},
                "receipt_ref": operation,
            }
        )
    )
    resolved = call(command("computer.reconcile", {"thread_id": thread["thread_id"]}))[
        "result"
    ]
    assert resolved["reconciled"] == 1
    recovered = call(send(thread, "BROWSER:observe"))["result"]
    settle(call, recovered["run_id"], "succeeded")
    # Receipt observation and a fresh safe observation each invoke the actuator once.
    assert len((actuator / "calls").read_text().splitlines()) == before + 3
    provider.goal_script = None


def test_confirmed_guard_rejection_reconciles_only_matching_receipt(runtime):
    root, provider, call, _start, *_, actuator = runtime
    _, thread = setup(runtime, "guard-receipt-recovery")
    before = len((actuator / "calls").read_text().splitlines())
    request = call(send(thread, "BROWSER:unknown"))["result"]
    settle(call, request["run_id"], "indeterminate")
    with sqlite3.connect(root / "state/state.db") as db:
        operation = db.execute(
            "SELECT provider_operation_id FROM nma_effect_outcomes WHERE run_id=?",
            (request["run_id"],),
        ).fetchone()[0]
    receipt = {
        "outcome": "rejected",
        "execution": {"outcome": "not_dispatched"},
        "receipt_ref": "unrelated-operation",
    }
    path = actuator / ("receipt-" + operation)
    path.write_text(json.dumps(receipt))

    def query():
        return call(command("computer.reconcile", {"thread_id": thread["thread_id"]}))[
            "result"
        ]

    assert query()["unresolved"] == 1
    receipt["receipt_ref"] = operation
    path.write_text(json.dumps(receipt))
    assert query() == {
        "thread_id": thread["thread_id"],
        "reconciled": 1,
        "unresolved": 0,
    }
    with sqlite3.connect(root / "state/state.db") as db:
        assert (
            db.execute(
                "SELECT status FROM nma_effects WHERE run_id=?", (request["run_id"],)
            ).fetchone()[0]
            == "confirmed"
        )
    fresh = call(send(thread, "BROWSER:repaired-action"))["result"]
    settle(call, fresh["run_id"], "succeeded")
    calls = [
        json.loads(line)
        for line in (actuator / "calls").read_text().splitlines()[before:]
    ]
    assert [item["operation"] for item in calls] == ["act", "receipt", "receipt", "act"]
    assert calls[-1]["action"]["description"] == "repaired-action"
    provider.goal_script = None
