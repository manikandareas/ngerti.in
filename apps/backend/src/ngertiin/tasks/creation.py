"""Capture immutable user intent/context and atomically enqueue bounded text work."""

from uuid import UUID, uuid4

from fastapi import HTTPException

from ngertiin.chat.store import append_event, json_value, lock_account, one, owned_thread
from ngertiin.config import get_settings
from ngertiin.quotas import commit, reserve
from ngertiin.quotas.policy import fingerprint
from ngertiin.tasks import budget, store
from ngertiin.tasks.policy import snapshot


async def input_snapshot(conn, thread_id, instruction: str):
    rows = await (
        await conn.execute(
            "SELECT id,role,parts FROM chat_messages WHERE thread_id=%s AND status='complete' "
            "ORDER BY position DESC LIMIT 20",
            (thread_id,),
        )
    ).fetchall()
    messages, remaining = [], 8000
    for row in rows:
        text = "\n".join(part.get("text", "") for part in row["parts"] if part["type"] == "text")
        text = text.encode("utf-8")[:remaining].decode("utf-8", errors="ignore")
        if text:
            messages.append({"id": str(row["id"]), "role": row["role"], "text": text})
            remaining -= len(text.encode("utf-8"))
    return {"instruction": instruction, "messages": list(reversed(messages))}


async def create(
    owner: UUID,
    thread_id: UUID,
    request_key: UUID,
    instruction: str,
    review_required: bool,
    *,
    source_run: dict | None = None,
):
    instruction = instruction.strip()
    if not instruction or len(instruction.encode("utf-8")) > 6000:
        raise HTTPException(422, "Instruksi task harus berisi 1–6000 byte teks.")
    digest = fingerprint(
        {
            "thread_id": str(thread_id),
            "instruction": instruction,
            "review_required": review_required,
        }
    )
    async with store.transaction() as conn:
        await lock_account(conn, owner)
        thread = await owned_thread(conn, owner, thread_id, lock=True)
        previous = await one(
            conn,
            "SELECT * FROM background_tasks WHERE owner_id=%s AND request_key=%s",
            (owner, request_key),
        )
        if previous:
            if previous["fingerprint"] != digest:
                raise HTTPException(409, "Kunci task sudah dipakai untuk instruksi berbeda.")
            return await store.view(conn, previous)
        if not get_settings().openai_api_key.get_secret_value():
            raise HTTPException(503, "Agent belum tersedia. Coba lagi nanti.")
        if source_run:
            valid = await one(
                conn,
                "SELECT id FROM chat_runs WHERE id=%s AND owner_id=%s AND thread_id=%s "
                "AND lease_token=%s AND status='running' AND NOT cancel_requested FOR SHARE",
                (source_run["id"], owner, thread_id, source_run["lease_token"]),
            )
            if not valid:
                raise store.StaleExecution()
        policy, task_id = snapshot(), uuid4()
        await budget.admit(conn, owner, policy)
        captured = await input_snapshot(conn, thread_id, instruction)
        title = " ".join(instruction.split())
        if len(title) > 100:
            title = title[:96].rsplit(" ", 1)[0] + "…"
        task = await one(
            conn,
            "INSERT INTO "
            "background_tasks(id,owner_id,thread_id,source_run_id,request_key,fingerprint,"
            "title,instruction,input_snapshot,review_required,budget_cap,budget_policy) "
            "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *",
            (
                task_id,
                owner,
                thread_id,
                source_run["id"] if source_run else None,
                request_key,
                digest,
                title,
                instruction,
                json_value(captured),
                review_required,
                policy["task_cap"],
                json_value(policy),
            ),
        )
        if not source_run:
            allocation = await reserve(conn, owner, "chat", f"task-input:{task_id}", 1, digest)
            for index, (role, text) in enumerate(
                (
                    ("user", instruction),
                    (
                        "assistant",
                        "Task sudah dibuat. Kamu bisa melanjutkan percakapan sambil menunggu.",
                    ),
                )
            ):
                message = await one(
                    conn,
                    "INSERT INTO chat_messages(id,thread_id,role,parts,status,position) "
                    "VALUES (%s,%s,%s,%s,'complete',%s) RETURNING "
                    "id,role,parts,status,run_id,position",
                    (
                        uuid4(),
                        thread_id,
                        role,
                        json_value([{"id": "text", "type": "text", "text": text}]),
                        thread["seq"] + index + 1,
                    ),
                )
                await append_event(conn, thread_id, {"type": "message.upsert", "message": message})
            await commit(conn, owner, allocation, "task_public_card")
        await store.enqueue(conn, task)
        await store.emit(conn, task)
        return await store.view(conn, task)
