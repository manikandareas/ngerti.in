"""Revocation reaches tracked running work and history-derived context, not just vectors."""

from uuid import UUID

from psycopg import sql

from ngertiin.async_db import transaction
from ngertiin.chat.store import append_event, lock_account, one, owned_thread
from ngertiin.memory import store


async def valid(conn, owner, generation, refs):
    if not refs:
        return True
    # Capture toggles also advance generation. Revalidate exact references so
    # disabling capture doesn't revoke still-valid memory already in a response.
    for value in refs:
        row = await one(
            conn,
            "SELECT r.* FROM memory_revisions r JOIN memory_entries e ON "
            "e.id=r.entry_id AND e.revision=r.revision WHERE r.id=%s AND "
            "r.owner_id=%s",
            (UUID(value), owner),
        )
        if not row or not await store.usable(conn, owner, row):
            return False
    return True


async def revoke_locked(conn, owner):
    """Caller holds the account lock; acquire thread/task locks in the established order."""
    from ngertiin.chat import quota
    from ngertiin.proactivity.store import revoke
    from ngertiin.tasks import store as tasks

    await revoke(conn, owner, "memory_changed")

    runs = await (
        await conn.execute(
            "SELECT * FROM chat_runs WHERE owner_id=%s AND status IN ('queued',"
            "'running','waiting_approval') AND jsonb_array_length(memory_refs)>0",
            (owner,),
        )
    ).fetchall()
    for run in runs:
        if await valid(conn, owner, run["memory_generation"], run["memory_refs"]):
            continue
        await owned_thread(conn, owner, run["thread_id"], lock=True)
        await quota.settle(conn, run, [], "failed")
        await conn.execute(
            "UPDATE chat_runs SET status='failed',cancel_requested=true,"
            "lease_token=NULL,error='Ingatan berubah. Kirim ulang untuk memakai "
            "konteks terbaru.',updated_at=now() WHERE id=%s",
            (run["id"],),
        )
        message = await one(
            conn,
            "UPDATE chat_messages SET parts='[]',status='failed' WHERE run_id=%s "
            "AND role='assistant' RETURNING id,role,run_id,parts,status",
            (run["id"],),
        )
        if message:
            await append_event(
                conn, run["thread_id"], {"type": "message.upsert", "message": message}
            )
        await conn.execute(
            "UPDATE chat_approvals SET status='cancelled' WHERE run_id=%s AND status='pending'",
            (run["id"],),
        )
        await append_event(
            conn,
            run["thread_id"],
            {
                "type": "run.status",
                "run": {
                    "id": str(run["id"]),
                    "status": "failed",
                    "error": "Ingatan berubah. Kirim ulang untuk memakai konteks terbaru.",
                },
            },
        )
    active = await (
        await conn.execute(
            "SELECT * FROM background_tasks WHERE owner_id=%s AND status IN "
            "('queued','running','waiting_user') AND "
            "jsonb_array_length(memory_refs)>0",
            (owner,),
        )
    ).fetchall()
    for task in active:
        if await valid(conn, owner, task["memory_generation"], task["memory_refs"]):
            continue
        await owned_thread(conn, owner, task["thread_id"], lock=True)
        await conn.execute("SELECT id FROM background_tasks WHERE id=%s FOR UPDATE", (task["id"],))
        await tasks.finish_execution(conn, task, "interrupted")
        await conn.execute(
            "UPDATE task_executions SET draft='' WHERE task_id=%s AND revision=%s",
            (task["id"], task["revision"]),
        )
        await conn.execute(
            "UPDATE task_revisions SET draft='' WHERE task_id=%s AND revision=%s",
            (task["id"], task["revision"]),
        )
        await conn.execute(
            "UPDATE task_actions SET status='cancelled',content='' WHERE task_id=%s "
            "AND revision=%s AND status IN ('proposed','approved')",
            (task["id"], task["revision"]),
        )
        await tasks.change(
            conn,
            task,
            status="failed",
            stage="failed",
            draft="",
            result="",
            revision=task["revision"] + 1,
            lease_token=None,
            resume=None,
            error="Ingatan yang dipakai berubah. Coba lagi dengan konteks terbaru.",
        )
        await tasks.emit(conn, task)
    await purge_checkpoints(conn, owner)


async def purge_checkpoints(conn, owner):
    """Remove persisted context for revoked tracked work; saver leases fence late writes."""
    for table, prefix in (("chat_runs", "chat"), ("background_tasks", "task")):
        rows = await (
            await conn.execute(
                sql.SQL(
                    "SELECT id,memory_generation,memory_refs FROM {} WHERE "
                    "owner_id=%s AND jsonb_array_length(memory_refs)>0"
                ).format(sql.Identifier(table)),
                (owner,),
            )
        ).fetchall()
        for row in rows:
            if await valid(conn, owner, row["memory_generation"], row["memory_refs"]):
                continue
            for checkpoint_table in ("checkpoint_writes", "checkpoint_blobs", "checkpoints"):
                await conn.execute(
                    sql.SQL("DELETE FROM {} WHERE thread_id LIKE %s").format(
                        sql.Identifier(checkpoint_table)
                    ),
                    (f"{prefix}:{row['id']}:%",),
                )


async def ensure(execution):
    async with transaction() as conn:
        await lock_account(conn, execution["owner_id"])
        okay = await valid(
            conn,
            execution["owner_id"],
            execution.get("memory_generation"),
            execution.get("memory_refs", []),
        )
        if not okay:
            await revoke_locked(conn, execution["owner_id"])
    return okay


async def filter_history(owner, rows):
    """Do not rehydrate forgotten source turns or outputs with revoked memory lineage."""
    filtered = []
    async with transaction() as conn:
        for row in rows:
            if row.get("id"):
                excluded = await one(
                    conn,
                    "SELECT 1 FROM memory_excluded_sources WHERE owner_id=%s AND "
                    "source_kind='message' AND source_id=%s",
                    (owner, row["id"]),
                )
                if excluded:
                    continue
            run_id = row.get("run_id")
            if row.get("role") == "assistant" and not run_id and row.get("id"):
                message = await one(
                    conn,
                    "SELECT m.run_id FROM chat_messages m JOIN chat_threads t "
                    "ON t.id=m.thread_id WHERE m.id=%s AND t.owner_id=%s",
                    (row["id"], owner),
                )
                run_id = message["run_id"] if message else None
            if row.get("role") == "assistant" and run_id:
                run = await one(
                    conn,
                    "SELECT memory_generation,memory_refs FROM chat_runs WHERE "
                    "id=%s AND owner_id=%s",
                    (run_id, owner),
                )
                if run and not await valid(
                    conn, owner, run["memory_generation"], run["memory_refs"]
                ):
                    continue
            filtered.append(row)
    return filtered
