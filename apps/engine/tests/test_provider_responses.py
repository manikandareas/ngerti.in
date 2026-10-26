"""Public Responses protocol through native Hermes, including real native tools."""

# ruff: noqa: F811
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from uuid import uuid4

from test_connections import agent
from test_direct_messages import send
from test_runtime import command, runtime, settle  # noqa: F401


class Responses(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_GET(self):
        payload = b'{"data":[{"id":"response-model"}]}'
        self.send_response(200)
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        self.server.requests.append(body)
        assert self.path == "/v1/responses", self.path
        tool_result = any(
            item.get("type") == "function_call_output" for item in body["input"]
        )
        response = {
            "id": "resp-proof",
            "object": "response",
            "model": body["model"],
            "created_at": 1,
            "status": "completed",
            "error": None,
            "usage": {"input_tokens": 10, "output_tokens": 5, "total_tokens": 15},
        }
        if tool_result:
            response["output"] = [
                {
                    "id": "msg-proof",
                    "type": "message",
                    "role": "assistant",
                    "status": "completed",
                    "content": [
                        {
                            "type": "output_text",
                            "text": "RESPONSES_NATIVE_TOOL_CONFIRMED",
                            "annotations": [],
                        }
                    ],
                }
            ]
        else:
            response["output"] = [
                {
                    "type": "function_call",
                    "id": "fc-proof",
                    "call_id": "call-proof",
                    "status": "completed",
                    "name": "tool_call",
                    "arguments": json.dumps(
                        {
                            "calls": [
                                {
                                    "name": "todo_list",
                                    "arguments": {
                                        "todos": [
                                            {
                                                "id": "proof",
                                                "content": "Native Responses tool",
                                                "status": "completed",
                                            }
                                        ]
                                    },
                                }
                            ]
                        }
                    ),
                }
            ]
        events = []
        for i, output in enumerate(response["output"]):
            events.append(
                {"type": "response.output_item.done", "output_index": i, "item": output}
            )
        if self.server.terminal != "completed":
            response.update(
                status=self.server.terminal,
                error={
                    "code": "credit_balance_exhausted",
                    "type": "insufficient_quota",
                    "message": "Quota",
                },
            )
        events.append(
            {"type": "response." + self.server.terminal, "response": response}
        )
        payload = "".join(
            "data: " + json.dumps(event) + "\n\n" for event in events
        ).encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)


def test_native_responses_tool_and_failed_terminal_are_not_false_success(runtime):
    root, _, call, *_ = runtime
    (root / "capabilities.json").write_text(
        json.dumps({"tool_grants": {"tasks": {"enabled": True, "toolset": "todo"}}})
    )
    provider = ThreadingHTTPServer(("127.0.0.1", 0), Responses)
    provider.requests, provider.terminal = [], "completed"
    threading.Thread(target=provider.serve_forever, daemon=True).start()
    try:
        identity = str(uuid4())
        assert "result" in call(
            command(
                "connection.add_key",
                {
                    "connection_id": identity,
                    "provider": "custom",
                    "label": "Responses account",
                    "api_key": "responses-synthetic-key",
                    "protocol": "codex_responses",
                    "base_url": f"http://127.0.0.1:{provider.server_port}/v1",
                },
            )
        )
        call(command("connection.models", {"connection_id": identity}))
        current = agent(call, identity + ":response-model", "responses-agent")
        thread = call(
            command("thread.read", {"thread_id": current["primary_dm_thread_id"]})
        )["result"]
        receipt = call(send(thread, "Complete one native todo and report the result"))[
            "result"
        ]
        value = settle(call, receipt["run_id"])
        assert "RESPONSES_NATIVE_TOOL_CONFIRMED" in value["text"]
        assert len(provider.requests) == 2
        assert all(
            request["stream"] is True and request["store"] is False
            for request in provider.requests
        )
        assert provider.requests[0]["tools"]
        assert any(
            item.get("type") == "function_call_output"
            for item in provider.requests[1]["input"]
        )
        provider.terminal = "failed"
        receipt = call(send(thread, "A failed terminal is not completion"))["result"]
        failed = settle(call, receipt["run_id"], "failed")
        assert failed["error_code"] == "PROVIDER_QUOTA_EXHAUSTED"
    finally:
        provider.shutdown()
        provider.server_close()
