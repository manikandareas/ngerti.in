"""Exclusive handoff drains commands/channels; return always requires a fresh observation."""

import asyncio
from datetime import UTC, datetime
from uuid import uuid4

from fastapi import HTTPException

from ngertiin.chat.store import json_value, one
from ngertiin.computer import policy, store
from ngertiin.tasks import budget
from ngertiin.tasks import store as tasks


async def active(conn, task):
    workspace = await one(
        conn,
        "SELECT * FROM browser_workspaces WHERE owner_id=%s "
        "AND active_task_id=%s AND state<>'deleted' FOR UPDATE",
        (task["owner_id"], task["id"]),
    )
    if not workspace:
        raise HTTPException(409, "Task ini tidak sedang memakai komputer.")
    return workspace


async def change(owner, task_id, version, destination):
    async with tasks.locked(owner, task_id) as (conn, task):
        row = await active(conn, task)
        if row["state"] != "ready" or row["deadline"] <= datetime.now(UTC) or row["unknown_effect"]:
            raise HTTPException(409, "Sesi tidak siap; periksa outcome atau hentikan Task.")
        if row["control_version"] != version:
            raise HTTPException(409, "Kendali sudah berubah. Muat ulang status terbaru.")
        transitional = "handoff" if destination == "human" else "resuming"
        if row["control"] not in ("agent", "human", transitional):
            raise HTTPException(409, "Pergantian kendali lain masih berlangsung.")
        if row["control"] != transitional:
            await budget.abandon_calls(conn, task)
            row = await one(
                conn,
                "UPDATE browser_workspaces SET control=%s,"
                "control_version=control_version+1,updated_at=now() WHERE id=%s RETURNING *",
                (transitional, row["id"]),
            )
            await conn.execute(
                "UPDATE computer_viewers SET closed=true WHERE workspace_id=%s", (row["id"],)
            )
            await conn.execute(
                "UPDATE computer_steps SET state='stale' WHERE task_id=%s "
                "AND state IN ('proposed','approved')",
                (task_id,),
            )
            await store.yield_task(
                conn, task, "computer_handoff" if destination == "human" else "computer_resuming"
            )
    # Closing a grant and acknowledging the actual channel close are different.
    for _ in range(40):
        async with tasks.transaction() as conn:
            current = await store.owned(conn, owner, row["id"])
            channels = await one(
                conn,
                "SELECT count(*) AS n FROM computer_viewers "
                "WHERE workspace_id=%s AND connected AND channel_deadline>now()",
                (row["id"],),
            )
        if not current["busy"] and not channels["n"]:
            break
        await asyncio.sleep(0.25)
    else:
        raise HTTPException(
            409, "Menunggu aksi/koneksi lama selesai. Coba pergantian kendali lagi."
        )
    async with tasks.locked(owner, task_id) as (conn, task):
        current = await active(conn, task)
        if (
            current["control_version"] != row["control_version"]
            or current["busy"]
            or current["unknown_effect"]
            or current["control"] != transitional
        ):
            raise HTTPException(409, "Kendali berubah atau outcome aksi belum pasti.")
    if destination == "agent":
        # Human input already revoked and the old upstream is closed. This image
        # is deliberately not retained; the resumed worker observes again.
        try:
            observed = await policy.get_runtime(row["provider"]).observe(row)
        except Exception:
            raise HTTPException(
                503, "Layar terbaru belum dapat dibaca. Gwen belum dilanjutkan."
            ) from None
    async with tasks.locked(owner, task_id) as (conn, task):
        current = await active(conn, task)
        if (
            current["control_version"] != row["control_version"]
            or current["control"] != transitional
            or current["state"] != "ready"
            or current["deadline"] <= datetime.now(UTC)
        ):
            raise HTTPException(409, "Sesi/kendali sudah berubah.")
        await conn.execute(
            "UPDATE browser_workspaces SET control=%s,updated_at=now() WHERE id=%s",
            (destination, current["id"]),
        )
        if destination == "agent":
            session = await one(
                conn,
                "SELECT id FROM computer_sessions WHERE task_id=%s AND state='active'",
                (task_id,),
            )
            if not session:
                raise HTTPException(409, "Sesi Task tidak lagi aktif.")
            await conn.execute(
                "INSERT INTO computer_steps(id,session_id,task_id,control_version,"
                "kind,action,screen_hash,state,expires_at,finished_at) "
                "VALUES (%s,%s,%s,%s,'control_return',%s,%s,'complete',%s,now())",
                (
                    uuid4(),
                    session["id"],
                    task_id,
                    current["control_version"],
                    json_value(
                        {
                            "kind": "control_return",
                            "description": (
                                "Pengguna mengembalikan kendali. Baca perubahan layar dan "
                                "lanjutkan tujuan Task; login mungkin sudah selesai."
                            ),
                        }
                    ),
                    observed.fingerprint,
                    current["deadline"],
                ),
            )
            await tasks.change(conn, task, status="queued", stage="computer_resuming", error=None)
            await tasks.enqueue(conn, task)
        else:
            await tasks.change(conn, task, stage="computer_human", error=None)
        await tasks.emit(conn, task)
        return await tasks.view(conn, task)


async def decide(owner, task_id, step_id, version, approved):
    async with tasks.locked(owner, task_id) as (conn, task):
        row = await active(conn, task)
        step = await one(
            conn,
            "SELECT * FROM computer_steps WHERE id=%s AND task_id=%s FOR UPDATE",
            (step_id, task_id),
        )
        if (
            not step
            or row["control_version"] != version
            or step["control_version"] != version
            or row["control"] != "agent"
            or row["state"] != "ready"
            or row["unknown_effect"]
        ):
            raise HTTPException(409, "Proposal tidak cocok dengan kendali saat ini.")
        if step["state"] in ("approved", "dispatched", "complete") and approved:
            return await tasks.view(conn, task)
        if step["state"] != "proposed" or step["expires_at"] <= datetime.now(UTC):
            raise HTTPException(409, "Proposal sudah berubah atau kedaluwarsa.")
        if task["status"] != "waiting_user" or task["stage"] != "computer_approval":
            raise HTTPException(409, "Task tidak menunggu proposal ini.")
        await conn.execute(
            "UPDATE computer_steps SET state=%s WHERE id=%s",
            ("approved" if approved else "rejected", step_id),
        )
        if approved:
            await tasks.change(conn, task, status="queued", stage="computer_working", error=None)
            await tasks.enqueue(conn, task)
        else:
            await tasks.change(
                conn,
                task,
                stage="computer_human",
                error="Aksi ditolak. Ambil alih atau lanjutkan untuk langkah lain.",
            )
        await tasks.emit(conn, task)
        return await tasks.view(conn, task)
