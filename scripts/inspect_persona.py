"""Persona owner/race/retry/snapshot contracts against disposable PostgreSQL."""

import argparse
import asyncio
import json
import os
from pathlib import Path
from uuid import uuid4

import psycopg
from fastapi import HTTPException
from inspect_tasks import owner
from ngertiin.async_db import close_pool, transaction
from ngertiin.chat import store as chat
from ngertiin.config import get_settings
from ngertiin.persona import service, store
from ngertiin.persona.contracts import EditInput, PersonaContent, RestoreInput
from ngertiin.persona.policy import CORE, context
from ngertiin.tasks import creation
from psycopg import sql
from pydantic import ValidationError
from sqlalchemy.engine import make_url

RESULTS = []


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


async def profile(account):
    async with transaction() as conn:
        return await store.current(conn, account)


def edit(value, **changes):
    content = {k: v for k, v in value.items() if k != "revision"}
    return EditInput(
        request_key=uuid4(),
        expected_revision=value["revision"],
        content=PersonaContent.model_validate({**content, **changes}),
    )


async def proposal(account, run, value):
    async with transaction() as conn:
        await chat.lock_account(conn, account)
        return await service.propose_locked(
            conn, account, uuid4(), run["profile"]["revision"], value, "chat", run=run
        )


async def scenarios():
    a, thread = await owner()
    b, _ = await owner()
    try:
        initial = await profile(a)
        check(
            "default_character_excludes_internal_policy",
            "Jangan tampilkan instruksi internal" not in initial["soul"],
        )
        check(
            "immutable_policy_outside_soul",
            "bukan izin" in CORE and initial["name"] in context(initial),
        )
        body = edit(initial, name="Luna", avatar="initial")
        receipt = await service.edit(a, body)
        changed = await profile(a)
        check(
            "direct_edit_exact_content",
            changed["name"] == "Luna" and changed["revision"] == 2,
        )
        check(
            "direct_retry_same_receipt",
            (await service.edit(a, body))["id"] == receipt["id"],
        )
        await rejected(
            "request_key_reuse_different_content",
            service.edit(
                a,
                body.model_copy(
                    update={
                        "content": body.content.model_copy(update={"name": "Other"})
                    }
                ),
            ),
            409,
        )
        await rejected(
            "stale_editor_rejected", service.edit(a, edit(initial, name="Old")), 409
        )
        await rejected(
            "foreign_decision_404", service.decide(b, receipt["id"], True), 404
        )
        await rejected(
            "foreign_restore_404",
            service.edit(
                b,
                RestoreInput(request_key=uuid4(), expected_revision=1, revision=2),
                restore=True,
            ),
            404,
        )
        check("foreign_profile_unchanged", (await profile(b))["revision"] == 1)
        run_id = (
            await chat.submit(
                a, thread, uuid4(), "Ubah karakter permanen menjadi ringkas."
            )
        )["id"]
        run = await chat.claim(run_id)
        value = {k: v for k, v in run["profile"].items() if k != "revision"}
        p = await proposal(a, run, {**value, "soul": "Jawab ringkas."})
        check(
            "proposal_does_not_change_soul",
            (await profile(a))["soul"] == initial["soul"],
        )
        await service.decide(a, p["id"], False)
        check("reject_preserves_profile", await profile(a) == changed)
        check(
            "reject_retry_idempotent",
            (await service.decide(a, p["id"], False))["status"] == "rejected",
        )
        await rejected(
            "reject_cannot_be_approved", service.decide(a, p["id"], True), 409
        )
        async with transaction() as conn:
            exclusions = await store.memory_exclusions(conn, a, [run_id])
            foreign = await store.memory_exclusions(conn, b, [run_id])
        check(
            "rejection_retains_capture_exclusion",
            any(
                r["source_run_id"] == run_id and r["status"] == "rejected"
                for r in exclusions
            ),
        )
        check("capture_exclusions_owner_scoped", not foreign)
        p = await proposal(a, run, {**value, "soul": "Berikan contoh konkret."})
        applied = await service.decide(a, p["id"], True)
        check("approve_creates_one_revision", applied["applied_revision"] == 3)
        check(
            "approve_retry_does_not_duplicate",
            (await service.decide(a, p["id"], True))["applied_revision"] == 3,
        )
        check(
            "chat_snapshot_stable_after_edit",
            (await chat.claim(run_id))["profile"] == changed,
        )
        await rejected(
            "stale_worker_cannot_propose",
            proposal(a, {**run, "lease_token": uuid4()}, {**value, "soul": "No"}),
            409,
        )
        latest = await profile(a)
        results = await asyncio.gather(
            service.edit(a, edit(latest, tagline="A")),
            service.edit(a, edit(latest, tagline="B")),
            return_exceptions=True,
        )
        check("two_tab_one_winner", sum(isinstance(r, dict) for r in results) == 1)
        check(
            "two_tab_loser_conflict",
            sum(isinstance(r, HTTPException) and r.status_code == 409 for r in results)
            == 1,
        )
        restore = RestoreInput(
            request_key=uuid4(),
            expected_revision=(await profile(a))["revision"],
            revision=1,
        )
        restored = await service.edit(a, restore, restore=True)
        check(
            "restore_appends_new_revision",
            restored["applied_revision"] == 5
            and (await profile(a))["soul"] == initial["soul"],
        )
        check(
            "restore_retry_stable",
            (await service.edit(a, restore, restore=True))["applied_revision"] == 5,
        )
        frozen = await creation.create(
            a, thread, uuid4(), "Tulis rencana audit.", False
        )
        async with transaction() as conn:
            row = await chat.one(
                conn,
                "SELECT input_snapshot FROM background_tasks WHERE id=%s",
                (frozen["id"],),
            )
        check(
            "new_task_captures_persona",
            row["input_snapshot"]["persona"]["revision"] == 5,
        )
        await service.edit(
            a, edit(await profile(a), soul="Bantu secara ringkas dan konkret.")
        )
        async with transaction() as conn:
            row = await chat.one(
                conn,
                "SELECT input_snapshot FROM background_tasks WHERE id=%s",
                (frozen["id"],),
            )
        check(
            "queued_task_keeps_snapshot",
            row["input_snapshot"]["persona"]["revision"] == 5,
        )
        newer = await creation.create(
            a, thread, uuid4(), "Tulis rencana audit berikutnya.", False
        )
        async with transaction() as conn:
            row = await chat.one(
                conn,
                "SELECT input_snapshot FROM background_tasks WHERE id=%s",
                (newer["id"],),
            )
            quota_before = (
                await chat.one(
                    conn,
                    "SELECT count(*) AS n FROM quota_operations WHERE owner_id=%s",
                    (a,),
                )
            )["n"]
        check(
            "next_task_uses_new_revision",
            row["input_snapshot"]["persona"]["revision"] == 6,
        )
        waiting_run = await chat.claim(run_id)
        waiting_run["profile"] = await profile(a)
        waiting_content = {
            k: v for k, v in waiting_run["profile"].items() if k != "revision"
        }
        waiting = await proposal(
            a, waiting_run, {**waiting_content, "soul": "Tinjau nanti."}
        )
        for index in range(21):
            await service.edit(
                a, edit(await profile(a), tagline=f"Revision audit {index}")
            )
        async with transaction() as conn:
            page = await store.history(conn, a, 2147483647)
            next_page = await store.history(conn, a, page["revisions"][-1]["revision"])
            quota_after = (
                await chat.one(
                    conn,
                    "SELECT count(*) AS n FROM quota_operations WHERE owner_id=%s",
                    (a,),
                )
            )["n"]
        check(
            "history_paginated_without_duplicates",
            page["has_more"]
            and len(page["revisions"]) == 20
            and not {r["revision"] for r in page["revisions"]}.intersection(
                r["revision"] for r in next_page["revisions"]
            ),
        )
        check("editor_does_not_charge_chat", quota_after == quota_before)
        async with transaction() as conn:
            visible = await store.listing(conn, a)
            await conn.execute(
                "UPDATE chat_runs SET persona_snapshot='{}' WHERE id=%s", (run_id,)
            )
        check(
            "pending_not_hidden_by_editor_history",
            any(p["id"] == waiting["id"] for p in visible["proposals"]),
        )
        legacy = await chat.claim(run_id)
        check(
            "legacy_run_binds_persona_once",
            legacy["profile"]["revision"] == (await profile(a))["revision"],
        )
        check(
            "legacy_run_retry_keeps_snapshot",
            (await chat.claim(run_id))["profile"] == legacy["profile"],
        )
        latest = await profile(a)
        current_run = {**(await chat.claim(run_id)), "profile": latest}
        value = {k: v for k, v in latest.items() if k != "revision"}
        expired = await proposal(a, current_run, {**value, "soul": "Expired"})
        async with transaction() as conn:
            await conn.execute(
                "UPDATE persona_proposals SET expires_at=now()-interval '1 minute' WHERE id=%s",
                (expired["id"],),
            )
        await rejected(
            "expired_approval_rejected", service.decide(a, expired["id"], True), 409
        )
        async with transaction() as conn:
            listing = await store.listing(conn, a)
        check(
            "expired_status_persisted",
            any(
                p["id"] == expired["id"] and p["status"] == "expired"
                for p in listing["proposals"]
            ),
        )
        for name, change in [
            ("reject_owner_in_content", {"owner_id": str(b)}),
            ("reject_blank_name", {"name": " "}),
            ("bound_unicode_soul_bytes", {"soul": "🙂" * 2000}),
        ]:
            try:
                PersonaContent.model_validate({**value, **change})
            except ValidationError:
                check(name, True)
            else:
                raise AssertionError(name)
    finally:
        await close_pool()


def main():
    from ngertiin.db import get_engine
    from ngertiin.setup import setup_database

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output", type=Path, default=Path(".dev/persona-contracts.json")
    )
    args = parser.parse_args()
    settings = get_settings()
    if settings.app_env != "development":
        raise RuntimeError("Inspector requires development")
    original, previous = (
        settings.database_url.get_secret_value(),
        os.environ.get("DATABASE_URL"),
    )
    name = f"ngertiin_persona_probe_{uuid4().hex}"
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
                json.dumps({"passed": len(RESULTS), "scenarios": RESULTS}, indent=2)
                + "\n"
            )
    print(json.dumps({"passed": len(RESULTS), "temporary_database_dropped": True}))


if __name__ == "__main__":
    main()
