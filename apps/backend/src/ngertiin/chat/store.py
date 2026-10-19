"""Short serialized transactions own the transcript, cursor, and run fencing."""

import json
from uuid import UUID, uuid4, uuid5

from fastapi import HTTPException
from psycopg.types.json import Jsonb

from ngertiin.async_db import transaction
from ngertiin.chat import quota

ACTIVE = ("queued", "running", "waiting_approval", "cancelling")


def json_value(value):
    return Jsonb(json.loads(json.dumps(value, default=str)))


async def one(conn, query: str, args=()):
    return await (await conn.execute(query, args)).fetchone()


async def owned_thread(conn, owner: UUID, thread: UUID, *, lock: bool = False):
    row = await one(
        conn,
        "SELECT * FROM chat_threads WHERE id=%s AND owner_id=%s" + (" FOR UPDATE" if lock else ""),
        (thread, owner),
    )
    if not row:
        raise HTTPException(404, "Percakapan tidak ditemukan.")
    return row


async def append_event(conn, thread: UUID, payload: dict):
    row = await one(
        conn,
        "UPDATE chat_threads SET seq=seq+1, updated_at=now() WHERE id=%s RETURNING seq",
        (thread,),
    )
    event = {"version": 1, "thread_id": str(thread), "seq": row["seq"], **payload}
    await conn.execute(
        "INSERT INTO chat_events(thread_id,seq,payload) VALUES (%s,%s,%s)",
        (thread, row["seq"], json_value(event)),
    )
    return event


async def bootstrap(owner: UUID):
    from ngertiin.persona.store import current

    async with transaction() as conn:
        profile = await current(conn, owner)
        await conn.execute(
            "INSERT INTO chat_threads(id,owner_id,kind,title) VALUES (%s,%s,'main','Main chat') "
            "ON CONFLICT DO NOTHING",
            (uuid5(owner, "main-chat"), owner),
        )
        threads = await (
            await conn.execute(
                "SELECT id,kind,title,updated_at FROM chat_threads WHERE owner_id=%s "
                "ORDER BY kind,updated_at DESC",
                (owner,),
            )
        ).fetchall()
    return {"threads": threads, "profile": profile}


async def create_thread(owner: UUID, request_key: UUID):
    thread = uuid5(owner, f"side:{request_key}")
    async with transaction() as conn:
        await conn.execute(
            "INSERT INTO chat_threads(id,owner_id,kind,title) VALUES (%s,%s,'side','Chat baru') "
            "ON CONFLICT DO NOTHING",
            (thread, owner),
        )
        return await owned_thread(conn, owner, thread)


async def snapshot(owner: UUID, thread: UUID):
    async with transaction() as conn:
        current = await owned_thread(conn, owner, thread, lock=True)
        # Snapshot and through_seq share the same thread lock as event writers.
        messages = await (
            await conn.execute(
                "SELECT id,role,parts,status,run_id,created_at,position FROM chat_messages WHERE "
                "thread_id=%s "
                "ORDER BY position DESC LIMIT 60",
                (thread,),
            )
        ).fetchall()
        run = await one(
            conn,
            "SELECT id,status,error,attempt,request_key FROM chat_runs WHERE thread_id=%s "
            "ORDER BY created_at DESC LIMIT 1",
            (thread,),
        )
        approvals = await (
            await conn.execute(
                "SELECT id,run_id,action,revision,status,expires_at FROM chat_approvals "
                "WHERE thread_id=%s ORDER BY created_at DESC LIMIT 30",
                (thread,),
            )
        ).fetchall()
        from ngertiin.tasks.store import view as task_view

        task_rows = await (
            await conn.execute(
                "SELECT * FROM background_tasks WHERE thread_id=%s "
                "ORDER BY (status IN ('queued','running','waiting_user')) "
                "DESC,created_at DESC LIMIT 50",
                (thread,),
            )
        ).fetchall()
        tasks = [await task_view(conn, task) for task in task_rows]
    return {
        "thread": current,
        "messages": list(reversed(messages)),
        "run": run,
        "approvals": approvals,
        "tasks": tasks,
        "through_seq": current["seq"],
        "has_more": len(messages) == 60,
    }


async def history(owner: UUID, thread: UUID, before: int):
    async with transaction() as conn:
        await owned_thread(conn, owner, thread)
        rows = await (
            await conn.execute(
                "SELECT id,role,parts,status,run_id,created_at,position FROM chat_messages "
                "WHERE thread_id=%s AND position<%s ORDER BY position DESC LIMIT 60",
                (thread, before),
            )
        ).fetchall()
    return {"messages": list(reversed(rows)), "has_more": len(rows) == 60}


async def enqueue(conn, run: UUID, thread: UUID):
    from ngertiin.chat.tasks import chat_job

    job = await chat_job.configure(connection=conn, lock=f"chat:{thread}").defer_async(
        run_id=str(run)
    )
    await conn.execute("UPDATE chat_runs SET job_id=%s WHERE id=%s", (job, run))


async def lock_account(conn, owner: UUID):
    await one(conn, "SELECT id FROM accounts WHERE id=%s FOR UPDATE", (owner,))


async def require_capacity(conn, owner: UUID):
    count = await one(
        conn,
        "SELECT count(*) AS n FROM chat_runs WHERE owner_id=%s AND status IN ('queued','running')",
        (owner,),
    )
    if count["n"] >= 3:
        raise HTTPException(429, "Tiga percakapan sedang berjalan. Tunggu salah satunya selesai.")


async def submit(owner: UUID, thread: UUID, request_key: UUID, text: str):
    from ngertiin.config import get_settings

    if not get_settings().openai_api_key.get_secret_value():
        raise HTTPException(503, "Agent belum tersedia. Silakan coba lagi nanti.")
    async with transaction() as conn:
        await lock_account(conn, owner)
        current = await owned_thread(conn, owner, thread, lock=True)
        previous = await one(
            conn,
            "SELECT id,thread_id,input FROM chat_runs WHERE owner_id=%s AND request_key=%s",
            (owner, request_key),
        )
        if previous:
            if previous["thread_id"] != thread or previous["input"] != text:
                raise HTTPException(409, "Kunci pengiriman sudah dipakai untuk pesan lain.")
            return {"id": previous["id"]}
        active = await one(
            conn,
            "SELECT id FROM chat_runs WHERE thread_id=%s AND status=ANY(%s)",
            (thread, list(ACTIVE)),
        )
        if active:
            raise HTTPException(
                409, "Selesaikan respons atau keputusan sebelumnya terlebih dahulu."
            )
        await require_capacity(conn, owner)
        run, user, assistant = uuid4(), uuid4(), uuid4()
        allocation = await quota.admit(conn, owner, run, text)
        await conn.execute(
            "INSERT INTO chat_runs(id,thread_id,owner_id,request_key,input,"
            "quota_operation_id,quota_token) "
            "VALUES (%s,%s,%s,%s,%s,%s,%s)",
            (run, thread, owner, request_key, text, allocation.id, allocation.token),
        )
        from ngertiin.persona.store import current as current_persona

        profile = await current_persona(conn, owner)
        await conn.execute(
            "UPDATE chat_runs SET persona_snapshot=%s WHERE id=%s", (json_value(profile), run)
        )
        for index, (mid, role, parts, status) in enumerate(
            (
                (user, "user", [{"id": "text", "type": "text", "text": text}], "complete"),
                (assistant, "assistant", [], "queued"),
            )
        ):
            await conn.execute(
                "INSERT INTO chat_messages(id,thread_id,run_id,role,parts,status,position) VALUES "
                "(%s,%s,%s,%s,%s,%s,%s)",
                (mid, thread, run, role, json_value(parts), status, current["seq"] + index + 1),
            )
            await append_event(
                conn,
                thread,
                {
                    "type": "message.upsert",
                    "message": {
                        "id": str(mid),
                        "role": role,
                        "parts": parts,
                        "status": status,
                        "run_id": str(run),
                        "position": current["seq"] + index + 1,
                    },
                },
            )
        if current["kind"] == "side" and current["title"] == "Chat baru":
            await conn.execute("UPDATE chat_threads SET title=%s WHERE id=%s", (text[:64], thread))
        await enqueue(conn, run, thread)
        await append_event(
            conn, thread, {"type": "run.status", "run": {"id": str(run), "status": "queued"}}
        )
    return {"id": run}


class StaleRun(Exception):
    """A cancelled or replaced worker may no longer publish."""


async def claim(run_id: UUID):
    async with transaction() as conn:
        run = await one(conn, "SELECT * FROM chat_runs WHERE id=%s", (run_id,))
        if not run or run["status"] not in ("queued", "running") or run["cancel_requested"]:
            return None
        await owned_thread(conn, run["owner_id"], run["thread_id"], lock=True)
        run = await one(conn, "SELECT * FROM chat_runs WHERE id=%s FOR UPDATE", (run_id,))
        if run["status"] not in ("queued", "running") or run["cancel_requested"]:
            return None
        token = uuid4()
        run = await one(
            conn,
            "UPDATE chat_runs SET "
            "status='running',attempt=attempt+1,lease_token=%s,updated_at=now() "
            "WHERE id=%s RETURNING *",
            (token, run_id),
        )
        message = await one(
            conn, "SELECT * FROM chat_messages WHERE run_id=%s AND role='assistant'", (run_id,)
        )
        profile = run["persona_snapshot"]
        if not profile:
            # A pre-NG-016 process may have queued this during a rolling migration.
            from ngertiin.persona.store import current as current_persona

            profile = await current_persona(conn, run["owner_id"])
            await conn.execute(
                "UPDATE chat_runs SET persona_snapshot=%s WHERE id=%s",
                (json_value(profile), run_id),
            )
        return {**run, "message": message, "profile": profile}


async def publish(
    run: dict, parts: list, status: str, *, error: str | None = None, usage: dict | None = None
):
    async with transaction() as conn:
        await lock_account(conn, run["owner_id"])
        await owned_thread(conn, run["owner_id"], run["thread_id"], lock=True)
        valid = await one(
            conn,
            "SELECT cancel_requested FROM chat_runs WHERE id=%s AND lease_token=%s AND "
            "status='running' FOR UPDATE",
            (run["id"], run["lease_token"]),
        )
        if not valid or valid["cancel_requested"]:
            raise StaleRun()
        from ngertiin.memory.invalidation import revoke_locked
        from ngertiin.memory.invalidation import valid as memory_valid

        if not await memory_valid(
            conn, run["owner_id"], run.get("memory_generation"), run.get("memory_refs", [])
        ):
            await revoke_locked(conn, run["owner_id"])
            return
        await quota.settle(conn, run, parts, status)
        await conn.execute(
            "UPDATE chat_messages SET parts=%s,status=%s WHERE id=%s",
            (json_value(parts), status, run["message"]["id"]),
        )
        await conn.execute(
            "UPDATE chat_runs SET status=%s,error=%s,usage=COALESCE(%s,usage),updated_at=now() "
            "WHERE id=%s",
            (status, error, json_value(usage) if usage is not None else None, run["id"]),
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
                    "status": status,
                },
            },
        )
        if status != "running":
            if status == "complete":
                from ngertiin.memory.service import enqueue_run

                await enqueue_run(conn, run)
                from ngertiin.proactivity.store import touch

                await touch(conn, run["owner_id"])
            await append_event(
                conn,
                run["thread_id"],
                {
                    "type": "run.status",
                    "run": {
                        "id": str(run["id"]),
                        "status": status,
                        "error": error,
                        "attempt": run["attempt"],
                    },
                },
            )


async def cancel(owner: UUID, run_id: UUID):
    async with transaction() as conn:
        run = await one(
            conn, "SELECT * FROM chat_runs WHERE id=%s AND owner_id=%s", (run_id, owner)
        )
        if not run:
            raise HTTPException(404, "Respons tidak ditemukan.")
        await lock_account(conn, owner)
        await owned_thread(conn, owner, run["thread_id"], lock=True)
        run = await one(conn, "SELECT * FROM chat_runs WHERE id=%s FOR UPDATE", (run_id,))
        if run["status"] not in ACTIVE:
            return {"status": run["status"]}
        await conn.execute(
            "UPDATE chat_runs SET cancel_requested=true,status='cancelled',lease_token=NULL "
            "WHERE id=%s AND status=ANY(%s)",
            (run_id, list(ACTIVE)),
        )
        approvals = await (
            await conn.execute(
                "UPDATE chat_approvals SET status='cancelled' WHERE run_id=%s AND status='pending' "
                "RETURNING id,run_id,action,revision,status,expires_at",
                (run_id,),
            )
        ).fetchall()
        for approval in approvals:
            await append_event(
                conn, run["thread_id"], {"type": "approval.upsert", "approval": approval}
            )
        message = await one(
            conn,
            "UPDATE chat_messages SET status='cancelled' WHERE run_id=%s AND role='assistant' "
            "AND status=ANY(%s) RETURNING id,role,parts,status,run_id,position",
            (run_id, list(ACTIVE)),
        )
        await quota.settle(conn, run, message["parts"] if message else [], "cancelled")
        if message:
            for part in message["parts"]:
                if part["type"] == "tool" and part.get("status") in (
                    "waiting",
                    "preparing",
                    "running",
                ):
                    part["status"] = "cancelled"
            await conn.execute(
                "UPDATE chat_messages SET parts=%s WHERE id=%s",
                (json_value(message["parts"]), message["id"]),
            )
            await append_event(
                conn, run["thread_id"], {"type": "message.upsert", "message": message}
            )
        await append_event(
            conn,
            run["thread_id"],
            {"type": "run.status", "run": {"id": str(run_id), "status": "cancelled"}},
        )
    return {"status": "cancelled"}
