"""Native browser guidance and failed-batch diagnostics through the real gateway."""

# ruff: noqa: F811
import json
import os
import sqlite3
from uuid import uuid4

import pytest
from test_capabilities import capability_agent
from test_direct_messages import send
from test_runtime import OWNER, command, runtime, settle  # noqa: F401

pytestmark = pytest.mark.skipif(
    not os.environ.get("NMA_TEST_DESKTOP_IMAGE"),
    reason="Requires the reviewed browser image",
)


@pytest.fixture
def browser_gateway(runtime):
    root, model, call, *_ = runtime
    image = os.environ["NMA_TEST_DESKTOP_IMAGE"]
    (root / "capabilities.json").write_text(
        json.dumps(
            {
                "version": 2,
                "execution_surfaces": {
                    "linux": {"ready": True, "kind": "scoped_linux", "image": image}
                },
                "tool_grants": {
                    name: {
                        "enabled": True,
                        "toolset": name,
                        "execution_surface": "linux",
                    }
                    for name in ["browser", "terminal"]
                },
            }
        )
    )
    agent = capability_agent(
        call, "browser-recovery-" + uuid4().hex[:8], tool_grants=["browser", "terminal"]
    )
    thread = call(command("thread.read", {"thread_id": agent["primary_dm_thread_id"]}))[
        "result"
    ]
    try:
        yield root, model, call, thread
    finally:
        model.goal_script = None
        from ngertiin_engine.native_executor import IsolatedTools

        for journal in (root / "state/native-execution").glob("*/isolated-tools.db"):
            IsolatedTools(journal.parent, OWNER, image=image).cleanup()


def test_isolated_browser_description_matches_available_native_helpers(browser_gateway):
    _, model, call, thread = browser_gateway
    run = call(send(thread, "Inspect available native browser instructions."))["result"]
    settle(call, run["run_id"])
    definitions = [
        tool["function"]
        for body in model.requests
        for tool in body.get("tools", [])
        if tool.get("function", {}).get("name") == "browser_exec"
    ]
    assert definitions
    for definition in definitions:
        assert "CLI is not installed yet" not in definition["description"]
        assert "Python variables do NOT" in definition["description"]
        assert "cdp('Domain.method', **kwargs)" in definition["description"]


@pytest.mark.parametrize("with_screenshot", [False, True])
def test_failed_native_batch_preserves_diagnostics_and_never_replays(
    browser_gateway, with_screenshot
):
    root, model, call, thread = browser_gateway
    first_request = len(model.requests)
    screenshot = "print(capture_screenshot());" if with_screenshot else ""
    code = (
        "from pathlib import Path;p=Path('/work/dispatch-count');p.write_text(str(int(p.read_text())+1) if p.exists() else '1');"
        + screenshot
        + "raise NameError('NMA032_NATIVE_DIAGNOSTIC')"
    )

    def script(body, text):
        if not body.get("messages"):
            return None
        if any(message["role"] == "tool" for message in body["messages"]):
            return {
                "role": "assistant",
                "content": "Native failure observed without replay.",
            }
        return {
            "role": "assistant",
            "content": None,
            "tool_calls": [
                {
                    "id": "native-browser-error",
                    "type": "function",
                    "function": {
                        "name": "browser_exec",
                        "arguments": json.dumps({"code": code}),
                    },
                }
            ],
        }

    model.goal_script = script
    request = send(thread, "Run the disposable browser failure probe.")
    run = call(request)["result"]
    settle(call, run["run_id"], "indeterminate")
    tools = [
        message
        for body in model.requests[first_request:]
        for message in body.get("messages", [])
        if message["role"] == "tool"
    ]
    assert any(
        "NMA032_NATIVE_DIAGNOSTIC" in str(message.get("content", ""))
        for message in tools
    )
    assert any(
        '"outcome": "indeterminate"' in str(message.get("content", ""))
        for message in tools
    )
    replay = call(request)["result"]
    assert replay["run_id"] == run["run_id"]
    journal = next((root / "state/native-execution").glob("*/isolated-tools.db"))
    from ngertiin_engine.native_executor import IsolatedTools, Scope

    broker = IsolatedTools(
        journal.parent, OWNER, image=os.environ["NMA_TEST_DESKTOP_IMAGE"]
    )
    with sqlite3.connect(journal) as db:
        scope = Scope(
            **json.loads(
                db.execute(
                    "SELECT scope_json FROM scopes WHERE json_extract(scope_json,'$.thread_id')=?",
                    (thread["thread_id"],),
                ).fetchone()[0]
            )
        )
        assert (
            db.execute(
                "SELECT COUNT(*) FROM operations WHERE tool='browser_exec' AND scope_key=?",
                (scope.key,),
            ).fetchone()[0]
            == 1
        )
        assert (
            db.execute(
                "SELECT state FROM operations WHERE tool='browser_exec' AND scope_key=?",
                (scope.key,),
            ).fetchone()[0]
            == "indeterminate"
        )
    assert broker.file_bytes(scope, "dispatch-count") == b"1"
    if with_screenshot:
        with sqlite3.connect(root / "state/state.db") as db:
            events = [
                json.loads(row[0])
                for row in db.execute("SELECT payload FROM nma_events")
            ]
        assert any(
            event.get("type") == "artifact.ready"
            and event.get("run_id") == run["run_id"]
            for event in events
        )


def test_unknown_image_result_preserves_native_blocks_and_failure_semantics():
    from ngertiin_engine.outcomes import evidence, unknown_result

    image = {
        "type": "image_url",
        "image_url": {"url": "data:image/png;base64,synthetic"},
    }
    native = {
        "_multimodal": True,
        "text_summary": json.dumps({"success": False, "stderr": "Native diagnostic"}),
        "content": [image],
    }
    assert evidence(native) == "unknown"
    wrapped = unknown_result(native, "scope", "operation", "indeterminate")
    assert isinstance(wrapped, dict) and wrapped["content"][-1] is image
    assert json.loads(wrapped["text_summary"])["outcome"] == "indeterminate"
    assert (
        json.loads(wrapped["content"][0]["text"])["native_operation"]["operation_id"]
        == "operation"
    )
    assert native["content"] == [image]
