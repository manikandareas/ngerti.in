"""Account setup and messaging contracts through the actual gateway."""

# ruff: noqa: F811
import sqlite3
from concurrent.futures import ThreadPoolExecutor

from test_runtime import command, runtime  # noqa: F401


def test_setup_greeting_identity_restart_and_read_state(runtime):
    root, provider, call, start, *_ = runtime
    body = command("account.ensure")
    before = len(provider.requests)
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(lambda _: call(command("account.ensure")), range(4)))
    assert all("result" in r for r in results), results
    result = call(body)["result"]
    agent_id, thread_id = result["default_agent_id"], result["primary_dm_thread_id"]
    assert {r["result"]["default_agent_id"] for r in results} == {agent_id}
    snapshot = call(command("thread.snapshot", {"thread_id": thread_id}))["result"]
    assert snapshot["thread"]["agents"][0]["display_name"] == "Tobi"
    assert len(snapshot["messages"]) == 1
    assert snapshot["messages"][0]["origin"] == "welcome_template"
    assert snapshot["messages"][0]["run_id"] is None
    assert snapshot["runs"] == [] and len(provider.requests) == before
    for _ in range(2):
        dm = call(
            command(
                "thread.create",
                {"kind": "dm", "title": "Ignored", "agent_ids": [agent_id]},
            )
        )["result"]["thread"]
        assert dm["thread_id"] == thread_id
    listing = call(command("conversation.list", {"after": None}))["result"]
    summary = next(i for i in listing["items"] if i["thread_id"] == thread_id)
    assert summary["unread_count"] == "1"
    read = command("thread.mark_read", {"thread_id": thread_id, "message_seq": "1"})
    assert call(read)["result"]["unread_count"] == "0"
    assert (
        call(command("thread.mark_read", {"thread_id": thread_id, "message_seq": "2"}))[
            "error"
        ]["code"]
        == "INVALID_REQUEST"
    )
    opened = command("thread.open", {"thread_id": thread_id})
    opened["expected_revision"] = "1"
    assert call(opened)["result"]["navigation_revision"] == "2"
    stale = command("thread.open", {"thread_id": thread_id})
    stale["expected_revision"] = "1"
    assert call(stale)["error"]["code"] == "REVISION_CONFLICT"
    agent = snapshot["thread"]["agents"][0]
    edit = command(
        "agent.configure",
        {
            "agent_id": agent_id,
            "display_name": "My Tobi",
            "handle": agent["handle"],
            "config": {**agent["config"], "soul": "Customized"},
        },
    )
    edit["expected_revision"] = agent["revision"]
    assert "result" in call(edit)
    start.current.kill()
    start.current.wait(timeout=10)
    start()
    assert call(body)["result"] == result
    current = call(command("account.read"))["result"]
    assert current["default_agent_id"] == agent_id
    snapshot = call(command("thread.snapshot", {"thread_id": thread_id}))["result"]
    assert len(snapshot["messages"]) == 1
    assert snapshot["thread"]["agents"][0]["config"]["soul"] == "Customized"
    with sqlite3.connect(root / "state/state.db") as db:
        assert db.execute("PRAGMA foreign_key_check").fetchall() == []
        assert db.execute("SELECT count(*) FROM nma_account_setup").fetchone()[0] == 1


def test_welcome_first_message_group_and_summary_replay(runtime):
    from uuid import uuid4

    from ngertiin_engine.contracts import sign
    from test_direct_messages import send
    from test_runtime import KEY, settle
    from test_threads import create_agent

    _, provider, call, *_ = runtime
    before = len(provider.requests)
    a = create_agent(call, "welcome-a")
    b = create_agent(call, "welcome-b")
    thread_id = a["primary_dm_thread_id"]
    thread = call(command("thread.read", {"thread_id": thread_id}))["result"]
    listing = call(command("conversation.list", {"after": None}))["result"]
    group = call(
        command(
            "thread.create",
            {
                "kind": "group",
                "title": "Empty group",
                "agent_ids": [a["agent_id"], b["agent_id"]],
            },
        )
    )["result"]["thread"]
    assert (
        call(command("thread.snapshot", {"thread_id": group["thread_id"]}))["result"][
            "messages"
        ]
        == []
    )
    assert len(provider.requests) == before
    body = send(thread, "FIRST_USER_MESSAGE")
    receipt = call(body)["result"]
    settle(call, receipt["run_id"])
    assert call(body)["result"]["run_id"] == receipt["run_id"]
    snapshot = call(command("thread.snapshot", {"thread_id": thread_id}))["result"]
    assert [m["author_kind"] for m in snapshot["messages"]] == [
        "agent",
        "user",
        "agent",
    ]
    assert len({m["message_id"] for m in snapshot["messages"]}) == 3
    events_body = command(
        "conversation.events",
        {
            "replay_epoch": listing["replay_epoch"],
            "last_sequence": listing["through_sequence"],
        },
    )
    events = call(events_body)["result"]
    assert any(
        e["payload"]["thread_id"] == thread_id and e["payload"]["unread_count"] == "2"
        for e in events["events"]
    )
    read = call(
        command("thread.mark_read", {"thread_id": thread_id, "message_seq": "3"})
    )["result"]
    assert read["unread_count"] == "0"
    older = call(
        command("thread.mark_read", {"thread_id": thread_id, "message_seq": "1"})
    )["result"]
    assert older["last_read_sequence"] == "3"
    assert (
        call(events_body, envelope=sign(events_body, str(uuid4()), KEY))["error"][
            "code"
        ]
        == "NOT_FOUND"
    )
    events_body["payload"]["last_sequence"] = str(2**63 - 1)
    assert call(events_body)["error"]["code"] == "CURSOR_AHEAD"
    archive = command("agent.archive", {"agent_id": a["agent_id"]})
    archive["expected_revision"] = a["revision"]
    assert "result" in call(archive)
    assert (
        call(command("thread.ensure_dm", {"agent_id": a["agent_id"]}))["result"][
            "thread"
        ]["thread_id"]
        == thread_id
    )
    assert (
        call(command("thread.read", {"thread_id": thread_id}))["result"]["agents"][0][
            "status"
        ]
        == "archived"
    )


def test_duplicate_history_requires_explicit_mapping_and_preserves_receipts(runtime):
    from conversation_fixtures import legacy_dm
    from test_runtime import OWNER
    from test_threads import create_agent

    root, _, call, *_ = runtime
    agent = create_agent(call, "legacy-primary")
    old_primary = agent["primary_dm_thread_id"]
    secondary = legacy_dm(root, call, agent)
    with sqlite3.connect(root / "state/state.db") as db:
        db.execute(
            "DELETE FROM nma_primary_dms WHERE owner_id=? AND agent_id=?",
            (OWNER, agent["agent_id"]),
        )
    ensure = command("thread.ensure_dm", {"agent_id": agent["agent_id"]})
    assert call(ensure)["error"]["code"] == "DM_RECONCILIATION_REQUIRED"
    inventory = call(command("account.inventory"))["result"]
    mapping = command(
        "account.reconcile",
        {
            "inventory_digest": inventory["inventory_digest"],
            "default_agent_id": None,
            "primary_dms": {agent["agent_id"]: old_primary},
        },
    )
    result = call(mapping)
    assert "result" in result, result
    assert call(mapping) == result
    # Rejected operations stay rejected; a new operation observes the repaired state.
    assert call(ensure)["error"]["code"] == "DM_RECONCILIATION_REQUIRED"
    assert (
        call(command("thread.ensure_dm", {"agent_id": agent["agent_id"]}))["result"][
            "thread"
        ]["thread_id"]
        == old_primary
    )
    assert (
        call(command("thread.read", {"thread_id": secondary["thread_id"]}))["result"][
            "thread_id"
        ]
        == secondary["thread_id"]
    )
    with sqlite3.connect(root / "state/state.db") as db:
        assert (
            db.execute(
                "SELECT count(*) FROM nma_threads WHERE dm_agent_id=?",
                (agent["agent_id"],),
            ).fetchone()[0]
            == 2
        )
        assert db.execute("PRAGMA foreign_key_check").fetchall() == []


def test_schema_twelve_backfill_preserves_welcome_bytes_and_customization(runtime):
    from conversation_fixtures import drop_conversation_schema

    root, _, call, start, *_ = runtime
    before = call(command("account.inventory"))["result"]
    start.current.kill()
    start.current.wait(timeout=10)
    with sqlite3.connect(root / "state/state.db") as db:
        messages = db.execute(
            "SELECT message_id,parts FROM nma_messages ORDER BY message_id"
        ).fetchall()
        configs = db.execute(
            "SELECT agent_id,config_revision,config FROM nma_agent_configs ORDER BY agent_id,config_revision"
        ).fetchall()
        drop_conversation_schema(db)
        db.execute("UPDATE nma_partition SET schema_version=12")
    start()
    after = call(command("account.inventory"))["result"]
    assert len(after["agents"]) == len(before["agents"])
    with sqlite3.connect(root / "state/state.db") as db:
        assert (
            db.execute(
                "SELECT message_id,parts FROM nma_messages ORDER BY message_id"
            ).fetchall()
            == messages
        )
        assert (
            db.execute(
                "SELECT agent_id,config_revision,config FROM nma_agent_configs ORDER BY agent_id,config_revision"
            ).fetchall()
            == configs
        )
        assert (
            db.execute("SELECT schema_version FROM nma_partition").fetchone()[0] == 14
        )


def test_summary_pagination_cursor_validation_and_live_identity(runtime):
    import base64
    import json
    from uuid import uuid4

    from test_runtime import OWNER
    from test_threads import create_agent

    _, provider, call, *_ = runtime
    before = len(provider.requests)
    for index in range(51):
        create_agent(call, f"paged-{index}")
    first = call(command("conversation.list", {"after": None}))["result"]
    assert len(first["items"]) == 50 and first["next_cursor"]
    second = call(command("conversation.list", {"after": first["next_cursor"]}))[
        "result"
    ]
    assert second["items"]
    assert not {i["thread_id"] for i in first["items"]} & {
        i["thread_id"] for i in second["items"]
    }
    assert first["through_sequence"] == second["through_sequence"]
    assert len(provider.requests) == before
    raw = first["next_cursor"]
    claims = json.loads(base64.urlsafe_b64decode(raw + "=" * (-len(raw) % 4)))
    for bad in (
        "!",
        base64.urlsafe_b64encode(
            json.dumps([str(uuid4()), *claims[1:]]).encode()
        ).decode(),
        base64.urlsafe_b64encode(
            json.dumps([OWNER, claims[1], "-1", *claims[3:]]).encode()
        ).decode(),
    ):
        assert (
            call(command("conversation.list", {"after": bad}))["error"]["code"]
            == "INVALID_CURSOR"
        )
