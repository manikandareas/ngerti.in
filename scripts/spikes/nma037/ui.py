"""Real Clerk + Muse speech acceptance with a disposable native conversation."""

import json
import os
import signal
import sys
import threading
from pathlib import Path

from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "apps/engine/tests"))
import test_runtime
from test_capabilities import capability_agent
from test_direct_messages import snapshot
from test_runtime import command

auth_path = ROOT / ".dev/nma037/auth/private.json"
auth = json.loads(auth_path.read_text())
owner = auth["identities"][0]["owner_id"]
test_runtime.OWNER = owner
fixture = test_runtime.runtime.__wrapped__(None)
state = next(fixture)
root, provider, call, start, *_ = state
stop = threading.Event()
try:
    key = dotenv_values(ROOT / ".env")["MUSE_API_KEY"]
    configured = call(
        command(
            "media.configure",
            {"provider": "meta", "api_key": key, "expected_generation": 0},
        )
    )
    assert "result" in configured
    agent = capability_agent(
        call,
        "media-walkthrough",
        tool_grants=["media_images", "media_vision", "media_video"],
    )
    thread = call(command("thread.read", {"thread_id": agent["primary_dm_thread_id"]}))[
        "result"
    ]
    registry = Path(auth["registry"])
    partitions = json.loads(registry.read_text())
    partitions[owner] = {
        "key_file": str(root / "key"),
        "socket": str(root / "state/nma.sock"),
    }
    registry.write_text(json.dumps(partitions))
    (ROOT / ".dev/nma037/ui.json").write_text(
        json.dumps(
            {
                "root": str(root),
                "thread_id": thread["thread_id"],
                "agent_id": agent["agent_id"],
                "owner": owner,
                "pid": os.getpid(),
            }
        )
    )
    signal.signal(signal.SIGTERM, lambda *_: stop.set())
    signal.signal(signal.SIGINT, lambda *_: stop.set())
    print("Media UI fixture ready", flush=True)
    stop.wait()
    (ROOT / "docs/research/evidence/nma-037/ui-state.json").write_text(
        json.dumps(snapshot(call, thread), indent=2)
    )
finally:
    import shutil

    shutil.rmtree(root / "state/media-secrets", ignore_errors=True)
    fixture.close()
