"""P06/P08/P29/P30 fault contracts, real SIGKILL and an isolated dump/object restore drill."""

import asyncio
import hashlib
import os
import signal
import sys
import tempfile
from pathlib import Path
from uuid import UUID, uuid4

import inspect_computer as browser
import inspect_files as fixture
import inspect_sandbox as sandbox_fixture
import inspect_schedules as schedules
import psycopg
from ngertiin.async_db import close_pool, transaction
from ngertiin.chat import store as chat
from ngertiin.computer import policy as computer_policy
from ngertiin.config import get_settings
from ngertiin.recovery import backup, restore, service
from ngertiin.sandbox import policy as sandbox_policy
from ngertiin.storage import s3_client
from ngertiin.tasks import actions, budget, commands, runtime, store, workflow
from ngertiin.tasks.recovery import reconcile_deliveries
from ngertiin.usage.recovery import reconcile as usage_reconcile
from ngertiin.worker.queue import queue_app
from ngertiin.worker.tasks import recover_stalled_jobs
from procrastinate import PsycopgConnector
from psycopg import sql
from sqlalchemy.engine import make_url

check, reject = fixture.check, fixture.reject


async def job_failed(task):
    async with transaction() as conn:
        row = await store.owned(conn, task["owner_id"], task["id"])
        await conn.execute(
            "UPDATE procrastinate_jobs SET status='failed' WHERE id=%s",
            (row["job_id"],),
        )


async def crash_process(task, boundary):
    process = await asyncio.create_subprocess_exec(
        sys.executable,
        __file__,
        "--crash",
        str(task["id"]),
        boundary,
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.PIPE,
    )
    _, errors = await asyncio.wait_for(process.communicate(), 45)
    if process.returncode != -signal.SIGKILL:
        raise AssertionError(errors.decode()[-1500:])
    check("sigkill_" + boundary, True)


async def crash_child(ident, boundary):
    workflow.ChatOpenAI = fixture.Model

    async def kill(*args, **kwargs):
        os.kill(os.getpid(), signal.SIGKILL)

    if boundary == "before_checkpoint":
        workflow.actions.ensure = kill
    else:
        workflow.actions.publish = kill
    await runtime.run_task(ident)


async def task_crashes():
    for boundary in ("before_checkpoint", "before_delivery"):
        owner, thread = await fixture.owner()
        task = await fixture.create(owner, thread)
        await crash_process(task, boundary)
        crashed = await store.detail(owner, task["id"])
        check(boundary + "_durable_draft", bool(crashed["draft"]))
        await job_failed({**task, "owner_id": owner})
        await reconcile_deliveries()
        recovered = await store.detail(owner, task["id"])
        if boundary == "before_delivery":
            check(
                "publication_unknown_blocks_blind_retry",
                recovered["stage"] == "unknown",
            )
            await reject(
                "unknown_retry_rejected",
                commands.retry(owner, task["id"], uuid4()),
                409,
            )
            await actions.reconcile(owner, task["id"])
        await runtime.run_task(str(task["id"]))
        await runtime.run_task(str(task["id"]))
        final = await store.detail(owner, task["id"])
        check(
            boundary + "_resumes_once",
            final["status"] == "succeeded" and len(final["cost_events"]) == 1,
        )
        async with transaction() as conn:
            counts = await chat.one(
                conn,
                "SELECT (SELECT count(*) FROM task_deliveries WHERE task_id=%s) AS deliveries,"
                "(SELECT count(*) FROM result_revisions WHERE task_id=%s) AS revisions",
                (task["id"], task["id"]),
            )
            check(
                boundary + "_one_manifest_and_delivery",
                counts == {"deliveries": 1, "revisions": 1},
            )
        await usage_reconcile()
        await usage_reconcile()
        async with transaction() as conn:
            audit = await chat.one(
                conn,
                "SELECT count(*) AS n FROM compute_audit a JOIN compute_work w ON w.id=a.work_id "
                "WHERE w.task_id=%s AND a.action='settle'",
                (task["id"],),
            )
            # Ledger terminal transitions are themselves replay safe.
            check(
                boundary + "_usage_terminal",
                (
                    await chat.one(
                        conn,
                        "SELECT state FROM compute_work WHERE task_id=%s",
                        (task["id"],),
                    )
                )["state"]
                != "active",
            )
            check(boundary + "_settlement_not_repeated", audit["n"] == 1)


async def orphan_and_fencing():
    owner, thread = await fixture.owner()
    task = await fixture.create(owner, thread)
    execution = await store.claim(task["id"])
    call = await budget.reserve_call(execution, 1000)
    async with transaction() as conn:
        await conn.execute(
            "UPDATE background_tasks SET job_id=NULL WHERE id=%s", (task["id"],)
        )
    await asyncio.gather(reconcile_deliveries(), reconcile_deliveries())
    recovered = await store.detail(owner, task["id"])
    check("orphan_task_requeued", recovered["status"] == "queued")
    check("unknown_model_cost_retained", recovered["usage_units"] == 1000)
    try:
        await store.progress(execution, "drafting", draft="stale")
    except store.StaleExecution:
        check("stale_worker_write_rejected", True)
    else:
        raise AssertionError("stale content accepted")
    await budget.settle_call(execution, call, {"total_tokens": 80})
    await budget.settle_call(execution, call, {"total_tokens": 80})
    check(
        "late_usage_settles_once",
        (await store.detail(owner, task["id"]))["usage_units"] == 80,
    )
    await runtime.run_task(str(task["id"]))
    response = await chat.submit(owner, thread, uuid4(), "Synthetic orphan turn")
    async with transaction() as conn:
        await conn.execute(
            "UPDATE chat_runs SET job_id=NULL WHERE id=%s", (response["id"],)
        )
    outcomes = await service.reconcile()
    check("all_recovery_components_complete", set(outcomes.values()) == {"ok"})
    async with transaction() as conn:
        run = await chat.one(
            conn, "SELECT job_id,status FROM chat_runs WHERE id=%s", (response["id"],)
        )
        check(
            "orphan_chat_requeued",
            run["status"] == "queued" and run["job_id"] is not None,
        )


async def maintenance_jobs():
    # Registered maintenance jobs are recovered using real Procrastinate heartbeat queries.
    from ngertiin.schedules.jobs import dispatch

    async with transaction() as conn:
        jid = await dispatch.configure(connection=conn).defer_async()
        await conn.execute(
            "UPDATE procrastinate_jobs SET status='doing' WHERE id=%s", (jid,)
        )
    connector = PsycopgConnector(
        conninfo=get_settings().database_url.get_secret_value()
    )
    with queue_app.replace_connector(connector):
        async with queue_app.open_async():
            await recover_stalled_jobs()
    async with transaction() as conn:
        job = await chat.one(
            conn, "SELECT status::text FROM procrastinate_jobs WHERE id=%s", (jid,)
        )
        check("stalled_maintenance_requeued", job["status"] == "todo")


async def publication_rollback():
    from ngertiin.files.results import prepare

    owner, thread = await fixture.owner()
    task = await fixture.create(owner, thread)
    execution = await store.claim(task["id"])
    await workflow.draft(execution)
    action = await actions.ensure(execution)
    await actions.begin(execution, action["id"])
    version = await prepare(execution)
    original = actions.append_event

    async def disconnect(*args, **kwargs):
        raise RuntimeError("fault after result visibility and message insert")

    actions.append_event = disconnect
    try:
        try:
            await actions.publish(execution, action["id"], version_id=version)
        except RuntimeError:
            pass
        else:
            raise AssertionError("publication fault not reached")
    finally:
        actions.append_event = original
    async with transaction() as conn:
        state = await chat.one(
            conn,
            "SELECT current_revision,(SELECT count(*) FROM task_deliveries WHERE task_id=%s) AS n "
            "FROM product_results WHERE id=%s",
            (task["id"], task["result_id"]),
        )
        check(
            "result_and_delivery_rollback_together",
            state == {"current_revision": None, "n": 0},
        )
    await actions.publish(execution, action["id"], version_id=version)
    check(
        "publication_after_rollback_succeeds",
        (await store.detail(owner, task["id"]))["status"] == "succeeded",
    )
    from ngertiin.files import cleanup

    original_reconcile = cleanup.reconcile
    cleanup.reconcile = disconnect
    try:
        outcomes = await service.reconcile()
        check(
            "one_failed_domain_does_not_starve_recovery",
            outcomes.pop("files") == "failed" and set(outcomes.values()) == {"ok"},
        )
    finally:
        cleanup.reconcile = original_reconcile


async def versions_and_occurrences():
    owner, thread = await fixture.owner()
    task = await fixture.create(owner, thread, review=True)
    await runtime.run_task(str(task["id"]))
    waiting = await store.detail(owner, task["id"])
    async with transaction() as conn:
        await conn.execute(
            "UPDATE background_tasks SET workflow_version=99 WHERE id=%s", (task["id"],)
        )
    await reject(
        "old_approval_unknown_version_rejected",
        actions.decide(owner, waiting["action"]["id"], 1, True, uuid4()),
        409,
    )
    await reconcile_deliveries()
    blocked = await store.detail(owner, task["id"])
    check(
        "unsupported_waiting_work_is_visible",
        blocked["stage"] == "upgrade_required" and bool(blocked["draft"]),
    )
    await reject(
        "unsupported_retry_rejected", commands.retry(owner, task["id"], uuid4()), 409
    )
    schedule = await schedules.create(owner, thread)
    async with transaction() as conn:
        await conn.execute(
            "UPDATE user_schedules SET next_due=now()-interval '1 hour' WHERE id=%s",
            (schedule["id"],),
        )
    await asyncio.gather(
        *[schedules.dispatch.dispatch_one(owner, schedule["id"]) for _ in range(4)]
    )
    async with transaction() as conn:
        count = await chat.one(
            conn,
            "SELECT count(*) AS n FROM schedule_occurrences WHERE schedule_id=%s",
            (schedule["id"],),
        )
        check("restart_dispatch_has_one_occurrence", count["n"] == 1)
        await conn.execute(
            "UPDATE user_schedules SET workflow_version=99,next_due=now() WHERE id=%s",
            (schedule["id"],),
        )
    await schedules.dispatch.dispatch_one(owner, schedule["id"])
    async with transaction() as conn:
        row = await schedules.store.owned(conn, owner, schedule["id"])
        check(
            "unsupported_schedule_pauses_visibly",
            row["state"] == "paused" and bool(row["error"]),
        )


async def restore_drill():
    owner, thread = await fixture.owner()
    task = await fixture.create(owner, thread)
    await runtime.run_task(str(task["id"]))
    async with transaction() as conn:
        source = await chat.one(
            conn,
            "SELECT f.* FROM file_revisions f JOIN result_revisions r ON r.task_id=%s "
            "WHERE f.id=(r.manifest->'files'->0->>'revision_id')::uuid",
            (task["id"],),
        )
    pending = await sandbox_fixture.create(owner, thread)
    execution = await store.claim(pending["id"])
    from ngertiin.sandbox.store import reserve

    await reserve(execution)
    browser_owner, browser_thread = await fixture.owner()
    browser_task = await browser.create(browser_owner, browser_thread)
    browser_execution = await store.claim(browser_task["id"])
    from ngertiin.computer.store import acquire

    workspace, _, _ = await acquire(browser_execution)
    schedule = await schedules.create(owner, thread)
    original = get_settings().database_url.get_secret_value()
    original_bucket = get_settings().s3_bucket
    saved_bucket_env = os.environ.get("S3_BUCKET")
    # Copy only owned synthetic prefixes into the source drill bucket.
    client = s3_client()
    bucket = "ngertiin-backup-drill-" + uuid4().hex
    client.create_bucket(Bucket=bucket)
    for oid in fixture.OWNERS:
        for page in client.get_paginator("list_objects_v2").paginate(
            Bucket=original_bucket, Prefix=f"accounts/{oid}/"
        ):
            for item in page.get("Contents", []):
                client.copy_object(
                    Bucket=bucket,
                    Key=item["Key"],
                    CopySource={"Bucket": original_bucket, "Key": item["Key"]},
                )
    await close_pool()
    from ngertiin.db import get_engine

    get_engine().dispose()
    target = None
    try:
        os.environ["S3_BUCKET"] = bucket
        get_settings.cache_clear()
        with tempfile.TemporaryDirectory(prefix="ng023-backup-") as directory:
            folder = Path(directory) / "snapshot"
            info = await asyncio.to_thread(backup.create, folder, quiesced=True)
            check("offline_backup_complete", info["complete"] and info["objects"] > 0)
            target = await asyncio.to_thread(backup.restore, folder)
            os.environ["DATABASE_URL"] = (
                make_url(original)
                .set(database=target["database"])
                .render_as_string(hide_password=False)
            )
            os.environ["S3_BUCKET"] = target["bucket"]
            get_settings.cache_clear()
            await restore.quarantine(UUID(target["backup_id"]))
            try:
                await restore.ensure_released()
            except RuntimeError:
                check("restored_api_worker_held", True)
            else:
                raise AssertionError("restore ran without reconciliation")
            get_settings().s3_bucket = original_bucket
            try:
                await restore.ensure_released()
            except RuntimeError:
                check("restore_rejects_source_storage_bucket", True)
            else:
                raise AssertionError("source storage accepted")
            get_settings().s3_bucket = target["bucket"]
            browser.COMPUTER.profiles[workspace["id"]] = {"logged_in": True}
            try:
                await restore.release()
            except ValueError:
                check("existing_vendor_keeps_restore_quarantined", True)
            else:
                raise AssertionError("existing provider automatically reused")
            browser.COMPUTER.profiles.pop(workspace["id"])
            result = await restore.release()
            await restore.ensure_released()
            check(
                "absent_vendor_reconciled_without_effect",
                result["released"] and len(result["resources"]) == 2,
            )
            with client.get_object(Bucket=target["bucket"], Key=source["object_key"])[
                "Body"
            ] as stream:
                check(
                    "restored_result_sha256_identical",
                    hashlib.sha256(stream.read()).hexdigest() == source["sha256"],
                )
            restored = await store.detail(owner, pending["id"])
            check(
                "missing_vendor_has_visible_task_outcome",
                restored["stage"] == "restore_required"
                and "provider" in restored["error"],
            )
            await reject(
                "restore_does_not_replay_task",
                commands.retry(owner, pending["id"], uuid4()),
                409,
            )
            recovered_browser = await store.detail(browser_owner, browser_task["id"])
            check(
                "missing_browser_profile_requires_new_task",
                recovered_browser["stage"] == "restore_required"
                and recovered_browser["computer"]["workspace"] is None,
            )
            async with transaction() as conn:
                row = await schedules.store.owned(conn, owner, schedule["id"])
                check(
                    "restore_pauses_schedule",
                    row["state"] == "paused" and row["next_due"] is None,
                )
                job = await chat.one(
                    conn,
                    "SELECT count(*) AS n FROM procrastinate_jobs WHERE status::text IN ('doing','todo')",
                )
                check("restore_cannot_replay_queued_effects", job["n"] == 0)
            # A corrupt backup is rejected before allocating a restore target.
            obj = next((folder / "objects").iterdir())
            obj.write_bytes(b"corrupt")
            try:
                backup.verify(folder)
            except ValueError:
                check("corrupt_object_backup_rejected", True)
            else:
                raise AssertionError("corrupt backup accepted")
    finally:
        await close_pool()
        os.environ["DATABASE_URL"] = original
        if saved_bucket_env is None:
            os.environ.pop("S3_BUCKET", None)
        else:
            os.environ["S3_BUCKET"] = saved_bucket_env
        get_settings.cache_clear()
        if target:
            with psycopg.connect(original, autocommit=True) as conn:
                conn.execute(
                    sql.SQL("DROP DATABASE {} WITH (FORCE)").format(
                        sql.Identifier(target["database"])
                    )
                )
        for item in [bucket] + ([target["bucket"]] if target else []):
            for page in client.get_paginator("list_objects_v2").paginate(Bucket=item):
                for obj in page.get("Contents", []):
                    client.delete_object(Bucket=item, Key=obj["Key"])
            client.delete_bucket(Bucket=item)


async def scenarios():
    old = workflow.ChatOpenAI, sandbox_policy.get_runtime, computer_policy.get_runtime
    workflow.ChatOpenAI = fixture.Model
    sandbox_policy.get_runtime = lambda provider=None: sandbox_fixture.ADAPTER
    computer_policy.get_runtime = lambda provider=None: browser.COMPUTER
    try:
        await task_crashes()
        await orphan_and_fencing()
        await maintenance_jobs()
        await publication_rollback()
        await versions_and_occurrences()
        await restore_drill()
    finally:
        workflow.ChatOpenAI, sandbox_policy.get_runtime, computer_policy.get_runtime = (
            old
        )
        await close_pool()


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--crash":
        asyncio.run(crash_child(sys.argv[2], sys.argv[3]))
    else:
        os.environ.setdefault("COMPUTE_FREE_CREDITS", "100000")
        get_settings.cache_clear()
        fixture.scenarios = scenarios
        fixture.main()
