"""Provider-independent Task/runtime fault contracts; no remote sandbox or model calls."""

import asyncio
import json
import sys
from uuid import UUID, uuid4

import inspect_files as harness
from langchain_core.messages import AIMessageChunk
from ngertiin.async_db import close_pool, transaction
from ngertiin.chat.store import json_value
from ngertiin.config import get_settings
from ngertiin.files import deletion, results
from ngertiin.files import store as files
from ngertiin.sandbox import lifecycle, model, outputs, policy
from ngertiin.sandbox import store as resources
from ngertiin.sandbox.cleanup import candidates
from ngertiin.sandbox.contracts import (
    ExecutionReceipt,
    Observation,
    RuntimeFailure,
    RuntimeInfo,
    SandboxRef,
    SessionSpec,
    StagedFile,
)
from ngertiin.tasks import actions, commands, creation, runtime, store
from pydantic import SecretStr

check, reject, owner = harness.check, harness.reject, harness.owner


class Model:
    calls = 0
    seen = ""

    def __init__(self, **kwargs):
        pass

    async def astream(self, messages):
        Model.calls += 1
        Model.seen = str(messages[1].content)
        yield AIMessageChunk(
            content=json.dumps({"code": "# controlled adapter fixture"}),
            usage_metadata={
                "input_tokens": 100,
                "output_tokens": 20,
                "total_tokens": 120,
            },
        )


class ControlledRuntime:
    """An independent implementation of application types; it never evaluates code."""

    name = "controlled"

    def __init__(self):
        self.sessions = {}
        self.staged = []
        self.calls = 0
        self.mode = "normal"
        self.can_delete = True
        self.entered = asyncio.Event()

    async def preflight(self):
        return RuntimeInfo("controlled", "contract-v1", 2, 4, 8)

    async def create(self, spec: SessionSpec):
        if self.mode == "reject":
            raise RuntimeFailure("Controlled rejection before provisioning")
        self.sessions[spec.name] = True
        return SandboxRef(spec.name, spec.name)

    async def inspect(self, name):
        return Observation("running" if self.sessions.get(name) else "absent", True)

    async def stage(self, ref, values):
        self.staged = values

    async def execute(self, ref, code, seconds):
        self.calls += 1
        if self.mode == "unknown":
            raise RuntimeFailure("Controlled lost acknowledgement", unknown=True)
        if self.mode == "wait":
            self.entered.set()
            await asyncio.Event().wait()
        if self.mode == "repair" and self.calls == 1:
            return ExecutionReceipt(1, "Controlled program error", 5)
        return ExecutionReceipt(0, "2 baris terhitung; total 42.", 10)

    async def collect(self, ref, filenames):
        data = []
        for name in filenames:
            body = (
                b"month,total\n2026-01,42\n"
                if name.endswith(".csv")
                else b"# Total\n42\n"
            )
            if self.mode == "large":
                body = b"x" * (10 * 1024 * 1024 + 1)
            data.append(StagedFile(name, body))
        return data

    async def delete(self, name):
        if self.can_delete:
            self.sessions.pop(name, None)
        return self.can_delete


ADAPTER = ControlledRuntime()


async def create(oid, thread, *, review=False, inputs=None, **kwargs):
    return await creation.create(
        oid,
        thread,
        uuid4(),
        "Hitung total dari data yang dipilih.",
        review,
        runtime_kind="code",
        inputs=inputs or [],
        outputs=[{"filename": "rekap.csv", "format": "csv"}],
        **kwargs,
    )


async def normal():
    a, thread = await owner()
    b, _ = await owner()
    task = await create(a, thread, review=True)
    check(
        "code_kind_policy_and_finite_limits_captured",
        task["runtime_kind"] == "code"
        and task["budget_policy"]["sandbox"]["max_steps"] == 3,
    )
    task = await harness.run(a, task)
    check("same_task_runtime_reaches_review", task["status"] == "waiting_user")
    check(
        "resource_deleted_before_human_review",
        all(s["state"] == "deleted" for s in task["sandbox_sessions"]),
    )
    check(
        "cost_is_usage_estimate_not_invented_invoice",
        all(
            s["cost_state"] == "estimated" and not s["usage"]["invoice_confirmed"]
            for s in task["sandbox_sessions"]
        ),
    )
    draft = json.loads(task["draft"])
    candidate = UUID(draft["files"][0]["staged_output_id"])
    _, body = await outputs.content(a, task["id"], candidate)
    check(
        "candidate_bytes_survive_provider_cleanup", body == b"month,total\n2026-01,42\n"
    )
    await reject(
        "candidate_owner_isolation", outputs.content(b, task["id"], candidate), 404
    )
    await reject(
        "candidate_task_isolation", outputs.content(a, uuid4(), candidate), 404
    )
    old_action = task["action"]
    draft["summary"] = "Ringkasan yang ditinjau pengguna."
    revised = await commands.revise(a, task["id"], 1, json.dumps(draft), uuid4())
    check("review_edit_preserves_immutable_compute_bytes", revised["revision"] == 2)
    await runtime.run_task(str(task["id"]))
    task = await store.detail(a, task["id"])
    await reject(
        "stale_compute_review_rejected",
        actions.decide(a, old_action["id"], 1, True, uuid4()),
        409,
    )
    key = uuid4()
    await actions.decide(a, task["action"]["id"], 2, True, key)
    await actions.decide(a, task["action"]["id"], 2, True, key)
    before = ADAPTER.calls
    await runtime.run_task(str(task["id"]))
    await runtime.run_task(str(task["id"]))
    task = await store.detail(a, task["id"])
    check(
        "approved_candidate_publishes_without_reexecution",
        task["status"] == "succeeded" and before == ADAPTER.calls,
    )
    async with transaction() as conn:
        published = await results.detail(conn, a, task["result_id"])
        deliveries = await conn.execute(
            "SELECT count(*) AS n FROM task_deliveries WHERE task_id=%s", (task["id"],)
        )
        check(
            "duplicate_approval_and_job_have_one_delivery",
            (await deliveries.fetchone())["n"] == 1,
        )
    _, saved = await files.content(
        a, UUID(published["selected"]["manifest"]["files"][0]["revision_id"])
    )
    check("published_file_matches_candidate_after_cleanup", saved == body)
    updated = await harness.run(
        a,
        await create(
            a, thread, result_id=task["result_id"], expected_result_revision=1
        ),
    )
    check(
        "result_update_preserves_code_runtime_and_exact_previous_bytes",
        published["selected"]["runtime_kind"] == "code"
        and updated["status"] == "succeeded"
        and any(
            f.filename == "previous-1.csv" and f.data == body for f in ADAPTER.staged
        ),
    )
    await deletion.result(a, task["result_id"])
    await reject(
        "result_delete_revokes_candidate_download",
        outputs.content(a, task["id"], candidate),
        404,
    )
    await candidates()
    async with transaction() as conn:
        row = await conn.execute(
            "SELECT purged_at FROM sandbox_outputs WHERE id=%s", (candidate,)
        )
        check(
            "deleted_result_candidate_physically_purged",
            bool((await row.fetchone())["purged_at"]),
        )


async def inputs_and_identity():
    a, thread = await owner()
    b, other_thread = await owner()
    data = b"name,value\n" + b"item,21\n" * 12000
    uploaded = await files.upload(a, uuid4(), "data.csv", data)
    rid = uploaded["uploaded_revision_id"]
    await reject(
        "foreign_file_cannot_enter_code_runtime",
        create(b, other_thread, inputs=[{"revision_id": str(rid)}]),
        404,
    )
    task = await create(a, thread, inputs=[{"revision_id": str(rid)}])
    task = await harness.run(a, task)
    check(
        "full_dataset_staged_without_model_context_truncation",
        ADAPTER.staged[0].data == data and len(Model.seen.encode()) < 48000,
    )
    check("sample_marked_incomplete", '"sample_is_complete": false' in Model.seen)
    selected = await create(
        a, thread, inputs=[{"revision_id": str(rid), "start": 2, "end": 3}]
    )
    await harness.run(a, selected)
    check(
        "exact_line_scope_not_silently_expanded",
        ADAPTER.staged[0].data == b"item,21\nitem,21\n",
    )
    deleted = await create(a, thread, inputs=[{"revision_id": str(rid)}])
    await deletion.file(a, uploaded["id"])
    await runtime.run_task(str(deleted["id"]))
    check(
        "deleted_input_fences_code_dispatch",
        (await store.detail(a, deleted["id"]))["status"] == "failed",
    )
    key = uuid4()
    replay = await creation.create(
        b, other_thread, key, "Hitung 21+21", False, runtime_kind="code"
    )
    same = await creation.create(
        b, other_thread, key, "Hitung 21+21", False, runtime_kind="code"
    )
    check("same_request_same_task", replay["id"] == same["id"])
    await reject(
        "runtime_kind_part_of_request_identity",
        creation.create(b, other_thread, key, "Hitung 21+21", False),
        409,
    )
    await commands.cancel(b, replay["id"])


async def uncertainty_and_stop():
    a, thread = await owner()
    ADAPTER.can_delete = False
    task = await create(a, thread)
    task = await harness.run(a, task)
    check(
        "cleanup_unknown_holds_task_without_success",
        task["status"] == "waiting_user" and task["stage"] == "sandbox_unknown",
    )
    check(
        "unknown_cleanup_holds_full_cost_reservation",
        task["sandbox_sessions"][0]["charged_microusd"] == 36000,
    )
    await commands.cancel(a, task["id"])
    await reject(
        "retry_cannot_bypass_live_resource", commands.retry(a, task["id"], uuid4()), 409
    )
    ADAPTER.can_delete = True
    await lifecycle.reconcile(a, task["id"])
    before = ADAPTER.calls
    await commands.retry(a, task["id"], uuid4())
    await runtime.run_task(str(task["id"]))
    check(
        "cleanup_reconciliation_reuses_durable_candidate",
        (await store.detail(a, task["id"]))["status"] == "succeeded"
        and ADAPTER.calls == before,
    )

    a, thread = await owner()
    ADAPTER.mode, ADAPTER.can_delete = "unknown", False
    task = await create(a, thread)
    task = await harness.run(a, task)
    before = ADAPTER.calls
    await runtime.run_task(str(task["id"]))
    check(
        "lost_ack_not_blindly_replayed",
        task["stage"] == "sandbox_unknown" and ADAPTER.calls == before,
    )
    ADAPTER.can_delete, ADAPTER.mode = True, "normal"
    await lifecycle.reconcile(a, task["id"])
    await commands.retry(a, task["id"], uuid4())
    await runtime.run_task(str(task["id"]))
    check(
        "explicit_retry_after_cleanup_has_new_audited_attempt",
        len((await store.detail(a, task["id"]))["sandbox_sessions"]) == 2,
    )

    a, thread = await owner()
    ADAPTER.mode, ADAPTER.entered = "wait", asyncio.Event()
    task = await create(a, thread)
    work = asyncio.create_task(runtime.run_task(str(task["id"])))
    await asyncio.wait_for(ADAPTER.entered.wait(), timeout=10)
    await commands.cancel(a, task["id"])
    await asyncio.wait_for(work, timeout=10)
    stopped = await store.detail(a, task["id"])
    check(
        "stop_fences_running_code_and_publication",
        stopped["status"] == "cancelled" and stopped["result"] is None,
    )
    check(
        "stop_confirms_remote_cleanup",
        all(s["state"] == "deleted" for s in stopped["sandbox_sessions"]),
    )
    ADAPTER.mode = "normal"


async def budgets_and_faults():
    a, thread = await owner()
    first, second = await create(a, thread), await create(a, thread)
    first, second = await store.claim(first["id"]), await store.claim(second["id"])
    admitted = await resources.reserve(first)
    try:
        await resources.reserve(second)
    except ValueError:
        check("atomic_account_resource_concurrency", True)
    else:
        raise AssertionError("account concurrency")
    await lifecycle.cleanup(admitted, ADAPTER)
    await store.fail(first, "Controlled finished")
    await store.fail(second, "Controlled finished")
    a, thread = await owner()
    ADAPTER.mode, ADAPTER.calls = "repair", 0
    task = await harness.run(a, await create(a, thread))
    check(
        "bounded_code_repair_records_both_dispatches",
        task["status"] == "succeeded" and ADAPTER.calls == 2,
    )
    ADAPTER.mode = "large"
    task = await harness.run(a, await create(a, thread))
    check("host_revalidates_adapter_output_size", task["status"] == "failed")
    ADAPTER.mode = "normal"

    a, thread = await owner()
    one = await harness.run(a, await create(a, thread, review=True))
    two = await harness.run(a, await create(a, thread, review=True))
    draft = json.loads(two["draft"])
    draft["files"][0]["staged_output_id"] = json.loads(one["draft"])["files"][0][
        "staged_output_id"
    ]
    await reject(
        "cannot_forge_cross_task_candidate_reference",
        commands.revise(a, two["id"], 1, json.dumps(draft), uuid4()),
        404,
    )
    await commands.cancel(a, one["id"])
    await commands.cancel(a, two["id"])

    a, thread = await owner()
    task = await create(a, thread)
    original = results.put_object

    def failed(*args, **kwargs):
        raise OSError("Controlled lost storage acknowledgement")

    results.put_object = failed
    try:
        task = await harness.run(a, task)
    finally:
        results.put_object = original
    check("failed_publication_is_not_success", task["status"] == "failed")
    before = ADAPTER.calls
    await commands.retry(a, task["id"], uuid4())
    await runtime.run_task(str(task["id"]))
    check(
        "publication_retry_does_not_repeat_computation",
        ADAPTER.calls == before
        and (await store.detail(a, task["id"]))["status"] == "succeeded",
    )


async def scenarios():
    old_model, old_runtime = model.ChatOpenAI, policy.get_runtime
    model.ChatOpenAI, policy.get_runtime = Model, lambda provider=None: ADAPTER
    try:
        await normal()
        await inputs_and_identity()
        await uncertainty_and_stop()
        await budgets_and_faults()
        await resource_admission()
        await configuration_and_rejection()
        check("all_controlled_resources_removed", not ADAPTER.sessions)
    finally:
        model.ChatOpenAI, policy.get_runtime = old_model, old_runtime
        await close_pool()


async def configuration_and_rejection():
    oid, thread = await owner()
    settings = get_settings()
    original = settings.daytona_api_key
    settings.daytona_api_key = SecretStr("")
    try:
        task = await harness.run(oid, await create(oid, thread))
        check(
            "task_domain_does_not_require_daytona_credentials",
            task["status"] == "succeeded",
        )
    finally:
        settings.daytona_api_key = original
    ADAPTER.mode = "reject"
    try:
        task = await harness.run(oid, await create(oid, thread))
        check(
            "definite_preallocation_rejection_has_zero_resource_cost",
            task["status"] == "failed"
            and task["sandbox_sessions"][0]["charged_microusd"] == 0,
        )
    finally:
        ADAPTER.mode = "normal"


async def resource_admission():
    accounts = [await owner(), await owner()]
    executions = []
    for oid, thread in accounts:
        task = await create(oid, thread)
        rules = task["budget_policy"]
        rules["sandbox"].update(
            global_daily_microusd=36000, account_daily_microusd=36000
        )
        async with transaction() as conn:
            await conn.execute(
                "UPDATE background_tasks SET budget_day='2020-01-01',budget_policy=%s WHERE id=%s",
                (json_value(rules), task["id"]),
            )
        executions.append(await store.claim(task["id"]))
    values = await asyncio.gather(
        *(resources.reserve(e) for e in executions), return_exceptions=True
    )
    admitted = [v for v in values if isinstance(v, dict)]
    check(
        "atomic_global_money_admission_under_race",
        len(admitted) == 1 and sum(isinstance(v, ValueError) for v in values) == 1,
    )
    session = admitted[0]
    check(
        "retry_budget_uses_original_utc_bucket",
        str(session["budget_day"]) == "2020-01-01",
    )
    account = next((a, t) for a, t in accounts if a == session["owner_id"])
    third = await create(*account)
    rules = third["budget_policy"]
    rules["sandbox"].update(account_daily_microusd=36000)
    async with transaction() as conn:
        await conn.execute(
            "UPDATE background_tasks SET budget_day='2020-01-01',budget_policy=%s WHERE id=%s",
            (json_value(rules), third["id"]),
        )
    third = await store.claim(third["id"])
    try:
        await resources.reserve(third)
    except ValueError as error:
        check("account_money_cap_precedes_dispatch", "biaya" in str(error))
    else:
        raise AssertionError("account money cap")
    await lifecycle.cleanup(session, ADAPTER)
    for execution in [*executions, third]:
        await store.fail(execution, "Controlled admission probe finished")

    oid, thread = await owner()
    task = await store.claim((await create(oid, thread))["id"])
    for _ in range(3):
        session = await resources.reserve(task)
        await lifecycle.cleanup(session, ADAPTER)
    try:
        await resources.reserve(task)
    except ValueError:
        check("task_resource_attempt_cap_cannot_be_reset_by_retry", True)
    else:
        raise AssertionError("session attempt cap")
    await store.fail(task, "Controlled attempt cap probe finished")

    oid, thread = await owner()
    task = await store.claim((await create(oid, thread))["id"])
    session = await resources.reserve(task)
    await resources.active_change(task, session["id"], "provisioning")
    session["state"] = "provisioning"
    check(
        "create_404_before_ttl_is_not_proof_of_absence",
        not await lifecycle.cleanup(session, ADAPTER),
    )
    async with transaction() as conn:
        session = await (
            await conn.execute(
                "UPDATE sandbox_sessions SET deadline=now()-interval '3 minutes' WHERE id=%s RETURNING *",
                (session["id"],),
            )
        ).fetchone()
    check(
        "unknown_create_reconciles_after_absolute_ttl_margin",
        await lifecycle.cleanup(session, ADAPTER),
    )
    await store.fail(task, "Controlled unknown create probe finished")


if __name__ == "__main__":
    if "--output" not in sys.argv:
        sys.argv.extend(["--output", ".dev/sandbox-contracts.json"])
    harness.scenarios = scenarios
    harness.main()
