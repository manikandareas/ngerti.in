"""Durable boundaries exercised against the actual owner process and SQLite."""

# ruff: noqa: F811
import json
import sqlite3
from concurrent.futures import ThreadPoolExecutor

from test_runtime import command, runtime, settle, submit  # noqa: F401


def events(call, run_id, epoch=None, sequence="0"):
    return call(
        command(
            "runtime.events",
            {"run_id": run_id, "replay_epoch": epoch, "last_sequence": sequence},
        )
    )["result"]


def test_offline_events_effect_receipts_and_duplicate_admission(runtime):
    root, provider, call, start, *_ = runtime
    body = submit("USE_TOOL")
    with ThreadPoolExecutor(max_workers=6) as pool:
        receipts = list(pool.map(lambda _: call(body), range(12)))
    assert all(r == receipts[0] for r in receipts)
    run_id = receipts[0]["result"]["run_id"]
    settle(call, run_id)
    replay = events(call, run_id)
    assert {
        "run.started",
        "tool.started",
        "tool.completed",
        "message.completed",
        "run.succeeded",
    } <= {e["type"] for e in replay["events"]}
    sequences = [int(e["sequence"]) for e in replay["events"]]
    assert sequences == sorted(set(sequences))
    with sqlite3.connect(root / "state/state.db") as db:
        effects = db.execute(
            "SELECT status,receipt FROM nma_effects WHERE run_id=?", (run_id,)
        ).fetchall()
        # todo_list is an internal agent-loop primitive, not external dispatch.
        assert all(row[0] == "confirmed" for row in effects)
        assert db.execute("PRAGMA foreign_key_check").fetchall() == []
    count = len(provider.requests)
    start.current.kill()
    start.current.wait(timeout=10)
    start()
    assert call(body) == receipts[0]
    assert events(call, run_id, replay["replay_epoch"]) == replay
    assert (
        events(call, run_id, replay["replay_epoch"], replay["last_sequence"])["events"]
        == []
    )
    assert len(provider.requests) == count


import time
from uuid import uuid4

import pytest
from test_threads import create_agent


def fresh_submit(call, text):
    agent = create_agent(call, "fault-" + uuid4().hex[:8])
    return command(
        "runtime.submit",
        {
            "agent_id": agent["agent_id"],
            "thread_id": str(uuid4()),
            "config_revision": "1",
            "context_generation": "1",
            "text": text,
        },
    )


def kill_at(root, start, point):
    start.current.kill()
    start.current.wait(timeout=10)
    (root / "fault-fired").unlink(missing_ok=True)
    start(point)


def lost_call(call, body):
    try:
        call(body)
    except (OSError, ValueError):
        pass


@pytest.mark.parametrize(
    "point",
    [
        "before_admit",
        "after_admit",
        "after_native",
        "after_claim",
        "before_publish",
        "after_publish",
    ],
)
def test_admission_claim_publish_crashes(runtime, point):
    root, provider, call, start, *_ = runtime
    body = fresh_submit(call, "FAULT_" + point)
    kill_at(root, start, point)
    lost_call(call, body)
    deadline = time.monotonic() + 20
    while start.current.poll() is None and time.monotonic() < deadline:
        time.sleep(0.05)
    assert start.current.poll() == -9
    assert (root / "fault-fired").read_text() == point
    calls_before = len(provider.requests)
    start()
    reply = call(body)
    assert "result" in reply, reply
    run_id = reply["result"]["run_id"]
    expected = "indeterminate" if point == "after_claim" else "succeeded"
    result = settle(call, run_id, expected)
    assert call(body) == reply
    replay = events(call, run_id)
    if expected == "succeeded":
        assert sum(e["type"] == "message.completed" for e in replay["events"]) == 1
        assert "FAULT_" + point in result["text"]
        assert (
            sum(
                any(m.get("content") == "FAULT_" + point for m in request["messages"])
                for request in provider.requests
            )
            == 1
        )
    else:
        assert len(provider.requests) == calls_before
    if point in {"before_publish", "after_publish"}:
        assert len(provider.requests) == calls_before


def test_stop_commit_survives_missing_interrupt_delivery(runtime):
    root, provider, call, start, *_ = runtime
    body = fresh_submit(call, "BLOCK_STARTED")
    kill_at(root, start, "after_stop")
    provider.release.clear()
    provider.blocked.clear()
    run_id = call(body)["result"]["run_id"]
    assert provider.blocked.wait(10)
    stop = command("run.cancel", {"run_id": run_id})
    lost_call(call, stop)
    start.current.wait(timeout=10)
    provider.release.set()
    count = len(provider.requests)
    start()
    assert call(stop)["result"]["cancel_requested"]
    settle(call, run_id, "cancelled")
    assert events(call, run_id)["events"] == []
    assert len(provider.requests) == count


import socket
import subprocess
import sys
from pathlib import Path

from test_capabilities import capability_agent


@pytest.fixture
def connector(runtime):
    root, _, call, *_ = runtime
    with socket.socket() as reserve:
        reserve.bind(("127.0.0.1", 0))
        port = reserve.getsockname()[1]
    receipts = root / "effect-receipts.txt"
    receipts.write_text("")
    with (root / "effect-connector.log").open("w") as log:
        process = subprocess.Popen(
            [
                sys.executable,
                str(Path(__file__).with_name("mcp_fixture.py")),
                str(port),
                str(receipts),
            ],
            stdout=log,
            stderr=subprocess.STDOUT,
        )
        try:
            deadline = time.monotonic() + 15
            while time.monotonic() < deadline:
                try:
                    with socket.create_connection(("127.0.0.1", port), timeout=0.1):
                        break
                except OSError:
                    time.sleep(0.05)
            (root / "effect-connector.json").write_text(
                json.dumps(
                    {
                        "type": "http",
                        "name": "fixture",
                        "url": f"http://127.0.0.1:{port}/mcp",
                        "headers": [
                            {
                                "name": "Authorization",
                                "value": "Bearer nma-disposable-connector-secret",
                            }
                        ],
                    }
                )
            )
            (root / "capabilities.json").write_text(
                json.dumps(
                    {
                        "mcp_grants": {
                            "effect": {
                                "enabled": True,
                                "server_file": str(root / "effect-connector.json"),
                            }
                        }
                    }
                )
            )
            agent = capability_agent(
                call, "effect-" + uuid4().hex[:8], mcp_grants=["effect"]
            )
            yield agent, receipts
        finally:
            process.terminate()
            process.wait(timeout=10)


@pytest.mark.parametrize(
    "point", [None, "before_effect", "after_effect", "after_receipt"]
)
def test_external_effect_receipt_or_indeterminate_without_retry(
    runtime, connector, point
):
    root, provider, call, start, *_ = runtime
    agent, receipts = connector
    body = command(
        "runtime.submit",
        {
            "agent_id": agent["agent_id"],
            "thread_id": str(uuid4()),
            "config_revision": "1",
            "context_generation": "1",
            "text": "CALL_TOOL:mcp_fixture_proof",
        },
    )
    discovery = json.loads(json.dumps(body))
    discovery["command_id"] = str(uuid4())
    discovery["payload"]["text"] = "MCP_DISCOVERY"
    settle(call, call(discovery)["result"]["run_id"])
    with sqlite3.connect(root / "state/state.db") as db:
        names = []
        for (value,) in db.execute(
            "SELECT value FROM state_meta WHERE key LIKE 'gateway.local_policy.v1:%'"
        ):
            manifest = json.loads(
                json.loads(value)["policy"].get("editor_mcp_json") or "{}"
            )
            names.extend(
                name for name in manifest.get("schemas", {}) if name.endswith("__proof")
            )
    body["payload"]["text"] = "CALL_TOOL:" + names[-1]
    if point:
        kill_at(root, start, point)
    lost_call(call, body)
    deadline = time.monotonic() + 30
    if point:
        while start.current.poll() is None and time.monotonic() < deadline:
            time.sleep(0.05)
        assert start.current.poll() == -9
        start()
    run_id = call(body)["result"]["run_id"]
    settle(call, run_id, "indeterminate" if point else "succeeded")
    with sqlite3.connect(root / "state/state.db") as db:
        effects = db.execute(
            "SELECT status,receipt FROM nma_effects WHERE run_id=?", (run_id,)
        ).fetchall()
        assert len(effects) == 1
        assert effects[0][0] == (
            "dispatching" if point in {"before_effect", "after_effect"} else "confirmed"
        )
        if not point:
            assert "MCP_PROOF" in effects[0][1]
            assert "nma-disposable-connector-secret" not in effects[0][1]
    count = len(provider.requests)
    expected = "" if point == "before_effect" else "proof\n"
    assert receipts.read_text() == expected
    for _ in range(3):
        call(body)
        events(call, run_id)
    assert len(provider.requests) == count
    assert receipts.read_text() == expected


def test_stale_authority_and_generation_cannot_publish_or_dispatch(runtime):
    from types import SimpleNamespace

    from hermes_state import SessionDB
    from hermes_state_runtime import RuntimeStoreError
    from ngertiin_engine.contracts import EngineError
    from ngertiin_engine.reliability import Reliability
    from ngertiin_engine.store import Store
    from test_runtime import OWNER

    root, provider, call, start, *_ = runtime
    provider.release.clear()
    provider.blocked.clear()
    body = fresh_submit(call, "BLOCK_STARTED")
    run_id = call(body)["result"]["run_id"]
    assert provider.blocked.wait(10)
    db = SessionDB(root / "state/state.db")
    epoch = int(call(command("runtime.describe"))["result"]["authority_epoch"])
    store = Store(SimpleNamespace(db=db, epoch=epoch), OWNER)
    reliability = Reliability(store)
    with sqlite3.connect(root / "state/state.db") as conn:
        admission, generation = conn.execute(
            "SELECT a.admission_id,a.generation FROM session_admissions a JOIN nma_adapter_runs r ON r.native_admission_id=a.admission_id WHERE r.run_id=?",
            (run_id,),
        ).fetchone()
    stamp = {
        "admission_id": admission,
        "execution_generation": generation - 1,
        "authority_epoch": epoch,
    }
    with pytest.raises(EngineError, match="STALE_GENERATION"):
        reliability.publish(stamp, "message.delta", {"text": "STALE"})
    with pytest.raises(EngineError, match="STALE_GENERATION"):
        reliability.tool(
            stamp,
            "external",
            {},
            SimpleNamespace(turn_id="t", tool_call_id="c"),
            lambda: pytest.fail("Stale dispatch"),
        )
    stamp["execution_generation"] = generation
    call(command("run.cancel", {"run_id": run_id}))
    with pytest.raises(EngineError, match="RUN_CANCELLED"):
        reliability.publish(stamp, "message.delta", {"text": "CANCELLED"})
    provider.release.set()
    start.current.kill()
    start.current.wait(timeout=10)
    start()
    with pytest.raises(RuntimeStoreError):
        store.write(
            lambda conn: conn.execute(
                "INSERT INTO nma_events VALUES (?,?,?,?)",
                (OWNER, 999999, str(uuid4()), "{}"),
            )
        )
    db.close()


def test_consistent_snapshot_decimal_cursor_and_validation(runtime):
    from test_runtime import OWNER

    root, _, call, *_ = runtime
    with sqlite3.connect(root / "state/state.db") as db:
        db.execute(
            "INSERT INTO nma_events VALUES (?,?,?,?)",
            (OWNER, 9007199254740992, str(uuid4()), "{}"),
        )
    run_id = call(fresh_submit(call, "BIG_CURSOR"))["result"]["run_id"]
    settle(call, run_id)
    snapshot = call(command("runtime.snapshot", {"run_id": run_id}))["result"]
    assert snapshot["status"] == "succeeded" and "BIG_CURSOR" in snapshot["text"]
    assert int(snapshot["through_sequence"]) > 9007199254740992
    assert (
        events(call, run_id, snapshot["replay_epoch"], snapshot["through_sequence"])[
            "events"
        ]
        == []
    )
    reset = events(call, run_id, str(uuid4()))
    assert reset["snapshot_required"] and reset["events"] == []
    ahead = call(
        command(
            "runtime.events",
            {
                "run_id": run_id,
                "replay_epoch": snapshot["replay_epoch"],
                "last_sequence": str(int(snapshot["through_sequence"]) + 100),
            },
        )
    )
    assert ahead["error"]["code"] == "CURSOR_AHEAD"
