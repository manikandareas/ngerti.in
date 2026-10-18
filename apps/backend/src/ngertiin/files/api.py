"""Authenticated product files and results; no signed storage URL escapes the API."""

from typing import Annotated
from urllib.parse import quote
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile
from pydantic import BaseModel, ConfigDict

from ngertiin.accounts.auth import current_account
from ngertiin.async_db import transaction
from ngertiin.chat.store import lock_account, one
from ngertiin.files import deletion, results, store
from ngertiin.files.contracts import policy
from ngertiin.models import Account

router = APIRouter(tags=["files", "results"])
AccountDep = Annotated[Account, Depends(current_account)]


async def receive(account, request_key, file, file_id=None):
    data = await file.read(policy()["max_file_bytes"] + 1)
    try:
        return await store.upload(account.id, request_key, file.filename or "upload", data, file_id)
    except ValueError as error:
        raise HTTPException(422, str(error)) from error
    finally:
        await file.close()


@router.get("/files")
async def list_files(account: AccountDep):
    return {"files": await store.listing(account.id), "policy": policy()}


@router.post("/files", status_code=201)
async def upload(
    account: AccountDep, request_key: Annotated[UUID, Form()], file: Annotated[UploadFile, File()]
):
    return await receive(account, request_key, file)


@router.post("/files/{file_id}/revisions", status_code=201)
async def upload_revision(
    file_id: UUID,
    account: AccountDep,
    request_key: Annotated[UUID, Form()],
    file: Annotated[UploadFile, File()],
):
    return await receive(account, request_key, file, file_id)


@router.get("/files/{file_id}")
async def detail(file_id: UUID, account: AccountDep):
    async with transaction() as conn:
        return await store.detail(conn, account.id, file_id)


@router.get("/files/revisions/{revision_id}/content")
async def content(revision_id: UUID, account: AccountDep):
    row, body = await store.content(account.id, revision_id)
    return Response(
        body,
        media_type=row["content_type"],
        headers={
            "Content-Disposition": "attachment; filename*=UTF-8''"
            + quote(row["filename"], safe=""),
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": (
                "sandbox; default-src 'none'; base-uri 'none'; form-action 'none'"
            ),
        },
    )


@router.delete("/files/{file_id}", status_code=204)
async def delete_file(file_id: UUID, account: AccountDep):
    await deletion.file(account.id, file_id)


@router.get("/files/revisions/{revision_id}/extraction")
async def extraction(revision_id: UUID, account: AccountDep):
    async with transaction() as conn:
        await store.revision(conn, account.id, revision_id)
        return await one(
            conn,
            "SELECT id,status,error,reserved_pages,charged_pages,usage,policy,created_at "
            "FROM file_extractions WHERE revision_id=%s ORDER BY created_at DESC LIMIT 1",
            (revision_id,),
        )


class RetryInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    request_key: UUID
    acknowledge_possible_charge: bool = False


@router.post("/files/revisions/{revision_id}/extraction/retry")
async def retry_extraction(revision_id: UUID, body: RetryInput, account: AccountDep):
    async with transaction() as conn:
        await lock_account(conn, account.id)
        await store.revision(conn, account.id, revision_id)
        previous = await one(
            conn,
            "SELECT id,revision_id,status FROM file_extractions WHERE owner_id=%s AND retry_key=%s",
            (account.id, body.request_key),
        )
        if previous:
            if previous["revision_id"] != revision_id:
                raise HTTPException(409, "Kunci retry dipakai untuk revision berbeda.")
            return {"id": previous["id"], "status": previous["status"]}
        row = await one(
            conn,
            "SELECT * FROM file_extractions WHERE revision_id=%s ORDER BY "
            "created_at DESC LIMIT 1 FOR UPDATE",
            (revision_id,),
        )
        if not row or row["status"] not in ("failed", "unknown"):
            raise HTTPException(409, "Ekstraksi tidak sedang gagal.")
        if row["charged_pages"] and not body.acknowledge_possible_charge:
            raise HTTPException(
                409, "Percobaan sebelumnya mungkin berbiaya. Konfirmasi percobaan baru."
            )
        # Preserve charged attempt history. A new cache identity is explicit.
        from uuid import uuid4

        from ngertiin.chat.store import json_value
        from ngertiin.files.jobs import extract_job

        eid = uuid4()
        await conn.execute(
            "INSERT INTO "
            "file_extractions(id,revision_id,owner_id,config_hash,policy,retry_key) "
            "VALUES (%s,%s,%s,%s,%s,%s)",
            (eid, revision_id, account.id, str(eid), json_value(row["policy"]), body.request_key),
        )
        job = await extract_job.configure(connection=conn, lock=f"file:{eid}").defer_async(
            extraction_id=str(eid)
        )
        await conn.execute("UPDATE file_extractions SET job_id=%s WHERE id=%s", (job, eid))
        await conn.execute(
            "UPDATE task_file_inputs i SET extraction_id=%s FROM background_tasks t "
            "WHERE t.id=i.task_id AND t.owner_id=%s AND i.extraction_id=%s "
            "AND t.status IN ('failed','queued') AND t.draft=''",
            (eid, account.id, row["id"]),
        )
        affected = await (
            await conn.execute(
                "SELECT t.id,t.input_snapshot FROM background_tasks t JOIN task_file_inputs i "
                "ON i.task_id=t.id WHERE i.extraction_id=%s AND t.owner_id=%s",
                (eid, account.id),
            )
        ).fetchall()
        for task in affected:
            captured = task["input_snapshot"]
            for ref in captured.get("files", []):
                if ref["extraction_id"] == str(row["id"]):
                    ref["previous_extraction_ids"] = [
                        *ref.get("previous_extraction_ids", []),
                        ref["extraction_id"],
                    ]
                    ref["extraction_id"] = str(eid)
            await conn.execute(
                "UPDATE background_tasks SET input_snapshot=%s WHERE id=%s",
                (json_value(captured), task["id"]),
            )
    return {"id": eid, "status": "queued"}


@router.get("/results")
async def list_results(account: AccountDep, thread_id: UUID | None = None):
    async with transaction() as conn:
        return {"results": await results.listing(conn, account.id, thread_id)}


@router.get("/results/{result_id}")
async def result(result_id: UUID, account: AccountDep, revision: int | None = None):
    async with transaction() as conn:
        return await results.detail(conn, account.id, result_id, revision)


@router.delete("/results/{result_id}", status_code=204)
async def delete_result(result_id: UUID, account: AccountDep):
    await deletion.result(account.id, result_id)
