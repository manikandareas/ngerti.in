"""Public DM commands, real HTTP/SSE and real pinned gateway restart contracts."""

# ruff: noqa: F811
import json
import os
import socket
import sqlite3
import subprocess
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from uuid import uuid4

import pytest
from test_runtime import OWNER, command, runtime, settle  # noqa: F401
from test_threads import create_agent


def dm(call, handle):
    agent = create_agent(call, handle)
    thread = call(
        command(
            "thread.create",
            {"kind": "dm", "title": handle, "agent_ids": [agent["agent_id"]]},
        )
    )["result"]["thread"]
    return thread


def send(thread, text):
    return command(
        "message.send",
        {
            "thread_id": thread["thread_id"],
            "text": text,
            "attachment_ids": [],
            "request_key": str(uuid4()),
            "expected_membership_revision": "1",
        },
    )


def snapshot(call, thread):
    value = call(command("thread.snapshot", {"thread_id": thread["thread_id"]}))
    assert "result" in value, value
    return value["result"]


def test_parallel_dm_history_replay_restart_and_dedup(runtime):
    _, provider, call, start, *_ = runtime
    a, b = dm(call, "dm-alpha"), dm(call, "dm-beta")
    before = len(provider.requests)
    sends = [send(a, "PRIVATE_ALPHA"), send(b, "PRIVATE_BETA")]
    with ThreadPoolExecutor() as pool:
        results = list(pool.map(call, sends))
    for thread, result in zip((a, b), results):
        assert result["result"]["agent_id"] == thread["dm_agent_id"]
        settle(call, result["result"]["run_id"])
        snap = snapshot(call, thread)
        assert [m["author_kind"] for m in snap["messages"]] == ["user", "agent"]
        assert snap["messages"][1]["author_agent_id"] == thread["dm_agent_id"]
    requests = provider.requests[before:]
    assert not any(
        "PRIVATE_ALPHA" in json.dumps(r) and "PRIVATE_BETA" in json.dumps(r)
        for r in requests
    )
    baseline = snapshot(call, a)
    replay_command = command(
        "thread.events",
        {
            "thread_id": a["thread_id"],
            "replay_epoch": baseline["replay_epoch"],
            "last_sequence": "0",
        },
    )
    replay = call(replay_command)
    assert (
        len([e for e in replay["result"]["events"] if e["type"] == "message.created"])
        == 2
    )
    start.current.kill()
    start.current.wait(timeout=10)
    start()
    assert snapshot(call, a) == baseline
    assert call(replay_command) == replay
    retry = call(sends[0])["result"]
    assert retry.pop("duplicate") is True
    assert retry == results[0]["result"]
    alias = {**sends[0], "command_id": str(uuid4())}
    assert call(alias)["result"]["run_id"] == retry["run_id"]
    conflict = {
        **alias,
        "command_id": str(uuid4()),
        "payload": {**alias["payload"], "text": "CHANGED"},
    }
    assert call(conflict)["error"]["code"] == "COMMAND_CONFLICT"
    assert len(provider.requests) == before + 2
    settle(call, call(send(a, "FOLLOW_UP"))["result"]["run_id"])
    request = json.dumps(provider.requests[-1])
    assert "PRIVATE_ALPHA" in request and "PRIVATE_BETA" not in request
    assert (
        sum(m.get("content") == "FOLLOW_UP" for m in provider.requests[-1]["messages"])
        == 1
    )


def test_final_response_recorded_despite_unresolved_effect(runtime):
    root, _provider, call, _start, *_ = runtime
    thread = dm(call, "dm-unresolved-effect")
    result = settle(
        call, call(send(thread, "RECORD_DELIVERY_PROOF"))["result"]["run_id"]
    )
    # Snapshot traffic is what drives the transcript recording pass.
    baseline = snapshot(call, thread)
    assert any(
        m["author_kind"] == "agent" and "RECORD_DELIVERY_PROOF" in m["content"]
        for m in baseline["messages"]
    )
    with sqlite3.connect(root / "state/state.db") as db:
        agent_message = db.execute(
            "SELECT message_id FROM nma_messages WHERE owner_id=? AND run_id=? AND author_kind='agent'",
            (OWNER, result["run_id"]),
        ).fetchone()
        assert agent_message
        # Rebuild the incident shape: the turn completed but one of its tool
        # effects stayed dispatching (as after a lost actuator outcome) and an
        # earlier recording pass withheld the committed response.
        db.execute(
            "DELETE FROM nma_messages WHERE owner_id=? AND message_id=?",
            (OWNER, agent_message[0]),
        )
        db.execute(
            "DELETE FROM nma_context_receipts WHERE owner_id=? AND run_id=?",
            (OWNER, result["run_id"]),
        )
        db.execute(
            "INSERT INTO nma_effects VALUES (?,?,?,?,'dispatching',NULL)",
            (OWNER, result["run_id"], "simulated-lost-operation", "simulated-intent"),
        )
    snap = snapshot(call, thread)
    # The completed turn's answer is part of the conversation record even while
    # the effect is unresolved, and the run still reports the uncertainty.
    assert any(
        m["author_kind"] == "agent" and "RECORD_DELIVERY_PROOF" in m["content"]
        for m in snap["messages"]
    )
    assert any(
        run["run_id"] == result["run_id"] and run["status"] == "indeterminate"
        for run in snap["runs"]
    )
    with sqlite3.connect(root / "state/state.db") as db:
        assert db.execute(
            "SELECT 1 FROM nma_context_receipts WHERE owner_id=? AND run_id=?",
            (OWNER, result["run_id"]),
        ).fetchone()


def test_interrupt_cancel_error_and_rejected_retry(runtime):
    _, provider, call, start, *_ = runtime
    thread = dm(call, "dm-interrupt")
    provider.blocked.clear()
    provider.release.clear()
    first = call(send(thread, "BLOCK_STARTED"))["result"]
    assert provider.blocked.wait(10)
    assert snapshot(call, thread)["messages"][0]["content"] == "BLOCK_STARTED"
    second = call(send(thread, "USER_CORRECTION"))["result"]
    assert snapshot(call, thread)["runs"][0]["status"] == "cancelled"
    provider.release.set()
    settle(call, second["run_id"])
    snap = snapshot(call, thread)
    assert not any(
        m["author_kind"] == "agent" and m["run_id"] == first["run_id"]
        for m in snap["messages"]
    )
    failed = call(send(thread, "FAIL_PROVIDER"))["result"]
    settle(call, failed["run_id"], "failed")
    assert snapshot(call, thread)["runs"][-1]["status"] == "failed"
    provider.blocked.clear()
    provider.release.clear()
    active = call(send(thread, "BLOCK_STARTED"))["result"]
    assert provider.blocked.wait(10)
    cancel = command("run.cancel", {"run_id": active["run_id"]})
    cancelled = call(cancel)
    start.current.kill()
    start.current.wait(timeout=10)
    provider.release.set()
    start()
    assert call(cancel) == cancelled
    assert snapshot(call, thread)["runs"][-1]["status"] == "cancelled"
    invalid = send(thread, "DENIED")
    invalid["payload"]["expected_membership_revision"] = "2"
    denied = call(invalid)
    assert denied["error"]["code"] == "REVISION_CONFLICT"
    assert call(invalid) == denied


@pytest.fixture
def public_api(runtime):
    root, *_ = runtime
    backend = Path(__file__).resolve().parents[2] / "backend"
    python = backend / ".venv/bin/python"
    if not python.exists():
        pytest.skip("Public HTTP acceptance requires the backend environment")
    registry = root / "partitions.json"
    registry.write_text(
        json.dumps(
            {
                OWNER: {
                    "key_file": str(root / "key"),
                    "socket": str(root / "state/nma.sock"),
                }
            }
        )
    )
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    script = root / "http_app.py"
    script.write_text("""import os
from fastapi import FastAPI
from ngertiin.agent_engine.api import router
from ngertiin.agent_engine.stream import router as streams
from ngertiin.accounts.auth import current_account
from ngertiin.models import Account
from uuid import UUID
import uvicorn
app = FastAPI()
app.include_router(router)
app.include_router(streams)
app.dependency_overrides[current_account] = lambda: Account(id=UUID(os.environ["TEST_OWNER"]), clerk_user_id="fixture")
uvicorn.run(app, host="127.0.0.1", port=int(os.environ["TEST_PORT"]), log_level="error")
""")
    log = (root / "http.log").open("w")
    process = subprocess.Popen(
        [str(python), str(script)],
        env={
            **os.environ,
            "PYTHONPATH": str(backend / "src"),
            "NMA_PARTITIONS_FILE": str(registry),
            "NMA_WEBHOOK_ROUTES_FILE": str(root / "webhooks.json"),
            "TEST_OWNER": OWNER,
            "TEST_PORT": str(port),
        },
        stdout=log,
        stderr=log,
    )
    base = f"http://127.0.0.1:{port}/api/agent-engine/v1"

    def request(path, body=None, headers=None):
        data = json.dumps(body).encode() if body is not None else None
        return urlopen(
            Request(
                base + path,
                data=data,
                headers={"Content-Type": "application/json", **(headers or {})},
            ),
            timeout=15,
        )

    try:
        for _ in range(100):
            try:
                request("/agents").close()
                break
            except OSError:
                time.sleep(0.1)
        else:
            pytest.fail((root / "http.log").read_text())
        yield request
    finally:
        process.terminate()
        process.wait(timeout=10)
        log.close()


def test_public_http_sse_reconnect_cancel_and_cursor_validation(runtime, public_api):
    _, _, call, start, *_ = runtime
    request = public_api
    thread = dm(call, "dm-http")
    path = "/threads/" + thread["thread_id"] + "/snapshot"
    initial = json.load(request(path))
    body = send(thread, "HTTP_STREAM_PROOF")
    response = request("/commands", body)
    assert response.status == 202
    receipt = json.load(response)
    settle(call, receipt["run_id"])
    endpoint = "/events?thread_id=" + thread["thread_id"]
    frames = []
    with request(
        endpoint, headers={"Last-Event-ID": initial["through_cursor"]}
    ) as stream:
        current = {}
        while True:
            line = stream.readline().decode().strip()
            if line.startswith("id: "):
                current["id"] = line[4:]
            if line.startswith("data: "):
                current["data"] = json.loads(line[6:])
            if not line and current:
                frames.append(current)
                current = {}
                if (
                    len([f for f in frames if f["data"]["type"] == "message.created"])
                    == 2
                ):
                    break
    ids = [f["data"]["event_id"] for f in frames]
    assert len(ids) == len(set(ids))
    assert all(f["data"]["agent_id"] == thread["dm_agent_id"] for f in frames)
    # Exact reconnect begins after the chosen frame, even across an engine restart.
    start.current.kill()
    start.current.wait(timeout=10)
    start()
    with request(endpoint, headers={"Last-Event-ID": frames[0]["id"]}) as stream:
        while True:
            line = stream.readline().decode().strip()
            if line.startswith("data: "):
                assert json.loads(line[6:])["event_id"] == frames[1]["data"]["event_id"]
                break
    assert request("/commands", body).status == 200
    snap = json.load(request(path))
    assert len(snap["messages"]) == 2
    assert json.load(request("/runs/" + receipt["run_id"]))["status"] == "succeeded"
    assert (
        json.load(request("/commands/" + body["command_id"]))["run_id"]
        == receipt["run_id"]
    )
    for value in ("invalid", initial["through_cursor"] + "bad"):
        with pytest.raises(HTTPError) as error:
            request(endpoint, headers={"Last-Event-ID": value})
        assert error.value.code == 422
    with pytest.raises(HTTPError) as error:
        request("/threads/" + str(uuid4()) + "/snapshot")
    assert error.value.code == 404


@pytest.mark.parametrize("fault", ["after_dm_prepare", "after_native", "after_publish"])
def test_dm_crash_boundaries_preserve_identity_and_user_message(runtime, fault):
    root, provider, call, start, *_ = runtime
    thread = dm(call, "crash-" + fault.replace("_", "-"))
    body = send(thread, "CRASH_" + fault)
    start.current.kill()
    start.current.wait(timeout=10)
    (root / "fault-fired").unlink(missing_ok=True)
    start(fault)
    before = len(provider.requests)
    try:
        call(body)
    except (OSError, ValueError):
        pass
    deadline = time.monotonic() + 15
    while start.current.poll() is None and time.monotonic() < deadline:
        time.sleep(0.05)
    assert start.current.poll() is not None
    assert (root / "fault-fired").exists()
    start()
    result = call(body)["result"]
    deadline = time.monotonic() + 15
    while time.monotonic() < deadline:
        snap = snapshot(call, thread)
        if snap["runs"][0]["status"] in {"succeeded", "indeterminate", "failed"}:
            break
        time.sleep(0.05)
    assert snap["runs"][0]["status"] in {"succeeded", "indeterminate"}
    assert len([m for m in snap["messages"] if m["author_kind"] == "user"]) == 1
    assert snap["messages"][0]["message_id"] == result["message_id"]
    assert len(provider.requests) - before <= 1
    assert call(body)["result"]["run_id"] == result["run_id"]
    if fault in {"after_dm_prepare", "after_publish"}:
        assert snap["runs"][0]["status"] == "succeeded"
        assert len(snap["messages"]) == 2


def test_dm_rejects_target_spoofing_and_scope_cursor(runtime):
    _, _, call, *_ = runtime
    thread = dm(call, "dm-boundary")
    body = send(thread, "VALID")
    for extra in (
        {"agent_id": str(uuid4())},
        {"owner_id": str(uuid4())},
        {"attachment_ids": [str(uuid4())]},
    ):
        invalid = {
            **body,
            "command_id": str(uuid4()),
            "payload": {**body["payload"], **extra},
        }
        assert call(invalid)["error"]["code"] == "INVALID_REQUEST"
        assert call(invalid)["error"]["code"] == "INVALID_REQUEST"
    snap = snapshot(call, thread)
    for epoch, seq, expected in [
        (str(uuid4()), "0", "CURSOR_RESET"),
        (snap["replay_epoch"], "9223372036854775807", "CURSOR_AHEAD"),
    ]:
        assert (
            call(
                command(
                    "thread.events",
                    {
                        "thread_id": thread["thread_id"],
                        "replay_epoch": epoch,
                        "last_sequence": seq,
                    },
                )
            )["error"]["code"]
            == expected
        )
    assert snap["messages"] == []


def test_public_stream_delivers_before_completion_and_disconnect_keeps_run(
    runtime, public_api
):
    _, provider, call, *_ = runtime
    thread = dm(call, "live-stream")
    provider.blocked.clear()
    provider.release.clear()
    response = public_api("/commands", send(thread, "STREAM_PAUSE"))
    receipt = json.load(response)
    assert provider.blocked.wait(10)
    try:
        with public_api("/events?thread_id=" + thread["thread_id"]) as stream:
            while True:
                line = stream.readline().decode().strip()
                if line.startswith("data: "):
                    event = json.loads(line[6:])
                    if event["type"] == "run.delta":
                        assert "RECOVERY_ACK_STREAM_PAUSE" in event["payload"]["text"]
                        break
        assert not provider.release.is_set()
        assert (
            json.load(public_api("/runs/" + receipt["run_id"]))["status"] == "running"
        )
    finally:
        provider.release.set()
    settle(call, receipt["run_id"])
    assert len(snapshot(call, thread)["messages"]) == 2


def test_public_cancel_and_failed_terminal_events(runtime, public_api):
    _, provider, call, *_ = runtime
    thread = dm(call, "http-terminal")
    provider.blocked.clear()
    provider.release.clear()
    receipt = json.load(public_api("/commands", send(thread, "BLOCK_STARTED")))
    assert provider.blocked.wait(10)
    try:
        cancel = command(
            "run.cancel",
            {"run_id": receipt["run_id"], "reason": "User stopped this response"},
        )
        assert json.load(public_api("/commands", cancel))["cancel_requested"]
        with public_api("/events?thread_id=" + thread["thread_id"]) as stream:
            while True:
                line = stream.readline().decode().strip()
                if line.startswith("data: "):
                    event = json.loads(line[6:])
                    if event["type"] == "run.cancelled":
                        assert event["run_id"] == receipt["run_id"]
                        assert event["payload"]["text"] == ""
                        break
    finally:
        provider.release.set()
    error_thread = dm(call, "http-error")
    receipt = json.load(public_api("/commands", send(error_thread, "FAIL_PROVIDER")))
    settle(call, receipt["run_id"], "failed")
    with public_api("/events?thread_id=" + error_thread["thread_id"]) as stream:
        while True:
            line = stream.readline().decode().strip()
            if line.startswith("data: "):
                event = json.loads(line[6:])
                if event["type"] == "run.failed":
                    assert event["payload"]["error_code"] == "RUNTIME_FAILED"
                    break


def test_schema_five_upgrade_preserves_messages_and_replay(runtime):
    import sqlite3

    root, _, call, start, *_ = runtime
    thread = dm(call, "dm-upgrade")
    receipt = call(send(thread, "PRESERVED_UPGRADE"))["result"]
    settle(call, receipt["run_id"])
    before = snapshot(call, thread)
    page = call(
        command(
            "thread.snapshot",
            {
                "thread_id": thread["thread_id"],
                "before_message_seq": before["messages"][1]["message_seq"],
            },
        )
    )["result"]
    assert page["messages"] == before["messages"][:1]
    start.current.kill()
    start.current.wait(timeout=10)
    # Reconstruct the predecessor with existing native/domain rows intact.
    with sqlite3.connect(root / "state/state.db") as db:
        for table in (
            "nma_computers",
            "nma_artifact_grants",
            "nma_artifacts",
            "nma_workspace_operations",
            "nma_discussion_goals",
            "nma_discussion_turns",
            "nma_discussions",
            "nma_webhook_events",
            "nma_webhook_batches",
            "nma_triggers",
            "nma_trigger_definitions",
            "nma_goal_evidence",
            "nma_goal_units",
            "nma_goal_lifecycle",
        ):
            db.execute(f"DROP TABLE {table}")
        db.execute("DROP TABLE nma_goal_operations")
        db.execute("DROP TABLE nma_goals")
        db.execute("DROP TABLE nma_dm_requests")
        db.execute("DELETE FROM nma_schema_migrations WHERE version>=6")
        db.execute("UPDATE nma_partition SET schema_version=5")
    start()
    assert snapshot(call, thread) == before
    with sqlite3.connect(root / "state/state.db") as db:
        assert db.execute("PRAGMA foreign_key_check").fetchall() == []
        assert db.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
