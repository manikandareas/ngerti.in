"""A selection is an exact reference, scoped to account and conversation."""

from fastapi import HTTPException

from ngertiin.async_db import transaction
from ngertiin.chat.store import json_value, lock_account, one, owned_thread
from ngertiin.library.contracts import ResourceRef
from ngertiin.library.reader import resolve


async def select(owner, thread_id, ref: ResourceRef | None):
    async with transaction() as conn:
        await lock_account(conn, owner)
        await owned_thread(conn, owner, thread_id, lock=True)
        if ref is None:
            await conn.execute(
                "DELETE FROM thread_resource_selections WHERE thread_id=%s", (thread_id,)
            )
            return {"selection": None}
        item = await resolve(conn, owner, ref)
        if ref.kind == "result" and item["ref"]["revision"] is None:
            raise HTTPException(409, "Hasil belum siap dipilih. Ikuti progres pekerjaannya.")
        await conn.execute(
            "INSERT INTO thread_resource_selections(thread_id,owner_id,ref) "
            "VALUES (%s,%s,%s) ON CONFLICT(thread_id) "
            "DO UPDATE SET ref=excluded.ref,updated_at=now()",
            (thread_id, owner, json_value(item["ref"])),
        )
        return {"selection": {"ref": item["ref"], "title": item["title"]}}


async def current(conn, owner, thread_id):
    row = await one(
        conn,
        "SELECT ref FROM thread_resource_selections WHERE thread_id=%s AND owner_id=%s",
        (thread_id, owner),
    )
    if not row:
        return None
    try:
        value = await resolve(conn, owner, ResourceRef.model_validate(row["ref"]))
        return {"ref": value["ref"], "title": value["title"]}
    except HTTPException:
        return {
            "ref": row["ref"],
            "unavailable": True,
            "title": "Pilihan sudah berubah atau tidak tersedia",
        }
