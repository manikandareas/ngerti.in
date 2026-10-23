"""Capture immutable user intent/context and atomically enqueue bounded text work."""

from contextlib import nullcontext
from uuid import UUID, uuid4

from fastapi import HTTPException

from ngertiin.chat.store import append_event, json_value, lock_account, one, owned_thread
from ngertiin.config import get_settings
from ngertiin.goals.contracts import GoalRef
from ngertiin.quotas import commit, reserve
from ngertiin.quotas.policy import fingerprint
from ngertiin.tasks import budget, store
from ngertiin.tasks.policy import snapshot


async def input_snapshot(conn, thread_id, instruction: str):
    rows = await (
        await conn.execute(
            "SELECT id,role,parts FROM chat_messages WHERE thread_id=%s AND status='complete' "
            "ORDER BY position DESC LIMIT 20",
            (thread_id,),
        )
    ).fetchall()
    messages, remaining = [], 8000
    for row in rows:
        text = "\n".join(part.get("text", "") for part in row["parts"] if part["type"] == "text")
        text = text.encode("utf-8")[:remaining].decode("utf-8", errors="ignore")
        if text:
            messages.append({"id": str(row["id"]), "role": row["role"], "text": text})
            remaining -= len(text.encode("utf-8"))
    return {"instruction": instruction, "messages": list(reversed(messages))}


async def create(
    owner: UUID,
    thread_id: UUID,
    request_key: UUID,
    instruction: str,
    review_required: bool,
    *,
    source_run: dict | None = None,
    inputs: list[dict] | None = None,
    outputs: list[dict] | None = None,
    result_id: UUID | None = None,
    expected_result_revision: int | None = None,
    runtime_kind: str = "text",
    connection=None,
    scheduled: dict | None = None,
    goal: GoalRef | None = None,
):
    from ngertiin.files import inputs as file_inputs
    from ngertiin.files import results
    from ngertiin.files.contracts import output_specs

    inputs = inputs or []
    if runtime_kind not in ("text", "code", "browser"):
        raise HTTPException(422, "Jenis pekerjaan tidak tersedia.")
    if runtime_kind == "browser":
        from ngertiin.computer.policy import get_runtime as computer_runtime

        try:
            computer_runtime()
        except ValueError as error:
            raise HTTPException(503, str(error)) from error
        if inputs:
            raise HTTPException(
                422,
                "Task browser memakai instruksi dan situs; olah lampiran melalui Task Python/teks.",
            )
    if runtime_kind == "code":
        from ngertiin.sandbox.policy import get_runtime

        try:
            get_runtime()  # Configuration only; provisioning happens in the worker.
        except ValueError as error:
            raise HTTPException(503, "Komputasi belum tersedia. Draft tetap tersimpan.") from error
    try:
        specs = output_specs(
            outputs
            or (
                [{"filename": "hasil.md", "format": "md"}]
                if inputs or runtime_kind in ("code", "browser")
                else []
            )
        )
    except ValueError as error:
        raise HTTPException(422, str(error)) from error
    if result_id and not specs:
        raise HTTPException(422, "Pembaruan hasil memerlukan format output.")
    instruction = instruction.strip()
    if not instruction or len(instruction.encode("utf-8")) > 6000:
        raise HTTPException(422, "Instruksi task harus berisi 1–6000 byte teks.")
    identity = {
        "thread_id": str(thread_id),
        "instruction": instruction,
        "review_required": review_required,
    }
    if runtime_kind in ("code", "browser"):
        identity["runtime_kind"] = runtime_kind
    if goal:
        identity["goal"] = goal.model_dump(mode="json")
    if inputs or specs or result_id:
        identity.update(
            inputs=inputs,
            outputs=specs,
            result_id=str(result_id),
            expected_result_revision=expected_result_revision,
        )
    digest = fingerprint(identity)
    async with nullcontext(connection) if connection is not None else store.transaction() as conn:
        await lock_account(conn, owner)
        thread = await owned_thread(conn, owner, thread_id, lock=True)
        previous = await one(
            conn,
            "SELECT * FROM background_tasks WHERE owner_id=%s AND request_key=%s",
            (owner, request_key),
        )
        if previous:
            if previous["fingerprint"] != digest:
                raise HTTPException(409, "Kunci task sudah dipakai untuk instruksi berbeda.")
            return await store.view(conn, previous)
        if not get_settings().openai_api_key.get_secret_value():
            raise HTTPException(503, "Agent belum tersedia. Coba lagi nanti.")
        if source_run:
            valid = await one(
                conn,
                "SELECT id FROM chat_runs WHERE id=%s AND owner_id=%s AND thread_id=%s "
                "AND lease_token=%s AND status='running' AND NOT cancel_requested FOR SHARE",
                (source_run["id"], owner, thread_id, source_run["lease_token"]),
            )
            if not valid:
                raise store.StaleExecution()
        if result_id:
            parent = await one(
                conn,
                "SELECT t.goal_id,t.goal_revision FROM product_results r "
                "JOIN background_tasks t ON t.id=r.active_task_id "
                "WHERE r.id=%s AND r.owner_id=%s AND r.deleted_at IS NULL",
                (result_id, owner),
            )
            if parent and parent["goal_id"]:
                inherited = GoalRef(id=parent["goal_id"], revision=parent["goal_revision"])
                if goal and goal != inherited:
                    raise HTTPException(409, "Pembaruan hasil harus memakai target tujuan asal.")
                goal = inherited
        policy, task_id = snapshot(), uuid4()
        if inputs or specs:
            policy = {**policy, "version": "file-task-work-v1", "max_input_bytes": 48000}
        if runtime_kind == "code":
            from ngertiin.sandbox.policy import snapshot as sandbox_policy

            policy = {
                **policy,
                "version": "code-task-work-v1",
                "timeout_seconds": 300,
                "max_input_bytes": 48000,
                "sandbox": sandbox_policy(),
            }
        if runtime_kind == "browser":
            from ngertiin.computer.policy import snapshot as computer_policy

            computer_rules = computer_policy()

            policy = {
                **policy,
                "version": "browser-task-work-v1",
                "timeout_seconds": 180,
                "max_calls": get_settings().computer_model_calls,
                "max_output_tokens": 4000,
                "computer": computer_rules,
            }
        if runtime_kind == "browser" and not scheduled and not goal:
            policy["unit"] = "metered_browser_work"
        if scheduled:
            policy["task_cap"] = min(policy["task_cap"], scheduled["per_run_cap"])
        goal_context = None
        if goal:
            from ngertiin.goals.work import admit as admit_goal

            goal_context = await admit_goal(conn, owner, goal, policy)
        await budget.admit(conn, owner, policy)
        captured = (
            {**scheduled["input_snapshot"], "schedule": scheduled["identity"]}
            if scheduled
            else await input_snapshot(conn, thread_id, instruction)
        )
        from ngertiin.persona.store import current as current_persona

        captured["persona"] = (
            source_run["profile"] if source_run else await current_persona(conn, owner)
        )
        if goal_context:
            captured["goal"] = goal_context
        title = " ".join(instruction.split())
        if len(title) > 100:
            title = title[:96].rsplit(" ", 1)[0] + "…"
        task = await one(
            conn,
            "INSERT INTO "
            "background_tasks(id,owner_id,thread_id,source_run_id,request_key,fingerprint,"
            "title,instruction,input_snapshot,review_required,budget_cap,budget_policy) "
            "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *",
            (
                task_id,
                owner,
                thread_id,
                source_run["id"] if source_run else None,
                request_key,
                digest,
                title,
                instruction,
                json_value(captured),
                review_required,
                policy["task_cap"],
                json_value(policy),
            ),
        )
        if runtime_kind in ("code", "browser"):
            await conn.execute(
                "UPDATE background_tasks SET runtime_kind=%s WHERE id=%s", (runtime_kind, task_id)
            )
            task["runtime_kind"] = runtime_kind
        if goal:
            await conn.execute(
                "UPDATE background_tasks SET goal_id=%s,goal_revision=%s WHERE id=%s",
                (goal.id, goal.revision, task_id),
            )
            task.update(goal_id=goal.id, goal_revision=goal.revision)
        if scheduled:
            await conn.execute(
                "UPDATE background_tasks SET schedule_occurrence_id=%s WHERE id=%s",
                (scheduled["occurrence_id"], task_id),
            )
            task["schedule_occurrence_id"] = scheduled["occurrence_id"]
        captured_files = await file_inputs.capture(conn, owner, task_id, inputs)
        if specs:
            rid = await results.bind(conn, task, result_id, expected_result_revision)
            captured["files"] = captured_files
            if result_id:
                prior = await results.detail(conn, owner, rid, expected_result_revision)
                if not prior["selected"] or prior["selected"]["status"] != "ready":
                    raise HTTPException(409, "Revision hasil sebelumnya belum siap.")
                captured["previous_result"] = {
                    "result_id": str(rid),
                    "revision": prior["selected"]["revision"],
                    "manifest": prior["selected"]["manifest"],
                }
            await conn.execute(
                "UPDATE background_tasks SET "
                "output_spec=%s,result_id=%s,input_snapshot=%s WHERE id=%s",
                (json_value(specs), rid, json_value(captured), task_id),
            )
            task.update(output_spec=specs, result_id=rid, input_snapshot=captured)
        from ngertiin.usage import ledger as compute_ledger
        from ngertiin.usage.policy import task_estimate

        ocr = await one(
            conn,
            "SELECT COALESCE(sum(r.page_count),0) AS pages FROM file_extractions e "
            "JOIN file_revisions r ON r.id=e.revision_id WHERE e.id IN "
            "(SELECT extraction_id FROM task_file_inputs WHERE task_id=%s) "
            "AND e.policy->>'provider'='mistral' AND e.status='queued'",
            (task_id,),
        )
        from ngertiin.usage.prices import ceiling

        compute_period = await compute_ledger.period(conn, owner)
        compute_cap = task_estimate(
            policy, compute_period["policy"]["prices"].get(policy["model"])
        ) + ceiling(ocr["pages"] * get_settings().mistral_ocr_usd_per_1000_pages * 1000)
        await compute_ledger.open_work(
            conn,
            owner,
            f"task:{task_id}",
            "task",
            title,
            compute_cap,
            task=task_id,
            thread=thread_id,
        )
        if not source_run and not scheduled:
            allocation = await reserve(conn, owner, "chat", f"task-input:{task_id}", 1, digest)
            for index, (role, text) in enumerate(
                (
                    ("user", instruction),
                    (
                        "assistant",
                        "Task sudah dibuat. Kamu bisa melanjutkan percakapan sambil menunggu.",
                    ),
                )
            ):
                message = await one(
                    conn,
                    "INSERT INTO chat_messages(id,thread_id,role,parts,status,position) "
                    "VALUES (%s,%s,%s,%s,'complete',%s) RETURNING "
                    "id,role,parts,status,run_id,position",
                    (
                        uuid4(),
                        thread_id,
                        role,
                        json_value(
                            [{"id": "text", "type": "text", "text": text, "task_id": str(task_id)}]
                            + (
                                [
                                    {"id": f"file:{f['revision_id']}", "type": "file", **f}
                                    for f in captured_files
                                ]
                                if role == "user"
                                else []
                            )
                        ),
                        thread["seq"] + index + 1,
                    ),
                )
                await append_event(conn, thread_id, {"type": "message.upsert", "message": message})
            await commit(conn, owner, allocation, "task_public_card")
        await store.enqueue(conn, task)
        await store.emit(conn, task)
        return await store.view(conn, task)
