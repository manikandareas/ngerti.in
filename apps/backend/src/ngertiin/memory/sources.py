"""Exact first-party evidence; reference checks never trust a model-supplied owner."""

import asyncio
import hashlib
import json
from uuid import UUID

from fastapi import HTTPException

from ngertiin.async_db import transaction
from ngertiin.chat.store import one
from ngertiin.config import get_settings
from ngertiin.memory import policy


def message_text(parts):
    return "\n".join(part.get("text", "") for part in parts if part.get("type") == "text")


async def read(owner, kind: str, source_id: UUID, revision: str):
    async with transaction() as conn:
        if kind == "message":
            row = await one(
                conn,
                "SELECT m.*,t.owner_id,t.title FROM chat_messages m JOIN "
                "chat_threads t ON t.id=m.thread_id WHERE m.id=%s AND t.owner_id=%s "
                "AND m.role='user' AND m.status='complete'",
                (source_id, owner),
            )
            if not row or revision != "1":
                raise HTTPException(404, "Sumber pesan tidak ditemukan.")
            text = message_text(row["parts"])
            return {
                "text": text,
                "hash": policy.digest(text),
                "label": row["title"],
                "thread_id": row["thread_id"],
                "run_id": row["run_id"],
            }
        if kind == "file":
            row = await one(
                conn,
                "SELECT r.*,f.deleted_at FROM file_revisions r JOIN product_files f "
                "ON f.id=r.file_id WHERE r.id=%s AND r.owner_id=%s AND "
                "r.status='ready' AND f.deleted_at IS NULL AND r.revision::text=%s",
                (source_id, owner, revision),
            )
            if not row:
                raise HTTPException(404, "Revision file tidak ditemukan.")
            extraction = await one(
                conn,
                "SELECT object_key,usage FROM file_extractions WHERE revision_id=%s "
                "AND owner_id=%s AND status='ready' AND purged_at IS NULL ORDER BY "
                "created_at DESC LIMIT 1",
                (source_id, owner),
            )
        elif kind == "result":
            row = await one(
                conn,
                "SELECT rr.*,r.owner_id,t.draft FROM result_revisions rr JOIN "
                "product_results r ON r.id=rr.result_id JOIN task_revisions t ON "
                "t.task_id=rr.task_id AND t.revision=rr.task_revision WHERE "
                "rr.id=%s AND r.owner_id=%s AND r.deleted_at IS NULL AND "
                "rr.status='ready' AND rr.revision::text=%s",
                (source_id, owner, revision),
            )
            if not row:
                raise HTTPException(404, "Revision hasil tidak ditemukan.")
            text = json.dumps(
                {"manifest": row["manifest"], "draft": row["draft"]},
                ensure_ascii=False,
                default=str,
            )
            return {
                "text": text,
                "hash": policy.fingerprint([row["manifest"], row["draft_hash"]]),
                "label": "Hasil tersimpan",
            }
        else:
            raise HTTPException(422, "Jenis sumber memory tidak didukung.")
    from ngertiin.storage import get_object

    if extraction:
        body = await asyncio.to_thread(get_object, extraction["object_key"])
        if hashlib.sha256(body).hexdigest() != extraction["usage"].get("sha256"):
            raise HTTPException(409, "Integritas ekstraksi file tidak sesuai.")
        text = "\n".join(page["text"] for page in json.loads(body)["pages"])
    elif row["content_type"] in ("text/plain", "text/markdown", "text/csv", "application/json"):
        body = await asyncio.to_thread(get_object, row["object_key"])
        if hashlib.sha256(body).hexdigest() != row["sha256"]:
            raise HTTPException(409, "Integritas file tidak sesuai.")
        text = body.decode("utf-8")
    else:
        raise HTTPException(409, ("Buka file melalui Task terlebih dahulu agar teksnya tersedia."))
    return {
        "text": policy.bounded(text, get_settings().memory_input_bytes),
        "hash": row["sha256"],
        "label": row["filename"],
    }


async def alive(conn, owner, evidence):
    kind, source_id = evidence["source_kind"], evidence["source_id"]
    if kind == "editor":
        return True
    if kind == "message":
        row = await one(
            conn,
            "SELECT m.parts FROM chat_messages m JOIN chat_threads t ON "
            "t.id=m.thread_id WHERE m.id=%s AND t.owner_id=%s AND m.role='user' AND "
            "m.status='complete'",
            (source_id, owner),
        )
        return bool(row and policy.digest(message_text(row["parts"])) == evidence["source_hash"])
    if kind == "file":
        row = await one(
            conn,
            "SELECT r.sha256 FROM file_revisions r JOIN product_files f ON "
            "f.id=r.file_id WHERE r.id=%s AND r.owner_id=%s AND r.revision::text=%s "
            "AND r.status='ready' AND f.deleted_at IS NULL",
            (source_id, owner, evidence["source_revision"]),
        )
        return bool(row and row["sha256"] == evidence["source_hash"])
    row = await one(
        conn,
        "SELECT rr.manifest,rr.draft_hash FROM result_revisions rr JOIN "
        "product_results r ON r.id=rr.result_id WHERE rr.id=%s AND r.owner_id=%s "
        "AND rr.revision::text=%s AND rr.status='ready' AND r.deleted_at IS NULL",
        (source_id, owner, evidence["source_revision"]),
    )
    return bool(
        row
        and policy.fingerprint([row["manifest"], row["draft_hash"]]) == evidence[("source_hash")]
    )


async def label(conn, owner, evidence):
    kind, sid = evidence["source_kind"], evidence["source_id"]
    if kind == "message":
        row = await one(
            conn,
            "SELECT t.title FROM chat_messages m JOIN chat_threads t ON "
            "t.id=m.thread_id WHERE m.id=%s AND t.owner_id=%s",
            (sid, owner),
        )
        return "Percakapan · " + row["title"] if row else "Pesan percakapan"
    if kind == "file":
        row = await one(
            conn, "SELECT filename FROM file_revisions WHERE id=%s AND owner_id=%s", (sid, owner)
        )
        return f"{row['filename']} · versi {evidence['source_revision']}" if row else "File"
    return "Hasil tersimpan" if kind == "result" else "Koreksi langsung olehmu"


async def eligible(conn, owner, kind, source_id, revision, source):
    excluded = await one(
        conn,
        "SELECT 1 FROM memory_excluded_sources WHERE owner_id=%s AND source_kind=%s "
        "AND source_id=%s AND source_revision=%s",
        (owner, kind, source_id, revision),
    )
    if excluded:
        return False
    if not policy.safe_text(source["text"]) or policy.CONTROL.search(source["text"]):
        return False
    evidence = {
        "source_kind": kind,
        "source_id": source_id,
        "source_revision": revision,
        "source_hash": source["hash"],
    }
    if not await alive(conn, owner, evidence):
        return False
    if kind == "message" and source.get("run_id"):
        from ngertiin.persona.store import memory_exclusions

        completed = await one(
            conn,
            "SELECT id FROM chat_runs WHERE id=%s AND owner_id=%s AND status='complete'",
            (source["run_id"], owner),
        )
        if not completed:
            return False
        if await memory_exclusions(conn, owner, [source["run_id"]]):
            return False
    return True
