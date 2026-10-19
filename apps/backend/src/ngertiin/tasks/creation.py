"""Capture immutable user intent/context and atomically enqueue bounded text work."""

from uuid import UUID, uuid4

from fastapi import HTTPException

from ngertiin.chat.store import append_event, json_value, lock_account, one, owned_thread
from ngertiin.config import get_settings
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
    if inputs or specs or result_id:
        identity.update(
            inputs=inputs,
            outputs=specs,
            result_id=str(result_id),
            expected_result_revision=expected_result_revision,
        )
    digest = fingerprint(identity)
    async with store.transaction() as conn:
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
            from ngertiin.computer.permissions import requested_urls
            from ngertiin.computer.policy import snapshot as computer_policy

            requested = instruction
            if source_run:
                user_message = await one(
                    conn,
                    "SELECT parts FROM chat_messages WHERE run_id=%s AND role='user'",
                    (source_run["id"],),
                )
                requested = "\n".join(
                    p.get("text", "")
                    for p in (user_message or {}).get("parts", [])
                    if p.get("type") == "text"
                )
            computer_rules = {**computer_policy(), "allowed_urls": requested_urls(requested)}

            policy = {
                **policy,
                "version": "browser-task-work-v1",
                "timeout_seconds": 180,
                "max_calls": 24,
                "max_output_tokens": 4000,
                "computer": computer_rules,
            }
        await budget.admit(conn, owner, policy)
        captured = await input_snapshot(conn, thread_id, instruction)
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
        if not source_run:
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
                            [{"id": "text", "type": "text", "text": text}]
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
