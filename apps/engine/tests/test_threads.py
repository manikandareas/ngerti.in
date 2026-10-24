"""DM/group consumers preserve authoritative identities and native context boundaries."""

# ruff: noqa: F811
import json
import sqlite3
from uuid import uuid4

from test_runtime import command, runtime, settle  # noqa: F401


def create_agent(call, handle):
    return call(
        command(
            "agent.create",
            {
                "display_name": handle,
                "handle": handle,
                "config": {
                    "soul": f"SOUL_{handle}",
                    "instructions": "",
                    "model": "test",
                },
            },
        )
    )["result"]["agent"]


def test_dm_group_identity_config_restart_and_context(runtime):
    root, provider, call, start, *_ = runtime
    researcher = create_agent(call, "identity-researcher")
    writer = create_agent(call, "identity-writer")
    outsider = create_agent(call, "identity-outsider")
    dm_command = command(
        "thread.create",
        {
            "kind": "dm",
            "title": "Private research",
            "agent_ids": [researcher["agent_id"]],
        },
    )
    dm_receipt = call(dm_command)
    assert call(dm_command) == dm_receipt
    dm = dm_receipt["result"]["thread"]
    group = call(
        command(
            "thread.create",
            {
                "kind": "group",
                "title": "Shared research",
                "agent_ids": [researcher["agent_id"], writer["agent_id"]],
            },
        )
    )["result"]["thread"]
    assert dm["agents"][0] == group["agents"][0] == researcher
    assert dm["dm_agent_id"] == researcher["agent_id"] and group["dm_agent_id"] is None
    listing = call(command("thread.list", {"after": None}))["result"]["items"]
    assert (
        next(t for t in listing if t["thread_id"] == dm["thread_id"])["dm_agent_id"]
        == researcher["agent_id"]
    )
    assert (
        next(t for t in listing if t["thread_id"] == group["thread_id"])["dm_agent_id"]
        is None
    )

    def submit(thread, agent, text):
        return call(
            command(
                "runtime.submit",
                {
                    "thread_id": thread["thread_id"],
                    "agent_id": agent["agent_id"],
                    "config_revision": agent["config_revision"],
                    "context_generation": thread["context_generation"],
                    "text": text,
                },
            )
        )

    before = len(provider.requests)
    private = submit(dm, researcher, "PRIVATE_DM_CONTEXT_PROOF")["result"]
    settle(call, private["run_id"])
    before_group = len(provider.requests)
    shared = submit(group, researcher, "SHARED_GROUP_CONTEXT_PROOF")["result"]
    settle(call, shared["run_id"])
    assert private["agent_id"] == shared["agent_id"] == researcher["agent_id"]
    assert private["thread_id"] != shared["thread_id"]
    assert "PRIVATE_DM_CONTEXT_PROOF" in json.dumps(
        provider.requests[before:before_group]
    )
    assert "PRIVATE_DM_CONTEXT_PROOF" not in json.dumps(
        provider.requests[before_group:]
    )
    assert submit(group, outsider, "DENIED")["error"]["code"] == "NOT_FOUND"
    assert submit(dm, writer, "DENIED")["error"]["code"] == "NOT_FOUND"
    update = command(
        "agent.configure",
        {
            "agent_id": researcher["agent_id"],
            "display_name": "Researcher updated",
            "handle": researcher["handle"],
            "config": {**researcher["config"], "soul": "UPDATED_SHARED_IDENTITY"},
        },
    )
    update["expected_revision"] = researcher["revision"]
    updated = call(update)["result"]["agent"]
    for thread in (dm, group):
        value = call(command("thread.read", {"thread_id": thread["thread_id"]}))[
            "result"
        ]
        assert value["agents"][0] == updated
    start.current.kill()
    start.current.wait(timeout=10)
    start()
    assert call(dm_command) == dm_receipt
    for thread in (dm, group):
        value = call(command("thread.read", {"thread_id": thread["thread_id"]}))[
            "result"
        ]
        assert value["agents"][0] == updated
    before = len(provider.requests)
    settle(call, submit(group, updated, "UPDATED_GROUP_RUN")["result"]["run_id"])
    assert "UPDATED_SHARED_IDENTITY" in json.dumps(provider.requests[before:])
    assert "PRIVATE_DM_CONTEXT_PROOF" not in json.dumps(provider.requests[before:])
    archive = command("agent.archive", {"agent_id": updated["agent_id"]})
    archive["expected_revision"] = updated["revision"]
    archived = call(archive)["result"]["agent"]
    assert (
        call(command("thread.read", {"thread_id": group["thread_id"]}))["result"][
            "agents"
        ][0]
        == archived
    )
    assert "error" in submit(group, updated, "ARCHIVED_DENIED")
    with sqlite3.connect(root / "state/state.db") as db:
        assert db.execute("PRAGMA foreign_key_check").fetchall() == []
        assert (
            db.execute(
                "SELECT COUNT(*) FROM nma_agents WHERE agent_id=?",
                (researcher["agent_id"],),
            ).fetchone()[0]
            == 1
        )


def test_thread_validation_and_unknown_owner_identity(runtime):
    _, _, call, *_ = runtime
    a = create_agent(call, "validation-a")
    b = create_agent(call, "validation-b")
    for kind, ids in [
        ("dm", []),
        ("dm", [a["agent_id"], b["agent_id"]]),
        ("group", [a["agent_id"]]),
        ("group", [a["agent_id"], a["agent_id"]]),
        ("group", [a["agent_id"], str(uuid4())]),
    ]:
        assert "error" in call(
            command(
                "thread.create", {"kind": kind, "title": "Invalid", "agent_ids": ids}
            )
        )
    assert (
        call(command("thread.read", {"thread_id": str(uuid4())}))["error"]["code"]
        == "NOT_FOUND"
    )
    items = call(command("thread.list", {"after": None}))["result"]["items"]
    assert all(
        set(item) == {"thread_id", "kind", "title", "dm_agent_id"} for item in items
    )


def test_thread_additive_migration_from_agent_schema(runtime):
    root, _, call, start, *_ = runtime
    agent = create_agent(call, "migration-preserved")
    start.current.kill()
    start.current.wait(timeout=10)
    with sqlite3.connect(root / "state/state.db") as db:
        for table in (
            "nma_dm_requests",
            "nma_run_terminals",
            "nma_effects",
            "nma_run_events",
            "nma_stream",
            "nma_run_stops",
            "nma_context_run_fences",
            "nma_context_receipts",
            "nma_scope_grants",
            "nma_memory_entries",
            "nma_messages",
        ):
            db.execute(f"DROP TABLE {table}")
        db.execute("DROP TABLE nma_memberships")
        db.execute("DROP TABLE nma_threads")
        db.execute("DELETE FROM nma_schema_migrations WHERE version>=3")
        db.execute("UPDATE nma_partition SET schema_version=2")
    start()
    assert (
        agent
        in call(command("agent.list", {"after": None, "limit": 100}))["result"]["items"]
    )
    assert call(command("thread.list", {"after": None}))["result"]["items"] == []
