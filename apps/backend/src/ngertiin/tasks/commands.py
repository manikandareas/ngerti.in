"""User controls preserve previous drafts, input identity and finite work budgets."""

from uuid import UUID

from fastapi import HTTPException

from ngertiin.chat.store import one
from ngertiin.quotas.policy import fingerprint
from ngertiin.tasks import budget, store


async def cancel(owner: UUID, task_id: UUID):
    workspace = None
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
            stage=task["stage"]
            if task["stage"] in ("unknown", "sandbox_unknown", "computer_unknown")
            else "cancelled",
            lease_token=None,
            resume=None,
            error=None,
        )
        await store.emit(conn, task)
        if task.get("runtime_kind") == "browser":
            from ngertiin.computer.jobs import cleanup_task as cleanup_computer

            workspace = await one(
                conn,
                "UPDATE browser_workspaces SET control='handoff',"
                "control_version=control_version+1 WHERE active_task_id=%s "
                "AND state='ready' RETURNING *",
                (task_id,),
            )

            await cleanup_computer.configure(connection=conn).defer_async(
                task_id=str(task_id), owner_id=str(owner)
            )
        if task.get("runtime_kind") == "code":
            from ngertiin.sandbox.jobs import cleanup_task

            await cleanup_task.configure(connection=conn).defer_async(
                task_id=str(task_id), owner_id=str(owner)
            )
        result = await store.view(conn, task)
    if workspace:
        from ngertiin.computer.policy import get_runtime

        runtime = get_runtime(workspace["provider"])
        if hasattr(runtime, "control"):
            try:
                await runtime.control(workspace)
            except Exception:
                async with store.locked(owner, task_id) as (conn, task):
                    current = await one(
                        conn,
                        "SELECT id FROM browser_workspaces WHERE active_task_id=%s",
                        (task_id,),
                    )
                    if current:
                        await store.change(
                            conn,
                            task,
                            stage="computer_unknown",
                            error="Stop tersimpan; penghentian komputer sedang diperiksa.",
                        )
                        await store.emit(conn, task)
                    result = await store.view(conn, task)
    return result


async def retry(owner: UUID, task_id: UUID, request_key: UUID):
    async with store.locked(owner, task_id) as (conn, task):
        from ngertiin.tasks.compatibility import require_supported

        require_supported(task)
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
        if store.exhausted(task):
            raise HTTPException(409, "Batas percobaan task tercapai.")
        if (
            not budget.metered_browser(task["budget_policy"])
            and task["usage_units"] >= task["budget_cap"]
        ):
            raise HTTPException(
                429, "Budget task sudah terpakai. Hasil sebelumnya tetap dapat dibuka."
            )
        if task.get("runtime_kind") == "code":
            from ngertiin.sandbox.contracts import RuntimePending
            from ngertiin.sandbox.store import require_reconciled

            try:
                await require_reconciled(conn, task)
            except RuntimePending as error:
                raise HTTPException(409, str(error)) from error
        if task.get("runtime_kind") == "browser":
            active = await one(
                conn,
                "SELECT id FROM browser_workspaces WHERE active_task_id=%s AND state<>'deleted'",
                (task_id,),
            )
            unknown = await one(
                conn,
                "SELECT id FROM computer_steps WHERE task_id=%s "
                "AND state='unknown' AND kind<>'observe' LIMIT 1",
                (task_id,),
            )
            if active or unknown or task["stage"] == "computer_unknown_resolved":
                raise HTTPException(
                    409, "Periksa/hentikan sesi sebelumnya; aksi yang belum pasti tidak diulang."
                )
        if task.get("goal_id"):
            from ngertiin.goals.contracts import GoalRef
            from ngertiin.goals.work import admit as admit_goal

            await admit_goal(
                conn,
                owner,
                GoalRef(id=task["goal_id"], revision=task["goal_revision"]),
                {"task_cap": max(0, task["budget_cap"] - task["usage_units"])},
                task=task,
            )
        await budget.admit(
            conn,
            owner,
            {**task["budget_policy"], "task_cap": max(0, task["budget_cap"] - task["usage_units"])},
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
        from ngertiin.tasks.compatibility import require_supported

        require_supported(task)
        if task.get("output_spec"):
            from ngertiin.files.validation import outputs

            try:
                value = outputs(
                    draft,
                    task["output_spec"],
                    allow_staged=task.get("runtime_kind") in ("code", "browser"),
                )
                if task.get("runtime_kind") in ("code", "browser"):
                    from ngertiin.sandbox.outputs import resolve

                    await resolve(conn, task, value)
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
        if task.get("runtime_kind") == "browser" and task["stage"] not in ("review", "draft_ready"):
            raise HTTPException(409, "Selesaikan/hentikan sesi browser sebelum mengedit hasil.")
        if (
            task["revision"] != revision
            or task["status"] not in ("waiting_user", "failed", "cancelled")
            or task["stage"]
            in ("unknown", "sandbox_unknown", "computer_unknown", "computer_unknown_resolved")
        ):
            raise HTTPException(409, "Task sudah berubah. Muat ulang sebelum mengedit draft.")
        if revision >= 6:
            raise HTTPException(409, "Batas revisi task tercapai.")
        increment = (
            0
            if task["status"] == "waiting_user"
            else max(0, task["budget_cap"] - task["usage_units"])
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
