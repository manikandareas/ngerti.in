"""Exact text-finalization proposals and transactional, deduplicated delivery."""

from datetime import UTC, datetime
from uuid import UUID, uuid5

from fastapi import HTTPException

from ngertiin.chat.store import append_event, json_value, one
from ngertiin.quotas.policy import fingerprint
from ngertiin.tasks import budget, store


def review_hash(task):
    if not task.get("output_spec"):
        return fingerprint(task["draft"])
    return fingerprint(
        {
            "draft": task["draft"],
            "outputs": task["output_spec"],
            "inputs": task["input_snapshot"].get("files", []),
            "previous_result": task["input_snapshot"].get("previous_result"),
            "result_id": str(task["result_id"]),
        }
    )


async def ensure(execution: dict):
    async with store.locked(execution["owner_id"], execution["id"]) as (conn, task):
        store.fence(task, execution)
        if not task["draft"].strip():
            raise ValueError("Belum ada draft yang dapat difinalisasi.")
        if task.get("output_spec"):
            from ngertiin.files.validation import outputs

            value = outputs(
                task["draft"],
                task["output_spec"],
                allow_staged=task.get("runtime_kind") in ("code", "browser"),
            )
            if task.get("runtime_kind") in ("code", "browser"):
                from ngertiin.sandbox.outputs import resolve

                await resolve(conn, task, value)
        await store.persist_revision(conn, task, uuid5(task["id"], f"draft:{task['revision']}"))
        action_id = uuid5(task["id"], f"finalize:{task['revision']}")
        await conn.execute(
            "INSERT INTO "
            "task_actions(id,task_id,revision,kind,target_id,content_hash,content,status) "
            "VALUES (%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING",
            (
                action_id,
                task["id"],
                task["revision"],
                "finalize_result" if task.get("output_spec") else "finalize_text",
                task["thread_id"],
                review_hash(task),
                task["draft"],
                "proposed" if task["review_required"] else "approved",
            ),
        )
        await store.emit(conn, task)
        return await one(conn, "SELECT * FROM task_actions WHERE id=%s", (action_id,))


async def approved(conn, task: dict, action_id: UUID):
    action = await one(
        conn,
        "SELECT * FROM task_actions WHERE id=%s AND task_id=%s FOR UPDATE",
        (action_id, task["id"]),
    )
    if (
        not action
        or action["revision"] != task["revision"]
        or action["target_id"] != task["thread_id"]
        or action["content_hash"] != review_hash(task)
        or action["status"] not in ("approved", "executing", "succeeded")
    ):
        raise ValueError("Persetujuan tidak cocok dengan versi draft saat ini.")
    return action


async def decide(owner: UUID, action_id: UUID, revision: int, approve: bool, request_key: UUID):
    async with store.transaction() as conn:
        row = await one(
            conn,
            "SELECT t.id FROM task_actions a JOIN background_tasks t ON t.id=a.task_id "
            "WHERE a.id=%s AND t.owner_id=%s",
            (action_id, owner),
        )
    if not row:
        raise HTTPException(404, "Proposal tidak ditemukan.")
    async with store.locked(owner, row["id"]) as (conn, task):
        action = await one(conn, "SELECT * FROM task_actions WHERE id=%s FOR UPDATE", (action_id,))
        if (
            revision != task["revision"]
            or revision != action["revision"]
            or action["content_hash"] != review_hash(task)
        ):
            raise HTTPException(
                409, "Draft sudah berubah. Tinjau versi terbaru sebelum memutuskan."
            )
        accepted = ("approved", "executing", "succeeded") if approve else ("rejected",)
        if action["status"] in accepted:
            return await store.view(conn, task)
        if action["status"] != "proposed" or task["status"] != "waiting_user":
            raise HTTPException(409, "Proposal ini tidak lagi menunggu keputusan.")
        if approve and action["expires_at"] <= datetime.now(UTC):
            raise HTTPException(
                409, "Proposal kedaluwarsa. Simpan versi draft baru untuk meninjaunya lagi."
            )
        if approve:
            await budget.admit(
                conn, owner, {**task["budget_policy"], "task_cap": 0}, day=task["budget_day"]
            )
        await conn.execute(
            "UPDATE task_actions SET status=%s,decision_key=%s,decided_at=now() WHERE id=%s",
            ("approved" if approve else "rejected", request_key, action_id),
        )
        if approve:
            await store.change(
                conn,
                task,
                status="queued",
                resume=json_value({"action_id": str(action_id)}),
                error=None,
            )
            await store.enqueue(conn, task)
        else:
            await store.change(
                conn,
                task,
                status="cancelled",
                stage="rejected",
                lease_token=None,
                error="Draft ditolak. Isinya tetap tersimpan.",
            )
        await store.emit(conn, task)
        return await store.view(conn, task)


async def begin(execution: dict, action_id: UUID):
    async with store.locked(execution["owner_id"], execution["id"]) as (conn, task):
        store.fence(task, execution)
        await approved(conn, task, action_id)
        await conn.execute(
            "UPDATE task_actions SET status='executing' WHERE id=%s AND status='approved'",
            (action_id,),
        )
        await store.change(conn, task, stage="publishing")
        await store.emit(conn, task)


async def publish(execution: dict, action_id: UUID, *, version_id=None):
    async with store.locked(execution["owner_id"], execution["id"]) as (conn, task):
        store.fence(task, execution)
        action = await approved(conn, task, action_id)
        delivered_text = action["content"]
        result_parts = []
        if task.get("result_id"):
            from ngertiin.files.results import commit

            if version_id is None:
                raise ValueError("Manifest hasil belum dipublikasikan.")
            manifest = await commit(conn, task, version_id)
            delivered_text = manifest["summary"]
            result_parts = [{"id": "result", "type": "result", "result_id": str(task["result_id"])}]
        previous = await one(
            conn, "SELECT message_id FROM task_deliveries WHERE task_id=%s", (task["id"],)
        )
        if not previous:
            thread = await one(
                conn, "SELECT seq FROM chat_threads WHERE id=%s", (task["thread_id"],)
            )
            message_id = uuid5(task["id"], "delivery")
            message = await one(
                conn,
                "INSERT INTO chat_messages(id,thread_id,role,parts,status,position) "
                "VALUES (%s,%s,'assistant',%s,'complete',%s) RETURNING "
                "id,role,parts,status,run_id,position",
                (
                    message_id,
                    task["thread_id"],
                    json_value(
                        [
                            {
                                "id": "text",
                                "type": "text",
                                "text": f"Hasil task: {task['title']}\n\n{delivered_text}",
                            }
                        ]
                        + result_parts
                    ),
                    thread["seq"] + 1,
                ),
            )
            await conn.execute(
                "INSERT INTO task_deliveries(task_id,action_id,message_id) VALUES (%s,%s,%s)",
                (task["id"], action_id, message_id),
            )
            await append_event(
                conn, task["thread_id"], {"type": "message.upsert", "message": message}
            )
        await conn.execute(
            "UPDATE task_actions SET status='succeeded',outcome=%s WHERE id=%s",
            (json_value({"delivery": str(task["id"]), "effect": "confirmed"}), action_id),
        )
        await store.finish_execution(conn, task, "succeeded")
        await store.change(
            conn,
            task,
            result=delivered_text,
            status="succeeded",
            stage="complete",
            lease_token=None,
            resume=None,
            error=None,
        )
        await store.emit(conn, task)


async def unknown(execution: dict, action_id: UUID):
    """Adapter boundary for an unacknowledged effect; never replay it blindly."""
    async with store.locked(execution["owner_id"], execution["id"]) as (conn, task):
        store.fence(task, execution)
        await approved(conn, task, action_id)
        await conn.execute("UPDATE task_actions SET status='unknown' WHERE id=%s", (action_id,))
        await store.finish_execution(conn, task, "waiting_user")
        await store.change(
            conn,
            task,
            status="waiting_user",
            stage="unknown",
            lease_token=None,
            error="Hasil tindakan belum terkonfirmasi. Periksa outcome sebelum mencoba lagi.",
        )
        await store.emit(conn, task)


async def reconcile(owner: UUID, task_id: UUID):
    """Only the built-in transactional text adapter is available in NG-033."""
    async with store.locked(owner, task_id) as (conn, task):
        action = await one(
            conn,
            "SELECT * FROM task_actions WHERE task_id=%s AND revision=%s FOR UPDATE",
            (task_id, task["revision"]),
        )
        if not action or action["status"] != "unknown" or task["stage"] != "unknown":
            raise HTTPException(409, "Tidak ada outcome yang perlu diperiksa.")
        delivery = await one(
            conn, "SELECT message_id FROM task_deliveries WHERE task_id=%s", (task_id,)
        )
        if delivery:
            await conn.execute(
                "UPDATE task_actions SET status='succeeded' WHERE id=%s", (action["id"],)
            )
            await store.change(
                conn,
                task,
                status="succeeded",
                stage="complete",
                result=action["content"],
                error=None,
            )
        elif task["status"] == "cancelled":
            await conn.execute(
                "UPDATE task_actions SET status='cancelled',outcome=%s WHERE id=%s",
                (json_value({"effect": "not_applied"}), action["id"]),
            )
            await store.change(conn, task, stage="cancelled", error=None)
        else:
            # Text publication and its receipt share a transaction. No receipt
            # proves this adapter did not publish; external adapters need their
            # own provider lookup and must not reuse this inference.
            await budget.admit(
                conn, owner, {**task["budget_policy"], "task_cap": 0}, day=task["budget_day"]
            )
            await conn.execute(
                "UPDATE task_actions SET status='approved' WHERE id=%s", (action["id"],)
            )
            await store.change(
                conn,
                task,
                status="queued",
                stage="publishing",
                resume=json_value({"action_id": str(action["id"])}),
                error=None,
            )
            await store.enqueue(conn, task)
        await store.emit(conn, task)
        return await store.view(conn, task)
