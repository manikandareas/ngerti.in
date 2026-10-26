"""Real-provider and authenticated-UI acceptance on disposable owner partitions."""

import argparse
import hashlib
import json
import os
import signal
import sys
import threading
import time
from pathlib import Path
from uuid import uuid4

import httpx

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "apps/engine/tests"))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--auth", type=Path, required=True)
    parser.add_argument("--routes", type=Path, required=True)
    parser.add_argument("--private", type=Path, required=True)
    parser.add_argument("--evidence", type=Path, required=True)
    args = parser.parse_args()
    args.private.mkdir(mode=0o700, parents=True, exist_ok=True)
    args.evidence.mkdir(parents=True, exist_ok=True)
    routes = json.loads(args.routes.read_text())
    auth = json.loads(args.auth.read_text())
    if not all(i.get("owner_id") and i.get("jwt") for i in auth["identities"]):
        raise ValueError("Both real Clerk sessions must be verified first")
    import test_runtime

    test_runtime.OWNER = auth["identities"][0]["owner_id"]
    environment = args.private / "bootstrap.env"
    environment.write_text(
        "".join(
            k + "=" + json.dumps(v) + "\n"
            for k, v in {
                "OPENAI_API_KEY": routes[0]["api_key"],
                "OPENAI_MODEL": routes[0]["model"],
                "OPENAI_BASE_URL": routes[0]["base_url"],
            }.items()
        )
    )
    environment.chmod(0o600)
    os.environ["NMA_TEST_LIVE_ENV"] = str(environment)
    os.environ["NMA_TEST_LIVE_PROTOCOL"] = routes[0]["protocol"]
    first = test_runtime.runtime.__wrapped__(None)
    state = next(first)
    root, _, call, start, *_ = state
    registry = json.loads(Path(auth["registry"]).read_text())
    registry[test_runtime.OWNER] = {
        "key_file": str(root / "key"),
        "socket": str(root / "state/nma.sock"),
    }
    Path(auth["registry"]).write_text(json.dumps(registry))
    from ngertiin_engine.plugins import fingerprint, install

    start.current.kill()
    start.current.wait(timeout=10)
    (root / "state/nma.sock").unlink(missing_ok=True)
    source = args.private / "review-plugin"
    source.mkdir()
    (source / "plugin.yaml").write_text(
        'name: routing-review\nversion: "1.0.0"\nlicense: MIT\ndescription: Native auxiliary review acceptance\n'
    )
    (source / "__init__.py").write_text("""import json
def register(ctx):
    def review(args, **kwargs):
        from agent.auxiliary_client import call_llm, extract_content_or_reasoning
        response = call_llm(task="review", messages=[{"role":"user","content":"Verify that 19 times 23 equals 437. Reply briefly."}])
        return json.dumps({"review": extract_content_or_reasoning(response)})
    ctx.register_tool(name="native_review", toolset="routing_review", schema={"name":"native_review", "description":"Verify 19 times 23 through the assigned auxiliary reviewer", "parameters":{"type":"object", "properties":{}}}, handler=review)
""")
    pin = install(source, fingerprint(source), root / "state")
    config_path = root / "state/config.yaml"
    config = json.loads(config_path.read_text())
    config["plugins"] = {"enabled": ["routing-review"]}
    config_path.write_text(json.dumps(config))
    catalog = {
        "version": 2,
        "execution_surfaces": {"reviewed": {"kind": "trusted_plugin", "ready": True}},
        "tool_grants": {
            "tasks": {"enabled": True, "label": "Task list", "toolset": "todo"},
            "review": {
                "enabled": True,
                "label": "Native review plugin",
                "toolset": "routing_review",
                "execution_surface": "reviewed",
                "plugin": pin,
            },
            "native_terminal": {
                "enabled": False,
                "label": "Native terminal (operator setup required)",
                "toolset": "terminal",
                "execution_surface": "linux_missing",
            },
        },
    }
    (root / "capabilities.json").write_text(json.dumps(catalog))
    start()
    command = test_runtime.command
    selections = []
    for route in routes:
        identity = str(uuid4())
        result = call(
            command(
                "connection.add_key",
                {
                    "connection_id": identity,
                    "provider": "custom",
                    "label": route["provider"] + " acceptance relay",
                    "api_key": route["api_key"],
                    "base_url": route["base_url"],
                    "protocol": route["protocol"],
                },
            )
        )
        assert "result" in result, result
        assert "result" in call(
            command("connection.models", {"connection_id": identity})
        )
        selections.append(identity + ":" + route["model"])

    def agent(handle, model, inference, grants):
        result = call(
            command(
                "agent.create",
                {
                    "display_name": handle,
                    "handle": handle,
                    "config": {
                        "soul": "Work carefully and report verified results.",
                        "instructions": "Do not create a goal for these disposable acceptance checks. Use only the explicitly requested tools.",
                        "model": model,
                        "tool_grants": grants,
                        "inference": inference,
                    },
                },
            )
        )
        assert "result" in result, result
        return result["result"]["agent"]

    primary = agent(
        "routing-luna",
        selections[0],
        {
            "version": 1,
            "parameters": {"reasoning": {"effort": "low"}, "max_output_tokens": 2048},
            "auxiliary": {"review": {"model": selections[1]}},
        },
        ["tasks", "review"],
    )
    secondary = agent("routing-router", selections[1], {"version": 1}, ["tasks"])
    mixture = agent(
        "routing-mixture",
        selections[0],
        {
            "version": 1,
            "moa": {
                "references": [selections[1]],
                "fanout": "user_turn",
                "reference_timeout": 120,
            },
        },
        ["tasks"],
    )
    metadata = {
        "root": str(root),
        "owner_id": test_runtime.OWNER,
        "agents": [primary, secondary, mixture],
        "models": selections,
        "authentication": "Actual ClerkJS JWT and production current_account",
        "base": auth["base"],
    }
    (args.private / "ui.json").write_text(json.dumps(metadata))
    results = []
    stopped = threading.Event()
    signal.signal(signal.SIGTERM, lambda *_: stopped.set())
    signal.signal(signal.SIGINT, lambda *_: stopped.set())

    def public(body):
        current = json.loads(args.auth.read_text())
        token = current["identities"][0]["jwt"]
        with httpx.Client(timeout=30, trust_env=False) as client:
            response = client.post(
                current["base"] + "/api/agent-engine/v1/commands",
                json=body,
                headers={"Authorization": "Bearer " + token},
            )
            response.raise_for_status()
            return response.json()

    def attempt(case, repeat, selected, text, require_tool):
        from test_direct_messages import send

        thread = call(
            command("thread.read", {"thread_id": selected["primary_dm_thread_id"]})
        )["result"]
        started = time.monotonic()
        row = {
            "case": case,
            "repeat": repeat,
            "status": "failed",
            "provider_fixture": False,
            "authentication": "Real Clerk",
            "agent_id": selected["agent_id"],
        }
        try:
            accepted = public(send(thread, text))
            run_id = accepted["run_id"]
            row["run_id"] = run_id
            first_progress = None
            deadline = started + 180
            while time.monotonic() < deadline:
                result = call(command("runtime.read", {"run_id": run_id}))["result"]
                events = call(
                    command(
                        "runtime.events",
                        {"run_id": run_id, "replay_epoch": None, "last_sequence": "0"},
                    )
                )["result"]["events"]
                if first_progress is None and any(
                    e["type"] in {"message.delta", "tool.started"} for e in events
                ):
                    first_progress = time.monotonic() - started
                if result["status"] not in {"queued", "running"}:
                    break
                time.sleep(0.2)
            else:
                raise TimeoutError("Live acceptance deadline exceeded")
            row["terminal_status"] = result["status"]
            row["first_progress_s"] = first_progress
            row["tool_completions"] = [
                e["payload"] for e in events if e["type"] == "tool.completed"
            ]
            row["providers"] = [
                e["payload"] for e in events if e["type"] == "provider.attempt"
            ]
            row["diagnostics"] = call(command("run.diagnostics", {"run_id": run_id}))[
                "result"
            ]["usage"]
            assert result["status"] == "succeeded" and result["text"].strip(), result[
                "status"
            ]
            if require_tool:
                assert any(
                    not e.get("is_error") and e.get("tool_name") == require_tool
                    for e in row["tool_completions"]
                ), "Required native tool did not succeed"
            if case == "moa":
                assert len({p["connection_id"] for p in row["providers"]}) >= 2, (
                    "MoA did not attribute both participating models"
                )
                assert all(p["http_status"] == 200 for p in row["providers"]), (
                    "A required MoA reference failed"
                )
            row["status"] = "passed"
        except Exception as error:  # noqa: BLE001 - retain every unsuccessful live attempt
            row["failure_type"] = type(error).__name__
        finally:
            row["settlement_s"] = time.monotonic() - started
            results.append(row)
            (args.evidence / "live-results.json").write_text(
                json.dumps(results, indent=2) + "\n"
            )
            print(
                json.dumps(
                    {
                        "case": case,
                        "repeat": repeat,
                        "status": row["status"],
                        "duration_s": row["settlement_s"],
                    }
                ),
                flush=True,
            )

    try:
        for case, selected in (
            ("primary_responses", primary),
            ("secondary_chat", secondary),
        ):
            for repeat in range(1, 4):
                attempt(
                    case,
                    repeat,
                    selected,
                    f"Use todo_list once to record a completed item named 'NMA030 verified {repeat}'. After it succeeds, reply NMA030_VERIFIED. Do not create a goal or use any other tool.",
                    "todo_list",
                )
        attempt(
            "moa",
            1,
            mixture,
            "Calculate 19 times 23 and explain the check in one sentence. Do not call tools or create a goal.",
            None,
        )
        attempt(
            "auxiliary_review",
            1,
            primary,
            "Call native_review exactly once to verify 19 times 23. After it succeeds, report its answer briefly. Do not use another tool or create a goal.",
            "native_review",
        )
        before = call(command("agent.list", {"after": None, "limit": 100}))["result"]
        start.current.kill()
        start.current.wait(timeout=10)
        start()
        after = call(command("agent.list", {"after": None, "limit": 100}))["result"]
        assert before == after
        (args.evidence / "restart.json").write_text(
            json.dumps(
                {
                    "agent_catalog_preserved": True,
                    "agents": len(after["items"]),
                    "before_sha256": hashlib.sha256(
                        json.dumps(before, sort_keys=True).encode()
                    ).hexdigest(),
                    "after_sha256": hashlib.sha256(
                        json.dumps(after, sort_keys=True).encode()
                    ).hexdigest(),
                },
                indent=2,
            )
            + "\n"
        )
        print(
            "Live attempts complete; gateway remains available for the real-auth UI walkthrough.",
            flush=True,
        )
        stopped.wait()
    finally:
        next(first, None)
        environment.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
