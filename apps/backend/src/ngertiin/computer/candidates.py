"""Immutable staged candidates and explicit publication eligibility."""

import hashlib
import json
from uuid import uuid5

from ngertiin.chat.store import json_value, one
from ngertiin.sandbox import outputs
from ngertiin.tasks import store


def digest(value):
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, ensure_ascii=False).encode()
    ).hexdigest()


async def save(execution, session, files, summary, evidence_ids):
    manifest = await outputs.persist(execution, session, files, summary, promote=False)
    checksum = digest(manifest)
    ident = uuid5(execution["id"], f"candidate:{execution['revision']}:{checksum}")
    async with store.locked(execution["owner_id"], execution["id"]) as (conn, task):
        store.fence(task, execution)
        await conn.execute(
            "INSERT INTO "
            "computer_candidates(id,owner_id,task_id,revision,content_hash,manifest,evidence_ids) "
            "VALUES (%s,%s,%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING",
            (
                ident,
                task["owner_id"],
                task["id"],
                task["revision"],
                checksum,
                json_value(manifest),
                json_value(evidence_ids),
            ),
        )
    return ident


async def verdict(execution, ident, state, value):
    async with store.locked(execution["owner_id"], execution["id"]) as (conn, task):
        store.fence(task, execution)
        await conn.execute(
            "UPDATE computer_candidates SET state=%s,verdict=%s WHERE id=%s "
            "AND owner_id=%s AND task_id=%s AND revision=%s",
            (state, json_value(value), ident, task["owner_id"], task["id"], task["revision"]),
        )


async def promote(execution, ident):
    async with store.locked(execution["owner_id"], execution["id"]) as (conn, task):
        store.fence(task, execution)
        candidate = await one(
            conn,
            "SELECT * FROM computer_candidates WHERE id=%s AND owner_id=%s "
            "AND task_id=%s AND revision=%s FOR UPDATE",
            (ident, task["owner_id"], task["id"], task["revision"]),
        )
        if not candidate or candidate["state"] not in ("passed", "partial"):
            raise ValueError("Kandidat belum lolos verifikasi.")
        if digest(candidate["manifest"]) != candidate["content_hash"]:
            raise ValueError("Kandidat berubah setelah verifikasi.")
        state = {
            **task.get("runtime_state", {}),
            "candidate_id": str(ident),
            "outcome": "partial" if candidate["state"] == "partial" else "final",
        }
        await store.change(
            conn,
            task,
            stage="draft_ready",
            draft=json.dumps(candidate["manifest"], ensure_ascii=False),
            runtime_state=json_value(state),
        )
        execution["runtime_state"] = state
        await store.persist_revision(conn, task, uuid5(task["id"], f"draft:{task['revision']}"))
        await store.emit(conn, task)


async def require_publishable(conn, task):
    if (
        task.get("runtime_kind") != "browser"
        or task["budget_policy"].get("computer", {}).get("workflow_version", 1) < 2
    ):
        return
    row = await one(
        conn,
        "SELECT state,manifest,content_hash FROM computer_candidates "
        "WHERE id=%s AND owner_id=%s AND task_id=%s AND revision=%s",
        (
            task.get("runtime_state", {}).get("candidate_id"),
            task["owner_id"],
            task["id"],
            task["revision"],
        ),
    )
    if (
        not row
        or row["state"] not in ("passed", "partial")
        or digest(json.loads(task["draft"])) != row["content_hash"]
    ):
        raise ValueError("Publication membutuhkan kandidat dan verdict yang cocok.")
