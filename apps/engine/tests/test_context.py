"""Private/shared fixtures through the signed service and actual model requests."""

# ruff: noqa: F811
import json
import sqlite3
from uuid import uuid4

from ngertiin_engine.contracts import sign
from test_runtime import KEY, command, runtime, settle  # noqa: F401
from test_threads import create_agent


def thread(call, kind, agents):
    return call(
        command(
            "thread.create",
            {"kind": kind, "title": kind, "agent_ids": [a["agent_id"] for a in agents]},
        )
    )["result"]["thread"]


def read(call, agent, channel):
    return call(
        command(
            "context.read",
            {"agent_id": agent["agent_id"], "thread_id": channel["thread_id"]},
        )
    )["result"]


def run(call, agent, channel, text):
    generation = read(call, agent, channel)["context_generation"]
    receipt = call(
        command(
            "runtime.submit",
            {
                "agent_id": agent["agent_id"],
                "thread_id": channel["thread_id"],
                "config_revision": agent["config_revision"],
                "context_generation": generation,
                "text": text,
            },
        )
    )
    assert "result" in receipt, receipt
    result = settle(call, receipt["result"]["run_id"])
    assert result["status"] == "succeeded", result
    return receipt["result"]


def remember(call, agent, channel, content, private=False):
    sources = read(call, agent, channel)["messages"]
    body = command(
        "memory.create",
        {
            "scope_kind": "agent_private" if private else "thread_shared",
            "agent_id": agent["agent_id"] if private else None,
            "thread_id": None if private else channel["thread_id"],
            "content": content,
            "source_message_ids": [sources[0]["message_id"]],
        },
    )
    result = call(body)
    assert "result" in result, result
    assert call(body) == result
    return result["result"]


def test_scoped_memory_transcript_transfer_revocation_restart(runtime):
    root, provider, call, start, *_ = runtime
    a, b = create_agent(call, "context-a"), create_agent(call, "context-b")
    dm, other_dm, b_dm = (
        thread(call, "dm", [a]),
        thread(call, "dm", [a]),
        thread(call, "dm", [b]),
    )
    group, other_group = thread(call, "group", [a, b]), thread(call, "group", [a, b])
    # Native profile-wide memory must not enter any product conversation.
    memory_dir = root / "state/memories"
    memory_dir.mkdir(exist_ok=True)
    (memory_dir / "MEMORY.md").write_text("PROFILE_PRIVATE_MARKER")
    (memory_dir / "USER.md").write_text("PROFILE_USER_MARKER")
    run(call, a, dm, "DM_TRANSCRIPT_SECRET")
    run(call, a, group, "GROUP_TRANSCRIPT_SHARED")
    private = remember(call, a, dm, "AGENT_PRIVATE_MARKER", private=True)
    remember(call, a, dm, "DM_ONLY_MEMORY_MARKER")
    remember(call, a, group, "GROUP_MEMORY_MARKER")
    own = read(call, a, dm)
    assert {m["content"] for m in own["memory"]} == {
        "AGENT_PRIVATE_MARKER",
        "DM_ONLY_MEMORY_MARKER",
    }
    assert [m["author_kind"] for m in own["messages"]] == ["user", "agent"]
    assert all(m["thread_id"] == dm["thread_id"] for m in own["messages"])
    assert {m["content"] for m in read(call, a, other_dm)["memory"]} == {
        "AGENT_PRIVATE_MARKER"
    }
    assert read(call, a, other_dm)["messages"] == []
    assert read(call, b, b_dm)["memory"] == []
    assert {m["content"] for m in read(call, b, group)["memory"]} == {
        "GROUP_MEMORY_MARKER"
    }
    assert read(call, a, other_group)["memory"] == []
    denied = command(
        "context.read", {"agent_id": b["agent_id"], "thread_id": dm["thread_id"]}
    )
    assert call(denied)["error"]["code"] == "NOT_FOUND"
    assert call(denied, sign(denied, str(uuid4()), KEY))["error"]["code"] == "NOT_FOUND"
    before = len(provider.requests)
    run(call, a, dm, "DM_CHECK")
    dm_requests = json.dumps(provider.requests[before:])
    assert (
        "AGENT_PRIVATE_MARKER" in dm_requests and "DM_TRANSCRIPT_SECRET" in dm_requests
    )
    assert "GROUP_MEMORY_MARKER" not in dm_requests
    before = len(provider.requests)
    run(call, b, group, "GROUP_CHECK")
    group_requests = json.dumps(provider.requests[before:])
    assert (
        "GROUP_MEMORY_MARKER" in group_requests
        and "GROUP_TRANSCRIPT_SHARED" in group_requests
    )
    for marker in (
        "DM_TRANSCRIPT_SECRET",
        "AGENT_PRIVATE_MARKER",
        "DM_ONLY_MEMORY_MARKER",
        "PROFILE_PRIVATE_MARKER",
        "PROFILE_USER_MARKER",
    ):
        assert marker not in group_requests
    assert "PROFILE_PRIVATE_MARKER" not in dm_requests

    # Transfer is an authenticated owner command selecting one immutable source.
    run(call, a, dm, "Share the selected agent memory with the group.")
    instruction = [
        m for m in read(call, a, dm)["messages"] if m["author_kind"] == "user"
    ][-1]
    grant_body = command(
        "scope.grant",
        {
            "source_kind": "memory",
            "source_id": private["memory_id"],
            "source_revision": "1",
            "target_thread_id": group["thread_id"],
            "source_message_id": instruction["message_id"],
            "reason": "Owner requested this selected fact for the group.",
        },
    )
    grant = call(grant_body)
    assert "result" in grant, grant
    assert call(grant_body) == grant
    transferred = read(call, b, group)["grants"]
    assert len(transferred) == 1 and transferred[0]["content"] == "AGENT_PRIVATE_MARKER"
    assert transferred[0]["source_message_id"] == instruction["message_id"]
    before = len(provider.requests)
    run(call, b, group, "SHARED_SELECTION_CHECK")
    assert "AGENT_PRIVATE_MARKER" in json.dumps(provider.requests[before:])
    assert "DM_TRANSCRIPT_SECRET" not in json.dumps(provider.requests[before:])
    assert read(call, b, other_group)["grants"] == []

    start.current.kill()
    start.current.wait(timeout=10)
    start()
    assert call(grant_body) == grant
    assert read(call, b, group)["grants"] == transferred
    assert read(call, b, b_dm)["memory"] == []
    assert read(call, a, other_dm)["messages"] == []
    configure = command(
        "agent.configure",
        {
            "agent_id": a["agent_id"],
            "display_name": a["display_name"],
            "handle": a["handle"],
            "config": {**a["config"], "soul": "UPDATED_CONTEXT_PERSONA"},
        },
    )
    configure["expected_revision"] = a["revision"]
    a = call(configure)["result"]["agent"]
    before = len(provider.requests)
    run(call, a, dm, "NEW_CONFIG_SAME_PRIVATE_CONTEXT")
    changed_requests = json.dumps(provider.requests[before:])
    assert "UPDATED_CONTEXT_PERSONA" in changed_requests
    assert "DM_TRANSCRIPT_SECRET" in changed_requests
    assert "AGENT_PRIVATE_MARKER" in changed_requests
    assert "GROUP_TRANSCRIPT_SHARED" not in changed_requests
    revoke = command("scope.revoke", {"grant_id": grant["result"]["grant_id"]})
    revoke["expected_revision"] = "1"
    assert "result" in call(revoke)
    assert read(call, b, group)["grants"] == []
    before = len(provider.requests)
    run(call, b, group, "REVOKED_SELECTION_CHECK")
    assert "AGENT_PRIVATE_MARKER" not in json.dumps(provider.requests[before:])
    delete = command("memory.delete", {"memory_id": private["memory_id"]})
    delete["expected_revision"] = "1"
    assert "result" in call(delete)
    before = len(provider.requests)
    run(call, a, other_dm, "DELETED_PRIVATE_CHECK")
    assert "AGENT_PRIVATE_MARKER" not in json.dumps(provider.requests[before:])
    start.current.kill()
    start.current.wait(timeout=10)
    start()
    assert read(call, b, group)["grants"] == []
    assert read(call, a, other_dm)["memory"] == []
    with sqlite3.connect(root / "state/state.db") as db:
        assert db.execute("PRAGMA foreign_key_check").fetchall() == []
        assert db.execute("SELECT schema_version FROM nma_partition").fetchone()[0] == 4
        events = " ".join(r[0] for r in db.execute("SELECT payload FROM nma_events"))
        assert "AGENT_PRIVATE_MARKER" not in events


def test_provenance_cannot_self_grant_or_cross_source_scope(runtime):
    _, _, call, *_ = runtime
    a, b = create_agent(call, "source-a"), create_agent(call, "source-b")
    dm, group = thread(call, "dm", [a]), thread(call, "group", [a, b])
    run(call, a, dm, "SOURCE_PRIVATE")
    messages = read(call, a, dm)["messages"]
    bad = command(
        "memory.create",
        {
            "scope_kind": "thread_shared",
            "agent_id": None,
            "thread_id": group["thread_id"],
            "content": "PRIVATE_LEAK",
            "source_message_ids": [messages[0]["message_id"]],
        },
    )
    assert call(bad)["error"]["code"] == "SCOPE_MISMATCH"
    assert call(bad)["error"]["code"] == "SCOPE_MISMATCH"
    bad["payload"]["content"] = "CHANGED"
    assert call(bad)["error"]["code"] == "COMMAND_CONFLICT"
    grant = command(
        "scope.grant",
        {
            "source_kind": "message",
            "source_id": messages[0]["message_id"],
            "source_revision": "1",
            "target_thread_id": group["thread_id"],
            "source_message_id": messages[1]["message_id"],
            "reason": "Agent cannot authorize its own transfer.",
        },
    )
    assert call(grant)["error"]["code"] == "SCOPE_MISMATCH"
    grant["command_id"] = str(uuid4())
    grant["payload"]["source_message_id"] = messages[0]["message_id"]
    grant["payload"]["source_id"] = str(uuid4())
    assert call(grant)["error"]["code"] == "NOT_FOUND"


def test_context_revoke_fences_active_and_queued_work(runtime):
    _, provider, call, start, *_ = runtime
    a, b = create_agent(call, "queued-a"), create_agent(call, "queued-b")
    dm, group = thread(call, "dm", [a]), thread(call, "group", [a, b])
    run(call, a, dm, "Please share this selected fact.")
    source = read(call, a, dm)["messages"][0]
    grant = call(
        command(
            "scope.grant",
            {
                "source_kind": "message",
                "source_id": source["message_id"],
                "source_revision": "1",
                "target_thread_id": group["thread_id"],
                "source_message_id": source["message_id"],
                "reason": "Owner selected one message.",
            },
        )
    )["result"]
    provider.blocked.clear()
    provider.release.clear()

    def submit(text):
        return call(
            command(
                "runtime.submit",
                {
                    "agent_id": a["agent_id"],
                    "thread_id": group["thread_id"],
                    "config_revision": "1",
                    "context_generation": "1",
                    "text": text,
                },
            )
        )["result"]

    active = submit("BLOCK_STARTED")
    assert provider.blocked.wait(10)
    queued = submit("QUEUED_PRIVATE_CONTEXT_MUST_NOT_EXECUTE")
    revoke = command("scope.revoke", {"grant_id": grant["grant_id"]})
    revoke["expected_revision"] = "1"
    try:
        assert "result" in call(revoke)
    finally:
        provider.release.set()
    assert settle(call, active["run_id"], expected="cancelled")["status"] == "cancelled"
    assert settle(call, queued["run_id"], expected="cancelled")["status"] == "cancelled"
    assert "QUEUED_PRIVATE_CONTEXT_MUST_NOT_EXECUTE" not in json.dumps(
        provider.requests
    )
    assert (
        call(command("runtime.read", {"run_id": active["run_id"]}))["result"]["text"]
        == ""
    )
    start.current.kill()
    start.current.wait(timeout=10)
    start()
    assert (
        call(command("runtime.read", {"run_id": queued["run_id"]}))["result"]["status"]
        == "cancelled"
    )
    assert read(call, a, group)["grants"] == []


def test_additive_schema_three_upgrade_preserves_native_history(runtime):
    root, _, call, start, *_ = runtime
    a = create_agent(call, "upgrade-context")
    dm = thread(call, "dm", [a])
    prior = run(call, a, dm, "PRESERVED_NATIVE_TRANSCRIPT")
    start.current.kill()
    start.current.wait(timeout=10)
    with sqlite3.connect(root / "state/state.db") as db:
        checksums = db.execute(
            "SELECT version,checksum FROM nma_schema_migrations WHERE version<4 ORDER BY version"
        ).fetchall()
        native_count = db.execute("SELECT COUNT(*) FROM messages").fetchone()[0]
        # Reconstruct the exact predecessor only in a disposable verification partition.
        for table in (
            "nma_context_run_fences",
            "nma_context_receipts",
            "nma_scope_grants",
            "nma_memory_entries",
            "nma_messages",
        ):
            db.execute(f"DROP TABLE {table}")
        db.execute("DELETE FROM nma_schema_migrations WHERE version=4")
        db.execute("UPDATE nma_partition SET schema_version=3")
    start()
    context = read(call, a, dm)
    assert context["context_generation"] == "2"
    assert any(
        m["content"] == "PRESERVED_NATIVE_TRANSCRIPT" for m in context["messages"]
    )
    assert (
        call(command("thread.read", {"thread_id": dm["thread_id"]}))["result"][
            "agents"
        ][0]
        == a
    )
    with sqlite3.connect(root / "state/state.db") as db:
        assert (
            db.execute(
                "SELECT version,checksum FROM nma_schema_migrations WHERE version<4 ORDER BY version"
            ).fetchall()
            == checksums
        )
        assert db.execute("SELECT COUNT(*) FROM messages").fetchone()[0] >= native_count
        assert db.execute("PRAGMA foreign_key_check").fetchall() == []
    run(call, a, dm, "AFTER_SCHEMA_UPGRADE")
    # Completed work retains its status even when the session context is invalidated.
    assert (
        call(command("runtime.read", {"run_id": prior["run_id"]}))["result"]["status"]
        == "succeeded"
    )


def test_registered_manifest_binding_cannot_load_profile_memory(runtime):
    root, provider, call, start, *_ = runtime
    a, b = create_agent(call, "manifest-a"), create_agent(call, "manifest-b")
    group = thread(call, "group", [a, b])
    bindings_path = root / "bindings.json"
    bindings = json.loads(bindings_path.read_text())
    bindings.append(
        {
            **bindings[0],
            "agent_id": a["agent_id"],
            "thread_id": group["thread_id"],
            "toolsets": [],
        }
    )
    bindings_path.write_text(json.dumps(bindings))
    start.current.kill()
    start.current.wait(timeout=10)
    start()
    before = len(provider.requests)
    run(call, a, group, "MANIFEST_SCOPE_CHECK")
    requests = json.dumps(provider.requests[before:])
    assert "PROFILE_PRIVATE_MARKER" not in requests
    assert "PROFILE_USER_MARKER" not in requests
