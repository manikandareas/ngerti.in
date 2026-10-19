"""Durable extraction claims, page admission, settlement and cache publication."""

import asyncio
import hashlib
import json
from uuid import UUID, uuid4

from fastapi import HTTPException

from ngertiin.async_db import transaction
from ngertiin.chat.store import json_value, lock_account, one
from ngertiin.files import inputs, mistral, store
from ngertiin.storage import get_object, put_object


async def claim(extraction_id):
    async with transaction() as conn:
        first = await one(
            conn, "SELECT owner_id FROM file_extractions WHERE id=%s", (extraction_id,)
        )
        if not first:
            return None
        await lock_account(conn, first["owner_id"])
        row = await one(
            conn, "SELECT * FROM file_extractions WHERE id=%s FOR UPDATE", (extraction_id,)
        )
        if row["status"] != "queued":
            return None
        try:
            file = await store.revision(conn, row["owner_id"], row["revision_id"])
        except HTTPException:
            await conn.execute(
                "UPDATE file_extractions SET status='failed',error='Input dihapus',"
                "finished_at=now() WHERE id=%s",
                (row["id"],),
            )
            return {**row, "blocked": True}
        needed = await one(
            conn,
            "SELECT t.id FROM task_file_inputs i JOIN background_tasks t ON t.id=i.task_id "
            "WHERE i.extraction_id=%s AND t.status IN ('queued','running','waiting_user') LIMIT 1",
            (row["id"],),
        )
        if not needed and not row["retry_key"]:
            await conn.execute(
                "UPDATE file_extractions SET status='failed',error=%s,"
                "finished_at=now() WHERE id=%s",
                ("Task pengguna tidak lagi aktif. OCR tidak dijalankan.", row["id"]),
            )
            return {**row, "blocked": True}
        paid = row["policy"]["provider"] == "mistral"
        pages = file["page_count"] if paid else 0
        if paid:
            await conn.execute("SELECT pg_advisory_xact_lock(340034)")
            used = await one(
                conn,
                "SELECT COALESCE(sum(charged_pages),0) AS total,COALESCE(sum(charged_pages) "
                "FILTER (WHERE owner_id=%s),0) AS account FROM file_extractions "
                "WHERE budget_day=(now() AT TIME ZONE 'UTC')::date",
                (row["owner_id"],),
            )
            if (
                used["account"] + pages > row["policy"]["ocr_account_daily_pages"]
                or used["total"] + pages > row["policy"]["ocr_global_daily_pages"]
            ):
                await conn.execute(
                    "UPDATE file_extractions SET "
                    "status='failed',error=%s,finished_at=now() WHERE id=%s",
                    ("Batas halaman OCR hari ini tercapai. Coba ulang besok (UTC).", row["id"]),
                )
                return {**row, "blocked": True}
        token = uuid4()
        await conn.execute(
            "UPDATE file_extractions SET status='running',lease_token=%s,started_at=now(),"
            "budget_day=(now() AT TIME ZONE 'UTC')::date,reserved_pages=%s,charged_pages=%s "
            "WHERE id=%s",
            (token, pages, pages, row["id"]),
        )
        return {**row, "lease_token": token, "reserved_pages": pages, "file": file}


def normalize(raw: dict, expected: int) -> dict:
    pages = raw.get("pages")
    if not isinstance(pages, list) or len(pages) != expected:
        raise ValueError("OCR tidak mengembalikan seluruh halaman yang diharapkan.")
    if sorted(p.get("index", -1) for p in pages) != list(range(expected)):
        raise ValueError("Identitas halaman OCR tidak lengkap atau terduplikasi.")
    pages = sorted(pages, key=lambda page: page["index"])
    result = []
    for index, page in enumerate(pages):
        text = page.get("markdown")
        if not isinstance(text, str):
            raise ValueError("Struktur hasil OCR tidak valid.")
        # Keep tables alongside page text; HTML remains untrusted source data.
        for table in page.get("tables") or []:
            text += "\n" + str(table.get("content", ""))
        result.append({"number": index + 1, "provider_index": page.get("index"), "text": text})
    if not any(page["text"].strip() for page in result):
        raise ValueError("Dokumen tidak memiliki teks yang dapat diekstrak.")
    return {"pages": result, "model": raw.get("model"), "usage_info": raw.get("usage_info", {})}


async def run(extraction_id: UUID):
    item = None
    dispatched = False
    try:
        item = await claim(extraction_id)
        if not item:
            return
        if item.get("blocked"):
            return
        file, rules = item["file"], item["policy"]
        body = await asyncio.to_thread(get_object, file["object_key"])
        if hashlib.sha256(body).hexdigest() != file["sha256"]:
            raise ValueError("Integritas file sumber tidak sesuai.")
        request_id = None
        raw: dict = {}
        if rules["provider"] == "mistral":
            dispatched = True
            raw, request_id = await mistral.parse(body, file["content_type"], rules)
            async with transaction() as conn:
                await conn.execute(
                    "UPDATE file_extractions SET provider_request_id=%s,usage=%s "
                    "WHERE id=%s AND lease_token=%s",
                    (
                        request_id,
                        json_value(
                            {"provider_usage": raw.get("usage_info", {}), "model": raw.get("model")}
                        ),
                        item["id"],
                        item["lease_token"],
                    ),
                )
            parsed = normalize(raw, file["page_count"])
        else:
            text = body.decode("utf-8-sig")
            if not text.strip():
                raise ValueError("File tidak memiliki teks yang dapat dibaca.")
            parsed = {"pages": [{"number": 1, "text": text}], "model": "utf8-v1"}
        encoded = json.dumps(parsed, ensure_ascii=False).encode()
        if len(encoded) > rules["max_extraction_bytes"]:
            raise ValueError("Hasil ekstraksi melebihi 4 MiB. Gunakan file lebih kecil.")
        digest = hashlib.sha256(encoded).hexdigest()
        key = f"accounts/{item['owner_id']}/extractions/{item['id']}/{digest}.json"
        async with transaction() as conn:
            await conn.execute(
                "UPDATE file_extractions SET object_key=%s WHERE id=%s AND lease_token=%s",
                (key, item["id"], item["lease_token"]),
            )
        await asyncio.to_thread(put_object, key, encoded, "application/json")
        async with transaction() as conn:
            await conn.execute(
                "UPDATE file_extractions SET purged_at=NULL WHERE id=%s AND EXISTS "
                "(SELECT 1 FROM file_revisions r WHERE r.id=revision_id AND r.status='deleted')",
                (item["id"],),
            )
        if hashlib.sha256(await asyncio.to_thread(get_object, key)).hexdigest() != digest:
            raise ValueError("Publikasi ekstraksi gagal diverifikasi.")
        async with transaction() as conn:
            await lock_account(conn, item["owner_id"])
            await store.revision(conn, item["owner_id"], item["revision_id"])
            await conn.execute(
                "UPDATE file_extractions SET status='ready',object_key=%s,usage=%s,"
                "provider_request_id=%s,finished_at=now(),lease_token=NULL,error=NULL "
                "WHERE id=%s AND status='running' AND lease_token=%s",
                (
                    key,
                    json_value(
                        {
                            "sha256": digest,
                            "model": parsed.get("model"),
                            "provider_usage": raw.get("usage_info", {}),
                        }
                    ),
                    request_id,
                    item["id"],
                    item["lease_token"],
                ),
            )
            await conn.execute(
                "UPDATE file_revisions SET search_text=%s WHERE id=%s AND status='ready'",
                (
                    "\n".join(p.get("text", "") for p in parsed.get("pages", []))[:120000],
                    item["revision_id"],
                ),
            )
    except (Exception, asyncio.CancelledError) as error:
        if item and not item.get("blocked"):
            unknown = isinstance(error, (asyncio.CancelledError, mistral.OcrFailure)) and (
                not isinstance(error, mistral.OcrFailure) or error.unknown
            )
            message = (
                str(error)
                if isinstance(error, ValueError)
                else "Ekstraksi terhenti. Periksa atau coba ulang lampiran."
            )
            async with transaction() as conn:
                await lock_account(conn, item["owner_id"])
                # Once a paid request may have run, even invalid output is real work.
                zero = not dispatched or (
                    isinstance(error, mistral.OcrFailure) and not error.unknown
                )
                await conn.execute(
                    "UPDATE file_extractions SET status=%s,error=%s,finished_at=now(),"
                    "lease_token=NULL,charged_pages=CASE WHEN %s THEN 0 ELSE charged_pages END "
                    "WHERE id=%s AND lease_token=%s",
                    (
                        "unknown" if unknown else "failed",
                        message,
                        zero,
                        item["id"],
                        item["lease_token"],
                    ),
                )
        if isinstance(error, asyncio.CancelledError):
            raise
    finally:
        if item:
            await inputs.wake(item["owner_id"])
