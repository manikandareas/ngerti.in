"""Immutable candidate bytes survive cleanup/review without passing through model JSON."""

import asyncio
import hashlib
import json
from uuid import UUID, uuid5

from ngertiin.files.contracts import OUTPUT_TYPES, policy
from ngertiin.files.inputs import validate_live
from ngertiin.files.store import capacity
from ngertiin.files.validation import validate_text
from ngertiin.sandbox import store as resources
from ngertiin.storage import get_object, put_object
from ngertiin.tasks import store


async def persist(execution, session, files, summary):
    specs, rules, candidates, total = execution["output_spec"], policy(), [], 0
    if [f.filename for f in files] != [s["filename"] for s in specs]:
        raise ValueError("Nama/urutan hasil komputasi tidak sesuai permintaan.")
    for file, spec in zip(files, specs, strict=True):
        total += len(file.data)
        if not 0 < len(file.data) <= rules["max_file_bytes"] or total > rules["max_output_bytes"]:
            raise ValueError("Berkas komputasi melebihi batas ukuran.")
        validate_text(file.data, "." + spec["format"])
        checksum = hashlib.sha256(file.data).hexdigest()
        ident = uuid5(session["id"], file.filename + ":" + checksum)
        key = f"accounts/{execution['owner_id']}/sandbox/{session['id']}/{ident}"
        async with store.locked(execution["owner_id"], execution["id"]) as (conn, task):
            store.fence(task, execution)
            await validate_live(conn, task)
        await asyncio.to_thread(put_object, key, file.data, OUTPUT_TYPES["." + spec["format"]])
        saved = await asyncio.to_thread(get_object, key)
        if hashlib.sha256(saved).hexdigest() != checksum:
            raise ValueError("Berkas komputasi gagal diverifikasi sebelum review.")
        candidates.append(
            {
                "id": ident,
                "filename": file.filename,
                "size": len(file.data),
                "sha256": checksum,
                "object_key": key,
                "content_type": OUTPUT_TYPES["." + spec["format"]],
                "preview": "".join(
                    c if c >= " " or c in "\n\t" else " "
                    for c in file.data[:500].decode("utf-8", errors="replace")
                ),
            }
        )
    draft = json.dumps(
        {
            "summary": "".join(c if c >= " " or c in "\n\t" else " " for c in summary[:2000]),
            "files": [
                {
                    "filename": f["filename"],
                    "staged_output_id": str(f["id"]),
                    "preview": f["preview"],
                    "size": f["size"],
                }
                for f in candidates
            ],
        },
        ensure_ascii=False,
    )
    async with store.locked(execution["owner_id"], execution["id"]) as (conn, task):
        store.fence(task, execution)
        await validate_live(conn, task)
        for file in candidates:
            await capacity(conn, task["owner_id"], file["size"])
            await conn.execute(
                "INSERT INTO sandbox_outputs(id,session_id,task_id,owner_id,filename,content_type,"
                "size,sha256,object_key,preview) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                (
                    file["id"],
                    session["id"],
                    task["id"],
                    task["owner_id"],
                    file["filename"],
                    file["content_type"],
                    file["size"],
                    file["sha256"],
                    file["object_key"],
                    file["preview"],
                ),
            )
        await store.change(conn, task, stage="draft_ready", draft=draft)
        await store.persist_revision(conn, task, uuid5(task["id"], f"draft:{task['revision']}"))
        await store.emit(conn, task)


async def resolve(conn, task, value):
    total = 0
    for file in value["files"]:
        if "staged_output_id" not in file:
            total += file["size"]
            continue
        row = await resources.owned_output(
            conn, task["owner_id"], task["id"], UUID(file["staged_output_id"])
        )
        if row["filename"] != file["filename"]:
            raise ValueError("Referensi hasil tidak sesuai berkas yang ditinjau.")
        file.update({k: row[k] for k in ("sha256", "size", "content_type")})
        file["staged_key"] = row["object_key"]
        total += row["size"]
    if total > policy()["max_output_bytes"]:
        raise ValueError("Total hasil komputasi melebihi batas.")
    return value


async def content(owner, task_id, output_id):
    async with store.transaction() as conn:
        row = await resources.owned_output(conn, owner, task_id, output_id)
    data = await asyncio.to_thread(get_object, row["object_key"])
    if hashlib.sha256(data).hexdigest() != row["sha256"]:
        raise ValueError("Integritas hasil komputasi tidak sesuai.")
    async with store.transaction() as conn:
        await resources.owned_output(conn, owner, task_id, output_id)
    return row, data
