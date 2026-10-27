"""Controlled HTTP/OAuth server and real gateway for the production app UI."""

import json
import os
import signal
import sys
import threading
from pathlib import Path

sys.path.insert(0, str(Path("apps/engine/tests").resolve()))
from test_app_connections import app_server, restart
from test_direct_messages import public_api
from test_runtime import runtime

gateway = runtime.__wrapped__(None)
state = next(gateway)
root, _, _, start, *_ = state
http = public_api.__wrapped__(state)
request = next(http)
provider = app_server(root, "oauth")
origin, receipts = provider.__enter__()
restart(start, origin)
image = os.environ.get("NMA_TEST_NATIVE_IMAGE")
if image:
    (root / "capabilities.json").write_text(
        json.dumps(
            {
                "version": 2,
                "execution_surfaces": {
                    "linux": {"kind": "scoped_linux", "ready": True, "image": image}
                },
                "tool_grants": {
                    "native_files": {
                        "enabled": True,
                        "toolset": "file",
                        "execution_surface": "linux",
                    }
                },
            }
        )
    )
metadata = {
    "base": request("/agents").url.split("/api/")[0],
    "app_url": origin + "/mcp",
    "root": str(root),
    "receipts": str(receipts),
    "authentication": "Fixed disposable HTTP account; normal gateway; not external OAuth acceptance",
}
Path(".dev/nma-033-browser.json").write_text(json.dumps(metadata))
print("App UI acceptance fixture ready", flush=True)
stop = threading.Event()
signal.signal(signal.SIGTERM, lambda *_: stop.set())
signal.signal(signal.SIGINT, lambda *_: stop.set())
try:
    stop.wait()
finally:
    provider.__exit__(None, None, None)
    http.close()
    gateway.close()
