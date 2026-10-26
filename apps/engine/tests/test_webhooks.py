"""Signed external ingress, durable coalescing and restart through the real gateway."""

# ruff: noqa: F811
import base64
import hashlib
import hmac
import json
import sqlite3
import time
from uuid import uuid4

from test_direct_messages import dm, snapshot
from test_goal_lifecycle import begin, continuation_script, eventually
from test_runtime import OWNER, command, runtime  # noqa: F401

SECRET = b"webhook-test-secret-with-at-least-32-bytes"


def setup(root, call, provider, handle):
    thread = dm(call, handle)
    goal = begin(call, thread)
    continuation_script(provider, goal["goal_id"])
    (root / "webhook-key").write_bytes(SECRET)
    cfg = {
        "owner_id": OWNER,
        "agent_id": goal["responsible_agent_id"],
        "goal_id": goal["goal_id"],
        "secret_file": str(root / "webhook-key"),
        "events": ["push"],
        "filters": [{"field": "ref", "equals": "main"}],
        "coalesce": {"key": "entity", "window_seconds": 3, "max_wait_seconds": 5},
    }
    (root / "webhooks.json").write_text(json.dumps({"test": cfg}))
    return thread, goal


def event(identity=None, **values):
    raw = json.dumps({"ref": "main", "entity": "repo-a", **values}).encode()
    return command(
        "webhook.receive",
        {
            "route_id": "test",
            "delivery_id": identity or str(uuid4()),
            "event_type": "push",
            "body_base64": base64.b64encode(raw).decode(),
            "signature": "sha256=" + hmac.new(SECRET, raw, hashlib.sha256).hexdigest(),
        },
    )


def test_auth_dedup_burst_restart_and_scope(runtime):
    root, provider, call, start, *_ = runtime
    thread, goal = setup(root, call, provider, "webhook-burst")
    invalid = event()
    invalid["payload"]["signature"] = "sha256=wrong"
    assert call(invalid)["error"]["code"] == "UNAUTHENTICATED"
    assert call(event(ref="other"))["result"]["status"] == "ignored"
    first = event(version=1)
    accepted = call(first)["result"]
    assert call(first)["result"] == {**accepted, "duplicate": True}
    assert (
        call(event(first["payload"]["delivery_id"], version=999))["error"]["code"]
        == "COMMAND_CONFLICT"
    )
    second = event(version=2)
    assert call(second)["result"]["batch_id"] == accepted["batch_id"]
    start.current.kill()
    start.current.wait(timeout=10)
    time.sleep(3)
    start()
    eventually(
        lambda: snapshot(call, thread)["goals"][0],
        lambda g: len(g["units"]) > len(goal["units"]) and g["status"] == "waiting",
    )
    assert call(first)["result"]["batch_id"] == accepted["batch_id"]
    with sqlite3.connect(root / "state/state.db") as db:
        rows = db.execute("SELECT batch_id,run_id FROM nma_webhook_batches").fetchall()
        assert len(rows) == 1 and rows[0][1]
        chain = db.execute(
            "SELECT delivery_id,superseded_by FROM nma_webhook_events ORDER BY received_at"
        ).fetchall()
        assert chain == [
            (first["payload"]["delivery_id"], second["payload"]["delivery_id"]),
            (second["payload"]["delivery_id"], None),
        ]
        assert db.execute("PRAGMA foreign_key_check").fetchall() == []
    assert '"version":2' in json.dumps(provider.requests).replace('\\"', '"')


def test_pending_event_cannot_revive_paused_goal(runtime):
    root, provider, call, start, *_ = runtime
    thread, goal = setup(root, call, provider, "webhook-stop")
    accepted = call(event())["result"]
    call(command("goal.pause", {"goal_id": goal["goal_id"]}))
    start.current.kill()
    start.current.wait(timeout=10)
    start()
    time.sleep(4)
    assert snapshot(call, thread)["goals"][0]["status"] == "paused"
    with sqlite3.connect(root / "state/state.db") as db:
        assert db.execute(
            "SELECT state,run_id FROM nma_webhook_batches WHERE batch_id=?",
            (accepted["batch_id"],),
        ).fetchone() == ("rejected", None)
    provider.goal_script = None


from urllib.error import HTTPError

import pytest
from test_direct_messages import public_api  # noqa: F401


@pytest.mark.parametrize(
    "fault",
    [
        "before_webhook_commit",
        "after_webhook_commit",
        "before_continuation_commit",
        "after_continuation_commit",
        "after_goal_admission",
    ],
)
def test_webhook_crash_boundaries(runtime, fault):
    root, provider, call, start, *_ = runtime
    thread, goal = setup(root, call, provider, "hook-" + fault.replace("_", "-")[:40])
    first = event()
    start.current.kill()
    start.current.wait(timeout=10)
    (root / "fault-fired").unlink(missing_ok=True)
    start(fault)
    if fault in {"before_webhook_commit", "after_webhook_commit"}:
        with pytest.raises((ValueError, OSError)):
            call(first)
    else:
        call(first)
    start.current.wait(timeout=15)
    start()
    receipt = call(first)["result"]
    eventually(
        lambda: snapshot(call, thread)["goals"][0],
        lambda g: len(g["units"]) > len(goal["units"]) and g["status"] == "waiting",
    )
    with sqlite3.connect(root / "state/state.db") as db:
        assert (
            db.execute(
                "SELECT count(*) FROM nma_webhook_events WHERE delivery_id=?",
                (first["payload"]["delivery_id"],),
            ).fetchone()[0]
            == 1
        )
        run = db.execute(
            "SELECT run_id FROM nma_webhook_batches WHERE batch_id=?",
            (receipt["batch_id"],),
        ).fetchone()[0]
        assert run
        assert (
            db.execute(
                "SELECT count(*) FROM nma_goal_units WHERE run_id=?", (run,)
            ).fetchone()[0]
            == 1
        )


def test_webhook_real_http_auth_and_durable_ack(runtime, public_api):
    root, provider, call, *_ = runtime
    setup(root, call, provider, "hook-http")
    payload = {"ref": "main", "entity": "http"}
    raw = json.dumps(payload).encode()
    headers = {
        "x-webhook-id": str(uuid4()),
        "x-webhook-event": "push",
        "x-hub-signature-256": "sha256=" + hmac.new(SECRET, raw, "sha256").hexdigest(),
    }
    with pytest.raises(HTTPError) as error:
        public_api("/webhooks/test", payload)
    assert error.value.code in {401, 422}
    response = public_api("/webhooks/test", payload, headers)
    assert response.status == 202
    receipt = json.load(response)
    assert (
        json.load(public_api("/webhooks/test", payload, headers))["batch_id"]
        == receipt["batch_id"]
    )


def test_unrelated_entities_missing_keys_and_route_generation(runtime):
    root, provider, call, start, *_ = runtime
    setup(root, call, provider, "hook-entities")
    routes = json.loads((root / "webhooks.json").read_text())
    routes["test"]["coalesce"]["window_seconds"] = 60
    routes["test"]["coalesce"]["max_wait_seconds"] = 60
    (root / "webhooks.json").write_text(json.dumps(routes))
    batch_ids = [
        call(event(entity=entity))["result"]["batch_id"]
        for entity in ("a", "b", None, None)
    ]
    assert len(set(batch_ids)) == 4
    routes["test"]["agent_id"] = str(uuid4())
    (root / "webhooks.json").write_text(json.dumps(routes))
    assert call(event())["error"]["code"] == "NOT_FOUND"
    start.current.kill()
    start.current.wait(timeout=10)
    with sqlite3.connect(root / "state/state.db") as db:
        db.execute("UPDATE nma_webhook_batches SET deadline=0 WHERE state='pending'")
    start()

    def rejected():
        with sqlite3.connect(root / "state/state.db") as db:
            return db.execute(
                "SELECT count(*) FROM nma_webhook_batches WHERE batch_id IN (?,?,?,?) AND state='rejected' AND run_id IS NULL",
                batch_ids,
            ).fetchone()[0]

    eventually(rejected, lambda n: n == 4)
    provider.goal_script = None


def test_additive_upgrade_preserves_schema_nine(runtime):
    root, _, _call, start, *_ = runtime
    start.current.kill()
    start.current.wait(timeout=10)
    with sqlite3.connect(root / "state/state.db") as db:
        from conversation_fixtures import drop_conversation_schema

        drop_conversation_schema(db)
        checksums = db.execute(
            "SELECT version,checksum FROM nma_schema_migrations WHERE version<=9 ORDER BY version"
        ).fetchall()
        counts = {
            t: db.execute("SELECT count(*) FROM " + t).fetchone()[0]
            for t in ("nma_messages", "nma_goals", "nma_commands")
        }
        db.execute("DROP TABLE nma_computers")
        db.execute("DROP TABLE nma_artifact_grants")
        db.execute("DROP TABLE nma_artifacts")
        db.execute("DROP TABLE nma_workspace_operations")
        db.execute("DELETE FROM nma_schema_migrations WHERE version=12")
        db.execute("DROP TABLE nma_discussion_goals")
        db.execute("DROP TABLE nma_discussion_turns")
        db.execute("DROP TABLE nma_discussions")
        db.execute("DELETE FROM nma_schema_migrations WHERE version=11")
        db.execute("DROP TABLE nma_webhook_events")
        db.execute("DROP TABLE nma_webhook_batches")
        db.execute("DELETE FROM nma_schema_migrations WHERE version=10")
        db.execute("UPDATE nma_partition SET schema_version=9")
    start()
    with sqlite3.connect(root / "state/state.db") as db:
        assert (
            db.execute("SELECT schema_version FROM nma_partition").fetchone()[0] == 15
        )
        assert (
            db.execute(
                "SELECT version,checksum FROM nma_schema_migrations WHERE version<=9 ORDER BY version"
            ).fetchall()
            == checksums
        )
        assert {
            t: db.execute("SELECT count(*) FROM " + t).fetchone()[0] for t in counts
        } == counts
        assert db.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
        assert db.execute("PRAGMA foreign_key_check").fetchall() == []
