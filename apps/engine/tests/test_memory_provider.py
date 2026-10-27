"""Actual self-hosted Hindsight: native provider contract, namespaces and deletion."""

# ruff: noqa: F811
import json
import os
import sqlite3
from pathlib import Path

import httpx
import pytest
from conversation_fixtures import legacy_dm
from test_capabilities import capability_agent
from test_learning import conversation, inventory, invoke
from test_runtime import command, runtime  # noqa: F401

pytestmark = pytest.mark.skipif(
    not os.environ.get("NMA_TEST_MEMORY_PROVIDER_FILE"),
    reason="Requires an actual isolated self-hosted memory service",
)


def test_self_hosted_provider_recall_export_correction_deletion_restart(runtime):
    root, model, call, start, *_ = runtime
    start.current.kill()
    start.current.wait(timeout=10)
    start(
        overrides={
            "NMA_MEMORY_PROVIDER_FILE": os.environ["NMA_TEST_MEMORY_PROVIDER_FILE"]
        }
    )
    agent, peer = (
        capability_agent(call, "provider-memory"),
        capability_agent(call, "provider-peer"),
    )
    dm, peer_dm = conversation(call, agent), conversation(call, peer)
    group = conversation(call, agent, "group", [peer])
    result = invoke(
        model,
        call,
        dm,
        "memory",
        {
            "action": "add",
            "target": "user",
            "content": "The user's favorite color is turquoise.",
        },
    )
    assert result.get("success") and result.get("provider_status") == "ready", result

    def provider(agent, thread, action, **extra):
        response = call(
            command(
                "learning.provider",
                {
                    "agent_id": agent["agent_id"],
                    "thread_id": thread["thread_id"],
                    "action": action,
                    **extra,
                },
            )
        )
        assert "result" in response, response
        return response["result"]

    recalled = provider(agent, dm, "recall", query="What is the user's favorite color?")
    assert "turquoise" in json.dumps(recalled["result"]).lower(), recalled
    assert "turquoise" not in json.dumps(
        provider(peer, peer_dm, "recall", query="Favorite color")
    )
    assert "turquoise" not in json.dumps(
        provider(peer, group, "recall", query="Favorite color")
    )
    exported = provider(agent, dm, "export")
    assert exported["documents"] and "turquoise" in json.dumps(exported["documents"])
    secondary_dm = legacy_dm(root, call, agent)
    secondary = provider(agent, secondary_dm, "recall", query="Favorite color")
    assert "turquoise" in json.dumps(secondary["result"]).lower()
    memory = inventory(call, agent, dm)["memories"][0]
    body = command(
        "learning.memory",
        {
            "agent_id": agent["agent_id"],
            "thread_id": dm["thread_id"],
            "memory_id": memory["memory_id"],
            "action": "correct",
            "content": "The user's favorite color is violet.",
        },
    )
    body["expected_revision"] = memory["revision"]
    corrected = call(body)
    assert corrected.get("result", {}).get("provider_status") == "ready", corrected
    changed = provider(agent, dm, "recall", query="What is the user's favorite color?")
    assert (
        "violet" in json.dumps(changed["result"]).lower()
        and changed["bank_id"] != recalled["bank_id"]
    )
    with sqlite3.connect(root / "state/state.db") as db:
        assert db.execute(
            "SELECT status FROM nma_memory_provider_banks WHERE bank_id=?",
            (secondary["bank_id"],),
        ).fetchone() == ("deleted",)
    service = json.loads(Path(os.environ["NMA_TEST_MEMORY_PROVIDER_FILE"]).read_text())[
        "base_url"
    ]
    banks = httpx.get(service + "/v1/default/banks", trust_env=False).json()
    assert secondary["bank_id"] not in {bank["bank_id"] for bank in banks["banks"]}
    start.current.kill()
    start.current.wait(timeout=10)
    start(
        overrides={
            "NMA_MEMORY_PROVIDER_FILE": os.environ["NMA_TEST_MEMORY_PROVIDER_FILE"]
        }
    )
    assert provider(agent, dm, "export")["bank_id"] == changed["bank_id"]
    body = command("learning.memory", {**body["payload"], "action": "forget"})
    body["expected_revision"] = "2"
    forgotten = call(body)
    assert forgotten.get("result", {}).get("provider_status") == "ready", forgotten
    assert (
        provider(agent, dm, "recall", query="Favorite color")["result"]["results"] == []
    )
    assert provider(agent, dm, "export")["documents"] == []
