"""Disposable HTTP and native gateway fixture for production UI acceptance."""

import json
import signal
import sys
import threading
from pathlib import Path

sys.path.insert(0, str(Path("apps/engine/tests").resolve()))
from test_capabilities import capability_agent
from test_direct_messages import public_api, send, snapshot
from test_runtime import command, runtime, settle

r = runtime.__wrapped__(None)
state = next(r)
api = public_api.__wrapped__(state)
request = next(api)
root, provider, call, *_ = state
(root / "capabilities.json").write_text(
    json.dumps(
        {"tool_grants": {"files": {"enabled": True, "toolset": "nma_workspace"}}}
    )
)
a = capability_agent(call, "writer", tool_grants=["files"])
thread = call(
    command(
        "thread.create",
        {"kind": "dm", "title": "Laporan penelitian", "agent_ids": [a["agent_id"]]},
    )
)["result"]["thread"]


def respond(body, text):
    if not body.get("messages"):
        return None
    if body["messages"][-1]["role"] == "tool":
        return {
            "role": "assistant",
            "content": "The report is available in the result files.",
        }
    return {
        "role": "assistant",
        "content": None,
        "tool_calls": [
            {
                "id": "file-browser-proof",
                "type": "function",
                "function": {
                    "name": "workspace",
                    "arguments": json.dumps(
                        {
                            "action": "publish",
                            "filename": "laporan.md",
                            "content": "# Research report\nVerified artifact download from the producing run.\n",
                        }
                    ),
                },
            }
        ],
    }


provider.goal_script = respond
receipt = call(send(thread, "Susun laporan penelitian sebagai file."))["result"]
settle(call, receipt["run_id"])
snap = snapshot(call, thread)
assert len(snap["artifacts"]) == 1, snap
base = request("/agents").url.split("/api/")[0]
Path(".dev/nma-025-browser.json").write_text(
    json.dumps({"base": base, "thread": thread["thread_id"], "root": str(root)})
)
provider.goal_script = None
print("Browser API ready", flush=True)
stopped = threading.Event()
signal.signal(signal.SIGTERM, lambda *_: stopped.set())
signal.signal(signal.SIGINT, lambda *_: stopped.set())
try:
    stopped.wait()
finally:
    api.close()
    r.close()
