"""Owner commands and canonical transitions remain independent of inference allowance."""

from contextlib import suppress
from uuid import uuid4, uuid5

from fastapi import HTTPException
from procrastinate.exceptions import AlreadyEnqueued

from ngertiin.async_db import transaction
from ngertiin.chat.store import lock_account, one
from ngertiin.config import get_settings
from ngertiin.memory import policy, sources, store
from ngertiin.memory.contracts import Candidate


async def correct(owner, entry_id, body):
    payload = {"action": "correct", "id": str(entry_id), **body.model_dump(mode="json")}
    if not policy.safe_text(body.statement):
        raise HTTPException(422, "Secret atau credential tidak dapat disimpan sebagai ingatan.")
    async with transaction() as conn:
        await lock_account(conn, owner)
        previous = await store.command(conn, owner, body.request_key, payload)
        if previous:
            return previous
        await store.settings(conn, owner)
        entry = await store.owned(conn, owner, entry_id, lock=True)
        if entry["revision"] != body.expected_revision:
            raise HTTPException(
                409, ("Ingatan sudah berubah. Muat versi terbaru sebelum menyimpan.")
            )
        key = entry["memory_key"]
        if ".candidate." in key:
            key = key.split(".candidate.", 1)[0]
            current = await one(
                conn,
                "SELECT * FROM memory_entries WHERE owner_id=%s AND memory_key=%s",
                (owner, key),
            )
            if current and current["updated_at"] > entry["created_at"]:
                raise HTTPException(
                    409, "Fakta aktif telah berubah. Koreksi fakta aktif yang terbaru."
                )
            await conn.execute(
                "UPDATE memory_entries SET status='corrected' WHERE id=%s", (entry_id,)
            )
        await conn.execute(
            "UPDATE memory_suppressions SET active=false WHERE owner_id=%s AND memory_key=%s",
            (owner, key),
        )
        candidate = Candidate(
            key=key,
            statement=body.statement.strip(),
            kind=body.kind,
            anchor=body.statement.strip(),
            confidence=1,
            change=body.change,
        )
        updated = await store.apply(
            conn,
            owner,
            candidate,
            {
                "source_kind": "editor",
                "source_id": body.request_key,
                "source_revision": "1",
                "source_hash": policy.digest(body.statement.strip()),
            },
            explicit=True,
        )
        from ngertiin.memory.invalidation import revoke_locked

        await revoke_locked(conn, owner)
        response = {
            "id": str(updated["id"]),
            "revision": updated["revision"],
            "status": updated["status"],
        }
        await store.receipt(conn, owner, body.request_key, payload, response)
    await kick_indexing()
    return response


async def forget(owner, entry_id, body):
    payload = {"action": "forget", "id": str(entry_id), **body.model_dump(mode="json")}
    async with transaction() as conn:
        await lock_account(conn, owner)
        previous = await store.command(conn, owner, body.request_key, payload)
        if previous:
            return previous
        await store.settings(conn, owner)
        entry = await store.owned(conn, owner, entry_id, lock=True)
        if entry["revision"] != body.expected_revision:
            raise HTTPException(
                409, ("Ingatan sudah berubah. Muat versi terbaru sebelum melupakan.")
            )
        key = entry["memory_key"].split(".candidate.", 1)[0]
        related = await (
            await conn.execute(
                (
                    "SELECT id FROM memory_entries WHERE owner_id=%s AND "
                    "(memory_key=%s OR memory_key LIKE %s)"
                ),
                (owner, key, key + ".candidate.%"),
            )
        ).fetchall()
        ids = [row["id"] for row in related]
        revisions = await (
            await conn.execute("SELECT id FROM memory_revisions WHERE entry_id=ANY(%s)", (ids,))
        ).fetchall()
        refs = await (
            await conn.execute(
                (
                    "SELECT ev.* FROM memory_evidence ev JOIN memory_revisions r ON "
                    "r.id=ev.revision_id WHERE r.entry_id=ANY(%s)"
                ),
                (ids,),
            )
        ).fetchall()
        await conn.execute(
            "INSERT INTO memory_suppressions(id,owner_id,entry_id,memory_key,"
            "fingerprint) VALUES (%s,%s,%s,%s,%s)",
            (uuid4(), owner, entry_id, key, policy.digest(entry["statement"] or "")),
        )
        for ref in refs:
            if ref["source_kind"] != "editor":
                await conn.execute(
                    "INSERT INTO memory_excluded_sources(owner_id,source_kind,"
                    "source_id,source_revision,reason) VALUES (%s,%s,%s,%s,"
                    "'forgotten') ON CONFLICT DO NOTHING",
                    (owner, ref["source_kind"], ref["source_id"], ref["source_revision"]),
                )
            if ref["capture_job_id"]:
                await conn.execute(
                    (
                        "UPDATE memory_capture_jobs SET candidates=NULL,"
                        "admitted=NULL,lease_token=NULL,lease_until=NULL,"
                        "status='skipped',error=NULL WHERE id=%s"
                    ),
                    (ref["capture_job_id"],),
                )
        await conn.execute(
            (
                "UPDATE memory_entries SET statement=NULL,status='forgotten',"
                "revision=revision+1,updated_at=now() WHERE id=ANY(%s)"
            ),
            (ids,),
        )
        await conn.execute(
            (
                "UPDATE memory_revisions SET statement=NULL,status='forgotten' WHERE "
                "entry_id=ANY(%s)"
            ),
            (ids,),
        )
        for related_entry in related:
            erased = await store.owned(conn, owner, related_entry["id"])
            await conn.execute(
                "INSERT INTO memory_revisions(id,entry_id,owner_id,revision,kind,"
                "statement,confidence,status) VALUES (%s,%s,%s,%s,%s,NULL,%s,"
                "'forgotten')",
                (
                    uuid5(erased["id"], f"revision:{erased['revision']}"),
                    erased["id"],
                    owner,
                    erased["revision"],
                    erased["kind"],
                    erased["confidence"],
                ),
            )
        await conn.execute(
            "UPDATE memory_evidence SET anchor=NULL WHERE revision_id=ANY(%s)",
            ([row["id"] for row in revisions],),
        )
        await conn.execute(
            (
                "UPDATE memory_settings SET generation=generation+1,"
                "revision=revision+1,updated_at=now() WHERE owner_id=%s"
            ),
            (owner,),
        )
        for revision in revisions:
            await store.outbox(conn, owner, revision["id"], "delete")
        from ngertiin.memory.invalidation import revoke_locked

        await revoke_locked(conn, owner)
        response = {
            "id": str(entry_id),
            "status": "forgotten",
            "revision": entry["revision"] + 1,
            "cleanup_pending": bool(revisions),
        }
        await store.receipt(conn, owner, body.request_key, payload, response)
    await kick_indexing()
    return response


async def configure(owner, body):
    payload = {"action": "configure", **body.model_dump(mode="json")}
    async with transaction() as conn:
        await lock_account(conn, owner)
        previous = await store.command(conn, owner, body.request_key, payload)
        if previous:
            return previous
        current = await store.settings(conn, owner)
        if current["revision"] != body.expected_revision:
            raise HTTPException(409, "Pengaturan sudah berubah. Muat ulang terlebih dahulu.")
        updated = await one(
            conn,
            (
                "UPDATE memory_settings SET capture_enabled=%s,"
                "generation=generation+1,revision=revision+1,updated_at=now() WHERE "
                "owner_id=%s RETURNING *"
            ),
            (body.capture_enabled, owner),
        )
        return await store.receipt(
            conn,
            owner,
            body.request_key,
            payload,
            {
                "capture_enabled": updated["capture_enabled"],
                "generation": updated["generation"],
                "revision": updated["revision"],
            },
        )


async def enqueue_source(owner, kind, source_id, revision="1", *, automatic=False):
    if not get_settings().memory_enabled:
        return {"status": "disabled"}
    source = await sources.read(owner, kind, source_id, revision)
    async with transaction() as conn:
        await lock_account(conn, owner)
        config = await store.settings(conn, owner)
        if not config["capture_enabled"] or not await sources.eligible(
            conn, owner, kind, source_id, revision, source
        ):
            return {"status": "skipped"}
        if automatic and kind != "message":
            return {"status": "skipped"}
        previous = await one(
            conn,
            "SELECT id,status FROM memory_capture_jobs WHERE owner_id=%s AND "
            "source_kind=%s AND source_id=%s AND source_revision=%s AND "
            "pipeline_version=%s",
            (owner, kind, source_id, revision, policy.VERSION),
        )
        if previous:
            return previous
        from ngertiin.memory.jobs import capture_job

        job_id = uuid4()
        await conn.execute(
            "INSERT INTO memory_capture_jobs(id,owner_id,source_kind,source_id,"
            "source_revision,source_hash,generation,pipeline_version) VALUES (%s,%s,"
            "%s,%s,%s,%s,%s,%s)",
            (
                job_id,
                owner,
                kind,
                source_id,
                revision,
                source["hash"],
                config["generation"],
                policy.VERSION,
            ),
        )
        queued = await capture_job.configure(
            connection=conn, lock=f"memory-capture:{job_id}"
        ).defer_async(capture_id=str(job_id))
        await conn.execute("UPDATE memory_capture_jobs SET job_id=%s WHERE id=%s", (queued, job_id))
        return {"id": job_id, "status": "queued"}


async def enqueue_run(conn, run):
    """Capture only after a successful turn, including its final persona decisions."""
    if not get_settings().memory_enabled:
        return
    from ngertiin.memory.jobs import discover_job

    await discover_job.configure(connection=conn, lock=f"memory-source:{run['id']}").defer_async(
        run_id=str(run["id"])
    )


async def kick_indexing():
    from ngertiin.memory.jobs import index_job

    with suppress(AlreadyEnqueued):
        async with transaction() as conn:
            await index_job.configure(
                connection=conn, lock="memory-index", queueing_lock="memory-index"
            ).defer_async()
