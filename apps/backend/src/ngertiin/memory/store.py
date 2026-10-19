"""Canonical revisions and source references. Mem0 records are rebuildable projections."""

from datetime import UTC, datetime
from uuid import UUID, uuid4, uuid5

from fastapi import HTTPException

from ngertiin.chat.store import json_value, one
from ngertiin.memory import policy, sources


async def settings(conn, owner):
    await conn.execute(
        "INSERT INTO memory_settings(owner_id) VALUES (%s) ON CONFLICT DO NOTHING", (owner,)
    )
    return await one(conn, "SELECT * FROM memory_settings WHERE owner_id=%s", (owner,))


async def owned(conn, owner, entry_id, *, lock=False):
    row = await one(
        conn,
        "SELECT * FROM memory_entries WHERE id=%s AND owner_id=%s"
        + (" FOR UPDATE" if lock else ""),
        (entry_id, owner),
    )
    if not row:
        raise HTTPException(404, "Ingatan tidak ditemukan.")
    return row


async def evidence(conn, owner, revision_id):
    return await (
        await conn.execute(
            "SELECT id,source_kind,source_id,source_revision,source_hash,anchor,"
            "created_at FROM memory_evidence WHERE revision_id=%s AND owner_id=%s "
            "ORDER BY created_at",
            (revision_id, owner),
        )
    ).fetchall()


async def usable(conn, owner, revision):
    now = datetime.now(UTC)
    if (
        revision["owner_id"] != owner
        or revision["status"] != "active"
        or not revision["statement"]
        or (revision["valid_from"] and revision["valid_from"] > now)
        or (revision["valid_to"] and revision["valid_to"] <= now)
    ):
        return False
    suppressed = await one(
        conn,
        "SELECT 1 FROM memory_suppressions s JOIN memory_entries e ON "
        "e.memory_key=s.memory_key AND e.owner_id=s.owner_id WHERE e.id=%s AND "
        "s.active",
        (revision["entry_id"],),
    )
    if suppressed:
        return False
    refs = await evidence(conn, owner, revision["id"])
    for ref in refs:
        if await sources.alive(conn, owner, ref):
            return True
    return False


async def current_revision(conn, entry):
    return await one(
        conn,
        "SELECT * FROM memory_revisions WHERE entry_id=%s AND revision=%s",
        (entry["id"], entry["revision"]),
    )


async def outbox(conn, owner, revision_id, operation):
    await conn.execute(
        "INSERT INTO memory_index_operations(id,owner_id,revision_id,operation) "
        "VALUES (%s,%s,%s,%s) ON CONFLICT(revision_id,operation) DO UPDATE SET "
        "status=CASE WHEN memory_index_operations.status='complete' THEN 'queued' "
        "ELSE memory_index_operations.status END,updated_at=now()",
        (uuid4(), owner, revision_id, operation),
    )


async def attach_evidence(conn, revision_id, owner, source_ref, anchor):
    await conn.execute(
        "INSERT INTO memory_evidence(id,owner_id,revision_id,source_kind,source_id,"
        "source_revision,source_hash,anchor,capture_job_id) VALUES (%s,%s,%s,%s,%s,"
        "%s,%s,%s,%s) ON CONFLICT DO NOTHING",
        (
            uuid4(),
            owner,
            revision_id,
            source_ref["source_kind"],
            source_ref["source_id"],
            source_ref["source_revision"],
            source_ref["source_hash"],
            anchor,
            source_ref.get("capture_job_id"),
        ),
    )


async def apply(conn, owner, candidate, source_ref, *, explicit=False):
    existing = await one(
        conn,
        "SELECT * FROM memory_entries WHERE owner_id=%s AND memory_key=%s FOR UPDATE",
        (owner, candidate.key),
    )
    suppressed = await one(
        conn,
        "SELECT 1 FROM memory_suppressions WHERE owner_id=%s AND memory_key=%s AND active",
        (owner, candidate.key),
    )
    if suppressed and not explicit:
        return None
    if (
        existing
        and existing["statement"] == candidate.statement
        and existing["status"] == ("active")
    ):
        rev = await current_revision(conn, existing)
        await attach_evidence(conn, rev["id"], owner, source_ref, candidate.anchor)
        return existing
    conflict = existing and existing["status"] == "active" and candidate.change == "new"
    status = (
        "active" if explicit or (candidate.confidence >= 0.85 and not conflict) else ("candidate")
    )
    key = candidate.key
    if conflict:
        key = f"{key}.candidate.{policy.digest(candidate.statement)[:8]}"
        existing = await one(
            conn,
            "SELECT * FROM memory_entries WHERE owner_id=%s AND memory_key=%s FOR UPDATE",
            (owner, key),
        )
        if existing:
            return existing
    entry_id = existing["id"] if existing else uuid5(owner, "memory:" + key)
    revision = existing["revision"] + 1 if existing else 1
    now = datetime.now(UTC)
    start = candidate.valid_from or now
    if start.tzinfo is None:
        start = start.replace(tzinfo=UTC)
    if existing:
        old = await current_revision(conn, existing)
        previous_status = "historical" if candidate.change == "change" else "corrected"
        await conn.execute(
            "UPDATE memory_revisions SET status=%s,valid_to=%s WHERE id=%s",
            (previous_status, start if previous_status == "historical" else None, old["id"]),
        )
        await outbox(conn, owner, old["id"], "delete")
        await conn.execute(
            "UPDATE memory_settings SET generation=generation+1 WHERE owner_id=%s", (owner,)
        )
        await conn.execute(
            (
                "UPDATE memory_entries SET revision=%s,kind=%s,statement=%s,"
                "confidence=%s,status=%s,valid_from=%s,valid_to=NULL,"
                "updated_at=now() WHERE id=%s"
            ),
            (
                revision,
                candidate.kind,
                candidate.statement,
                candidate.confidence,
                status,
                start,
                entry_id,
            ),
        )
    else:
        await conn.execute(
            "INSERT INTO memory_entries(id,owner_id,memory_key,kind,statement,"
            "confidence,status,valid_from) VALUES (%s,%s,%s,%s,%s,%s,%s,%s)",
            (
                entry_id,
                owner,
                key,
                candidate.kind,
                candidate.statement,
                candidate.confidence,
                status,
                start,
            ),
        )
    revision_id = uuid5(entry_id, f"revision:{revision}")
    await conn.execute(
        "INSERT INTO memory_revisions(id,entry_id,owner_id,revision,kind,statement,"
        "confidence,status,valid_from) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)",
        (
            revision_id,
            entry_id,
            owner,
            revision,
            candidate.kind,
            candidate.statement,
            candidate.confidence,
            status,
            start,
        ),
    )
    await attach_evidence(conn, revision_id, owner, source_ref, candidate.anchor)
    if status == "active":
        await outbox(conn, owner, revision_id, "upsert")
        from ngertiin.proactivity.store import touch

        await touch(conn, owner)
    return await owned(conn, owner, entry_id)


async def listing(conn, owner, before=None):
    config = await settings(conn, owner)
    cursor = await owned(conn, owner, before) if before else None
    rows = await (
        await conn.execute(
            "SELECT * FROM memory_entries WHERE owner_id=%s AND status<>'forgotten' "
            "AND (%s::timestamptz IS NULL OR (created_at,id)<(%s,%s)) ORDER BY "
            "created_at DESC,id DESC LIMIT 21",
            (
                owner,
                cursor["created_at"] if cursor else None,
                cursor["created_at"] if cursor else None,
                before,
            ),
        )
    ).fetchall()
    entries = []
    for row in rows[:20]:
        rev = await current_revision(conn, row)
        refs = await evidence(conn, owner, rev["id"])
        valid = await usable(conn, owner, rev)
        entries.append(
            {
                **row,
                "evidence": [
                    {
                        **ref,
                        "available": await sources.alive(conn, owner, ref),
                        "source_label": await sources.label(conn, owner, ref),
                    }
                    for ref in refs
                ],
                "usable": valid,
            }
        )
    pending = await one(
        conn,
        (
            "SELECT count(*) AS n FROM memory_index_operations WHERE owner_id=%s "
            "AND operation='delete' AND status<>'complete'"
        ),
        (owner,),
    )
    captures = await one(
        conn,
        "SELECT count(*) AS n FROM memory_capture_jobs WHERE owner_id=%s AND status "
        "IN ('queued','extracting','admitting')",
        (owner,),
    )
    return {
        "settings": config,
        "entries": entries,
        "next_cursor": str(rows[19]["id"]) if len(rows) > 20 else None,
        "cleanup_pending": pending["n"],
        "capture_pending": captures["n"],
    }


async def history(conn, owner, entry_id):
    await owned(conn, owner, entry_id)
    rows = await (
        await conn.execute(
            (
                "SELECT * FROM memory_revisions WHERE entry_id=%s AND owner_id=%s "
                "ORDER BY revision DESC LIMIT 20"
            ),
            (entry_id, owner),
        )
    ).fetchall()
    return {
        "revisions": [{**row, "evidence": await evidence(conn, owner, row["id"])} for row in rows]
    }


async def command(conn, owner, key: UUID, payload):
    previous = await one(
        conn, "SELECT * FROM memory_commands WHERE owner_id=%s AND request_key=%s", (owner, key)
    )
    if previous:
        if previous["fingerprint"] != policy.fingerprint(payload):
            raise HTTPException(409, "Kunci permintaan sudah dipakai untuk perubahan lain.")
        return previous["response"]
    return None


async def receipt(conn, owner, key, payload, response):
    await conn.execute(
        "INSERT INTO memory_commands(owner_id,request_key,fingerprint,response) "
        "VALUES (%s,%s,%s,%s)",
        (owner, key, policy.fingerprint(payload), json_value(response)),
    )
    return response
