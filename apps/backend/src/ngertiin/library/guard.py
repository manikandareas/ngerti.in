"""Revalidate tracked references before model calls, publication and history reuse."""

from fastapi import HTTPException

from ngertiin.async_db import transaction
from ngertiin.chat.store import StaleRun, json_value, lock_account, one
from ngertiin.library.contracts import ResourceRef
from ngertiin.library.reader import resolve


async def generation(conn, owner):
    row = await one(conn, "SELECT generation FROM memory_settings WHERE owner_id=%s", (owner,))
    return row["generation"] if row else 0


async def valid(conn, owner, refs):
    for ref in refs or []:
        try:
            value = dict(ref)
            expected = value.pop("_memory_generation", None)
            if expected is not None and expected != await generation(conn, owner):
                return False
            await resolve(conn, owner, ResourceRef.model_validate(value))
        except HTTPException:
            return False
    return True


async def track(run, refs):
    async with transaction() as conn:
        await lock_account(conn, run["owner_id"])
        row = await one(
            conn,
            "SELECT resource_refs,status,lease_token,cancel_requested FROM chat_runs "
            "WHERE id=%s AND owner_id=%s FOR UPDATE",
            (run["id"], run["owner_id"]),
        )
        if (
            not row
            or row["status"] != "running"
            or row["cancel_requested"]
            or row["lease_token"] != run.get("lease_token")
        ):
            raise StaleRun()
        combined = {str(ref): ref for ref in [*(row or {}).get("resource_refs", []), *refs]}
        await conn.execute(
            "UPDATE chat_runs SET resource_refs=%s WHERE id=%s",
            (json_value(list(combined.values())[:100]), run["id"]),
        )


async def ensure(run):
    async with transaction() as conn:
        row = await one(
            conn,
            "SELECT resource_refs FROM chat_runs WHERE id=%s AND owner_id=%s",
            (run["id"], run["owner_id"]),
        )
        return await valid(conn, run["owner_id"], (row or {}).get("resource_refs", []))


async def filter_history(owner, rows):
    result = []
    async with transaction() as conn:
        for row in rows:
            if row.get("run_id") and row.get("role") == "assistant":
                run = await one(
                    conn,
                    "SELECT resource_refs FROM chat_runs WHERE id=%s AND owner_id=%s",
                    (row["run_id"], owner),
                )
                if run and not await valid(conn, owner, run["resource_refs"]):
                    continue
            result.append(row)
    return result
