"""The download adaptation preserves native guards, task binding and uncertainty."""

import json
from types import SimpleNamespace

import pytest


@pytest.fixture
def companion(monkeypatch):
    import model_tools  # noqa: F401
    from ngertiin_engine.browser_supervision import install_download_transport
    from tools import browser_cdp_tool as native
    from tools.browser_supervisor import SUPERVISOR_REGISTRY

    endpoint = "ws://127.0.0.1:9222/devtools/browser/test"
    monkeypatch.setattr(native, "_resolve_cdp_endpoint", lambda: endpoint)
    monkeypatch.setattr(native, "_browser_cdp_private_guard", lambda **kwargs: None)
    # Restore the two patched native seams after each test.
    monkeypatch.setattr(native, "browser_cdp", native.browser_cdp)
    monkeypatch.setattr(native, "_cdp_call", native._cdp_call)
    calls = []
    channel = SimpleNamespace(cdp_url=endpoint)

    def capture(task_id, **kwargs):
        calls.append(("capture", task_id))
        return channel

    monkeypatch.setattr(SUPERVISOR_REGISTRY, "capture", capture)
    monkeypatch.setattr(
        SUPERVISOR_REGISTRY,
        "get_or_start",
        lambda task_id, *a, **k: calls.append(("start", task_id)),
    )
    install_download_transport()
    return native, calls, channel


def test_native_guard_refuses_before_persistent_dispatch(companion, monkeypatch):
    native, calls, _ = companion
    monkeypatch.setattr(
        native,
        "_browser_cdp_private_guard",
        lambda **kwargs: json.dumps({"error": "private page"}),
    )
    result = json.loads(
        native.browser_cdp("Browser.setDownloadBehavior", {"behavior": "allow"})
    )
    assert result["error"] == "private page"
    assert calls == []


def test_lost_reply_is_not_retried_and_task_context_is_reset(companion):
    native, calls, channel = companion

    def lost(*args, **kwargs):
        calls.append(("send", args[0]))
        raise TimeoutError("lost response")

    channel.call = lost
    for task_id in ["first", "second"]:
        result = json.loads(
            native.browser_cdp(
                "Browser.setDownloadBehavior", {}, None, None, 1, task_id
            )
        )
        assert "timed out" in result["error"]
    assert calls == [
        ("start", "first"),
        ("capture", "first"),
        ("send", "Browser.setDownloadBehavior"),
        ("start", "second"),
        ("capture", "second"),
        ("send", "Browser.setDownloadBehavior"),
    ]


def test_replaced_endpoint_is_never_used(companion):
    native, calls, channel = companion
    channel.cdp_url = "ws://another-scope"
    channel.call = lambda *a, **k: pytest.fail("Must not dispatch to another endpoint")
    result = json.loads(native.browser_cdp("Browser.setDownloadBehavior", {}))
    assert "endpoint changed" in result["error"]
    assert calls == [("start", "default"), ("capture", "default")]
