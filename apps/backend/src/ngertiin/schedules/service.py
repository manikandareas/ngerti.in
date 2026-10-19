"""A persisted preview binds every mutation to an exact owner, revision and decision."""

from datetime import timedelta
from uuid import uuid4, uuid5

from fastapi import HTTPException

from ngertiin.async_db import transaction
from ngertiin.chat.store import json_value, lock_account, one, owned_thread
from ngertiin.config import get_settings
from ngertiin.quotas.policy import fingerprint
from ngertiin.schedules import store, timing
from ngertiin.schedules.contracts import ProposalInput, ScheduleSpec
from ngertiin.tasks.creation import input_snapshot


def require_supported(schedule, operation):
    from ngertiin.tasks.compatibility import MESSAGE, WORKFLOW_VERSION

    if schedule["workflow_version"] != WORKFLOW_VERSION and operation not in ("pause", "delete"):
        raise HTTPException(409, MESSAGE)


async def validate_inputs(conn, owner, spec: ScheduleSpec, *, required=True):
    files = []
    for item in spec.inputs:
        valid = await one(
            conn,
            "SELECT r.id,r.filename,r.revision,r.sha256 FROM file_revisions r "
            "JOIN product_files f ON f.id=r.file_id "
            "WHERE r.id=%s AND f.owner_id=%s AND f.deleted_at IS NULL AND r.status='ready'",
            (item.revision_id, owner),
        )
        if not valid and required:
            raise HTTPException(422, "Revision file tidak tersedia untuk jadwal ini.")
        if valid:
            files.append({**valid, "id": str(valid["id"]), "start": item.start, "end": item.end})
    return files


def permissions(spec: ScheduleSpec):
    scope = {
        "text": "Teks dan revision file yang dipilih; tanpa akses web atau aksi eksternal.",
        "code": "Python offline dan revision file yang dipilih; tanpa jaringan/profil login.",
        "browser": "Browser pribadi untuk instruksi/situs ini; "
        "login dan aksi tetap mengikuti approval.",
    }
    return {
        "scope": scope[spec.runtime_kind],
        "review_required": spec.review_required,
        "file_revision_ids": [str(i.revision_id) for i in spec.inputs],
        "per_run_cap": spec.per_run_cap,
        "resource_policy": "Batas runtime, akun dan global diperiksa ulang pada setiap eksekusi.",
    }


async def propose(owner, body: ProposalInput, *, source_run=None):
    identity = body.model_dump(mode="json", exclude={"request_key"})
    # Keep retries of calendar proposals created before interval support compatible.
    if identity["spec"] and identity["spec"]["interval_hours"] is None:
        identity["spec"].pop("interval_hours")
    if identity["spec"] and identity["spec"]["goal"] is None:
        identity["spec"].pop("goal")
    digest = fingerprint(identity)
    async with transaction() as conn:
        await lock_account(conn, owner)
        await owned_thread(conn, owner, body.thread_id, lock=True)
        if source_run:
            valid = await one(
                conn,
                "SELECT id FROM chat_runs WHERE id=%s AND owner_id=%s "
                "AND thread_id=%s AND lease_token=%s AND status='running' "
                "AND NOT cancel_requested FOR SHARE",
                (source_run["id"], owner, body.thread_id, source_run["lease_token"]),
            )
            if not valid:
                raise HTTPException(409, "Giliran chat tidak lagi aktif.")
        previous = await one(
            conn,
            "SELECT * FROM schedule_proposals WHERE owner_id=%s AND request_key=%s",
            (owner, body.request_key),
        )
        if previous:
            if previous["fingerprint"] != digest:
                raise HTTPException(409, "Kunci usulan sudah dipakai untuk isi berbeda.")
            return previous
        now = (await one(conn, "SELECT now() AS n"))["n"]
        pending = await one(
            conn,
            "SELECT count(*) AS n FROM schedule_proposals "
            "WHERE owner_id=%s AND status='pending' AND expires_at>now()",
            (owner,),
        )
        if pending["n"] >= 20:
            raise HTTPException(429, "Tinjau usulan jadwal yang menunggu terlebih dahulu.")
        schedule: dict = {}
        if body.operation == "create":
            if body.schedule_id or body.expected_revision or body.spec is None:
                raise HTTPException(422, "Jadwal baru memerlukan spesifikasi lengkap.")
        else:
            schedule = await store.owned(conn, owner, body.schedule_id, lock=True)
            require_supported(schedule, body.operation)
            if schedule["state"] == "deleted" or schedule["revision"] != body.expected_revision:
                raise HTTPException(
                    409, "Jadwal sudah berubah/dihapus. Muat ulang dan tinjau lagi."
                )
        if body.operation == "update" and body.spec is None:
            raise HTTPException(422, "Perubahan memerlukan spesifikasi lengkap.")
        spec = (
            body.spec
            if body.operation in ("create", "update")
            else ScheduleSpec.model_validate(schedule["spec"])
        )
        if spec is None:
            raise HTTPException(422, "Spesifikasi jadwal diperlukan.")
        goal_context = None
        if spec.goal and body.operation in ("create", "update", "resume", "run"):
            from ngertiin.goals.work import capture as capture_goal

            linked_goal = await capture_goal(conn, owner, spec.goal)
            goal_context = {
                "title": linked_goal["spec"]["title"],
                **spec.goal.model_dump(mode="json"),
            }
        if (
            body.operation in ("create", "update")
            and spec.per_run_cap > get_settings().task_budget_units
        ):
            raise HTTPException(422, "Batas per eksekusi melebihi batas Task server.")
        files = await validate_inputs(
            conn, owner, spec, required=body.operation in ("create", "update")
        )
        target = schedule["thread_id"] if schedule else body.thread_id
        target_thread = await owned_thread(conn, owner, target)
        times = timing.preview(spec, now)
        if body.operation in ("create", "update", "resume") and not times:
            raise HTTPException(422, "Waktu sudah lewat/tidak ada pada zona ini. Pilih waktu baru.")
        captured = await input_snapshot(conn, target, spec.instruction)
        if schedule and body.operation not in ("update",):
            prior = await one(
                conn,
                "SELECT input_snapshot FROM schedule_revisions "
                "WHERE schedule_id=%s AND revision=%s",
                (schedule["id"], schedule["revision"]),
            )
            captured = prior["input_snapshot"]
        preview = {
            "goal": goal_context,
            "operation": body.operation,
            "spec": spec.model_dump(mode="json"),
            "target_thread_id": str(target),
            "target_thread_title": target_thread["title"],
            "next_times": [t.isoformat() for t in times],
            "permissions": permissions(spec),
            "inputs": files,
            "timing_policy": (
                "Interval dihitung dari tanggal dan pukul mulai, termasuk lintas malam. "
                "Jarak jam tetap; perubahan DST dapat menggeser jam lokal. "
                "Waktu mulai yang berulang memakai fold pertama."
                if spec.frequency == "interval"
                else "DST: waktu yang hilang dilewati; "
                "waktu berulang dijalankan sekali (fold pertama)."
            ),
            "execution_policy": "Overlap dilewati; downtime menjalankan satu waktu terbaru. "
            "Pause/edit/hapus tidak membatalkan Task yang telah dibuat.",
        }
        return await one(
            conn,
            "INSERT INTO schedule_proposals(id,owner_id,thread_id,source_run_id,request_key,"
            "fingerprint,operation,schedule_id,expected_revision,payload,preview,expires_at) "
            "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *",
            (
                uuid4(),
                owner,
                body.thread_id,
                source_run["id"] if source_run else None,
                body.request_key,
                digest,
                body.operation,
                body.schedule_id,
                body.expected_revision,
                json_value({"spec": spec.model_dump(mode="json"), "input_snapshot": captured}),
                json_value(preview),
                now + timedelta(minutes=30),
            ),
        )


async def decide(owner, proposal_id, approved: bool):
    async with transaction() as conn:
        await lock_account(conn, owner)
        proposal = await one(
            conn,
            "SELECT *,expires_at>now() AS valid FROM schedule_proposals "
            "WHERE id=%s AND owner_id=%s FOR UPDATE",
            (proposal_id, owner),
        )
        if not proposal:
            raise HTTPException(404, "Usulan tidak ditemukan.")
        expected = "applied" if approved else "rejected"
        if proposal["status"] != "pending":
            if proposal["status"] != expected:
                raise HTTPException(409, "Usulan sudah diputuskan.")
            return proposal
        if not approved:
            return await one(
                conn,
                "UPDATE schedule_proposals SET status='rejected' WHERE id=%s RETURNING *",
                (proposal_id,),
            )
        if not proposal["valid"]:
            raise HTTPException(409, "Usulan kedaluwarsa. Minta preview baru.")
        now = (await one(conn, "SELECT now() AS n"))["n"]
        spec = ScheduleSpec.model_validate(proposal["payload"]["spec"])
        target = proposal["preview"]["target_thread_id"]
        await owned_thread(conn, owner, target, lock=True)
        op = proposal["operation"]
        if spec.goal and op in ("create", "update", "resume", "run"):
            from ngertiin.goals.work import capture as capture_goal

            await capture_goal(conn, owner, spec.goal)
        await validate_inputs(conn, owner, spec, required=op in ("create", "update"))
        schedule: dict = {}
        if op != "create":
            schedule = await store.owned(conn, owner, proposal["schedule_id"], lock=True)
            require_supported(schedule, op)
            if (
                schedule["revision"] != proposal["expected_revision"]
                or schedule["state"] == "deleted"
            ):
                raise HTTPException(409, "Revision jadwal berubah. Tinjau preview baru.")
        next_due = timing.next_time(spec, now)
        if op in ("create", "update", "resume") and not next_due:
            raise HTTPException(409, "Waktu usulan sudah lewat. Tinjau waktu baru.")
        if op == "create":
            await conn.execute("SELECT pg_advisory_xact_lock(330037)")
            counts = await one(
                conn,
                "SELECT count(*) AS total,count(*) FILTER(WHERE owner_id=%s) "
                "AS account FROM user_schedules WHERE state<>'deleted'",
                (owner,),
            )
            if counts["account"] >= 100 or counts["total"] >= 1000:
                raise HTTPException(429, "Batas jumlah jadwal tercapai.")
            schedule = await one(
                conn,
                "INSERT INTO user_schedules(id,owner_id,thread_id,spec,next_due) "
                "VALUES (%s,%s,%s,%s,%s) RETURNING *",
                (
                    uuid5(proposal_id, "schedule"),
                    owner,
                    target,
                    json_value(spec.model_dump(mode="json")),
                    next_due,
                ),
            )
        elif op != "run":
            state = {"pause": "paused", "resume": "active", "delete": "deleted"}.get(
                op, schedule["state"]
            )
            schedule = await one(
                conn,
                "UPDATE user_schedules SET revision=revision+1,state=%s,"
                "spec=%s,next_due=%s,error=NULL,updated_at=now() WHERE id=%s RETURNING *",
                (
                    state,
                    json_value(spec.model_dump(mode="json")),
                    next_due if state == "active" else None,
                    schedule["id"],
                ),
            )
        if op != "run":
            await conn.execute(
                "INSERT INTO schedule_revisions(schedule_id,revision,spec,input_snapshot) "
                "VALUES (%s,%s,%s,%s)",
                (
                    schedule["id"],
                    schedule["revision"],
                    json_value(spec.model_dump(mode="json")),
                    json_value(proposal["payload"]["input_snapshot"]),
                ),
            )
        else:
            from ngertiin.schedules.dispatch import admit

            await admit(conn, schedule, now, manual_id=uuid5(proposal_id, "manual-run"))
        return await one(
            conn,
            "UPDATE schedule_proposals SET status='applied',schedule_id=%s WHERE id=%s RETURNING *",
            (schedule["id"], proposal_id),
        )
