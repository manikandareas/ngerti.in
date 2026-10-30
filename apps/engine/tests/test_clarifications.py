"""Native clarify tool, scoped web replies, cancel and duplicate-tab contracts."""

# ruff: noqa: F811
import json
import time
from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4

from test_direct_messages import send
from test_runtime import command, runtime, settle  # noqa: F401


def test_native_clarification_response_scope_cancel_and_duplicate_tabs(runtime):
    root, provider, call, *_ = runtime
    (root / "capabilities.json").write_text(
        json.dumps(
            {
                "version": 2,
                "execution_surfaces": {
                    "conversation": {"kind": "scoped_conversation", "ready": True}
                },
                "tool_grants": {
                    "clarification": {
                        "enabled": True,
                        "toolset": "clarify",
                        "execution_surface": "conversation",
                    }
                },
            }
        )
    )
    created = call(
        command(
            "agent.create",
            {
                "display_name": "Clarifier",
                "handle": "clarifier",
                "config": {
                    "soul": "Ask a native clarifying question when needed.",
                    "instructions": "",
                    "model": "test",
                    "tool_grants": ["clarification"],
                },
            },
        )
    )
    assert "result" in created, created
    a = created["result"]["agent"]
    thread = call(command("thread.read", {"thread_id": a["primary_dm_thread_id"]}))[
        "result"
    ]

    def respond(body, text):
        if "ASK_NATIVE" not in text:
            return None
        if body["messages"][-1]["role"] == "tool":
            return {
                "role": "assistant",
                "content": "NATIVE_CLARIFIED:" + body["messages"][-1]["content"],
            }
        return {
            "role": "assistant",
            "content": None,
            "tool_calls": [
                {
                    "id": "native-question",
                    "type": "function",
                    "function": {
                        "name": "clarify",
                        "arguments": json.dumps(
                            {
                                "questions": [
                                    {
                                        "question": "Which report format?",
                                        "choices": ["Markdown", "Plain text"],
                                    }
                                ]
                            }
                        ),
                    },
                }
            ],
        }

    provider.goal_script = respond

    def pending():
        end = time.monotonic() + 15
        while time.monotonic() < end:
            result = call(
                command("clarification.list", {"thread_id": thread["thread_id"]})
            )
            assert "result" in result, result
            if result["result"]["items"]:
                return result["result"]["items"][0]
            time.sleep(0.1)
        raise AssertionError("Native prompt was not projected")

    run = call(send(thread, "ASK_NATIVE"))["result"]
    prompt = pending()
    assert prompt["question"] == "Which report format?"
    assert prompt["choices"][0] == "Markdown (Recommended)"
    assert prompt["run_id"] == run["run_id"]
    body = command(
        "clarification.answer",
        {
            k: prompt[k]
            for k in (
                "thread_id",
                "native_session_id",
                "execution_generation",
                "prompt_id",
            )
        }
        | {"answer": "Plain text"},
    )
    forged = json.loads(json.dumps(body))
    forged["command_id"] = str(uuid4())
    forged["payload"]["thread_id"] = str(uuid4())
    assert call(forged)["error"]["code"] == "NOT_FOUND"
    with ThreadPoolExecutor(max_workers=2) as pool:
        replies = list(pool.map(lambda _: call(body), range(2)))
    assert all("result" in r for r in replies), replies
    assert replies[0] == replies[1]
    result = settle(call, run["run_id"])
    assert "Plain text" in result["text"]
    assert (
        call(command("clarification.list", {"thread_id": thread["thread_id"]}))[
            "result"
        ]["items"]
        == []
    )
    run = call(send(thread, "ASK_NATIVE_CANCEL"))["result"]
    prompt = pending()
    assert "result" in call(command("run.cancel", {"run_id": run["run_id"]}))
    stale = command(
        "clarification.answer",
        {
            k: prompt[k]
            for k in (
                "thread_id",
                "native_session_id",
                "execution_generation",
                "prompt_id",
            )
        }
        | {"answer": "Markdown"},
    )
    assert call(stale)["error"]["code"] == "STALE_GENERATION"
    provider.goal_script = None
