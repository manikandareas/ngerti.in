"""App setup, native transports, OAuth callbacks, revocation and protocol behavior."""

# ruff: noqa: F811 - shared gateway fixture

import json
import os
import socket
import sqlite3
import subprocess
import sys
import time
from contextlib import contextmanager
from pathlib import Path
from urllib.parse import parse_qs, urlsplit
from uuid import uuid4

import httpx
import pytest
from test_capabilities import capability_agent, capability_submit
from test_direct_messages import public_api  # noqa: F401
from test_runtime import OWNER, command, runtime, settle  # noqa: F401


@contextmanager
def app_server(root, mode="bearer"):
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    receipts = root / ("app-" + mode + ".jsonl")
    receipts.write_text("")
    with (root / ("app-" + mode + ".log")).open("w") as log:
        process = subprocess.Popen(
            [
                sys.executable,
                str(Path(__file__).with_name("app_fixture.py")),
                str(port),
                str(receipts),
                mode,
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
            else:
                raise AssertionError((root / ("app-" + mode + ".log")).read_text())
            yield f"http://127.0.0.1:{port}", receipts
        finally:
            process.terminate()
            process.wait(timeout=10)


def restart(start, origin):
    start.current.kill()
    start.current.wait(timeout=10)
    overrides = {"NMA_APP_ALLOWED_ORIGINS": json.dumps([origin])}
    start(overrides=overrides)
    return overrides


def add(call, origin, method="bearer"):
    identity = str(uuid4())
    response = call(
        command(
            "app.configure",
            {
                "connection_id": identity,
                "application": "n8n",
                "label": "Private workflows",
                "url": origin + "/mcp",
                "auth_method": method,
                **(
                    {"api_key": "nma-disposable-connector-secret"}
                    if method == "bearer"
                    else {}
                ),
            },
        )
    )
    assert "result" in response, response
    return response["result"]


def native_tool(root, suffix, agent_id=None):
    from tools.mcp_tool_schema import mcp_prefixed_tool_name

    with sqlite3.connect(root / "state/state.db") as db:
        names = []
        for (value,) in db.execute(
            "SELECT value FROM state_meta WHERE key LIKE 'gateway.local_policy.v1:%'"
        ):
            policy = json.loads(value)["policy"]
            config = json.loads(policy["config_json"])
            if (
                agent_id
                and config.get("nma_capabilities", {}).get("agent_id") != agent_id
            ):
                continue
            manifest = json.loads(policy.get("editor_mcp_json") or "{}")
            names.extend(
                mcp_prefixed_tool_name(server, suffix)
                for server in manifest.get("names", {}).values()
                if mcp_prefixed_tool_name(server, suffix) in manifest.get("schemas", {})
            )
    assert names
    return names[-1]


def test_app_native_call_restart_filter_and_revoke(runtime):
    root, model, call, start, *_ = runtime
    with app_server(root) as (origin, receipts):
        restart(start, origin)
        app = add(call, origin)
        identity = {"connection_id": app["connection_id"]}
        discovered = call(command("app.discover", identity))
        assert "result" in discovered, discovered
        app = discovered["result"]
        assert app["status"] == "connected" and len(app["tools"]) >= 4
        assert "nma-disposable-connector-secret" not in json.dumps(app)
        agent = capability_agent(call, "app-owner", mcp_grants=[app["grant_id"]])
        other = capability_agent(call, "app-without-grant")
        thread = str(uuid4())
        settle(call, capability_submit(call, agent, "APP_DISCOVERY", thread))
        name = native_tool(root, "proof", agent["agent_id"])
        settle(call, capability_submit(call, agent, "CALL_TOOL:" + name, thread))
        settle(call, capability_submit(call, other, "CALL_TOOL:" + name))
        assert receipts.read_text().count('"operation": "proof"') == 1
        restart(start, origin)
        settle(call, capability_submit(call, agent, "CALL_TOOL:" + name, thread))
        assert receipts.read_text().count('"operation": "proof"') == 2
        response = call(
            command(
                "app.select_tools",
                {**identity, "generation": app["generation"], "tools": ["proof"]},
            )
        )
        assert "result" in response, response
        assert (
            call(
                command(
                    "app.select_tools",
                    {**identity, "generation": app["generation"], "tools": ["proof"]},
                )
            )
            == response
        )
        assert (
            call(
                command(
                    "app.select_tools",
                    {
                        **identity,
                        "generation": app["generation"],
                        "tools": ["lost_write"],
                    },
                )
            )["error"]["code"]
            == "ACCESS_REVOKED"
        )
        # A frozen assignment cannot acquire a changed tool boundary implicitly.
        assert "error" in call(
            command(
                "runtime.submit",
                {
                    "agent_id": agent["agent_id"],
                    "thread_id": thread,
                    "config_revision": agent["config_revision"],
                    "context_generation": "1",
                    "text": "CALL_TOOL:" + name,
                },
            )
        )
        assert (
            call(command("app.disconnect", identity))["result"]["status"]
            == "disconnected"
        )
        assert (
            call(command("app.discover", identity))["error"]["code"] == "ACCESS_REVOKED"
        )
        with sqlite3.connect(root / "state/state.db") as db:
            data = "\n".join(db.iterdump())
            assert "nma-disposable-connector-secret" not in data
        assert "nma-disposable-connector-secret" not in json.dumps(model.requests)


def test_native_oauth_web_callback_refresh_and_restart(runtime):
    root, _, call, start, *_ = runtime
    with app_server(root, "oauth") as (origin, receipts):
        restart(start, origin)
        app = add(call, origin, "oauth")
        auth = call(
            command(
                "app_auth.start",
                {
                    "connection_id": app["connection_id"],
                    "session_binding": "browser-one",
                    "redirect_uri": "http://localhost:3000/connections",
                },
            )
        )
        assert "result" in auth, auth
        attempt = auth["result"]["attempt_id"]
        payload = {"attempt_id": attempt, "session_binding": "browser-one"}
        assert (
            call(
                command(
                    "app_auth.status", {**payload, "session_binding": "browser-two"}
                )
            )["error"]["code"]
            == "NOT_FOUND"
        )
        deadline = time.monotonic() + 30
        state = {}
        while time.monotonic() < deadline:
            state = call(command("app_auth.status", payload))["result"]
            if state.get("authorize_url") or state["status"] == "error":
                break
            time.sleep(0.1)
        assert state.get("authorize_url"), state
        response = httpx.get(state["authorize_url"], follow_redirects=False)
        callback_url = response.headers["location"]
        wrong = callback_url.replace(
            parse_qs(urlsplit(callback_url).query)["state"][0], "wrong-state"
        )
        assert (
            call(command("app_auth.callback", {**payload, "callback_url": wrong}))[
                "error"
            ]["code"]
            == "OAUTH_STATE_INVALID"
        )
        result = call(
            command("app_auth.callback", {**payload, "callback_url": callback_url})
        )
        assert "result" in result, result
        assert (
            call(
                command("app_auth.callback", {**payload, "callback_url": callback_url})
            )["result"]["status"]
            == "callback_received"
        )
        while time.monotonic() < deadline:
            state = call(command("app_auth.status", payload))["result"]
            if state["status"] in {"approved", "error"}:
                break
            time.sleep(0.1)
        assert state["status"] == "approved", state
        saved = next(
            item
            for item in call(command("app.list", {}))["result"]["items"]
            if item["connection_id"] == app["connection_id"]
        )
        assert saved["status"] == "connected", saved
        from utils import fast_safe_load

        profile = fast_safe_load((root / "state/config.yaml").read_text())
        native_entries = [
            v for k, v in profile.get("mcp_servers", {}).items() if k.startswith("app_")
        ]
        assert native_entries and all(v.get("enabled") is False for v in native_entries)
        assert all("oauth" not in v for v in native_entries)
        time.sleep(4)
        restart(start, origin)
        checked = call(command("app.discover", {"connection_id": app["connection_id"]}))
        assert "result" in checked, checked
        assert '"refresh_token"' not in json.dumps(checked)
        assert '"grant_type": ["refresh_token"]' in receipts.read_text()


def test_native_forms_sampling_and_pending_revoke(runtime):
    root, model, call, start, *_ = runtime
    with app_server(root) as (origin, receipts):
        restart(start, origin)
        app = add(call, origin)
        app = call(command("app.discover", {"connection_id": app["connection_id"]}))[
            "result"
        ]
        agent = capability_agent(call, "app-protocol", mcp_grants=[app["grant_id"]])
        thread = agent["primary_dm_thread_id"]
        settle(call, capability_submit(call, agent, "APP_DISCOVERY", thread))
        run = capability_submit(
            call,
            agent,
            "CALL_TOOL:" + native_tool(root, "form", agent["agent_id"]),
            thread,
        )
        deadline = time.monotonic() + 15
        items = []
        while time.monotonic() < deadline:
            response = call(command("app.interactions", {}))
            assert "result" in response, response
            items = response["result"]["items"]
            if items:
                break
            time.sleep(0.1)
        assert len(items) == 1, call(command("runtime.read", {"run_id": run}))
        item = items[0]
        assert item["thread_id"] == thread
        assert "error" in call(
            command(
                "app.answer",
                {
                    "interaction_id": item["interaction_id"],
                    "action": "accept",
                    "content": {},
                },
            )
        )
        response = call(
            command(
                "app.answer",
                {
                    "interaction_id": item["interaction_id"],
                    "action": "accept",
                    "content": {"topic": "Verified topic"},
                },
            )
        )
        assert "result" in response, response
        settle(call, run)
        assert '"action": "accept"' in receipts.read_text()
        run = capability_submit(
            call,
            agent,
            "CALL_TOOL:" + native_tool(root, "sampling", agent["agent_id"]),
            thread,
        )
        settle(call, run)
        assert '"operation": "sampling"' in receipts.read_text()
        assert any(
            "APP_SAMPLING_PROOF" in json.dumps(request) for request in model.requests
        )
        run = capability_submit(
            call,
            agent,
            "CALL_TOOL:" + native_tool(root, "form", agent["agent_id"]),
            thread,
        )
        deadline = time.monotonic() + 15
        while time.monotonic() < deadline:
            items = call(command("app.interactions", {}))["result"]["items"]
            if items:
                break
            time.sleep(0.1)
        assert len(items) == 1
        call(command("app.disconnect", {"connection_id": app["connection_id"]}))
        assert "error" in call(
            command(
                "app.answer",
                {
                    "interaction_id": items[0]["interaction_id"],
                    "action": "accept",
                    "content": {"topic": "Too late"},
                },
            )
        )
        assert call(command("app.interactions", {}))["result"]["items"] == []
        assert receipts.read_text().count('"action": "accept"') == 1


def test_native_stdio_isolated_process(runtime):
    image = os.environ.get("NMA_TEST_NATIVE_IMAGE")
    if not image:
        pytest.skip("The pinned native image is an explicit integration prerequisite")
    root, model, call, start, *_ = runtime
    source = """import os
from mcp.server.mcpserver import MCPServer
s = MCPServer('isolated app')
@s.tool()
def proof() -> str:
    assert os.getuid() == 10001
    assert not os.environ.get('OPENAI_API_KEY')
    assert os.environ.get('APP_TOKEN') == 'nma-disposable-connector-secret'
    return 'STDIO_ISOLATION_PROOF'
s.run(transport='stdio')
"""
    profiles = root / "app-servers.json"
    profiles.write_text(
        json.dumps(
            {
                "workspace-test": {
                    "application": "google-workspace",
                    "image": image,
                    "command": ["/opt/native/bin/python", "-c", source],
                    "credential_env": {"APP_TOKEN": "api_key"},
                }
            }
        )
    )
    start.current.kill()
    start.current.wait(timeout=10)
    start(overrides={"NMA_APP_SERVERS_FILE": str(profiles)})
    app = call(
        command(
            "app.configure",
            {
                "connection_id": str(uuid4()),
                "application": "google-workspace",
                "label": "Isolated workspace",
                "stdio_profile": "workspace-test",
                "auth_method": "bearer",
                "api_key": "nma-disposable-connector-secret",
            },
        )
    )["result"]
    response = call(command("app.discover", {"connection_id": app["connection_id"]}))
    assert "result" in response, response
    agent = capability_agent(call, "app-stdio", mcp_grants=[app["grant_id"]])
    thread = agent["primary_dm_thread_id"]
    settle(call, capability_submit(call, agent, "APP_DISCOVERY", thread))
    run = capability_submit(
        call,
        agent,
        "CALL_TOOL:" + native_tool(root, "proof", agent["agent_id"]),
        thread,
    )
    settle(call, run)
    assert "STDIO_ISOLATION_PROOF" in json.dumps(model.requests)
    assert "nma-disposable-connector-secret" not in json.dumps(model.requests)
    result = call(command("app.disconnect", {"connection_id": app["connection_id"]}))[
        "result"
    ]
    assert result["process_cleanup"] == "confirmed"


def test_native_unknown_write_is_not_replayed_after_restart(runtime):
    root, _, call, start, *_ = runtime
    with app_server(root) as (origin, receipts):
        restart(start, origin)
        app = add(call, origin)
        app = call(command("app.discover", {"connection_id": app["connection_id"]}))[
            "result"
        ]
        agent = capability_agent(
            call, "app-unknown-write", mcp_grants=[app["grant_id"]]
        )
        thread = agent["primary_dm_thread_id"]
        settle(call, capability_submit(call, agent, "APP_DISCOVERY", thread))
        name = native_tool(root, "lost_write", agent["agent_id"])
        body = command(
            "runtime.submit",
            {
                "agent_id": agent["agent_id"],
                "thread_id": thread,
                "config_revision": agent["config_revision"],
                "context_generation": "1",
                "text": "CALL_TOOL:" + name,
            },
        )
        response = call(body)
        run = response["result"]["run_id"]
        deadline = time.monotonic() + 20
        while (
            '"operation": "lost_write"' not in receipts.read_text()
            and time.monotonic() < deadline
        ):
            time.sleep(0.1)
        assert receipts.read_text().count('"operation": "lost_write"') == 1
        restart(start, origin)
        settle(call, run, "indeterminate")
        assert call(body) == response
        queued = capability_submit(call, agent, "CALL_TOOL:" + name, thread)
        time.sleep(0.5)
        assert (
            call(command("runtime.read", {"run_id": queued}))["result"]["status"]
            == "queued"
        )
        assert "result" in call(command("run.cancel", {"run_id": queued}))
        settle(call, queued, "cancelled")
        assert receipts.read_text().count('"operation": "lost_write"') == 1
        with sqlite3.connect(root / "state/state.db") as db:
            outcome = db.execute(
                "SELECT semantics,phase FROM nma_effect_outcomes WHERE run_id=?", (run,)
            ).fetchone()
            assert outcome[0] == "mutation"
            assert (
                db.execute(
                    "SELECT status FROM nma_effects WHERE run_id=?", (run,)
                ).fetchone()[0]
                != "confirmed"
            )


def test_native_declared_cost_consent_and_configuration_fence(runtime):
    root, _, call, start, *_ = runtime
    with app_server(root) as (origin, receipts):
        restart(start, origin)
        app = add(call, origin)
        options = root / "app-options.json"
        options.write_text(
            json.dumps(
                {
                    OWNER: {
                        app["connection_id"]: {
                            "tool_costs": {"proof": 2},
                            "spend_limit": 1,
                        }
                    }
                }
            )
        )
        start.current.kill()
        start.current.wait(timeout=10)
        start(
            overrides={
                "NMA_APP_ALLOWED_ORIGINS": json.dumps([origin]),
                "NMA_APP_OPTIONS_FILE": str(options),
            }
        )
        app = call(command("app.discover", {"connection_id": app["connection_id"]}))[
            "result"
        ]
        agent = capability_agent(call, "app-costed", mcp_grants=[app["grant_id"]])
        thread = agent["primary_dm_thread_id"]
        settle(call, capability_submit(call, agent, "APP_DISCOVERY", thread))
        name = native_tool(root, "proof", agent["agent_id"])
        run = capability_submit(call, agent, "CALL_TOOL:" + name, thread)
        deadline = time.monotonic() + 20
        items = []
        while not items and time.monotonic() < deadline:
            items = call(command("app.interactions", {}))["result"]["items"]
            time.sleep(0.1)
        assert len(items) == 1
        assert "2 credits" in items[0]["message"]
        assert '"operation": "proof"' not in receipts.read_text()
        assert "result" in call(
            command(
                "app.answer",
                {
                    "interaction_id": items[0]["interaction_id"],
                    "action": "accept",
                    "content": {},
                },
            )
        )
        settle(call, run)
        assert receipts.read_text().count('"operation": "proof"') == 1
        options.write_text(
            json.dumps(
                {
                    OWNER: {
                        app["connection_id"]: {
                            "tool_costs": {"proof": 3},
                            "spend_limit": 1,
                        }
                    }
                }
            )
        )
        denied = call(
            command(
                "runtime.submit",
                {
                    "agent_id": agent["agent_id"],
                    "thread_id": thread,
                    "config_revision": agent["config_revision"],
                    "context_generation": "1",
                    "text": "CALL_TOOL:" + name,
                },
            )
        )
        assert "error" in denied
        assert receipts.read_text().count('"operation": "proof"') == 1


def test_public_app_api_keeps_metadata_private(runtime, public_api):
    from urllib.error import HTTPError

    root, _, _, start, *_ = runtime
    with app_server(root) as (origin, _):
        restart(start, origin)
        listing = public_api("/apps")
        assert listing.headers["Cache-Control"] == "no-store"
        assert {a["id"] for a in json.load(listing)["applications"]} == {
            "notion",
            "linear",
            "github",
            "google-workspace",
        }
        identity = str(uuid4())
        body = {
            "connection_id": identity,
            "application": "n8n",
            "label": "API account",
            "url": origin + "/mcp",
            "auth_method": "bearer",
            "api_key": "nma-disposable-connector-secret",
        }
        saved = json.load(public_api("/apps", body))
        assert saved["connection_id"] == identity
        assert "api_key" not in json.dumps(saved)
        tools = public_api("/apps/" + identity + "/discover", {})
        assert tools.headers["Cache-Control"] == "no-store"
        assert json.load(tools)["status"] == "connected"
        with pytest.raises(HTTPError) as denied:
            public_api("/apps", {**body, "owner_id": str(uuid4())})
        assert denied.value.code == 422
