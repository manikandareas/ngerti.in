"""Real Hermes provider handoff, persistence, admission and credential boundaries."""

# ruff: noqa: F811
import json
import sqlite3
import threading
from concurrent.futures import ThreadPoolExecutor
from http.server import ThreadingHTTPServer
from uuid import uuid4

import pytest
from ngertiin_engine.contracts import sign
from test_direct_messages import send
from test_runtime import KEY, OWNER, Model, command, runtime, settle  # noqa: F401


class Provider(Model):
    def do_GET(self):
        key = self.headers.get("Authorization")
        status = 200 if key == "Bearer " + self.server.key else 401
        body = json.dumps(
            {
                "data": [
                    {
                        "id": "test-model",
                        "name": getattr(self.server, "catalog_label", "Account model"),
                    }
                ]
            }
        ).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        self.server.auth.append(self.headers.get("Authorization"))
        if self.server.status != 200:
            self.rfile.read(int(self.headers["Content-Length"]))
            body = b'{"error":{"code":"insufficient_quota"}}'
            self.send_response(self.server.status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_POST()


@pytest.fixture
def providers():
    servers = []
    for _ in range(2):
        server = ThreadingHTTPServer(("127.0.0.1", 0), Provider)
        server.key = "connection-canary-" + uuid4().hex
        server.requests, server.auth, server.status = [], [], 200
        server.blocked, server.release = threading.Event(), threading.Event()
        server.release.set()
        threading.Thread(target=server.serve_forever, daemon=True).start()
        servers.append(server)
    yield servers
    for server in servers:
        server.shutdown()
        server.server_close()


def connect(call, provider, label):
    identity = str(uuid4())
    payload = {
        "connection_id": identity,
        "provider": "custom",
        "label": label,
        "api_key": provider.key,
        "base_url": f"http://127.0.0.1:{provider.server_port}/v1",
        "protocol": "chat_completions",
    }
    result = call(command("connection.add_key", payload))
    assert "result" in result, result
    refreshed = call(command("connection.models", {"connection_id": identity}))
    assert refreshed["result"]["status"] == "connected", refreshed
    return identity, payload


def agent(call, model, handle):
    result = call(
        command(
            "agent.create",
            {
                "display_name": handle,
                "handle": handle,
                "config": {
                    "soul": "Work carefully.",
                    "instructions": "",
                    "model": model,
                    "tool_grants": ["tasks"],
                },
            },
        )
    )
    assert "result" in result, result
    return result["result"]["agent"]


def test_two_connections_native_dm_tool_restart_and_no_secret_journal(
    runtime, providers
):
    root, _, call, start, *_ = runtime
    (root / "capabilities.json").write_text(
        json.dumps({"tool_grants": {"tasks": {"enabled": True, "toolset": "todo"}}})
    )
    a, _ = connect(call, providers[0], "Personal account")
    b, _ = connect(call, providers[1], "Second account")
    first, second = (
        agent(call, a + ":test-model", "provider-first"),
        agent(call, b + ":test-model", "provider-second"),
    )
    for current in (first, second):
        thread = call(
            command("thread.read", {"thread_id": current["primary_dm_thread_id"]})
        )["result"]
        result = call(send(thread, "USE_TOOL"))
        assert "result" in result, result
        settled = settle(call, result["result"]["run_id"])
        assert settled["status"] == "succeeded"
    assert providers[0].auth and set(providers[0].auth) == {
        "Bearer " + providers[0].key
    }
    assert providers[1].auth and set(providers[1].auth) == {
        "Bearer " + providers[1].key
    }
    assert all(
        any(m["role"] == "tool" for m in server.requests[-1]["messages"])
        for server in providers
    )
    # The same persistent identities can collaborate using different provider accounts.
    from test_discussions import wait_group

    group = call(
        command(
            "thread.create",
            {
                "kind": "group",
                "title": "Provider comparison",
                "agent_ids": [first["agent_id"], second["agent_id"]],
            },
        )
    )["result"]["thread"]
    for server in providers:
        server.goal_script = lambda body, text: (
            {"role": "assistant", "content": "Group contribution complete."}
            if body.get("messages")
            else None
        )
    assert "result" in call(
        send(group, "@provider-first @provider-second Compare your findings.")
    )
    group_snapshot, group_status = wait_group(root, call, group)
    assert group_status == "settled"
    assert {
        m["author_agent_id"]
        for m in group_snapshot["messages"]
        if m["author_kind"] == "agent"
    } == {first["agent_id"], second["agent_id"]}
    for server in providers:
        server.goal_script = None
    listing = call(command("connection.list"))["result"]
    assert {a, b} <= {c["connection_id"] for c in listing["items"]}
    start.current.kill()
    start.current.wait(timeout=10)
    start()
    assert call(command("connection.list"))["result"] == listing
    agents = call(command("agent.list", {"after": None, "limit": 100}))["result"]
    assert (
        next(x for x in agents["items"] if x["agent_id"] == first["agent_id"])[
            "config"
        ]["model"]
        == a + ":test-model"
    )
    with sqlite3.connect(root / "state/state.db") as db:
        assert db.execute("PRAGMA foreign_key_check").fetchall() == []
        journal = str(db.execute("SELECT body,result FROM nma_commands").fetchall())
        assert not any(server.key in journal for server in providers)
        snapshot = json.loads(
            db.execute(
                "SELECT config FROM nma_adapter_bindings WHERE json_extract(config,'$.agent_id')=?",
                (first["agent_id"],),
            ).fetchone()[0]
        )
        assert snapshot["nma_provider"]["connection_id"] == a
    for path in (root / "state/state.db", *root.glob("gateway-*.log")):
        assert not any(server.key.encode() in path.read_bytes() for server in providers)
    for path in (root / "state/provider-secrets").glob("*.json"):
        assert path.stat().st_mode & 0o777 == 0o600


def test_owner_boundary_disconnect_key_replacement_and_catalog_persistence(
    runtime, providers
):
    root, _, call, start, *_ = runtime
    identity, payload = connect(call, providers[0], "Owner connection")
    foreign = sign(command("connection.list"), str(uuid4()), KEY)
    assert call(foreign["body"], foreign)["error"]["code"] == "NOT_FOUND"
    for kind in ("connection.models", "connection.disconnect"):
        assert (
            call(command(kind, {"connection_id": str(uuid4())}))["error"]["code"]
            == "NOT_FOUND"
        )
    current = agent(call, identity + ":test-model", "disconnect-agent")
    thread = call(
        command("thread.read", {"thread_id": current["primary_dm_thread_id"]})
    )["result"]
    receipt = call(send(thread, "FIRST"))["result"]
    settle(call, receipt["run_id"])
    original_snapshot = None
    with sqlite3.connect(root / "state/state.db") as db:
        original_snapshot = db.execute(
            "SELECT b.config FROM nma_adapter_bindings b JOIN nma_adapter_runs r USING(owner_id,binding_id) WHERE r.run_id=?",
            (receipt["run_id"],),
        ).fetchone()[0]
    assert (
        call(command("connection.disconnect", {"connection_id": identity}))["result"][
            "status"
        ]
        == "disconnected"
    )
    count = len(providers[0].requests)
    assert (
        call(send(thread, "AFTER_DISCONNECT"))["error"]["code"] == "MODEL_UNAVAILABLE"
    )
    assert len(providers[0].requests) == count
    # Replacing the key creates a new generation; existing admitted routes cannot switch accounts.
    providers[0].key = "replacement-canary-" + uuid4().hex
    call(command("connection.add_key", {**payload, "api_key": providers[0].key}))
    call(command("connection.models", {"connection_id": identity}))
    receipt2 = call(send(thread, "AFTER_REPAIR"))["result"]
    settle(call, receipt2["run_id"])
    with sqlite3.connect(root / "state/state.db") as db:
        assert (
            db.execute(
                "SELECT b.config FROM nma_adapter_bindings b JOIN nma_adapter_runs r USING(owner_id,binding_id) WHERE r.run_id=?",
                (receipt["run_id"],),
            ).fetchone()[0]
            == original_snapshot
        )
    start.current.kill()
    start.current.wait(timeout=10)
    start()
    assert call(command("connection.list"))["result"]["items"]


def test_quota_is_not_login_failure_and_no_account_fallback(runtime, providers):
    _, _, call, *_ = runtime
    identity, _ = connect(call, providers[0], "Quota account")
    current = agent(call, identity + ":test-model", "quota-agent")
    thread = call(
        command("thread.read", {"thread_id": current["primary_dm_thread_id"]})
    )["result"]
    providers[0].status = 402
    receipt = call(send(thread, "QUOTA"))["result"]
    value = settle(call, receipt["run_id"], "failed")
    assert value["error_code"] == "PROVIDER_QUOTA_EXHAUSTED", value
    assert providers[1].requests == []
    snap = call(command("thread.snapshot", {"thread_id": thread["thread_id"]}))[
        "result"
    ]
    assert not any("RECOVERY_ACK_QUOTA" in str(m) for m in snap["messages"])
    assert (
        next(r for r in snap["runs"] if r["run_id"] == receipt["run_id"])["error_code"]
        == "PROVIDER_QUOTA_EXHAUSTED"
    )


def test_duplicate_key_onboarding_is_serialized(runtime, providers):
    _, _, call, *_ = runtime
    identity = str(uuid4())
    payload = {
        "connection_id": identity,
        "provider": "custom",
        "label": "Concurrent",
        "api_key": providers[0].key,
        "base_url": f"http://127.0.0.1:{providers[0].server_port}/v1",
    }
    body = command("connection.add_key", payload)
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(lambda _: call(body), range(4)))
    assert all("result" in r for r in results)
    assert {r["result"]["generation"] for r in results} == {1}
    listing = call(command("connection.list"))["result"]["items"]
    assert len([c for c in listing if c["connection_id"] == identity]) == 1


def test_provider_catalog_cannot_echo_credentials_into_public_metadata(
    runtime, providers
):
    root, _, call, *_ = runtime
    identity, _ = connect(call, providers[0], "Metadata boundary")
    providers[0].catalog_label = providers[0].key
    refused = call(command("connection.models", {"connection_id": identity}))
    assert refused["error"]["code"] == "CREDENTIAL_METADATA_REJECTED", refused
    listing = call(command("connection.list"))["result"]
    assert providers[0].key not in json.dumps(listing)
    with sqlite3.connect(root / "state/state.db") as db:
        assert providers[0].key not in str(
            db.execute("SELECT metadata FROM nma_provider_connections").fetchall()
        )


def test_two_owner_gateways_cannot_use_each_others_connections(runtime, providers):
    _, _, call, *_ = runtime
    identity, _ = connect(call, providers[0], "First owner")
    from test_runtime import runtime as runtime_fixture

    second_gateway = runtime_fixture.__wrapped__(None)
    state = next(second_gateway)
    root2, _, other_call, other_start, *_ = state
    try:
        other_start.current.kill()
        other_start.current.wait(timeout=10)
        (root2 / "state").rename(root2 / "previous-state")
        (root2 / "state").mkdir(mode=0o700)
        owner2 = str(uuid4())
        other_start(overrides={"NMA_OWNER_ID": owner2})
        second, _ = connect(other_call, providers[1], "Second owner")
        assert identity not in {
            c["connection_id"]
            for c in other_call(command("connection.list"))["result"]["items"]
        }
        assert second not in {
            c["connection_id"]
            for c in call(command("connection.list"))["result"]["items"]
        }
        for kind in ("connection.models", "connection.disconnect"):
            assert (
                other_call(command(kind, {"connection_id": identity}))["error"]["code"]
                == "NOT_FOUND"
            )
            assert (
                call(command(kind, {"connection_id": second}))["error"]["code"]
                == "NOT_FOUND"
            )
        forbidden = command(
            "agent.create",
            {
                "display_name": "Foreign",
                "handle": "foreign",
                "config": {
                    "soul": "",
                    "instructions": "",
                    "model": identity + ":test-model",
                },
            },
        )
        assert other_call(forbidden)["error"]["code"] == "MODEL_UNAVAILABLE"
        other_start.current.kill()
        other_start.current.wait(timeout=10)
        other_start(overrides={"NMA_OWNER_ID": owner2})
        assert (
            other_call(command("connection.models", {"connection_id": identity}))[
                "error"
            ]["code"]
            == "NOT_FOUND"
        )
    finally:
        second_gateway.close()


def test_oauth_restart_cancel_denial_session_and_callback_replay(runtime):
    root, _, call, start, *_ = runtime
    session = "a" * 64
    result = call(
        command(
            "provider_auth.start",
            {
                "provider": "openrouter",
                "label": "OAuth owner",
                "session_binding": session,
            },
        )
    )["result"]
    params = {"attempt_id": result["attempt_id"], "session_binding": session}
    assert (
        call(command("provider_auth.status", {**params, "session_binding": "b" * 64}))[
            "error"
        ]["code"]
        == "NOT_FOUND"
    )
    assert "verifier" not in str(result)
    start.current.kill()
    start.current.wait(timeout=10)
    start()
    assert (
        call(command("provider_auth.status", params))["result"]["status"] == "pending"
    )
    assert (
        call(command("provider_auth.cancel", params))["result"]["status"] == "cancelled"
    )

    import httpx

    assert httpx.get(result["authorize_url"], trust_env=False).status_code == 400
    callback = (
        "http://127.0.0.1:"
        + str(json.loads((root / "state/provider-relay.json").read_text())["port"])
        + "/auth/callback"
    )
    response = httpx.get(
        callback + "?state=unknown-invalid-state-value&code=replayed-code",
        trust_env=False,
    )
    assert response.status_code == 400
    assert (
        call(command("provider_auth.status", params))["result"]["status"] == "cancelled"
    )
    assert oct((root / "state/provider-secrets").stat().st_mode & 0o777) == "0o700"
