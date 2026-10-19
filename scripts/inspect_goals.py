"""Goal ownership, evidence, revisions and scheduled-work races in disposable PostgreSQL."""

import argparse
import asyncio
import json
import os
from datetime import UTC, datetime, timedelta
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

import httpx
import psycopg
from fastapi import HTTPException
from inspect_tasks import Model, owner
from ngertiin.async_db import close_pool, transaction
from ngertiin.config import get_settings
from ngertiin.goals import service, store
from ngertiin.goals.contracts import EvidenceInput, GoalRef, GoalSpec, ProposalInput
from ngertiin.schedules import dispatch
from ngertiin.schedules import service as schedules
from ngertiin.schedules import store as schedule_store
from ngertiin.schedules.contracts import ProposalInput as ScheduleProposal
from ngertiin.schedules.contracts import ScheduleSpec
from ngertiin.tasks import commands, creation, runtime, workflow
from ngertiin.tasks import store as tasks
from psycopg import sql
from pydantic import ValidationError
from sqlalchemy.engine import make_url

RESULTS: list[dict] = []


def check(name, valid):
    if not valid:
        raise AssertionError(name)
    RESULTS.append({"scenario": name, "passed": True})


async def rejected(name, operation, status):
    try:
        await operation
    except HTTPException as error:
        check(name, error.status_code == status)
    else:
        raise AssertionError(name)


def spec(**patch):
    return GoalSpec.model_validate(
        {
            "title": "Portofolio uji",
            "target": "Siapkan portofolio.",
            "criteria": ["CV ditinjau", "Studi kasus siap"],
            "next_action": "Tinjau CV",
            "budget_cap": 360000,
            **patch,
        }
    )


async def proposal(
    account, thread, op="create", goal=None, value=None, proof=None, key=None
):
    return await service.propose(
        account,
        ProposalInput(
            request_key=key or uuid4(),
            thread_id=thread,
            operation=op,
            goal_id=goal["id"] if goal else None,
            expected_revision=goal["revision"] if goal else None,
            spec=value or (spec() if op == "create" else None),
            evidence=proof,
        ),
    )


async def change(account, thread, goal, op, **kwargs):
    p = await proposal(account, thread, op, goal, **kwargs)
    result = await service.decide(account, p["id"], True)
    return await store.detail(account, result["goal_id"])


async def create(account, thread, value=None):
    return await change(account, thread, None, "create", value=value)


def ref(goal):
    return GoalRef(id=goal["id"], revision=goal["plan_revision"])


async def task(account, thread, goal, *, key=None):
    return await creation.create(
        account, thread, key or uuid4(), "Tulis satu draft CV.", False, goal=ref(goal)
    )


async def schedule(account, thread, goal):
    now = datetime.now(UTC) + timedelta(hours=1)
    value = ScheduleSpec(
        title="Tinjau tujuan",
        instruction="Tulis satu catatan.",
        timezone="UTC",
        frequency="interval",
        interval_hours=1,
        start_date=now.date(),
        local_time=now.strftime("%H:%M"),
        goal=ref(goal),
        per_run_cap=30000,
    )
    p = await schedules.propose(
        account,
        ScheduleProposal(
            request_key=uuid4(), thread_id=thread, operation="create", spec=value
        ),
    )
    await schedules.decide(account, p["id"], True)
    return (await schedule_store.listing(account))["schedules"][0]


async def lifecycle():
    a, thread = await owner()
    b, other_thread = await owner()
    key = uuid4()
    p = await proposal(a, thread, key=key)
    check("preview_does_not_create_goal", not (await store.listing(a))["goals"])
    same = await proposal(a, thread, key=key)
    check("proposal_request_key_idempotent", same["id"] == p["id"])
    await rejected(
        "request_key_changed_payload_rejected",
        proposal(a, thread, key=key, value=spec(title="Beda")),
        409,
    )
    await rejected("foreign_thread_rejected", proposal(a, other_thread), 404)
    await rejected("foreign_decision_rejected", service.decide(b, p["id"], True), 404)
    results = await asyncio.gather(
        *[service.decide(a, p["id"], True) for _ in range(5)]
    )
    goal = await store.detail(a, results[0]["goal_id"])
    check(
        "concurrent_decisions_create_once", len((await store.listing(a))["goals"]) == 1
    )
    check(
        "create_is_active_revision_one",
        goal["state"] == "active" and goal["revision"] == 1,
    )
    check(
        "goal_alone_has_no_work_or_grants", not goal["tasks"] and not goal["schedules"]
    )
    await rejected("opposite_decision_rejected", service.decide(a, p["id"], False), 409)
    await rejected("foreign_goal_read_rejected", store.detail(b, goal["id"]), 404)
    await rejected(
        "foreign_goal_mutation_rejected", proposal(b, other_thread, "pause", goal), 404
    )
    await rejected("foreign_goal_task_rejected", task(b, other_thread, goal), 404)
    await rejected(
        "cannot_complete_without_evidence", proposal(a, thread, "complete", goal), 409
    )
    pause = await proposal(a, thread, "pause", goal)
    archived = await proposal(a, thread, "archive", goal)
    await service.decide(a, pause["id"], True)
    await rejected(
        "stale_concurrent_decision_rejected",
        service.decide(a, archived["id"], True),
        409,
    )
    goal = await store.detail(a, goal["id"])
    check(
        "pause_keeps_plan_revision",
        goal["state"] == "paused" and goal["plan_revision"] == 1,
    )
    await rejected("pause_blocks_new_task", task(a, thread, goal), 409)
    goal = await change(a, thread, goal, "resume")
    check(
        "resume_preserves_target",
        goal["plan_revision"] == 1 and goal["spec"]["target"] == spec().target,
    )
    proof = EvidenceInput(criterion=0, state="met", note="Pengguna telah memeriksa CV.")
    goal = await change(a, thread, goal, "evidence", proof=proof)
    check(
        "user_report_explicitly_labeled",
        goal["met"] == 1 and goal["evidence"][0]["source"]["kind"] == "user_report",
    )
    goal = await change(
        a, thread, goal, "update", value=spec(next_action="Tinjau studi kasus.")
    )
    check(
        "next_action_edit_preserves_progress_and_target",
        goal["met"] == 1 and goal["plan_revision"] == 1,
    )
    goal = await change(
        a,
        thread,
        goal,
        "evidence",
        proof=proof.model_copy(
            update={"state": "in_progress", "note": "Perlu tinjauan lagi."}
        ),
    )
    async with transaction() as conn:
        await conn.execute(
            "UPDATE goal_evidence e SET created_at=now()-interval '1 day' "
            "FROM goal_proposals p WHERE p.id=e.proposal_id AND e.goal_id=%s "
            "AND p.expected_revision=%s",
            (goal["id"], goal["revision"] - 1),
        )
    check(
        "evidence_order_uses_revision_not_transaction_clock",
        (await store.detail(a, goal["id"]))["met"] == 0,
    )
    old_plan = goal["plan_revision"]
    goal = await change(a, thread, goal, "update", value=spec(target="Target baru."))
    check(
        "target_edit_resets_current_progress",
        goal["met"] == 0 and goal["plan_revision"] > old_plan,
    )
    check("target_edit_keeps_evidence_history", len(goal["evidence_history"]) == 2)
    p = await proposal(a, thread, "pause", goal)
    async with transaction() as conn:
        await conn.execute(
            "UPDATE goal_proposals SET expires_at=now()-interval '1 minute' WHERE id=%s",
            (p["id"],),
        )
    await rejected("expired_approval_rejected", service.decide(a, p["id"], True), 409)
    await service.decide(a, p["id"], False)
    check("expired_proposal_can_be_rejected", True)
    for index in range(2):
        goal = await change(
            a,
            thread,
            goal,
            "evidence",
            proof=proof.model_copy(update={"criterion": index}),
        )
    goal = await change(a, thread, goal, "complete")
    check(
        "completion_requires_explicit_decision",
        goal["state"] == "completed" and goal["met"] == 2,
    )
    await rejected("completed_blocks_task", task(a, thread, goal), 409)
    goal = await change(a, thread, goal, "archive")
    check(
        "archive_preserves_history",
        goal["state"] == "archived" and len(goal["history"]) >= 8,
    )
    goal = await change(a, thread, goal, "resume")
    check(
        "explicit_reopen_preserves_evidence",
        goal["state"] == "active" and goal["met"] == 2,
    )


async def task_evidence():
    a, thread = await owner()
    b, _ = await owner()
    goal = await create(a, thread)
    first = await task(a, thread, goal)
    second = await task(a, thread, goal)
    check(
        "many_tasks_share_exact_target",
        first["goal_revision"] == second["goal_revision"] == goal["plan_revision"],
    )
    detail = await tasks.detail(a, first["id"])
    check(
        "task_captures_immutable_goal_context",
        detail["input_snapshot"]["goal"]["spec"]["target"] == goal["spec"]["target"],
    )
    await rejected(
        "pending_task_cannot_prove_met",
        proposal(
            a,
            thread,
            "evidence",
            goal,
            proof=EvidenceInput(
                criterion=0, state="met", note="Belum selesai", task_id=first["id"]
            ),
        ),
        409,
    )
    await runtime.run_task(str(first["id"]))
    Model.mode = "fail"
    try:
        await runtime.run_task(str(second["id"]))
    finally:
        Model.mode = "normal"
    check(
        "failed_task_preserves_active_goal",
        (await tasks.detail(a, second["id"]))["status"] == "failed"
        and (await store.detail(a, goal["id"]))["state"] == "active",
    )
    proof = EvidenceInput(
        criterion=0, state="met", note="CV telah ditinjau.", task_id=first["id"]
    )
    await rejected(
        "foreign_evidence_source_rejected",
        proposal(
            a,
            thread,
            "evidence",
            goal,
            proof=proof.model_copy(update={"task_id": uuid4()}),
        ),
        404,
    )
    goal = await change(a, thread, goal, "evidence", proof=proof)
    check(
        "successful_task_not_goal_completion",
        goal["met"] == 1 and goal["state"] == "active",
    )
    await rejected(
        "failed_task_not_met",
        proposal(
            a,
            thread,
            "evidence",
            goal,
            proof=proof.model_copy(update={"task_id": second["id"]}),
        ),
        409,
    )
    p = await proposal(a, thread, "evidence", goal, proof=proof)
    async with transaction() as conn:
        await conn.execute(
            "UPDATE background_tasks SET result='changed' WHERE id=%s", (first["id"],)
        )
    await rejected(
        "changed_evidence_rejected_at_decision", service.decide(a, p["id"], True), 409
    )
    goal = await store.detail(a, goal["id"])
    check("changed_source_revokes_progress", goal["met"] == 0 and goal["needs_review"])
    await service.decide(a, p["id"], False)
    old_ref = ref(goal)
    goal = await change(
        a, thread, goal, "update", value=spec(target="Tiga studi kasus.")
    )
    await rejected(
        "stale_target_new_task_rejected",
        creation.create(a, thread, uuid4(), "Lama", False, goal=old_ref),
        409,
    )
    await rejected(
        "stale_target_retry_rejected", commands.retry(a, second["id"], uuid4()), 409
    )
    await rejected(
        "old_task_not_current_evidence",
        proposal(a, thread, "evidence", goal, proof=proof),
        409,
    )
    check(
        "old_task_intent_unchanged",
        (await tasks.detail(a, first["id"]))["goal_revision"] == old_ref.revision,
    )
    async with transaction() as conn:
        await conn.execute(
            "UPDATE background_tasks SET goal_id=NULL,goal_revision=NULL WHERE id=%s",
            (first["id"],),
        )
        rid = uuid4()
        await conn.execute(
            "INSERT INTO product_results(id,owner_id,thread_id,active_task_id,status,current_revision) VALUES (%s,%s,%s,%s,'ready',1)",
            (rid, a, thread, first["id"]),
        )
        await conn.execute(
            "INSERT INTO result_revisions(id,result_id,revision,task_id,task_revision,draft_hash,status,manifest) VALUES (%s,%s,1,%s,1,'fixture','ready','{\"files\": []}')",
            (uuid4(), rid, first["id"]),
        )
    proof = proof.model_copy(update={"result_id": rid, "result_revision": 1})
    goal = await change(a, thread, goal, "evidence", proof=proof)
    check(
        "result_evidence_pins_exact_revision",
        goal["evidence"][0]["source"]["result_revision"] == 1,
    )
    async with transaction() as conn:
        await conn.execute(
            "UPDATE product_results SET deleted_at=now() WHERE id=%s", (rid,)
        )
    goal = await store.detail(a, goal["id"])
    check("deleted_result_revokes_support", goal["met"] == 0 and goal["needs_review"])
    check("foreign_listing_has_no_goal", not (await store.listing(b))["goals"])


async def scheduled_work():
    a, thread = await owner()
    goal = await create(a, thread)
    sched = await schedule(a, thread, goal)
    due = sched["next_due"]
    await asyncio.gather(
        *[dispatch.dispatch_one(a, sched["id"], now=due) for _ in range(4)]
    )
    rows = (await schedule_store.listing(a))["occurrences"]
    check("due_race_creates_one_task", len(rows) == 1 and rows[0]["task_id"])
    created = await tasks.detail(a, rows[0]["task_id"])
    goal = await change(a, thread, goal, "pause")
    check(
        "pause_does_not_cancel_existing_task",
        (await tasks.detail(a, created["id"]))["status"] == "queued",
    )
    await runtime.run_task(str(created["id"]))
    await dispatch.dispatch_one(a, sched["id"], now=due + timedelta(hours=1))
    rows = (await schedule_store.listing(a))["occurrences"]
    check(
        "paused_goal_skips_due_with_reason",
        rows[0]["outcome"] == "skipped" and "Tujuan" in rows[0]["reason"],
    )
    goal = await change(a, thread, goal, "resume")
    late = due + timedelta(hours=20)
    await dispatch.dispatch_one(a, sched["id"], now=late)
    rows = (await schedule_store.listing(a))["occurrences"]
    check(
        "resume_coalesces_downtime_no_burst",
        len(rows) == 3 and rows[0]["task_id"] is not None,
    )
    await commands.cancel(a, rows[0]["task_id"])
    goal = await change(
        a, thread, goal, "update", value=spec(target="Target jadwal baru.")
    )
    await dispatch.dispatch_one(a, sched["id"], now=late + timedelta(hours=1))
    rows = (await schedule_store.listing(a))["occurrences"]
    check(
        "changed_goal_blocks_old_schedule",
        rows[0]["outcome"] == "skipped" and "Target" in rows[0]["reason"],
    )
    current = (await schedule_store.listing(a))["schedules"][0]
    revised = ScheduleSpec.model_validate(current["spec"]).model_copy(
        update={"goal": ref(goal)}
    )
    p = await schedules.propose(
        a,
        ScheduleProposal(
            request_key=uuid4(),
            thread_id=thread,
            operation="update",
            schedule_id=sched["id"],
            expected_revision=current["revision"],
            spec=revised,
        ),
    )
    await schedules.decide(a, p["id"], True)
    current = (await schedule_store.listing(a))["schedules"][0]
    await dispatch.dispatch_one(a, sched["id"], now=current["next_due"])
    rows = (await schedule_store.listing(a))["occurrences"]
    check(
        "reviewed_schedule_uses_new_target",
        rows[0]["task_id"] is not None
        and (await tasks.detail(a, rows[0]["task_id"]))["goal_revision"]
        == goal["plan_revision"],
    )
    await commands.cancel(a, rows[0]["task_id"])
    goal = await change(a, thread, goal, "archive")
    current = (await schedule_store.listing(a))["schedules"][0]
    await dispatch.dispatch_one(a, sched["id"], now=current["next_due"])
    check(
        "archived_goal_blocks_future_schedule",
        (await schedule_store.listing(a))["occurrences"][0]["outcome"] == "skipped",
    )


async def budgets_and_http():
    a, thread = await owner()
    goal = await create(a, thread, spec(budget_cap=30000))
    results = await asyncio.gather(
        task(a, thread, goal), task(a, thread, goal), return_exceptions=True
    )
    created = [r for r in results if isinstance(r, dict)]
    check(
        "concurrent_parent_budget_reserves_once",
        len(created) == 1 and created[0]["budget_cap"] == 30000,
    )
    check(
        "parent_cap_blocks_second_task",
        any(isinstance(r, HTTPException) and r.status_code == 429 for r in results),
    )
    await commands.cancel(a, created[0]["id"])
    key = uuid4()
    t = await task(a, thread, goal, key=key)
    goal = await change(a, thread, goal, "pause")
    check(
        "exact_task_replay_after_pause_is_receipt",
        (await task(a, thread, goal, key=key))["id"] == t["id"],
    )
    await commands.cancel(a, t["id"])
    await rejected("paused_retry_rejected", commands.retry(a, t["id"], uuid4()), 409)
    from ngertiin.accounts.auth import current_account
    from ngertiin.api.app import app

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        check(
            "goals_http_requires_auth", (await client.get("/goals")).status_code == 401
        )
        app.dependency_overrides[current_account] = lambda: SimpleNamespace(id=a)
        try:
            check("goals_http_list", (await client.get("/goals")).status_code == 200)
            check(
                "goals_http_detail",
                (await client.get(f"/goals/{goal['id']}")).status_code == 200,
            )
            body = ProposalInput(
                request_key=uuid4(), thread_id=thread, operation="create", spec=spec()
            ).model_dump(mode="json")
            check(
                "http_rejects_selected_owner",
                (
                    await client.post(
                        "/goals/proposals", json={**body, "owner_id": str(uuid4())}
                    )
                ).status_code
                == 422,
            )
        finally:
            app.dependency_overrides.clear()
    for name, patch in [
        ("blank_criterion", {"criteria": [" "]}),
        ("duplicate_criterion", {"criteria": ["A", "A"]}),
        ("budget_cannot_be_unlimited", {"budget_cap": 0}),
        ("reject_owner_in_spec", {"owner_id": str(uuid4())}),
    ]:
        try:
            spec(**patch)
        except ValidationError:
            check(name, True)
        else:
            raise AssertionError(name)


async def inherited_results_and_rollback():
    a, thread = await owner()
    goal = await create(a, thread, spec(budget_cap=30000))
    first = await task(a, thread, goal)
    rid = uuid4()
    async with transaction() as conn:
        await conn.execute(
            "UPDATE background_tasks SET status='succeeded',result='fixture',usage_units=10000 "
            "WHERE id=%s",
            (first["id"],),
        )
        await conn.execute(
            "INSERT INTO product_results(id,owner_id,thread_id,active_task_id,status,"
            "current_revision) VALUES (%s,%s,%s,%s,'ready',1)",
            (rid, a, thread, first["id"]),
        )
        await conn.execute(
            "INSERT INTO result_revisions(id,result_id,revision,task_id,task_revision,"
            "draft_hash,status,manifest) VALUES (%s,%s,1,%s,1,'fixture','ready',"
            '\'{"files": [], "inputs": [], "summary": "fixture"}\')',
            (uuid4(), rid, first["id"]),
        )
    updated = await creation.create(
        a,
        thread,
        uuid4(),
        "Perbarui hasil.",
        True,
        result_id=rid,
        expected_result_revision=1,
        outputs=[{"filename": "hasil.md", "format": "md"}],
    )
    check("result_update_inherits_parent_goal", updated["goal_id"] == goal["id"])
    check("result_update_uses_remaining_parent_budget", updated["budget_cap"] == 20000)
    await rejected(
        "result_update_cannot_escape_parent_cap",
        creation.create(
            a,
            thread,
            uuid4(),
            "Ulangi hasil.",
            True,
            result_id=rid,
            expected_result_revision=1,
            outputs=[{"filename": "hasil.md", "format": "md"}],
        ),
        429,
    )
    await commands.cancel(a, updated["id"])
    goal = await change(
        a,
        thread,
        goal,
        "update",
        value=spec(target="Target berbeda.", budget_cap=30000),
    )
    await rejected(
        "result_only_evidence_cannot_bypass_target",
        proposal(
            a,
            thread,
            "evidence",
            goal,
            proof=EvidenceInput(
                criterion=0,
                state="met",
                note="Sumber lama",
                result_id=rid,
                result_revision=1,
            ),
        ),
        409,
    )
    await rejected(
        "result_update_does_not_retarget_implicitly",
        creation.create(
            a,
            thread,
            uuid4(),
            "Lanjutkan hasil.",
            True,
            result_id=rid,
            expected_result_revision=1,
            outputs=[{"filename": "hasil.md", "format": "md"}],
        ),
        409,
    )
    previous = tasks.enqueue

    async def fail_enqueue(conn, value):
        raise RuntimeError("controlled queue failure")

    tasks.enqueue = fail_enqueue
    before = await store.detail(a, goal["id"])
    try:
        try:
            await task(a, thread, goal)
        except RuntimeError:
            check("queue_failure_exercised", True)
        else:
            raise AssertionError("queue_failure_exercised")
    finally:
        tasks.enqueue = previous
    after = await store.detail(a, goal["id"])
    check(
        "queue_failure_rolls_back_goal_work_and_budget",
        before["budget"] == after["budget"]
        and len(before["tasks"]) == len(after["tasks"]),
    )


async def scenarios():
    previous = workflow.ChatOpenAI
    workflow.ChatOpenAI = Model
    Model.mode = "normal"
    Model.started, Model.release = asyncio.Event(), asyncio.Event()
    Model.release.set()
    try:
        await lifecycle()
        await task_evidence()
        await scheduled_work()
        await budgets_and_http()
        await inherited_results_and_rollback()
        await chat_tool_validation()
    finally:
        workflow.ChatOpenAI = previous
        await close_pool()


async def chat_tool_validation():
    from ngertiin.goals.tools import tools_for

    a, thread = await owner()
    goal = await create(a, thread)
    read, preview = tools_for(
        {"id": uuid4(), "owner_id": a, "thread_id": thread, "lease_token": uuid4()}
    )
    response = await read.ainvoke({"goal_id": "NG-038"})
    check("chat_invalid_goal_id_is_recoverable_tool_feedback", "error" in response)
    response = await read.ainvoke({"goal_id": str(goal["id"])})
    check("chat_reads_owner_goal_exact_id", response["id"] == goal["id"])
    response = await preview.ainvoke(
        {"operation": "pause", "goal_id": "NG-038", "expected_revision": 1}
    )
    check("chat_invalid_mutation_id_is_recoverable", "error" in response)
    response = await preview.ainvoke(
        {"operation": "pause", "goal_id": str(goal["id"]), "expected_revision": 1}
    )
    check("chat_stale_run_cannot_prepare_goal_change", "error" in response)


def main():
    from ngertiin.db import get_engine
    from ngertiin.setup import setup_database

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path(".dev/goal-contracts.json"))
    args = parser.parse_args()
    settings = get_settings()
    if settings.app_env != "development":
        raise RuntimeError("Inspector requires development")
    original = settings.database_url.get_secret_value()
    previous = os.environ.get("DATABASE_URL")
    name = f"ngertiin_goal_probe_{uuid4().hex}"
    temporary = (
        make_url(original).set(database=name).render_as_string(hide_password=False)
    )
    with psycopg.connect(original, autocommit=True) as admin:
        admin.execute(
            sql.SQL("CREATE DATABASE {} TEMPLATE template0").format(
                sql.Identifier(name)
            )
        )
        try:
            os.environ["DATABASE_URL"] = temporary
            get_settings.cache_clear()
            setup_database()
            asyncio.run(scenarios())
        finally:
            get_engine().dispose()
            get_engine.cache_clear()
            if previous is None:
                os.environ.pop("DATABASE_URL", None)
            else:
                os.environ["DATABASE_URL"] = previous
            get_settings.cache_clear()
            admin.execute(
                sql.SQL("DROP DATABASE {} WITH (FORCE)").format(sql.Identifier(name))
            )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps({"passed": len(RESULTS), "scenarios": RESULTS}, indent=2) + "\n"
    )
    print(f"Goals: {len(RESULTS)} contracts passed")


if __name__ == "__main__":
    main()
