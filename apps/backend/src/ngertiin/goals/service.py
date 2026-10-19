"""User-reviewed goal changes are revision fenced, idempotent and free of inference calls."""

from datetime import timedelta
from uuid import uuid4, uuid5

from fastapi import HTTPException

from ngertiin.async_db import transaction
from ngertiin.chat.store import json_value, lock_account, one, owned_thread
from ngertiin.goals import evidence, store
from ngertiin.goals.contracts import EvidenceInput, GoalSpec, ProposalInput
from ngertiin.quotas.policy import fingerprint

POLICY = (
    "Menyimpan tujuan tidak menjalankan Task atau membuat jadwal. "
    "Jeda/selesai/arsip menahan eksekusi jadwal terkait berikutnya; Task yang sudah dibuat "
    "tetap memakai target lama dan dapat dihentikan terpisah. Perubahan target memerlukan "
    "peninjauan ulang jadwal. Melanjutkan tidak mengejar semua waktu yang terlewat."
)


def changes_plan(goal, spec):
    return goal is not None and any(
        goal["spec"][key] != getattr(spec, key) for key in ("target", "criteria", "horizon")
    )


async def validate(conn, owner, body, goal):
    op = body.operation
    if op == "create":
        if body.goal_id or body.expected_revision or not body.spec:
            raise HTTPException(422, "Tujuan baru memerlukan spesifikasi lengkap.")
    elif not goal or goal["revision"] != body.expected_revision:
        raise HTTPException(409, "Tujuan sudah berubah. Muat ulang dan tinjau lagi.")
    if op == "update" and not body.spec:
        raise HTTPException(422, "Perubahan target memerlukan spesifikasi lengkap.")
    if op not in ("create", "update") and body.spec:
        raise HTTPException(422, "Operasi ini tidak mengubah target.")
    if bool(body.evidence) != (op == "evidence"):
        raise HTTPException(422, "Operasi bukti memerlukan satu bukti yang ditinjau.")
    if goal:
        if op in ("update", "evidence") and goal["state"] in ("completed", "archived"):
            raise HTTPException(409, "Lanjutkan tujuan sebelum mengubah target/bukti.")
        if op == "pause" and goal["state"] != "active":
            raise HTTPException(409, "Hanya tujuan aktif yang dapat dijeda.")
        if op == "resume" and goal["state"] == "active":
            raise HTTPException(409, "Tujuan sudah aktif.")
        if op == "archive" and goal["state"] == "archived":
            raise HTTPException(409, "Tujuan sudah diarsipkan.")
        if op == "complete":
            rows = await evidence.current(conn, owner, goal)
            if goal["state"] not in ("active", "paused") or sum(
                e["state"] == "met" and e["available"] for e in rows
            ) != len(goal["spec"]["criteria"]):
                raise HTTPException(409, "Tinjau bukti yang sah untuk seluruh kriteria dahulu.")
    spec = body.spec or GoalSpec.model_validate(goal["spec"])
    if op == "update":
        spent = await store.budget(conn, goal["id"])
        if spec.budget_cap < spent["committed"]:
            raise HTTPException(409, "Batas tujuan lebih kecil dari penggunaan/reservasi berjalan.")
    source = None
    if body.evidence:
        if body.evidence.criterion >= len(spec.criteria):
            raise HTTPException(422, "Kriteria tidak ditemukan pada target ini.")
        source = await evidence.source(conn, owner, goal, body.evidence)
        if not await evidence.available(conn, owner, source):
            raise HTTPException(409, "Sumber bukti tidak lagi tersedia.")
    return spec, source


async def propose(owner, body: ProposalInput, *, source_run=None):
    digest = fingerprint(body.model_dump(mode="json", exclude={"request_key"}))
    async with transaction() as conn:
        await lock_account(conn, owner)
        await owned_thread(conn, owner, body.thread_id, lock=True)
        if source_run:
            valid = await one(
                conn,
                "SELECT id FROM chat_runs WHERE id=%s AND owner_id=%s AND thread_id=%s "
                "AND lease_token=%s AND status='running' AND NOT cancel_requested FOR SHARE",
                (source_run["id"], owner, body.thread_id, source_run["lease_token"]),
            )
            if not valid:
                raise HTTPException(409, "Giliran chat tidak lagi aktif.")
        previous = await one(
            conn,
            "SELECT * FROM goal_proposals WHERE owner_id=%s AND request_key=%s",
            (owner, body.request_key),
        )
        if previous:
            if previous["fingerprint"] != digest:
                raise HTTPException(409, "Kunci usulan sudah dipakai untuk isi berbeda.")
            return previous
        pending = await one(
            conn,
            "SELECT count(*) AS n FROM goal_proposals WHERE owner_id=%s "
            "AND status='pending' AND expires_at>now()",
            (owner,),
        )
        if pending["n"] >= 20:
            raise HTTPException(429, "Tinjau usulan tujuan yang menunggu terlebih dahulu.")
        goal = await store.owned(conn, owner, body.goal_id, lock=True) if body.goal_id else None
        spec, source = await validate(conn, owner, body, goal)
        now = (await one(conn, "SELECT now() AS n"))["n"]
        preview = {
            "plan_changed": body.operation == "update" and changes_plan(goal, spec),
            "operation": body.operation,
            "spec": spec.model_dump(mode="json"),
            "previous_spec": goal["spec"] if goal else None,
            "goal_revision": goal["revision"] if goal else None,
            "plan_revision": goal["plan_revision"] if goal else 1,
            "state": goal["state"] if goal else "active",
            "policy": POLICY,
            "evidence": body.evidence.model_dump(mode="json") if body.evidence else None,
            "source": source,
        }
        return await one(
            conn,
            "INSERT INTO goal_proposals(id,owner_id,thread_id,source_run_id,request_key,"
            "fingerprint,operation,goal_id,expected_revision,payload,preview,expires_at) "
            "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *",
            (
                uuid4(),
                owner,
                body.thread_id,
                source_run["id"] if source_run else None,
                body.request_key,
                digest,
                body.operation,
                body.goal_id,
                body.expected_revision,
                json_value(body.model_dump(mode="json")),
                json_value(preview),
                now + timedelta(minutes=30),
            ),
        )


async def decide(owner, proposal_id, approved):
    async with transaction() as conn:
        await lock_account(conn, owner)
        proposal = await one(
            conn,
            "SELECT *,expires_at>now() AS valid FROM goal_proposals "
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
                "UPDATE goal_proposals SET status='rejected' WHERE id=%s RETURNING *",
                (proposal_id,),
            )
        if not proposal["valid"]:
            raise HTTPException(409, "Usulan kedaluwarsa. Tinjau preview baru.")
        body = ProposalInput.model_validate(proposal["payload"])
        await owned_thread(conn, owner, body.thread_id, lock=True)
        goal = await store.owned(conn, owner, body.goal_id, lock=True) if body.goal_id else None
        spec, source = await validate(conn, owner, body, goal)
        if source != proposal["preview"]["source"]:
            raise HTTPException(409, "Sumber bukti berubah. Tinjau preview baru.")
        op = body.operation
        if op == "create":
            count = await one(
                conn, "SELECT count(*) AS n FROM user_goals WHERE owner_id=%s", (owner,)
            )
            if count["n"] >= 100:
                raise HTTPException(429, "Batas 100 tujuan per akun tercapai.")
            goal = await one(
                conn,
                "INSERT INTO user_goals(id,owner_id,thread_id,spec) "
                "VALUES (%s,%s,%s,%s) RETURNING *",
                (
                    uuid5(proposal_id, "goal"),
                    owner,
                    body.thread_id,
                    json_value(spec.model_dump(mode="json")),
                ),
            )
        else:
            assert goal is not None  # validate() rejects missing/stale non-create targets.
            state = {
                "pause": "paused",
                "resume": "active",
                "complete": "completed",
                "archive": "archived",
            }.get(op, goal["state"])
            goal = await one(
                conn,
                "UPDATE user_goals SET revision=revision+1,"
                "plan_revision=CASE WHEN %s THEN revision+1 ELSE plan_revision END,"
                "state=%s,spec=%s,updated_at=now() WHERE id=%s RETURNING *",
                (
                    op == "update" and changes_plan(goal, spec),
                    state,
                    json_value(spec.model_dump(mode="json")),
                    goal["id"],
                ),
            )
        await conn.execute(
            "INSERT INTO goal_revisions(goal_id,revision,plan_revision,state,spec,operation) "
            "VALUES (%s,%s,%s,%s,%s,%s)",
            (
                goal["id"],
                goal["revision"],
                goal["plan_revision"],
                goal["state"],
                json_value(goal["spec"]),
                op,
            ),
        )
        if op == "evidence":
            item = EvidenceInput.model_validate(proposal["preview"]["evidence"])
            await conn.execute(
                "INSERT INTO goal_evidence(id,goal_id,plan_revision,criterion,state,note,source,"
                "proposal_id) VALUES (%s,%s,%s,%s,%s,%s,%s,%s)",
                (
                    uuid5(proposal_id, "evidence"),
                    goal["id"],
                    goal["plan_revision"],
                    item.criterion,
                    item.state,
                    item.note,
                    json_value(source),
                    proposal_id,
                ),
            )
        from ngertiin.proactivity.store import revoke

        await revoke(conn, owner, "goal_changed")
        return await one(
            conn,
            "UPDATE goal_proposals SET status='applied',goal_id=%s WHERE id=%s RETURNING *",
            (goal["id"], proposal_id),
        )
