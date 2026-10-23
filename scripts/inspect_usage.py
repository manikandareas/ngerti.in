"""NG-040 economic invariants on a disposable PostgreSQL database and synthetic owners."""

import asyncio
import io
import json
import sys
from pathlib import Path
from uuid import uuid4

import httpx
import inspect_files as fixture
from ngertiin.async_db import transaction
from ngertiin.chat.store import one
from ngertiin.usage import ledger, prices
from ngertiin.usage.api import summary

check, reject = fixture.check, fixture.reject


async def open_one(owner, key, cap):
    async with transaction() as conn:
        return await ledger.open_work(conn, owner, key, "task", "Probe usage", cap)


async def scenarios():
    a, thread = await fixture.owner()
    b, _ = await fixture.owner()
    price = prices.snapshot("gpt-6-luna")
    amount, state = prices.model_cost(
        {
            "input_tokens": 10000,
            "output_tokens": 1000,
            "input_token_details": {"cache_read": 1000},
        },
        price,
        50000,
    )
    check("cached_input_separate_from_output", amount == 1410 and state == "estimated")
    check(
        "missing_usage_stays_unknown", prices.model_cost({}, price, 100)[1] == "unknown"
    )
    check(
        "unpriced_model_not_free", prices.maximum(100, prices.snapshot("unlisted")) > 0
    )
    check(
        "unpriced_model_marked_unknown",
        prices.model_cost(
            {"input_tokens": 1, "output_tokens": 1}, prices.snapshot("unlisted"), 100
        )[1]
        == "unknown",
    )
    work = await open_one(a, "test:main", 100000)
    async with transaction() as conn:
        p = await ledger.period(conn, a)
        check("free_period_allowance_pinned", p["policy"]["free"] == 1000000)
        check(
            "reservation_visible",
            (await summary(conn, a))["compute"]["reserved"] == 100,
        )
        duplicate = await ledger.open_work(
            conn, a, "test:main", "task", "Probe usage", 100000
        )
        check("same_work_is_idempotent", duplicate["id"] == work["id"])
        event = await ledger.reserve_event(
            conn, work, "probe:one", "model", "openai", price, 30000
        )
        replay = await ledger.reserve_event(
            conn, work, "probe:one", "model", "openai", price, 30000
        )
        check("event_dispatch_replay_deduplicated", replay["id"] == event["id"])
        await ledger.settle_event(
            conn, a, "probe:one", 1410, "estimated", {"input_tokens": 10000}
        )
        await ledger.settle_event(
            conn, a, "probe:one", 1410, "estimated", {"input_tokens": 10000}
        )
        count = await one(
            conn,
            "SELECT count(*) AS n FROM compute_audit WHERE event_id=%s "
            "AND action='cost_settled'",
            (event["id"],),
        )
        check("settlement_replay_has_one_audit", count["n"] == 1)
        await ledger.finish(conn, a, "test:main")
        data = await summary(conn, a)
        check(
            "settlement_releases_remainder",
            data["compute"]["used"] == 1.41
            and data["compute"]["reserved"] == 0
            and data["compute"]["remaining"] == 998.59,
        )
        check("other_owner_sees_no_history", (await summary(conn, b))["items"] == [])
        await ledger.reopen(conn, a, "test:main")
        check(
            "retry_reuses_period",
            (
                await one(
                    conn,
                    "SELECT period_id FROM compute_work WHERE id=%s",
                    (work["id"],),
                )
            )["period_id"]
            == p["id"],
        )
        await ledger.finish(conn, a, "test:main", refund=True)
        data = await summary(conn, a)
        check("no_output_refunds_customer", data["compute"]["used"] == 0)
        native = await one(
            conn, "SELECT vendor_cost FROM compute_balances WHERE id=%s", (work["id"],)
        )
        check("refund_retains_provider_expense", native["vendor_cost"] == 1410)
    async with transaction() as conn:
        await ledger.reopen(conn, a, "test:main")
        await ledger.reserve_event(
            conn, work, "probe:retry", "model", "openai", price, 5000
        )
        await ledger.settle_event(
            conn, a, "probe:retry", 1000, "estimated", {"input_tokens": 10000}
        )
        await ledger.finish(conn, a, "test:main")
        row = await one(
            conn, "SELECT * FROM compute_balances WHERE id=%s", (work["id"],)
        )
        check(
            "retry_does_not_reverse_previous_refund",
            row["used"] == 1000 and row["vendor_cost"] == 2410,
        )
        await reject(
            "parent_budget_cannot_be_exceeded",
            ledger.reserve_event(
                conn, work, "probe:over", "model", "openai", price, 100000
            ),
            429,
        )
    unknown = await open_one(a, "test:unknown", 100000)
    async with transaction() as conn:
        await ledger.reserve_event(
            conn, unknown, "probe:unknown", "model", "openai", price, 20000
        )
        await ledger.settle_event(conn, a, "probe:unknown", 20000, "unknown", {})
        await ledger.finish(conn, a, "test:unknown")
        check(
            "unknown_holds_only_uncertain_amount",
            (await summary(conn, a))["compute"]["reserved"] == 20,
        )
        await ledger.settle_event(
            conn, a, "probe:unknown", 1000, "estimated", {"input_tokens": 10000}
        )
        check(
            "late_settlement_releases_unknown",
            (await summary(conn, a))["compute"]["reserved"] == 0,
        )

    async def competing(key):
        try:
            await open_one(b, key, 600000)
            return True
        except Exception as error:
            from ngertiin.tasks.budget import AdmissionDenied

            if isinstance(error, AdmissionDenied):
                return False
            raise

    admitted = await asyncio.gather(competing("race:a"), competing("race:b"))
    check("account_admission_race_one_winner", sum(admitted) == 1)
    async with transaction() as conn:
        check(
            "race_balance_never_negative",
            (await summary(conn, b))["compute"]["remaining"] == 400,
        )
        old = (await ledger.period(conn, a))["policy"]
        original = prices.RATES["gpt-6-luna"]
        prices.RATES["gpt-6-luna"] = ("1", "1", "5")
        try:
            check(
                "period_price_snapshot_survives_config_change",
                (await ledger.period(conn, a))["policy"]["prices"]["gpt-6-luna"][
                    "input"
                ]
                == "0.10",
            )
            check("work_price_snapshot_survives_config_change", work["policy"] == old)
        finally:
            prices.RATES["gpt-6-luna"] = original
    # Real Task lifecycle with controlled model verifies that existing cost adapters participate.
    from ngertiin.tasks import creation, workflow

    original = workflow.ChatOpenAI
    workflow.ChatOpenAI = fixture.Model
    try:
        task = await creation.create(
            a,
            thread,
            uuid4(),
            "Tulis laporan penggunaan",
            False,
            outputs=[{"filename": "usage.md", "format": "md"}],
        )
        task = await fixture.run(a, task)
        check("task_still_completes", task["status"] == "succeeded")
        async with transaction() as conn:
            data = await summary(conn, a)
            row = await one(
                conn,
                "SELECT * FROM compute_balances WHERE resource_key=%s",
                (f"task:{task['id']}",),
            )
            check(
                "task_costs_bound_to_parent",
                row["state"] == "settled" and row["vendor_cost"] > 0,
            )
            check("task_release_does_not_leave_full_hold", row["reserved"] < row["cap"])
            count = await one(
                conn,
                "SELECT count(*) AS n FROM compute_events WHERE work_id=%s",
                (row["id"],),
            )
            check("one_model_call_one_cost", count["n"] == 1)
    finally:
        workflow.ChatOpenAI = original
    from ngertiin.accounts.auth import current_account
    from ngertiin.api.app import app
    from ngertiin.models import Account

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(
        transport=transport, base_url="http://fixture"
    ) as client:
        check("usage_requires_auth", (await client.get("/usage")).status_code == 401)
        app.dependency_overrides[current_account] = lambda: Account(
            id=a, clerk_user_id="fixture"
        )
        try:
            check("usage_http", (await client.get("/usage")).status_code == 200)
            response = await client.get(f"/usage/{unknown['id']}")
            check(
                "owner_can_audit_receipt",
                response.status_code == 200 and bool(response.json()["audit"]),
            )
            bad = await client.post(
                "/usage/estimate", json={"runtime_kind": "text", "cap": 1}
            )
            check("client_cannot_set_price_or_cap", bad.status_code == 422)
            quote = await client.post("/usage/estimate", json={"runtime_kind": "code"})
            check(
                "server_code_estimate_includes_resource",
                quote.status_code == 200 and quote.json()["maximum"] == 138,
            )
            quote = await client.post(
                "/usage/estimate", json={"runtime_kind": "browser"}
            )
            check(
                "e2b_browser_estimate_uses_zero_retained_disk_rate",
                quote.status_code == 200 and quote.json()["maximum"] == 220.44,
            )
            app.dependency_overrides[current_account] = lambda: Account(
                id=b, clerk_user_id="fixture-b"
            )
            check(
                "cross_owner_receipt_hidden",
                (await client.get(f"/usage/{unknown['id']}")).status_code == 404,
            )
            check(
                "invalid_pagination_rejected",
                (await client.get("/usage?offset=-1")).status_code == 422,
            )
        finally:
            app.dependency_overrides.clear()

    from ngertiin.quotas.periods import grant_plus

    c, _ = await fixture.owner()
    async with transaction() as conn:
        old_period = await ledger.period(conn, c)
        await ledger.open_work(conn, c, "old:accepted", "task", "Old period", 100000)
        await conn.execute(
            "UPDATE accounts SET created_at=created_at-interval '31 days' WHERE id=%s",
            (c,),
        )
        new_period = await ledger.period(conn, c)
        check("rollover_creates_new_allowance", old_period["id"] != new_period["id"])
        check(
            "old_reservation_does_not_charge_new_period",
            (await summary(conn, c))["compute"]["reserved"] == 0,
        )
        await grant_plus(conn, c, uuid4(), "operator-fixture:NG040")
        plus = await ledger.period(conn, c)
        check(
            "verified_grant_selects_plus_contract",
            plus["plan"] == "plus" and plus["policy"]["plus"] == 5000000,
        )
    d, dthread = await fixture.owner()
    await open_one(d, "nearly-full", 980000)
    request_key = uuid4()
    await reject(
        "insufficient_allowance_rejects_task_atomically",
        creation.create(d, dthread, request_key, "Task rejected by compute", False),
        429,
    )
    async with transaction() as conn:
        check(
            "denied_task_creates_no_domain_or_queue_entry",
            not await one(
                conn,
                "SELECT id FROM background_tasks WHERE owner_id=%s AND request_key=%s",
                (d, request_key),
            ),
        )
        messages = await one(
            conn,
            "SELECT count(*) AS n FROM chat_messages WHERE thread_id=%s",
            (dthread,),
        )
        check("denied_task_does_not_charge_chat", messages["n"] == 0)
        before = (await summary(conn, d))["compute"]["remaining"]
    budget_owner, _ = await fixture.owner()
    for index, amount in enumerate((600000, 500000)):
        trial = await open_one(budget_owner, f"vendor:{index}", amount)
        async with transaction() as conn:
            await ledger.reserve_event(
                conn, trial, f"vendor-cost:{index}", "model", "probe", price, amount
            )
            await ledger.settle_event(
                conn, budget_owner, f"vendor-cost:{index}", amount, "estimated", {}
            )
            await ledger.finish(conn, budget_owner, f"vendor:{index}", refund=True)
    await reject(
        "refunds_cannot_bypass_provider_period_cap",
        open_one(budget_owner, "vendor:over", 200000),
        429,
    )
    async with transaction() as conn:
        check(
            "provider_block_does_not_consume_refunded_customer_allowance",
            (await summary(conn, budget_owner))["compute"]["remaining"] == 1000,
        )
    from ngertiin.storage import get_object, put_object

    key = f"accounts/{d}/usage-probe/zero-balance.txt"
    await asyncio.to_thread(put_object, key, b"sponsored download", "text/plain")
    check(
        "read_remains_available_with_low_balance",
        await asyncio.to_thread(get_object, key) == b"sponsored download",
    )
    async with transaction() as conn:
        check(
            "storage_is_sponsored_not_customer_charge",
            (await summary(conn, d))["compute"]["remaining"] == before,
        )
        count = await one(
            conn,
            "SELECT count(*) AS n FROM compute_events e JOIN compute_work w ON "
            "w.id=e.work_id WHERE w.owner_id=%s AND e.category='storage'",
            (d,),
        )
        check("storage_attempts_have_cost_telemetry", count["n"] == 2)

    from ngertiin.usage.recovery import reconcile

    crashed, crashed_thread = await fixture.owner()
    run_id = uuid4()
    async with transaction() as conn:
        await conn.execute(
            "INSERT INTO chat_runs(id,thread_id,owner_id,request_key,input,status) "
            "VALUES (%s,%s,%s,%s,'Synthetic crash','failed')",
            (run_id, crashed_thread, crashed, uuid4()),
        )
        await conn.execute(
            "INSERT INTO chat_messages(id,thread_id,run_id,role,parts,status,position) "
            "VALUES (%s,%s,%s,'assistant','[]','failed',1)",
            (uuid4(), crashed_thread, run_id),
        )
        work = await ledger.open_work(
            conn, crashed, f"chat:{run_id}", "chat", "Crash fixture", 10000
        )
        orphan = await ledger.reserve_event(
            conn, work, f"chat-model:{uuid4()}", "model", "openai", price, 1000
        )
    await reconcile()
    async with transaction() as conn:
        e = await one(conn, "SELECT * FROM compute_events WHERE id=%s", (orphan["id"],))
        w = await one(conn, "SELECT * FROM compute_balances WHERE id=%s", (work["id"],))
        check(
            "crashed_chat_attempt_becomes_unknown",
            e["state"] == "unknown" and e["amount"] == 1000,
        )
        check(
            "crash_recovery_refunds_no_output_without_erasing_vendor_cost",
            w["used"] == 0 and w["reserved"] == 0 and w["vendor_cost"] == 1000,
        )
    from ngertiin.usage.storage import begin

    abandoned = await asyncio.to_thread(begin, f"accounts/{crashed}/orphan-test", "get")
    async with transaction() as conn:
        await conn.execute(
            "UPDATE compute_events SET created_at=now()-interval '11 minutes' "
            "WHERE id=%s",
            (abandoned["id"],),
        )
    await reconcile()
    async with transaction() as conn:
        orphan = await one(
            conn, "SELECT * FROM compute_events WHERE id=%s", (abandoned["id"],)
        )
        check(
            "interrupted_storage_attempt_stays_unknown_not_free",
            orphan["state"] == "unknown" and orphan["amount"] == abandoned["cap"],
        )

    # Resource receipts must identify the actual provider, independent of older adapters.
    from ngertiin.usage import events

    receipt_owner, _ = await fixture.owner()
    task_id, session_id = uuid4(), uuid4()
    async with transaction() as conn:
        await ledger.open_work(
            conn, receipt_owner, f"task:{task_id}", "task", "E2B receipt fixture", 10000
        )
        await events.resource_reserve(
            conn,
            {"id": task_id, "owner_id": receipt_owner},
            {
                "id": session_id,
                "policy": {"provider": "e2b"},
                "reserved_microusd": 1000,
            },
            "computer",
        )
        receipt = await one(
            conn,
            "SELECT provider FROM compute_events WHERE identity=%s",
            (f"computer:{session_id}",),
        )
        check("resource_receipt_uses_actual_provider", receipt["provider"] == "e2b")


async def live_scenarios():
    from ngertiin.config import get_settings
    from ngertiin.files import store as files
    from ngertiin.memory.engine import Engine
    from ngertiin.memory.store import settings as memory_settings
    from ngertiin.tasks import creation, workflow
    from ngertiin.usage import events
    from PIL import Image, ImageDraw

    owner, thread = await fixture.owner()
    async with transaction() as conn:
        config = await memory_settings(conn, owner)

    def models():
        with Engine(owner, config["generation"], "usage-audit") as engine:
            engine.client.embeddings.create(
                model=get_settings().memory_embedding_model,
                input="Synthetic NG-040 billing fixture.",
            )
            engine.client.chat.completions.create(
                model=get_settings().memory_extraction_model,
                messages=[{"role": "user", "content": "Return exactly the word OK."}],
                max_completion_tokens=256,
                reasoning_effort="low",
            )

    await asyncio.to_thread(models)
    image = Image.new("RGB", (1100, 240), "white")
    draw = ImageDraw.Draw(image)
    draw.text((35, 40), "NG-040 SYNTHETIC BILLING PROBE", fill="black", font_size=35)
    draw.text(
        (35, 110),
        "Report total: 42. No private information.",
        fill="black",
        font_size=28,
    )
    data = io.BytesIO()
    image.save(data, format="PNG")
    file = await files.upload(owner, uuid4(), "ng040-synthetic.png", data.getvalue())
    original = workflow.ChatOpenAI
    workflow.ChatOpenAI = fixture.Model
    try:
        task = await creation.create(
            owner,
            thread,
            uuid4(),
            "Read the synthetic total",
            False,
            inputs=[{"revision_id": str(file["uploaded_revision_id"])}],
            outputs=[{"filename": "ocr.md", "format": "md"}],
        )
        task = await fixture.run(owner, task)
        check(
            "live_ocr_with_controlled_downstream_model", task["status"] == "succeeded"
        )
    finally:
        workflow.ChatOpenAI = original
    async with transaction() as conn:
        await events.refresh(conn, owner)
        costs = await (
            await conn.execute(
                "SELECT e.category,e.model,e.state,e.amount,e.quantity,"
                "e.invoice_confirmed,e.price FROM compute_events e JOIN compute_work w ON w.id=e.work_id "
                "WHERE w.owner_id=%s ORDER BY e.created_at",
                (owner,),
            )
        ).fetchall()
        check(
            "live_memory_and_ocr_have_estimates",
            {"memory", "ocr", "storage"} <= {c["category"] for c in costs}
            and all(c["state"] == "estimated" for c in costs),
        )
        check(
            "live_estimates_do_not_claim_invoice",
            all(not c["invoice_confirmed"] for c in costs),
        )
        Path(".dev/usage-live-providers.json").write_text(
            json.dumps(
                {
                    "environment": "isolated development database; synthetic image and prompts",
                    "owner_id": str(owner),
                    "task_id": str(task["id"]),
                    "file_task_model": "controlled fixture; OCR and memory providers real",
                    "cost_events": costs,
                },
                default=str,
                indent=2,
            )
            + "\n"
        )


if __name__ == "__main__":
    if "--live" in sys.argv:
        sys.argv.remove("--live")

        async def combined():
            await scenarios()
            await live_scenarios()

        fixture.scenarios = combined
    else:
        fixture.scenarios = scenarios
    fixture.main()
