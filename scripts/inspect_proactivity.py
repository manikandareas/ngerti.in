"""Proactive evidence, decision, revocation and cost contracts in disposable PostgreSQL."""

import argparse
import asyncio
import json
import os
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4

import httpx
import psycopg
from fastapi import HTTPException
from inspect_goals import change, create, spec
from inspect_memory import capture, message
from inspect_tasks import owner
from ngertiin.async_db import close_pool, transaction
from ngertiin.chat.store import json_value, one
from ngertiin.config import get_settings
from ngertiin.memory import service as memories
from ngertiin.memory.contracts import ForgetInput
from ngertiin.proactivity import evidence, jobs, policy, providers, runtime, store
from ngertiin.proactivity.contracts import Candidate
from psycopg import sql
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


async def enabled():
    account, thread = await owner()
    await store.configure(account, True, 1)
    return account, thread


class Provider:
    def __init__(self, mode="normal"):
        self.mode = mode
        self.calls: list[str] = []
        self.started = asyncio.Event()
        self.release = asyncio.Event()
        self.requests: list[dict] = []

    def candidate(self, state, second=False):
        source = next(
            (e for e in state["evidence"] if e["kind"] == "goal"), state["evidence"][0]
        )
        return {
            "kind": "goal_next_step",
            "title": "Tinjau bahan portofolio",
            "action": "Mau menyusun kerangka studi kasus?"
            if second
            else "Mau meninjau CV?",
            "why_relevant": "Mendukung target portofolio yang kamu tetapkan.",
            "why_now": "Ada langkah berikutnya yang belum dikerjakan.",
            "what_is_new": "Bahan dapat diubah menjadi satu draft terstruktur.",
            "evidence_ids": [source["key"]],
            "thread_id": source["thread_id"],
            "expires_in_hours": 12,
        }

    async def handle(self, request):
        body = json.loads(request.content)
        stage = "judge" if request.url.host == "api.typesafe.ai" else "generate"
        self.calls.append(stage)
        self.requests.append(body)
        if self.mode == "hold_" + stage:
            self.started.set()
            await self.release.wait()
        if self.mode == "fail_" + stage:
            raise httpx.ReadTimeout("controlled unknown outcome")
        if stage == "generate":
            state = json.loads(body["messages"][1]["content"])
            candidates = [self.candidate(state)]
            if self.mode == "empty":
                candidates = []
            elif self.mode == "two":
                candidates.append(self.candidate(state, True))
            elif self.mode == "foreign":
                candidates[0]["thread_id"] = str(uuid4())
            elif self.mode == "missing_evidence":
                candidates[0]["evidence_ids"] = ["goal:" + str(uuid4())]
            return httpx.Response(
                200,
                json={
                    "choices": [
                        {"message": {"content": json.dumps({"candidates": candidates})}}
                    ],
                    "usage": {
                        "total_tokens": 240,
                        "prompt_tokens": 200,
                        "completion_tokens": 40,
                    },
                },
            )
        answers = {}
        for key, question in body["questions"].items():
            if question["type"] == "score":
                score = 0 if self.mode == "two" and key.startswith("c0_") else 2
                answers[key] = {
                    "type": "score",
                    "score": score,
                    "confidence": 1,
                    "probabilities": {str(i): int(i == score) for i in range(3)},
                }
                if self.mode == "uncertain":
                    answers[key] = {
                        "type": "score",
                        "score": 1,
                        "confidence": 0,
                        "probabilities": {"0": 0.5, "1": 0, "2": 0.5},
                    }
                if self.mode == "invalid_score":
                    answers[key]["score"] = float("nan")
            else:
                value = (
                    0.1 if self.mode == "repeat" and key.endswith("_novel") else 0.99
                )
                if self.mode == "ungrounded" and key.endswith("_grounded"):
                    value = 0.1
                answers[key] = {"type": "noul", "noul": value}
        return httpx.Response(
            200,
            json={
                "model": "jev-1.13.0",
                "answers": answers,
                "usage": {"input_tokens": 300, "output_tokens": 60},
            },
        )

    def transport(self):
        original = httpx.AsyncClient
        return patch.object(
            providers.httpx,
            "AsyncClient",
            side_effect=lambda **kw: original(
                transport=httpx.MockTransport(self.handle), **kw
            ),
        )


async def setup_goal():
    account, thread = await enabled()
    goal = await create(account, thread)
    return account, thread, goal


async def lifecycle():
    a, thread = await owner()
    check("preview_is_opt_in", not (await store.listing(a))["controls"]["enabled"])
    await rejected("disabled_evaluation_rejected", store.request(a), 409)
    config = await store.configure(a, True, 1)
    check(
        "enable_does_not_enable_delivery",
        not (await store.listing(a))["delivery_enabled"],
    )
    check("enable_retry_same_receipt", (await store.configure(a, True, 1)) == config)
    await rejected("stale_controls_rejected", store.configure(a, False, 1), 409)
    empty = await store.request(a)
    check("no_evidence_is_durable_no_op", empty["status"] == "no_op")
    check("no_evidence_reuses_receipt", (await store.request(a))["id"] == empty["id"])
    b, other = await enabled()
    await rejected("foreign_thread_cannot_be_evaluated", store.request(a, other), 404)
    await rejected("foreign_receipt_cannot_be_read", store.detail(b, empty["id"]), 404)
    await create(a, thread)
    probe = Provider()
    row = await store.request(a)
    with probe.transport():
        await asyncio.gather(*[runtime.process(row["id"]) for _ in range(5)])
    result = await store.detail(a, row["id"])
    items = (await store.listing(a))["candidates"]
    check("five_workers_claim_one_evaluation", probe.calls == ["generate", "judge"])
    check("llm_then_jev_then_code_selects", result["status"] == "selected")
    check(
        "at_most_one_eligible_candidate",
        sum(c["state"] == "eligible" for c in items) == 1,
    )
    check(
        "candidate_has_thread_expiry_and_references",
        items[0]["thread_id"] == thread
        and bool(items[0]["evidence_refs"])
        and items[0]["expires_at"] > datetime.now(UTC),
    )
    check(
        "raw_questions_and_judgments_are_auditable",
        result["judgments"]["questions"]
        and result["judgments"]["answers"][0]["novel"]["noul"] == 0.99,
    )
    check(
        "each_stage_has_confirmed_usage",
        len(result["cost_events"]) == 2
        and all(c["state"] == "confirmed" for c in result["cost_events"]),
    )
    check(
        "generation_and_judgment_models_separate",
        result["cost_events"][1]["model"].startswith("jev"),
    )
    check(
        "unchanged_evidence_reuses_selected_receipt",
        (await store.request(a))["id"] == row["id"],
    )
    async with transaction() as conn:
        count = await one(
            conn,
            "SELECT count(*) AS n FROM chat_messages WHERE thread_id=%s",
            (thread,),
        )
        check("evaluation_never_sends_a_chat_message", count["n"] == 0)
        await conn.execute(
            "UPDATE proactive_candidates SET expires_at=now()-interval '1 second' "
            "WHERE evaluation_id=%s",
            (row["id"],),
        )
    check(
        "expired_candidate_is_not_eligible",
        (await store.listing(a))["candidates"][0]["state"] == "expired",
    )
    current_revision = (await store.listing(a))["controls"]["revision"]
    disabled = await store.configure(a, False, current_revision)
    check(
        "disable_retry_same_receipt",
        (await store.configure(a, False, current_revision)) == disabled,
    )
    purged = await store.detail(a, row["id"])
    check(
        "disable_fences_and_purges_context",
        purged["status"] == "invalidated"
        and not purged["snapshot"]
        and purged["generated"] is None,
    )
    await store.configure(a, True, disabled["revision"])
    check(
        "reenable_allows_fresh_evaluation_after_revocation",
        (await store.request(a))["id"] != row["id"],
    )


async def judgments():
    for mode, expected in (
        ("empty", "no_op"),
        ("two", "selected"),
        ("repeat", "no_op"),
        ("uncertain", "no_op"),
        ("ungrounded", "no_op"),
        ("foreign", "no_op"),
        ("missing_evidence", "no_op"),
    ):
        a, _, _ = await setup_goal()
        probe = Provider(mode)
        row = await store.request(a)
        with probe.transport():
            await runtime.process(row["id"])
        detail = await store.detail(a, row["id"])
        check(mode + "_decision", detail["status"] == expected)
        if mode in ("empty", "foreign", "missing_evidence"):
            check(mode + "_avoids_unnecessary_jev_call", probe.calls == ["generate"])
        if mode == "two":
            selected = next(
                c
                for c in (await store.listing(a))["candidates"]
                if c["state"] == "eligible"
            )
            check(
                "ranking_prefers_helpful_over_merely_related",
                "studi kasus" in selected["payload"]["action"],
            )
        if mode == "repeat":
            item = (await store.listing(a))["candidates"][0]
            check(
                "novelty_cannot_be_compensated_by_other_scores",
                item["reason"] == "low_novel",
            )


async def failures_and_budgets():
    a, _, _ = await setup_goal()
    probe = Provider("fail_judge")
    row = await store.request(a)
    with probe.transport():
        await runtime.process(row["id"])
        await runtime.process(row["id"])
    result = await store.detail(a, row["id"])
    check("provider_failure_is_not_no_op", result["status"] == "failed")
    unknown = next(c for c in result["cost_events"] if c["stage"] == "judge")
    check(
        "unknown_outcome_retains_reservation",
        unknown["state"] == "unknown"
        and unknown["charged_units"] == unknown["reserved_units"],
    )
    check(
        "failed_stage_never_replayed_automatically",
        probe.calls == ["generate", "judge"],
    )
    check("retry_reuses_failure_receipt", (await store.request(a))["id"] == row["id"])
    b, _, _ = await setup_goal()
    invalid = Provider("invalid_score")
    row = await store.request(b)
    # NaN cannot be encoded by httpx JSON; that itself is a provider failure.
    with invalid.transport():
        await runtime.process(row["id"])
    check(
        "invalid_judgment_never_selected",
        (await store.detail(b, row["id"]))["status"] == "failed",
    )
    c, _, _ = await setup_goal()
    row = await store.request(c)
    settings = get_settings()
    original = settings.proactive_account_daily_units
    try:
        settings.proactive_account_daily_units = 1
        probe = Provider()
        with probe.transport():
            await runtime.process(row["id"])
        result = await store.detail(c, row["id"])
        check(
            "account_budget_blocks_before_network",
            not probe.calls and result["reason"] == "budget_exhausted",
        )
    finally:
        settings.proactive_account_daily_units = original
    d, _, _ = await setup_goal()
    row = await store.request(d)
    job = await runtime.claim(row["id"])
    await providers.reserve(job, "generate", "probe", {})
    try:
        await providers.reserve(job, "generate", "probe", {})
    except providers.EvaluationUnavailable:
        check("stage_reservation_cannot_be_repeated", True)
    else:
        raise AssertionError("duplicate stage accepted")
    async with transaction() as conn:
        await conn.execute(
            "UPDATE proactive_evaluations SET lease_until=now()-interval '1 second' "
            "WHERE id=%s",
            (row["id"],),
        )
    await jobs.recover()
    result = await store.detail(d, row["id"])
    check("worker_crash_becomes_interrupted", result["reason"] == "interrupted")
    check(
        "orphan_reservation_becomes_unknown",
        result["cost_events"][0]["state"] == "unknown",
    )


async def revocation():
    a, thread, goal = await setup_goal()
    row = await store.request(a)
    probe = Provider("hold_judge")
    with probe.transport():
        running = asyncio.create_task(runtime.process(row["id"]))
        await asyncio.wait_for(probe.started.wait(), 10)
        await change(a, thread, goal, "pause")
        probe.release.set()
        await running
    result = await store.detail(a, row["id"])
    check(
        "goal_pause_during_inference_fences_publication",
        result["status"] == "invalidated",
    )
    check(
        "goal_pause_purges_all_model_context",
        not result["snapshot"] and result["generated"] is None,
    )
    b, bthread, goal = await setup_goal()
    entry, _, _ = await capture(b, bthread, "Saya tinggal di Makassar.")
    row = await store.request(b)
    check(
        "memory_canonical_revision_in_context",
        any(r["kind"] == "memory" for r in row["snapshot"]["refs"]),
    )
    probe = Provider("hold_generate")
    with probe.transport():
        running = asyncio.create_task(runtime.process(row["id"]))
        await asyncio.wait_for(probe.started.wait(), 10)
        await memories.forget(
            b, entry["id"], ForgetInput(request_key=uuid4(), expected_revision=1)
        )
        probe.release.set()
        await running
    result = await store.detail(b, row["id"])
    check(
        "forget_during_generation_blocks_jev_and_publication",
        probe.calls == ["generate"] and result["status"] == "invalidated",
    )
    check(
        "forget_purges_unselected_drafts_and_snapshot",
        not result["snapshot"] and result["generated"] is None,
    )
    next_row = await store.request(b)
    check(
        "forgotten_turn_does_not_reappear_as_chat_evidence",
        "Makassar" not in json.dumps(next_row["snapshot"]),
    )
    c, _cthread, goal = await setup_goal()
    row = await store.request(c)
    probe = Provider()
    with probe.transport():
        await runtime.process(row["id"])
    async with transaction() as conn:
        await conn.execute(
            "UPDATE user_goals SET revision=revision+1,spec=%s WHERE id=%s",
            (json_value(spec(target="Target berubah").model_dump()), goal["id"]),
        )
    check(
        "canonical_readback_detects_missed_event",
        not any(
            c["state"] == "eligible" for c in (await store.listing(c))["candidates"]
        ),
    )


async def budget_races_and_task_sources():
    from ngertiin.tasks import creation

    a, thread, _ = await setup_goal()
    task = await creation.create(
        a, thread, uuid4(), "Summarize the release changelog.", False
    )
    async with transaction() as conn:
        await conn.execute(
            "UPDATE background_tasks SET status='succeeded',"
            "result='A new CSV export feature is ready.' WHERE id=%s",
            (task["id"],),
        )
        source = await evidence.read(conn, a, "task", task["id"])
        check(
            "succeeded_task_is_exact_evidence", source and source["content"]["result"]
        )
        check(
            "foreign_task_source_unavailable",
            await evidence.read(conn, uuid4(), "task", task["id"]) is None,
        )
        check(
            "exact_task_reference_is_current", await evidence.valid(conn, a, [source])
        )
        await conn.execute(
            "UPDATE background_tasks SET result='Changed' WHERE id=%s", (task["id"],)
        )
        check(
            "task_result_mutation_invalidates_reference",
            not await evidence.valid(conn, a, [source]),
        )
        snapshot = await evidence.collect(conn, a, thread)
        check(
            "internal_goal_budget_not_sent_as_money",
            "budget_cap" not in json.dumps(snapshot),
        )
    row = await store.request(a)
    job = await runtime.claim(row["id"])
    identity = await providers.reserve(job, "generate", "probe", {})
    async with transaction() as conn:
        await conn.execute(
            "UPDATE proactive_cost_events SET created_at=now()-interval '1 day' "
            "WHERE id=%s",
            (identity,),
        )
    settings = get_settings()
    previous = settings.proactive_evaluation_units
    try:
        settings.proactive_evaluation_units = 15000
        try:
            await providers.reserve(job, "judge", "probe", {})
        except providers.EvaluationUnavailable as error:
            check(
                "evaluation_budget_survives_utc_midnight",
                str(error) == "budget_exhausted",
            )
        else:
            raise AssertionError("midnight bypassed evaluation cap")
    finally:
        settings.proactive_evaluation_units = previous
    await providers.settle(identity, {"total_tokens": 50000})
    result = await store.detail(a, row["id"])
    check(
        "confirmed_usage_over_reservation_is_not_underreported",
        result["cost_events"][0]["charged_units"] == 50000,
    )
    owners = [await setup_goal(), await setup_goal()]
    claimed = [await runtime.claim((await store.request(o[0]))["id"]) for o in owners]
    async with transaction() as conn:
        used = await one(
            conn,
            "SELECT COALESCE(sum(charged_units),0) AS n "
            "FROM proactive_cost_events WHERE created_at>=date_trunc('day',"
            "now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'",
        )
    previous = settings.proactive_global_daily_units
    try:
        settings.proactive_global_daily_units = used["n"] + 10002
        results = await asyncio.gather(
            *[providers.reserve(j, "generate", "probe", {}) for j in claimed],
            return_exceptions=True,
        )
        check(
            "global_budget_two_account_race_is_atomic",
            sum(isinstance(r, providers.EvaluationUnavailable) for r in results) == 1,
        )
    finally:
        settings.proactive_global_daily_units = previous


async def source_and_http():
    a, thread, goal = await setup_goal()
    await message(
        a, thread, "API key saya adalah sk-secret-value-that-must-not-be-used"
    )
    async with transaction() as conn:
        value = await evidence.collect(conn, a)
    check("credential_text_not_sent_to_models", "sk-secret" not in json.dumps(value))
    check(
        "context_is_bounded",
        len(value["refs"]) <= 20 and len(json.dumps(value).encode()) < 25000,
    )
    check(
        "ambiguous_horizon_has_no_deadline", evidence.deadline("segera selesai") is None
    )
    check(
        "timezone_missing_is_not_a_deadline",
        evidence.deadline("2026-10-20T09:00:00") is None,
    )
    exact = (datetime.now(UTC) + timedelta(hours=3)).isoformat()
    goal = await change(a, thread, goal, "update", value=spec(horizon=exact))
    row = await store.request(a)
    check("exact_horizon_enables_time_window", bool(row["snapshot"]["time_window"]))
    candidate = Candidate.model_validate(Provider().candidate(row["snapshot"]))
    question_set = policy.questions([candidate])
    check(
        "questions_name_the_candidate_in_instructions",
        all("candidates[0]" in q["instructions"] for q in question_set.values()),
    )
    from types import SimpleNamespace

    from ngertiin.accounts.auth import current_account
    from ngertiin.api.app import app

    app.dependency_overrides[current_account] = lambda: SimpleNamespace(id=a)
    settings = get_settings()
    previous = settings.enable_dev_diagnostics
    try:
        settings.enable_dev_diagnostics = True
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://probe"
        ) as client:
            response = await client.get("/dev/proactivity")
            check("authenticated_inspection_api", response.status_code == 200)
            response = await client.get("/dev/proactivity/evaluations/" + str(uuid4()))
            check("unknown_evaluation_404", response.status_code == 404)
            response = await client.post(
                "/dev/proactivity/evaluations", json={"owner_id": str(uuid4())}
            )
            check("client_cannot_override_owner", response.status_code == 422)
            settings.enable_dev_diagnostics = False
            response = await client.get("/dev/proactivity")
            check(
                "inspection_is_hidden_outside_diagnostics", response.status_code == 404
            )
    finally:
        settings.enable_dev_diagnostics = previous
        app.dependency_overrides.clear()


async def live_probe():
    cases = [
        (
            "indonesian_budget",
            spec(
                title="Proposal hibah usaha",
                target="Siapkan proposal hibah usaha katering.",
                criteria=["Kerangka proposal siap", "Anggaran mencakup semua syarat"],
                next_action="Tinjau syarat terbaru sebelum menyusun anggaran.",
            ),
            (
                "Saya baru menemukan syarat resmi: proposal hibah wajib melampirkan "
                "rincian biaya kemasan ramah lingkungan. Anggaran saya saat ini hanya "
                "mencakup bahan baku. Saya belum tahu cara menambahkan bagian kemasan."
            ),
        ),
        (
            "english_release_notes",
            spec(
                title="Release notes 2.1",
                target="Prepare release notes for version 2.1.",
                criteria=["New features documented", "Release notes draft ready"],
                next_action="Review the latest changelog before drafting.",
            ),
            (
                "The changelog now includes a new CSV export feature. My release-notes "
                "draft only lists search and login fixes. I have not added a CSV export section yet."
            ),
        ),
    ]
    outputs = []
    for label, goal_spec, text in cases:
        a, thread = await enabled()
        await create(a, thread, goal_spec)
        await message(a, thread, text)
        row = await worker_evaluation(a)
        result = await store.detail(a, row["id"])
        details = await store.listing(a)
        outputs.append(
            {
                "case": label,
                "status": result["status"],
                "reason": result["reason"],
                "generated": result["generated"],
                "judgments": result["judgments"],
                "candidates": details["candidates"],
                "cost_events": result["cost_events"],
            }
        )
        Path(".dev").mkdir(exist_ok=True)
        Path(".dev/proactive-live-readback.json").write_text(
            json.dumps(outputs, default=str, indent=2) + "\n"
        )
        check(
            "live_" + label + "_providers_completed",
            result["status"] in ("selected", "no_op"),
        )
        check(
            "live_" + label + "_usage_confirmed",
            bool(result["cost_events"])
            and all(c["state"] == "confirmed" for c in result["cost_events"]),
        )
    check(
        "live_at_least_one_grounded_offer_selected",
        any(r["status"] == "selected" for r in outputs),
    )
    check(
        "live_jev_called",
        any(c["stage"] == "judge" for r in outputs for c in r["cost_events"]),
    )
    return outputs


async def worker_evaluation(account):
    """A separate process consumes the real persisted job in the disposable database."""
    configure = jobs.evaluate_job.configure
    with patch.object(
        jobs.evaluate_job,
        "configure",
        side_effect=lambda **kw: configure(queue="proactive-live", **kw),
    ):
        row = await store.request(account)
    source = """
import asyncio
import ngertiin.proactivity.jobs
from ngertiin.worker.queue import queue_app
async def main():
    async with queue_app.open_async():
        await queue_app.run_worker_async(queues=['proactive-live'], concurrency=1,
                                         name='proactive-acceptance', shutdown_graceful_timeout=5)
asyncio.run(main())
"""
    Path(".dev").mkdir(exist_ok=True)
    log = await asyncio.to_thread(Path(".dev/proactive-live-worker.log").open, "a")
    try:
        worker = await asyncio.create_subprocess_exec(
            sys.executable, "-c", source, stdout=log, stderr=log, env=dict(os.environ)
        )
        try:
            async with asyncio.timeout(150):
                while True:
                    current = await store.detail(account, row["id"])
                    if current["status"] not in ("queued", "running"):
                        break
                    if worker.returncode is not None:
                        raise AssertionError(
                            "Acceptance worker exited before completing evaluation"
                        )
                    await asyncio.sleep(0.25)
            check(
                "live_queue_worker_completed_" + str(len(RESULTS)),
                current["status"] in ("selected", "no_op"),
            )
        finally:
            if worker.returncode is None:
                worker.terminate()
                try:
                    await asyncio.wait_for(worker.wait(), 10)
                except TimeoutError:
                    worker.kill()
                    await worker.wait()
    finally:
        await asyncio.to_thread(log.close)
    return row


async def scenarios(live):
    try:
        await lifecycle()
        await judgments()
        await failures_and_budgets()
        await revocation()
        await source_and_http()
        await budget_races_and_task_sources()
        return await live_probe() if live else None
    finally:
        await close_pool()


def main():
    from ngertiin.db import get_engine
    from ngertiin.setup import setup_database

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--live", action="store_true")
    parser.add_argument(
        "--output", type=Path, default=Path(".dev/proactive-contracts.json")
    )
    args = parser.parse_args()
    settings = get_settings()
    if settings.app_env != "development":
        raise RuntimeError("Inspector requires development")
    original = settings.database_url.get_secret_value()
    previous = os.environ.get("DATABASE_URL")
    name = "ngertiin_proactive_probe_" + uuid4().hex
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
            live = asyncio.run(scenarios(args.live))
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
        json.dumps(
            {"passed": len(RESULTS), "scenarios": RESULTS, "live": live},
            indent=2,
            default=str,
        )
        + "\n"
    )
    print(f"Proactivity: {len(RESULTS)} contracts passed")


if __name__ == "__main__":
    main()
