"""One account/thread transaction owns eligibility, message, cap and durable receipt."""

from datetime import timedelta
from uuid import uuid5

from ngertiin.async_db import transaction
from ngertiin.chat.store import append_event, json_value, lock_account, one, owned_thread
from ngertiin.config import get_settings
from ngertiin.proactivity import delivery_policy as rules
from ngertiin.proactivity import evidence, policy, preferences
from ngertiin.proactivity.contracts import Candidate


async def discard(conn, candidate, reason):
    await conn.execute(
        "UPDATE proactive_candidates SET state='discarded',reason=%s WHERE id=%s",
        (reason, candidate["id"]),
    )
    return {"state": "discarded", "reason": reason}


async def defer(conn, candidate, reason, due):
    await conn.execute(
        "UPDATE proactive_candidates SET reason=%s,delivery_due_at=%s WHERE id=%s",
        (reason, due, candidate["id"]),
    )
    return {"state": "held", "reason": reason}


async def scope_controls(conn, candidate):
    controls = []
    scopes = [("thread", candidate["thread_id"])] + [
        ("goal", ref["id"])
        for ref in candidate["evidence_refs"]
        if ref["kind"] == "goal" and ref["key"] in candidate["payload"]["evidence_ids"]
    ]
    for ref in candidate["evidence_refs"]:
        if ref["kind"] == "task" and ref["key"] in candidate["payload"]["evidence_ids"]:
            task = await one(
                conn,
                "SELECT goal_id FROM background_tasks WHERE id=%s AND owner_id=%s",
                (ref["id"], candidate["owner_id"]),
            )
            if task and task["goal_id"]:
                scopes.append(("goal", task["goal_id"]))
    for scope, identity in scopes:
        value = await one(
            conn,
            "SELECT * FROM proactive_scope_controls WHERE owner_id=%s AND scope=%s AND scope_id=%s",
            (candidate["owner_id"], scope, identity),
        )
        if value:
            controls.append(value)
    return controls


async def deliver(identity):
    async with transaction() as conn:
        candidate = await one(conn, "SELECT * FROM proactive_candidates WHERE id=%s", (identity,))
        if not candidate:
            return {"state": "missing"}
        owner = candidate["owner_id"]
        await lock_account(conn, owner)
        candidate = await one(
            conn, "SELECT * FROM proactive_candidates WHERE id=%s FOR UPDATE", (identity,)
        )
        receipt = await one(
            conn, "SELECT * FROM proactive_deliveries WHERE candidate_id=%s", (identity,)
        )
        if receipt:
            return {"state": "delivered", "message_id": receipt["message_id"]}
        if candidate["state"] != "eligible":
            return {"state": candidate["state"]}
        now = (await one(conn, "SELECT clock_timestamp() AS value"))["value"]
        if candidate["expires_at"] <= now:
            await conn.execute(
                "UPDATE proactive_candidates SET state='expired',reason='expired' WHERE id=%s",
                (identity,),
            )
            return {"state": "expired"}
        prefs = await preferences.account(conn, owner)
        engine = await one(conn, "SELECT * FROM proactive_accounts WHERE owner_id=%s", (owner,))
        if (
            not get_settings().proactive_enabled
            or not engine
            or not engine["enabled"]
            or not prefs["onboarded_at"]
            or prefs["intensity"] == "off"
        ):
            return await defer(conn, candidate, "disabled", now + timedelta(hours=1))
        evaluation = await one(
            conn, "SELECT * FROM proactive_evaluations WHERE id=%s", (candidate["evaluation_id"],)
        )
        if (
            evaluation["status"] != "selected"
            or evaluation["signal_version"] != engine["signal_version"]
        ):
            return await discard(conn, candidate, "context_changed")
        if not candidate["evidence_refs"] or not await evidence.valid(
            conn, owner, candidate["evidence_refs"]
        ):
            return await discard(conn, candidate, "source_changed")
        proposal = Candidate.model_validate(
            {k: v for k, v in candidate["payload"].items() if k in Candidate.model_fields}
        )
        if not policy.route(proposal, candidate["evidence_refs"]):
            return await discard(conn, candidate, "invalid_thread")
        # Ownership is rechecked in addition to canonical source validation.
        thread = await owned_thread(conn, owner, candidate["thread_id"], lock=True)
        controls = await scope_controls(conn, candidate)
        if any(c["intensity"] == "off" for c in controls):
            return await defer(conn, candidate, "muted", now + timedelta(hours=1))
        until = max([c["snoozed_until"] for c in [prefs, *controls] if c["snoozed_until"]] or [now])
        if until > now:
            return await defer(conn, candidate, "snoozed", until)
        quiet = rules.quiet_delay(prefs, now)
        if quiet:
            return await defer(conn, candidate, "quiet_hours", quiet)
        intensity = next(
            (c["intensity"] for c in controls if c["scope"] == "goal" and c["intensity"]), None
        )
        intensity = intensity or next(
            (c["intensity"] for c in controls if c["intensity"]), prefs["intensity"]
        )
        if policy.decision(candidate["judgment"])[1] != "eligible" or not rules.semantic_allowed(
            candidate, intensity
        ):
            return await discard(conn, candidate, "below_intensity_threshold")
        key = rules.dedup_key(candidate["payload"])
        duplicate = await one(
            conn,
            "SELECT 1 FROM proactive_deliveries WHERE owner_id=%s "
            "AND dedup_key=%s AND created_at>%s",
            (owner, key, now - timedelta(days=7)),
        )
        if duplicate:
            return await discard(conn, candidate, "already_delivered")
        history = await one(
            conn,
            "SELECT count(*) AS n,min(created_at) AS first,max(created_at) AS latest "
            "FROM proactive_deliveries WHERE owner_id=%s AND created_at>%s",
            (owner, now - timedelta(hours=24)),
        )
        cap, _ = rules.LIMITS[prefs["intensity"]]
        if history["n"] >= cap:
            return await defer(
                conn, candidate, "daily_cap", history["first"] + timedelta(hours=24, seconds=1)
            )
        spacing = rules.LIMITS[intensity][1]
        if history["latest"] and history["latest"] + timedelta(hours=spacing) > now:
            return await defer(
                conn, candidate, "spacing", history["latest"] + timedelta(hours=spacing)
            )
        # Avoid a fresh interruption while this thread is receiving an answer.
        busy = await one(
            conn,
            "SELECT 1 FROM chat_runs WHERE thread_id=%s AND status IN "
            "('queued','running','waiting_approval','cancelling')",
            (thread["id"],),
        )
        if busy:
            return await defer(conn, candidate, "conversation_busy", now + timedelta(minutes=1))
        payload = candidate["payload"]
        text = "\n\n".join(p for p in [payload["what_is_new"], payload.get("action")] if p)
        message_id = uuid5(identity, "proactive-message")
        parts = [
            {"id": "text", "type": "text", "text": text},
            {
                "id": "proactive",
                "type": "proactive",
                "candidate_id": str(identity),
                "kind": payload["kind"],
                "why_relevant": payload["why_relevant"],
                "created_at": now.isoformat(),
                "policy_version": rules.VERSION,
            },
        ]
        message = await one(
            conn,
            "INSERT INTO chat_messages(id,thread_id,role,parts,status,position) "
            "VALUES (%s,%s,'assistant',%s,'complete',%s) RETURNING "
            "id,role,parts,status,run_id,position,created_at",
            (message_id, thread["id"], json_value(parts), thread["seq"] + 1),
        )
        await conn.execute(
            "INSERT INTO proactive_deliveries(candidate_id,owner_id,message_id,thread_id,"
            "dedup_key,preference_revision) VALUES (%s,%s,%s,%s,%s,%s)",
            (identity, owner, message_id, thread["id"], key, prefs["revision"]),
        )
        await conn.execute(
            "UPDATE proactive_candidates SET state='delivered',reason='delivered' WHERE id=%s",
            (identity,),
        )
        await append_event(conn, thread["id"], {"type": "message.upsert", "message": message})
        return {"state": "delivered", "message_id": message_id}


async def dispatch():
    if not get_settings().proactive_enabled:
        return
    async with transaction() as conn:
        rows = await (
            await conn.execute(
                "SELECT DISTINCT ON(owner_id) id,owner_id,rank_score,created_at "
                "FROM proactive_candidates WHERE state='eligible' AND delivery_due_at<=now() "
                "ORDER BY owner_id,rank_score DESC,created_at DESC LIMIT 50"
            )
        ).fetchall()
    for row in rows:
        await deliver(row["id"])
