"""Catalog upgrades preserve old immutable grants without silently widening them."""

# ruff: noqa: F811 - shared real gateway fixture

import json
import sqlite3

from test_capabilities import capability_agent
from test_direct_messages import send
from test_runtime import command, runtime, settle  # noqa: F401


def test_version_two_catalog_preserves_old_grant_bytes_and_requires_new_access_for_surface_changes(
    runtime,
):
    root, provider, call, start, *_ = runtime
    path = root / "capabilities.json"
    catalog = {"tool_grants": {"tasks": {"enabled": True, "toolset": "todo"}}}
    path.write_text(json.dumps(catalog))
    agent = capability_agent(call, "preserved-catalog-grant", tool_grants=["tasks"])
    thread = call(command("thread.read", {"thread_id": agent["primary_dm_thread_id"]}))[
        "result"
    ]
    with sqlite3.connect(root / "state/state.db") as conn:
        before = conn.execute(
            "SELECT config FROM nma_agent_configs WHERE agent_id=?",
            (agent["agent_id"],),
        ).fetchone()[0]
    catalog.update(version=2)
    path.write_text(json.dumps(catalog))
    response = call(send(thread, "USE_TOOL"))
    assert "result" in response, response
    settle(call, response["result"]["run_id"])
    start.current.kill()
    start.current.wait(timeout=10)
    start()
    response = call(send(thread, "AFTER_CATALOG_UPGRADE_RESTART"))
    assert "result" in response, response
    settle(call, response["result"]["run_id"])
    with sqlite3.connect(root / "state/state.db") as conn:
        after = conn.execute(
            "SELECT config FROM nma_agent_configs WHERE agent_id=?",
            (agent["agent_id"],),
        ).fetchone()[0]
    assert before == after
    count = len(provider.requests)
    catalog["tool_grants"]["tasks"]["execution_surface"] = "changed-boundary"
    path.write_text(json.dumps(catalog))
    denied = call(send(thread, "NO_SILENT_SURFACE_CHANGE"))
    assert denied["error"]["code"] in {"ACCESS_REVOKED", "CAPABILITY_UNAVAILABLE"}, (
        denied
    )
    assert len(provider.requests) == count
