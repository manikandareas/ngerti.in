"""One-time local upgrade of existing verified text; no model/OCR requests."""

import asyncio
import hashlib
import json

from ngertiin.async_db import transaction
from ngertiin.storage import get_object


async def backfill():
    async with transaction() as conn:
        rows = await (
            await conn.execute(
                "SELECT r.* FROM file_revisions r JOIN product_files f "
                "ON f.id=r.file_id WHERE f.deleted_at IS NULL AND r.status='ready' "
                "AND r.search_text='' ORDER BY r.created_at LIMIT 10000"
            )
        ).fetchall()
    completed = 0
    for row in rows:
        text = ""
        if row["content_type"].startswith("text/") or row["content_type"] == "application/json":
            data = await asyncio.to_thread(get_object, row["object_key"])
            if hashlib.sha256(data).hexdigest() != row["sha256"]:
                continue
            text = data.decode(errors="replace")
        else:
            async with transaction() as conn:
                extraction = await (
                    await conn.execute(
                        "SELECT object_key,usage FROM file_extractions "
                        "WHERE revision_id=%s AND status='ready' ORDER BY finished_at DESC LIMIT 1",
                        (row["id"],),
                    )
                ).fetchone()
            if extraction and extraction["object_key"]:
                data = await asyncio.to_thread(get_object, extraction["object_key"])
                if hashlib.sha256(data).hexdigest() != extraction["usage"].get("sha256"):
                    continue
                parsed = json.loads(data)
                text = "\n".join(p.get("text", "") for p in parsed.get("pages", []))
        if text:
            async with transaction() as conn:
                await conn.execute(
                    "UPDATE file_revisions r SET search_text=%s FROM product_files f "
                    "WHERE r.id=%s AND r.file_id=f.id "
                    "AND f.deleted_at IS NULL AND r.status='ready'",
                    (text[:120000], row["id"]),
                )
            completed += 1
    return completed


if __name__ == "__main__":
    print(asyncio.run(backfill()))
