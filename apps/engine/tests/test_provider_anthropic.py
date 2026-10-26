"""Declared Anthropic wire is consumed by the native Hermes transport."""

# ruff: noqa: F811
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from uuid import uuid4

from test_connections import agent
from test_direct_messages import send
from test_runtime import command, runtime, settle  # noqa: F401


class Anthropic(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_GET(self):
        body = b'{"data":[{"id":"anthropic-model"}]}'
        self.send_response(200)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        self.server.requests.append(body)
        assert self.path == "/v1/messages"
        assert self.headers["x-api-key"] == "anthropic-synthetic-key"
        tool_result = "tool_result" in json.dumps(body["messages"])
        block = (
            {"type": "text", "text": ""}
            if tool_result
            else {
                "type": "tool_use",
                "id": "native-proof",
                "name": "tool_call",
                "input": {},
            }
        )
        events = [
            {
                "type": "message_start",
                "message": {
                    "id": "msg-proof",
                    "type": "message",
                    "role": "assistant",
                    "model": body["model"],
                    "content": [],
                    "stop_reason": None,
                    "stop_sequence": None,
                    "usage": {"input_tokens": 10, "output_tokens": 0},
                },
            },
            {"type": "content_block_start", "index": 0, "content_block": block},
            {
                "type": "content_block_delta",
                "index": 0,
                "delta": {
                    "type": "text_delta",
                    "text": "ANTHROPIC_NATIVE_TOOL_CONFIRMED",
                }
                if tool_result
                else {
                    "type": "input_json_delta",
                    "partial_json": json.dumps(
                        {
                            "calls": [
                                {
                                    "name": "todo_list",
                                    "arguments": {
                                        "todos": [
                                            {
                                                "id": "proof",
                                                "content": "Anthropic native tool",
                                                "status": "completed",
                                            }
                                        ]
                                    },
                                }
                            ]
                        }
                    ),
                },
            },
            {"type": "content_block_stop", "index": 0},
            {
                "type": "message_delta",
                "delta": {
                    "stop_reason": "end_turn" if tool_result else "tool_use",
                    "stop_sequence": None,
                },
                "usage": {"output_tokens": 5},
            },
            {"type": "message_stop"},
        ]
        payload = "".join(
            "event: " + e["type"] + "\ndata: " + json.dumps(e) + "\n\n" for e in events
        ).encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)


def test_native_anthropic_tool_round_trip(runtime):
    root, _, call, *_ = runtime
    (root / "capabilities.json").write_text(
        json.dumps({"tool_grants": {"tasks": {"enabled": True, "toolset": "todo"}}})
    )
    provider = ThreadingHTTPServer(("127.0.0.1", 0), Anthropic)
    provider.requests = []
    threading.Thread(target=provider.serve_forever, daemon=True).start()
    try:
        identity = str(uuid4())
        call(
            command(
                "connection.add_key",
                {
                    "connection_id": identity,
                    "provider": "custom",
                    "label": "Anthropic wire",
                    "api_key": "anthropic-synthetic-key",
                    "protocol": "anthropic_messages",
                    "base_url": f"http://127.0.0.1:{provider.server_port}",
                },
            )
        )
        catalog = call(command("connection.models", {"connection_id": identity}))
        assert "result" in catalog, catalog
        current = agent(call, identity + ":anthropic-model", "anthropic-agent")
        thread = call(
            command("thread.read", {"thread_id": current["primary_dm_thread_id"]})
        )["result"]
        receipt = call(send(thread, "Complete one native todo"))["result"]
        value = settle(call, receipt["run_id"])
        assert "ANTHROPIC_NATIVE_TOOL_CONFIRMED" in value["text"]
        assert len(provider.requests) == 2
        assert "tool_result" in json.dumps(provider.requests[1]["messages"])
    finally:
        provider.shutdown()
        provider.server_close()
