"""A grammar rejection cannot become an unknown external action."""

# ruff: noqa: F811 - shared real gateway fixture

import json
import sqlite3
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread

from test_capabilities import capability_agent
from test_direct_messages import send
from test_runtime import command, runtime, settle  # noqa: F401


def test_grammar_preflight_never_executes_code(tmp_path):
    from ngertiin_engine.outcomes import preflight

    canary = tmp_path / "not-executed"
    code = f"open({str(canary)!r}, 'w').write('effect'); raise SyntaxError('runtime')"
    assert preflight("browser_exec", {"code": code}) is None
    assert not canary.exists()
    refusal = json.loads(preflight("browser_exec", {"code": "await page.click()"}))
    assert refusal["failure_phase"] == "pre_dispatch"
    assert refusal["outcome"] == "rejected" and refusal["line"] == 1


def test_repaired_syntax_dispatches_once_but_runtime_error_stays_unknown(runtime):
    root, model, call, start, *_ = runtime

    class Counter(BaseHTTPRequestHandler):
        count = 0

        def log_message(self, *args):
            pass

        def do_POST(self):
            Counter.count += 1
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"counted")

    server = ThreadingHTTPServer(("127.0.0.1", 0), Counter)
    worker = Thread(target=server.serve_forever, daemon=True)
    worker.start()
    overrides = {"NMA_TEST_COUNTER_URL": f"http://127.0.0.1:{server.server_port}"}
    start.current.kill()
    start.current.wait(timeout=10)
    start("browser_grammar", overrides)
    (root / "capabilities.json").write_text(
        json.dumps(
            {"tool_grants": {"browser": {"enabled": True, "toolset": "nma_computer"}}}
        )
    )
    agent = capability_agent(call, "grammar-admission", tool_grants=["browser"])
    thread = call(
        command(
            "thread.create",
            {
                "kind": "dm",
                "title": "Grammar admission",
                "agent_ids": [agent["agent_id"]],
            },
        )
    )["result"]["thread"]

    def script(body, text):
        if not body.get("messages"):
            return None
        last = body["messages"][-1]
        if last["role"] == "tool":
            code = (
                "print('repaired')" if "INVALID_TOOL_CODE" in last["content"] else None
            )
            if code is None:
                return {"role": "assistant", "content": "TOOL_OUTCOME_RECORDED"}
        else:
            code = (
                "await page.click()"
                if text == "REPAIR_SYNTAX"
                else "raise SyntaxError('runtime')"
            )
        return {
            "role": "assistant",
            "content": None,
            "tool_calls": [
                {
                    "id": "syntax-" + str(len(body["messages"])),
                    "type": "function",
                    "function": {
                        "name": "browser_exec",
                        "arguments": json.dumps({"code": code}),
                    },
                }
            ],
        }

    model.goal_script = script
    try:
        first = call(send(thread, "REPAIR_SYNTAX"))["result"]
        settle(call, first["run_id"])
        assert Counter.count == 1
        with sqlite3.connect(root / "state/state.db") as db:
            rows = db.execute(
                "SELECT phase FROM nma_effect_outcomes WHERE run_id=? ORDER BY rowid",
                (first["run_id"],),
            ).fetchall()
            assert rows == [("rejected",), ("completed",)]
        body = send(thread, "RUNTIME_FAILURE")
        second = call(body)
        settle(call, second["result"]["run_id"], "indeterminate")
        assert Counter.count == 2
        start.current.kill()
        start.current.wait(timeout=10)
        start("browser_grammar", overrides)
        replayed = call(body)["result"]
        assert replayed.pop("duplicate") is True
        expected = dict(second["result"])
        expected.pop("duplicate", None)
        assert replayed == expected
        assert Counter.count == 2
        blocked = call(send(thread, "ANOTHER_MUTATION"))["result"]
        settle(call, blocked["run_id"])
        assert Counter.count == 2
    finally:
        model.goal_script = None
        server.shutdown()
        server.server_close()
        worker.join(timeout=5)
