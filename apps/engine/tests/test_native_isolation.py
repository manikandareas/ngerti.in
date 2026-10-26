"""Real Linux native handlers, scope boundaries and durable cancellation receipts."""

# ruff: noqa: F811 - shared real gateway fixture

import json
import os
import sqlite3
import time

import pytest
from ngertiin_engine.native_executor import IsolatedTools, Scope
from test_capabilities import capability_agent
from test_direct_messages import send
from test_runtime import OWNER, command, runtime, settle  # noqa: F401

pytestmark = pytest.mark.skipif(
    not os.environ.get("NMA_TEST_NATIVE_IMAGE"),
    reason="Run explicitly with the built native image",
)


def test_native_terminal_is_scoped_and_cancelled_without_replay(runtime):
    root, provider, call, start, *_ = runtime
    image = os.environ["NMA_TEST_NATIVE_IMAGE"]
    catalog = {
        "version": 2,
        "execution_surfaces": {
            "linux": {"ready": True, "kind": "scoped_linux", "image": image}
        },
        "tool_grants": {
            "native_terminal": {
                "enabled": True,
                "toolset": "terminal",
                "execution_surface": "linux",
            }
        },
    }
    (root / "capabilities.json").write_text(json.dumps(catalog))
    agent = capability_agent(
        call, "isolated-native-terminal", tool_grants=["native_terminal"]
    )
    thread = call(command("thread.read", {"thread_id": agent["primary_dm_thread_id"]}))[
        "result"
    ]
    command_text = "python -c " + repr(
        "import os,json; from pathlib import Path; Path('/work/proof.txt').write_text('NATIVE_FILE_PROOF'); print(json.dumps({'uid':os.getuid(),'provider_key':os.environ.get('OPENAI_API_KEY'),'control_key':Path("
        + repr(str(root / "key"))
        + ").exists(),'docker_socket':Path('/var/run/docker.sock').exists()}))"
    )

    def script(body, text):
        if body["messages"][-1]["role"] == "tool":
            return {"role": "assistant", "content": "Native work completed."}
        return {
            "role": "assistant",
            "content": None,
            "tool_calls": [
                {
                    "id": "isolated-tool",
                    "type": "function",
                    "function": {
                        "name": "terminal",
                        "arguments": json.dumps({"command": command_text}),
                    },
                }
            ],
        }

    provider.goal_script = script
    try:
        run = call(send(thread, "RUN_ISOLATED_NATIVE"))["result"]["run_id"]
        assert settle(call, run)["status"] == "succeeded"
        tools = [m for m in provider.requests[-1]["messages"] if m["role"] == "tool"]
        observed = json.loads(json.loads(tools[-1]["content"])["output"])
        assert observed == {
            "uid": 10001,
            "provider_key": None,
            "control_key": False,
            "docker_socket": False,
        }
        journals = list(
            (root / "state" / "native-execution").glob("*/isolated-tools.db")
        )
        assert len(journals) == 1
        with sqlite3.connect(journals[0]) as conn:
            scope = Scope(
                **json.loads(
                    conn.execute("SELECT scope_json FROM scopes").fetchone()[0]
                )
            )
            assert conn.execute("SELECT COUNT(*) FROM operations").fetchone()[0] == 1
        broker = IsolatedTools(journals[0].parent, OWNER, image=image)
        assert broker.file_bytes(scope, "proof.txt") == b"NATIVE_FILE_PROOF"
        target = broker.ensure(scope)
        forged = broker._docker(
            "exec",
            "-i",
            target["container"],
            "/opt/native/bin/python",
            "/opt/engine/ngertiin_engine/native_worker.py",
            "call",
            input=json.dumps(
                {
                    "payload": {
                        "native_name": "terminal",
                        "arguments": {"command": "touch /work/forged.txt"},
                    },
                    "signature": "00" * 64,
                }
            ),
        )
        assert (
            json.loads(json.loads(forged)["native_result"])["error"] == "ACCESS_REVOKED"
        )
        assert (
            broker._read_volume(
                scope,
                "from pathlib import Path; print(Path('/work/forged.txt').exists())",
            ).strip()
            == "False"
        )
        broker.pause(scope)
        # A second agent does not gain tools merely because an image is installed.
        other = capability_agent(call, "native-without-grant")
        other_thread = call(
            command("thread.read", {"thread_id": other["primary_dm_thread_id"]})
        )["result"]
        denied = call(send(other_thread, "RUN_UNGRANTED_NATIVE"))["result"]["run_id"]
        settle(call, denied)
        with sqlite3.connect(journals[0]) as conn:
            assert conn.execute("SELECT COUNT(*) FROM operations").fetchone()[0] == 1
        command_text = "printf before > /work/cancel.txt; sleep 30; printf after >> /work/cancel.txt"
        pending = call(send(thread, "CANCEL_NATIVE_BATCH"))["result"]["run_id"]
        deadline = time.monotonic() + 20
        while time.monotonic() < deadline:
            with sqlite3.connect(journals[0]) as conn:
                row = conn.execute(
                    "SELECT scope_key,operation_id FROM operations WHERE state='dispatching'"
                ).fetchone()
            if row:
                break
            time.sleep(0.1)
        assert row
        stopped = command("run.cancel", {"run_id": pending})
        assert "result" in call(stopped)
        settle(call, pending, "cancelled")
        assert call(stopped)["result"]
        with sqlite3.connect(journals[0]) as conn:
            cancelled_scope = Scope(
                **json.loads(
                    conn.execute(
                        "SELECT scope_json FROM scopes WHERE scope_key=?", (row[0],)
                    ).fetchone()[0]
                )
            )
        assert broker.receipt(cancelled_scope, row[1])["state"] == "indeterminate"
        start.current.kill()
        start.current.wait(timeout=10)
        start()
        assert call(stopped)["result"]
        with sqlite3.connect(journals[0]) as conn:
            assert conn.execute("SELECT COUNT(*) FROM operations").fetchone()[0] == 2
    finally:
        provider.goal_script = None
        for path in (root / "state" / "native-execution").glob("*/isolated-tools.db"):
            IsolatedTools(path.parent, OWNER, image=image).cleanup()
