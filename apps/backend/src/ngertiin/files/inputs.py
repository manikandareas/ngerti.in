"""Exact file input capture, extraction dependencies and bounded model context."""

import asyncio
import hashlib
import json
from uuid import UUID, uuid4

from fastapi import HTTPException

from ngertiin.chat.store import json_value, one
from ngertiin.files import store as files
from ngertiin.files.contracts import FileInput, policy
from ngertiin.quotas.policy import fingerprint
from ngertiin.storage import get_object
from ngertiin.tasks import store as tasks


async def capture(conn, owner, task_id, values: list[dict]) -> list[dict]:
    rules, captured, total, pages = policy(), [], 0, 0
    if len(values) > rules["max_attachments"]:
        raise HTTPException(422, "Maksimal lima lampiran per permintaan.")
    seen = set()
    for index, value in enumerate(values):
        ref = FileInput.model_validate(value)
        if ref.revision_id in seen or (ref.end is not None and ref.end < ref.start):
            raise HTTPException(422, "Lampiran duplikat atau rentang halaman/baris tidak valid.")
        seen.add(ref.revision_id)
        row = await files.revision(conn, owner, ref.revision_id)
        total += row["size"]
        ocr = row["content_type"] == "application/pdf" or row["content_type"].startswith("image/")
        pages += row["page_count"] if ocr else 0
        if ocr and (ref.start > row["page_count"] or (ref.end or 1) > row["page_count"]):
            raise HTTPException(422, "Rentang halaman melebihi isi dokumen.")
        config = {"version": rules["version"], "model": rules["model"] if ocr else "utf8-v1"}
        config_hash = fingerprint(config)
        extraction = await one(
            conn,
            "SELECT * FROM file_extractions WHERE revision_id=%s AND policy->>'model'=%s "
            "AND policy->>'version'=%s ORDER BY (status='ready') DESC,created_at DESC LIMIT 1",
            (row["id"], config["model"], config["version"]),
        )
        if not extraction:
            eid = uuid4()
            extraction = await one(
                conn,
                "INSERT INTO file_extractions(id,revision_id,owner_id,config_hash,policy) "
                "VALUES (%s,%s,%s,%s,%s) RETURNING *",
                (
                    eid,
                    row["id"],
                    owner,
                    config_hash,
                    json_value({**rules, "provider": "mistral" if ocr else "local", **config}),
                ),
            )
            from ngertiin.files.jobs import extract_job

            job = await extract_job.configure(connection=conn, lock=f"file:{eid}").defer_async(
                extraction_id=str(eid)
            )
            await conn.execute("UPDATE file_extractions SET job_id=%s WHERE id=%s", (job, eid))
        selection = {"start": ref.start, "end": ref.end, "unit": "page" if ocr else "line"}
        await conn.execute(
            "INSERT INTO task_file_inputs(task_id,position,owner_id,revision_id,extraction_id,"
            "selection) VALUES (%s,%s,%s,%s,%s,%s)",
            (task_id, index, owner, row["id"], extraction["id"], json_value(selection)),
        )
        captured.append(
            {
                "revision_id": str(row["id"]),
                "file_id": str(row["file_id"]),
                "revision": row["revision"],
                "filename": row["filename"],
                "sha256": row["sha256"],
                "extraction_id": str(extraction["id"]),
                "selection": selection,
            }
        )
    if total > rules["max_attachment_bytes"] or pages > rules["max_task_pages"]:
        raise HTTPException(422, "Total lampiran maksimal 25 MiB dan 40 halaman OCR per task.")
    return captured


async def rows(conn, task):
    return await (
        await conn.execute(
            "SELECT i.*,r.filename,r.sha256,r.file_id,r.revision,r.status AS file_status,"
            "r.object_key AS input_object_key,"
            "f.deleted_at,e.status AS extraction_status,e.object_key,e.usage,e.error,"
            "e.reserved_pages,e.charged_pages,e.policy->>'model' AS extraction_model "
            "FROM task_file_inputs i JOIN file_revisions r ON r.id=i.revision_id "
            "JOIN product_files f ON f.id=r.file_id "
            "JOIN file_extractions e ON e.id=i.extraction_id "
            "WHERE i.task_id=%s AND i.owner_id=%s ORDER BY i.position",
            (task["id"], task["owner_id"]),
        )
    ).fetchall()


async def validate_live(conn, task):
    values = await rows(conn, task)
    for row in values:
        if row["deleted_at"] or row["file_status"] != "ready":
            raise ValueError("Input task telah dihapus atau tidak lagi tersedia.")
    return values


async def prepare(execution) -> bool:
    async with tasks.locked(execution["owner_id"], execution["id"]) as (conn, task):
        tasks.fence(task, execution)
        values = await validate_live(conn, task)
        for row in values:
            if row["extraction_status"] in ("failed", "unknown"):
                raise ValueError(row["error"] or "Ekstraksi belum siap. Periksa lampiran task.")
        if any(row["extraction_status"] != "ready" for row in values):
            await tasks.finish_execution(conn, task, "interrupted")
            await tasks.change(
                conn, task, status="queued", stage="preparing_inputs", lease_token=None
            )
            await tasks.emit(conn, task)
            return False
    return True


async def context(execution):
    async with tasks.locked(execution["owner_id"], execution["id"]) as (conn, task):
        tasks.fence(task, execution)
        values = await validate_live(conn, task)
    content = []
    for row in values:
        if row["extraction_status"] != "ready":
            raise ValueError("Ekstraksi input belum selesai.")
        original = await asyncio.to_thread(get_object, row["input_object_key"])
        if hashlib.sha256(original).hexdigest() != row["sha256"]:
            raise ValueError("Integritas revision input tidak sesuai.")
        body = await asyncio.to_thread(get_object, row["object_key"])
        if hashlib.sha256(body).hexdigest() != row["usage"].get("sha256"):
            raise ValueError("Integritas hasil ekstraksi tidak sesuai.")
        parsed, selection = json.loads(body), row["selection"]
        start, end = selection["start"], selection["end"]
        if selection["unit"] == "page":
            pages = [p for p in parsed["pages"] if start <= p["number"] <= (end or 20)]
            if not pages:
                raise ValueError("Halaman yang diminta tidak memiliki hasil ekstraksi.")
            selected = pages
        else:
            lines = parsed["pages"][0]["text"].splitlines()
            if start > len(lines) or (end is not None and end > len(lines)):
                raise ValueError("Rentang baris melebihi isi file.")
            selected = [
                {
                    "start_line": start,
                    "end_line": end or len(lines),
                    "text": "\n".join(lines[start - 1 : end]),
                }
            ]
        content.append(
            {
                "filename": row["filename"],
                "revision_id": str(row["revision_id"]),
                "sha256": row["sha256"],
                "selection": selection,
                "content": selected,
            }
        )
    source = {**execution["input_snapshot"], "files": content}
    previous = source.get("previous_result")
    if previous:
        prior_files = []
        for ref in previous["manifest"]["files"]:
            _, body = await files.content(execution["owner_id"], UUID(ref["revision_id"]))
            if hashlib.sha256(body).hexdigest() != ref["sha256"]:
                raise ValueError("Integritas revision hasil sebelumnya tidak sesuai.")
            prior_files.append({**ref, "content": body.decode("utf-8")})
        source["previous_result"] = {
            **previous,
            "manifest": {**previous["manifest"], "files": prior_files},
        }
    return source


async def wake(owner: UUID):
    async with tasks.transaction() as conn:
        candidates = await (
            await conn.execute(
                "SELECT id FROM background_tasks WHERE owner_id=%s AND status='queued' "
                "AND stage='preparing_inputs'",
                (owner,),
            )
        ).fetchall()
    for item in candidates:
        async with tasks.locked(owner, item["id"]) as (conn, task):
            if task["status"] != "queued" or task["stage"] != "preparing_inputs":
                continue
            values = await rows(conn, task)
            if any(row["extraction_status"] in ("queued", "running") for row in values):
                continue
            await tasks.change(conn, task, stage="inputs_ready")
            await tasks.enqueue(conn, task)
            await tasks.emit(conn, task)
