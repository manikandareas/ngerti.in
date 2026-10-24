"""Group roster revisions, durable authorship and revoked native queued work."""

# ruff: noqa: F811
import json
import sqlite3

from test_runtime import command, runtime, settle  # noqa: F401
from test_threads import create_agent


def test_group_roster_transcript_and_revoked_queue(runtime):
    root, provider, call, start, *_ = runtime
    a, b, c = [create_agent(call, "member-" + s) for s in ("a", "b", "c")]
    thread = call(
        command(
            "thread.create",
            {
                "kind": "group",
                "title": "Group",
                "agent_ids": [a["agent_id"], b["agent_id"]],
            },
        )
    )["result"]["thread"]

    def mutate(kind, agent, revision):
        body = command(
            kind, {"thread_id": thread["thread_id"], "agent_id": agent["agent_id"]}
        )
        body["expected_revision"] = revision
        return body

    added = mutate("member.add", c, "1")
    receipt = call(added)
    assert receipt["result"]["thread"]["membership_revision"] == "2"
    assert call(added) == receipt
    assert call(mutate("member.remove", c, "1"))["error"]["code"] == "REVISION_CONFLICT"

    def submit(agent, text):
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
        )["result"]

    for agent in (a, b):
        settle(call, submit(agent, "Group author " + agent["handle"])["run_id"])
    saved = call(command("thread.snapshot", {"thread_id": thread["thread_id"]}))[
        "result"
    ]
    assert {
        m["author_agent_id"] for m in saved["messages"] if m["author_kind"] == "agent"
    } == {a["agent_id"], b["agent_id"]}
    assert [int(m["message_seq"]) for m in saved["messages"]] == list(range(1, 5))
    provider.release.clear()
    provider.blocked.clear()
    running = submit(c, "BLOCK_STARTED")
    assert provider.blocked.wait(10)
    queued = submit(c, "REVOKED_QUEUED_PROOF")
    removed = call(mutate("member.remove", c, "2"))["result"]["thread"]
    assert len(removed["agents"]) == 2
    assert (
        call(mutate("member.add", c, "3"))["result"]["thread"]["membership_revision"]
        == "4"
    )
    provider.release.set()
    for run in (running, queued):
        assert (
            call(command("runtime.snapshot", {"run_id": run["run_id"]}))["result"][
                "status"
            ]
            == "cancelled"
        )
    start.current.kill()
    start.current.wait(timeout=10)
    start()
    restored = call(command("thread.snapshot", {"thread_id": thread["thread_id"]}))[
        "result"
    ]
    assert restored["messages"][:4] == saved["messages"]
    assert "REVOKED_QUEUED_PROOF" not in json.dumps(provider.requests)
    with sqlite3.connect(root / "state/state.db") as db:
        assert db.execute("PRAGMA foreign_key_check").fetchall() == []


from test_direct_messages import public_api  # noqa: F401


def test_membership_public_http(runtime, public_api):
    _, _, call, *_ = runtime
    agents = [create_agent(call, "http-member-" + s) for s in ("a", "b", "c")]
    created = json.load(
        public_api(
            "/commands",
            command(
                "thread.create",
                {
                    "kind": "group",
                    "title": "HTTP group",
                    "agent_ids": [a["agent_id"] for a in agents[:2]],
                },
            ),
        )
    )
    thread = created["thread"]
    for kind, revision in [("member.add", "1"), ("member.remove", "2")]:
        body = command(
            kind, {"thread_id": thread["thread_id"], "agent_id": agents[2]["agent_id"]}
        )
        body["expected_revision"] = revision
        result = json.load(public_api("/commands", body))
        assert result["thread"]["membership_revision"] == str(int(revision) + 1)
    assert (
        json.load(public_api("/threads/" + thread["thread_id"] + "/snapshot"))[
            "thread"
        ]["kind"]
        == "group"
    )


def test_reduced_roster_keeps_history_but_refuses_execution(runtime):
    _, _, call, *_ = runtime
    a, b = [create_agent(call, "small-" + s) for s in ("a", "b")]
    thread = call(
        command(
            "thread.create",
            {
                "kind": "group",
                "title": "Small",
                "agent_ids": [a["agent_id"], b["agent_id"]],
            },
        )
    )["result"]["thread"]
    remove = command(
        "member.remove", {"thread_id": thread["thread_id"], "agent_id": b["agent_id"]}
    )
    remove["expected_revision"] = "1"
    assert len(call(remove)["result"]["thread"]["agents"]) == 1
    denied = call(
        command(
            "runtime.submit",
            {
                "agent_id": a["agent_id"],
                "thread_id": thread["thread_id"],
                "context_generation": "1",
                "config_revision": "1",
                "text": "Must not run",
            },
        )
    )
    assert denied["error"]["code"] == "GROUP_UNAVAILABLE"
    assert (
        call(command("thread.snapshot", {"thread_id": thread["thread_id"]}))["result"][
            "messages"
        ]
        == []
    )


def test_revoke_fences_terminal_result_awaiting_publication(runtime):
    root, _, call, start, *_ = runtime
    start.current.kill()
    start.current.wait(timeout=10)
    (root / "fault-fired").unlink(missing_ok=True)
    start("defer_transcript")
    a, b = [create_agent(call, "late-" + s) for s in ("a", "b")]
    thread = call(
        command(
            "thread.create",
            {
                "kind": "group",
                "title": "Late",
                "agent_ids": [a["agent_id"], b["agent_id"]],
            },
        )
    )["result"]["thread"]
    run = call(
        command(
            "runtime.submit",
            {
                "agent_id": b["agent_id"],
                "thread_id": thread["thread_id"],
                "context_generation": "1",
                "config_revision": "1",
                "text": "LATE_PUBLICATION",
            },
        )
    )["result"]
    settle(call, run["run_id"])
    with sqlite3.connect(root / "state/state.db") as db:
        assert (
            db.execute(
                "SELECT count(*) FROM nma_context_receipts WHERE run_id=?",
                (run["run_id"],),
            ).fetchone()[0]
            == 0
        )
    remove = command(
        "member.remove", {"thread_id": thread["thread_id"], "agent_id": b["agent_id"]}
    )
    remove["expected_revision"] = "1"
    assert "result" in call(remove)
    (root / "fault-fired").touch()
    snap = call(command("thread.snapshot", {"thread_id": thread["thread_id"]}))[
        "result"
    ]
    assert not any(m["author_kind"] == "agent" for m in snap["messages"])
    start.current.kill()
    start.current.wait(timeout=10)
    start()
    assert (
        call(command("thread.snapshot", {"thread_id": thread["thread_id"]}))["result"][
            "messages"
        ]
        == snap["messages"]
    )
