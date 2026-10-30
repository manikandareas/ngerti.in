"""Disposable real Hermes gateway for authenticated NMA-038 browser acceptance.

Uses the normal production HTTP authentication. Only the inference provider is a
controlled fixture; file publication and all history/import commands are real.
"""

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
    state = json.loads(args.auth.read_text())
    import test_runtime

    test_runtime.OWNER = state["identities"][0]["owner_id"]
    fixture = test_runtime.runtime.__wrapped__(None)
    root, provider, call, start, *_ = next(fixture)
    from uuid import uuid4

    from test_runtime import command, settle

    def send(thread, text):
        return command(
            "message.send",
            {
                "thread_id": thread["thread_id"],
                "text": text,
                "attachment_ids": [],
                "request_key": str(uuid4()),
                "expected_membership_revision": thread["membership_revision"],
            },
        )

    import psycopg

    stop = threading.Event()
    other_fixture = None
    for kind in (signal.SIGTERM, signal.SIGINT):
        signal.signal(kind, lambda *_: stop.set())
    try:
        (root / "capabilities.json").write_text(
            json.dumps(
                {
                    "execution_surfaces": {
                        "conversation": {"kind": "scoped_conversation", "ready": True}
                    },
                    "tool_grants": {
                        "files": {"enabled": True, "toolset": "nma_workspace"},
                        "clarification": {
                            "enabled": True,
                            "toolset": "clarify",
                            "execution_surface": "conversation",
                        },
                    },
                }
            )
        )
        setup = call(command("account.ensure"))["result"]
        thread = call(
            command("thread.read", {"thread_id": setup["primary_dm_thread_id"]})
        )["result"]
        agent = thread["agents"][0]
        body = command(
            "agent.configure",
            {
                "agent_id": agent["agent_id"],
                "display_name": agent["display_name"],
                "handle": agent["handle"],
                "config": {
                    **agent["config"],
                    "tool_grants": ["files", "clarification"],
                },
            },
        )
        body["expected_revision"] = agent["revision"]
        assert "result" in call(body)

        def respond(body, text):
            if "NMA038_CLARIFY" in text:
                if body["messages"][-1]["role"] == "tool":
                    return {
                        "role": "assistant",
                        "content": "NMA038_CLARIFIED:"
                        + body["messages"][-1]["content"],
                    }
                return {
                    "role": "assistant",
                    "content": None,
                    "tool_calls": [
                        {
                            "id": "nma038-native-question",
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
            if "NMA038_WRITE" not in text:
                return None
            if body["messages"][-1]["role"] == "tool":
                return {
                    "role": "assistant",
                    "content": "The verified report is saved as nma038-report.txt.",
                }
            return {
                "role": "assistant",
                "content": None,
                "tool_calls": [
                    {
                        "id": "nma038-publish",
                        "type": "function",
                        "function": {
                            "name": "workspace",
                            "arguments": json.dumps(
                                {
                                    "action": "publish",
                                    "filename": "nma038-report.txt",
                                    "content": "NMA038 verified artifact bytes\n45 / 360 * 100 = 12.5\n",
                                }
                            ),
                        },
                    }
                ],
            }

        provider.goal_script = respond

        def release_delayed_stream():
            while not stop.is_set():
                if provider.blocked.wait(0.2):
                    if not stop.wait(4):
                        provider.release.set()
                    return

        threading.Thread(target=release_delayed_stream, daemon=True).start()
        receipt = call(
            send(thread, "NMA038_WRITE: prepare the fuel report and save a file.")
        )["result"]
        settle(call, receipt["run_id"])
        owner = test_runtime.OWNER
        registry = Path(state["registry"])
        registry.write_text(
            json.dumps(
                {
                    owner: {
                        "key_file": str(root / "key"),
                        "socket": str(root / "state/nma.sock"),
                    }
                }
            )
        )
        test_runtime.OWNER = state["identities"][1]["owner_id"]
        other_fixture = test_runtime.runtime.__wrapped__(None)
        other_root, _, other_call, _, *_ = next(other_fixture)
        other_setup = other_call(command("account.ensure"))["result"]
        test_runtime.OWNER = owner
        partitions = json.loads(registry.read_text())
        partitions[state["identities"][1]["owner_id"]] = {
            "key_file": str(other_root / "key"),
            "socket": str(other_root / "state/nma.sock"),
        }
        registry.write_text(json.dumps(partitions))
        with psycopg.connect(state["database_url"]) as conn:
            conn.execute(
                "UPDATE account_provisioning SET status='ready',result='{}'::jsonb,error_code=NULL WHERE owner_id=%s",
                (owner,),
            )
        metadata = {
            "root": str(root),
            "other_root": str(other_root),
            "other_thread_id": other_setup["primary_dm_thread_id"],
            "owner": owner,
            "thread_id": thread["thread_id"],
            "agent_id": agent["agent_id"],
            "pid": os.getpid(),
            "gateway_pid": start.current.pid,
            "provider": "controlled loopback fixture",
            "authentication": "actual ClerkJS plus production current_account",
        }
        args.metadata.write_text(json.dumps(metadata, indent=2))
        print("Disposable authenticated gateway ready.", flush=True)
        stop.wait()
    finally:
        if other_fixture:
            try:
                next(other_fixture)
            except StopIteration:
                pass
        try:
            next(fixture)
        except StopIteration:
            pass


if __name__ == "__main__":
    main()
