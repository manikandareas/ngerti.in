"""Development-only, authenticated browser controls for manual acceptance."""

from pathlib import PurePath
from typing import Annotated
from uuid import UUID, uuid4

import psycopg
from fastapi import APIRouter, Depends, HTTPException, UploadFile
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import update
from sqlmodel import Session, col, select

from ngertiin.accounts.auth import current_account
from ngertiin.config import get_settings
from ngertiin.db import get_engine, get_session
from ngertiin.models import Account, DiagnosticRun, StoredObject
from ngertiin.storage import delete_object, download_url, put_object
from ngertiin.worker.tasks import diagnostic_job

router = APIRouter(prefix="/dev", tags=["development"])
AccountDep = Annotated[Account, Depends(current_account)]
SessionDep = Annotated[Session, Depends(get_session)]
MAX_UPLOAD_BYTES = 5 * 1024 * 1024


class RunInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    request_key: UUID
    delay_seconds: int = Field(default=10, ge=0, le=30)


def serialize_run(run: DiagnosticRun, job: dict | None) -> dict:
    data = run.model_dump(mode="json")
    data.pop("owner_id", None)
    data.pop("request_key", None)
    data["attempts"] = job["attempts"] if job else 0
    if job and run.status != "completed":
        data["status"] = {
            "todo": "retrying" if job["attempts"] else "queued",
            "doing": "running",
            "failed": "failed",
            "aborted": "failed",
        }.get(job["status"], run.status)
    return data


def read_job(job_id: int | None) -> dict | None:
    if job_id is None:
        return None
    with psycopg.connect(
        get_settings().database_url.get_secret_value(),
        row_factory=psycopg.rows.dict_row,
    ) as connection:
        return connection.execute(
            "SELECT status::text, attempts FROM procrastinate_jobs WHERE id=%s", [job_id]
        ).fetchone()


@router.post("/runs")
def create_run(body: RunInput, account: AccountDep):
    run = DiagnosticRun(
        owner_id=account.id, request_key=body.request_key, delay_seconds=body.delay_seconds
    )
    # One transaction publishes both the owned resource and its queue job.
    with psycopg.connect(get_settings().database_url.get_secret_value()) as connection:
        row = connection.execute(
            "INSERT INTO diagnostic_runs "
            "(id,owner_id,request_key,status,delay_seconds,created_at,updated_at) "
            "VALUES (%s,%s,%s,%s,%s,%s,%s) "
            "ON CONFLICT (owner_id,request_key) DO NOTHING RETURNING id",
            [
                run.id,
                run.owner_id,
                run.request_key,
                run.status,
                run.delay_seconds,
                run.created_at,
                run.updated_at,
            ],
        ).fetchone()
        if row:
            run.job_id = diagnostic_job.configure(
                connection=connection, lock=f"diagnostic:{run.id}"
            ).defer(run_id=str(run.id))
            connection.execute(
                "UPDATE diagnostic_runs SET job_id=%s WHERE id=%s", [run.job_id, run.id]
            )
        else:
            previous = connection.execute(
                "SELECT id FROM diagnostic_runs WHERE owner_id=%s AND request_key=%s",
                [account.id, body.request_key],
            ).fetchone()
            if not previous:
                raise HTTPException(409, "Silakan ulangi request yang sama.")
            with Session(get_engine()) as session:
                existing = session.get(DiagnosticRun, previous[0])
                if not existing:
                    raise HTTPException(404)
                run = existing
    return serialize_run(run, read_job(run.job_id))


@router.get("/runs")
def list_runs(account: AccountDep, session: SessionDep):
    runs = session.exec(
        select(DiagnosticRun)
        .where(DiagnosticRun.owner_id == account.id)
        .order_by(col(DiagnosticRun.created_at).desc())
        .limit(30)
    ).all()
    with psycopg.connect(
        get_settings().database_url.get_secret_value(),
        row_factory=psycopg.rows.dict_row,
    ) as connection:
        jobs = connection.execute(
            "SELECT id, status::text, attempts FROM procrastinate_jobs WHERE id = ANY(%s)",
            [[run.job_id for run in runs if run.job_id is not None]],
        ).fetchall()
    by_id = {job["id"]: job for job in jobs}
    return [serialize_run(run, by_id.get(run.job_id)) for run in runs]


@router.get("/runs/{run_id}")
def get_run(run_id: UUID, account: AccountDep, session: SessionDep):
    run = session.exec(
        select(DiagnosticRun).where(
            DiagnosticRun.id == run_id,
            DiagnosticRun.owner_id == account.id,
        )
    ).first()
    if not run:
        raise HTTPException(404, "Pekerjaan tidak ditemukan.")
    return serialize_run(run, read_job(run.job_id))


@router.get("/objects")
def list_objects(account: AccountDep, session: SessionDep):
    objects = session.exec(
        select(StoredObject)
        .where(StoredObject.owner_id == account.id)
        .order_by(col(StoredObject.created_at).desc())
        .limit(30)
    ).all()
    return [
        {
            "id": obj.id,
            "filename": obj.filename,
            "content_type": obj.content_type,
            "size": obj.size,
            "created_at": obj.created_at,
        }
        for obj in objects
    ]


@router.post("/objects")
def upload_object(file: UploadFile, account: AccountDep, session: SessionDep):
    data = file.file.read(MAX_UPLOAD_BYTES + 1)
    if not data or len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(400, "Pilih file berukuran 1 byte sampai 5 MB.")
    filename = PurePath((file.filename or "upload.bin").replace("\\", "/")).name[:255]
    obj = StoredObject(
        owner_id=account.id,
        object_key=f"accounts/{account.id}/uploads/{uuid4()}",
        filename=filename or "upload.bin",
        content_type=file.content_type or "application/octet-stream",
        size=len(data),
    )
    put_object(obj.object_key, data, obj.content_type)
    try:
        session.add(obj)
        session.commit()
    except Exception:
        session.rollback()
        delete_object(obj.object_key)
        raise
    return {"id": obj.id, "filename": obj.filename, "size": obj.size}


def owned_object(object_id: UUID, account: Account, session: Session) -> StoredObject:
    obj = session.exec(
        select(StoredObject).where(
            StoredObject.id == object_id,
            StoredObject.owner_id == account.id,
        )
    ).first()
    if not obj:
        raise HTTPException(404, "File tidak ditemukan.")
    return obj


@router.get("/objects/{object_id}/download")
def object_download(object_id: UUID, account: AccountDep, session: SessionDep):
    obj = owned_object(object_id, account, session)
    return {"url": download_url(obj.object_key, obj.filename), "expires_in": 300}


@router.delete("/objects/{object_id}", status_code=204)
def object_delete(object_id: UUID, account: AccountDep, session: SessionDep):
    obj = owned_object(object_id, account, session)
    delete_object(obj.object_key)
    session.exec(
        update(DiagnosticRun)
        .where(
            col(DiagnosticRun.owner_id) == account.id,
            col(DiagnosticRun.artifact_id) == object_id,
        )
        .values(artifact_id=None)
    )
    session.delete(obj)
    session.commit()


__all__ = ["router"]
