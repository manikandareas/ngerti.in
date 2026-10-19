"""Owned upload reservations; storage I/O stays outside domain transactions."""

import asyncio
import hashlib
from uuid import UUID, uuid4

from fastapi import HTTPException

from ngertiin.async_db import transaction
from ngertiin.chat.store import lock_account, one
from ngertiin.config import get_settings
from ngertiin.files.validation import validate_upload
from ngertiin.quotas.policy import fingerprint
from ngertiin.storage import get_object, put_object

REVISION_COLUMNS = (
    "r.id,r.file_id,r.revision,r.filename,r.content_type,r.size,r.sha256,"
    "r.page_count,r.status,r.source,r.created_at"
)


async def revision(conn, owner: UUID, revision_id: UUID, *, ready=True):
    row = await one(
        conn,
        "SELECT r.* FROM file_revisions r JOIN product_files f ON f.id=r.file_id "
        "WHERE r.id=%s AND r.owner_id=%s AND f.deleted_at IS NULL AND r.status<>'deleted'",
        (revision_id, owner),
    )
    if not row or (ready and row["status"] != "ready"):
        raise HTTPException(404, "Revision file tidak tersedia atau telah dihapus.")
    return row


async def capacity(conn, owner, size):
    row = await one(
        conn,
        "SELECT COALESCE(sum(size),0) AS size FROM ("
        "SELECT size FROM file_revisions WHERE owner_id=%s AND purged_at IS NULL UNION ALL "
        "SELECT size FROM sandbox_outputs WHERE owner_id=%s AND purged_at IS NULL UNION ALL "
        "SELECT size FROM computer_outputs WHERE owner_id=%s AND purged_at IS NULL) owned_bytes",
        (owner, owner, owner),
    )
    if row["size"] + size > get_settings().file_account_bytes:
        raise HTTPException(429, "Penyimpanan file akun penuh. Hapus file yang tidak diperlukan.")


async def written(conn, revision_id):
    # A put already in flight can finish after deletion/GC. Requeue its tombstone.
    await conn.execute(
        "UPDATE file_revisions SET purged_at=NULL WHERE id=%s AND status='deleted'",
        (revision_id,),
    )


async def upload(owner: UUID, key: UUID, name: str, data: bytes, file_id: UUID | None = None):
    filename, content_type, pages = await asyncio.to_thread(validate_upload, name, data)
    digest = hashlib.sha256(data).hexdigest()
    identity = fingerprint({"file_id": str(file_id), "filename": filename, "sha256": digest})
    async with transaction() as conn:
        await lock_account(conn, owner)
        row = await one(
            conn,
            "SELECT * FROM file_revisions WHERE owner_id=%s AND request_key=%s",
            (owner, key),
        )
        if row:
            if row["fingerprint"] != identity:
                raise HTTPException(409, "Kunci upload sudah dipakai untuk file berbeda.")
            if row["status"] == "deleted":
                raise HTTPException(410, "Upload ini sudah dihapus. Pilih file kembali.")
            await revision(conn, owner, row["id"], ready=False)
            if row["status"] == "ready":
                return {
                    **await detail(conn, owner, row["file_id"]),
                    "uploaded_revision_id": row["id"],
                }
        else:
            await capacity(conn, owner, len(data))
            if file_id:
                file = await one(
                    conn,
                    "SELECT * FROM product_files WHERE id=%s AND owner_id=%s "
                    "AND deleted_at IS NULL FOR UPDATE",
                    (file_id, owner),
                )
                if not file:
                    raise HTTPException(404, "File tidak ditemukan.")
                number = file["current_revision"] + 1
                await conn.execute(
                    "UPDATE product_files SET current_revision=%s WHERE id=%s", (number, file_id)
                )
            else:
                file_id, number = uuid4(), 1
                await conn.execute(
                    "INSERT INTO product_files(id,owner_id) VALUES (%s,%s)", (file_id, owner)
                )
            rid = uuid4()
            row = await one(
                conn,
                "INSERT INTO file_revisions(id,file_id,owner_id,revision,request_key,fingerprint,"
                "filename,content_type,size,sha256,object_key,page_count,source,status) "
                "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'upload','uploading') RETURNING *",
                (
                    rid,
                    file_id,
                    owner,
                    number,
                    key,
                    identity,
                    filename,
                    content_type,
                    len(data),
                    digest,
                    f"accounts/{owner}/files/{rid}/{digest}",
                    pages,
                ),
            )
    try:
        await asyncio.to_thread(put_object, row["object_key"], data, content_type)
        saved = await asyncio.to_thread(get_object, row["object_key"])
        if hashlib.sha256(saved).hexdigest() != digest:
            raise ValueError("Pemeriksaan integritas upload gagal.")
    except Exception:
        async with transaction() as conn:
            await lock_account(conn, owner)
            await written(conn, row["id"])
            await conn.execute(
                "UPDATE file_revisions SET status='failed' WHERE id=%s AND status<>'deleted'",
                (row["id"],),
            )
        raise
    async with transaction() as conn:
        await lock_account(conn, owner)
        await written(conn, row["id"])
    async with transaction() as conn:
        await lock_account(conn, owner)
        await revision(conn, owner, row["id"], ready=False)
        await conn.execute("UPDATE file_revisions SET status='ready' WHERE id=%s", (row["id"],))
        return {**await detail(conn, owner, row["file_id"]), "uploaded_revision_id": row["id"]}


async def detail(conn, owner, file_id):
    file = await one(
        conn,
        "SELECT id,current_revision,created_at FROM product_files "
        "WHERE id=%s AND owner_id=%s AND deleted_at IS NULL",
        (file_id, owner),
    )
    if not file:
        raise HTTPException(404, "File tidak ditemukan.")
    file["revisions"] = await (
        await conn.execute(
            "SELECT " + REVISION_COLUMNS + " FROM file_revisions r "
            "WHERE r.file_id=%s AND r.status<>'deleted' ORDER BY r.revision DESC",
            (file_id,),
        )
    ).fetchall()
    return file


async def listing(owner):
    async with transaction() as conn:
        rows = await (
            await conn.execute(
                "SELECT f.id FROM product_files f WHERE owner_id=%s AND deleted_at IS NULL "
                "AND EXISTS (SELECT 1 FROM file_revisions r WHERE r.file_id=f.id "
                "AND r.source='upload') ORDER BY f.created_at DESC LIMIT 50",
                (owner,),
            )
        ).fetchall()
        return [await detail(conn, owner, row["id"]) for row in rows]


async def content(owner, revision_id):
    async with transaction() as conn:
        row = await revision(conn, owner, revision_id)
    body = await asyncio.to_thread(get_object, row["object_key"])
    if hashlib.sha256(body).hexdigest() != row["sha256"]:
        raise HTTPException(503, "Integritas file tidak sesuai. Coba lagi nanti.")
    # Deletion during storage I/O must also revoke this response.
    async with transaction() as conn:
        await revision(conn, owner, revision_id)
    return row, body
