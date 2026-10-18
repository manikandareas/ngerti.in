"""User controls preserve previous drafts, input identity and finite work budgets."""

from uuid import UUID

from fastapi import HTTPException

from ngertiin.chat.store import one
from ngertiin.quotas.policy import fingerprint
from ngertiin.tasks import budget, store


async def cancel(owner: UUID, task_id: UUID):
    async with store.locked(owner, task_id) as (conn, task):
        if task["status"] in ("succeeded", "failed", "cancelled"):
            return await store.view(conn, task)
        await budget.abandon_calls(conn, task)
        await store.finish_execution(conn, task, "cancelled")
        await conn.execute(
            "UPDATE task_actions SET status='cancelled' WHERE task_id=%s AND "
            "status IN ('proposed','approved','executing')",
            (task_id,),
        )
        await store.change(
            conn,
            task,
            status="cancelled",
            stage="unknown" if task["stage"] == "unknown" else "cancelled",
            lease_token=None,
            resume=None,
            error=None,
        )
        await store.emit(conn, task)
        return await store.view(conn, task)


async def retry(owner: UUID, task_id: UUID, request_key: UUID):
    async with store.locked(owner, task_id) as (conn, task):
        previous = await one(
            conn,
            "SELECT command FROM task_commands WHERE task_id=%s AND request_key=%s",
            (task_id, request_key),
        )
        if previous:
            return await store.view(conn, task)
        if task["status"] in ("queued", "running"):
            return await store.view(conn, task)
        if task["status"] not in ("failed", "cancelled") or task["stage"] in (
            "rejected",
            "unknown",
            "expired",
        ):
            raise HTTPException(
                409, "Task ini tidak dapat dicoba ulang. Tinjau atau ubah draft terlebih dahulu."
            )
        if task["attempt"] >= 12:
            raise HTTPException(409, "Batas percobaan task tercapai.")
        if task["usage_units"] >= task["budget_cap"]:
            raise HTTPException(
                429, "Budget task sudah terpakai. Hasil sebelumnya tetap dapat dibuka."
            )
        await budget.admit(
            conn,
            owner,
            {**task["budget_policy"], "task_cap": task["budget_cap"] - task["usage_units"]},
            day=task["budget_day"],
        )
        await conn.execute(
            "INSERT INTO task_commands(task_id,request_key,command) VALUES (%s,%s,'retry')",
            (task_id, request_key),
        )
        await conn.execute(
            "UPDATE task_actions SET status=CASE "
            "WHEN decided_at IS NOT NULL OR NOT %s THEN 'approved' ELSE 'proposed' END "
            "WHERE task_id=%s AND revision=%s AND status='cancelled'",
            (task["review_required"], task_id, task["revision"]),
        )
        complete_draft = await one(
            conn,
            "SELECT revision FROM task_revisions WHERE task_id=%s AND revision=%s",
            (task_id, task["revision"]),
        )
        await store.change(
            conn,
            task,
            status="queued",
            stage="review" if complete_draft else "queued",
            lease_token=None,
            error=None,
        )
        await store.enqueue(conn, task)
        await store.emit(conn, task)
        return await store.view(conn, task)


async def revise(owner: UUID, task_id: UUID, revision: int, draft: str, request_key: UUID):
    draft = draft.strip()
    if not draft or len(draft) > 24000:
        raise HTTPException(422, "Draft harus berisi 1–24000 karakter.")
    async with store.locked(owner, task_id) as (conn, task):
        if task.get("output_spec"):
            from ngertiin.files.validation import outputs

            try:
                outputs(draft, task["output_spec"])
            except ValueError as error:
                raise HTTPException(422, str(error)) from error
        previous = await one(
            conn,
            "SELECT fingerprint FROM task_revisions WHERE task_id=%s AND request_key=%s",
            (task_id, request_key),
        )
        if previous:
            if previous["fingerprint"] != fingerprint(draft):
                raise HTTPException(409, "Kunci revisi sudah dipakai untuk isi berbeda.")
            return await store.view(conn, task)
        if (
            task["revision"] != revision
            or task["status"] not in ("waiting_user", "failed", "cancelled")
            or task["stage"] == "unknown"
        ):
            raise HTTPException(409, "Task sudah berubah. Muat ulang sebelum mengedit draft.")
        if revision >= 6:
            raise HTTPException(409, "Batas revisi task tercapai.")
        increment = (
            0 if task["status"] == "waiting_user" else task["budget_cap"] - task["usage_units"]
        )
        await budget.admit(
            conn,
            owner,
            {**task["budget_policy"], "task_cap": increment},
            day=task["budget_day"],
        )
        await conn.execute(
            "UPDATE task_actions SET status='cancelled' WHERE task_id=%s AND "
            "status IN ('proposed','approved','executing')",
            (task_id,),
        )
        await store.change(
            conn,
            task,
            revision=revision + 1,
            draft=draft,
            status="queued",
            stage="review",
            lease_token=None,
            resume=None,
            error=None,
        )
        await store.persist_revision(conn, task, request_key)
        await store.enqueue(conn, task)
        await store.emit(conn, task)
        return await store.view(conn, task)
