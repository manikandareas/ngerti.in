"""Historical schema fixtures; welcome behavior is covered in test_conversations."""

import sqlite3
from uuid import uuid4


def drop_conversation_schema(db):
    from ngertiin_engine.files import DDL
    from ngertiin_engine.learning_store import DDL as LEARNING_DDL

    # A predecessor fixture must also remove every later additive extension.
    for table in (
        "nma_goal_process_waits",
        "nma_automation_jobs",
        "nma_goal_reviews",
        "nma_goal_contracts",
        "nma_collaboration_units",
        "nma_collaboration_operations",
        "nma_collaboration_tasks",
        "nma_delegation_batches",
        "nma_delegated_children",
    ):
        db.execute("DROP TABLE IF EXISTS " + table)
    for statement in reversed((*DDL, *LEARNING_DDL)):
        db.execute("DROP TABLE IF EXISTS " + statement.split()[2])
    for table in (
        "nma_goal_unit_outcomes",
        "nma_session_lineage",
        "nma_effect_outcomes",
    ):
        db.execute(f"DROP TABLE IF EXISTS {table}")
    db.execute("DROP TABLE IF EXISTS nma_provider_legacy_routes")
    db.execute("DROP TABLE IF EXISTS nma_provider_failures")
    db.execute("DROP TABLE IF EXISTS nma_provider_connections")
    db.execute("DELETE FROM nma_schema_migrations WHERE version>=14")
    db.execute("DROP TRIGGER IF EXISTS nma_primary_dm_identity")
    for table in (
        "nma_welcomes",
        "nma_navigation",
        "nma_conversation_state",
        "nma_account_setup",
        "nma_primary_dms",
    ):
        db.execute(f"DROP TABLE IF EXISTS {table}")
    db.execute("DROP INDEX IF EXISTS nma_message_unread")
    db.execute("DROP INDEX IF EXISTS nma_conversation_events")
    db.execute("DELETE FROM nma_schema_migrations WHERE version=13")


def legacy_dm(root, call, agent):
    """Represent an existing secondary DM, not a newly admitted duplicate."""
    from test_runtime import OWNER, command

    thread_id = str(uuid4())
    with sqlite3.connect(root / "state/state.db") as db:
        db.execute(
            "INSERT INTO nma_threads(owner_id,thread_id,kind,title,dm_agent_id,created_at,updated_at) VALUES (?,?,'dm','Historical DM',?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)",
            (OWNER, thread_id, agent["agent_id"]),
        )
        db.execute(
            "INSERT INTO nma_memberships(owner_id,thread_id,agent_id,position) VALUES (?,?,?,0)",
            (OWNER, thread_id, agent["agent_id"]),
        )
        db.execute(
            "INSERT INTO nma_conversation_state(owner_id,thread_id) VALUES (?,?)",
            (OWNER, thread_id),
        )
    return call(command("thread.read", {"thread_id": thread_id}))["result"]
