"""Every observation/action is fenced; screenshots stay transient, receipts stay durable."""

from datetime import UTC, datetime
from uuid import uuid4

from ngertiin.chat.store import json_value, one
from ngertiin.computer import permissions, store
from ngertiin.computer.contracts import (
    Action,
    ComputerPaused,
    InspectedTarget,
    NeedsHuman,
    StaleTarget,
)
from ngertiin.sandbox.contracts import RuntimeFailure
from ngertiin.tasks import store as tasks


async def begin(
    execution, workspace, session, action=None, screen_hash="", *, approved_id=None, target=None
):
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
                or step["action"] != action.model_dump()
                or step.get("decision", {}).get("task_revision", task["revision"])
                != task["revision"]
                or step.get("decision", {}).get("generation")
                != row.get("capability", {}).get("generation")
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
            decision = (
                permissions.decide(action, target or InspectedTarget(screen_hash))
                if action
                else None
            )
            if decision and decision.decision == "takeover":
                raise NeedsHuman("Target privat memerlukan takeover.")
            proposed = decision is not None and decision.decision == "approval"
            record = decision.record() if decision else {}
            if target:
                record["target"] = target.context
            if action:
                import hashlib
                import json

                payload = action.model_dump(exclude={"description", "dom", "x", "y"})
                payload["target"] = target.context if target else {}
                record["payload_hash"] = hashlib.sha256(
                    json.dumps(payload, sort_keys=True).encode()
                ).hexdigest()
                record["task_revision"] = task["revision"]
                record["generation"] = row.get("capability", {}).get("generation")
                rejected = await one(
                    conn,
                    "SELECT id FROM computer_steps WHERE task_id=%s "
                    "AND state='rejected' AND decision->>'payload_hash'=%s LIMIT 1",
                    (task["id"], record["payload_hash"]),
                )
                if rejected:
                    raise NeedsHuman("Aksi ini sudah ditolak. Pilih alternatif atau ambil alih.")
            step = await one(
                conn,
                "INSERT INTO computer_steps(id,session_id,task_id,control_version,"
                "kind,action,screen_hash,state,expires_at,decision) VALUES "
                "(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *",
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
                    json_value(record),
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


async def receipt(workspace_id, step_id, *, confirmed, stale=False):
    async with tasks.transaction() as conn:
        step = await one(
            conn,
            "UPDATE computer_steps SET state=%s,finished_at=now(),outcome=%s "
            "WHERE id=%s AND state IN ('observing','dispatched') RETURNING kind",
            (
                "stale" if stale else "complete" if confirmed else "unknown",
                json_value(
                    {
                        "input_acknowledged": confirmed and not stale,
                        "postcondition_satisfied": None,
                        "rejected_stale": stale,
                    }
                ),
                step_id,
            ),
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
        await store.current(execution, workspace["id"])
        confirmed = True
        return screen
    finally:
        await receipt(workspace["id"], step["id"], confirmed=confirmed)


async def observe_dom(execution, workspace, session, runtime):
    step = await begin(execution, workspace, session)
    confirmed = False
    try:
        page = await runtime.observe_dom(workspace)
        await store.current(execution, workspace["id"])
        confirmed = True
        return page
    finally:
        await receipt(workspace["id"], step["id"], confirmed=confirmed)


async def execute(execution, workspace, session, runtime, action: Action, approved_id=None):
    inspection = await begin(execution, workspace, session)
    confirmed = False
    stale = False
    try:
        target = await runtime.target(workspace, action)
        confirmed = True
    except StaleTarget:
        confirmed, stale = True, True
        raise
    finally:
        await receipt(workspace["id"], inspection["id"], confirmed=confirmed, stale=stale)
    # Private targets remain private even when replaying an old approved proposal.
    permissions.requires_approval(action, target)
    step = await begin(
        execution,
        workspace,
        session,
        action,
        target.fingerprint,
        approved_id=approved_id,
        target=target,
    )
    confirmed = False
    stale = False
    try:
        if getattr(runtime, "supports_dispatch_receipts", False):
            await runtime.act(
                workspace,
                action,
                expected_target=target.fingerprint,
                dispatch_id=step["id"],
                strict_target=bool(approved_id) or permissions.requires_approval(action, target),
            )
        else:
            await runtime.act(workspace, action, expected_target=target.fingerprint)
        confirmed = True
    except StaleTarget:
        confirmed, stale = True, True
        raise
    except RuntimeFailure:
        # Read the local journal; never resend a device operation to learn its outcome.
        if hasattr(runtime, "dispatch_receipt"):
            try:
                result = await runtime.dispatch_receipt(workspace, step["id"])
                confirmed = result.get("executed") is True
            except Exception:
                pass
        if not confirmed:
            raise
    finally:
        await receipt(workspace["id"], step["id"], confirmed=confirmed, stale=stale)
