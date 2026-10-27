"""Screen/vault API authorization through the production gateway and native worker."""

# ruff: noqa: F811
import json
import os
import sqlite3
from uuid import uuid4

import pytest
from test_capabilities import capability_agent
from test_runtime import command, runtime  # noqa: F401

pytestmark = pytest.mark.skipif(
    not os.environ.get("NMA_TEST_DESKTOP_IMAGE"),
    reason="Requires the reviewed desktop image",
)


def test_screen_grants_and_model_blind_vault_roundtrip(runtime):
    root, _, call, start, *_ = runtime
    image = os.environ["NMA_TEST_DESKTOP_IMAGE"]
    (root / "capabilities.json").write_text(
        json.dumps(
            {
                "version": 2,
                "execution_surfaces": {
                    "linux": {"ready": True, "kind": "scoped_linux", "image": image}
                },
                "tool_grants": {
                    "browser": {
                        "enabled": True,
                        "toolset": "browser",
                        "execution_surface": "linux",
                    }
                },
            }
        )
    )
    agent = capability_agent(call, "screen-vault-owner", tool_grants=["browser"])
    thread = agent["primary_dm_thread_id"]

    def screen(action, **extra):
        return call(
            command(
                "screen.action",
                {
                    "thread_id": thread,
                    "agent_id": agent["agent_id"],
                    "action": action,
                    **extra,
                },
            )
        )

    first = screen("connect")["result"]
    assert first["control"] == "agent"
    grant = first["grant"]
    assert screen("takeover", grant=grant)["result"]["control"] == "human"
    assert screen("frame", grant=grant)["result"]["image"].startswith(
        "data:image/png;base64,"
    )
    foreign = command(
        "screen.action",
        {
            "thread_id": str(uuid4()),
            "agent_id": agent["agent_id"],
            "action": "frame",
            "grant": grant,
        },
    )
    assert call(foreign)["error"]["code"] == "NOT_FOUND"
    wrong = screen("frame", grant="f" * 64)
    assert wrong["error"]["code"] == "SCREEN_ACCESS_REFUSED"
    secret = "disposable-native-vault-secret-" + uuid4().hex
    payload = {
        "thread_id": thread,
        "agent_id": agent["agent_id"],
        "action": "add",
        "item": {
            "label": "Disposable login",
            "origin": "https://fixture.example",
            "identifier": "fixture",
            "password": secret,
            "otp_secret": "",
        },
    }
    add = command("browser.vault", payload)
    created = call(add)["result"]
    assert "password" not in json.dumps(created)
    assert call(add)["result"] == created
    listing = call(command("browser.vault", {**payload, "action": "list", "item": {}}))[
        "result"
    ]
    assert [item["id"] for item in listing["items"]] == [created["id"]]
    assert screen("revoke", grant=grant)["result"]["control"] == "disconnected"
    assert screen("frame", grant=grant)["error"]["code"] == "SCREEN_ACCESS_REFUSED"
    start.current.kill()
    start.current.wait(timeout=10)
    start()
    reconnect = screen("connect")["result"]
    assert reconnect["control"] == "disconnected"
    assert screen("resume", grant=reconnect["grant"])["result"]["control"] == "agent"
    assert call(add)["result"] == created
    removed = call(
        command(
            "browser.vault",
            {**payload, "action": "delete", "item": {"handle": created["id"]}},
        )
    )["result"]
    assert removed["deleted"] is True
    from ngertiin_engine.native_executor import IsolatedTools, Scope

    journal = next((root / "state/native-execution").glob("*/isolated-tools.db"))
    broker = IsolatedTools(
        journal.parent, __import__("test_runtime").OWNER, image=image
    )
    with sqlite3.connect(journal) as conn:
        scope = Scope(
            **json.loads(conn.execute("SELECT scope_json FROM scopes").fetchone()[0])
        )
    broker._docker(
        "exec", broker.ensure(scope)["container"], "pkill", "-9", "-x", "Xvfb"
    )
    assert (
        screen("frame", grant=reconnect["grant"])["error"]["code"]
        == "CAPABILITY_UNAVAILABLE"
    )
    assert screen("pause", grant=reconnect["grant"])["result"]["paused"] is True
    after_pause = screen("connect")["result"]
    assert after_pause["control"] == "disconnected"
    assert screen("resume", grant=after_pause["grant"])["result"]["control"] == "agent"
    with sqlite3.connect(root / "state/state.db") as conn:
        assert secret.encode() not in b"\n".join(
            str(row).encode() for row in conn.iterdump()
        )
    native = list((root / "state/native-execution").glob("*/isolated-tools.db"))
    for path in native:
        with sqlite3.connect(path) as conn:
            assert secret.encode() not in b"\n".join(
                str(row).encode() for row in conn.iterdump()
            )
    vault = root / "state/vault"
    assert all(
        secret.encode() not in p.read_bytes() for p in vault.iterdir() if p.is_file()
    )
    for path in native:
        IsolatedTools(
            path.parent,
            agent["owner_id"]
            if "owner_id" in agent
            else __import__("test_runtime").OWNER,
            image=image,
        ).cleanup()
