"""Human decisions bind to a saved tool call; retry never creates another action."""

from uuid import UUID, uuid5

from fastapi import HTTPException

from ngertiin.async_db import transaction
from ngertiin.chat import quota
from ngertiin.chat.store import (
    append_event,
    enqueue,
    json_value,
    lock_account,
    one,
    owned_thread,
    require_capacity,
)


async def save_interrupts(run: dict, interrupts: list, parts: list, usage: dict):
    from ngertiin.chat.store import StaleRun

    async with transaction() as conn:
        await lock_account(conn, run["owner_id"])
        await owned_thread(conn, run["owner_id"], run["thread_id"], lock=True)
        valid = await one(
            conn,
            "SELECT id FROM chat_runs WHERE id=%s AND lease_token=%s "
            "AND status='running' AND NOT cancel_requested FOR UPDATE",
            (run["id"], run["lease_token"]),
        )
        if not valid:
            raise StaleRun()
        for item in interrupts:
            iid = str(item.id)
            value = item.value
            if (
                value.get("type") != "tool_approval"
                or not isinstance(value.get("name"), str)
                or not value["name"]
                or not isinstance(value.get("args"), dict)
                or not isinstance(value.get("tool_call_id"), str)
                or not value["tool_call_id"]
            ):
                raise ValueError("Unsupported approval request")
            action = {
                "name": value["name"],
                "args": value["args"],
                "tool_call_id": value["tool_call_id"],
            }
            for part in parts:
                if part["id"] == value["tool_call_id"]:
                    part["status"] = "waiting"
            pid = uuid5(run["id"], iid)
            await conn.execute(
                "INSERT INTO chat_approvals(id,thread_id,run_id,interrupt_id,action) "
                "VALUES (%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING",
                (pid, run["thread_id"], run["id"], iid, json_value(action)),
            )
            approval = await one(
                conn,
                "SELECT id,run_id,action,revision,status,expires_at FROM chat_approvals "
                "WHERE id=%s",
                (pid,),
            )
            await append_event(
                conn, run["thread_id"], {"type": "approval.upsert", "approval": approval}
            )
        await quota.settle(conn, run, parts, "waiting_approval", approval=bool(interrupts))
        await conn.execute(
            "UPDATE chat_runs SET status='waiting_approval',resume=NULL,usage=%s WHERE id=%s",
            (json_value(usage), run["id"]),
        )
        await conn.execute(
            "UPDATE chat_messages SET parts=%s,status='waiting_approval' WHERE id=%s",
            (json_value(parts), run["message"]["id"]),
        )
        await append_event(
            conn,
            run["thread_id"],
            {
                "type": "message.upsert",
                "message": {
                    "id": str(run["message"]["id"]),
                    "role": "assistant",
                    "run_id": str(run["id"]),
                    "parts": parts,
                    "status": "waiting_approval",
                },
            },
        )
        await append_event(
            conn,
            run["thread_id"],
            {"type": "run.status", "run": {"id": str(run["id"]), "status": "waiting_approval"}},
        )


async def decide(owner: UUID, proposal: UUID, revision: int, approved: bool, key: UUID):
    async with transaction() as conn:
        item = await one(
            conn,
            "SELECT a.*,r.owner_id FROM chat_approvals a JOIN chat_runs r ON r.id=a.run_id "
            "WHERE a.id=%s AND r.owner_id=%s",
            (proposal, owner),
        )
        if not item:
            raise HTTPException(404, "Permintaan tidak ditemukan.")
        await lock_account(conn, owner)
        await owned_thread(conn, owner, item["thread_id"], lock=True)
        item = await one(
            conn,
            "SELECT *,expires_at>now() AS valid FROM chat_approvals WHERE id=%s FOR UPDATE",
            (proposal,),
        )
        expected = "approved" if approved else "rejected"
        if item["status"] != "pending":
            if item["decision_key"] == key and item["status"] == expected:
                return {"status": expected}
            raise HTTPException(409, "Keputusan ini sudah diproses. Muat ulang percakapan.")
        if not item["valid"] or item["revision"] != revision:
            raise HTTPException(
                409, "Permintaan sudah berubah atau kedaluwarsa. Minta usulan baru."
            )
        run = await one(conn, "SELECT * FROM chat_runs WHERE id=%s FOR UPDATE", (item["run_id"],))
        if run["status"] != "waiting_approval" or run["cancel_requested"]:
            raise HTTPException(409, "Permintaan tidak lagi menunggu keputusan.")
        await require_capacity(conn, owner)
        await conn.execute(
            "UPDATE chat_approvals SET status=%s,decision_key=%s,decided_at=now() WHERE id=%s",
            (expected, key, proposal),
        )
        decision = {item["interrupt_id"]: {"type": "approve" if approved else "reject"}}
        await conn.execute(
            "UPDATE chat_runs SET status='queued',resume=%s WHERE id=%s",
            (json_value(decision), item["run_id"]),
        )
        await enqueue(conn, item["run_id"], item["thread_id"])
        await append_event(
            conn,
            item["thread_id"],
            {
                "type": "approval.upsert",
                "approval": {
                    "id": str(proposal),
                    "run_id": str(item["run_id"]),
                    "action": item["action"],
                    "revision": revision,
                    "status": expected,
                    "expires_at": item["expires_at"],
                },
            },
        )
        await append_event(
            conn,
            item["thread_id"],
            {
                "type": "run.status",
                "run": {
                    "id": str(item["run_id"]),
                    "status": "queued",
                },
            },
        )
    return {"status": expected}
