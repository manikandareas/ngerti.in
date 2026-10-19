"""Reserve manifests, publish immutable bytes, then commit visibility with task delivery."""

import asyncio
import hashlib
from uuid import UUID, uuid5

from fastapi import HTTPException

from ngertiin.chat.store import json_value, one
from ngertiin.files import inputs
from ngertiin.files import store as files
from ngertiin.files.validation import outputs
from ngertiin.quotas.policy import fingerprint
from ngertiin.storage import get_object, put_object
from ngertiin.tasks import store as tasks


async def bind(conn, task, target=None, expected_revision=None):
    if target:
        root = await one(
            conn,
            "SELECT * FROM product_results WHERE id=%s AND owner_id=%s "
            "AND thread_id=%s AND deleted_at IS NULL FOR UPDATE",
            (target, task["owner_id"], task["thread_id"]),
        )
        if not root:
            raise HTTPException(404, "Hasil tidak ditemukan pada percakapan ini.")
        if root["status"] in ("constructing", "updating"):
            raise HTTPException(409, "Hasil ini masih sedang dikerjakan.")
        if expected_revision != root["current_revision"]:
            raise HTTPException(409, "Revision hasil berubah. Muat ulang sebelum memperbarui.")
        await conn.execute(
            "UPDATE product_results SET active_task_id=%s,status='updating',updated_at=now() "
            "WHERE id=%s",
            (task["id"], target),
        )
        return target
    rid = uuid5(task["id"], "result")
    await conn.execute(
        "INSERT INTO product_results(id,owner_id,thread_id,active_task_id) VALUES (%s,%s,%s,%s)",
        (rid, task["owner_id"], task["thread_id"], task["id"]),
    )
    return rid


async def sync_status(conn, task):
    if not task.get("result_id"):
        return
    status = {"failed": "failed", "cancelled": "interrupted"}.get(task["status"])
    if status:
        await conn.execute(
            "UPDATE product_results SET status=%s,updated_at=now() "
            "WHERE id=%s AND active_task_id=%s AND deleted_at IS NULL",
            (status, task["result_id"], task["id"]),
        )
        await conn.execute(
            "UPDATE result_revisions SET status=%s WHERE task_id=%s AND status='constructing'",
            ("failed" if status == "failed" else "interrupted", task["id"]),
        )
    elif task["status"] in ("queued", "running", "waiting_user"):
        await conn.execute(
            "UPDATE product_results SET status=CASE WHEN current_revision IS NULL "
            "THEN 'constructing' ELSE 'updating' END,updated_at=now() "
            "WHERE id=%s AND active_task_id=%s AND deleted_at IS NULL",
            (task["result_id"], task["id"]),
        )


async def reserve(conn, task):
    value = outputs(
        task["draft"],
        task["output_spec"],
        allow_staged=task.get("runtime_kind") in ("code", "browser"),
    )
    if task.get("runtime_kind") in ("code", "browser"):
        from ngertiin.sandbox.outputs import resolve

        value = await resolve(conn, task, value)
    root = await one(
        conn,
        "SELECT * FROM product_results WHERE id=%s AND owner_id=%s "
        "AND deleted_at IS NULL FOR UPDATE",
        (task["result_id"], task["owner_id"]),
    )
    if not root or root["active_task_id"] != task["id"]:
        raise ValueError("Hasil telah dihapus atau sedang diperbarui oleh task lain.")
    existing = await one(
        conn,
        "SELECT * FROM result_revisions WHERE task_id=%s AND task_revision=%s",
        (task["id"], task["revision"]),
    )
    if existing:
        if existing["draft_hash"] != fingerprint(task["draft"]):
            raise ValueError("Manifest tidak sesuai revision draft.")
        return existing, value
    manifest = {
        "version": 1,
        "summary": value["summary"],
        "task_id": str(task["id"]),
        "task_revision": task["revision"],
        "inputs": task["input_snapshot"].get("files", []),
        "files": [],
    }
    if previous := task["input_snapshot"].get("previous_result"):
        manifest["previous_result"] = {
            "result_id": previous["result_id"],
            "revision": previous["revision"],
        }
    for index, file in enumerate(value["files"]):
        rid = uuid5(task["id"], f"output:{task['revision']}:{index}:{file['sha256']}")
        await files.capacity(conn, task["owner_id"], file["size"])
        await conn.execute(
            "INSERT INTO product_files(id,owner_id) VALUES (%s,%s)", (rid, task["owner_id"])
        )
        key = f"accounts/{task['owner_id']}/results/{rid}/{file['sha256']}"
        await conn.execute(
            "INSERT INTO file_revisions(id,file_id,owner_id,revision,request_key,fingerprint,"
            "filename,content_type,size,sha256,object_key,page_count,source,status) "
            "VALUES (%s,%s,%s,1,%s,%s,%s,%s,%s,%s,%s,1,'result','uploading')",
            (
                rid,
                rid,
                task["owner_id"],
                rid,
                file["sha256"],
                file["filename"],
                file["content_type"],
                file["size"],
                file["sha256"],
                key,
            ),
        )
        manifest["files"].append(
            {
                "revision_id": str(rid),
                "file_id": str(rid),
                **{k: file[k] for k in ("filename", "content_type", "size", "sha256")},
            }
        )
    version_id = uuid5(task["id"], f"manifest:{task['revision']}")
    version = await one(
        conn,
        "INSERT INTO "
        "result_revisions(id,result_id,revision,task_id,task_revision,draft_hash,manifest) "
        "VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING *",
        (
            version_id,
            root["id"],
            root["next_revision"],
            task["id"],
            task["revision"],
            fingerprint(task["draft"]),
            json_value(manifest),
        ),
    )
    await conn.execute(
        "UPDATE product_results SET next_revision=next_revision+1 WHERE id=%s", (root["id"],)
    )
    return version, value


async def prepare(execution):
    async with tasks.locked(execution["owner_id"], execution["id"]) as (conn, task):
        tasks.fence(task, execution)
        await inputs.validate_live(conn, task)
        version, value = await reserve(conn, task)
        objects = []
        for file in version["manifest"]["files"]:
            row = await one(
                conn, "SELECT * FROM file_revisions WHERE id=%s", (UUID(file["revision_id"]),)
            )
            objects.append(row)
    for row, file in zip(objects, value["files"], strict=True):
        # A revoked worker can at most leave identical, unreferenced bytes.
        async with tasks.locked(execution["owner_id"], execution["id"]) as (conn, task):
            tasks.fence(task, execution)
            await inputs.validate_live(conn, task)
        data = (
            (await asyncio.to_thread(get_object, file["staged_key"]))
            if "staged_key" in file
            else file["content"].encode()
        )
        if hashlib.sha256(data).hexdigest() != row["sha256"]:
            raise ValueError("Integritas candidate hasil berubah sebelum publikasi.")
        await asyncio.to_thread(put_object, row["object_key"], data, row["content_type"])
        async with tasks.transaction() as conn:
            await files.written(conn, row["id"])
        saved = await asyncio.to_thread(get_object, row["object_key"])
        if hashlib.sha256(saved).hexdigest() != row["sha256"]:
            raise ValueError("Berkas hasil gagal diverifikasi. Task belum selesai.")
    return version["id"]


async def commit(conn, task, version_id):
    await inputs.validate_live(conn, task)
    root = await one(
        conn,
        "SELECT * FROM product_results WHERE id=%s AND owner_id=%s "
        "AND active_task_id=%s AND deleted_at IS NULL FOR UPDATE",
        (task["result_id"], task["owner_id"], task["id"]),
    )
    version = await one(
        conn,
        "SELECT * FROM result_revisions WHERE id=%s AND task_id=%s AND task_revision=%s FOR UPDATE",
        (version_id, task["id"], task["revision"]),
    )
    if not root or not version or version["draft_hash"] != fingerprint(task["draft"]):
        raise ValueError("Publikasi hasil tidak lagi memiliki revision/izin yang sesuai.")
    for file in version["manifest"]["files"]:
        await files.revision(conn, task["owner_id"], UUID(file["revision_id"]), ready=False)
        await conn.execute(
            "UPDATE file_revisions SET status='ready' WHERE id=%s", (UUID(file["revision_id"]),)
        )
    await conn.execute(
        "UPDATE result_revisions SET status='ready',ready_at=now() WHERE id=%s", (version_id,)
    )
    await conn.execute(
        "UPDATE product_results SET "
        "status='ready',current_revision=%s,updated_at=now() WHERE id=%s",
        (version["revision"], root["id"]),
    )
    return version["manifest"]


async def detail(conn, owner, result_id, revision=None):
    root = await one(
        conn,
        "SELECT id,thread_id,status,current_revision,created_at,updated_at,active_task_id "
        "FROM product_results WHERE id=%s AND owner_id=%s AND deleted_at IS NULL",
        (result_id, owner),
    )
    if not root:
        raise HTTPException(404, "Hasil tidak ditemukan.")
    root["revisions"] = await (
        await conn.execute(
            "SELECT revision,task_id,task_revision,status,created_at,ready_at "
            "FROM result_revisions WHERE result_id=%s ORDER BY revision DESC",
            (result_id,),
        )
    ).fetchall()
    root["selected"] = await one(
        conn,
        "SELECT r.revision,r.manifest,r.status,t.runtime_kind FROM result_revisions r "
        "JOIN background_tasks t ON t.id=r.task_id WHERE r.result_id=%s AND r.revision=%s",
        (result_id, revision or root["current_revision"]),
    )
    if revision and not root["selected"]:
        raise HTTPException(404, "Revision hasil tidak ditemukan.")
    return root


async def listing(conn, owner, thread_id=None):
    rows = await (
        await conn.execute(
            "SELECT id FROM product_results WHERE owner_id=%s AND deleted_at IS NULL "
            "AND (%s::uuid IS NULL OR thread_id=%s) ORDER BY updated_at DESC LIMIT 50",
            (owner, thread_id, thread_id),
        )
    ).fetchall()
    return [await detail(conn, owner, row["id"]) for row in rows]
