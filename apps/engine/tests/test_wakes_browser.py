"""Opt-in real Chromium closure/reopen over a live gateway snapshot harness."""

# ruff: noqa: F811
import html
import json
import os
import subprocess
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest
from test_direct_messages import dm, send, snapshot
from test_discussions import group, wait_group
from test_goal_lifecycle import begin, continuation_script, eventually
from test_runtime import runtime  # noqa: F401
from test_wakes import force_due, schedule
from test_webhooks import event, setup


@pytest.mark.skipif(
    os.environ.get("NMA_TEST_BROWSER") != "1", reason="Opt-in Chromium acceptance"
)
@pytest.mark.parametrize("trigger", ["schedule", "event", "peer"])
def test_browser_closed_gateway_runs_and_reopen_replays(runtime, trigger):
    root, provider, call, start, *_ = runtime
    provider.goal_script = None
    if trigger == "event":
        thread, goal = setup(root, call, provider, "browser-offline-event")
        scheduled = goal
    elif trigger == "peer":
        thread = group(call)

        def peer(body, text):
            if not body.get("messages"):
                return None
            prompt = next(
                m["content"] for m in reversed(body["messages"]) if m["role"] == "user"
            )
            response = (
                "Research ready. @writer draft it"
                if "You are @researcher" in prompt
                else "Draft ready. @reviewer check it"
                if "You are @writer" in prompt
                else "Review complete."
            )
            return {"role": "assistant", "content": response}

        provider.goal_script = peer
    else:
        thread = dm(call, "browser-offline-wake")
        goal = begin(call, thread)
        continuation_script(provider, goal["goal_id"])
        scheduled = schedule(call, thread, goal, seconds=120)
    evidence = Path(
        os.environ.get(
            "NMA_BROWSER_EVIDENCE",
            str(Path(__file__).resolve().parents[3] / "docs/research/evidence/nma-015"),
        )
    )
    evidence = evidence / trigger
    evidence.mkdir(parents=True, exist_ok=True)
    requests = []

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def do_GET(self):
            requests.append(self.path)
            state = snapshot(call, thread)
            current = (
                state["goals"][0]
                if state["goals"]
                else {"title": "Peer work", "status": "active", "units": []}
            )
            content = "".join(
                "<p>" + html.escape(m["content"]) + "</p>" for m in state["messages"]
            )
            page = f"<!doctype html><title>Offline wake acceptance</title><main><h1>Gateway snapshot harness</h1><p>Goal: {html.escape(current['title'])} · {current['status']}</p><p>Execution units: {len(current['units'])}</p>{content}</main>"
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(page.encode())

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    url = f"http://127.0.0.1:{server.server_port}"
    log = []

    def browser(*args):
        result = subprocess.run(
            ["agent-browser", "--session", "nma015-acceptance", *args],
            capture_output=True,
            text=True,
            timeout=40,
            check=True,
        )
        log.append(
            {"command": list(args), "stdout": result.stdout, "stderr": result.stderr}
        )
        return result.stdout

    try:
        browser("open", url)
        browser("snapshot")
        browser("screenshot", str(evidence / "browser-before.png"))
        browser("close")
        before_requests = len(requests)
        before_model = len(provider.requests)
        # Restart with an overdue persisted watch after closing the entire browser.
        start.current.kill()
        start.current.wait(timeout=10)
        if trigger == "schedule":
            force_due(root, goal["goal_id"])
        start()
        request = None
        if trigger == "event":
            request = event()
            call(request)
        elif trigger == "peer":
            request = send(thread, "@researcher start the report")
            call(request)
        eventually(lambda: len(provider.requests), lambda n: n > before_model)
        final = (
            wait_group(root, call, thread)[0]
            if trigger == "peer"
            else eventually(
                lambda: snapshot(call, thread)["goals"][0],
                lambda g: (
                    len(g["units"]) > len(scheduled["units"])
                    and g["status"] == "waiting"
                    and all(u["settled"] for u in g["units"])
                ),
            )
        )
        assert len(requests) == before_requests
        closed_requests = len(requests) - before_requests
        messages = snapshot(call, thread)["messages"]
        if request:
            assert call(request)["result"]["duplicate"] is True
        start.current.kill()
        start.current.wait(timeout=10)
        start()
        assert snapshot(call, thread)["messages"] == messages
        browser("open", url)
        text = browser("get", "text", "body")
        assert (
            "Review complete." if trigger == "peer" else "RESULT: fuel calculation"
        ) in text
        browser("screenshot", str(evidence / "browser-after.png"))
        (evidence / "browser-closure.json").write_text(
            json.dumps(
                {
                    "scope": "Snapshot harness over real gateway; controlled provider; not production authenticated UI",
                    "requests_while_closed": closed_requests,
                    "model_requests_while_closed": len(provider.requests)
                    - before_model,
                    "goal": final,
                    "browser": log,
                },
                indent=2,
            )
            + "\n"
        )
    finally:
        browser("close")
        server.shutdown()
        server.server_close()
        provider.goal_script = None
