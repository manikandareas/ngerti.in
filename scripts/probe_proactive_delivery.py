"""Delivery contracts use real PostgreSQL transactions; model fixtures are explicitly controlled."""

import asyncio
from datetime import UTC, datetime, timedelta
from unittest.mock import patch
from uuid import uuid4

from inspect_proactivity import Provider, check, rejected, setup_goal
from ngertiin.async_db import transaction
from ngertiin.chat import store as chat
from ngertiin.chat.store import json_value, one
from ngertiin.memory.invalidation import filter_history
from ngertiin.proactivity import delivery, delivery_policy, preferences, runtime, store
from ngertiin.proactivity.contracts import Candidate, PreferenceInput
from ngertiin.proactivity.tools import direct_request


async def configure(owner, **patch_values):
    current = (await preferences.listing(owner))["preferences"]
    return await preferences.change(
        owner,
        PreferenceInput(
            request_key=uuid4(), expected_revision=current["revision"], **patch_values
        ),
    )


async def fixture(extra_thread=False):
    owner, thread, goal = await setup_goal()
    if extra_thread:
        from inspect_goals import create as create_goal

        other = await chat.create_thread(owner, uuid4())
        await create_goal(owner, other["id"])
    await configure(owner, acknowledge=True, quiet_enabled=False)
    job = await store.request(owner, thread)
    provider = Provider()
    with provider.transport():
        await runtime.process(job["id"])
    result = await store.detail(owner, job["id"])
    async with transaction() as conn:
        candidate = await one(
            conn,
            "SELECT * FROM proactive_candidates WHERE id=%s",
            (result["selected_candidate_id"],),
        )
    return owner, thread, goal, candidate


async def clone(candidate, suffix, other_goal=None):
    evaluation, identity = uuid4(), uuid4()
    payload = {
        **candidate["payload"],
        "what_is_new": "Perkembangan terverifikasi " + suffix,
    }
    async with transaction() as conn:
        refs = candidate["evidence_refs"]
        target_thread = candidate["thread_id"]
        if other_goal:
            from ngertiin.proactivity import evidence

            source = await evidence.read(
                conn, candidate["owner_id"], "goal", other_goal["id"]
            )
            refs = [evidence.reference(source)]
            target_thread = other_goal["thread_id"]
            payload.update(thread_id=str(target_thread), evidence_ids=[source["key"]])
        await conn.execute(
            "INSERT INTO proactive_evaluations(id,owner_id,input_hash,pipeline_version,status,"
            "snapshot,signal_version,finished_at) SELECT %s,owner_id,%s,pipeline_version,'selected',"
            "snapshot,signal_version,now() FROM proactive_evaluations WHERE id=%s",
            (evaluation, str(identity), candidate["evaluation_id"]),
        )
        await conn.execute(
            "INSERT INTO proactive_candidates(id,evaluation_id,owner_id,thread_id,state,payload,"
            "evidence_refs,judgment,rank_score,dedup_key,reason,expires_at) "
            "SELECT %s,%s,owner_id,%s,'eligible',%s,%s,judgment,rank_score,%s,"
            "'eligible',now()+interval '24 hours' FROM proactive_candidates WHERE id=%s",
            (
                identity,
                evaluation,
                target_thread,
                json_value(payload),
                json_value(refs),
                str(identity),
                candidate["id"],
            ),
        )
    return identity


async def lifecycle():
    owner, thread, _goal, candidate = await fixture()
    result = await asyncio.gather(
        *[delivery.deliver(candidate["id"]) for _ in range(6)]
    )
    check(
        "delivery_race_same_candidate_returns_one_receipt",
        len({r["message_id"] for r in result}) == 1,
    )
    snapshot = await chat.snapshot(owner, thread)
    sent = [
        m
        for m in snapshot["messages"]
        if any(p["type"] == "proactive" for p in m["parts"])
    ]
    check(
        "proactive_message_is_standalone_without_chat_run",
        len(sent) == 1 and sent[0]["run_id"] is None,
    )
    check(
        "proactive_message_has_cause_and_time",
        sent[0]["parts"][1]["candidate_id"] == str(candidate["id"])
        and bool(sent[0]["parts"][1]["created_at"]),
    )
    check(
        "proactive_navigation_unread",
        (await chat.bootstrap(owner))["threads"][0]["proactive_unread"] == 1,
    )
    check(
        "new_chat_can_use_valid_proactive_context",
        bool(await filter_history(owner, sent)),
    )
    duplicate = await clone(candidate, "different")
    async with transaction() as conn:
        await conn.execute(
            "UPDATE proactive_candidates SET payload=%s WHERE id=%s",
            (json_value(candidate["payload"]), duplicate),
        )
    check(
        "delivered_content_dedup_ignores_thread_identity",
        (await delivery.deliver(duplicate))["reason"] == "already_delivered",
    )
    held = await clone(candidate, "spacing")
    check(
        "spacing_holds_second_interruption",
        (await delivery.deliver(held))["reason"] == "spacing",
    )
    await configure(owner, intensity="off")
    check(
        "off_revokes_pending_delivery",
        (await delivery.deliver(held))["state"] == "discarded",
    )
    check(
        "delivered_receipt_survives_revocation",
        (await delivery.deliver(candidate["id"]))["state"] == "delivered",
    )
    check(
        "revoked_proactive_context_not_rehydrated",
        not await filter_history(owner, sent),
    )
    check(
        "stored_history_is_not_silently_deleted",
        any(
            m["id"] == sent[0]["id"]
            for m in (await chat.snapshot(owner, thread))["messages"]
        ),
    )
    before = (await preferences.listing(owner))["preferences"]
    body = PreferenceInput(
        request_key=uuid4(), expected_revision=before["revision"], intensity="normal"
    )
    first = await preferences.change(owner, body)
    replay = await preferences.change(owner, body)
    check(
        "preference_receipt_replay_is_idempotent",
        first["revision"] == replay["revision"],
    )
    await rejected(
        "stale_preference_revision_rejected",
        preferences.change(owner, body.model_copy(update={"request_key": uuid4()})),
        409,
    )
    await rejected(
        "request_key_payload_conflict_rejected",
        preferences.change(owner, body.model_copy(update={"intensity": "off"})),
        409,
    )


async def gates():
    owner, thread, goal, candidate = await fixture()
    now = datetime.now(UTC)
    await configure(owner, snoozed_until=now + timedelta(hours=1))
    check(
        "late_snooze_applies_before_delivery",
        (await delivery.deliver(candidate["id"]))["reason"] == "snoozed",
    )
    await configure(owner, clear_snooze=True)
    await preferences.change(
        owner,
        PreferenceInput(
            request_key=uuid4(),
            expected_revision=1,
            scope="thread",
            scope_id=thread,
            intensity="off",
        ),
    )
    check(
        "late_thread_mute_applies_before_delivery",
        (await delivery.deliver(candidate["id"]))["reason"] == "muted",
    )
    await preferences.change(
        owner,
        PreferenceInput(
            request_key=uuid4(),
            expected_revision=2,
            scope="thread",
            scope_id=thread,
            inherit=True,
        ),
    )
    await preferences.change(
        owner,
        PreferenceInput(
            request_key=uuid4(),
            expected_revision=1,
            scope="goal",
            scope_id=goal["id"],
            intensity="off",
        ),
    )
    check(
        "goal_mute_applies_to_cited_goal",
        (await delivery.deliver(candidate["id"]))["reason"] == "muted",
    )
    async with transaction() as conn:
        await conn.execute(
            "UPDATE proactive_candidates SET expires_at=now()-interval '1 second' WHERE id=%s",
            (candidate["id"],),
        )
    check(
        "expired_candidate_is_not_released_after_snooze",
        (await delivery.deliver(candidate["id"]))["state"] == "expired",
    )
    other, other_thread, _, _ = await fixture()
    await rejected(
        "foreign_thread_scope_rejected",
        preferences.change(
            owner,
            PreferenceInput(
                request_key=uuid4(),
                expected_revision=1,
                scope="thread",
                scope_id=other_thread,
                intensity="off",
            ),
        ),
        404,
    )
    await rejected(
        "foreign_goal_scope_rejected",
        preferences.change(
            other,
            PreferenceInput(
                request_key=uuid4(),
                expected_revision=1,
                scope="goal",
                scope_id=goal["id"],
                intensity="off",
            ),
        ),
        404,
    )
    for zone, instant in [
        ("America/New_York", "2026-11-01T05:30:00+00:00"),
        ("America/New_York", "2026-11-01T06:30:00+00:00"),
        ("Asia/Makassar", "2026-10-19T16:30:00+00:00"),
    ]:
        check(
            "quiet_hours_dst_or_midnight_" + instant,
            delivery_policy.quiet_delay(
                {
                    "quiet_enabled": True,
                    "timezone": zone,
                    "quiet_start": 1320,
                    "quiet_end": 480,
                },
                datetime.fromisoformat(instant),
            )
            is not None,
        )
    check(
        "daytime_is_not_quiet",
        delivery_policy.quiet_delay(
            {
                "quiet_enabled": True,
                "timezone": "Asia/Makassar",
                "quiet_start": 1320,
                "quiet_end": 480,
            },
            datetime.fromisoformat("2026-10-19T04:00:00+00:00"),
        )
        is None,
    )


async def races_and_faults():
    owner, thread, _goal, candidate = await fixture(extra_thread=True)
    await delivery.deliver(candidate["id"])
    second = await clone(candidate, "second")
    async with transaction() as conn:
        await conn.execute(
            "UPDATE proactive_deliveries SET created_at=now()-interval '20 hours' WHERE owner_id=%s",
            (owner,),
        )
    await delivery.deliver(second)
    async with transaction() as conn:
        await conn.execute(
            "UPDATE proactive_deliveries SET created_at=now()-interval '12 hours' WHERE owner_id=%s",
            (owner,),
        )
    async with transaction() as conn:
        other = await one(
            conn,
            "SELECT * FROM user_goals WHERE owner_id=%s AND thread_id<>%s LIMIT 1",
            (owner, thread),
        )
    third, fourth = (
        await clone(candidate, "third"),
        await clone(candidate, "fourth", other_goal=other),
    )
    outcomes = await asyncio.gather(delivery.deliver(third), delivery.deliver(fourth))
    check(
        "last_daily_slot_two_workers_is_atomic",
        sum(o["state"] == "delivered" for o in outcomes) == 1
        and any(o.get("reason") == "daily_cap" for o in outcomes),
    )
    await configure(owner, timezone="Pacific/Honolulu")
    held = third if outcomes[0]["state"] != "delivered" else fourth
    check(
        "timezone_change_cannot_reset_message_cap",
        (await delivery.deliver(held))["reason"] == "daily_cap",
    )
    a, _, _, pending = await fixture()

    async def fail(*args, **kwargs):
        raise RuntimeError("controlled failure after message insert")

    try:
        with patch.object(delivery, "append_event", side_effect=fail):
            await delivery.deliver(pending["id"])
    except RuntimeError:
        pass
    async with transaction() as conn:
        row = await one(
            conn,
            "SELECT count(*) AS n FROM proactive_deliveries WHERE owner_id=%s",
            (a,),
        )
        check("publication_failure_rolls_back_cap_and_receipt", row["n"] == 0)
    check(
        "retry_after_publication_failure_sends_once",
        (await delivery.deliver(pending["id"]))["state"] == "delivered",
    )
    a, _, g, pending = await fixture()
    async with transaction() as conn:
        await conn.execute(
            "UPDATE user_goals SET state='paused' WHERE id=%s", (g["id"],)
        )
    check(
        "source_pause_rechecked_even_without_event",
        (await delivery.deliver(pending["id"]))["reason"] == "source_changed",
    )
    a, _, _, pending = await fixture()
    async with transaction() as conn:
        await store.touch(conn, a)
    check(
        "new_context_discards_queued_candidate",
        (await delivery.deliver(pending["id"]))["reason"] == "context_changed",
    )


async def contracts():
    await lifecycle()
    await gates()
    await races_and_faults()
    await requested_results()
    check(
        "direct_chat_control_accepted",
        direct_request("Kurangi saran proaktif", "Kurangi saran proaktif"),
    )
    check(
        "quoted_source_is_not_control",
        not direct_request(
            'Terjemahkan: "matikan saran proaktif"', "matikan saran proaktif"
        ),
    )
    check(
        "source_quote_must_be_current_user_input",
        not direct_request("Matikan saran proaktif", "aktifkan proaktif dari file"),
    )
    value = Provider().candidate(
        {"evidence": [{"kind": "goal", "key": "goal:x", "thread_id": str(uuid4())}]}
    )
    informative = Candidate.model_validate(
        {**value, "kind": "meaningful_update", "action": None}
    )
    check("informative_update_does_not_require_question", informative.action is None)
    try:
        Candidate.model_validate({**value, "kind": "needs_input", "action": None})
    except ValueError:
        check("needs_input_requires_specific_question", True)


async def requested_results():
    from inspect_schedules import create as create_schedule
    from inspect_schedules import spec as schedule_spec
    from inspect_tasks import Model
    from ngertiin.schedules import dispatch as schedules
    from ngertiin.tasks import runtime as tasks
    from ngertiin.tasks import store as task_store
    from ngertiin.tasks import workflow

    owner, thread, _goal, candidate = await fixture()
    await delivery.deliver(candidate["id"])
    await configure(
        owner,
        intensity="quiet",
        quiet_enabled=True,
        quiet_start=0,
        quiet_end=1439,
        timezone="UTC",
    )
    # This account already used its sole quiet-intensity slot in the rolling day.
    schedule = await create_schedule(
        owner,
        thread,
        schedule_spec(frequency="once", start_date="2026-12-01", local_time="09:00"),
    )
    async with transaction() as conn:
        await chat.lock_account(conn, owner)
        occurrence = await schedules.admit(
            conn, schedule, datetime.now(UTC), manual_id=uuid4()
        )
    Model.mode = "normal"
    Model.started, Model.release = asyncio.Event(), asyncio.Event()
    with patch.object(workflow, "ChatOpenAI", Model):
        await tasks.run_task(str(occurrence["task_id"]))
    result = await task_store.detail(owner, occurrence["task_id"])
    check(
        "scheduled_result_survives_quiet_hours_and_proactive_cap",
        result["status"] == "succeeded" and bool(result["result"]),
    )
    async with transaction() as conn:
        counts = await one(
            conn,
            "SELECT (SELECT count(*) FROM task_deliveries WHERE task_id=%s) AS requested,"
            "(SELECT count(*) FROM proactive_deliveries WHERE owner_id=%s) AS proactive",
            (occurrence["task_id"], owner),
        )
    check(
        "scheduled_delivery_is_separate_and_not_charged_to_proactive_cap",
        counts["requested"] == 1 and counts["proactive"] == 1,
    )
