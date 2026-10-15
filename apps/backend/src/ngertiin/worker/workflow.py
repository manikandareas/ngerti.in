"""A small, model-free workflow that exercises real checkpoint and storage boundaries."""

import json
import time
from uuid import UUID, uuid5

from langchain_core.runnables import RunnableConfig
from langgraph.checkpoint.postgres import PostgresSaver
from langgraph.func import entrypoint, task
from sqlalchemy.dialects.postgresql import insert
from sqlmodel import Session

from ngertiin.config import get_settings
from ngertiin.db import get_engine
from ngertiin.models import DiagnosticRun, StoredObject, utcnow
from ngertiin.storage import get_object, put_object


@task
def prepare_artifact(run_id: str) -> dict:
    with Session(get_engine()) as session:
        run = session.get(DiagnosticRun, UUID(run_id))
        if not run:
            raise ValueError("Diagnostic run no longer exists")
        owner_id, delay = str(run.owner_id), run.delay_seconds
    artifact_id = str(uuid5(UUID(run_id), "artifact"))
    return {
        "run_id": run_id,
        "owner_id": owner_id,
        "artifact_id": artifact_id,
        "delay_seconds": delay,
        "prepared_at": utcnow().isoformat(),
        "key": f"accounts/{owner_id}/diagnostics/{run_id}/result.json",
    }


@task
def persist_artifact(artifact: dict) -> dict:
    # The first task is checkpointed before this deliberate manual-recovery window.
    time.sleep(artifact["delay_seconds"])
    payload = json.dumps(
        {
            "message": "Web → API → Procrastinate → LangGraph → S3 → PostgreSQL berhasil.",
            "run_id": artifact["run_id"],
            "owner_id": artifact["owner_id"],
            "prepared_at": artifact["prepared_at"],
        },
        ensure_ascii=False,
        indent=2,
    ).encode()
    put_object(artifact["key"], payload, "application/json")
    if get_object(artifact["key"]) != payload:
        raise RuntimeError("Storage round-trip did not preserve the artifact")
    obj = StoredObject(
        id=UUID(artifact["artifact_id"]),
        owner_id=UUID(artifact["owner_id"]),
        object_key=artifact["key"],
        filename="diagnostic-result.json",
        content_type="application/json",
        size=len(payload),
    )
    with Session(get_engine()) as session:
        session.exec(
            insert(StoredObject)
            .values(**obj.model_dump())
            .on_conflict_do_nothing(index_elements=["id"])
        )
        session.commit()
    return artifact


def run_workflow(run_id: str) -> None:
    with Session(get_engine()) as session:
        run = session.get(DiagnosticRun, UUID(run_id))
        if not run or run.status == "completed":
            return
        run.status, run.error, run.updated_at = "running", None, utcnow()
        session.add(run)
        session.commit()

    try:
        with PostgresSaver.from_conn_string(
            get_settings().database_url.get_secret_value()
        ) as saver:

            @entrypoint(checkpointer=saver)
            def workflow(value: str) -> dict:
                return persist_artifact(prepare_artifact(value).result()).result()

            config: RunnableConfig = {"configurable": {"thread_id": f"diagnostic:{run_id}"}}
            checkpoint = saver.get_tuple(config)
            result = workflow.invoke(
                None if checkpoint is not None else run_id, config, durability="sync"
            )
        with Session(get_engine()) as session:
            run = session.get(DiagnosticRun, UUID(run_id))
            if not run:
                raise ValueError("Diagnostic run no longer exists")
            run.status, run.artifact_id, run.updated_at = (
                "completed",
                UUID(result["artifact_id"]),
                utcnow(),
            )
            session.add(run)
            session.commit()
    except Exception:
        with Session(get_engine()) as session:
            run = session.get(DiagnosticRun, UUID(run_id))
            if run:
                run.status, run.error, run.updated_at = (
                    "failed",
                    "Pekerjaan gagal. Periksa status storage dan log worker.",
                    utcnow(),
                )
                session.add(run)
                session.commit()
        raise


__all__ = ["run_workflow"]
