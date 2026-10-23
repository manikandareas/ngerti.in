"""Version-two regression contracts using disposable PostgreSQL and MinIO."""

import hashlib
import json
import sys
import tempfile
import time
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

import inspect_computer as browser
import inspect_files as harness
from ngertiin.computer import actuator, candidates, evidence, jev, reporting, targets
from ngertiin.computer.contracts import Action, InspectedTarget
from ngertiin.config import get_settings
from ngertiin.tasks import budget


class Computer(browser.ControlledComputer):
    def __init__(self):
        super().__init__()
        self.index = 0

    async def start(self, workspace, seconds):
        workspace["capability"] = {"dom": True, "generation": "test-generation"}
        return await super().start(workspace, seconds)

    async def observe_dom(self, workspace):
        return {
            "url": f"https://source{self.index}.example/article",
            "title": f"Source {self.index}",
            "text": f"Original source evidence {self.index}: growth measured in 2026.",
            "document": str(self.index),
            "target_id": str(self.index),
            "actions": [],
            "scroll": {"y": 0, "height": 720},
        }

    async def target(self, workspace, action):
        return InspectedTarget(
            str(self.index), {"href": f"https://source{self.index + 1}.example/article"}
        )

    async def act(self, workspace, action, *, expected_target=""):
        self.index += 1
        await super().act(workspace, action, expected_target=expected_target)


def actuator_contracts():
    with (
        tempfile.TemporaryDirectory() as folder,
        patch.object(actuator, "ROOT", Path(folder)),
    ):
        lease = {
            "epoch": 1,
            "task": "a",
            "deadline": time.time() + 60,
            "control": "agent",
        }
        actuator.dispatch({**lease, "operation": "control"})
        atomic = lambda p, v: p.write_text(json.dumps(v))
        with patch.dict(sys.modules, {"targets": SimpleNamespace(atomic=atomic)}):
            request = {
                **lease,
                "operation": "act",
                "dispatch_id": "one",
                "action": {"kind": "click"},
            }
            with patch.object(
                actuator, "perform", return_value={"executed": True}
            ) as perform:
                actuator.dispatch(request)
                actuator.dispatch(request)
                harness.check(
                    "same_dispatch_replay_does_not_input_twice", perform.call_count == 1
                )
                try:
                    actuator.dispatch({**request, "action": {"kind": "type"}})
                except ValueError:
                    harness.check("changed_dispatch_payload_rejected", True)
                else:
                    raise AssertionError("changed dispatch")
            request["dispatch_id"] = "lost"
            with patch.object(actuator, "perform", side_effect=OSError("lost")):
                try:
                    actuator.dispatch(request)
                except OSError:
                    pass
            with patch.object(actuator, "perform", Mock()) as perform:
                harness.check(
                    "accepted_without_receipt_is_unknown",
                    actuator.dispatch(request) == {"unknown": True}
                    and not perform.called,
                )
        actuator.dispatch(
            {**lease, "epoch": 2, "operation": "control", "control": "human"}
        )
        for operation in ("screen", "dom", "act"):
            try:
                actuator.dispatch({**lease, "operation": operation})
            except ValueError:
                harness.check("old_epoch_rejected_" + operation, True)
            else:
                raise AssertionError(operation)


async def scenarios():
    original_version = get_settings().computer_workflow_version
    get_settings().computer_workflow_version = 2
    original_runtime = browser.policy.get_runtime
    try:
        actuator_contracts()
        import httpx
        from ngertiin.api.app import app

        async def broken_request():
            raise RuntimeError("private-canary-do-not-return")

        app.add_api_route("/__controlled_fault", broken_request)
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            failure = await client.get("/__controlled_fault")
            healthy = await client.get("/health/live")
        harness.check(
            "unexpected_api_error_is_caught_and_redacted",
            failure.status_code == 500
            and "private-canary" not in failure.text
            and bool(failure.headers.get("X-Request-ID"))
            and healthy.status_code == 200,
        )
        source = {"targetId": "search", "type": "page", "url": "https://search.example"}
        article = {
            "targetId": "article",
            "openerId": "search",
            "type": "page",
            "url": "https://article.example",
        }
        harness.check(
            "adopt_causal_new_tab",
            targets.choose("search", ["search"], [source, article]) == article,
        )
        try:
            targets.choose(
                "search", ["search"], [source, {**article, "openerId": "other"}]
            )
        except ValueError:
            harness.check("unrelated_popup_not_adopted", True)
        else:
            raise AssertionError("popup")
        harness.check(
            "blank_popup_waits",
            targets.choose(
                "search", ["search"], [source, {**article, "url": "about:blank"}]
            )
            is None,
        )
        computer = Computer()
        browser.policy.get_runtime = lambda *_: computer
        owner, thread = await harness.owner()
        task = await browser.create(owner, thread)

        failures = 0

        async def decide(execution, page, history):
            nonlocal failures
            if failures == 0:
                failures += 1
                raise OSError("controlled transient observation failure")
            return (
                jev.Decision("done", relevant=True)
                if computer.index == 2
                else jev.Decision(
                    "act",
                    Action(kind="click", description="Open next source"),
                    relevant=True,
                )
            )

        async def synthesize(execution, rows):
            harness.check("three_source_evidence_before_synthesis", len(rows) == 3)
            return reporting.Report(
                summary="Laporan bersumber.",
                files=[
                    reporting.File(
                        filename=s["filename"],
                        content="# Laporan\n"
                        + "\n".join(r["url"] + " " + r["excerpt"] for r in rows),
                    )
                    for s in execution["output_spec"]
                ],
                citations=[
                    reporting.Citation(
                        claim=r["excerpt"], evidence_id=r["id"], quote=r["excerpt"]
                    )
                    for r in rows
                ],
                complete=True,
            )

        with (
            patch.object(jev, "decide", decide),
            patch.object(reporting, "synthesize", synthesize),
            patch.object(
                reporting,
                "verify",
                AsyncMock(
                    return_value=reporting.Verdict(status="passed", reason="Supported")
                ),
            ),
        ):
            result = await browser.run(owner, task)
            harness.check(
                "transient_error_checkpoints_for_retry", result["status"] == "queued"
            )
            result = await browser.run(owner, result)
        harness.check(
            "v2_publishes_verified_result",
            result["status"] == "succeeded" and bool(result["result"]),
        )
        async with browser.tasks.transaction() as conn:
            row = await browser.tasks.one(
                conn,
                "SELECT * FROM computer_candidates WHERE task_id=%s",
                (task["id"],),
            )
            harness.check("candidate_persisted_with_verdict", row["state"] == "passed")
            raw = await browser.tasks.owned(conn, owner, task["id"])
            altered = {**raw, "draft": json.dumps({"files": [], "summary": "tampered"})}
            try:
                await candidates.require_publishable(conn, altered)
            except ValueError:
                harness.check("publication_revalidates_candidate_digest", True)
            else:
                raise AssertionError("candidate tamper")

        # Reserve replay is a real transaction with the historical remaining work.
        owner, thread = await harness.owner()
        task = await browser.create(owner, thread)
        execution = await browser.tasks.claim(task["id"])
        async with browser.tasks.locked(owner, task["id"]) as (conn, _current):
            await conn.execute(
                "UPDATE background_tasks SET budget_cap=60000,usage_units=36624 WHERE id=%s",
                (task["id"],),
            )
        call_id = await budget.reserve_call(execution, 26630, role="browser_decision")
        async with browser.tasks.transaction() as conn:
            current = await browser.tasks.owned(conn, owner, task["id"])
        harness.check(
            "browser_not_blocked_by_legacy_token_cap",
            bool(call_id) and current["usage_units"] > current["budget_cap"],
        )
        await budget.settle_call(execution, call_id, {"total_tokens": 5000})
        await browser.commands.cancel(owner, task["id"])

        computer.index = 0
        owner, thread = await harness.owner()
        task = await browser.create(owner, thread)
        with (
            patch.object(jev, "decide", decide),
            patch.object(reporting, "synthesize", synthesize),
            patch.object(
                reporting,
                "verify",
                AsyncMock(
                    return_value=reporting.Verdict(
                        status="failed", reason="Unsupported claim"
                    )
                ),
            ),
        ):
            result = await browser.run(owner, task)
        harness.check(
            "failed_verifier_delivers_labeled_partial_not_success",
            result["status"] != "succeeded"
            and result["stage"] == "computer_partial"
            and bool(result["result"]),
        )
        async with browser.tasks.transaction() as conn:
            rows = await (
                await conn.execute(
                    "SELECT state FROM computer_candidates WHERE task_id=%s",
                    (task["id"],),
                )
            ).fetchall()
            harness.check(
                "rejected_candidate_retained_beside_partial",
                {r["state"] for r in rows} == {"failed", "partial"},
            )

        # Stopping exploration must still use finalization, not skip the verifier.
        computer.index = 0
        owner, thread = await harness.owner()
        task = await browser.create(owner, thread)

        async def limited(execution, page, history):
            if computer.index == 3:
                raise budget.BudgetExhausted("exploration call limit")
            return jev.Decision(
                "act", Action(kind="click", description="Read next"), relevant=True
            )

        with (
            patch.object(jev, "decide", limited),
            patch.object(reporting, "synthesize", synthesize),
            patch.object(
                reporting,
                "verify",
                AsyncMock(
                    return_value=reporting.Verdict(status="passed", reason="Supported")
                ),
            ) as verify,
        ):
            result = await browser.run(owner, task)
        harness.check(
            "exploration_limit_still_synthesizes_and_verifies",
            result["status"] == "succeeded" and verify.await_count == 1,
        )

        from ngertiin.computer import resilience

        flaky = AsyncMock(side_effect=[OSError("temporary"), "ok"])
        harness.check(
            "finalizer_recovers_transient_error",
            await resilience.model_result(flaky) == "ok" and flaky.await_count == 2,
        )
        broken = AsyncMock(side_effect=OSError("persistent"))
        try:
            await resilience.model_result(broken)
        except resilience.FinalizationUnavailable:
            harness.check("finalizer_retries_are_bounded", broken.await_count == 2)
        else:
            raise AssertionError("unbounded finalizer")
        harness.check(
            "search_results_are_not_article_evidence",
            not await evidence.save(
                {},
                {"url": "https://www.google.com/search?q=agent", "text": "AI summary"},
            ),
        )

        owner, thread = await harness.owner()
        task = await browser.create(owner, thread)
        with patch.object(
            computer, "observe_dom", AsyncMock(side_effect=OSError("offline"))
        ):
            statuses = []
            for _ in range(4):
                task = await browser.run(owner, task)
                statuses.append(task["status"])
        harness.check(
            "persistent_browser_error_has_bounded_recovery",
            statuses == ["queued", "queued", "queued", "failed"],
        )

        from ngertiin.computer import permissions

        reload = {
            "browser_error": True,
            "id": "reload-button",
            "tag": "BUTTON",
            "label": "Reload",
        }
        click = Action(kind="click", description="Reload browser error page")
        harness.check(
            "browser_error_reload_does_not_need_approval",
            not permissions.requires_approval(click, InspectedTarget("x", reload)),
        )
        harness.check(
            "website_reload_label_is_not_a_permission_bypass",
            permissions.requires_approval(
                click, InspectedTarget("x", {**reload, "browser_error": False})
            ),
        )

        # Original excerpts must match: no model call for a fabricated quote.
        report = reporting.Report(
            summary="test",
            files=[],
            citations=[
                reporting.Citation(claim="invented", evidence_id="one", quote="absent")
            ],
            complete=True,
        )
        verdict = await reporting.verify(
            {}, report, [{"id": "one", "excerpt": "actual"}]
        )
        harness.check(
            "fabricated_quote_fails_without_model", verdict.status == "failed"
        )
        harness.check(
            "tracking_removed_without_changing_search_query",
            evidence.safe_url("https://example.com/search?q=agent&utm_source=test")
            == "https://example.com/search?q=agent",
        )
        harness.check(
            "spa_fragment_preserved",
            evidence.safe_url("https://example.com/#/article/3")
            == "https://example.com/#/article/3",
        )
        harness.check(
            "candidate_digest_stable",
            candidates.digest({"a": 1}) == hashlib.sha256(b'{"a": 1}').hexdigest(),
        )
    finally:
        get_settings().computer_workflow_version = original_version
        browser.policy.get_runtime = original_runtime
        await harness.close_pool()


if __name__ == "__main__":
    harness.scenarios = scenarios
    if len(sys.argv) == 1:
        sys.argv.extend(["--output", ".dev/computer-v2/contracts.json"])
    harness.main()
