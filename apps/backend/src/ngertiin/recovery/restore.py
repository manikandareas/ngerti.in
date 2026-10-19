"""A restored snapshot is quarantined until vendor references have been inspected."""

from uuid import uuid4

from ngertiin.async_db import transaction
from ngertiin.chat.store import one
from ngertiin.config import get_settings

MESSAGE = (
    "Pekerjaan dihentikan setelah pemulihan backup. Efek setelah waktu backup belum dapat "
    "dipastikan dan tidak diulang otomatis. Draft/hasil tersimpan; buat Task baru bila perlu."
)


async def ensure_released():
    async with transaction() as conn:
        if not (await one(conn, "SELECT to_regclass('recovery_restores') AS t"))["t"]:
            return
        latest = await one(conn, "SELECT * FROM recovery_restores ORDER BY created_at DESC LIMIT 1")
    if latest and latest["object_bucket"] != get_settings().s3_bucket:
        raise RuntimeError(
            "Restore storage mismatch: use the restored bucket, never the source bucket."
        )
    held = latest and latest["released_at"] is None
    if held:
        raise RuntimeError(
            "Restore held: inspect vendor resources and run recovery-backup release."
        )


async def quarantine(backup_id):
    """Run only on the fresh, offline restore target, before any application starts."""
    from ngertiin.chat import quota
    from ngertiin.tasks import budget, store

    async with transaction() as conn:
        ident = uuid4()
        await conn.execute(
            "INSERT INTO recovery_restores(id,backup_id,object_bucket) VALUES (%s,%s,%s)",
            (ident, backup_id, get_settings().s3_bucket),
        )
        # Queue effects from after the snapshot cannot be inferred. Never dispatch
        # them from a clone, including provider cleanup or payment reconciliation.
        await conn.execute(
            "UPDATE procrastinate_jobs SET status='failed' WHERE status::text IN ('todo','doing')"
        )
        await conn.execute("UPDATE computer_viewers SET closed=true,connected=false")
        await conn.execute(
            "UPDATE browser_workspaces SET control_version=control_version+1,busy=NULL "
            "WHERE state<>'deleted'"
        )
        await conn.execute(
            "UPDATE user_schedules SET state='paused',next_due=NULL,error=%s,updated_at=now() "
            "WHERE state='active'",
            (MESSAGE,),
        )
        await conn.execute("UPDATE proactive_accounts SET enabled=false")
        await conn.execute("UPDATE proactive_preferences SET intensity='off',revision=revision+1")
        await conn.execute(
            "UPDATE proactive_evaluations SET status='failed',lease_token=NULL,lease_until=NULL "
            "WHERE status IN ('queued','running')"
        )
        await conn.execute(
            "UPDATE proactive_candidates SET state='discarded' WHERE state='eligible'"
        )
        await conn.execute(
            "UPDATE memory_capture_jobs SET status='skipped',lease_token=NULL,lease_until=NULL "
            "WHERE status IN ('queued','extracting','admitting','failed')"
        )
        await conn.execute(
            "UPDATE memory_index_operations SET status='failed',attempts=3,"
            "lease_token=NULL,lease_until=NULL "
            "WHERE status IN ('queued','running','failed')"
        )
        tasks = await (
            await conn.execute(
                "SELECT * FROM background_tasks WHERE status IN ('queued','running','waiting_user')"
            )
        ).fetchall()
        for task in tasks:
            await budget.abandon_calls(conn, task)
            await store.finish_execution(conn, task, "interrupted")
            await store.change(
                conn,
                task,
                status="failed",
                stage="restore_required",
                lease_token=None,
                resume=None,
                error=MESSAGE,
            )
            await store.emit(conn, task)
        runs = await (
            await conn.execute(
                "SELECT * FROM chat_runs WHERE status IN ('queued','running','waiting_approval')"
            )
        ).fetchall()
        for run in runs:
            message = await one(
                conn,
                "UPDATE chat_messages SET status='failed' WHERE run_id=%s AND role='assistant' "
                "RETURNING parts",
                (run["id"],),
            )
            await quota.settle(conn, run, message["parts"] if message else [], "failed")
            await conn.execute(
                "UPDATE chat_runs SET status='failed',lease_token=NULL,error=%s WHERE id=%s",
                (MESSAGE, run["id"]),
            )
        await conn.execute("UPDATE task_actions SET status='unknown' WHERE status='executing'")
        await conn.execute(
            "UPDATE task_actions SET status='cancelled' WHERE status IN ('proposed','approved')"
        )
        await conn.execute("UPDATE computer_steps SET state='unknown' WHERE state='dispatched'")
        await conn.execute(
            "UPDATE computer_steps SET state='stale' "
            "WHERE state IN ('observing','proposed','approved')"
        )
        # Interrupted native provider receipts keep the conservative reservation.
        for table in ("memory_cost_events", "proactive_cost_events"):
            await conn.execute(f"UPDATE {table} SET state='unknown' WHERE state='reserved'")
        await conn.execute(
            "UPDATE file_extractions SET status='unknown',lease_token=NULL,error=%s "
            "WHERE status IN ('queued','running')",
            (MESSAGE,),
        )
        return ident


async def release():
    """Only absence is accepted automatically. Existing resources require operator review."""
    from psycopg.types.json import Jsonb

    from ngertiin.computer import policy as computer
    from ngertiin.sandbox import policy as sandbox
    from ngertiin.usage.recovery import reconcile

    async with transaction() as conn:
        held = await one(conn, "SELECT * FROM recovery_restores WHERE released_at IS NULL LIMIT 1")
        if not held:
            raise ValueError("No quarantined restore")
        if held["object_bucket"] != get_settings().s3_bucket:
            raise ValueError("Use the restored bucket before releasing the restore")
        sessions = await (
            await conn.execute("SELECT * FROM sandbox_sessions WHERE state<>'deleted'")
        ).fetchall()
        workspaces = await (
            await conn.execute("SELECT * FROM browser_workspaces WHERE state<>'deleted'")
        ).fetchall()
    observations = []
    for row in sessions:
        observed = await sandbox.get_runtime(row["provider"]).inspect(row["resource_name"])
        if observed.state != "absent":
            raise ValueError(
                "Vendor resource still exists; keep restore offline and review source."
            )
        observations.append({"kind": "sandbox", "id": str(row["id"]), "state": "absent"})
    for row in workspaces:
        observed = await computer.get_runtime(row["provider"]).inspect(row)
        if observed != "absent":
            raise ValueError(
                "Browser profile still exists; keep restore offline and review source."
            )
        observations.append({"kind": "browser", "id": str(row["id"]), "state": "absent"})
    async with transaction() as conn:
        await conn.execute(
            "UPDATE sandbox_sessions SET state='deleted',cost_state='unknown',deleted_at=now() "
            "WHERE state<>'deleted'"
        )
        await conn.execute(
            "UPDATE computer_sessions SET state='stopped',cost_state='unknown',stopped_at=now() "
            "WHERE state<>'stopped'"
        )
        await conn.execute(
            "UPDATE browser_workspaces SET state='deleted',active_task_id=NULL,deadline=NULL,"
            "unknown_effect=false,error=%s WHERE state<>'deleted'",
            ("Resource provider tidak ditemukan setelah restore; profil perlu login baru.",),
        )
        await conn.execute(
            "UPDATE background_tasks SET error=%s WHERE stage='restore_required' "
            "AND runtime_kind IN ('code','browser')",
            (
                "Resource provider tidak tersedia setelah restore. Hasil terdahulu tetap tersedia. "
                "Efek yang belum pasti tidak diulang; buat Task baru bila perlu.",
            ),
        )
        await conn.execute(
            "UPDATE recovery_restores SET report=%s WHERE id=%s",
            (Jsonb({"resources": observations, "automatic_replay": False}), held["id"]),
        )
    await reconcile()
    async with transaction() as conn:
        await conn.execute(
            "UPDATE recovery_restores SET released_at=now() WHERE id=%s", (held["id"],)
        )
    return {"released": True, "resources": observations, "automatic_replay": False}
