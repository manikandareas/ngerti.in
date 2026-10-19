"""Owned workspace state. All task mutations lock account, thread, task, then workspace."""

from datetime import UTC, datetime, timedelta
from uuid import uuid4

from fastapi import HTTPException

from ngertiin.chat.store import json_value, one
from ngertiin.computer.contracts import ComputerPaused
from ngertiin.tasks import store as tasks


async def owned(conn, owner, workspace_id, *, lock=False):
    row = await one(
        conn,
        "SELECT * FROM browser_workspaces WHERE id=%s AND owner_id=%s"
        + (" FOR UPDATE" if lock else ""),
        (workspace_id, owner),
    )
    if not row:
        raise HTTPException(404, "Workspace tidak ditemukan.")
    return row


def public(workspace):
    return {
        k: workspace[k]
        for k in (
            "id",
            "state",
            "active_task_id",
            "control",
            "control_version",
            "unknown_effect",
            "deadline",
            "retain_until",
            "error",
        )
    }


async def summary(conn, task):
    sessions = await (
        await conn.execute(
            "SELECT s.id,s.state,s.workspace_id,s.deadline,s.reserved_microusd,s.charged_microusd,"
            "s.cost_state,s.storage_microusd,s.usage FROM computer_sessions s WHERE task_id=%s "
            "ORDER BY s.created_at",
            (task["id"],),
        )
    ).fetchall()
    workspace = await one(
        conn,
        "SELECT * FROM browser_workspaces WHERE owner_id=%s AND state<>'deleted'",
        (task["owner_id"],),
    )
    action = await one(
        conn,
        "SELECT id,kind,action,state,control_version,expires_at "
        "FROM computer_steps WHERE task_id=%s AND state IN ('proposed','approved') "
        "ORDER BY created_at DESC LIMIT 1",
        (task["id"],),
    )
    return {
        "workspace": public(workspace) if workspace else None,
        "sessions": sessions,
        "action": action,
    }


async def yield_task(conn, task, stage, error=None):
    await tasks.finish_execution(conn, task, "waiting_user")
    await tasks.change(
        conn, task, status="waiting_user", stage=stage, error=error, lease_token=None, resume=None
    )
    await tasks.emit(conn, task)


async def acquire(execution):
    from ngertiin.computer.usage import reserve

    waiting = False
    async with tasks.locked(execution["owner_id"], execution["id"]) as (conn, task):
        tasks.fence(task, execution)
        rules = task["budget_policy"]["computer"]
        await conn.execute("SELECT pg_advisory_xact_lock(330035)")
        workspace = await one(
            conn,
            "SELECT * FROM browser_workspaces WHERE owner_id=%s AND state<>'deleted' FOR UPDATE",
            (task["owner_id"],),
        )
        if workspace and (
            workspace["state"] in ("unknown", "deleting", "stopping")
            or workspace["retain_until"] <= datetime.now(UTC)
            or workspace["active_task_id"] not in (None, task["id"])
        ):
            await yield_task(
                conn, task, "computer_queue", "Menunggu workspace siap dan aman digunakan."
            )
            waiting = True
        else:
            if not workspace:
                count = await one(
                    conn, "SELECT count(*) AS n FROM browser_workspaces WHERE state<>'deleted'"
                )
                if count["n"] >= rules["global_profiles"]:
                    raise ValueError("Batas workspace tersimpan tercapai.")
                ident = uuid4()
                workspace = await one(
                    conn,
                    "INSERT INTO browser_workspaces"
                    "(id,owner_id,provider,resource_name,policy,retain_until) "
                    "VALUES (%s,%s,%s,%s,%s,%s) RETURNING *",
                    (
                        ident,
                        task["owner_id"],
                        rules["provider"],
                        f"ng036-{ident}",
                        json_value(rules),
                        datetime.now(UTC) + timedelta(days=rules["retention_days"]),
                    ),
                )
            session = await one(
                conn,
                "SELECT * FROM computer_sessions WHERE task_id=%s AND state<>'stopped' FOR UPDATE",
                (task["id"],),
            )
            if session:
                if workspace["state"] != "ready" or session["deadline"] <= datetime.now(UTC):
                    await yield_task(
                        conn, task, "computer_unknown", "Sesi perlu diperiksa sebelum dilanjutkan."
                    )
                    waiting = True
                elif workspace["control"] != "agent" or workspace["unknown_effect"]:
                    await yield_task(conn, task, "computer_human")
                    waiting = True
                else:
                    return workspace, session, False
            if not waiting:
                session = await reserve(conn, task, workspace, rules)
                workspace = await one(
                    conn,
                    "UPDATE browser_workspaces SET state='starting',"
                    "active_task_id=%s,control='agent',control_version=control_version+1,"
                    "deadline=%s,retain_until=%s,error=NULL,updated_at=now() WHERE "
                    "id=%s RETURNING *",
                    (
                        task["id"],
                        session["deadline"],
                        datetime.now(UTC) + timedelta(days=rules["retention_days"]),
                        workspace["id"],
                    ),
                )
                return workspace, session, True
    raise ComputerPaused()


async def current(execution, workspace_id):
    async with tasks.locked(execution["owner_id"], execution["id"]) as (conn, task):
        tasks.fence(task, execution)
        workspace = await owned(conn, task["owner_id"], workspace_id, lock=True)
        if (
            workspace["active_task_id"] != task["id"]
            or workspace["state"] != "ready"
            or workspace["control"] != "agent"
            or workspace["unknown_effect"]
            or workspace["deadline"] <= datetime.now(UTC)
        ):
            raise tasks.StaleExecution()
        return workspace


async def wake(owner):
    # Only a free, reconciled workspace wakes the oldest waiter. The subsequent
    # transaction still arbitrates ownership; a duplicate job cannot steal it.
    async with tasks.transaction() as conn:
        workspace = await one(
            conn,
            "SELECT active_task_id,state,retain_until FROM browser_workspaces "
            "WHERE owner_id=%s AND state<>'deleted'",
            (owner,),
        )
        if workspace and (
            workspace["active_task_id"]
            or workspace["state"] != "stopped"
            or workspace["retain_until"] <= datetime.now(UTC)
        ):
            return
        waiter = await one(
            conn,
            "SELECT id FROM background_tasks WHERE owner_id=%s "
            "AND status='waiting_user' AND stage='computer_queue' "
            "ORDER BY created_at LIMIT 1",
            (owner,),
        )
    if waiter:
        async with tasks.locked(owner, waiter["id"]) as (conn, task):
            if task["status"] == "waiting_user" and task["stage"] == "computer_queue":
                await tasks.change(conn, task, status="queued", stage="queued", error=None)
                await tasks.enqueue(conn, task)
                await tasks.emit(conn, task)
