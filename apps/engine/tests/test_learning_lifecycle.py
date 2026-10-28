"""Concurrent corrections, assigned package migration and native maintenance recovery."""

# ruff: noqa: F811
import hashlib
import json
import signal
import sqlite3
from concurrent.futures import ThreadPoolExecutor

from ngertiin_engine.backup import QUARANTINE, backup, restore
from ngertiin_engine.learning_store import DDL
from test_capabilities import capability_agent
from test_direct_messages import send
from test_learning import conversation, inventory, invoke
from test_runtime import OWNER, command, runtime, settle  # noqa: F401


def test_assigned_text_revision_is_current_and_complete_after_restart(runtime):
    root, model, call, start, *_ = runtime
    (root / "capabilities.json").write_text(
        json.dumps(
            {
                "tool_grants": {"files": {"enabled": True, "toolset": "nma_workspace"}},
                "skill_refs": {
                    "research": {"enabled": True, "content": "ORIGINAL_ASSIGNED_METHOD"}
                },
            }
        )
    )
    agent = capability_agent(call, "assigned-research", skill_refs=["research"])
    dm = conversation(call, agent)
    first = inventory(call, agent, dm)["skills"][0]
    assert (
        first["origin"] == "inline" and "ORIGINAL_ASSIGNED_METHOD" in first["content"]
    )
    body = command(
        "learning.skill",
        {
            "agent_id": agent["agent_id"],
            "thread_id": dm["thread_id"],
            "skill_id": first["skill_id"],
            "action": "correct",
            "content": first["content"].replace(
                "ORIGINAL_ASSIGNED_METHOD", "CORRECTED_ASSIGNED_METHOD"
            ),
        },
    )
    body["expected_revision"] = "1"
    assert "result" in call(body)
    start.current.kill()
    start.current.wait(timeout=10)
    start()
    before = len(model.requests)
    settle(call, call(send(dm, "Apply the assigned method"))["result"]["run_id"])
    context = json.dumps(model.requests[before:])
    assert (
        "CORRECTED_ASSIGNED_METHOD" in context
        and "ORIGINAL_ASSIGNED_METHOD" not in context
    )
    assert inventory(call, agent, dm)["skills"][0]["revision"] == "2"


def test_concurrent_correction_schema16_backfill_backup_and_restore(runtime, tmp_path):
    root, model, call, start, *_ = runtime
    agent = capability_agent(call, "learning-migration")
    dm = conversation(call, agent)
    assert invoke(
        model,
        call,
        dm,
        "memory",
        {
            "action": "add",
            "target": "user",
            "content": "The preferred report color is green.",
        },
    )["success"]
    item = inventory(call, agent, dm)["memories"][0]
    bodies = []
    for content in (
        "The preferred report color is blue.",
        "The preferred report color is violet.",
    ):
        body = command(
            "learning.memory",
            {
                "agent_id": agent["agent_id"],
                "thread_id": dm["thread_id"],
                "memory_id": item["memory_id"],
                "action": "correct",
                "content": content,
            },
        )
        body["expected_revision"] = item["revision"]
        bodies.append(body)
    with ThreadPoolExecutor(2) as pool:
        results = list(pool.map(call, bodies))
    assert sum("result" in result for result in results) == 1
    assert [result["error"]["code"] for result in results if "error" in result] == [
        "REVISION_CONFLICT"
    ]
    start.current.send_signal(signal.SIGINT)
    start.current.wait(timeout=25)
    # Reconstruct the actual predecessor by removing extensions 18 and 17. The
    # canonical schema-16 memory ID/content/receipt must remain byte-for-byte.
    with sqlite3.connect(root / "state/state.db") as db:
        before = db.execute("SELECT * FROM nma_memory_entries").fetchall()
        for name in (
            "nma_collaboration_units",
            "nma_collaboration_operations",
            "nma_collaboration_tasks",
            "nma_delegation_batches",
            "nma_delegated_children",
        ):
            db.execute("DROP TABLE " + name)
        db.execute("DELETE FROM nma_schema_migrations WHERE version=18")
        for statement in reversed(DDL):
            db.execute("DROP TABLE " + statement.split()[2])
        db.execute("DELETE FROM nma_schema_migrations WHERE version=17")
        db.execute("UPDATE nma_partition SET schema_version=16")
    saved = backup(root / "state", tmp_path / "predecessor")
    assert saved["schema_version"] == 16
    start()
    migrated = inventory(call, agent, dm)["memories"][0]
    assert migrated["memory_id"] == item["memory_id"] and migrated["revision"] == "2"
    with sqlite3.connect(root / "state/state.db") as db:
        assert db.execute("SELECT * FROM nma_memory_entries").fetchall() == before
    assert invoke(
        model,
        call,
        dm,
        "skill_manage",
        {
            "operations": [
                {
                    "action": "create",
                    "name": "durable-method",
                    "content": "---\nname: durable-method\ndescription: Durable method\n---\n\nVerify the calculation.",
                }
            ]
        },
    )["success"]
    expected = inventory(call, agent, dm)
    start.current.send_signal(signal.SIGINT)
    start.current.wait(timeout=25)
    learned = backup(root / "state", tmp_path / "learned")
    assert learned["schema_version"] == 18
    restore(tmp_path / "learned", tmp_path / "restored", OWNER)
    (root / "state").rename(root / "offline-original")
    (tmp_path / "restored").rename(root / "state")
    (root / "state" / QUARANTINE).unlink()
    start()
    assert inventory(call, agent, dm) == expected
    start.current.kill()
    start.current.wait(timeout=10)
    start()
    assert inventory(call, agent, dm) == expected
    print(
        "LEARNING_MIGRATION_BACKUP_RESTORE_VERIFIED",
        hashlib.sha256(json.dumps(before).encode()).hexdigest(),
    )


def test_native_curator_protects_active_work_and_archives_reversibly(runtime):
    root, model, call, start, *_ = runtime
    agent = capability_agent(call, "curated-methods")
    dm = conversation(call, agent)
    assert invoke(
        model,
        call,
        dm,
        "skill_manage",
        {
            "operations": [
                {
                    "action": "create",
                    "name": "aging-method",
                    "content": "---\nname: aging-method\ndescription: A reusable method\n---\n\nCheck the evidence.",
                }
            ]
        },
    )["success"]
    with sqlite3.connect(root / "state/state.db") as db:
        db.execute(
            "UPDATE nma_skill_entries SET created_at='2020-01-01T00:00:00+00:00',updated_at='2020-01-01T00:00:00+00:00' WHERE name='aging-method'"
        )
        db.execute("DELETE FROM nma_learning_maintenance")
    model.release.clear()
    model.blocked.clear()
    run = call(send(dm, "BLOCK_STARTED"))["result"]["run_id"]
    assert model.blocked.wait(10)
    request = lambda: command(
        "learning.maintain",
        {"agent_id": agent["agent_id"], "thread_id": dm["thread_id"]},
    )
    assert all(
        report["archived"] == 0 for report in call(request())["result"]["reports"]
    )
    assert inventory(call, agent, dm)["skills"][0]["status"] == "active"
    model.release.set()
    settle(call, run)
    result = call(request())
    assert sum(report["archived"] for report in result["result"]["reports"]) == 1, (
        result
    )
    archived = inventory(call, agent, dm)["skills"][0]
    assert archived["status"] == "archived"
    start.current.kill()
    start.current.wait(timeout=10)
    start()
    assert all(
        report["archived"] == 0 for report in call(request())["result"]["reports"]
    )
    body = command(
        "learning.skill",
        {
            "agent_id": agent["agent_id"],
            "thread_id": dm["thread_id"],
            "skill_id": archived["skill_id"],
            "action": "restore",
        },
    )
    body["expected_revision"] = archived["revision"]
    assert "result" in call(body)
    assert inventory(call, agent, dm)["skills"][0]["content"] == archived["content"]
    assert inventory(call, agent, dm)["skills"][0]["status"] == "active"
