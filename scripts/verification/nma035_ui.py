"""Serve reproducible native collaboration data behind actual Clerk/API auth.

Authentication is prepared with the existing disposable Clerk fixture. Production
conversation components use signed Clerk tokens; only router/bootstrap shims and
the model HTTP fixture are controlled. This is not deployment acceptance.
"""

import argparse
import json
import signal
import sys
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "apps/engine/tests"))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--auth", type=Path, required=True)
    parser.add_argument("--metadata", type=Path, required=True)
    parser.add_argument("--evidence", type=Path, required=True)
    args = parser.parse_args()
    auth = json.loads(args.auth.read_text())
    owner = auth["identities"][0]["owner_id"]
    import test_runtime
    from test_collaboration import test_peer_handoff_review_changes_artifact_and_restart
    from test_delegation import setup, tool
    from test_direct_messages import send, snapshot

    test_runtime.OWNER = owner
    fixture = test_runtime.runtime.__wrapped__(None)
    state = next(fixture)
    root, provider, call, start, *_ = state
    release, blocked, stopped = threading.Event(), threading.Event(), threading.Event()
    args.evidence.mkdir(parents=True, exist_ok=True)
    try:
        test_peer_handoff_review_changes_artifact_and_restart(state, True)
        threads = call(test_runtime.command("thread.list", {"after": None}))["result"][
            "items"
        ]
        group = next(t for t in threads if t["kind"] == "group")
        group = call(
            test_runtime.command("thread.read", {"thread_id": group["thread_id"]})
        )["result"]
        _agent, dm = setup(root, call)
        catalog = json.loads((root / "capabilities.json").read_text())
        catalog["tool_grants"]["files"] = {"enabled": True, "toolset": "nma_workspace"}
        (root / "capabilities.json").write_text(json.dumps(catalog))

        def script(body, text):
            messages = body.get("messages", [])
            if not messages:
                return None
            if "focused subagent" in json.dumps(
                [m for m in messages if m["role"] == "system"]
            ):
                blocked.set()
                release.wait(300)
                return {"role": "assistant", "content": "UI_CHILD_RESPONSE_AFTER_STOP"}
            prompt = next(
                m["content"] for m in reversed(messages) if m["role"] == "user"
            )
            if "You are @" in prompt:
                return {
                    "role": "assistant",
                    "content": "Laporan sudah diperbaiki Writer dan diperiksa Reviewer. File hasilnya tersedia di percakapan.",
                }
            if any(m["role"] == "tool" for m in messages):
                return {
                    "role": "assistant",
                    "content": "Asisten sementara sedang menghitung. Anda dapat menghentikan pekerjaan ini.",
                }
            return tool(
                "delegate_task",
                {"goal": "UI_WAIT_CHILD: independently verify the calculation"},
            )

        provider.goal_script = script
        admitted = call(
            send(dm, "Gunakan asisten sementara untuk memeriksa perhitungan ini.")
        )["result"]
        assert blocked.wait(15)
        test_runtime.settle(call, admitted["run_id"])
        partitions = json.loads(Path(auth["registry"]).read_text())
        partitions[owner] = {
            "key_file": str(root / "key"),
            "socket": str(root / "state/nma.sock"),
        }
        Path(auth["registry"]).write_text(json.dumps(partitions))
        metadata = {
            "owner": owner,
            "root": str(root),
            "group": group["thread_id"],
            "dm": dm["thread_id"],
            "gateway_pid": start.current.pid,
            "pid": __import__("os").getpid(),
        }
        args.metadata.write_text(json.dumps(metadata, indent=2) + "\n")
        for name, thread in (("group", group), ("delegation", dm)):
            (args.evidence / (name + "-before.json")).write_text(
                json.dumps(snapshot(call, thread), indent=2) + "\n"
            )
        signal.signal(signal.SIGTERM, lambda *_: stopped.set())
        signal.signal(signal.SIGINT, lambda *_: stopped.set())
        print("Authenticated native collaboration UI fixture ready.", flush=True)
        while not stopped.wait(0.5):
            if snapshot(call, dm)["delegations"][0]["status"] == "cancelled":
                release.set()
        time.sleep(0.2)
        for name, thread in (("group", group), ("delegation", dm)):
            (args.evidence / (name + "-after.json")).write_text(
                json.dumps(snapshot(call, thread), indent=2) + "\n"
            )
    finally:
        release.set()
        fixture.close()


if __name__ == "__main__":
    main()
