"""Short, consistently ordered transactions own tasks and their public projections."""

from contextlib import asynccontextmanager
from uuid import UUID, uuid4

from fastapi import HTTPException
from psycopg import sql

from ngertiin.async_db import transaction
from ngertiin.chat.store import append_event, lock_account, one, owned_thread

PUBLIC_COLUMNS = (
    "id",
    "thread_id",
    "source_run_id",
    "title",
    "instruction",
    "revision",
    "review_required",
    "status",
    "stage",
    "draft",
    "result",
    "error",
    "attempt",
    "model_calls",
    "budget_cap",
    "usage_units",
    "budget_policy",
    "created_at",
    "updated_at",
    "output_spec",
    "result_id",
    "runtime_kind",
    "schedule_occurrence_id",
    "goal_id",
    "goal_revision",
)
MUTABLE = {
    "status",
    "stage",
    "draft",
    "result",
    "error",
    "resume",
    "lease_token",
    "attempt",
    "revision",
    "model_calls",
    "usage_units",
    "job_id",
}


class StaleExecution(Exception):
    """A stopped, revised, or replaced execution has no remaining write authority."""


@asynccontextmanager
async def locked(owner: UUID, task_id: UUID):
    async with transaction() as conn:
        task = await one(
            conn, "SELECT * FROM background_tasks WHERE id=%s AND owner_id=%s", (task_id, owner)
        )
        if not task:
            raise HTTPException(404, "Task tidak ditemukan.")
        await lock_account(conn, owner)
        await owned_thread(conn, owner, task["thread_id"], lock=True)
        task = await one(conn, "SELECT * FROM background_tasks WHERE id=%s FOR UPDATE", (task_id,))
        yield conn, task


async def owned(conn, owner: UUID, task_id: UUID):
    task = await one(
        conn, "SELECT * FROM background_tasks WHERE id=%s AND owner_id=%s", (task_id, owner)
    )
    if not task:
        raise HTTPException(404, "Task tidak ditemukan.")
    return task


def fence(task: dict, execution: dict):
    if (
        task["status"] != "running"
        or task["lease_token"] != execution["lease_token"]
        or task["revision"] != execution["revision"]
    ):
        raise StaleExecution()


async def change(conn, task: dict, **values):
    if not values or not values.keys() <= MUTABLE:
        raise ValueError("Unsupported task mutation")
    assignments = sql.SQL(",").join(sql.SQL("{}=%s").format(sql.Identifier(key)) for key in values)
    row = await (
        await conn.execute(
            sql.SQL(
                "UPDATE background_tasks SET {},updated_at=now() WHERE id=%s RETURNING *"
            ).format(assignments),
            (*values.values(), task["id"]),
        )
    ).fetchone()
    task.update(row)
    from ngertiin.usage import ledger as compute

    key = f"task:{task['id']}"
    if values.get("status") in ("queued", "running"):
        await compute.reopen(conn, task["owner_id"], key)
    elif values.get("status") in ("succeeded", "failed", "cancelled"):
        await compute.finish(
            conn, task["owner_id"], key, refund=not (task.get("draft") or task.get("result"))
        )


async def view(conn, task: dict, *, detail: bool = False):
    result = {key: task[key] for key in PUBLIC_COLUMNS}
    from ngertiin.files.inputs import rows as file_rows

    file_values = await file_rows(conn, task)
    result["inputs"] = [
        {
            k: row[k]
            for k in (
                "revision_id",
                "file_id",
                "filename",
                "revision",
                "sha256",
                "selection",
                "file_status",
                "extraction_status",
                "error",
                "reserved_pages",
                "charged_pages",
                "extraction_model",
            )
        }
        for row in file_values
    ]
    result["action"] = await one(
        conn,
        "SELECT id,revision,kind,target_id,content_hash,content,status,expires_at,outcome "
        "FROM task_actions WHERE task_id=%s AND revision=%s",
        (task["id"], task["revision"]),
    )
    if task.get("runtime_kind") == "code":
        from ngertiin.sandbox.store import summary

        result["sandbox_sessions"] = await summary(conn, task)
    if task.get("runtime_kind") == "browser":
        from ngertiin.computer.store import summary as computer_summary

        result["computer"] = await computer_summary(conn, task)
    if detail:
        result["input_snapshot"] = task["input_snapshot"]
        result["executions"] = await (
            await conn.execute(
                "SELECT "
                "id,revision,attempt,status,draft,started_at,finished_at FROM task_executions "
                "WHERE task_id=%s ORDER BY attempt",
                (task["id"],),
            )
        ).fetchall()
        result["cost_events"] = await (
            await conn.execute(
                "SELECT id,execution_id,provider,model,policy_version,reserved_units,charged_units,"
                "state,usage,created_at FROM task_cost_events WHERE task_id=%s ORDER BY created_at",
                (task["id"],),
            )
        ).fetchall()
    return result


async def emit(conn, task: dict):
    from ngertiin.files.results import sync_status
    from ngertiin.proactivity.store import touch

    await sync_status(conn, task)
    await touch(conn, task["owner_id"])
    await append_event(
        conn, task["thread_id"], {"type": "task.upsert", "task": await view(conn, task)}
    )


async def listing(owner: UUID, thread_id: UUID | None = None):
    async with transaction() as conn:
        if thread_id:
            await owned_thread(conn, owner, thread_id)
        rows = await (
            await conn.execute(
                "SELECT * FROM background_tasks WHERE owner_id=%s "
                "AND (%s::uuid IS NULL OR thread_id=%s) "
                "ORDER BY (status IN ('queued','running','waiting_user')) "
                "DESC,created_at DESC LIMIT 50",
                (owner, thread_id, thread_id),
            )
        ).fetchall()
        return [await view(conn, row) for row in rows]


async def detail(owner: UUID, task_id: UUID):
    async with transaction() as conn:
        return await view(conn, await owned(conn, owner, task_id), detail=True)


async def enqueue(conn, task: dict):
    from ngertiin.tasks.jobs import task_job

    if task["attempt"] >= (40 if task.get("runtime_kind") == "browser" else 12):
        raise HTTPException(409, "Batas execution task tercapai. Draft tetap dapat dibuka.")
    job_id = await task_job.configure(connection=conn, lock=f"task:{task['id']}").defer_async(
        task_id=str(task["id"])
    )
    await change(conn, task, job_id=job_id)


async def finish_execution(conn, task: dict, status: str):
    await conn.execute(
        "UPDATE task_executions SET status=%s,draft=%s,finished_at=now() "
        "WHERE task_id=%s AND status='running'",
        (status, task["draft"], task["id"]),
    )


async def claim(task_id: UUID):
    async with transaction() as conn:
        row = await one(conn, "SELECT owner_id FROM background_tasks WHERE id=%s", (task_id,))
    if not row:
        return None
    async with locked(row["owner_id"], task_id) as (conn, task):
        if task["status"] != "queued":
            return None
        if task["attempt"] >= (40 if task.get("runtime_kind") == "browser" else 12):
            await change(
                conn,
                task,
                status="failed",
                stage="failed",
                lease_token=None,
                error="Batas execution task tercapai. Draft tetap tersimpan.",
            )
            await emit(conn, task)
            return None
        token, execution_id = uuid4(), uuid4()
        await change(conn, task, status="running", lease_token=token, attempt=task["attempt"] + 1)
        await conn.execute(
            "INSERT INTO task_executions(id,task_id,revision,attempt,lease_token,status) "
            "VALUES (%s,%s,%s,%s,%s,'running')",
            (execution_id, task_id, task["revision"], task["attempt"], token),
        )
        await emit(conn, task)
        return {**task, "execution_id": execution_id}


async def progress(execution: dict, stage: str, *, draft: str | None = None):
    from ngertiin.memory.invalidation import ensure

    if not await ensure(execution):
        raise StaleExecution()
    async with locked(execution["owner_id"], execution["id"]) as (conn, task):
        fence(task, execution)
        values = {"stage": stage}
        if draft is not None:
            values["draft"] = draft[:24000]
        await change(conn, task, **values)
        await emit(conn, task)


async def fail(execution: dict, error: str):
    async with locked(execution["owner_id"], execution["id"]) as (conn, task):
        fence(task, execution)
        await finish_execution(conn, task, "failed")
        await change(conn, task, status="failed", stage="failed", error=error, lease_token=None)
        await emit(conn, task)


async def release_waiting(conn, task: dict):
    await finish_execution(conn, task, "waiting_user")
    await change(conn, task, status="waiting_user", stage="review", lease_token=None, resume=None)
    await emit(conn, task)


async def persist_revision(conn, task: dict, request_key: UUID):
    from ngertiin.quotas.policy import fingerprint

    await conn.execute(
        "INSERT INTO task_revisions(task_id,revision,draft,request_key,fingerprint) "
        "VALUES (%s,%s,%s,%s,%s) ON CONFLICT (task_id,revision) DO NOTHING",
        (task["id"], task["revision"], task["draft"], request_key, fingerprint(task["draft"])),
    )


async def initial_graph_input(execution: dict):
    return {"prepared": execution["stage"] == "review", "task_id": str(execution["id"])}
