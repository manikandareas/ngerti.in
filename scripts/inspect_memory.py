"""Memory lifecycle probes in a disposable PostgreSQL database, optionally with real Mem0."""

import argparse
import asyncio
import json
import os
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4

import psycopg
from fastapi import HTTPException
from inspect_tasks import owner
from ngertiin.async_db import close_pool, transaction
from ngertiin.chat.store import json_value, one
from ngertiin.config import get_settings
from ngertiin.memory import jobs, policy, service, sources, store
from ngertiin.memory.contracts import Candidate, EditInput, ForgetInput, SettingsInput
from ngertiin.memory.invalidation import filter_history, valid
from ngertiin.memory.recall import context, recall
from psycopg import sql
from sqlalchemy.engine import make_url

RESULTS = []


def check(name, okay):
    if not okay:
        raise AssertionError(name)
    RESULTS.append({"scenario": name, "passed": True})


async def rejected(name, operation, status):
    try:
        await operation
    except HTTPException as error:
        check(name, error.status_code == status)
    else:
        raise AssertionError(name)


async def message(account, thread, text):
    mid = uuid4()
    async with transaction() as conn:
        await conn.execute(
            "INSERT INTO chat_messages(id,thread_id,role,parts,status,position) "
            "VALUES (%s,%s,'user',%s,'complete',"
            "(SELECT COALESCE(max(position),0)+1 FROM chat_messages WHERE thread_id=%s))",
            (mid, thread, json_value([{"type": "text", "text": text}]), thread),
        )
        await conn.execute(
            "UPDATE chat_threads SET seq=(SELECT COALESCE(max(position),0)+1 "
            "FROM chat_messages WHERE thread_id=%s) WHERE id=%s",
            (thread, thread),
        )
    return mid


async def capture(
    account, thread, text, *, key="user.residence_city", change="new", confidence=0.95
):
    mid = await message(account, thread, text)
    request = await service.enqueue_source(account, "message", mid)
    candidate = Candidate(
        key=key,
        kind="fact",
        statement=text,
        anchor=text,
        confidence=confidence,
        change=change,
    )
    with (
        patch.object(jobs, "extract", return_value=[text]),
        patch.object(
            jobs,
            "admit",
            return_value={"memories": [candidate.model_dump(mode="json")]},
        ),
        patch.object(jobs, "cleanup"),
    ):
        await jobs.process_capture(request["id"])
    async with transaction() as conn:
        entry = await one(
            conn,
            "SELECT * FROM memory_entries WHERE owner_id=%s AND statement=%s ORDER BY updated_at DESC LIMIT 1",
            (account, text),
        )
    return entry, mid, request


async def scenarios(live=False):
    a, thread = await owner()
    b, bthread = await owner()
    try:
        entry, mid, request = await capture(a, thread, "Saya tinggal di Makassar.")
        check(
            "typed_fact_with_owner", entry["kind"] == "fact" and entry["owner_id"] == a
        )
        async with transaction() as conn:
            revision = await store.current_revision(conn, entry)
            refs = await store.evidence(conn, a, revision["id"])
            check(
                "exact_source_revision_hash_anchor",
                refs[0]["source_id"] == mid
                and refs[0]["anchor"] == entry["statement"]
                and refs[0]["source_revision"] == "1",
            )
            check("active_evidence_is_usable", await store.usable(conn, a, revision))
            check(
                "foreign_listing_empty", not (await store.listing(conn, b))["entries"]
            )
        check(
            "capture_idempotency",
            (await service.enqueue_source(a, "message", mid))["id"] == request["id"],
        )
        with patch(
            "ngertiin.memory.recall.semantic", side_effect=RuntimeError("unavailable")
        ):
            value = await recall(a, "Makassar")
        check(
            "lexical_fallback_when_embedding_fails",
            value["memories"][0]["statement"] == entry["statement"],
        )
        check(
            "context_budget_includes_envelope",
            len(context(value).encode()) <= get_settings().memory_context_bytes,
        )
        async with transaction() as conn:
            await rejected(
                "foreign_history_404", store.history(conn, b, entry["id"]), 404
            )
        edit = EditInput(
            request_key=uuid4(),
            expected_revision=entry["revision"],
            statement="Saya tinggal di Denpasar.",
            kind="fact",
            change="change",
        )
        await rejected("foreign_edit_404", service.correct(b, entry["id"], edit), 404)
        receipt = await service.correct(a, entry["id"], edit)
        check("explicit_edit_increments_revision", receipt["revision"] == 2)
        check(
            "edit_retry_same_receipt",
            await service.correct(a, entry["id"], edit) == receipt,
        )
        await rejected(
            "stale_edit_409",
            service.correct(
                a, entry["id"], edit.model_copy(update={"request_key": uuid4()})
            ),
            409,
        )
        await rejected(
            "reused_key_new_content_409",
            service.correct(
                a, entry["id"], edit.model_copy(update={"statement": "Other city"})
            ),
            409,
        )
        async with transaction() as conn:
            history = await store.history(conn, a, entry["id"])
            check(
                "world_change_preserves_historical_truth",
                history["revisions"][1]["status"] == "historical"
                and history["revisions"][1]["valid_to"] is not None,
            )
            check(
                "previous_revision_no_longer_valid_current_context",
                not await valid(conn, a, value["generation"], value["references"]),
            )
        correction = edit.model_copy(
            update={
                "request_key": uuid4(),
                "expected_revision": 2,
                "statement": "Saya tinggal di Ubud.",
                "change": "correction",
            }
        )
        await service.correct(a, entry["id"], correction)
        async with transaction() as conn:
            history = await store.history(conn, a, entry["id"])
            check(
                "correction_not_historical_truth",
                history["revisions"][1]["status"] == "corrected",
            )
        uncertain, _, _ = await capture(
            a,
            thread,
            "Saya mungkin menyukai kimia.",
            key="user.interest",
            confidence=0.6,
        )
        check("uncertain_candidate_not_active", uncertain["status"] == "candidate")
        async with transaction() as conn:
            check(
                "candidate_not_usable",
                not await store.usable(
                    conn, a, await store.current_revision(conn, uncertain)
                ),
            )
        secret = await message(
            a, thread, "API key saya: sk-test-abcdefghijklmnopqrstuvwxyz123456"
        )
        check(
            "secret_rejected_before_inference",
            (await service.enqueue_source(a, "message", secret))["status"] == "skipped",
        )
        forgotten = await message(a, thread, "Lupakan kota tempat saya tinggal.")
        check(
            "forget_request_not_captured",
            (await service.enqueue_source(a, "message", forgotten))["status"]
            == "skipped",
        )
        body = ForgetInput(request_key=uuid4(), expected_revision=3)
        await rejected("foreign_forget_404", service.forget(b, entry["id"], body), 404)
        receipt = await service.forget(a, entry["id"], body)
        check("forget_revokes_immediately", receipt["status"] == "forgotten")
        check(
            "forget_retry_same_receipt",
            await service.forget(a, entry["id"], body) == receipt,
        )
        async with transaction() as conn:
            history = await store.history(conn, a, entry["id"])
            check(
                "history_plaintext_erased",
                all(row["statement"] is None for row in history["revisions"]),
            )
            check(
                "evidence_anchor_erased",
                all(
                    ref["anchor"] is None
                    for row in history["revisions"]
                    for ref in row["evidence"]
                ),
            )
            check(
                "source_exclusion_durable",
                bool(
                    await one(
                        conn,
                        "SELECT 1 FROM memory_excluded_sources WHERE source_id=%s",
                        (mid,),
                    )
                ),
            )
            job = await one(
                conn, "SELECT * FROM memory_capture_jobs WHERE id=%s", (request["id"],)
            )
            check(
                "capture_payload_erased",
                job["candidates"] is None and job["admitted"] is None,
            )
            check(
                "suppression_durable",
                bool(
                    await one(
                        conn,
                        "SELECT 1 FROM memory_suppressions WHERE owner_id=%s AND active",
                        (a,),
                    )
                ),
            )
        check(
            "forgotten_source_replay_skipped",
            (await service.enqueue_source(a, "message", mid))["status"] == "skipped",
        )
        replay, _, _ = await capture(a, thread, "Saya tinggal di Makassar.")
        check("same_topic_new_capture_not_resurrected", replay is None)
        filtered = await filter_history(a, [{"id": mid, "role": "user", "parts": []}])
        check("forgotten_source_not_rehydrated", not filtered)
        async with transaction() as conn:
            config = await store.settings(conn, a)
        toggle = SettingsInput(
            request_key=uuid4(),
            expected_revision=config["revision"],
            capture_enabled=False,
        )
        updated = await service.configure(a, toggle)
        check(
            "capture_toggle_idempotent", await service.configure(a, toggle) == updated
        )
        new_source = await message(a, thread, "Saya bekerja sebagai penulis.")
        check(
            "capture_off_blocks_new_job",
            (await service.enqueue_source(a, "message", new_source))["status"]
            == "skipped",
        )
        await rejected(
            "stale_toggle_409",
            service.configure(a, toggle.model_copy(update={"request_key": uuid4()})),
            409,
        )
        check(
            "rrf_preserves_independent_lexical_candidates",
            set(policy.fuse(["a"], ["b"])) == {"a", "b"},
        )
        check(
            "unicode_budget_never_splits_invalid_utf8",
            len(policy.bounded("🙂" * 20, 31).encode()) <= 31,
        )
        await capture(b, bthread, "Saya menyukai teh.", key="user.beverage")
        # Lost projection receipts cannot make an unregistered SDK record authoritative.
        with patch("ngertiin.memory.recall.semantic", return_value=[str(uuid4())]):
            check(
                "orphan_vector_never_recalled",
                not (await recall(b, "orphan"))["memories"],
            )
        shared = await message(b, bthread, "Saya bekerja sebagai penulis.")
        queued = await asyncio.gather(
            service.enqueue_source(b, "message", shared),
            service.enqueue_source(b, "message", shared),
        )
        check("concurrent_enqueue_one_request", queued[0]["id"] == queued[1]["id"])
        candidate = Candidate(
            key="user.occupation",
            kind="fact",
            statement="Saya bekerja sebagai penulis.",
            anchor="Saya bekerja sebagai penulis.",
            confidence=0.95,
        )
        with (
            patch.object(
                jobs, "extract", return_value=[candidate.statement]
            ) as extract_call,
            patch.object(
                jobs,
                "admit",
                return_value={"memories": [candidate.model_dump(mode="json")]},
            ),
            patch.object(jobs, "cleanup"),
        ):
            await asyncio.gather(
                jobs.process_capture(queued[0]["id"]),
                jobs.process_capture(queued[0]["id"]),
            )
        check("concurrent_capture_one_extraction", extract_call.call_count == 1)
        changed = await message(b, bthread, "Saya menyukai matematika.")
        changed_job = await service.enqueue_source(b, "message", changed)
        async with transaction() as conn:
            await conn.execute(
                "UPDATE chat_messages SET parts=%s WHERE id=%s",
                (
                    json_value([{"type": "text", "text": "Pesan ini telah berubah."}]),
                    changed,
                ),
            )
        with (
            patch.object(jobs, "extract", side_effect=AssertionError("must not infer")),
            patch.object(jobs, "cleanup"),
        ):
            await jobs.process_capture(changed_job["id"])
        async with transaction() as conn:
            check(
                "source_hash_changed_before_inference_skipped",
                (
                    await one(
                        conn,
                        "SELECT status FROM memory_capture_jobs WHERE id=%s",
                        (changed_job["id"],),
                    )
                )["status"]
                == "skipped",
            )
        d, dt = await owner()
        text = "Saya tinggal di Bogor dan saya menyukai teh."
        shared_source = await message(d, dt, text)
        source = await sources.read(d, "message", shared_source, "1")
        async with transaction() as conn:
            await store.settings(conn, d)
            reference = {
                "source_kind": "message",
                "source_id": shared_source,
                "source_revision": "1",
                "source_hash": source["hash"],
            }
            city = await store.apply(
                conn,
                d,
                Candidate(
                    key="user.residence_city",
                    kind="fact",
                    statement="Saya tinggal di Bogor.",
                    anchor="Saya tinggal di Bogor",
                    confidence=0.95,
                ),
                reference,
            )
            drink = await store.apply(
                conn,
                d,
                Candidate(
                    key="user.beverage",
                    kind="preference",
                    statement="Saya menyukai teh.",
                    anchor="saya menyukai teh",
                    confidence=0.95,
                ),
                reference,
            )
        await service.forget(
            d, city["id"], ForgetInput(request_key=uuid4(), expected_revision=1)
        )
        async with transaction() as conn:
            check(
                "forget_one_fact_preserves_other_fact_same_source",
                await store.usable(conn, d, await store.current_revision(conn, drink)),
            )
        check(
            "shared_source_not_reingested",
            (await service.enqueue_source(d, "message", shared_source))["status"]
            == "skipped",
        )
        from ngertiin.chat import store as chat

        run_id = (
            await chat.submit(
                d, dt, uuid4(), "Saya ingin karakter permanen yang singkat."
            )
        )["id"]
        async with transaction() as conn:
            await conn.execute(
                "UPDATE chat_runs SET status='complete' WHERE id=%s", (run_id,)
            )
            await conn.execute(
                "INSERT INTO persona_proposals(id,owner_id,source_run_id,request_key,fingerprint,expected_revision,before_content,content,source,status) "
                "VALUES (%s,%s,%s,%s,'probe',1,'{}','{}','chat','rejected')",
                (uuid4(), d, run_id, uuid4()),
            )
            persona_message = await one(
                conn,
                "SELECT id FROM chat_messages WHERE run_id=%s AND role='user'",
                (run_id,),
            )
        check(
            "rejected_persona_request_excluded",
            (await service.enqueue_source(d, "message", persona_message["id"]))[
                "status"
            ]
            == "skipped",
        )
        from pydantic import SecretStr

        settings = get_settings()
        provider_key = settings.openai_api_key
        settings.openai_api_key = SecretStr("")
        try:
            edited = await service.correct(
                d,
                drink["id"],
                EditInput(
                    request_key=uuid4(),
                    expected_revision=1,
                    statement="Saya menyukai kopi.",
                    kind="preference",
                ),
            )
            check("control_edit_without_model_provider", edited["revision"] == 2)
        finally:
            settings.openai_api_key = provider_key
        # A completed model response must not publish with revoked tracked context.
        e, et = await owner()
        tracked, _, _ = await capture(e, et, "Saya menyukai teh.", key="user.beverage")
        running_id = (await chat.submit(e, et, uuid4(), "Apa minuman saya?"))["id"]
        await chat.claim(running_id)
        async with transaction() as conn:
            old = await store.current_revision(conn, tracked)
            await conn.execute(
                "UPDATE chat_runs SET memory_refs=%s,memory_generation=1 WHERE id=%s",
                (json_value([str(old["id"])]), running_id),
            )
            checkpoint_thread = f"chat:{running_id}:m1"
            await conn.execute(
                "INSERT INTO checkpoints(thread_id,checkpoint_id,checkpoint) VALUES (%s,'probe','{}')",
                (checkpoint_thread,),
            )
            await conn.execute(
                "INSERT INTO checkpoint_blobs(thread_id,channel,version,type,blob) "
                "VALUES (%s,'messages','1','bytes',%s)",
                (checkpoint_thread, b"old memory"),
            )
            await conn.execute(
                "INSERT INTO checkpoint_writes(thread_id,checkpoint_id,task_id,idx,channel,blob) "
                "VALUES (%s,'probe','probe',0,'messages',%s)",
                (checkpoint_thread, b"old memory"),
            )
        await service.correct(
            e,
            tracked["id"],
            EditInput(
                request_key=uuid4(),
                expected_revision=1,
                statement="Saya menyukai kopi.",
                kind="preference",
            ),
        )
        async with transaction() as conn:
            revoked = await one(
                conn, "SELECT * FROM chat_runs WHERE id=%s", (running_id,)
            )
            check(
                "correction_revokes_running_chat_lease",
                revoked["status"] == "failed" and revoked["lease_token"] is None,
            )
            for table in ("checkpoints", "checkpoint_blobs", "checkpoint_writes"):
                count = await one(
                    conn,
                    sql.SQL("SELECT count(*) AS n FROM {} WHERE thread_id=%s").format(
                        sql.Identifier(table)
                    ),
                    (checkpoint_thread,),
                )
                check(f"revoked_{table}_purged", count["n"] == 0)
        from ngertiin.tasks import actions, commands, creation
        from ngertiin.tasks import store as tasks

        task = await creation.create(
            e, et, uuid4(), "Susun contoh sesuai preferensi saya.", False
        )
        execution = await tasks.claim(task["id"])
        async with transaction() as conn:
            current = await store.owned(conn, e, tracked["id"])
            revision = await store.current_revision(conn, current)
            await conn.execute(
                "UPDATE background_tasks SET memory_refs=%s,memory_generation=2,draft='old memory' WHERE id=%s",
                (json_value([str(revision["id"])]), task["id"]),
            )
        action = await actions.ensure(execution)
        await service.forget(
            e, tracked["id"], ForgetInput(request_key=uuid4(), expected_revision=2)
        )
        async with transaction() as conn:
            revoked_task = await one(
                conn, "SELECT * FROM background_tasks WHERE id=%s", (task["id"],)
            )
            check(
                "forget_revokes_running_task_and_draft",
                revoked_task["status"] == "failed"
                and revoked_task["draft"] == ""
                and revoked_task["lease_token"] is None,
            )
            revoked_action = await one(
                conn, "SELECT * FROM task_actions WHERE id=%s", (action["id"],)
            )
            draft_receipt = await one(
                conn,
                "SELECT draft FROM task_revisions WHERE task_id=%s AND revision=1",
                (task["id"],),
            )
            check(
                "forget_purges_pending_task_approval_and_draft_history",
                revoked_action["status"] == "cancelled"
                and revoked_action["content"] == ""
                and draft_receipt["draft"] == "",
            )
        retried = await commands.retry(e, task["id"], uuid4())
        check(
            "revoked_task_retry_uses_new_revision",
            retried["revision"] == 2 and retried["stage"] == "queued",
        )
        # Toggle while inference is in flight: returned output cannot commit.
        f, ft = await owner()
        fm = await message(f, ft, "Saya menyukai sains.")
        fj = await service.enqueue_source(f, "message", fm)
        started, release = (
            __import__("threading").Event(),
            __import__("threading").Event(),
        )

        def hold_extract(*_):
            started.set()
            release.wait(timeout=10)
            return ["Saya menyukai sains."]

        with (
            patch.object(jobs, "extract", side_effect=hold_extract),
            patch.object(jobs, "cleanup"),
        ):
            pending = asyncio.create_task(jobs.process_capture(fj["id"]))
            await asyncio.to_thread(started.wait, 10)
            await service.configure(
                f,
                SettingsInput(
                    request_key=uuid4(), expected_revision=1, capture_enabled=False
                ),
            )
            release.set()
            await pending
        async with transaction() as conn:
            finished = await one(
                conn,
                "SELECT status,candidates FROM memory_capture_jobs WHERE id=%s",
                (fj["id"],),
            )
            check(
                "capture_off_revokes_inflight_output",
                finished["status"] == "skipped" and finished["candidates"] is None,
            )
        from types import SimpleNamespace

        import httpx
        from ngertiin.accounts.auth import current_account
        from ngertiin.api.app import app
        from ngertiin.quotas import reserve, usage

        g, gt = await owner()
        supported, first_source, _ = await capture(
            g, gt, "Saya menyukai fisika.", key="user.subject"
        )
        second_source = await message(g, gt, "Saya menyukai fisika.")
        second = await sources.read(g, "message", second_source, "1")
        async with transaction() as conn:
            revision = await store.current_revision(conn, supported)
            await store.attach_evidence(
                conn,
                revision["id"],
                g,
                {
                    "source_kind": "message",
                    "source_id": second_source,
                    "source_revision": "1",
                    "source_hash": second["hash"],
                },
                "Saya menyukai fisika.",
            )
            await conn.execute("DELETE FROM chat_messages WHERE id=%s", (first_source,))
            check(
                "source_delete_preserves_independent_support",
                await store.usable(conn, g, revision),
            )
            await conn.execute(
                "DELETE FROM chat_messages WHERE id=%s", (second_source,)
            )
            check(
                "source_delete_without_support_revokes_fact",
                not await store.usable(conn, g, revision),
            )
            await reserve(
                conn, g, "chat", "memory-zero-probe", 100, policy.digest("probe")
            )
            check(
                "zero_allowance_fixture",
                (await usage(conn, g))["meters"]["chat"]["remaining"] == 0,
            )
        app.dependency_overrides[current_account] = lambda: SimpleNamespace(id=g)
        try:
            async with httpx.AsyncClient(
                transport=httpx.ASGITransport(app=app), base_url="http://test"
            ) as client:
                check(
                    "zero_allowance_memory_inspect_api",
                    (await client.get("/memory")).status_code == 200,
                )
                edited_response = await client.post(
                    f"/memory/{supported['id']}/edit",
                    json={
                        "request_key": str(uuid4()),
                        "expected_revision": 1,
                        "statement": "Saya menyukai kimia.",
                        "kind": "preference",
                    },
                )
                check(
                    "zero_allowance_memory_edit_api", edited_response.status_code == 200
                )
                check(
                    "zero_allowance_memory_settings_api",
                    (
                        await client.post(
                            "/memory/settings",
                            json={
                                "request_key": str(uuid4()),
                                "expected_revision": 1,
                                "capture_enabled": False,
                            },
                        )
                    ).status_code
                    == 200,
                )
                check(
                    "zero_allowance_memory_forget_api",
                    (
                        await client.post(
                            f"/memory/{supported['id']}/forget",
                            json={
                                "request_key": str(uuid4()),
                                "expected_revision": 2,
                            },
                        )
                    ).status_code
                    == 200,
                )
        finally:
            app.dependency_overrides.clear()
        await service.configure(
            g,
            SettingsInput(
                request_key=uuid4(), expected_revision=3, capture_enabled=True
            ),
        )
        restored, _, _ = await capture(
            g, gt, "Ingat lagi bahwa saya menyukai biologi.", key="user.subject"
        )
        check(
            "fresh_explicit_remember_again_reopens_suppression",
            restored["status"] == "active" and restored["revision"] == 4,
        )
        from ngertiin.memory.costs import MemoryUnavailable, ProviderBudget

        budget = ProviderBudget(g, 5, "probe")
        async with transaction() as conn:
            generation = (await store.settings(conn, g))["generation"]
        budget.generation = generation
        request = httpx.Request(
            "POST",
            "https://provider.invalid/embeddings",
            json={"model": "probe", "input": "bounded"},
        )
        await asyncio.to_thread(budget.before, request)
        await asyncio.to_thread(
            budget.after,
            httpx.Response(500, json={"error": "unknown"}, request=request),
        )
        async with transaction() as conn:
            event = await one(
                conn,
                "SELECT * FROM memory_cost_events WHERE id=%s",
                (request.extensions["memory_call_id"],),
            )
            check(
                "unknown_provider_outcome_retains_reservation",
                event["state"] == "unknown"
                and event["charged_units"] == event["reserved_units"],
            )
        cap = settings.memory_account_daily_units
        settings.memory_account_daily_units = event["charged_units"]
        try:
            try:
                await asyncio.to_thread(
                    budget.before,
                    httpx.Request(
                        "POST",
                        "https://provider.invalid/embeddings",
                        json={"model": "probe", "input": "blocked"},
                    ),
                )
            except MemoryUnavailable:
                check("exhausted_memory_budget_blocks_before_network", True)
            else:
                raise AssertionError("budget must block")
        finally:
            settings.memory_account_daily_units = cap
        if live:
            c, ct = await owner()
            mid_live = await message(
                c, ct, "Saya tinggal di Makassar dan saya vegetarian."
            )
            queued = await service.enqueue_source(c, "message", mid_live)
            await jobs.process_capture(queued["id"])
            async with transaction() as conn:
                await conn.execute(
                    "UPDATE memory_index_operations SET status='complete' WHERE owner_id<>%s",
                    (c,),
                )
            await jobs.index_job()
            output = await recall(c, "Di kota mana saya tinggal?")
            check(
                "real_mem0_capture_projection_semantic_recall",
                any("Makassar" in item["statement"] for item in output["memories"]),
            )
            async with transaction() as conn:
                counts = await one(
                    conn,
                    "SELECT count(*) AS n FROM memory_cost_events WHERE owner_id=%s AND state='confirmed'",
                    (c,),
                )
                check("provider_usage_confirmed", counts["n"] >= 3)
            h, ht = await owner()
            english = await message(
                h, ht, "I do not drink coffee. My practice project is Vega-Q29."
            )
            english_job = await service.enqueue_source(h, "message", english)
            await jobs.process_capture(english_job["id"])
            await jobs.index_job()
            english_recall = await recall(h, "What is my practice project code?")
            check(
                "english_exact_project_code_recall",
                any(
                    "Vega-Q29" in item["statement"]
                    for item in english_recall["memories"]
                ),
            )
            async with transaction() as conn:
                facts = (await store.listing(conn, h))["entries"]
                check(
                    "english_negation_preserved",
                    any(
                        "coffee" in item["statement"].lower()
                        and any(
                            word in item["statement"].lower()
                            for word in ("not", "don't", "avoid", "tidak")
                        )
                        for item in facts
                    ),
                )
            fiction = await message(
                h,
                ht,
                'A quote from a novel: "I live in Paris." This is fiction, not about me.',
            )
            fiction_job = await service.enqueue_source(h, "message", fiction)
            await jobs.process_capture(fiction_job["id"])
            async with transaction() as conn:
                check(
                    "fiction_not_promoted_to_personal_fact",
                    not any(
                        "Paris" in (item["statement"] or "")
                        for item in (await store.listing(conn, h))["entries"]
                    ),
                )
    finally:
        await close_pool()


def main():
    from ngertiin.db import get_engine
    from ngertiin.setup import setup_database

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--live", action="store_true")
    parser.add_argument(
        "--output", type=Path, default=Path(".dev/memory-contracts.json")
    )
    args = parser.parse_args()
    settings = get_settings()
    if settings.app_env != "development":
        raise RuntimeError("Inspector requires development")
    original, previous = (
        settings.database_url.get_secret_value(),
        os.environ.get("DATABASE_URL"),
    )
    name = f"ngertiin_memory_probe_{uuid4().hex}"
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
            asyncio.run(scenarios(args.live))
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
                    {"passed": len(RESULTS), "live": args.live, "scenarios": RESULTS},
                    indent=2,
                )
                + "\n"
            )
    print(
        json.dumps(
            {
                "passed": len(RESULTS),
                "live": args.live,
                "temporary_database_dropped": True,
            }
        )
    )


if __name__ == "__main__":
    main()
