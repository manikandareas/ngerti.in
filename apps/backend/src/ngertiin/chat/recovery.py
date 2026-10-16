"""Repair delivery gaps after queue aborts without retrying user-visible failures."""

from ngertiin.chat.db import transaction
from ngertiin.chat.store import append_event, enqueue, one, owned_thread


async def reconcile_deliveries():
    async with transaction() as conn:
        candidates = await (
            await conn.execute(
                "SELECT r.id FROM chat_runs r JOIN procrastinate_jobs j ON j.id=r.job_id "
                "WHERE r.status IN ('queued','running') "
                "AND j.status::text IN ('failed','aborted','succeeded') LIMIT 50"
            )
        ).fetchall()
    for item in candidates:
        async with transaction() as conn:
            run = await one(conn, "SELECT * FROM chat_runs WHERE id=%s", (item["id"],))
            await owned_thread(conn, run["owner_id"], run["thread_id"], lock=True)
            run = await one(conn, "SELECT * FROM chat_runs WHERE id=%s FOR UPDATE", (item["id"],))
            job = await one(
                conn, "SELECT status::text FROM procrastinate_jobs WHERE id=%s", (run["job_id"],)
            )
            if run["status"] not in ("queued", "running") or job["status"] not in (
                "failed",
                "aborted",
                "succeeded",
            ):
                continue
            if run["attempt"] < 3:
                await conn.execute(
                    "UPDATE chat_runs SET status='queued',lease_token=NULL WHERE id=%s",
                    (run["id"],),
                )
                await enqueue(conn, run["id"], run["thread_id"])
                status, error = "queued", None
            else:
                status, error = (
                    "failed",
                    "Pemulihan terhenti. Pesanmu tetap tersimpan. Coba lagi saat siap.",
                )
                await conn.execute(
                    "UPDATE chat_runs SET status='failed',lease_token=NULL,error=%s WHERE id=%s",
                    (error, run["id"]),
                )
                message = await one(
                    conn,
                    "UPDATE chat_messages SET status='failed' WHERE run_id=%s AND role='assistant' "
                    "RETURNING id,role,parts,status,run_id,position",
                    (run["id"],),
                )
                await append_event(
                    conn, run["thread_id"], {"type": "message.upsert", "message": message}
                )
            await append_event(
                conn,
                run["thread_id"],
                {
                    "type": "run.status",
                    "run": {"id": str(run["id"]), "status": status, "error": error},
                },
            )
