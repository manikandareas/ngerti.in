"""Durable receipts, source revocation and account-scoped inspection projections."""

from uuid import uuid4

from fastapi import HTTPException

from ngertiin.accounts.access import unlimited_usage
from ngertiin.async_db import transaction
from ngertiin.chat.store import json_value, lock_account, one, owned_thread
from ngertiin.config import get_settings
from ngertiin.memory.policy import fingerprint
from ngertiin.proactivity import evidence, policy


async def control(conn, owner):
    await conn.execute(
        "INSERT INTO proactive_accounts(owner_id) VALUES (%s) ON CONFLICT DO NOTHING", (owner,)
    )
    return await one(conn, "SELECT * FROM proactive_accounts WHERE owner_id=%s", (owner,))


async def touch(conn, owner):
    """An outbox marker in the caller's transaction; no inference on request paths."""
    await conn.execute(
        "INSERT INTO proactive_accounts(owner_id,signal_version,due_at) "
        "VALUES (%s,1,now()+interval '2 minutes') ON CONFLICT(owner_id) DO UPDATE SET "
        "due_at=CASE WHEN proactive_accounts.evaluated_version>=proactive_accounts.signal_version "
        "THEN now()+interval '2 minutes' ELSE LEAST(proactive_accounts.due_at,"
        "now()+interval '2 minutes') END,signal_version=proactive_accounts.signal_version+1,"
        "updated_at=now()",
        (owner,),
    )


async def invalidate_evaluation(conn, row, reason):
    await conn.execute(
        "UPDATE proactive_evaluations SET status='invalidated',reason=%s,snapshot='{}',"
        "generated=NULL,judgments=NULL,lease_token=NULL,lease_until=NULL,"
        "selected_candidate_id=NULL,finished_at=COALESCE(finished_at,now()) WHERE id=%s",
        (reason, row["id"]),
    )
    await conn.execute(
        "UPDATE proactive_candidates SET state=CASE WHEN expires_at<=now() THEN 'expired' "
        "ELSE 'discarded' END,payload='{}',judgment='{}',reason=%s WHERE evaluation_id=%s",
        (reason, row["id"]),
    )


async def revoke(conn, owner, reason="source_changed"):
    """Conservative account-wide purge: forgotten context includes unselected drafts."""
    rows = await (
        await conn.execute(
            "SELECT id FROM proactive_evaluations WHERE owner_id=%s AND status<>'invalidated'",
            (owner,),
        )
    ).fetchall()
    for row in rows:
        await invalidate_evaluation(conn, row, reason)
    await touch(conn, owner)
    await conn.execute(
        "UPDATE proactive_accounts SET revision=revision+1 WHERE owner_id=%s", (owner,)
    )


async def refresh(conn, owner):
    rows = await (
        await conn.execute(
            "SELECT *,expires_at<=now() AS expired FROM proactive_evaluations "
            "WHERE owner_id=%s AND status<>'invalidated' ORDER BY created_at DESC LIMIT 100",
            (owner,),
        )
    ).fetchall()
    for row in rows:
        if row["expired"] or not await evidence.valid(conn, owner, row["snapshot"].get("refs", [])):
            await invalidate_evaluation(
                conn, row, "expired" if row["expired"] else "source_changed"
            )
    await conn.execute(
        "UPDATE proactive_candidates SET state='expired',reason='expired' "
        "WHERE owner_id=%s AND state='eligible' AND expires_at<=now()",
        (owner,),
    )


async def configure(owner, enabled, expected_revision):
    async with transaction() as conn:
        await lock_account(conn, owner)
        current = await control(conn, owner)
        if current["revision"] != expected_revision:
            if current["revision"] == expected_revision + 1 and current["enabled"] == enabled:
                return current
            raise HTTPException(409, "Kontrol evaluasi berubah. Muat data terbaru.")
        if not enabled:
            await revoke(conn, owner, "evaluation_disabled")
        await conn.execute(
            "UPDATE proactive_accounts SET enabled=%s,revision=%s,"
            "evaluated_version=-1,due_at=now(),updated_at=now() WHERE owner_id=%s",
            (enabled, current["revision"] + 1, owner),
        )
        return await control(conn, owner)


async def request(owner, thread=None):
    async with transaction() as conn:
        await lock_account(conn, owner)
        controls = await control(conn, owner)
        if not get_settings().proactive_enabled or not controls["enabled"]:
            raise HTTPException(409, "Aktifkan evaluasi pratinjau terlebih dahulu.")
        if thread:
            await owned_thread(conn, owner, thread)
        await refresh(conn, owner)
        snapshot = await evidence.collect(conn, owner, thread)
        settings = get_settings()
        digest = fingerprint(
            [
                snapshot["refs"],
                snapshot["time_window"],
                str(thread),
                controls["revision"],
                policy.VERSION,
                settings.proactive_generation_model,
                settings.typesafe_model,
            ]
        )
        previous = await one(
            conn,
            "SELECT * FROM proactive_evaluations WHERE owner_id=%s "
            "AND input_hash=%s AND pipeline_version=%s",
            (owner, digest, policy.VERSION),
        )
        if previous:
            await conn.execute(
                "UPDATE proactive_accounts SET evaluated_version=%s,"
                "due_at=now()+interval '1 hour' WHERE owner_id=%s",
                (controls["signal_version"], owner),
            )
            return previous
        count = await one(
            conn,
            "SELECT count(*) AS n FROM proactive_evaluations WHERE owner_id=%s "
            "AND created_at>=date_trunc('day',now() AT TIME ZONE 'UTC') "
            "AT TIME ZONE 'UTC'",
            (owner,),
        )
        if not unlimited_usage(owner) and count["n"] >= settings.proactive_daily_evaluations:
            raise HTTPException(429, "Batas evaluasi proaktif hari ini tercapai.")
        row = await one(
            conn,
            "INSERT INTO proactive_evaluations(id,owner_id,input_hash,"
            "pipeline_version,snapshot,status,reason,signal_version) "
            "VALUES (%s,%s,%s,%s,%s,%s,%s,%s) "
            "RETURNING *",
            (
                uuid4(),
                owner,
                digest,
                policy.VERSION,
                json_value(snapshot),
                "queued" if snapshot["evidence"] else "no_op",
                None if snapshot["evidence"] else "no_evidence",
                controls["signal_version"],
            ),
        )
        if row["status"] == "queued":
            from ngertiin.proactivity.jobs import evaluate_job

            await evaluate_job.configure(
                connection=conn,
                lock=f"proactive:{row['id']}",
                queueing_lock=f"proactive:{row['id']}",
            ).defer_async(evaluation_id=str(row["id"]))
        await conn.execute(
            "UPDATE proactive_accounts SET evaluated_version=%s,"
            "due_at=now()+interval '1 hour' WHERE owner_id=%s",
            (controls["signal_version"], owner),
        )
        return row


async def listing(owner):
    async with transaction() as conn:
        await lock_account(conn, owner)
        controls = await control(conn, owner)
        await refresh(conn, owner)
        rows = await (
            await conn.execute(
                "SELECT id,status,reason,selected_candidate_id,pipeline_version,created_at,"
                "expires_at FROM proactive_evaluations WHERE owner_id=%s "
                "ORDER BY created_at DESC LIMIT 30",
                (owner,),
            )
        ).fetchall()
        candidates = await (
            await conn.execute(
                "SELECT * FROM proactive_candidates WHERE owner_id=%s "
                "ORDER BY created_at DESC,id LIMIT 30",
                (owner,),
            )
        ).fetchall()
        product = await one(
            conn,
            "SELECT intensity,onboarded_at FROM proactive_preferences WHERE owner_id=%s",
            (owner,),
        )
        return {
            "controls": controls,
            "evaluations": rows,
            "candidates": candidates,
            "delivery_enabled": bool(
                product
                and product["onboarded_at"]
                and product["intensity"] != "off"
                and controls["enabled"]
            ),
            "pipeline_version": policy.VERSION,
            "provider_ready": bool(
                get_settings().openai_api_key.get_secret_value()
                and get_settings().typesafe_api_key.get_secret_value()
            ),
        }


async def detail(owner, identity):
    async with transaction() as conn:
        await lock_account(conn, owner)
        await refresh(conn, owner)
        row = await one(
            conn,
            "SELECT * FROM proactive_evaluations WHERE id=%s AND owner_id=%s",
            (identity, owner),
        )
        if not row:
            raise HTTPException(404, "Evaluasi tidak ditemukan.")
        costs = await (
            await conn.execute(
                "SELECT stage,model,reserved_units,charged_units,state,usage "
                "FROM proactive_cost_events "
                "WHERE evaluation_id=%s ORDER BY created_at",
                (identity,),
            )
        ).fetchall()
        product = await one(
            conn,
            "SELECT intensity,onboarded_at FROM proactive_preferences WHERE owner_id=%s",
            (owner,),
        )
        return {
            **row,
            "cost_events": costs,
            "delivery_enabled": bool(
                product and product["onboarded_at"] and product["intensity"] != "off"
            ),
        }


async def fence(conn, job):
    row = await one(
        conn,
        "SELECT e.id FROM proactive_evaluations e JOIN proactive_accounts a "
        "ON a.owner_id=e.owner_id WHERE e.id=%s AND e.lease_token=%s "
        "AND e.status='running' AND e.lease_until>now() AND e.expires_at>now() "
        "AND a.enabled",
        (job["id"], job["lease_token"]),
    )
    return bool(
        row
        and get_settings().proactive_enabled
        and await evidence.valid(conn, job["owner_id"], job["snapshot"].get("refs", []))
    )
