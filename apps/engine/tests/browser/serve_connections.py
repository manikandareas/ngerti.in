"""Disposable real-gateway HTTP fixture for the production connection settings UI."""

import json
import os
import signal
import sys
import threading
from pathlib import Path

sys.path.insert(0, str(Path("apps/engine/tests").resolve()))
from test_connections import agent, connect, providers
from test_direct_messages import public_api, send
from test_runtime import command, runtime, settle

gateway = runtime.__wrapped__(None)
state = next(gateway)
http = public_api.__wrapped__(state)
request = next(http)
fixtures = providers.__wrapped__()
servers = next(fixtures)
root, _, _, start, *_ = state
metadata = {
    "base": request("/agents").url.split("/api/")[0],
    "provider_url": f"http://127.0.0.1:{servers[0].server_port}/v1",
    "root": str(root),
}
# Only this synthetic fixture key is public. No real account credentials enter the harness.
servers[0].key = "ui-synthetic-key-only"
if os.environ.get("NMA_BROWSER_NO_PROVIDER") == "1":
    start.current.kill()
    start.current.wait(timeout=10)
    (root / "state").rename(root / "original-state")
    (root / "state").mkdir(mode=0o700)
    (root / "models.json").write_text("{}")
    start(
        overrides={
            "OPENAI_API_KEY": "",
            "NMA_BINDINGS_FILE": "",
            "NMA_DEFAULT_MODEL": "",
        }
    )
    setup = state[2](command("account.ensure"))["result"]
    metadata["thread_id"] = setup["primary_dm_thread_id"]
elif os.environ.get("NMA_BROWSER_QUOTA") == "1":
    (root / "capabilities.json").write_text(
        json.dumps({"tool_grants": {"tasks": {"enabled": True, "toolset": "todo"}}})
    )
    call = state[2]
    connection_id, _ = connect(call, servers[0], "Akun pengujian kuota")
    current = agent(call, connection_id + ":test-model", "quota-browser")
    thread = call(
        command("thread.read", {"thread_id": current["primary_dm_thread_id"]})
    )["result"]
    servers[0].status = 402
    receipt = call(send(thread, "Periksa koneksi model"))["result"]
    settle(call, receipt["run_id"], "failed")
    metadata["thread_id"] = thread["thread_id"]

Path(".dev/nma-040-browser.json").write_text(json.dumps(metadata))
print("Connection settings fixture ready", flush=True)
stopped = threading.Event()
signal.signal(signal.SIGTERM, lambda *_: stopped.set())
signal.signal(signal.SIGINT, lambda *_: stopped.set())
try:
    stopped.wait()
finally:
    fixtures.close()
    http.close()
    gateway.close()
