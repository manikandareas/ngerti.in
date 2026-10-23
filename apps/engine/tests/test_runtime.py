"""Contract tests through a real, separately launched Hermes gateway and SQLite."""

import json
import os
import platform
import signal
import socket
import sqlite3
import subprocess
import sys
import tempfile
import time
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from uuid import uuid4

import pytest
from ngertiin_engine.contracts import sign

SOURCE = Path(os.environ["HERMES_SOURCE"]).resolve()
ENGINE = Path(__file__).resolve().parents[1] / "src"
sys.path.insert(0, str(SOURCE))
from tests.gateway.fixtures.local_recovery_probe import (
    ThreadingHTTPServer,
    child_env,
    threading,
)


class Model(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        if body.get("messages"):
            self.server.requests.append(body)
        messages = body.get("messages", [])
        text = next(
            (m.get("content", "") for m in reversed(messages) if m["role"] == "user"),
            "",
        )
        if text == "BLOCK_STARTED":
            self.server.blocked.set()
            self.server.release.wait(60)
        if text == "FAIL_PROVIDER":
            self.send_response(401)
            self.end_headers()
            self.wfile.write(
                b'{"error":{"message":"Synthetic denied provider","type":"authentication_error"}}'
            )
            return
        tool = text == "USE_TOOL" and messages[-1]["role"] != "tool"
        message = {"role": "assistant", "content": "RECOVERY_ACK_" + str(text)}
        if tool:
            message = {
                "role": "assistant",
                "content": None,
                "tool_calls": [
                    {
                        "id": "call-proof",
                        "type": "function",
                        "function": {
                            "name": "tool_call",
                            "arguments": json.dumps(
                                {
                                    "calls": [
                                        {
                                            "name": "todo_list",
                                            "arguments": {
                                                "todos": [
                                                    {
                                                        "id": "proof",
                                                        "content": "Adapter tool evidence",
                                                        "status": "completed",
                                                    }
                                                ]
                                            },
                                        }
                                    ]
                                }
                            ),
                        },
                    }
                ],
            }
        reason = "tool_calls" if tool else "stop"
        response = {
            "id": "local",
            "choices": [{"index": 0, "message": message, "finish_reason": reason}],
            "usage": {"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15},
        }
        payload = json.dumps(response).encode()
        content_type = "application/json"
        if body.get("stream"):
            if tool:
                message["tool_calls"][0]["index"] = 0
            payload = (
                "data: "
                + json.dumps(
                    {
                        "id": "local",
                        "choices": [
                            {"index": 0, "delta": message, "finish_reason": reason}
                        ],
                    }
                )
                + "\n\ndata: [DONE]\n\n"
            ).encode()
            content_type = "text/event-stream"
        try:
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
        except (BrokenPipeError, ConnectionResetError):
            pass


OWNER, AGENT, THREAD, OTHER_THREAD = (str(uuid4()) for _ in range(4))
KEY = b"disposable-test-service-signing-key-only"


def command(kind, payload=None, command_id=None):
    return {
        "schema_version": "nma.v1",
        "command_id": command_id or str(uuid4()),
        "type": kind,
        "expected_revision": None,
        "payload": payload or {},
    }


@pytest.fixture(scope="module")
def runtime(tmp_path_factory):
    root = Path(tempfile.mkdtemp(prefix="nma-", dir="/tmp"))
    home = root / "state"
    home.mkdir(mode=0o700)
    workspace = root / "workspace"
    workspace.mkdir()
    server = ThreadingHTTPServer(("127.0.0.1", 0), Model)
    server.requests = []
    server.blocked = threading.Event()
    server.release = threading.Event()
    threading.Thread(target=server.serve_forever, daemon=True).start()
    url = f"http://127.0.0.1:{server.server_port}/v1"
    (home / "config.yaml").write_text(
        json.dumps(
            {
                "model": {
                    "provider": "custom",
                    "default": "adapter-model",
                    "base_url": url,
                },
                "platform_toolsets": {"cli": []},
                "auxiliary": {"title_generation": {"enabled": False}},
                "terminal": {"cwd": str(workspace)},
            }
        )
    )
    configs = [
        {
            "agent_id": AGENT,
            "thread_id": thread,
            "config_revision": revision,
            "context_generation": "1",
            "model": "adapter-model",
            "provider": "custom",
            "base_url": url,
            "toolsets": ["todo"],
            "cwd": str(workspace),
        }
        for thread, revision in ((THREAD, "1"), (OTHER_THREAD, "1"), (THREAD, "2"))
    ]
    (root / "bindings.json").write_text(json.dumps(configs))
    (root / "key").write_bytes(KEY)
    env = child_env() | {
        "HERMES_HOME": str(home),
        "PYTHONPATH": os.pathsep.join((str(ENGINE), str(SOURCE))),
        "HERMES_SOURCE": str(SOURCE),
        "PYTHONUNBUFFERED": "1",
        "OPENAI_API_KEY": "loopback-only",
        "OPENAI_BASE_URL": url,
        "NMA_OWNER_ID": OWNER,
        "NMA_SERVICE_KEY_FILE": str(root / "key"),
        "NMA_BINDINGS_FILE": str(root / "bindings.json"),
    }
    processes = []

    def start():
        log = (root / f"gateway-{len(processes)}.log").open("w+")
        process = subprocess.Popen(
            [sys.executable, "-m", "ngertiin_engine.service"],
            cwd=SOURCE,
            env=env,
            stdout=log,
            stderr=subprocess.STDOUT,
        )
        processes.append(process)
        deadline = time.monotonic() + 90
        while process.poll() is None and time.monotonic() < deadline:
            try:
                response = call(command("runtime.describe"))
                if "result" in response:
                    return process, response["result"]
            except (OSError, ValueError):
                pass
            time.sleep(0.1)
        log.flush()
        pytest.fail(
            log.read()
            if log.seek(0) is None
            else (root / f"gateway-{len(processes) - 1}.log").read_text()
        )

    def call(body, envelope=None):
        envelope = sign(body, OWNER, KEY) if envelope is None else envelope
        with socket.socket(socket.AF_UNIX) as client:
            client.settimeout(35)
            client.connect(str(home / "nma.sock"))
            client.sendall((json.dumps(envelope) + "\n").encode())
            return json.loads(client.makefile("rb").readline())

    process, description = start()
    with sqlite3.connect(home / "state.db") as db:
        print(
            "RUNTIME_EVIDENCE "
            + json.dumps(
                {
                    "python": platform.python_version(),
                    "sqlite": sqlite3.sqlite_version,
                    "platform": platform.system(),
                    "architecture": platform.machine(),
                    "journal_mode": db.execute("PRAGMA journal_mode").fetchone()[0],
                }
            )
        )
    yield root, server, call, start, process, description
    server.release.set()
    for process in processes:
        if process.poll() is None:
            process.send_signal(signal.SIGINT)
            try:
                process.wait(timeout=25)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
    server.shutdown()


def submit(text="ADAPTER_PROOF", thread=THREAD, revision="1"):
    return command(
        "runtime.submit",
        {
            "agent_id": AGENT,
            "thread_id": thread,
            "config_revision": revision,
            "context_generation": "1",
            "text": text,
        },
    )


def settle(call, run_id, expected="succeeded"):
    deadline = time.monotonic() + 45
    while time.monotonic() < deadline:
        reply = call(command("runtime.read", {"run_id": run_id}))
        assert "result" in reply, reply
        if reply["result"]["status"] not in {"queued", "running"}:
            assert reply["result"]["status"] == expected, reply
            return reply["result"]
        time.sleep(0.1)
    pytest.fail(f"Run did not settle: {reply}")


def test_identity_revision_duplicate_and_restart(runtime):
    _root, server, call, start, process, description = runtime
    body = submit()
    reply = call(body)
    assert "result" in reply, reply
    receipt = reply["result"]
    result = settle(call, receipt["run_id"])
    assert result["agent_id"] == AGENT and result["thread_id"] == THREAD
    assert result["config_revision"] == "1"
    assert "RECOVERY_ACK_ADAPTER_PROOF" in result["text"]
    assert call(body)["result"] == receipt
    conflict = json.loads(json.dumps(body))
    conflict["payload"]["text"] = "CHANGED"
    assert call(conflict)["error"]["code"] == "COMMAND_CONFLICT"
    old_cursor = call(
        command(
            "runtime.events",
            {"run_id": receipt["run_id"], "replay_epoch": None, "last_sequence": "0"},
        )
    )["result"]
    process.kill()
    process.wait(timeout=10)
    _, restarted = start()
    assert int(restarted["authority_epoch"]) > int(description["authority_epoch"])
    assert call(body)["result"] == receipt
    replay = call(
        command(
            "runtime.events",
            {
                "run_id": receipt["run_id"],
                "replay_epoch": old_cursor["replay_epoch"],
                "last_sequence": old_cursor["last_sequence"],
            },
        )
    )["result"]
    assert replay["snapshot_required"] and replay["events"] == []
    assert settle(call, receipt["run_id"]) == result
    assert len(server.requests) == 1


def test_scope_and_config_sessions(runtime):
    root, server, call, *_ = runtime
    for thread, revision in ((OTHER_THREAD, "1"), (THREAD, "2")):
        reply = call(submit("FRESH_CONTEXT", thread, revision))
        assert "result" in reply, reply
        result = settle(call, reply["result"]["run_id"])
        assert result["thread_id"] == thread and result["config_revision"] == revision
        assert "ADAPTER_PROOF" not in json.dumps(server.requests[-1])
    with sqlite3.connect(root / "state/state.db") as db:
        assert (
            db.execute(
                "SELECT count(DISTINCT native_session_id) FROM nma_adapter_bindings"
            ).fetchone()[0]
            == 3
        )
        assert db.execute("PRAGMA integrity_check").fetchone()[0] == "ok"


def test_authentication_and_invalid_binding(runtime):
    _, _, call, *_ = runtime
    body = submit()
    assert call(body, sign(body, str(uuid4()), KEY))["error"]["code"] == "NOT_FOUND"
    assert call(body, sign(body, OWNER, b"wrong"))["error"]["code"] == "UNAUTHENTICATED"
    assert (
        call(body, sign(body, OWNER, KEY, now=0))["error"]["code"] == "UNAUTHENTICATED"
    )
    body["schema_version"] = "nma.v2"
    assert call(body)["error"]["code"] == "UNSUPPORTED_VERSION"
    assert call(submit(thread=str(uuid4())))["error"]["code"] == "NOT_FOUND"


def test_active_and_queued_cancel(runtime):
    _, server, call, *_ = runtime
    server.blocked.clear()
    server.release.clear()
    first = call(submit("BLOCK_STARTED"))["result"]
    assert server.blocked.wait(30)
    queued = call(submit("MUST_NOT_RUN"))["result"]
    for receipt in (queued, first):
        body = command("run.cancel", {"run_id": receipt["run_id"]})
        cancelled = call(body)
        assert "result" in cancelled, cancelled
        assert call(body) == cancelled
    server.release.set()
    settle(call, queued["run_id"], "cancelled")
    settle(call, first["run_id"], "cancelled")
    assert "MUST_NOT_RUN" not in json.dumps(server.requests)


def test_real_tool_and_events(runtime):
    _, server, call, *_ = runtime
    first = call(submit("BLOCK_STARTED"))["result"]
    run_id = first["run_id"]
    # Seed the cursor before the next turn; admission filtering prevents sibling leakage.
    cursor = call(
        command(
            "runtime.events",
            {"run_id": run_id, "replay_epoch": None, "last_sequence": "0"},
        )
    )["result"]
    settle(call, run_id)
    receipt = call(submit("USE_TOOL"))["result"]
    settle(call, receipt["run_id"])
    replay = call(
        command(
            "runtime.events",
            {
                "run_id": receipt["run_id"],
                "replay_epoch": cursor["replay_epoch"],
                "last_sequence": cursor["last_sequence"],
            },
        )
    )["result"]
    assert not replay["snapshot_required"], replay
    kinds = {event["type"] for event in replay["events"]}
    assert {"tool.started", "tool.completed", "message.completed"} <= kinds, replay
    assert any(
        m["role"] == "tool" and "proof" in str(m.get("content"))
        for m in server.requests[-1]["messages"]
    )
    assert all(
        e["run_id"] == receipt["run_id"] and isinstance(e["sequence"], str)
        for e in replay["events"]
    )


def test_provider_failure(runtime):
    _, _, call, *_ = runtime
    receipt = call(submit("FAIL_PROVIDER"))["result"]
    result = settle(call, receipt["run_id"], "failed")
    assert result["error_code"] == "RUNTIME_FAILED"
    assert result["text"] == ""


def test_real_database_constraints_and_rollback(runtime):
    root, _, call, *_ = runtime
    with sqlite3.connect(root / "state/state.db") as db:
        db.execute("PRAGMA foreign_keys=ON")
        before = db.execute("SELECT count(*) FROM nma_commands").fetchone()[0]
        with pytest.raises(sqlite3.IntegrityError):
            db.execute(
                "INSERT INTO nma_partition(owner_id,authority_epoch,schema_version) VALUES (?,1,1)",
                (str(uuid4()),),
            )
        db.rollback()
        with pytest.raises(sqlite3.IntegrityError):
            db.execute(
                "INSERT INTO nma_commands VALUES (?,?,?,?,NULL)",
                (str(uuid4()), str(uuid4()), "digest", "{}"),
            )
        db.rollback()
        db.execute("BEGIN IMMEDIATE")
        db.execute(
            "INSERT INTO nma_commands VALUES (?,?,?,?,NULL)",
            (OWNER, str(uuid4()), "digest", "{}"),
        )
        db.rollback()
        assert db.execute("SELECT count(*) FROM nma_commands").fetchone()[0] == before
        assert db.execute("PRAGMA foreign_key_check").fetchall() == []
        assert (
            db.execute(
                "SELECT count(*) FROM nma_runtime_outbox WHERE state='pending'"
            ).fetchone()[0]
            == 0
        )
    assert "result" in call(command("runtime.describe"))


def test_second_gateway_cannot_take_partition(runtime):
    root, _, call, *_ = runtime
    before = call(command("runtime.describe"))["result"]["authority_epoch"]
    env = child_env() | {
        "HERMES_HOME": str(root / "state"),
        "HERMES_SOURCE": str(SOURCE),
        "PYTHONPATH": os.pathsep.join((str(ENGINE), str(SOURCE))),
        "NMA_OWNER_ID": OWNER,
        "NMA_SERVICE_KEY_FILE": str(root / "key"),
        "NMA_BINDINGS_FILE": str(root / "bindings.json"),
    }
    result = subprocess.run(
        [sys.executable, "-m", "ngertiin_engine.service"],
        env=env,
        cwd=SOURCE,
        capture_output=True,
        timeout=30,
        check=False,
    )
    assert result.returncode in {0, 1}, result.stderr.decode()
    assert call(command("runtime.describe"))["result"]["authority_epoch"] == before
    env["NMA_OWNER_ID"] = str(uuid4())
    wrong = subprocess.run(
        [sys.executable, "-m", "ngertiin_engine.service"],
        env=env,
        cwd=SOURCE,
        capture_output=True,
        timeout=30,
        check=False,
    )
    assert wrong.returncode != 0 and b"PARTITION_MISMATCH" in wrong.stderr
    assert call(command("runtime.describe"))["result"]["authority_epoch"] == before


def test_process_death_rolls_back_unacknowledged_write(runtime):
    root, _, call, *_ = runtime
    database = root / "state/state.db"
    command_id = str(uuid4())
    code = """
import sqlite3,sys
connection = sqlite3.connect(sys.argv[1])
connection.execute("PRAGMA foreign_keys=ON")
connection.execute("BEGIN IMMEDIATE")
connection.execute("INSERT INTO nma_commands VALUES (?,?,?,?,NULL)", (sys.argv[2], sys.argv[3], "digest", "{}"))
print("uncommitted", flush=True)
sys.stdin.read()
"""
    process = subprocess.Popen(
        [sys.executable, "-c", code, str(database), OWNER, command_id],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        text=True,
    )
    try:
        assert process.stdout.readline().strip() == "uncommitted"
    finally:
        process.kill()
        process.wait(timeout=10)
    with sqlite3.connect(database) as db:
        assert (
            db.execute(
                "SELECT 1 FROM nma_commands WHERE command_id=?", (command_id,)
            ).fetchone()
            is None
        )
        assert db.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
    assert "result" in call(command("runtime.describe"))


def test_runtime_pin_rejects_modified_source(tmp_path):
    import shutil

    from ngertiin_engine import runtime as runtime_module
    from ngertiin_engine.contracts import EngineError
    from ngertiin_engine.runtime import verify

    pin = json.loads(
        Path(runtime_module.__file__).with_name("runtime-pin.json").read_text()
    )
    for name in pin["source_hashes"]:
        target = tmp_path / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(SOURCE / name, target)
    assert verify(tmp_path)["python"] == pin["python"]
    (tmp_path / "gateway/session_authority.py").write_text("modified source")
    with pytest.raises(EngineError, match="RUNTIME_SOURCE_MISMATCH"):
        verify(tmp_path)
