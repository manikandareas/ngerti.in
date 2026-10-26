"""Provider-request and native-receipt oracles through the real pinned gateway."""

# ruff: noqa: F811 - shared real-runtime fixture

import json
import sqlite3
import threading
from concurrent.futures import ThreadPoolExecutor

import pytest
from test_capabilities import capability_agent
from test_direct_messages import send
from test_runtime import OWNER, command, runtime, settle  # noqa: F401


def setup(runtime, handle, session=None):
    root, _, call, *_ = runtime
    (root / "capabilities.json").write_text(
        json.dumps({"tool_grants": {"todo": {"enabled": True, "toolset": "todo"}}})
    )
    agent = capability_agent(call, handle, tool_grants=["todo"])
    if session is not None:
        body = command(
            "agent.configure",
            {
                "agent_id": agent["agent_id"],
                "display_name": agent["display_name"],
                "handle": agent["handle"],
                "config": {**agent["config"], "session": session},
            },
        )
        body["expected_revision"] = agent["revision"]
        agent = call(body)["result"]["agent"]
    thread = call(
        command(
            "thread.create",
            {"kind": "dm", "title": handle, "agent_ids": [agent["agent_id"]]},
        )
    )["result"]["thread"]
    return agent, thread


def long_script(body, text):
    messages = body.get("messages", [])
    if "NMA029_LONG" not in text:
        return None
    last_user = max(i for i, m in enumerate(messages) if m["role"] == "user")
    steps = sum(m["role"] == "tool" for m in messages[last_user:])
    if steps >= 12:
        return {"role": "assistant", "content": "TWELVE_STEPS_COMPLETE"}
    return {
        "role": "assistant",
        "content": None,
        "tool_calls": [
            {
                "id": f"lineage-{steps}",
                "type": "function",
                "function": {
                    "name": "tool_call",
                    "arguments": json.dumps(
                        {
                            "calls": [
                                {
                                    "name": "todo_list",
                                    "arguments": {
                                        "todos": [
                                            {
                                                "id": str(steps),
                                                "content": f"NATIVE_TOOL_LINEAGE_{steps}",
                                                "status": "completed",
                                            }
                                        ]
                                    },
                                }
                            ]
                        }
                    ),
                },
            }
        ],
    }


def inspect(call, agent, thread):
    reply = call(
        command(
            "session.inspect",
            {"agent_id": agent["agent_id"], "thread_id": thread["thread_id"]},
        )
    )
    assert "result" in reply, reply
    return reply["result"]


def test_native_tool_history_survives_restart_and_config_change(runtime):
    root, provider, call, start, *_ = runtime
    agent, thread = setup(runtime, "native-fidelity")
    provider.goal_script = long_script
    try:
        receipt = call(send(thread, "NMA029_LONG"))["result"]
        state = settle(call, receipt["run_id"])
        assert "TWELVE_STEPS_COMPLETE" in state["text"]
        assert state["continuation_required"] is False
        prior = inspect(call, agent, thread)
        with sqlite3.connect(root / "state/state.db") as db:
            assert (
                db.execute(
                    "SELECT count(*) FROM messages WHERE role='tool'"
                ).fetchone()[0]
                == 12
            )
        start.current.kill()
        start.current.wait(timeout=10)
        start()
        before = len(provider.requests)
        second = call(send(thread, "NATIVE_FOLLOWUP"))["result"]
        settle(call, second["run_id"])
        history = provider.requests[before]["messages"]
        assert sum(m.get("content") == "NMA029_LONG" for m in history) == 1
        assert sum(m["role"] == "tool" for m in history) == 12
        assert (
            inspect(call, agent, thread)["native_session_id"]
            == prior["native_session_id"]
        )
        body = command(
            "agent.configure",
            {
                "agent_id": agent["agent_id"],
                "display_name": agent["display_name"],
                "handle": agent["handle"],
                "config": {**agent["config"], "instructions": "NEW_CONFIGURATION"},
            },
        )
        body["expected_revision"] = agent["revision"]
        agent = call(body)["result"]["agent"]
        before = len(provider.requests)
        third = call(send(thread, "CHANGED_CONFIG_FOLLOWUP"))["result"]
        settle(call, third["run_id"])
        current = inspect(call, agent, thread)
        assert current["logical_session_id"] == prior["logical_session_id"]
        assert current["native_session_id"] != prior["native_session_id"]
        assert current["parent_binding_id"]
        assert (
            sum(m["role"] == "tool" for m in provider.requests[before]["messages"])
            == 12
        )
        assert "NEW_CONFIGURATION" in json.dumps(provider.requests[before])
    finally:
        provider.goal_script = None


def test_finite_budget_is_visible_and_reset_preserves_product_identity(runtime):
    _, provider, call, start, *_ = runtime
    agent, thread = setup(runtime, "finite-fidelity", {"max_turns": 3})
    provider.goal_script = long_script
    try:
        first = call(send(thread, "NMA029_LONG"))["result"]
        state = settle(call, first["run_id"])
        assert state["continuation_required"] is True
        assert state["turn_exit_reason"].startswith("max_iterations_reached")
    finally:
        provider.goal_script = None
    current = inspect(call, agent, thread)
    reset = command(
        "session.reset",
        {
            "agent_id": agent["agent_id"],
            "thread_id": thread["thread_id"],
            "native_session_id": current["native_session_id"],
            "execution_generation": current["execution_generation"],
        },
    )
    reset["expected_revision"] = current["session_revision"]
    result = call(reset)
    assert "result" in result, result
    assert (
        result["result"]["session"]["logical_session_id"]
        == current["logical_session_id"]
    )
    assert result["result"]["session"]["native_tip"] != current["native_tip"]
    events = call(
        command(
            "thread.events",
            {
                "thread_id": thread["thread_id"],
                "replay_epoch": None,
                "last_sequence": "0",
            },
        )
    )["result"]["events"]
    intent = next(
        event for event in events if event["type"] == "context.change_requested"
    )
    assert int(intent["sequence"]) > 0
    start.current.kill()
    start.current.wait(timeout=10)
    start()
    assert call(reset) == result
    before = len(provider.requests)
    second = call(send(thread, "AFTER_RESET"))["result"]
    settle(call, second["run_id"])
    assert "NMA029_LONG" not in json.dumps(provider.requests[before:])


def test_manual_compression_keeps_native_lineage_after_restart(runtime):
    _root, provider, call, start, *_ = runtime
    agent, thread = setup(runtime, "compression-fidelity")
    for index in range(26):
        receipt = call(
            send(thread, f"COMPRESSION_FACT_{index}: scoped conversation data")
        )["result"]
        settle(call, receipt["run_id"])
    current = inspect(call, agent, thread)

    summarizing, release_summary = threading.Event(), threading.Event()

    def summary(body, text):
        summarizing.set()
        assert release_summary.wait(15)
        return {
            "role": "assistant",
            "content": "## Goal\nRetain COMPRESSION_FACT_0 and the scoped task.\n## Completed Actions\nRead previous conversation.\n## Active State\nReady for followup.\n## Critical Context\nCOMPRESSION_FACT_0 is the original fact.",
        }

    provider.goal_script = summary
    compress = command(
        "session.compress",
        {
            "agent_id": agent["agent_id"],
            "thread_id": thread["thread_id"],
            "native_session_id": current["native_session_id"],
            "execution_generation": current["execution_generation"],
        },
    )
    compress["expected_revision"] = current["session_revision"]
    try:
        with ThreadPoolExecutor(max_workers=1) as pool:
            future = pool.submit(call, compress)
            try:
                assert summarizing.wait(10)
                # This control/read would block behind the summary if a product
                # lock spanned native mutation. Native session gates own that wait.
                assert "result" in call(command("runtime.describe"))
            finally:
                release_summary.set()
            result = future.result(timeout=20)
        assert "result" in result, result
    finally:
        release_summary.set()
        provider.goal_script = None
    after = inspect(call, agent, thread)
    assert after["logical_session_id"] == current["logical_session_id"]
    assert after["native_session_id"] == current["native_session_id"]
    assert result["result"]["native_mutation"]["summary"]["noop"] is False
    assert result["result"]["native_mutation"]["message_count"] < 52
    start.current.kill()
    start.current.wait(timeout=10)
    start()
    assert call(compress) == result
    before = len(provider.requests)
    next_run = call(send(thread, "FOLLOW_COMPRESSED_CONTEXT"))["result"]
    settle(call, next_run["run_id"])
    model_input = json.dumps(provider.requests[before:])
    assert "COMPRESSION_FACT_0" in model_input
    assert "## Goal" in model_input


def test_short_compression_noop_finishes_durably(runtime):
    _, _, call, start, *_ = runtime
    agent, thread = setup(runtime, "short-compression")
    settle(call, call(send(thread, "A short conversation"))["result"]["run_id"])
    current = inspect(call, agent, thread)
    body = command(
        "session.compress",
        {
            "agent_id": agent["agent_id"],
            "thread_id": thread["thread_id"],
            "native_session_id": current["native_session_id"],
            "execution_generation": current["execution_generation"],
        },
    )
    body["expected_revision"] = current["session_revision"]
    result = call(body)
    assert "result" in result, result
    assert result["result"]["native_mutation"]["status"] == "noop"
    assert result["result"]["native_mutation"]["summary"]["noop"] is True
    assert result["result"]["session"]["native_tip"] == current["native_tip"]
    assert call(body) == result
    start.current.kill()
    start.current.wait(timeout=10)
    start()
    assert call(body) == result


def test_host_context_references_are_refused_before_model_input(runtime):
    root, provider, call, *_ = runtime
    _, thread = setup(runtime, "reference-fidelity")
    canary = root / "workspace" / "sensitive.txt"
    canary.write_text("HOST_CONTEXT_CANARY")
    before = len(provider.requests)
    for text in (
        "Read @file:" + str(canary),
        "Read @file:../key",
        "Read @folder:private",
    ):
        run = call(send(thread, text))["result"]
        settle(call, run["run_id"])
    assert "HOST_CONTEXT_CANARY" not in json.dumps(provider.requests[before:])
    assert len(provider.requests) == before


def test_schema_fourteen_preserves_receipts_and_inventories_old_unknowns(runtime):
    root, _, call, start, *_ = runtime
    agent, thread = setup(runtime, "migration-fidelity")
    run = call(send(thread, "MIGRATION_PRESERVED_MESSAGE"))["result"]
    settle(call, run["run_id"])
    call(command("thread.snapshot", {"thread_id": thread["thread_id"]}))
    before = inspect(call, agent, thread)
    start.current.kill()
    start.current.wait(timeout=10)
    raw = json.dumps({"value": json.dumps({"error": "INDETERMINATE"})})
    with sqlite3.connect(root / "state/state.db") as db:
        bindings = db.execute(
            "SELECT * FROM nma_adapter_bindings ORDER BY binding_id"
        ).fetchall()
        messages = db.execute(
            "SELECT * FROM nma_messages ORDER BY message_id"
        ).fetchall()
        migrations = db.execute(
            "SELECT version,checksum FROM nma_schema_migrations WHERE version<15 ORDER BY version"
        ).fetchall()
        db.execute(
            "INSERT INTO nma_effects VALUES (?,?,?,'historical-intent','confirmed',?)",
            (OWNER, run["run_id"], "old-unknown", raw),
        )
        for table in (
            "nma_goal_unit_outcomes",
            "nma_effect_outcomes",
            "nma_session_lineage",
        ):
            db.execute(f"DROP TABLE {table}")
        db.execute("DELETE FROM nma_schema_migrations WHERE version=15")
        db.execute("UPDATE nma_partition SET schema_version=14")
    start()
    after = inspect(call, agent, thread)
    assert after["logical_session_id"] == before["logical_session_id"]
    assert after["native_session_id"] == before["native_session_id"]
    with sqlite3.connect(root / "state/state.db") as db:
        assert (
            db.execute(
                "SELECT * FROM nma_adapter_bindings ORDER BY binding_id"
            ).fetchall()
            == bindings
        )
        assert (
            db.execute("SELECT * FROM nma_messages ORDER BY message_id").fetchall()
            == messages
        )
        assert (
            db.execute(
                "SELECT version,checksum FROM nma_schema_migrations WHERE version<15 ORDER BY version"
            ).fetchall()
            == migrations
        )
        assert db.execute(
            "SELECT status,receipt FROM nma_effects WHERE operation_id='old-unknown'"
        ).fetchone() == ("dispatching", raw)
        assert (
            db.execute(
                "SELECT phase FROM nma_effect_outcomes WHERE operation_id='old-unknown'"
            ).fetchone()[0]
            == "unknown"
        )
        assert not db.execute("PRAGMA foreign_key_check").fetchall()
    inventory = call(command("computer.reconcile", {"thread_id": thread["thread_id"]}))[
        "result"
    ]
    assert inventory["reconciled"] == 0 and inventory["unresolved"] == 1


def context_command(kind, current, agent, thread):
    body = command(
        kind,
        {
            "agent_id": agent["agent_id"],
            "thread_id": thread["thread_id"],
            "native_session_id": current["native_session_id"],
            "execution_generation": current["execution_generation"],
        },
    )
    body["expected_revision"] = current["session_revision"]
    return body


def test_busy_control_is_a_durable_refusal_not_pending_startup_poison(runtime):
    root, provider, call, start, *_ = runtime
    agent, thread = setup(runtime, "busy-context")
    settle(call, call(send(thread, "BEFORE_BUSY"))["result"]["run_id"])
    provider.release.clear()
    provider.blocked.clear()
    run = call(send(thread, "BLOCK_STARTED"))["result"]
    assert provider.blocked.wait(10)
    body = context_command("session.reset", inspect(call, agent, thread), agent, thread)
    try:
        assert call(body)["error"]["code"] == "SESSION_BUSY"
        assert call(body)["error"]["code"] == "SESSION_BUSY"
        with sqlite3.connect(root / "state/state.db") as db:
            assert db.execute(
                "SELECT state FROM nma_runtime_outbox WHERE operation_id=?",
                (body["command_id"],),
            ).fetchone() == ("applied",)
    finally:
        provider.release.set()
    settle(call, run["run_id"])
    start.current.kill()
    start.current.wait(timeout=10)
    start()
    assert call(body)["error"]["code"] == "SESSION_BUSY"


def test_native_reset_receipt_recovers_lost_projection_without_second_reset(runtime):
    from test_reliability import kill_at, lost_call

    root, _, call, start, *_ = runtime
    agent, thread = setup(runtime, "reset-receipt-recovery")
    settle(call, call(send(thread, "BEFORE_RESET_CRASH"))["result"]["run_id"])
    current = inspect(call, agent, thread)
    body = context_command("session.reset", current, agent, thread)
    kill_at(root, start, "after_context_mutation")
    lost_call(call, body)
    start.current.wait(timeout=10)
    assert start.current.returncode == -9
    with sqlite3.connect(root / "state/state.db") as db:
        tips = db.execute("SELECT id FROM sessions ORDER BY rowid").fetchall()
    start()
    recovered = call(body)
    assert "result" in recovered, recovered
    assert recovered["result"]["session"]["native_tip"] != current["native_tip"]
    assert call(body) == recovered
    with sqlite3.connect(root / "state/state.db") as db:
        assert db.execute("SELECT id FROM sessions ORDER BY rowid").fetchall() == tips
    after = inspect(call, agent, thread)
    assert after["logical_session_id"] == current["logical_session_id"]
    assert after["native_tip"] == recovered["result"]["session"]["native_tip"]


@pytest.mark.parametrize(
    "compression",
    [{"threshold_tokens": 24000}, {"micro_compact": True, "threshold_tokens": 240000}],
)
def test_native_automatic_and_micro_compaction_are_connected(runtime, compression):
    root, provider, call, start, *_ = runtime
    agent, thread = setup(
        runtime,
        "compaction-" + ("micro" if compression.get("micro_compact") else "automatic"),
        {"compression": compression},
    )
    with sqlite3.connect(root / "state/state.db") as db:
        before = db.execute(
            "SELECT count(*) FROM messages WHERE _compressed_summary=1"
        ).fetchone()[0]
    provider.goal_script = lambda body, text: {
        "role": "assistant",
        "content": ("completed scoped work " * 600)
        if text.startswith("COMPACTION_INPUT_")
        else "## Goal\nCOMPACTION_FIDELITY\n## Completed Actions\nRead scoped data.\n## Active State\nReady for followup.\n## Critical Context\nKeep COMPACTION_INPUT_0.",
    }
    provider.usage_script = lambda body: {
        "prompt_tokens": len(json.dumps(body.get("messages", []))) // 4,
        "completion_tokens": 40,
        "total_tokens": len(json.dumps(body.get("messages", []))) // 4 + 40,
    }
    try:
        for index in range(16 if compression.get("micro_compact") else 30):
            run = call(
                send(
                    thread,
                    (
                        f"COMPACTION_INPUT_{index}: " + "synthetic context " * 240
                    ).rstrip(),
                )
            )["result"]
            settle(call, run["run_id"])
        with sqlite3.connect(root / "state/state.db") as db:
            assert (
                db.execute(
                    "SELECT count(*) FROM messages WHERE _compressed_summary=1"
                ).fetchone()[0]
                > before
            )
        session = inspect(call, agent, thread)
        start.current.kill()
        start.current.wait(timeout=10)
        start()
        assert (
            inspect(call, agent, thread)["logical_session_id"]
            == session["logical_session_id"]
        )
        after = call(send(thread, "FOLLOW_AUTOMATIC_COMPACTION"))["result"]
        settle(call, after["run_id"])
    finally:
        provider.goal_script = None
        provider.usage_script = None


@pytest.mark.parametrize(
    "value",
    [
        {"max_turns": True},
        {"max_turns": -1},
        {"compression": {"threshold": 2}},
        {"context_engine": "../../host"},
    ],
)
def test_configuration_refuses_ambiguous_native_settings(value):
    from ngertiin_engine.contracts import EngineError
    from ngertiin_engine.session_settings import validate

    with pytest.raises(EngineError):
        validate(value)


@pytest.mark.parametrize(
    "value",
    [
        "@file:/etc/passwd",
        "@folder:../private",
        "@file:%2e%2e/key",
        "@file:C:\\secret",
        "@url:http://example.com",
        "@url:https://127.0.0.1",
        "@git:100",
    ],
)
def test_reference_cannot_select_host_or_private_destination(value):
    from ngertiin_engine.context_references import references
    from ngertiin_engine.contracts import EngineError

    with pytest.raises(EngineError):
        references(value)
