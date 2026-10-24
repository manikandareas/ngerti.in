"""Delivery and diagnostic acceptance over real gateway admission and restart."""

# ruff: noqa: F811
import json

from ngertiin_engine.diagnostics import usage
from test_direct_messages import dm, send, snapshot
from test_goal_lifecycle import begin, continuation_script, eventually
from test_goals import act
from test_runtime import command, runtime, settle  # noqa: F401


def test_quiet_background_keeps_progress_and_deduplicates_delivery(runtime):
    _, provider, call, start, *_ = runtime
    thread = dm(call, "delivery-quiet")
    goal = begin(call, thread)
    continuation_script(provider, goal["goal_id"])
    original = provider.goal_script

    def silent(body, text):
        response = original(body, text)
        if response and response.get("content"):
            response["content"] = "[SILENT]"
        return response

    provider.goal_script = silent
    try:
        act(
            call,
            thread,
            action="continue",
            goal_id=goal["goal_id"],
            expected_revision=goal["revision"],
            summary="Check quietly",
        )
        final = eventually(
            lambda: snapshot(call, thread),
            lambda s: (
                s["goals"][0]["status"] == "waiting"
                and all(u["settled"] for u in s["goals"][0]["units"])
            ),
        )
        child = final["goals"][0]["units"][-1]["run_id"]
        diagnosis = call(command("run.diagnostics", {"run_id": child}))["result"]
        assert diagnosis["run"]["status"] == "succeeded"
        assert diagnosis["run"]["text"] == ""
        assert diagnosis["goal_ids"] == [goal["goal_id"]]
        assert diagnosis["parent_run_ids"]
        assert diagnosis["message_ids"] == []
        assert [
            e["payload"]["status"]
            for e in diagnosis["recent_events"]
            if e["type"] == "delivery.settled"
        ] == ["quiet"]
        assert not any(e["type"] == "message.delta" for e in diagnosis["recent_events"])
        assert "[SILENT]" not in json.dumps(final["messages"])
        start.current.kill()
        start.current.wait(timeout=10)
        start()
        assert (
            call(command("run.diagnostics", {"run_id": child}))["result"] == diagnosis
        )
        assert snapshot(call, thread)["messages"] == final["messages"]
    finally:
        provider.goal_script = None


def test_user_reply_and_diagnostic_scope(runtime):
    _, _provider, call, *_ = runtime
    thread = dm(call, "delivery-normal")
    receipt = call(send(thread, "DELIVERY_RESULT"))["result"]
    settle(call, receipt["run_id"])
    value = call(command("run.diagnostics", {"run_id": receipt["run_id"]}))["result"]
    assert value["run"]["thread_id"] == thread["thread_id"]
    assert len(value["message_ids"]) == 2
    assert value["usage"]["source"] == "native_terminal_receipt"
    assert (
        len([e for e in value["recent_events"] if e["type"] == "delivery.settled"]) == 1
    )
    assert (
        call(
            command(
                "run.diagnostics", {"run_id": "00000000-0000-4000-8000-000000000000"}
            )
        )["error"]["code"]
        == "NOT_FOUND"
    )


def test_usage_uses_native_turn_delta_not_session_total():
    assert (
        usage(
            {
                "usage": {"input_tokens": 7, "output_tokens": 3, "total_tokens": 10},
                "result": {"input_tokens": 700, "output_tokens": 300},
            }
        )["total_tokens"]
        == 10
    )
    assert usage({"result": {"input_tokens": 700}})["available"] is False
    assert "native_estimated_cost_usd" not in usage(
        {"result": {"estimated_cost_usd": float("nan")}}
    )


def test_cost_receipt_is_turn_delta_and_preserves_native_source(monkeypatch):
    from types import SimpleNamespace

    from gateway.run_turn_runner import TurnRunner
    from gateway.session_results import execution_result
    from ngertiin_engine.diagnostics import install_usage

    def native(_turn, agent):
        agent.session_estimated_cost_usd += 0.25
        execution_result.get()["usage"] = {"input_tokens": 10, "output_tokens": 5}
        return {"final_response": "done"}

    monkeypatch.setattr(TurnRunner, "_run_conversation_with_approval", native)
    install_usage()
    agent = SimpleNamespace(
        session_estimated_cost_usd=1.0,
        session_cost_status="estimated",
        session_cost_source="provider",
    )
    captured = {}
    token = execution_result.set(captured)
    try:
        TurnRunner._run_conversation_with_approval(None, agent)
        assert usage(captured)["native_estimated_cost_usd"] == 0.25
        assert usage(captured)["cost_source"] == "provider"
        agent.session_cost_status = "unknown"
        TurnRunner._run_conversation_with_approval(None, agent)
        assert "native_estimated_cost_usd" not in usage(captured)
    finally:
        execution_result.reset(token)
