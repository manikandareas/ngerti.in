"""Bounded canonical evidence, rehydrated before every inference and publication/read."""

import json
from datetime import UTC, datetime, timedelta
from uuid import UUID

from ngertiin.chat.store import one
from ngertiin.goals import evidence as goal_evidence
from ngertiin.memory import invalidation, sources
from ngertiin.memory import policy as memory_policy
from ngertiin.memory import store as memories
from ngertiin.memory.policy import bounded, fingerprint


def deadline(value):
    """Only an exact timezone-aware ISO datetime is a machine-actionable horizon."""
    try:
        parsed = datetime.fromisoformat(value)
        return parsed if parsed.tzinfo is not None else None
    except (ValueError, TypeError):
        return None


async def read(conn, owner, kind, identity):
    identity = UUID(str(identity))
    content = None
    thread = None
    expiry = None
    if kind == "goal":
        row = await one(
            conn,
            "SELECT * FROM user_goals WHERE id=%s AND owner_id=%s AND state='active'",
            (identity, owner),
        )
        if not row:
            return None
        supported = await goal_evidence.current(conn, owner, row)
        content = {
            "spec": {k: v for k, v in row["spec"].items() if k != "budget_cap"},
            "plan_revision": row["plan_revision"],
            "evidence": [
                {
                    "criterion": e["criterion"],
                    "state": e["state"],
                    "note": e["note"],
                    "source": e["source"],
                }
                for e in supported
                if e["available"]
            ],
        }
        thread, revision = row["thread_id"], row["revision"]
        expiry = deadline(row["spec"].get("horizon", ""))
    elif kind == "memory":
        row = await one(
            conn,
            "SELECT r.* FROM memory_revisions r JOIN memory_entries e "
            "ON e.id=r.entry_id AND e.revision=r.revision "
            "WHERE r.id=%s AND r.owner_id=%s",
            (identity, owner),
        )
        if not row or not await memories.usable(conn, owner, row):
            return None
        content = {"statement": row["statement"], "kind": row["kind"]}
        revision, expiry = row["revision"], row["valid_to"]
        origin = await one(
            conn,
            "SELECT m.thread_id FROM memory_evidence e "
            "JOIN chat_messages m ON m.id=e.source_id "
            "JOIN chat_threads t ON t.id=m.thread_id WHERE e.revision_id=%s "
            "AND e.source_kind='message' AND t.owner_id=%s "
            "ORDER BY e.created_at DESC LIMIT 1",
            (identity, owner),
        )
        thread = origin["thread_id"] if origin else None
    elif kind in ("task", "work"):
        row = await one(
            conn, "SELECT * FROM background_tasks WHERE id=%s AND owner_id=%s", (identity, owner)
        )
        if not row or not await invalidation.valid(
            conn, owner, row["memory_generation"], row["memory_refs"]
        ):
            return None
        if kind == "task" and row["status"] != "succeeded":
            return None
        if row["goal_id"]:
            goal = await one(
                conn,
                "SELECT * FROM user_goals WHERE id=%s AND owner_id=%s "
                "AND state='active' AND plan_revision=%s",
                (row["goal_id"], owner, row["goal_revision"]),
            )
            if not goal:
                return None
        content = {
            "title": row["title"],
            "instruction": row["instruction"],
            "status": row["status"],
            "result": row["result"],
            "goal_id": str(row["goal_id"]) if row["goal_id"] else None,
            "goal_revision": row["goal_revision"],
        }
        if row["result_id"]:
            result = await one(
                conn,
                "SELECT r.* FROM product_results r WHERE r.id=%s "
                "AND r.owner_id=%s AND r.deleted_at IS NULL",
                (row["result_id"], owner),
            )
            if not result:
                return None
            version = await one(
                conn,
                "SELECT * FROM result_revisions WHERE result_id=%s "
                "AND revision=%s AND status='ready'",
                (result["id"], result["current_revision"]),
            )
            if not version:
                return None
            for file in version["manifest"].get("files", []):
                if not await one(
                    conn,
                    "SELECT r.id FROM file_revisions r JOIN product_files f "
                    "ON f.id=r.file_id WHERE r.id=%s AND f.owner_id=%s "
                    "AND f.deleted_at IS NULL AND r.status='ready'",
                    (file["revision_id"], owner),
                ):
                    return None
            content["result_manifest"] = version["manifest"]
            content["result_revision"] = version["revision"]
        thread, revision = row["thread_id"], row["revision"]
    elif kind == "message":
        row = await one(
            conn,
            "SELECT m.* FROM chat_messages m JOIN chat_threads t ON "
            "t.id=m.thread_id WHERE m.id=%s AND t.owner_id=%s "
            "AND m.status='complete'",
            (identity, owner),
        )
        if not row or await one(
            conn,
            "SELECT 1 FROM memory_excluded_sources "
            "WHERE owner_id=%s AND source_kind='message' AND source_id=%s",
            (owner, identity),
        ):
            return None
        if row["run_id"]:
            run = await one(
                conn,
                "SELECT * FROM chat_runs WHERE id=%s AND owner_id=%s AND status='complete'",
                (row["run_id"], owner),
            )
            if not run or not await invalidation.valid(
                conn, owner, run["memory_generation"], run["memory_refs"]
            ):
                return None
        elif row["role"] != "user":
            return None
        text = sources.message_text(row["parts"])
        if not memory_policy.safe_text(text) or memory_policy.CONTROL.search(text):
            return None
        content = {"role": row["role"], "text": text}
        thread, revision = row["thread_id"], 1
    else:
        return None
    if expiry and expiry <= datetime.now(UTC):
        return None
    return {
        "key": f"{kind}:{identity}",
        "kind": kind,
        "id": str(identity),
        "revision": revision,
        "hash": fingerprint(content),
        "thread_id": str(thread) if thread else None,
        "valid_until": expiry.isoformat() if expiry else None,
        "content": content,
    }


def reference(item):
    return {k: v for k, v in item.items() if k != "content"}


async def valid(conn, owner, refs):
    for ref in refs:
        fresh = await read(conn, owner, ref["kind"], ref["id"])
        if not fresh or reference(fresh) != reference(ref):
            return False
    return True


async def collect(conn, owner, thread=None):
    """At most 20 canonical references; old output is context, never new authority."""
    state: dict = {
        "evidence": [],
        "recent_messages": [],
        "work": [],
        "previous_candidates": [],
        "refs": [],
        "target_thread_id": str(thread) if thread else None,
    }
    queries = [
        (
            "goal",
            "SELECT id FROM user_goals WHERE owner_id=%s AND state='active' "
            "ORDER BY updated_at DESC,id LIMIT 4",
        ),
        (
            "memory",
            "SELECT r.id FROM memory_revisions r JOIN memory_entries e ON "
            "e.id=r.entry_id AND e.revision=r.revision WHERE r.owner_id=%s AND e.status='active' "
            "ORDER BY e.updated_at DESC,r.id LIMIT 4",
        ),
        (
            "task",
            "SELECT id FROM background_tasks WHERE owner_id=%s AND status='succeeded' "
            "ORDER BY updated_at DESC,id LIMIT 4",
        ),
        (
            "work",
            "SELECT id FROM background_tasks WHERE owner_id=%s AND status IN "
            "('queued','running','waiting_user') ORDER BY updated_at DESC,id LIMIT 4",
        ),
        (
            "message",
            "SELECT m.id FROM chat_messages m JOIN chat_threads t ON t.id=m.thread_id "
            "WHERE t.owner_id=%s AND m.status='complete' ORDER BY m.created_at DESC,m.id LIMIT 4",
        ),
    ]
    for kind, query in queries:
        params: tuple = (owner,)
        if thread and kind != "memory":
            column = "m.thread_id" if kind == "message" else "thread_id"
            query = query.replace("ORDER BY", f"AND {column}=%s ORDER BY", 1)
            params = (owner, thread)
        for row in await (await conn.execute(query, params)).fetchall():
            item = await read(conn, owner, kind, row["id"])
            if not item:
                continue
            if thread and kind == "memory" and item["thread_id"] != str(thread):
                continue
            if not memory_policy.safe_text(json.dumps(item["content"], default=str)):
                continue
            if len(state["refs"]) >= 20:
                break
            # Bound all supplied content, including large goal specs/results, without
            # weakening full canonical hash validation.
            target = (
                "work"
                if kind == "work"
                else "recent_messages"
                if kind == "message" and item["content"].get("role") == "assistant"
                else "evidence"
            )
            serialized = json.dumps(item["content"], ensure_ascii=False, default=str)
            if len(serialized.encode()) > 1100:
                item["content"] = {"excerpt": bounded(serialized, 1100), "truncated": True}
            proposed = {
                **state,
                target: state[target] + [item],
                "refs": state["refs"] + [reference(item)],
            }
            if len(json.dumps(proposed, default=str).encode()) <= 24000:
                state = proposed
    previous = await (
        await conn.execute(
            "SELECT payload,evidence_refs FROM proactive_candidates WHERE owner_id=%s "
            "AND state='eligible' AND expires_at>now() ORDER BY created_at DESC LIMIT 10",
            (owner,),
        )
    ).fetchall()
    for item in previous:
        if await valid(conn, owner, item["evidence_refs"]):
            # Keep full lineage for every bit of model context.
            extra = [r for r in item["evidence_refs"] if r not in state["refs"]]
            if len(state["refs"]) + len(extra) > 20:
                continue
            proposed = {
                **state,
                "previous_candidates": state["previous_candidates"] + [item["payload"]],
                "refs": state["refs"] + extra,
            }
            if len(json.dumps(proposed, default=str).encode()) <= 24000:
                state = proposed
    now = datetime.now(UTC)
    temporal = [deadline(e.get("valid_until")) for e in state["refs"]]
    temporal = [d for d in temporal if d and now < d <= now + timedelta(hours=24)]
    state["time_window"] = now.strftime("%Y-%m-%dT%H") if temporal else None
    return state
