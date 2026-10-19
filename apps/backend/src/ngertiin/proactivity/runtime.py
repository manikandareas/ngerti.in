"""Short fenced transactions surround bounded, external generation and judgment calls."""

from datetime import UTC, datetime, timedelta
from uuid import uuid4, uuid5

import structlog

from ngertiin.async_db import transaction
from ngertiin.chat.store import json_value, lock_account, one
from ngertiin.config import get_settings
from ngertiin.memory.policy import fingerprint, safe_text
from ngertiin.proactivity import evidence, policy, providers, store

logger = structlog.get_logger()


async def claim(identity):
    async with transaction() as conn:
        row = await one(conn, "SELECT * FROM proactive_evaluations WHERE id=%s", (identity,))
        if not row:
            return None
        await lock_account(conn, row["owner_id"])
        row = await one(
            conn, "SELECT * FROM proactive_evaluations WHERE id=%s FOR UPDATE", (identity,)
        )
        if row["status"] != "queued":
            return None
        controls = await store.control(conn, row["owner_id"])
        if not controls["enabled"] or not get_settings().proactive_enabled:
            await store.invalidate_evaluation(conn, row, "evaluation_disabled")
            return None
        if not await evidence.valid(conn, row["owner_id"], row["snapshot"]["refs"]):
            await store.invalidate_evaluation(conn, row, "source_changed")
            return None
        return await one(
            conn,
            "UPDATE proactive_evaluations SET status='running',lease_token=%s,"
            "lease_until=now()+interval '3 minutes' WHERE id=%s RETURNING *",
            (uuid4(), identity),
        )


async def save_generated(job, candidates):
    async with transaction() as conn:
        await lock_account(conn, job["owner_id"])
        if not await store.fence(conn, job):
            return False
        await conn.execute(
            "UPDATE proactive_evaluations SET generated=%s WHERE id=%s",
            (json_value([c.model_dump(mode="json") for c in candidates]), job["id"]),
        )
        return True


async def publish(job, candidates, judgments):
    async with transaction() as conn:
        await lock_account(conn, job["owner_id"])
        if not await store.fence(conn, job):
            await store.invalidate_evaluation(conn, job, "source_changed")
            return
        ranked = []
        for index, (candidate, judgment) in enumerate(
            zip(candidates, judgments["answers"], strict=True)
        ):
            score, reason = policy.decision(judgment)
            if candidate.kind == "needs_input" and judgment["needs_input"]["noul"] < 0.8:
                score, reason = 0, "input_not_needed"
            key = fingerprint(
                [
                    candidate.kind,
                    str(candidate.thread_id),
                    (candidate.action or candidate.what_is_new).strip().lower(),
                ]
            )
            duplicate = await one(
                conn,
                "SELECT id FROM proactive_candidates WHERE owner_id=%s "
                "AND dedup_key=%s AND state='eligible' AND expires_at>now()",
                (job["owner_id"], key),
            )
            if duplicate:
                score, reason = 0, "duplicate"
            ranked.append((index, score, reason, key))
        winners = sorted((r for r in ranked if r[2] == "eligible"), key=lambda r: (-r[1], r[0]))
        winner = winners[0][0] if winners else None
        selected_id = None
        for index, score, reason, key in ranked:
            candidate = candidates[index]
            identity = uuid5(job["id"], f"candidate:{index}")
            if index == winner:
                selected_id = identity
            elif reason == "eligible":
                reason = "lower_rank"
            expiry = min(
                job["expires_at"], datetime.now(UTC) + timedelta(hours=candidate.expires_in_hours)
            )
            for ref in job["snapshot"]["refs"]:
                if ref["valid_until"]:
                    expiry = min(expiry, datetime.fromisoformat(ref["valid_until"]))
            await conn.execute(
                "INSERT INTO proactive_candidates(id,evaluation_id,owner_id,thread_id,"
                "state,payload,"
                "evidence_refs,judgment,rank_score,dedup_key,reason,expires_at) "
                "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                (
                    identity,
                    job["id"],
                    job["owner_id"],
                    candidate.thread_id,
                    "eligible" if index == winner else "discarded",
                    json_value(
                        {
                            **candidate.model_dump(mode="json"),
                            "preview": " ".join(
                                p for p in [candidate.what_is_new, candidate.action] if p
                            ),
                        }
                    ),
                    json_value(job["snapshot"]["refs"]),
                    json_value(judgments["answers"][index]),
                    score,
                    key,
                    reason,
                    expiry,
                ),
            )
        await conn.execute(
            "UPDATE proactive_evaluations SET status=%s,reason=%s,judgments=%s,"
            "selected_candidate_id=%s,lease_token=NULL,lease_until=NULL,finished_at=now() "
            "WHERE id=%s",
            (
                "selected" if selected_id else "no_op",
                "selected" if selected_id else "no_eligible_candidate",
                json_value(judgments),
                selected_id,
                job["id"],
            ),
        )


async def process(identity):
    job = await claim(identity)
    if not job:
        return
    try:
        settings = get_settings()
        if not (
            settings.openai_api_key.get_secret_value()
            and settings.typesafe_api_key.get_secret_value()
        ):
            raise providers.EvaluationUnavailable("provider_not_configured")
        generated = await providers.generate(job)
        candidates = []
        seen = set()
        for candidate in generated.candidates:
            key = fingerprint(
                [
                    str(candidate.thread_id),
                    (candidate.action or candidate.what_is_new).strip().lower(),
                ]
            )
            if (
                policy.route(
                    candidate, job["snapshot"]["evidence"], job["snapshot"].get("target_thread_id")
                )
                and key not in seen
                and safe_text(candidate.model_dump_json())
            ):
                candidates.append(candidate)
                seen.add(key)
        if not await save_generated(job, candidates):
            async with transaction() as conn:
                await lock_account(conn, job["owner_id"])
                await store.invalidate_evaluation(conn, job, "source_changed")
            return
        judgments = await providers.judge(job, candidates) if candidates else {"answers": []}
        await publish(job, candidates, judgments)
    except Exception as error:
        reason = (
            str(error)
            if isinstance(error, providers.EvaluationUnavailable)
            else "evaluation_failed"
        )
        async with transaction() as conn:
            await lock_account(conn, job["owner_id"])
            if not await store.fence(conn, job):
                await store.invalidate_evaluation(conn, job, "source_changed")
            else:
                await conn.execute(
                    "UPDATE proactive_evaluations SET status='failed',reason=%s,"
                    "lease_token=NULL,lease_until=NULL,finished_at=now() "
                    "WHERE id=%s AND lease_token=%s",
                    (reason, job["id"], job["lease_token"]),
                )
        logger.warning(
            "proactive.evaluation_failed",
            evaluation_id=str(identity),
            error_type=type(error).__name__,
        )
