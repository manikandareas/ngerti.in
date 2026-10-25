"""Disposable real-model HTTP/UI baseline, with explicit fixed-account auth gap."""

import argparse
import json
import os
import signal
import sqlite3
import subprocess
import sys
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--env-file", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    os.environ["HERMES_SOURCE"] = str(args.source.resolve())
    os.environ["NMA_TEST_LIVE_ENV"] = str(args.env_file.resolve())
    bridge = [
        str(ROOT / "apps/backend/.venv/bin/python"),
        "-m",
        "ngertiin.agent_engine.computer_bridge",
    ]
    os.environ["NMA_TEST_COMPUTER_COMMAND"] = json.dumps(bridge)
    sys.path[:0] = [
        str(ROOT / "apps/engine/tests"),
        str(ROOT / "apps/engine/src"),
        str(args.source.resolve()),
    ]
    from baseline import close_api, finish_runtime
    from test_capabilities import capability_agent
    from test_direct_messages import public_api
    from test_runtime import command, runtime

    fixture = runtime.__wrapped__(None)
    state = next(fixture)
    root, _provider, call, *_ = state
    api = public_api.__wrapped__(state)
    request = next(api)
    (root / "capabilities.json").write_text(
        json.dumps(
            {
                "tool_grants": {
                    "browser": {"enabled": True, "toolset": "nma_computer"},
                    "files": {"enabled": True, "toolset": "nma_workspace"},
                }
            }
        )
    )
    agent = capability_agent(call, "baseline-browser", tool_grants=["browser", "files"])
    thread = call(
        command(
            "thread.create",
            {
                "kind": "dm",
                "title": "Browser baseline",
                "agent_ids": [agent["agent_id"]],
            },
        )
    )["result"]["thread"]
    meta = {
        "base": request("/agents").url.split("/api/")[0],
        "thread_id": thread["thread_id"],
        "root": str(root),
        "auth": "Fixed disposable current_account dependency; production Clerk is unverified",
    }
    args.output.write_text(json.dumps(meta, indent=2) + "\n")
    print("Disposable UI API ready", flush=True)
    stop = threading.Event()
    signal.signal(signal.SIGTERM, lambda *_: stop.set())
    signal.signal(signal.SIGINT, lambda *_: stop.set())
    try:
        stop.wait()
    finally:
        snap = call(command("thread.snapshot", {"thread_id": thread["thread_id"]}))[
            "result"
        ]
        report = {
            "metadata": meta,
            "snapshot": snap,
            "diagnoses": [
                call(command("run.diagnostics", {"run_id": r["run_id"]}))["result"]
                for r in snap["runs"]
            ],
        }
        with sqlite3.connect(root / "state/state.db") as db:
            computers = db.execute(
                "SELECT workspace_id,resource_id FROM nma_computers WHERE thread_id=?",
                (thread["thread_id"],),
            ).fetchall()
        report["cleanup"] = []
        for workspace, resource in computers:
            response = subprocess.run(
                bridge,
                check=False,
                input=json.dumps(
                    {
                        "operation": "delete",
                        "workspace": {
                            "id": workspace,
                            "resource_name": "nma-" + workspace,
                            "resource_id": resource,
                        },
                    }
                ),
                capture_output=True,
                text=True,
                timeout=90,
            )
            report["cleanup"].append(
                {
                    "returncode": response.returncode,
                    "result": json.loads(response.stdout),
                }
            )
        args.output.with_name("ui-result.json").write_text(
            json.dumps(report, indent=2) + "\n"
        )
        try:
            close_api(api)
        finally:
            finish_runtime(fixture)


if __name__ == "__main__":
    main()
