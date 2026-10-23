"""Stop compute, retain profile; unknown effects block the next task until reviewed."""

from contextlib import suppress
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException

from ngertiin.chat.store import json_value, one
from ngertiin.computer import policy, store, usage
from ngertiin.tasks import store as tasks


async def start(execution, workspace, session, runtime):
    seconds = int((session["deadline"] - datetime.now(UTC)).total_seconds())
    if seconds < 30:
        raise ValueError("Waktu komputer habis sebelum browser siap.")
    resource_id = await runtime.start(workspace, seconds)
    async with tasks.locked(execution["owner_id"], execution["id"]) as (conn, task):
        tasks.fence(task, execution)
        current = await store.owned(conn, task["owner_id"], workspace["id"], lock=True)
        if (
            current["state"] != "starting"
            or current["control_version"] != workspace["control_version"]
        ):
            raise tasks.StaleExecution()
        row = await one(
            conn,
            "UPDATE browser_workspaces SET state='ready',resource_id=%s,capability=%s,"
            "updated_at=now() WHERE id=%s RETURNING *",
            (resource_id, json_value(workspace.get("capability", {})), workspace["id"]),
        )
        await conn.execute(
            "UPDATE computer_sessions SET state='active' WHERE id=%s", (session["id"],)
        )
        await tasks.emit(conn, task)
        return row


async def stop_task(owner, task_id, runtime=None):
    async with tasks.locked(owner, task_id) as (conn, task):
        session = await one(
            conn,
            "SELECT * FROM computer_sessions WHERE task_id=%s AND state<>'stopped' FOR UPDATE",
            (task_id,),
        )
        if not session:
            blocked = await one(
                conn,
                "SELECT id FROM browser_workspaces WHERE active_task_id=%s AND state<>'deleted'",
                (task_id,),
            )
            return blocked is None
        workspace = await store.owned(conn, owner, session["workspace_id"], lock=True)
        if workspace["active_task_id"] != task_id:
            return session["state"] == "stopped"
        await conn.execute(
            "UPDATE browser_workspaces SET state='stopping',"
            "control='handoff',control_version=control_version+1 WHERE id=%s",
            (workspace["id"],),
        )
        await conn.execute(
            "UPDATE computer_viewers SET closed=true WHERE workspace_id=%s", (workspace["id"],)
        )
        await conn.execute(
            "UPDATE computer_sessions SET state='stopping' WHERE id=%s", (session["id"],)
        )
    runtime = runtime or policy.get_runtime(workspace["provider"])
    try:
        observed = await runtime.stop(workspace)
        if (
            observed.get("absent")
            and not workspace["resource_id"]
            and datetime.now(UTC) < session["deadline"] + timedelta(seconds=180)
        ):
            raise ValueError("Provisioning ambigu masih dapat muncul; reservasi dipertahankan.")
    except Exception:
        async with tasks.locked(owner, task_id) as (conn, task):
            await conn.execute(
                "UPDATE browser_workspaces SET state='unknown',error=%s WHERE id=%s",
                ("Penghentian komputer belum terkonfirmasi.", workspace["id"]),
            )
            await conn.execute(
                "UPDATE computer_sessions SET state='unknown',cost_state='unknown' WHERE id=%s",
                (session["id"],),
            )
            await tasks.emit(conn, task)
        return False
    async with tasks.locked(owner, task_id) as (conn, task):
        current = await store.owned(conn, owner, workspace["id"], lock=True)
        # A stale dispatcher may have died after its request reached the provider.
        dispatched = await one(
            conn,
            "SELECT count(*) AS n FROM computer_steps WHERE session_id=%s "
            "AND kind<>'observe' AND state IN ('dispatched','unknown')",
            (session["id"],),
        )
        uncertain = current["unknown_effect"] or dispatched["n"] > 0
        await conn.execute(
            "UPDATE computer_steps SET state='unknown' WHERE session_id=%s AND state='dispatched'",
            (session["id"],),
        )
        await conn.execute(
            "UPDATE computer_steps SET state='stale' WHERE session_id=%s "
            "AND state IN ('observing','proposed','approved')",
            (session["id"],),
        )
        await usage.settle(conn, session, observed)
        await conn.execute(
            "UPDATE browser_workspaces SET state=%s,control='agent',busy=NULL,"
            "unknown_effect=%s,active_task_id=%s,deadline=NULL,error=%s,"
            "updated_at=now() WHERE id=%s",
            (
                "unknown" if uncertain else "stopped",
                bool(uncertain),
                task_id if uncertain else None,
                "Efek browser perlu diperiksa; aksi tidak akan diulang otomatis."
                if uncertain
                else None,
                workspace["id"],
            ),
        )
        await tasks.emit(conn, task)
    if not uncertain:
        await store.wake(owner)
    return not uncertain


async def pending(execution, message):
    async with tasks.locked(execution["owner_id"], execution["id"]) as (conn, task):
        tasks.fence(task, execution)
        await store.yield_task(conn, task, "computer_unknown", message)


async def reconcile(owner, task_id):
    confirmed = await stop_task(owner, task_id)
    async with tasks.locked(owner, task_id) as (conn, task):
        workspace = await one(
            conn,
            "SELECT unknown_effect FROM browser_workspaces WHERE active_task_id=%s AND owner_id=%s",
            (task_id, owner),
        )
        if confirmed and not workspace and task["stage"] == "computer_unknown":
            await tasks.change(
                conn,
                task,
                status="failed",
                stage="failed",
                lease_token=None,
                error="Komputer sudah dihentikan. Profil/hasil tersimpan; Task dapat dicoba lagi.",
            )
            await tasks.emit(conn, task)
        return await tasks.view(conn, task)


async def reset(owner, workspace_id):
    async with tasks.transaction() as conn:
        workspace = await store.owned(conn, owner, workspace_id)
    if workspace["state"] == "deleted":
        return {"deleted": True}
    if workspace["active_task_id"]:
        from ngertiin.tasks.commands import cancel

        await cancel(owner, workspace["active_task_id"])
        await stop_task(owner, workspace["active_task_id"])
    async with tasks.transaction() as conn:
        workspace = await store.owned(conn, owner, workspace_id, lock=True)
        await conn.execute(
            "UPDATE browser_workspaces SET state='deleting',control_version=control_version+1 "
            "WHERE id=%s",
            (workspace_id,),
        )
        await conn.execute(
            "UPDATE computer_viewers SET closed=true WHERE workspace_id=%s", (workspace_id,)
        )
    try:
        if not await policy.get_runtime(workspace["provider"]).delete(workspace):
            raise ValueError("delete pending")
        if (
            not workspace["resource_id"]
            and workspace["deadline"]
            and datetime.now(UTC) < workspace["deadline"] + timedelta(seconds=180)
        ):
            raise ValueError("uncertain creation")
    except Exception:
        raise HTTPException(
            409, "Penghapusan belum pasti; profil tetap diblokir dan akan diperiksa lagi."
        ) from None
    async with tasks.transaction() as conn:
        await conn.execute(
            "UPDATE browser_workspaces SET state='deleted',active_task_id=NULL,"
            "busy=NULL,unknown_effect=false,updated_at=now() WHERE id=%s",
            (workspace_id,),
        )
    await store.wake(owner)
    return {"deleted": True}


async def acknowledge(owner, task_id):
    "Human reports inspecting the site. Never label the external effect successful or"
    "replay it."
    async with tasks.locked(owner, task_id) as (conn, task):
        workspace = await one(
            conn,
            "SELECT * FROM browser_workspaces WHERE owner_id=%s "
            "AND active_task_id=%s AND state='unknown' AND unknown_effect FOR UPDATE",
            (owner, task_id),
        )
        if not workspace:
            raise HTTPException(409, "Tidak ada efek browser yang menunggu pemeriksaan manusia.")
        live = await one(
            conn,
            "SELECT id FROM computer_sessions WHERE task_id=%s AND state<>'stopped' LIMIT 1",
            (task_id,),
        )
        if live or workspace["busy"]:
            raise HTTPException(
                409, "Hentikan/periksa resource dahulu sebelum membuka workspace lagi."
            )
        await conn.execute(
            "UPDATE browser_workspaces SET unknown_effect=false,state='stopped',"
            "active_task_id=NULL,error=NULL WHERE id=%s",
            (workspace["id"],),
        )
        await tasks.change(
            conn,
            task,
            status="cancelled",
            stage="computer_unknown_resolved",
            lease_token=None,
            error="Diperiksa pengguna; aksi tidak diulang. Buat Task baru bila perlu.",
        )
        await tasks.finish_execution(conn, task, "cancelled")
        await tasks.emit(conn, task)
    await store.wake(owner)


async def sweep():
    async with tasks.transaction() as conn:
        rows = await (
            await conn.execute(
                "SELECT w.* FROM browser_workspaces w "
                "LEFT JOIN background_tasks t ON t.id=w.active_task_id WHERE "
                "w.state<>'deleted' AND "
                "(w.retain_until<=now() OR w.state IN ('deleting','stopping') OR "
                "(w.state='unknown' AND EXISTS (SELECT 1 FROM computer_sessions s "
                "WHERE s.workspace_id=w.id AND s.state<>'stopped')) OR "
                "(w.active_task_id IS NOT NULL AND NOT w.unknown_effect AND "
                "(w.deadline<=now() OR t.status IN ('failed','cancelled','succeeded') OR "
                "(w.control='agent' AND t.status='running' AND "
                "COALESCE(w.heartbeat_at,w.updated_at)<now()-interval '2 minutes')))) "
                "ORDER BY w.updated_at LIMIT 20"
            )
        ).fetchall()
    for row in rows:
        if row["state"] == "deleting" or row["retain_until"] <= datetime.now(UTC):
            with suppress(HTTPException):
                await reset(row["owner_id"], row["id"])
        elif row["active_task_id"]:
            await stop_task(row["owner_id"], row["active_task_id"])
            async with tasks.locked(row["owner_id"], row["active_task_id"]) as (conn, task):
                if task["status"] not in ("succeeded", "failed", "cancelled"):
                    await tasks.change(
                        conn,
                        task,
                        status="failed",
                        stage="computer_unknown" if row["unknown_effect"] else "failed",
                        lease_token=None,
                        error="Sesi berakhir. Profil tersimpan; periksa outcome sebelum retry.",
                    )
                    await tasks.finish_execution(conn, task, "interrupted")
                    await tasks.emit(conn, task)
    async with tasks.transaction() as conn:
        owners = await (
            await conn.execute(
                "SELECT DISTINCT owner_id FROM background_tasks "
                "WHERE status='waiting_user' AND stage='computer_queue'"
            )
        ).fetchall()
    for row in owners:
        await store.wake(row["owner_id"])
