"""Every observation/action is fenced; screenshots stay transient, receipts stay durable."""

from datetime import UTC, datetime
from uuid import uuid4

from ngertiin.chat.store import json_value, one
from ngertiin.computer import store
from ngertiin.computer.contracts import Action, ComputerPaused
from ngertiin.tasks import store as tasks


async def begin(execution, workspace, session, action=None, screen_hash="", *, approved_id=None):
    async with tasks.locked(execution["owner_id"], execution["id"]) as (conn, task):
        tasks.fence(task, execution)
        row = await store.owned(conn, task["owner_id"], workspace["id"], lock=True)
        if (
            row["control_version"] != workspace["control_version"]
            or row["control"] != "agent"
            or row["active_task_id"] != task["id"]
            or row["state"] != "ready"
            or row["busy"]
            or row["unknown_effect"]
            or row["deadline"] <= datetime.now(UTC)
        ):
            raise tasks.StaleExecution()
        count = await one(
            conn,
            "SELECT count(*) AS n FROM computer_steps WHERE task_id=%s AND kind<>'observe'",
            (task["id"],),
        )
        if action and not approved_id and count["n"] >= session["policy"]["max_steps"]:
            raise ValueError("Batas langkah browser tercapai. Hasil sebelumnya tetap tersimpan.")
        if approved_id:
            step = await one(
                conn,
                "SELECT * FROM computer_steps WHERE id=%s AND task_id=%s FOR UPDATE",
                (approved_id, task["id"]),
            )
            if (
                not step
                or step["state"] != "approved"
                or step["session_id"] != session["id"]
                or step["control_version"] != row["control_version"]
                or step["expires_at"] <= datetime.now(UTC)
                or step["screen_hash"] != screen_hash
            ):
                if step and step["state"] == "approved":
                    await conn.execute(
                        "UPDATE computer_steps SET state='stale' WHERE id=%s", (step["id"],)
                    )
                    await store.yield_task(
                        conn,
                        task,
                        "computer_human",
                        "Halaman berubah; ambil alih atau lanjutkan untuk menilai ulang.",
                    )
                else:
                    raise ValueError("Proposal aksi tidak lagi cocok dengan sesi/layar saat ini.")
                paused = True
            else:
                await conn.execute(
                    "UPDATE computer_steps SET state='dispatched' WHERE id=%s", (step["id"],)
                )
                paused = False
        else:
            proposed = action is not None and (
                action.requires_approval
                or action.kind == "navigate"
                and action.url not in session["policy"].get("allowed_urls", [])
            )
            step = await one(
                conn,
                "INSERT INTO computer_steps(id,session_id,task_id,control_version,"
                "kind,action,screen_hash,state,expires_at) VALUES "
                "(%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *",
                (
                    uuid4(),
                    session["id"],
                    task["id"],
                    row["control_version"],
                    action.kind if action else "observe",
                    json_value(action.model_dump() if action else {}),
                    screen_hash,
                    "proposed" if proposed else ("dispatched" if action else "observing"),
                    row["deadline"],
                ),
            )
            paused = proposed
            if proposed:
                await store.yield_task(conn, task, "computer_approval")
        if not paused:
            await conn.execute(
                "UPDATE browser_workspaces SET busy=%s,updated_at=now() WHERE id=%s",
                (step["id"], row["id"]),
            )
            return step
    raise ComputerPaused()


async def receipt(workspace_id, step_id, *, confirmed):
    async with tasks.transaction() as conn:
        step = await one(
            conn,
            "UPDATE computer_steps SET state=%s,finished_at=now() "
            "WHERE id=%s AND state IN ('observing','dispatched') RETURNING kind",
            ("complete" if confirmed else "unknown", step_id),
        )
        await conn.execute(
            "UPDATE browser_workspaces SET busy=NULL,unknown_effect=unknown_effect OR %s "
            "WHERE id=%s AND busy=%s",
            (not confirmed and bool(step) and step["kind"] != "observe", workspace_id, step_id),
        )


async def observe(execution, workspace, session, runtime):
    step = await begin(execution, workspace, session)
    confirmed = False
    try:
        screen = await runtime.observe(workspace)
        confirmed = True
        return screen
    finally:
        await receipt(workspace["id"], step["id"], confirmed=confirmed)


async def execute(execution, workspace, session, runtime, action: Action, approved_id=None):
    inspection = await begin(execution, workspace, session)
    confirmed = False
    try:
        target_hash = await runtime.target(workspace, action)
        confirmed = True
    finally:
        await receipt(workspace["id"], inspection["id"], confirmed=confirmed)
    step = await begin(execution, workspace, session, action, target_hash, approved_id=approved_id)
    confirmed = False
    try:
        await runtime.act(workspace, action)
        confirmed = True
    finally:
        await receipt(workspace["id"], step["id"], confirmed=confirmed)
