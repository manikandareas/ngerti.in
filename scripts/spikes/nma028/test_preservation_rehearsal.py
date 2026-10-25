"""Supplemental controlled-model preservation through real native gateway APIs."""

# ruff: noqa: F811 - imported pytest yield fixture is intentionally named runtime

import hashlib
import json
import os
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
sys.path[:0] = [str(ROOT / "apps/engine/tests"), str(ROOT / "apps/engine/src")]
from test_backup import (
    test_complete_partition_restore_and_preserve_new_writes as partition_contract,
)
from test_capabilities import capability_agent
from test_context import read, remember
from test_direct_messages import send, snapshot
from test_goals import create
from test_runtime import command, runtime, settle  # noqa: F401
from test_runtime import (
    test_second_gateway_cannot_take_partition as sole_owner_contract,
)


def domain_state(value):
    # Owner-wide replay watermarks advance while the other seeded threads run;
    # their changing cursor is not a mutation of this conversation's domain data.
    if isinstance(value, dict):
        return {
            key: domain_state(item)
            for key, item in value.items()
            if key != "through_sequence"
        }
    if isinstance(value, list):
        return [domain_state(item) for item in value]
    return value


def test_goal_skill_memory_file_and_receipts_survive_disposable_restore(
    runtime, tmp_path
):
    root, provider, call, *_ = runtime
    if os.environ.get("NMA_TEST_LIVE_ENV"):
        pytest.fail(
            "This supplemental rehearsal must use only the controlled local model fixture"
        )
    catalog = {
        "tool_grants": {"files": {"enabled": True, "toolset": "nma_workspace"}},
        "skill_refs": {
            "preserved-skill": {
                "enabled": True,
                "content": "PRESERVED_SKILL_INSTRUCTION",
            }
        },
    }
    (root / "capabilities.json").write_text(json.dumps(catalog))
    catalog_copy = tmp_path / "server-capability-catalog.json"
    catalog_copy.write_text(json.dumps(catalog))
    agent = capability_agent(call, "preservation-agent", skill_refs=["preserved-skill"])
    thread = call(
        command(
            "thread.create",
            {
                "kind": "dm",
                "title": "Preservation DM",
                "agent_ids": [agent["agent_id"]],
            },
        )
    )["result"]["thread"]
    request = send(
        thread,
        "Preserve this synthetic private conversation and its source attribution.",
    )
    initial_receipt = call(request)["result"]
    settle(call, initial_receipt["run_id"])
    remember(
        call,
        agent,
        thread,
        "Synthetic private memory retained across restore.",
        private=True,
    )
    create(call, thread, "preservation-goal")
    goal = snapshot(call, thread)["goals"][0]
    call(command("goal.stop", {"goal_id": goal["goal_id"]}))
    skill = root / "state/skills/user-preserved/SKILL.md"
    skill.parent.mkdir(parents=True, exist_ok=True)
    skill_bytes = b"---\nname: user-preserved\ndescription: Synthetic authored preservation fixture.\n---\n\nRetain the authored workflow bytes and provenance.\n"
    skill.write_bytes(skill_bytes)
    before = snapshot(call, thread)
    before_context = read(call, agent, thread)
    before_requests = len(provider.requests)
    sole_owner_contract(runtime)
    assert len(provider.requests) == before_requests
    # This existing contract uses real SQLite, live-owner lock refusal,
    # immutable artifact bytes, stopped goals, quarantined restore and later
    # writes retained in a separate post-cutover snapshot. It uses no provider.
    partition_contract(runtime, tmp_path)
    # The capability catalog is an external operator configuration obligation,
    # intentionally restored separately from the complete native profile.
    (root / "capabilities.json").write_bytes(catalog_copy.read_bytes())
    assert domain_state(snapshot(call, thread)) == domain_state(before)
    assert read(call, agent, thread) == before_context
    assert skill.read_bytes() == skill_bytes
    agents = call(command("agent.list", {"after": None, "limit": 100}))["result"][
        "items"
    ]
    restored_agent = next(a for a in agents if a["agent_id"] == agent["agent_id"])
    assert restored_agent["config"] == agent["config"]
    count = len(provider.requests)
    retry = call(request)["result"]
    assert retry["run_id"] == initial_receipt["run_id"]
    assert len(provider.requests) == count
    assert snapshot(call, thread)["goals"][0]["status"] == "stopped"
    report = {
        "classification": "supplemental controlled-model fixture; not paired live baseline",
        "provider_requests_external": 0,
        "agent_id": agent["agent_id"],
        "thread_id": thread["thread_id"],
        "goal_id": goal["goal_id"],
        "preserved_run_id": initial_receipt["run_id"],
        "stopped_goal_retained": True,
        "memory_and_provenance_identical": True,
        "agent_config_and_skill_assignment_identical": True,
        "authored_skill_sha256": hashlib.sha256(skill_bytes).hexdigest(),
        "separate_server_catalog_sha256": hashlib.sha256(
            catalog_copy.read_bytes()
        ).hexdigest(),
        "retry_did_not_execute_model_or_effect": True,
        "sole_owner_contract_passed": True,
        "complete_partition_contract": json.loads(
            (root / "backup-rehearsal.json").read_text()
        ),
    }
    output = os.environ.get("NMA028_PRESERVATION_FIXTURE_OUTPUT")
    if output:
        Path(output).write_text(json.dumps(report, indent=2) + "\n")
