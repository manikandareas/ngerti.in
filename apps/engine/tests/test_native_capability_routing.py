"""Native registry extensions and inference routes through the real pinned gateway."""

# ruff: noqa: F811 - shared real gateway fixture

import json
import sqlite3
from uuid import uuid4

import pytest
from ngertiin_engine.contracts import EngineError
from ngertiin_engine.inference_config import validate
from ngertiin_engine.plugins import fingerprint, install
from test_capabilities import capability_agent, capability_submit
from test_connections import Provider, connect, providers  # noqa: F401
from test_direct_messages import send
from test_runtime import Model, command, runtime, settle  # noqa: F401


def configure(call, model, handle, inference):
    response = call(
        command(
            "agent.create",
            {
                "display_name": handle,
                "handle": handle,
                "config": {
                    "soul": "",
                    "instructions": "",
                    "model": model,
                    "tool_grants": ["tasks"],
                    "inference": inference,
                },
            },
        )
    )
    assert "result" in response, response
    return response["result"]["agent"]


def dm(call, agent):
    return call(
        command(
            "thread.create",
            {"kind": "dm", "title": "Native routing", "agent_ids": [agent["agent_id"]]},
        )
    )["result"]["thread"]


def test_parameters_validation_scope_and_native_snapshot(runtime, providers):
    root, _, call, start, *_ = runtime
    (root / "capabilities.json").write_text(
        json.dumps({"tool_grants": {"tasks": {"enabled": True, "toolset": "todo"}}})
    )
    connection, _ = connect(call, providers[0], "Advanced primary")
    selected = connection + ":test-model"
    settings = {
        "version": 1,
        "parameters": {
            "temperature": 0.37,
            "top_p": 0.89,
            "seed": 17,
            "max_tokens": 192,
            "service_tier": "default",
        },
    }
    agent = configure(call, selected, "native-parameters", settings)
    providers[0].usage_script = lambda body: {
        "prompt_tokens": 100,
        "completion_tokens": 5,
        "total_tokens": 105,
        "prompt_tokens_details": {"cached_tokens": 80},
    }
    thread = dm(call, agent)
    run = call(send(thread, "USE_TOOL"))["result"]["run_id"]
    assert settle(call, run)["status"] == "succeeded"
    assert len(providers[0].requests) >= 2
    for request in providers[0].requests:
        assert all(request[k] == v for k, v in settings["parameters"].items())
    before = call(command("agent.list", {"after": None, "limit": 100}))["result"]
    saved = next(a for a in before["items"] if a["agent_id"] == agent["agent_id"])
    assert saved["config"]["inference"] == settings
    assert "runtime_inference" not in saved["config"]
    diagnostic = call(command("run.diagnostics", {"run_id": run}))["result"]
    assert diagnostic["usage"]["cache_read_tokens"] == 160
    start.current.kill()
    start.current.wait(timeout=10)
    start()
    run = call(send(thread, "AFTER_ADVANCED_RESTART"))["result"]["run_id"]
    assert settle(call, run)["status"] == "succeeded"
    providers[0].release.clear()
    providers[0].blocked.clear()
    old_run = call(send(thread, "BLOCK_STARTED"))["result"]["run_id"]
    assert providers[0].blocked.wait(10)
    edit = command(
        "agent.configure",
        {
            "agent_id": agent["agent_id"],
            "display_name": agent["display_name"],
            "handle": agent["handle"],
            "config": {
                **agent["config"],
                "inference": {
                    **settings,
                    "parameters": {**settings["parameters"], "temperature": 0.73},
                },
            },
        },
    )
    edit["expected_revision"] = agent["revision"]
    assert "result" in call(edit)
    providers[0].release.set()
    settle(call, old_run)
    assert providers[0].requests[-1]["temperature"] == 0.37
    new_run = call(send(thread, "NEW_CONFIGURATION"))["result"]["run_id"]
    settle(call, new_run)
    assert providers[0].requests[-1]["temperature"] == 0.73
    denied = call(
        command(
            "agent.create",
            {
                "display_name": "Invalid advanced",
                "handle": "bad-native-parameters",
                "config": {
                    "soul": "",
                    "instructions": "",
                    "model": selected,
                    "inference": {"parameters": {"unsupported": True}},
                },
            },
        )
    )
    assert denied["error"]["code"] == "INVALID_INFERENCE_CONFIGURATION", denied


def test_native_fallback_recovers_without_replaying_tool(runtime, providers):
    root, _, call, _, *_ = runtime
    (root / "capabilities.json").write_text(
        json.dumps({"tool_grants": {"tasks": {"enabled": True, "toolset": "todo"}}})
    )
    primary, _ = connect(call, providers[0], "Outage primary")
    fallback, _ = connect(call, providers[1], "Healthy fallback")
    agent = configure(
        call,
        primary + ":test-model",
        "native-fallback",
        {"fallback_models": [fallback + ":test-model"]},
    )
    providers[0].status = 503
    thread = dm(call, agent)
    run = call(send(thread, "USE_TOOL"))["result"]["run_id"]
    result = settle(call, run)
    assert result["status"] == "succeeded", result
    assert providers[0].auth and len(providers[1].requests) >= 2
    assert (
        len([m for m in providers[1].requests[-1]["messages"] if m["role"] == "tool"])
        == 1
    )


def test_native_moa_uses_one_acting_agent(runtime, providers):
    root, _, call, _, *_ = runtime
    (root / "capabilities.json").write_text(
        json.dumps({"tool_grants": {"tasks": {"enabled": True, "toolset": "todo"}}})
    )
    aggregator, _ = connect(call, providers[0], "MoA aggregator")
    reference, _ = connect(call, providers[1], "MoA reference")
    agent = configure(
        call,
        aggregator + ":test-model",
        "native-moa",
        {
            "moa": {
                "references": [reference + ":test-model"],
                "fanout": "user_turn",
                "reference_timeout": 10,
            }
        },
    )
    thread = dm(call, agent)
    run = call(send(thread, "MOA_NATIVE_PROOF"))["result"]["run_id"]
    assert settle(call, run)["status"] == "succeeded"
    assert providers[0].requests and providers[1].requests
    assert not providers[1].requests[0].get("tools")


def test_native_pool_rotates_scoped_relay_references_and_survives_restart(
    runtime, providers
):
    root, _, call, start, *_ = runtime
    (root / "capabilities.json").write_text(
        json.dumps({"tool_grants": {"tasks": {"enabled": True, "toolset": "todo"}}})
    )
    server = providers[0]
    first_key = server.key
    first, _ = connect(call, server, "Pool first")
    server.key = "pool-second-" + uuid4().hex
    second_key = server.key
    second, _ = connect(call, server, "Pool second")
    server.key = first_key

    class RotatingProvider(Provider):
        def do_POST(self):
            self.server.auth.append(self.headers.get("Authorization"))
            if self.headers.get("Authorization") == "Bearer " + first_key:
                self.rfile.read(int(self.headers["Content-Length"]))
                payload = b'{"error":{"code":"rate_limit_exceeded"}}'
                self.send_response(429)
                self.send_header("Content-Length", str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)
            else:
                Model.do_POST(self)

    server.RequestHandlerClass = RotatingProvider
    agent = configure(
        call,
        first + ":test-model",
        "native-pool",
        {
            "credential_pool": {
                "models": [second + ":test-model"],
                "strategy": "fill_first",
            }
        },
    )
    thread = dm(call, agent)
    run = call(send(thread, "USE_TOOL"))["result"]["run_id"]
    assert settle(call, run)["status"] == "succeeded"
    assert (
        "Bearer " + first_key in server.auth and "Bearer " + second_key in server.auth
    )
    assert len([m for m in server.requests[-1]["messages"] if m["role"] == "tool"]) == 1
    start.current.kill()
    start.current.wait(timeout=10)
    start()
    run = call(send(thread, "POOL_AFTER_RESTART"))["result"]["run_id"]
    assert settle(call, run)["status"] == "succeeded"
    assert server.auth[-1] == "Bearer " + second_key
    statuses = list((root / "state").glob("inference-pool-*.json"))
    assert statuses
    for path in statuses:
        assert first_key not in path.read_text() and second_key not in path.read_text()


def test_plugin_native_deferred_dispatch_dependencies_and_nested_deny(
    runtime, tmp_path, providers
):
    root, _, call, start, *_ = runtime
    start.current.kill()
    start.current.wait(timeout=10)
    (root / "state" / "nma.sock").unlink(missing_ok=True)
    plugin = tmp_path / "plugin"
    plugin.mkdir()
    (plugin / "plugin.yaml").write_text(
        'name: nma-proof\nversion: "1.0.0"\nlicense: MIT\ndescription: Native scoped proof\n'
    )
    (plugin / "__init__.py").write_text("""import json
def register(ctx):
    def handle(args, **kwargs):
        from tools.registry import registry
        denied = json.loads(registry.dispatch("terminal", {"command": "false"}))
        return json.dumps({"proof": "NATIVE_PLUGIN_PROOF", "nested": denied})
    ctx.register_tool(name="native_proof", toolset="nma_proof", schema={"name":"native_proof", "description":"Native proof", "parameters":{"type":"object", "properties":{}}}, handler=handle)
    def review(args, **kwargs):
        from agent.auxiliary_client import call_llm, extract_content_or_reasoning
        response = call_llm(task="review", messages=[{"role":"user","content":"NATIVE_REVIEW_ROUTE"}])
        return json.dumps({"review": extract_content_or_reasoning(response)})
    ctx.register_tool(name="native_review", toolset="nma_proof", schema={"name":"native_review", "description":"Review through a scoped auxiliary route", "parameters":{"type":"object", "properties":{}}}, handler=review)
    def event(**kwargs):
        import os
        from pathlib import Path
        with (Path(os.environ["HERMES_HOME"]) / "plugin-hook.jsonl").open("a") as stream:
            stream.write("scoped_hook\\n")
    ctx.register_hook("post_tool_call", event)
""")
    pin = install(plugin, fingerprint(plugin), root / "state")
    config_path = root / "state" / "config.yaml"
    config = json.loads(config_path.read_text())
    config["plugins"] = {"enabled": ["nma-proof"]}
    config_path.write_text(json.dumps(config))
    catalog = {
        "version": 2,
        "execution_surfaces": {
            "reviewed-proof": {"ready": True, "kind": "trusted_plugin"}
        },
        "tool_grants": {
            "tasks": {"enabled": True, "toolset": "todo"},
            "proof": {
                "enabled": True,
                "toolset": "nma_proof",
                "execution_surface": "reviewed-proof",
                "requires": ["tasks"],
                "plugin": pin,
            },
        },
    }
    (root / "capabilities.json").write_text(json.dumps(catalog))
    start()
    bad = call(
        command(
            "agent.create",
            {
                "display_name": "Missing dependency",
                "handle": "missing-native-dependency",
                "config": {
                    "soul": "",
                    "instructions": "",
                    "model": "test",
                    "tool_grants": ["proof"],
                },
            },
        )
    )
    assert bad["error"]["code"] == "CAPABILITY_DEPENDENCY_REQUIRED", bad
    agent = capability_agent(call, "native-plugin", tool_grants=["tasks", "proof"])
    run = capability_submit(call, agent, "CALL_TOOL:native_proof")
    assert settle(call, run)["status"] == "succeeded"
    with sqlite3.connect(root / "state" / "state.db") as conn:
        results = conn.execute(
            "SELECT receipt FROM nma_effects WHERE run_id=?", (run,)
        ).fetchall()
    assert "NATIVE_PLUGIN_PROOF" in str(results)
    assert "CAPABILITY_DENIED" in str(results)
    hooks = root / "state" / "plugin-hook.jsonl"
    assert hooks.exists()
    hook_count = len(hooks.read_text().splitlines())
    other = capability_agent(call, "plugin-without-grant")
    settle(call, capability_submit(call, other, "CALL_TOOL:native_proof"))
    assert len(hooks.read_text().splitlines()) == hook_count
    primary, _ = connect(call, providers[0], "Auxiliary primary")
    auxiliary, _ = connect(call, providers[1], "Auxiliary unavailable")
    providers[1].status = 503
    reply = call(
        command(
            "agent.create",
            {
                "display_name": "Scoped review",
                "handle": "scoped-native-review",
                "config": {
                    "soul": "",
                    "instructions": "",
                    "model": primary + ":test-model",
                    "tool_grants": ["tasks", "proof"],
                    "inference": {
                        "auxiliary": {
                            "review": {
                                "model": auxiliary + ":test-model",
                                "fallback_models": [primary + ":test-model"],
                            }
                        }
                    },
                },
            },
        )
    )
    assert "result" in reply, reply
    reviewer = reply["result"]["agent"]
    reviewed = capability_submit(call, reviewer, "CALL_TOOL:native_review")
    settle(call, reviewed)
    with sqlite3.connect(root / "state" / "state.db") as conn:
        reviews = conn.execute(
            "SELECT receipt FROM nma_effects WHERE run_id=?", (reviewed,)
        ).fetchall()
    assert "RECOVERY_ACK_NATIVE_REVIEW_ROUTE" in str(reviews), reviews
    assert providers[1].auth
    with pytest.raises(EngineError, match="PLUGIN_UPDATE_REQUIRES_DRAINED_GATEWAY"):
        install(plugin, fingerprint(plugin), root / "state")
    # Disabling the live catalog is a new-effect fence, including nested dispatch.
    catalog["tool_grants"]["proof"]["enabled"] = False
    (root / "capabilities.json").write_text(json.dumps(catalog))
    denied = call(
        command(
            "runtime.submit",
            {
                "agent_id": agent["agent_id"],
                "thread_id": str(uuid4()),
                "config_revision": agent["config_revision"],
                "context_generation": "1",
                "text": "CALL_TOOL:native_proof",
            },
        )
    )
    assert "error" in denied


@pytest.mark.parametrize(
    "value",
    [
        {"parameters": {"temperature": float("nan")}},
        {"fallback_models": ["other-owner:model"]},
        {"parameters": {"api_key": "private"}},
        {"credential_pool": {"models": [], "strategy": "unknown"}},
        {"moa": {"references": [], "fanout": "user_turn"}},
    ],
)
def test_invalid_inference_is_repairable(value):
    snapshot = {
        "model": "test-model",
        "protocol": "chat_completions",
        "connection_id": "owner-connection",
        "provider_id": "custom",
    }
    with pytest.raises(EngineError):
        validate(value, {"selected": snapshot}, "selected")


@pytest.mark.parametrize("limit", ["2048", None, True, {}, []])
def test_thinking_invalid_output_limit_is_repairable_in_either_field_order(limit):
    snapshot = {
        "model": "test-model",
        "protocol": "anthropic_messages",
        "connection_id": "owner-connection",
        "provider_id": "custom",
    }
    fields = [
        ("thinking", {"type": "enabled", "budget_tokens": 1024}),
        ("max_tokens", limit),
    ]
    for ordered in (fields, list(reversed(fields))):
        with pytest.raises(EngineError) as error:
            validate({"parameters": dict(ordered)}, {"selected": snapshot}, "selected")
        assert error.value.code == "INVALID_INFERENCE_CONFIGURATION"
        assert error.value.details["field"] in {"thinking", "max_tokens"}
        assert error.value.details["reason"]
