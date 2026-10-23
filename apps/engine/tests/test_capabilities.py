"""Capability contracts against the pinned runtime and a real local MCP connector."""

# ruff: noqa: F811 - pytest fixture arguments intentionally shadow the imported fixture

import json
import socket
import sqlite3
import subprocess
import sys
import time
from pathlib import Path
from uuid import uuid4

from test_runtime import command, runtime, settle  # noqa: F401 - shared pytest fixture


def capability_agent(call, handle, **grants):
    payload = {
        "display_name": handle,
        "handle": handle,
        "config": {"soul": "", "instructions": "", "model": "test", **grants},
    }
    response = call(command("agent.create", payload))
    assert "result" in response, response
    return response["result"]["agent"]


def capability_submit(call, agent, text, thread=None):
    body = command(
        "runtime.submit",
        {
            "agent_id": agent["agent_id"],
            "thread_id": thread or str(uuid4()),
            "config_revision": agent["config_revision"],
            "context_generation": "1",
            "text": text,
        },
    )
    return call(body)["result"]["run_id"]


def test_capability_assignment_tools_skills_deny_and_revoke(runtime):
    root, server, call, start, *_ = runtime
    catalog = {
        "tool_grants": {"tasks": {"enabled": True, "toolset": "todo"}},
        "skill_refs": {
            "research": {"enabled": True, "content": "ASSIGNED_SKILL_PROOF"}
        },
    }
    (root / "capabilities.json").write_text(json.dumps(catalog))
    agent = capability_agent(
        call, "capable", tool_grants=["tasks"], skill_refs=["research"]
    )
    other = capability_agent(call, "without-capabilities")
    before = len(server.requests)
    run = capability_submit(call, agent, "USE_TOOL")
    settle(call, run)
    messages = json.dumps(server.requests[before:])
    assert "ASSIGNED_SKILL_PROOF" in messages
    assert '"role": "tool"' in messages and "Adapter tool evidence" in messages
    before = len(server.requests)
    denied = capability_submit(call, other, "USE_TOOL")
    settle(call, denied)
    messages = json.dumps(server.requests[before:])
    assert "ASSIGNED_SKILL_PROOF" not in messages
    assert "does not exist" in messages
    # Native deferred dispatch rejects names outside the selected definitions too.
    server.release.clear()
    server.blocked.clear()
    thread = str(uuid4())
    running = capability_submit(call, agent, "BLOCK_STARTED", thread)
    assert server.blocked.wait(10)
    queued = capability_submit(call, agent, "QUEUED_CAPABILITY_REVOKED", thread)
    edit = command(
        "agent.configure",
        {
            "agent_id": agent["agent_id"],
            "display_name": agent["display_name"],
            "handle": agent["handle"],
            "config": {**agent["config"], "tool_grants": [], "skill_refs": []},
        },
    )
    edit["expected_revision"] = agent["revision"]
    changed = call(edit)["result"]["agent"]
    assert changed["access_generation"] == "2"
    server.release.set()
    assert settle(call, queued, "cancelled")["status"] == "cancelled"
    assert settle(call, running, "cancelled")["status"] == "cancelled"
    assert not any(
        m.get("content") == "QUEUED_CAPABILITY_REVOKED"
        for r in server.requests
        for m in r.get("messages", [])
    )
    start.current.kill()
    start.current.wait(timeout=10)
    start()
    assert call(edit)["result"]["agent"] == changed
    assert settle(call, queued, "cancelled")["status"] == "cancelled"
    assert "error" in call(
        command(
            "agent.create",
            {
                "display_name": "Unknown",
                "handle": "unknown-capability",
                "config": {
                    "soul": "",
                    "instructions": "",
                    "model": "test",
                    "tool_grants": ["missing"],
                },
            },
        )
    )


def test_session_scoped_mcp_credentials_restart_and_connector_error(runtime):
    root, server, call, start, *_ = runtime
    with socket.socket() as reservation:
        reservation.bind(("127.0.0.1", 0))
        port = reservation.getsockname()[1]
    connector_log = (root / "connector.log").open("w")
    receipts = root / "connector-receipts.txt"
    receipts.write_text("")
    connector = subprocess.Popen(
        [
            sys.executable,
            str(Path(__file__).with_name("mcp_fixture.py")),
            str(port),
            str(receipts),
        ],
        stdout=connector_log,
        stderr=subprocess.STDOUT,
    )
    try:
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline:
            try:
                with socket.create_connection(("127.0.0.1", port), timeout=0.1):
                    break
            except OSError:
                time.sleep(0.05)
        secret = "nma-disposable-connector-secret"
        (root / "connector.json").write_text(
            json.dumps(
                {
                    "type": "http",
                    "name": "fixture",
                    "url": f"http://127.0.0.1:{port}/mcp",
                    "headers": [{"name": "Authorization", "value": "Bearer " + secret}],
                }
            )
        )
        (root / "capabilities.json").write_text(
            json.dumps(
                {
                    "mcp_grants": {
                        "connector": {
                            "enabled": True,
                            "server_file": str(root / "connector.json"),
                        }
                    }
                }
            )
        )
        agent = capability_agent(call, "mcp-agent", mcp_grants=["connector"])
        other = capability_agent(call, "no-mcp-agent")
        thread = str(uuid4())
        run = capability_submit(call, agent, "MCP_DISCOVERY", thread)
        assert settle(call, run)["status"] == "succeeded"
        with sqlite3.connect(root / "state/state.db") as db:
            # Native generated names are session-specific, never guessed from a public alias.
            raw = db.execute(
                "SELECT config FROM nma_adapter_bindings WHERE json_extract(config,'$.agent_id')=?",
                (agent["agent_id"],),
            ).fetchone()[0]
            assert secret not in raw
        with sqlite3.connect(root / "state/state.db") as db:
            names = []
            for (value,) in db.execute(
                "SELECT value FROM state_meta WHERE key LIKE 'gateway.local_policy.v1:%'"
            ):
                manifest = json.loads(
                    json.loads(value)["policy"].get("editor_mcp_json") or "{}"
                )
                names.extend(
                    name
                    for name in manifest.get("schemas", {})
                    if name.endswith("__proof")
                )
        assert names
        name = names[-1]
        before = len(server.requests)
        assert (
            settle(call, capability_submit(call, agent, "CALL_TOOL:" + name, thread))[
                "status"
            ]
            == "succeeded"
        )
        observed = json.dumps(server.requests[before:])
        assert "MCP_PROOF" in observed and secret not in observed
        assert receipts.read_text().splitlines() == ["proof"]
        before = len(server.requests)
        settle(call, capability_submit(call, other, "CALL_TOOL:" + name))
        assert "MCP_PROOF" not in json.dumps(server.requests[before:])
        assert receipts.read_text().splitlines() == ["proof"]
        start.current.kill()
        start.current.wait(timeout=10)
        start()
        before = len(server.requests)
        settle(call, capability_submit(call, agent, "CALL_TOOL:" + name, thread))
        assert "MCP_PROOF" in json.dumps(server.requests[before:])
        assert receipts.read_text().splitlines() == ["proof", "proof"]
        before = len(server.requests)
        settle(
            call,
            capability_submit(
                call, agent, "CALL_TOOL:" + name.replace("__proof", "__failure"), thread
            ),
        )
        assert secret not in json.dumps(server.requests[before:])
        assert receipts.read_text().splitlines() == ["proof", "proof", "failure"]
        assert secret not in (root / "state/state.db").read_bytes().decode(
            errors="ignore"
        )
        for log in root.glob("gateway-*.log"):
            assert secret not in log.read_text()
        server.release.clear()
        server.blocked.clear()
        active = capability_submit(call, agent, "BLOCK_STARTED", thread)
        assert server.blocked.wait(10)
        queued = capability_submit(call, agent, "QUEUED_SECRET_REVOKED", thread)
        (root / "connector.json").unlink()
        server.release.set()
        settle(call, active)
        settle(call, queued, "cancelled")
        assert not any(
            m.get("content") == "QUEUED_SECRET_REVOKED"
            for r in server.requests
            for m in r.get("messages", [])
        )
        before = len(server.requests)
        response = call(
            command(
                "runtime.submit",
                {
                    "agent_id": agent["agent_id"],
                    "thread_id": thread,
                    "config_revision": "1",
                    "context_generation": "1",
                    "text": "REVOKED_CREDENTIAL",
                },
            )
        )
        assert response.get("error", {}).get("code") == "ACCESS_REVOKED", response
        assert len(server.requests) == before
    finally:
        connector.terminate()
        connector.wait(timeout=10)
        connector_log.close()


def test_new_grants_do_not_broaden_an_existing_run(runtime):
    root, server, call, _, *_ = runtime
    (root / "capabilities.json").write_text(
        json.dumps({"tool_grants": {"tasks": {"enabled": True, "toolset": "todo"}}})
    )
    agent = capability_agent(call, "grant-snapshot")
    server.release.clear()
    server.blocked.clear()
    before = len(server.requests)
    run = capability_submit(call, agent, "BLOCK_TOOL")
    assert server.blocked.wait(10)
    edit = command(
        "agent.configure",
        {
            "agent_id": agent["agent_id"],
            "display_name": agent["display_name"],
            "handle": agent["handle"],
            "config": {**agent["config"], "tool_grants": ["tasks"]},
        },
    )
    edit["expected_revision"] = agent["revision"]
    changed = call(edit)["result"]["agent"]
    assert changed["access_generation"] == agent["access_generation"]
    server.release.set()
    settle(call, run)
    responses = [
        m["content"]
        for r in server.requests[before:]
        for m in r["messages"]
        if m["role"] == "tool"
    ]
    assert responses and all("does not exist" in text for text in responses)
    before = len(server.requests)
    settle(call, capability_submit(call, changed, "USE_TOOL"))
    responses = [
        m["content"]
        for r in server.requests[before:]
        for m in r["messages"]
        if m["role"] == "tool"
    ]
    assert responses and any("proof" in text for text in responses)


def test_unavailable_connector_is_not_silently_dropped(runtime):
    root, server, call, _, *_ = runtime
    path = root / "unavailable-connector.json"
    path.write_text(
        json.dumps(
            {
                "type": "http",
                "name": "unavailable",
                "url": "http://127.0.0.1:1/mcp",
                "headers": [],
            }
        )
    )
    (root / "capabilities.json").write_text(
        json.dumps(
            {"mcp_grants": {"unavailable": {"enabled": True, "server_file": str(path)}}}
        )
    )
    agent = capability_agent(call, "unavailable-connector", mcp_grants=["unavailable"])
    body = command(
        "runtime.submit",
        {
            "agent_id": agent["agent_id"],
            "thread_id": str(uuid4()),
            "config_revision": "1",
            "context_generation": "1",
            "text": "MUST_NOT_EXECUTE",
        },
    )
    before = len(server.requests)
    for _ in range(2):
        response = call(body)
        assert response.get("error", {}).get("code") == "CONNECTOR_UNAVAILABLE", (
            response
        )
    assert len(server.requests) == before


def test_mcp_discovery_secrets_rejected_before_storage_and_after_restart(runtime):
    root, model, call, start, *_ = runtime
    with socket.socket() as reservation:
        reservation.bind(("127.0.0.1", 0))
        port = reservation.getsockname()[1]
    receipts = root / "schema-receipts.txt"
    receipts.write_text("")
    secret = "nma-disposable-connector-secret"
    private = {
        "type": "http",
        "name": "schema",
        "url": f"http://127.0.0.1:{port}/mcp",
        "headers": [{"name": "Authorization", "value": "Bearer " + secret}],
    }
    (root / "schema-connector.json").write_text(json.dumps(private))
    (root / "capabilities.json").write_text(
        json.dumps(
            {
                "mcp_grants": {
                    "schema": {
                        "enabled": True,
                        "server_file": str(root / "schema-connector.json"),
                    }
                }
            }
        )
    )
    agent = capability_agent(call, "schema-isolation", mcp_grants=["schema"])
    connector = None

    def launch(leak):
        process = subprocess.Popen(
            [
                sys.executable,
                str(Path(__file__).with_name("mcp_fixture.py")),
                str(port),
                str(receipts),
                "secret-schema" if leak else "clean",
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline:
            try:
                with socket.create_connection(("127.0.0.1", port), timeout=0.1):
                    return process
            except OSError:
                time.sleep(0.05)
        process.terminate()
        process.wait(timeout=10)
        raise AssertionError("Connector did not start")

    def body(thread):
        return command(
            "runtime.submit",
            {
                "agent_id": agent["agent_id"],
                "thread_id": thread,
                "config_revision": agent["config_revision"],
                "context_generation": "1",
                "text": "SCHEMA_BOUNDARY_PROOF",
            },
        )

    def no_secret():
        assert secret not in json.dumps(model.requests)
        for path in (root / "state").glob("state.db*"):
            assert secret.encode() not in path.read_bytes(), path
        for path in root.glob("gateway-*.log"):
            assert secret not in path.read_text(), path

    try:
        connector = launch(True)
        before = len(model.requests)
        rejected = body(str(uuid4()))
        assert call(rejected)["error"]["code"] == "CONNECTOR_UNAVAILABLE"
        assert call(rejected)["error"]["code"] == "CONNECTOR_UNAVAILABLE"
        assert len(model.requests) == before
        no_secret()
        connector.terminate()
        connector.wait(timeout=10)
        connector = launch(False)
        thread = str(uuid4())
        accepted = call(body(thread))["result"]
        settle(call, accepted["run_id"])
        no_secret()
        start.current.kill()
        start.current.wait(timeout=10)
        connector.terminate()
        connector.wait(timeout=10)
        connector = launch(True)
        start()
        before = len(model.requests)
        response = call(body(thread))
        if "result" in response:
            settle(call, response["result"]["run_id"], "failed")
        else:
            assert response["error"]["code"] == "CONNECTOR_UNAVAILABLE"
        assert len(model.requests) == before
        assert receipts.read_text() == ""
        no_secret()
    finally:
        if connector:
            connector.terminate()
            connector.wait(timeout=10)
