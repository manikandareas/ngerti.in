"""Disposable real-provider goal, native judge, offline script and signed-event acceptance."""

import argparse
import hashlib
import importlib.util
import json
import os
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "apps/engine/tests"))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--metadata", type=Path, required=True)
    parser.add_argument("--private", type=Path, required=True)
    parser.add_argument("--evidence", type=Path, required=True)
    parser.add_argument(
        "--case", help="Run one named case as a separate targeted cohort"
    )
    args = parser.parse_args()
    args.private.mkdir(parents=True, mode=0o700, exist_ok=True)
    args.evidence.mkdir(parents=True, exist_ok=True)
    spec = importlib.util.spec_from_file_location(
        "acceptance_provider", ROOT / "scripts/spikes/nma030/provider_relay.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    owners = json.loads(args.metadata.read_text())
    owner = next(
        row
        for row in owners
        if any(
            c["provider"] == "openrouter" and c["status"] == "connected"
            for c in row["connections"]
        )
    )
    partition = json.loads(Path(owner["partition_file"]).read_text())[owner["owner"]]
    from ngertiin_engine.provider_secrets import Vault

    vault = Vault(Path(partition["key_file"]).parent, owner["owner"])
    candidates = [
        c
        for c in owner["connections"]
        if c["provider"] == "openrouter" and c["status"] == "connected"
    ]
    connection = max(
        candidates,
        key=lambda c: (
            vault.read(c["connection_id"])["metadata"].get("auth_method") == "oauth"
        ),
    )
    before = {
        p.name: hashlib.sha256(p.read_bytes()).hexdigest()
        for p in vault.root.glob("*.json")
    }
    relay, route, provider_evidence = module.prepare(
        vault,
        owner["owner"],
        partition,
        connection["connection_id"],
        "openrouter",
        "openai/gpt-6-luna",
    )
    environment = args.private / "bootstrap.env"
    environment.write_text(
        "".join(
            key + "=" + json.dumps(value) + "\n"
            for key, value in {
                "OPENAI_API_KEY": route["api_key"],
                "OPENAI_MODEL": route["model"],
                "OPENAI_BASE_URL": route["base_url"],
            }.items()
        )
    )
    environment.chmod(0o600)
    os.environ["NMA_TEST_LIVE_ENV"] = str(environment.resolve())
    os.environ["NMA_TEST_LIVE_PROTOCOL"] = route["protocol"]
    import sqlite3

    import test_runtime
    from test_capabilities import capability_agent
    from test_direct_messages import send, snapshot
    from test_learning import conversation
    from test_webhooks import SECRET, event
    from test_workspace_delivery import catalog

    fixture = test_runtime.runtime.__wrapped__(None)
    state = next(fixture)
    root, _provider, call, start, *_ = state
    image = "sha256:6580374cc2db359e4db9723c7a1c679a6b609d1a0fa91b1432cd3df9096adb6d"
    capabilities = catalog(image)
    capabilities["execution_surfaces"]["children"] = {
        "kind": "scoped_delegation",
        "ready": True,
    }
    capabilities["tool_grants"]["delegation"] = {
        "enabled": True,
        "toolset": "delegation",
        "execution_surface": "children",
    }
    (root / "capabilities.json").write_text(json.dumps(capabilities))
    source_paths = sorted((ROOT / "apps/engine/src/ngertiin_engine").glob("*.py")) + [
        ROOT / "apps/engine/src/ngertiin_engine/runtime-pin.json"
    ]
    source_before = {
        str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest()
        for p in source_paths
    }
    report = {
        "runtime_source": source_before,
        "provider": "openrouter",
        "model": "openai/gpt-6-luna",
        "denominator": 1 if args.case else 6,
        "protocol": "nma036-goals-automation-v2",
        "cases": [],
    }

    def save():
        (args.evidence / "live.json").write_text(json.dumps(report, indent=2) + "\n")

    def wait(thread, predicate, timeout=240):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            snap = snapshot(call, thread)
            if predicate(snap):
                return snap
            time.sleep(0.5)
        raise AssertionError(snap)

    def user(thread, text):
        receipt = call(send(thread, text))
        if "result" not in receipt:
            raise AssertionError(receipt)
        deadline = time.monotonic() + 180
        while time.monotonic() < deadline:
            status = call(
                test_runtime.command(
                    "runtime.read", {"run_id": receipt["result"]["run_id"]}
                )
            )["result"]["status"]
            if status not in {"queued", "running"}:
                assert status == "succeeded", status
                break
            time.sleep(0.3)
        else:
            raise AssertionError("Real model turn timed out")
        return snapshot(call, thread)

    def run(name, function):
        began = time.monotonic()
        item = {"name": name, "passed": False, "attempted": True}
        try:
            item["evidence"] = function()
            item["passed"] = True
        except Exception as exc:  # noqa: BLE001 - preserve every failed acceptance attempt
            item["error"] = str(exc)
        item["elapsed_seconds"] = round(time.monotonic() - began, 3)
        report["cases"].append(item)
        save()
        print(
            json.dumps({k: item[k] for k in ("name", "passed", "elapsed_seconds")}),
            flush=True,
        )

    def make(handle, tools=()):
        return conversation(
            call, capability_agent(call, handle, tool_grants=list(tools))
        )

    def longitudinal():
        thread = make("live-goal-intent")
        snap = user(
            thread,
            "Hypothetically, how might a daily warehouse stock report work? This is a discussion only; do not start or create a responsibility.",
        )
        assert not snap["goals"], snap
        snap = user(
            thread,
            "Now take ongoing responsibility for preparing my warehouse A stock report. I will provide the stock numbers later. Capture this responsibility and wait for my data; do not schedule any polling.",
        )
        assert len(snap["goals"]) == 1, snap
        goal = snap["goals"][0]
        snap = user(
            thread,
            "Correction: this responsibility is for warehouse B, not warehouse A. Update the same goal and keep waiting for my data.",
        )
        assert (
            len(snap["goals"]) == 1
            and snap["goals"][0]["goal_id"] == goal["goal_id"]
            and "B" in snap["goals"][0]["objective"]
        ), snap
        start.current.kill()
        start.current.wait(timeout=10)
        start()
        snap = user(
            thread,
            "As discussed, keep responsibility for the same warehouse B stock report, waiting for my numbers. This repeats my earlier request, not a second task.",
        )
        assert (
            len(snap["goals"]) == 1 and snap["goals"][0]["goal_id"] == goal["goal_id"]
        ), snap
        snap = user(
            thread,
            "Stop the warehouse B stock-report responsibility permanently. Do not recreate it or schedule more work.",
        )
        assert snap["goals"][0]["status"] == "stopped", snap
        start.current.kill()
        start.current.wait(timeout=10)
        start()
        restored = snapshot(call, thread)
        assert restored["goals"][0]["status"] == "stopped"
        return restored

    def review():
        thread = make("live-goal-review")
        user(
            thread,
            'Take responsibility for a verified report calculating 17+26. Configure the optional completion contract with subgoals ["Verified arithmetic"] and judge_required true. Produce the actual result, persist it, submit evidence for that exact criterion, invoke verify_goal to have the native independent judge inspect it, and only complete when it returns done. Continue automatically through all steps without asking me to activate anything.',
        )
        snap = wait(
            thread,
            lambda s: (
                len(s["goals"]) == 1
                and s["goals"][0]["status"] in {"completed", "blocked"}
                and all(u["settled"] for u in s["goals"][0]["units"])
            ),
        )
        g = snap["goals"][0]
        assert (
            g["status"] == "completed"
            and g["reviews"]
            and g["reviews"][-1]["verdict"] == "done"
            and g["subgoals"][0]["evidence_ids"]
        ), snap
        assert any(
            "43" in m["content"]
            for m in snap["messages"]
            if m["author_kind"] == "agent"
        )
        return snap

    def offline_model():
        thread = make("live-goal-offline")
        from ngertiin_engine.wakes import utc

        due = time.time() + 18
        user(
            thread,
            "Take responsibility for calculating 19*23, but do the calculation only at "
            + utc(due)
            + ". Schedule a once wake in UTC with missed_policy coalesce, then wait. At the wake produce the answer, verify the persisted result and complete without more input.",
        )
        snap = wait(
            thread,
            lambda s: bool(s["goals"]) and s["goals"][0]["wake"] is not None,
            timeout=30,
        )
        start.current.kill()
        start.current.wait(timeout=10)
        remaining = max(0, due - time.time() + 1)
        if remaining:
            time.sleep(remaining)
        start()
        snap = wait(
            thread,
            lambda s: (
                s["goals"][0]["status"] in {"completed", "blocked"}
                and all(u["settled"] for u in s["goals"][0]["units"])
            ),
        )
        assert snap["goals"][0]["status"] == "completed", snap
        assert any(
            "437" in m["content"]
            for m in snap["messages"]
            if m["author_kind"] == "agent"
        )
        with sqlite3.connect(root / "state/state.db") as db:
            occurrences = db.execute(
                "SELECT t.trigger_id,t.run_id,t.status FROM nma_triggers t JOIN nma_trigger_definitions d USING(owner_id,definition_id) WHERE d.goal_id=?",
                (snap["goals"][0]["goal_id"],),
            ).fetchall()
        assert len(occurrences) == 1, occurrences
        return {"snapshot": snap, "occurrences": occurrences}

    def offline_script():
        thread = make("live-goal-script", ["terminal"])
        from ngertiin_engine.wakes import utc

        due = time.time() + 25
        user(
            thread,
            "Take responsibility for a script-only calculation at "
            + utc(due)
            + '. Create a once schedule in UTC with missed_policy coalesce and job mode script, steps exactly [{"id":"first","command":"printf 41","depends_on":[]},{"id":"next","command":"python -c \'import json,os; print(int(json.loads(os.environ[\\"NMA_DEPENDENCY_RESULTS\\"])[\\"first\\"][\\"output\\"])+1)\'","depends_on":["first"]}]. Do not call terminal in this turn; the scheduled script job must execute without any model call. Wait after scheduling.',
        )
        snap = wait(
            thread,
            lambda s: bool(s["goals"]) and s["goals"][0]["wake"] is not None,
            timeout=30,
        )
        goal = snap["goals"][0]
        assert goal["wake"]["configuration"]["job"]["mode"] == "script", snap
        start.current.kill()
        start.current.wait(timeout=10)
        remaining = max(0, due - time.time() + 1)
        if remaining:
            time.sleep(remaining)
        start()
        deadline = time.monotonic() + 90
        rows = []
        while time.monotonic() < deadline:
            with sqlite3.connect(root / "state/state.db") as db:
                rows = db.execute(
                    "SELECT j.state,j.outputs,j.run_id FROM nma_automation_jobs j JOIN nma_triggers t USING(owner_id,trigger_id) JOIN nma_trigger_definitions d USING(owner_id,definition_id) WHERE d.goal_id=?",
                    (goal["goal_id"],),
                ).fetchall()
            if rows and rows[0][0] != "running":
                break
            time.sleep(0.5)
        assert rows and rows[0][0] == "completed", rows
        assert json.loads(rows[0][1])["next"]["output"].strip() == "42", rows
        return {"snapshot": snapshot(call, thread), "job": rows}

    def webhook():
        thread = make("live-goal-webhook")
        snap = user(
            thread,
            "Take responsibility for calculating 31+11 when an authenticated external event arrives with data field calculate_42. Until then wait without polling or a schedule. When the event arrives produce the result, verify its persisted evidence and complete automatically.",
        )
        goal = snap["goals"][0]
        (root / "webhook-key").write_bytes(SECRET)
        (root / "webhooks.json").write_text(
            json.dumps(
                {
                    "test": {
                        "owner_id": test_runtime.OWNER,
                        "agent_id": goal["responsible_agent_id"],
                        "goal_id": goal["goal_id"],
                        "secret_file": str(root / "webhook-key"),
                        "events": ["push"],
                        "filters": [{"field": "ref", "equals": "main"}],
                        "coalesce": {
                            "key": "entity",
                            "window_seconds": 3,
                            "max_wait_seconds": 5,
                        },
                    }
                }
            )
        )
        request = event(data="calculate_42")
        first = call(request)
        duplicate = call(request)
        assert duplicate["result"]["duplicate"], duplicate
        start.current.kill()
        start.current.wait(timeout=10)
        start()
        snap = wait(
            thread,
            lambda s: (
                s["goals"][0]["status"] in {"completed", "blocked"}
                and all(u["settled"] for u in s["goals"][0]["units"])
            ),
        )
        assert snap["goals"][0]["status"] == "completed", snap
        assert any(
            "42" in m["content"]
            for m in snap["messages"]
            if m["author_kind"] == "agent"
        )
        return {"snapshot": snap, "first": first, "duplicate": duplicate}

    def goal_delegation():
        thread = make("live-goal-child", ["delegation"])
        user(
            thread,
            "Take responsibility for a verified report calculating 17+26. Use exactly one temporary native child to calculate the answer, then review its actual returned result and complete this same persistent goal using persisted evidence. Let the child return automatically; do not poll, create replacements, or wait for another user message. When only child completion or this turn's persistence is pending, record continue and finish this turn so the gateway can deliver the next unit.",
        )
        snap = wait(
            thread,
            lambda s: (
                len(s["goals"]) == 1
                and s["goals"][0]["status"] in {"completed", "blocked"}
                and all(u["settled"] for u in s["goals"][0]["units"])
            ),
        )
        assert snap["goals"][0]["status"] == "completed", snap
        assert (
            len(snap["delegations"]) == 1
            and snap["delegations"][0]["status"] == "completed"
        ), snap
        assert snap["goals"][0]["evidence"] and any(
            "43" in m["content"]
            for m in snap["messages"]
            if m["author_kind"] == "agent"
        ), snap
        with sqlite3.connect(root / "state/state.db") as db:
            batches = db.execute(
                "SELECT b.batch_id,b.state,b.resume_run_id FROM nma_delegation_batches b JOIN nma_adapter_runs r ON r.owner_id=b.owner_id AND r.run_id=b.parent_run_id JOIN nma_adapter_bindings c USING(owner_id,binding_id) WHERE json_extract(c.config,'$.thread_id')=?",
                (thread["thread_id"],),
            ).fetchall()
        assert len(batches) == 1 and batches[0][1] == "admitted" and batches[0][2], (
            batches
        )
        return {"snapshot": snap, "batches": batches}

    try:
        for name, function in [
            ("longitudinal_intent_correction_duplicate_stop", longitudinal),
            ("native_subgoal_judge_completion", review),
            ("offline_model_schedule_restart", offline_model),
            ("offline_script_chain", offline_script),
            ("signed_duplicate_webhook_restart", webhook),
            ("native_goal_delegation", goal_delegation),
        ]:
            if not args.case or args.case == name:
                run(name, function)
    finally:
        fixture.close()
        from ngertiin_engine.native_executor import IsolatedTools

        for control in (root / "state/native-execution").glob("*"):
            if (control / "isolated-tools.db").exists():
                IsolatedTools(control, test_runtime.OWNER, image=image).cleanup()
        relay.shutdown()
        relay.server_close()
        environment.unlink(missing_ok=True)
        report["original_credential_journals_unchanged"] = before == {
            p.name: hashlib.sha256(p.read_bytes()).hexdigest()
            for p in vault.root.glob("*.json")
        }
        report["provider_evidence"] = provider_evidence
        report["runtime_source_unchanged_during_cohort"] = source_before == {
            str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in source_paths
        }
        save()


if __name__ == "__main__":
    main()
