"""The model can propose; an authenticated owner decision alone changes persona."""

from uuid import uuid4

from fastapi import HTTPException

from ngertiin.async_db import transaction
from ngertiin.chat.store import json_value, lock_account, one, owned_thread
from ngertiin.persona import store
from ngertiin.persona.contracts import PersonaContent
from ngertiin.quotas.policy import fingerprint


async def propose_locked(conn, owner, key, revision, content, source, *, run=None, restore=None):
    value = PersonaContent.model_validate(content).model_dump()
    digest = fingerprint(
        {
            "revision": revision,
            "content": value,
            "source": source,
            "restored_from": restore,
            "run": str(run["id"]) if run else None,
        }
    )
    previous = await one(
        conn, "SELECT * FROM persona_proposals WHERE owner_id=%s AND request_key=%s", (owner, key)
    )
    if previous:
        if previous["fingerprint"] != digest:
            raise HTTPException(409, "Kunci perubahan sudah dipakai untuk isi berbeda.")
        return previous
    profile = await store.current(conn, owner)
    if profile["revision"] != revision:
        raise HTTPException(409, "Profil sudah berubah. Draftmu tetap ada; tinjau versi terbaru.")
    if run:
        await owned_thread(conn, owner, run["thread_id"], lock=True)
        valid = await one(
            conn,
            "SELECT id FROM chat_runs WHERE id=%s AND owner_id=%s "
            "AND lease_token=%s AND status='running' AND NOT cancel_requested",
            (run["id"], owner, run["lease_token"]),
        )
        if not valid:
            raise HTTPException(409, "Giliran chat tidak lagi aktif.")
        pending = await one(
            conn,
            "SELECT count(*) AS n FROM persona_proposals WHERE owner_id=%s "
            "AND status='proposed' AND expires_at>now()",
            (owner,),
        )
        if pending["n"] >= 20:
            raise HTTPException(429, "Tinjau usulan karakter yang menunggu terlebih dahulu.")
    return await one(
        conn,
        "INSERT INTO persona_proposals(id,owner_id,thread_id,source_run_id,request_key,"
        "fingerprint,expected_revision,before_content,content,source,restored_from) "
        "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *",
        (
            uuid4(),
            owner,
            run["thread_id"] if run else None,
            run["id"] if run else None,
            key,
            digest,
            revision,
            json_value({k: v for k, v in profile.items() if k != "revision"}),
            json_value(value),
            source,
            restore,
        ),
    )


async def apply_locked(conn, owner, proposal, approved):
    expected = "approved" if approved else "rejected"
    if proposal["status"] != "proposed":
        if proposal["status"] == expected:
            return proposal
        raise HTTPException(409, "Usulan sudah diputuskan atau kedaluwarsa.")
    if not approved:
        return await one(
            conn,
            "UPDATE persona_proposals SET status='rejected',decided_at=now() "
            "WHERE id=%s RETURNING *",
            (proposal["id"],),
        )
    fresh = await one(
        conn,
        "SELECT expires_at>now() AS valid FROM persona_proposals WHERE id=%s",
        (proposal["id"],),
    )
    if not fresh["valid"]:
        raise HTTPException(409, "Usulan kedaluwarsa. Minta perubahan baru.")
    profile = await store.current(conn, owner)
    if profile["revision"] != proposal["expected_revision"]:
        raise HTTPException(409, "Profil sudah berubah. Tinjau usulan baru dari versi aktif.")
    value = PersonaContent.model_validate(proposal["content"]).model_dump()
    revision = profile["revision"] + 1
    await conn.execute(
        "UPDATE agent_profiles SET name=%s,tagline=%s,avatar=%s,soul=%s,"
        "revision=%s WHERE owner_id=%s",
        (value["name"], value["tagline"], value["avatar"], value["soul"], revision, owner),
    )
    await conn.execute(
        "INSERT INTO persona_revisions(owner_id,revision,content,source,"
        "restored_from) VALUES (%s,%s,%s,%s,%s)",
        (owner, revision, json_value(value), proposal["source"], proposal["restored_from"]),
    )
    return await one(
        conn,
        "UPDATE persona_proposals SET status='approved',applied_revision=%s,"
        "decided_at=now() WHERE id=%s RETURNING *",
        (revision, proposal["id"]),
    )


async def edit(owner, body, *, restore=False):
    async with transaction() as conn:
        await lock_account(conn, owner)
        if restore:
            row = await one(
                conn,
                "SELECT content FROM persona_revisions WHERE owner_id=%s AND revision=%s",
                (owner, body.revision),
            )
            if not row:
                raise HTTPException(404, "Versi profil tidak ditemukan.")
            value = row["content"]
        else:
            value = body.content.model_dump()
        proposal = await propose_locked(
            conn,
            owner,
            body.request_key,
            body.expected_revision,
            value,
            "restore" if restore else "editor",
            restore=body.revision if restore else None,
        )
        return await apply_locked(conn, owner, proposal, True)


async def decide(owner, proposal_id, approved):
    async with transaction() as conn:
        await lock_account(conn, owner)
        proposal = await one(
            conn,
            "SELECT * FROM persona_proposals WHERE id=%s AND owner_id=%s FOR UPDATE",
            (proposal_id, owner),
        )
        if not proposal:
            raise HTTPException(404, "Usulan tidak ditemukan.")
        return await apply_locked(conn, owner, proposal, approved)
