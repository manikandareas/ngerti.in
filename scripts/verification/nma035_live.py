"""Disposable real-provider delegation, specialist review and peer-task acceptance."""

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
    import test_runtime
    from test_capabilities import capability_agent
    from test_direct_messages import send, snapshot
    from test_learning import conversation

    fixture = test_runtime.runtime.__wrapped__(None)
    state = next(fixture)
    root, _provider, call, _start, *_ = state
    (root / "capabilities.json").write_text(
        json.dumps(
            {
                "execution_surfaces": {
                    "children": {"kind": "scoped_delegation", "ready": True}
                },
                "tool_grants": {
                    "delegation": {
                        "enabled": True,
                        "toolset": "delegation",
                        "execution_surface": "children",
                    },
                    "files": {"enabled": True, "toolset": "nma_workspace"},
                },
            }
        )
    )
    report = {
        "provider": "openrouter",
        "model": "openai/gpt-6-luna",
        "denominator": 3,
        "cases": [],
    }

    def run_case(name, thread, prompt, oracle):
        began = time.monotonic()
        request = send(thread, prompt)
        admitted = call(request)
        result = {"name": name, "admission": admitted, "passed": False}
        deadline = time.monotonic() + 240
        snap = None
        while "result" in admitted and time.monotonic() < deadline:
            snap = snapshot(call, thread)
            if oracle(snap):
                result["passed"] = True
                break
            if any(r["status"] in {"failed", "indeterminate"} for r in snap["runs"]):
                break
            time.sleep(0.5)
        result.update(elapsed_seconds=round(time.monotonic() - began, 3), snapshot=snap)
        report["cases"].append(result)
        (args.evidence / "live.json").write_text(json.dumps(report, indent=2) + "\n")
        print(
            json.dumps({k: result[k] for k in ("name", "passed", "elapsed_seconds")}),
            flush=True,
        )
        return result

    try:
        parent = capability_agent(
            call, "live-coordinator", tool_grants=["delegation", "files"]
        )
        dm = conversation(call, parent)
        result = run_case(
            "parallel_structured_results",
            dm,
            "For this one calculation use delegate_task exactly once with two tasks. One temporary assistant must calculate 17+26 and the other 19+23 independently. Each task must set output_schema to an object with one required integer answer property and allowed_toolsets to an empty array. They can work in the background; their results will return automatically. Once both actual results arrive, combine their answers and report TOTAL_<sum>. Do not invent their results or repeatedly spawn replacements. This is a one-time calculation, not an ongoing responsibility.",
            lambda snap: (
                len(snap["delegations"]) == 2
                and all(
                    c["status"] == "completed"
                    and c["result"].get("schema_valid") is True
                    for c in snap["delegations"]
                )
                and any(
                    "TOTAL_85" in m["content"]
                    for m in snap["messages"]
                    if m["author_kind"] == "agent"
                )
            ),
        )
        if not result["passed"]:
            return
        review_dm = conversation(call, parent)
        result = run_case(
            "specialist_patch_review",
            review_dm,
            "Delegate an independent code review to one temporary specialist using delegate_task. Supply this exact specification and patch as its context: mean(total,count) must return 0 when count is zero; otherwise total/count. Actual patch: diff --git a/stats.py b/stats.py\n--- a/stats.py\n+++ b/stats.py\n@@ -1,2 +1,2 @@\n def mean(total, count):\n-    return 0 if count == 0 else total / count\n+    return total / count\nThe reviewer must return JSON with a findings array and a title per finding, using output_schema, and must inspect the supplied diff rather than execute code. Wait for its actual result, then explain the defect. This is a one-time review, not an ongoing responsibility.",
            lambda snap: (
                bool(snap["delegations"])
                and all(
                    c["status"] == "completed"
                    and c["result"].get("schema_valid") is True
                    for c in snap["delegations"]
                )
                and any("zero" in str(c["result"]).lower() for c in snap["delegations"])
            ),
        )
        if not result["passed"]:
            return
        roles = [
            (
                "researcher",
                "Calculate the supplied fuel efficiency. Use collaboration handoff with assignee writer and the exact expected deliverable. Share your computed result in your reply. Do not perform the writer or reviewer work.",
            ),
            (
                "writer",
                "Use your assigned collaboration task. Publish the actual report text with workspace publish. Submit that task with the actual artifact_id and reviewer reviewer. Do not ask the user to route work; do not claim review before the reviewer acts.",
            ),
            (
                "reviewer",
                "Inspect your assigned review task. Read its exact artifact with workspace read. Verify the calculation. Approve using collaboration review only if correct; otherwise request_changes with a concrete reason. Do not create replacement tasks.",
            ),
        ]
        agents = []
        for handle, instructions in roles:
            response = call(
                test_runtime.command(
                    "agent.create",
                    {
                        "display_name": handle.title(),
                        "handle": handle,
                        "config": {
                            "soul": "",
                            "instructions": instructions,
                            "model": "test",
                            "tool_grants": ["files"],
                        },
                    },
                )
            )
            agents.append(response["result"]["agent"])
        group = call(
            test_runtime.command(
                "thread.create",
                {
                    "kind": "group",
                    "title": "Live editorial review",
                    "agent_ids": [a["agent_id"] for a in agents],
                },
            )
        )["result"]["thread"]
        run_case(
            "researcher_writer_reviewer",
            group,
            "Work together on one short fuel-efficiency report for 360 km using 45 litres. Researcher calculates litres per 100 km and creates a collaboration handoff to writer. Writer publishes the actual report artifact and submits its assigned task to reviewer. Reviewer reads that exact artifact and approves the task if correct. Use the collaboration tool so responsibility, artifact references and review are durable. No user routing is needed. This is one report, not a repeating responsibility.",
            lambda snap: (
                any(
                    t["status"] == "completed"
                    and t["artifact_ids"]
                    and t["reviewer_agent_id"]
                    for t in snap["collaboration_tasks"]
                )
                and bool(snap["artifacts"])
                and len(
                    {
                        m["author_agent_id"]
                        for m in snap["messages"]
                        if m["author_kind"] == "agent"
                    }
                )
                == 3
            ),
        )
    finally:
        fixture.close()
        relay.shutdown()
        relay.server_close()
        environment.unlink(missing_ok=True)
        report["original_credential_journals_unchanged"] = before == {
            p.name: hashlib.sha256(p.read_bytes()).hexdigest()
            for p in vault.root.glob("*.json")
        }
        report["provider_evidence"] = provider_evidence
        (args.evidence / "live.json").write_text(json.dumps(report, indent=2) + "\n")


if __name__ == "__main__":
    main()
