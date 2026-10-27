"""Disposable gateways behind real Clerk authentication for learning UI acceptance."""

import argparse
import json
import os
import signal
import sys
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "apps/engine/tests"))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--auth", type=Path, required=True)
    parser.add_argument("--metadata", type=Path, required=True)
    args = parser.parse_args()
    import test_runtime
    from test_capabilities import capability_agent
    from test_learning import conversation, inventory, invoke
    from test_workspace_delivery import catalog

    auth = json.loads(args.auth.read_text())
    fixtures, metadata = [], []
    registry = json.loads(Path(auth["registry"]).read_text())
    for index, identity in enumerate(auth["identities"]):
        test_runtime.OWNER = identity["owner_id"]
        fixture = test_runtime.runtime.__wrapped__(None)
        state = next(fixture)
        fixtures.append(fixture)
        root, provider, call, *_ = state
        (root / "capabilities.json").write_text(
            json.dumps(catalog(os.environ["NMA_TEST_DOCUMENT_IMAGE"]))
        )
        agent = capability_agent(
            call,
            "learning-acceptance",
            tool_grants=list(
                catalog(os.environ["NMA_TEST_DOCUMENT_IMAGE"])["tool_grants"]
            ),
        )
        thread = conversation(call, agent)
        if index == 0:
            assert invoke(
                provider,
                call,
                thread,
                "memory",
                {
                    "action": "add",
                    "target": "user",
                    "content": "The user prefers concise answers.",
                },
            ).get("success")
            assert invoke(
                provider,
                call,
                thread,
                "skill_manage",
                {
                    "operations": [
                        {
                            "action": "create",
                            "name": "verify-report",
                            "content": "---\nname: verify-report\ndescription: Verify a report before publication\n---\n\nRead the source and validate the output.\n",
                        }
                    ]
                },
            ).get("success")
            assert invoke(
                provider, call, thread, "skill_view", {"name": "verify-report"}
            ).get("success")
            doc = next(
                e
                for e in inventory(call, agent, thread)["catalog"]
                if e["name"] == "docx"
            )
            assert "result" in call(
                test_runtime.command(
                    "learning.install",
                    {
                        "agent_id": agent["agent_id"],
                        "thread_id": thread["thread_id"],
                        "catalog_id": doc["id"],
                    },
                )
            )
        registry[identity["owner_id"]] = {
            "key_file": str(root / "key"),
            "socket": str(root / "state/nma.sock"),
        }
        metadata.append(
            {
                "index": index,
                "owner_id": identity["owner_id"],
                "root": str(root),
                "thread_id": thread["thread_id"],
                "agent_id": agent["agent_id"],
            }
        )
    Path(auth["registry"]).write_text(json.dumps(registry))
    args.metadata.write_text(json.dumps(metadata, indent=2) + "\n")
    print(
        "Learning gateways are ready behind the actual authenticated API.", flush=True
    )
    stopped = threading.Event()
    signal.signal(signal.SIGINT, lambda *_: stopped.set())
    signal.signal(signal.SIGTERM, lambda *_: stopped.set())
    try:
        stopped.wait()
    finally:
        for fixture in reversed(fixtures):
            fixture.close()


if __name__ == "__main__":
    main()
