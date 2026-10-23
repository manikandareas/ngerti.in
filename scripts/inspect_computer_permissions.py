"""Risk-based browser permissions at the durable dispatch boundary."""

import sys
import tempfile
import time
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

import inspect_computer as browser
import inspect_files as harness
from ngertiin.computer import actuator, lifecycle, model, permissions
from ngertiin.computer.contracts import Action, InspectedTarget, NeedsHuman


def policy_scenarios():
    search = {"tag": "INPUT", "label": "Search", "search": True}
    form = {
        "action": "https://example.com/search",
        "search": True,
        "fields": ["City", "Search"],
    }
    harness.check(
        "article_resource_url_auto",
        not permissions.requires_approval(
            Action(
                kind="navigate",
                description="Baca artikel",
                url="https://example.com/post/123",
            ),
            InspectedTarget("hash"),
        ),
    )
    harness.check(
        "pagination_button_auto",
        not permissions.requires_approval(
            Action(kind="click", description="Baca"),
            InspectedTarget("hash", {"label": "Next page"}),
        ),
    )
    harness.check(
        "post_form_search_field_not_automatic",
        permissions.requires_approval(
            Action(kind="type", description="Cari", text="Lisbon"),
            InspectedTarget(
                "hash",
                {
                    "search": True,
                    "form": {"action": "https://example.com/profile", "search": False},
                },
            ),
        ),
    )
    for label, action, context, approved in (
        (
            "article_slug_with_risk_words_is_navigation",
            Action(
                kind="navigate",
                description="Read",
                url="https://example.com/blog/ai-agent-security-trends",
            ),
            {},
            False,
        ),
        (
            "actual_delete_endpoint_still_requires_approval",
            Action(
                kind="navigate",
                description="Delete",
                url="https://example.com/account/delete",
            ),
            {},
            True,
        ),
        (
            "article_headline_with_change_is_navigation",
            Action(kind="click", description="Read article"),
            {
                "href": "https://www.google.com/goto?url=article",
                "label": "8 AI Trends That Will Change Everything in 2027",
            },
            False,
        ),
        (
            "command_shaped_link_still_requires_approval",
            Action(kind="click", description="Delete"),
            {"href": "https://example.com/do?id=123", "label": "Delete account"},
            True,
        ),
        (
            "new_public_url_auto",
            Action(kind="navigate", description="Buka", url="https://example.com"),
            {},
            False,
        ),
        (
            "search_about_deletion_auto",
            Action(
                kind="navigate",
                description="Cari",
                url="https://example.com/search?q=delete+account",
            ),
            {},
            False,
        ),
        (
            "logout_url_requires_approval",
            Action(
                kind="navigate", description="Baca", url="https://example.com/sign-out"
            ),
            {},
            True,
        ),
        (
            "query_mutation_requires_approval",
            Action(
                kind="navigate",
                description="Baca",
                url="https://example.com/profile?action=delete",
            ),
            {},
            True,
        ),
        (
            "ordinary_link_auto",
            Action(kind="click", description="Buka"),
            {"href": "https://example.com/reports", "label": "Reports"},
            False,
        ),
        (
            "delete_link_requires_approval",
            Action(kind="click", description="Harmless"),
            {"href": "https://example.com/delete_account", "label": "Continue"},
            True,
        ),
        (
            "search_typing_auto",
            Action(kind="type", description="Cari", text="Lisbon"),
            search,
            False,
        ),
        (
            "search_enter_auto",
            Action(kind="key", description="Cari", key="Enter"),
            search,
            False,
        ),
        (
            "search_submit_auto",
            Action(kind="click", description="Cari"),
            {"label": "Search hotels", "form": form},
            False,
        ),
        (
            "send_in_search_form_requires_approval",
            Action(kind="click", description="Cari"),
            {"label": "Send", "form": form},
            True,
        ),
        (
            "email_enter_requires_approval",
            Action(kind="key", description="Baca", key="Enter"),
            {"label": "Message", "editable_rich": True},
            True,
        ),
        (
            "edit_field_requires_approval",
            Action(kind="type", description="Baca", text="New name"),
            {"label": "Full name"},
            True,
        ),
        (
            "save_requires_approval",
            Action(kind="click", description="Baca"),
            {"label": "Simpan", "disclosure": True},
            True,
        ),
        (
            "pay_requires_approval",
            Action(kind="click", description="Baca"),
            {"label": "Bayar sekarang"},
            True,
        ),
        (
            "security_requires_approval",
            Action(kind="click", description="Baca"),
            {"label": "Security settings", "disclosure": True},
            True,
        ),
        (
            "tab_auto",
            Action(kind="click", description="Baca"),
            {"role": "tab", "label": "Overview"},
            False,
        ),
        (
            "disclosure_auto",
            Action(kind="click", description="Baca"),
            {"tag": "SUMMARY", "label": "Details"},
            False,
        ),
        (
            "unknown_target_requires_approval",
            Action(kind="click", description="Harmless"),
            {},
            True,
        ),
        (
            "enter_unknown_button_requires_approval",
            Action(kind="key", description="Harmless", key="Enter"),
            {"tag": "BUTTON"},
            True,
        ),
    ):
        harness.check(
            label,
            permissions.requires_approval(action, InspectedTarget("hash", context))
            is approved,
        )
    for label, action, context in (
        (
            "credential_url_private",
            Action(
                kind="navigate",
                description="Buka",
                url="https://example.com/?access_token=private",
            ),
            {},
        ),
        (
            "private_input_takeover",
            Action(kind="type", description="Isi", text="private"),
            {"private": True},
        ),
    ):
        try:
            permissions.requires_approval(action, InspectedTarget("hash", context))
        except NeedsHuman:
            harness.check(label, True)
        else:
            raise AssertionError(label)


def actuator_scenarios():
    dispatch = Mock()
    with (
        tempfile.TemporaryDirectory() as folder,
        patch.object(actuator, "ROOT", Path(folder)),
        patch.object(actuator, "privacy", return_value=False),
        patch.dict(
            sys.modules,
            {
                "cdp": SimpleNamespace(
                    call=Mock(),
                    page_target=lambda: {"id": "owned"},
                    target_fingerprint=lambda _: {
                        "fingerprint": "new",
                        "private": False,
                    },
                ),
                "desktop_io": SimpleNamespace(act=dispatch),
                "targets": SimpleNamespace(
                    begin=Mock(),
                    reconcile=Mock(),
                    handback=Mock(),
                    atomic=lambda p, v: p.write_text(__import__("json").dumps(v)),
                ),
            },
        ),
    ):
        lease = {
            "epoch": 1,
            "task": "test",
            "deadline": time.time() + 60,
            "control": "agent",
        }
        actuator.dispatch({**lease, "operation": "control"})
        request = {
            **lease,
            "operation": "act",
            "action": {"kind": "click"},
            "expected_target": "old",
            "dispatch_id": "stale-attempt",
        }
        harness.check(
            "changed_target_rejected_before_input",
            actuator.dispatch(request) == {"stale": True} and not dispatch.called,
        )
        actuator.dispatch(
            {**request, "expected_target": "new", "dispatch_id": "confirmed-attempt"}
        )
        harness.check("matching_target_dispatches_once", dispatch.call_count == 1)


async def scenarios():
    # Legacy actor fixtures retain their explicit workflow contract.
    from ngertiin.config import get_settings

    get_settings().computer_workflow_version = 1
    try:
        policy_scenarios()
        actuator_scenarios()
        with (
            patch.object(browser.policy, "get_runtime", lambda *_: browser.COMPUTER),
            patch.object(model, "propose", browser.propose),
        ):
            owner, thread = await harness.owner()
            browser.DECISIONS.append(
                Action(
                    kind="navigate",
                    description="Buka situs",
                    url="https://example.com/news",
                )
            )
            result = await browser.run(owner, await browser.create(owner, thread))
            harness.check(
                "public_navigation_without_exact_url_grant",
                result["status"] == "succeeded",
            )
            for label, action, context, automatic in (
                (
                    "observed_link_runs_without_pause",
                    Action(kind="click", description="Buka laporan"),
                    {"href": "https://example.com/reports", "label": "Reports"},
                    True,
                ),
                (
                    "observed_search_runs_without_pause",
                    Action(kind="type", description="Cari", text="Lisbon"),
                    {"label": "Search", "search": True},
                    True,
                ),
                (
                    "send_email_waits_before_dispatch",
                    Action(kind="click", description="Harmless"),
                    {"label": "Kirim email"},
                    False,
                ),
                (
                    "unknown_control_waits_before_dispatch",
                    Action(kind="click", description="Harmless"),
                    {},
                    False,
                ),
            ):
                owner, thread = await harness.owner()
                browser.DECISIONS.append(action)
                before = len(browser.COMPUTER.dispatched)
                with patch.object(
                    browser.COMPUTER,
                    "target",
                    AsyncMock(return_value=InspectedTarget("same", context)),
                ):
                    result = await browser.run(
                        owner, await browser.create(owner, thread)
                    )
                    if automatic:
                        harness.check(
                            label,
                            result["status"] == "succeeded"
                            and len(browser.COMPUTER.dispatched) == before + 1,
                        )
                    else:
                        harness.check(
                            label,
                            result["stage"] == "computer_approval"
                            and len(browser.COMPUTER.dispatched) == before,
                        )
                        proposal, workspace = (
                            result["computer"]["action"],
                            result["computer"]["workspace"],
                        )
                        await browser.control.decide(
                            owner,
                            result["id"],
                            proposal["id"],
                            workspace["control_version"],
                            True,
                        )
                        result = await browser.run(owner, result)
                        harness.check(
                            label + "_exact_approval_once",
                            result["status"] == "succeeded"
                            and len(browser.COMPUTER.dispatched) == before + 1,
                        )
            owner, thread = await harness.owner()
            browser.DECISIONS.append(
                Action(kind="type", description="Isi", text="private")
            )
            before = len(browser.COMPUTER.dispatched)
            with patch.object(
                browser.COMPUTER,
                "target",
                AsyncMock(return_value=InspectedTarget("same", {"private": True})),
            ):
                result = await browser.run(owner, await browser.create(owner, thread))
            harness.check(
                "private_target_yields_to_takeover_without_input",
                result["stage"] == "computer_human"
                and len(browser.COMPUTER.dispatched) == before,
            )
            await browser.commands.cancel(owner, result["id"])
            await lifecycle.stop_task(owner, result["id"])
    finally:
        await harness.close_pool()


if __name__ == "__main__":
    harness.scenarios = scenarios
    if len(sys.argv) == 1:
        sys.argv.extend(["--output", ".dev/computer-permissions.json"])
    harness.main()
