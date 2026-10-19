"""Bounded owner projections; current evidence is revalidated at every read."""

from fastapi import HTTPException

from ngertiin.async_db import transaction
from ngertiin.chat.store import one
from ngertiin.goals import evidence


async def owned(conn, owner, goal_id, *, lock=False):
    row = await one(
        conn,
        "SELECT * FROM user_goals WHERE id=%s AND owner_id=%s" + (" FOR UPDATE" if lock else ""),
        (goal_id, owner),
    )
    if not row:
        raise HTTPException(404, "Tujuan tidak ditemukan.")
    return row


async def budget(conn, goal_id, *, exclude_task=None):
    return await one(
        conn,
        "SELECT COALESCE(sum(usage_units),0)::bigint AS used,"
        "COALESCE(sum(CASE WHEN status IN ('succeeded','failed','cancelled') THEN usage_units "
        "ELSE budget_cap END),0)::bigint AS committed FROM background_tasks "
        "WHERE goal_id=%s AND (%s::uuid IS NULL OR id<>%s)",
        (goal_id, exclude_task, exclude_task),
    )


async def listing(owner):
    async with transaction() as conn:
        goals = await (
            await conn.execute(
                "SELECT g.*,t.title AS thread_title FROM user_goals g "
                "JOIN chat_threads t ON t.id=g.thread_id WHERE g.owner_id=%s "
                "ORDER BY (g.state='active') DESC,g.updated_at DESC LIMIT 100",
                (owner,),
            )
        ).fetchall()
        proposals = await (
            await conn.execute(
                "SELECT id,thread_id,goal_id,preview,expires_at FROM goal_proposals "
                "WHERE owner_id=%s AND status='pending' AND expires_at>now() "
                "ORDER BY created_at DESC LIMIT 20",
                (owner,),
            )
        ).fetchall()
        return {"goals": goals, "proposals": proposals}


async def detail(owner, goal_id):
    async with transaction() as conn:
        goal = await owned(conn, owner, goal_id)
        supported = await evidence.current(conn, owner, goal)
        tasks = await (
            await conn.execute(
                "SELECT id,title,thread_id,status,goal_revision,result_id,revision,usage_units "
                "FROM background_tasks WHERE goal_id=%s AND owner_id=%s "
                "ORDER BY created_at DESC LIMIT 50",
                (goal_id, owner),
            )
        ).fetchall()
        schedules = await (
            await conn.execute(
                "SELECT id,revision,state,spec,next_due,thread_id FROM user_schedules "
                "WHERE owner_id=%s AND spec->'goal'->>'id'=%s AND state<>'deleted' "
                "ORDER BY created_at DESC LIMIT 100",
                (owner, str(goal_id)),
            )
        ).fetchall()
        history = await (
            await conn.execute(
                "SELECT * FROM goal_revisions WHERE goal_id=%s ORDER BY revision DESC LIMIT 50",
                (goal_id,),
            )
        ).fetchall()
        old_evidence = await (
            await conn.execute(
                "SELECT e.* FROM goal_evidence e JOIN goal_proposals p ON p.id=e.proposal_id "
                "WHERE e.goal_id=%s ORDER BY p.expected_revision DESC LIMIT 50",
                (goal_id,),
            )
        ).fetchall()
        return {
            **goal,
            "evidence": supported,
            "tasks": tasks,
            "schedules": schedules,
            "history": history,
            "evidence_history": old_evidence,
            "met": sum(e["state"] == "met" and e["available"] for e in supported),
            "needs_review": any(not e["available"] for e in supported),
            "budget": await budget(conn, goal_id),
        }
