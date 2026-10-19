"""Durable capture phases and canonical-to-Mem0 index operations."""

import asyncio
from contextlib import suppress
from uuid import UUID, uuid4

import structlog
from procrastinate import RetryStrategy
from procrastinate.exceptions import AlreadyEnqueued
from psycopg import sql

from ngertiin.async_db import transaction
from ngertiin.chat.store import json_value, lock_account, one
from ngertiin.config import get_settings
from ngertiin.memory import policy, sources, store
from ngertiin.memory.contracts import Admission
from ngertiin.memory.engine import Engine
from ngertiin.worker.queue import queue_app

logger = structlog.get_logger()


class StaleCapture(Exception):
    pass


async def capture_fence(conn, job):
    row = await one(
        conn,
        "SELECT j.id FROM memory_capture_jobs j JOIN memory_settings s ON "
        "s.owner_id=j.owner_id WHERE j.id=%s AND j.lease_token=%s AND "
        "j.lease_until>now() AND s.capture_enabled AND s.generation=j.generation "
        "AND j.status IN ('extracting','admitting')",
        (job["id"], job["lease_token"]),
    )
    if not row:
        raise StaleCapture()


@queue_app.task(
    name="memory.discover", queue="default", retry=RetryStrategy(max_attempts=3, wait=10)
)
async def discover_job(run_id: str):
    from ngertiin.memory.service import enqueue_source

    async with transaction() as conn:
        row = await one(
            conn,
            "SELECT r.owner_id,m.id,m.parts FROM chat_runs r JOIN chat_messages m "
            "ON m.run_id=r.id WHERE r.id=%s AND r.status='complete' AND "
            "m.role='user'",
            (UUID(run_id),),
        )
    if not row:
        return
    import re

    text = sources.message_text(row["parts"])
    # Ordinary questions do not need background personal-fact inference.
    explicit = bool(re.search(r"(?i)\b(ingat|remember)\b", text))
    if not explicit and (
        "?" in text
        or not re.search(
            "(?i)\\b(saya|aku|namaku|rumahku|pekerjaanku|keluargaku|temanku|my|i am|i'm|"
            "i live|i prefer|i like|remember|ingat)\\b",
            text,
        )
    ):
        return
    await enqueue_source(row["owner_id"], "message", row["id"], automatic=True)


def extract(job, text):
    with Engine(
        job["owner_id"], job["generation"], "capture", job["id"], job["lease_token"]
    ) as engine:
        return engine.extract(text)


def admit(job, text, candidates, existing):
    with Engine(
        job["owner_id"], job["generation"], "admission", job["id"], job["lease_token"]
    ) as engine:
        return engine.admit(text, candidates, existing).model_dump(mode="json")


def cleanup(job, generation):
    with Engine(job["owner_id"], generation, "cleanup", job["id"]) as engine:
        engine.cleanup_candidates()


async def process_capture(capture_id: UUID):
    async with transaction() as conn:
        row = await one(conn, "SELECT * FROM memory_capture_jobs WHERE id=%s", (capture_id,))
        if not row:
            return
        await lock_account(conn, row["owner_id"])
        row = await one(
            conn,
            (
                "SELECT *,lease_until>now() AS leased FROM memory_capture_jobs WHERE "
                "id=%s FOR UPDATE"
            ),
            (capture_id,),
        )
        if row["status"] in ("complete", "skipped") or row["leased"] or row["attempts"] >= 3:
            return
        config = await store.settings(conn, row["owner_id"])
        if not config["capture_enabled"] or config["generation"] != row["generation"]:
            await conn.execute(
                "UPDATE memory_capture_jobs SET status='skipped',candidates=NULL,"
                "admitted=NULL WHERE id=%s",
                (capture_id,),
            )
            return
        job = await one(
            conn,
            "UPDATE memory_capture_jobs SET lease_token=%s,"
            "lease_until=now()+interval '3 minutes',attempts=attempts+1,status=%s,"
            "updated_at=now() WHERE id=%s RETURNING *",
            (uuid4(), "admitting" if row["candidates"] is not None else "extracting", capture_id),
        )
    try:
        source = await sources.read(
            job["owner_id"], job["source_kind"], job["source_id"], job["source_revision"]
        )
        async with transaction() as conn:
            await capture_fence(conn, job)
            if source["hash"] != job["source_hash"] or not await sources.eligible(
                conn,
                job["owner_id"],
                job["source_kind"],
                job["source_id"],
                job["source_revision"],
                source,
            ):
                raise StaleCapture()
        text = policy.bounded(source["text"], get_settings().memory_input_bytes)
        if job["candidates"] is None:
            candidates = await asyncio.to_thread(extract, job, text)
            async with transaction() as conn:
                await capture_fence(conn, job)
                await conn.execute(
                    "UPDATE memory_capture_jobs SET candidates=%s,"
                    "status='admitting',updated_at=now() WHERE id=%s",
                    (json_value(candidates), capture_id),
                )
            job["candidates"] = candidates
        if job["admitted"] is None:
            async with transaction() as conn:
                existing = await (
                    await conn.execute(
                        "SELECT memory_key AS key,statement,status FROM "
                        "memory_entries WHERE owner_id=%s ORDER BY updated_at DESC "
                        "LIMIT 30",
                        (job["owner_id"],),
                    )
                ).fetchall()
            values = (
                await asyncio.to_thread(admit, job, text, job["candidates"], existing)
                if job["candidates"]
                else {"memories": []}
            )
            async with transaction() as conn:
                await capture_fence(conn, job)
                await conn.execute(
                    "UPDATE memory_capture_jobs SET admitted=%s,updated_at=now() WHERE id=%s",
                    (json_value(values), capture_id),
                )
            job["admitted"] = values
        admitted = Admission.model_validate(job["admitted"])
        async with transaction() as conn:
            await lock_account(conn, job["owner_id"])
            await capture_fence(conn, job)
            if not await sources.eligible(
                conn,
                job["owner_id"],
                job["source_kind"],
                job["source_id"],
                job["source_revision"],
                source,
            ):
                raise StaleCapture()
            for candidate in admitted.memories:
                if (
                    candidate.anchor not in text
                    or not policy.safe_text(candidate.statement)
                    or policy.CONTROL.search(candidate.statement)
                ):
                    continue
                if (
                    job["source_kind"] == "message"
                    and policy.REMEMBER_AGAIN.search(text)
                    and candidate.confidence >= 0.85
                ):
                    await conn.execute(
                        "UPDATE memory_suppressions SET active=false WHERE owner_id=%s "
                        "AND memory_key=%s",
                        (job["owner_id"], candidate.key),
                    )
                await store.apply(
                    conn,
                    job["owner_id"],
                    candidate,
                    {
                        "source_kind": job["source_kind"],
                        "source_id": job["source_id"],
                        "source_revision": job["source_revision"],
                        "source_hash": job["source_hash"],
                        "capture_job_id": job["id"],
                    },
                )
            from ngertiin.memory.invalidation import revoke_locked

            await revoke_locked(conn, job["owner_id"])
            await conn.execute(
                "UPDATE memory_capture_jobs SET status='complete',candidates=NULL,"
                "admitted=NULL,lease_token=NULL,lease_until=NULL,error=NULL,"
                "updated_at=now() WHERE id=%s",
                (capture_id,),
            )
        from ngertiin.memory.service import kick_indexing

        await kick_indexing()
    except StaleCapture:
        async with transaction() as conn:
            await conn.execute(
                "UPDATE memory_capture_jobs SET status='skipped',candidates=NULL,"
                "admitted=NULL,lease_token=NULL,lease_until=NULL,updated_at=now() "
                "WHERE id=%s AND lease_token=%s",
                (capture_id, job["lease_token"]),
            )
    except Exception as error:
        logger.warning(
            "memory.capture_failed", capture_id=str(capture_id), error_type=type(error).__name__
        )
        async with transaction() as conn:
            await conn.execute(
                "UPDATE memory_capture_jobs SET status='failed',lease_token=NULL,"
                "lease_until=NULL,error=%s,updated_at=now() WHERE id=%s AND "
                "lease_token=%s",
                (
                    "Capture belum selesai; sistem akan mencoba kembali dalam batas biaya.",
                    capture_id,
                    job["lease_token"],
                ),
            )
        raise
    finally:
        async with transaction() as conn:
            config = await store.settings(conn, job["owner_id"])
        with suppress(Exception):
            await asyncio.to_thread(cleanup, job, config["generation"])


@queue_app.task(
    name="memory.capture", queue="default", retry=RetryStrategy(max_attempts=3, wait=10)
)
async def capture_job(capture_id: str):
    async with asyncio.timeout(150):
        await process_capture(UUID(capture_id))


def project(operation, generation, revision, delete):
    with Engine(operation["owner_id"], generation, "index", operation["id"]) as engine:
        if delete:
            engine.purge(revision["id"])
        else:
            engine.project(revision)


@queue_app.task(name="memory.index", queue="default", retry=RetryStrategy(max_attempts=3, wait=10))
async def index_job():
    for _ in range(20):
        async with transaction() as conn:
            operation = await one(
                conn,
                "SELECT * FROM memory_index_operations WHERE status IN ('queued',"
                "'failed','running') AND (lease_until IS NULL OR lease_until<now()) "
                "AND attempts<5 ORDER BY (operation='delete') DESC,created_at FOR "
                "UPDATE SKIP LOCKED LIMIT 1",
            )
            if not operation:
                return
            operation = await one(
                conn,
                "UPDATE memory_index_operations SET status='running',lease_token=%s,"
                "lease_until=now()+interval '90 seconds',attempts=attempts+1,"
                "updated_at=now() WHERE id=%s RETURNING *",
                (uuid4(), operation["id"]),
            )
            revision = await one(
                conn, "SELECT * FROM memory_revisions WHERE id=%s", (operation["revision_id"],)
            )
            config = await store.settings(conn, operation["owner_id"])
            delete = operation["operation"] == "delete" or not await store.usable(
                conn, operation["owner_id"], revision
            )
        try:
            await asyncio.to_thread(project, operation, config["generation"], revision, delete)
            async with transaction() as conn:
                fresh = await one(
                    conn, "SELECT * FROM memory_revisions WHERE id=%s", (revision["id"],)
                )
                stale = not delete and not await store.usable(conn, operation["owner_id"], fresh)
                if stale:
                    await store.outbox(conn, operation["owner_id"], revision["id"], "delete")
                await conn.execute(
                    "UPDATE memory_index_operations SET status='complete',"
                    "lease_token=NULL,lease_until=NULL,error=NULL,updated_at=now() "
                    "WHERE id=%s AND lease_token=%s",
                    (operation["id"], operation["lease_token"]),
                )
        except Exception as error:
            logger.warning(
                "memory.index_failed",
                operation_id=str(operation["id"]),
                error_type=type(error).__name__,
            )
            async with transaction() as conn:
                await conn.execute(
                    "UPDATE memory_index_operations SET status='failed',"
                    "lease_token=NULL,lease_until=now()+interval '1 minute',"
                    "error='Indeks memory menunggu pemulihan.',updated_at=now() "
                    "WHERE id=%s AND lease_token=%s",
                    (operation["id"], operation["lease_token"]),
                )


async def recover():
    async with transaction() as conn:
        jobs = await (
            await conn.execute(
                "SELECT id FROM memory_capture_jobs WHERE status IN ('queued',"
                "'failed','extracting','admitting') AND (lease_until IS NULL OR "
                "lease_until<now()) AND attempts<3 ORDER BY created_at LIMIT 10"
            )
        ).fetchall()
        for job in jobs:
            with suppress(AlreadyEnqueued):
                async with conn.transaction():
                    await capture_job.configure(
                        connection=conn,
                        lock=f"memory-capture:{job['id']}",
                        queueing_lock=f"memory-recover:{job['id']}",
                    ).defer_async(capture_id=str(job["id"]))
        with suppress(AlreadyEnqueued):
            async with conn.transaction():
                await index_job.configure(
                    connection=conn, lock="memory-index", queueing_lock="memory-index"
                ).defer_async()
        await conn.execute(
            "UPDATE memory_cost_events SET state='unknown',settled_at=now() WHERE "
            "state='reserved' AND created_at<now()-interval '3 minutes'"
        )
        candidates = []
        exists = await one(
            conn, "SELECT to_regclass(%s) AS relation", (policy.CANDIDATE_COLLECTION,)
        )
        if exists["relation"]:
            candidates = await (
                await conn.execute(
                    sql.SQL(
                        "SELECT DISTINCT j.id,j.owner_id,s.generation FROM {} c "
                        "JOIN memory_capture_jobs j ON "
                        "c.payload->>'capture_job_id'=j.id::text JOIN "
                        "memory_settings s ON s.owner_id=j.owner_id WHERE "
                        "j.updated_at<now()-interval '3 minutes' AND (j.status IN "
                        "('complete','skipped','failed') OR j.lease_until<now()) "
                        "LIMIT 10"
                    ).format(sql.Identifier(policy.CANDIDATE_COLLECTION))
                )
            ).fetchall()
    for job in candidates:
        with suppress(Exception):
            await asyncio.to_thread(cleanup, job, job["generation"])
