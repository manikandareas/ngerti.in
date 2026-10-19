"""Evidence is an exact, inspectable reference; successful work is not goal completion."""

from fastapi import HTTPException

from ngertiin.chat.store import one
from ngertiin.goals.contracts import EvidenceInput
from ngertiin.quotas.policy import fingerprint


async def source(conn, owner, goal, body: EvidenceInput):
    value: dict = {"kind": "user_report"}
    result = None
    if body.result_id:
        result = await one(
            conn,
            "SELECT v.* FROM result_revisions v JOIN product_results r ON r.id=v.result_id "
            "WHERE r.id=%s AND r.owner_id=%s AND r.deleted_at IS NULL AND v.revision=%s "
            "AND v.status='ready'",
            (body.result_id, owner, body.result_revision),
        )
        if not result:
            raise HTTPException(404, "Sumber tidak ditemukan.")
        if body.task_id and result["task_id"] != body.task_id:
            raise HTTPException(422, "Hasil tidak berasal dari Task yang dipilih.")
    task_id = body.task_id or (result["task_id"] if result else None)
    if task_id:
        task = await one(
            conn,
            "SELECT * FROM background_tasks WHERE id=%s AND owner_id=%s",
            (task_id, owner),
        )
        if not task:
            raise HTTPException(404, "Sumber tidak ditemukan.")
        if task["goal_id"] and (
            task["goal_id"] != goal["id"] or task["goal_revision"] != goal["plan_revision"]
        ):
            raise HTTPException(409, "Task memakai target lain/lama; tinjau rencana saat ini.")
        if body.state == "met" and task["status"] != "succeeded":
            raise HTTPException(409, "Task belum berhasil; tidak dapat menjadi bukti terpenuhi.")
        value = {
            "kind": "task",
            "task_id": str(task["id"]),
            "revision": task["revision"],
            "title": task["title"],
            "status": task["status"],
            "hash": fingerprint(task["result"]),
            "thread_id": str(task["thread_id"]),
        }
    if result:
        value.update(
            kind="result",
            result_id=str(body.result_id),
            result_revision=body.result_revision,
            result_hash=fingerprint(result["manifest"]),
        )
    return value


async def available(conn, owner, value):
    if value.get("task_id"):
        task = await one(
            conn,
            "SELECT revision,status,result FROM background_tasks WHERE id=%s AND owner_id=%s",
            (value["task_id"], owner),
        )
        if (
            not task
            or task["revision"] != value["revision"]
            or (task["status"] != value["status"] or fingerprint(task["result"]) != value["hash"])
        ):
            return False
    if value.get("result_id"):
        result = await one(
            conn,
            "SELECT v.manifest FROM result_revisions v JOIN product_results r ON r.id=v.result_id "
            "WHERE r.id=%s AND r.owner_id=%s AND r.deleted_at IS NULL AND v.revision=%s "
            "AND v.status='ready'",
            (value["result_id"], owner, value["result_revision"]),
        )
        if not result or fingerprint(result["manifest"]) != value["result_hash"]:
            return False
        for file in result["manifest"].get("files", []):
            valid = await one(
                conn,
                "SELECT r.id FROM file_revisions r JOIN product_files f ON f.id=r.file_id "
                "WHERE r.id=%s AND f.owner_id=%s AND f.deleted_at IS NULL AND r.status='ready'",
                (file["revision_id"], owner),
            )
            if not valid:
                return False
    return True


async def current(conn, owner, goal):
    rows = await (
        await conn.execute(
            "SELECT DISTINCT ON (e.criterion) e.* FROM goal_evidence e "
            "JOIN goal_proposals p ON p.id=e.proposal_id "
            "WHERE e.goal_id=%s AND e.plan_revision=%s "
            "ORDER BY e.criterion,p.expected_revision DESC",
            (goal["id"], goal["plan_revision"]),
        )
    ).fetchall()
    for row in rows:
        row["available"] = await available(conn, owner, row["source"])
    return rows
