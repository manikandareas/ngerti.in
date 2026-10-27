"""Private non-streaming client bridge to the existing fixed-model acceptance relay."""

import argparse
import json
import signal
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import httpx


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--route", type=Path, required=True)
    parser.add_argument("--port", type=int, default=8895)
    args = parser.parse_args()
    route = json.loads(args.route.read_text())

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass

        def reply(self, status, payload):
            data = json.dumps(payload).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def do_POST(self):
            if (
                self.headers.get("Authorization") != "Bearer " + route["api_key"]
                or self.path != "/v1/responses"
            ):
                return self.reply(403, {"error": "Forbidden"})
            body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            if body.get("model") != route["model"]:
                return self.reply(400, {"error": "Fixed model mismatch"})
            # The selected subscription transport uses native unlimited output
            # semantics. All source inputs and structured-output requirements stay.
            body.pop("max_output_tokens", None)
            # The actual fixed Luna subscription route rejects temperature
            # (verified separately); its native sampling defaults apply.
            body.pop("temperature", None)
            if not body.get("instructions"):
                body["instructions"] = (
                    "Follow the supplied memory extraction instructions and return the required structured output."
                )
            try:
                with (
                    httpx.Client(timeout=180, trust_env=False) as client,
                    client.stream(
                        "POST",
                        route["base_url"] + "/responses",
                        json=body,
                        headers={"Authorization": "Bearer " + route["api_key"]},
                    ) as response,
                ):
                    if response.is_error:
                        response.read()
                        return self.reply(
                            response.status_code,
                            {
                                "error": {
                                    "message": "The fixed provider rejected the request"
                                }
                            },
                        )
                    output = []
                    for line in response.iter_lines():
                        if line.startswith("data: ") and line != "data: [DONE]":
                            event = json.loads(line[6:])
                            if event.get("type") == "response.output_item.done":
                                output.append(event["item"])
                            if event.get("type") == "response.completed":
                                final = event["response"]
                                # Native Codex streams completed items separately
                                # and may leave final.output empty. Preserve those
                                # actual items for non-streaming SDK clients.
                                if not final.get("output"):
                                    final["output"] = output
                                return self.reply(200, final)
                            if event.get("type") in {"response.failed", "error"}:
                                return self.reply(
                                    502,
                                    {"error": {"message": "The fixed provider failed"}},
                                )
                return self.reply(502, {"error": {"message": "Missing final response"}})
            except (httpx.HTTPError, ValueError, KeyError):
                return self.reply(
                    503, {"error": {"message": "The fixed provider is unavailable"}}
                )

    server = ThreadingHTTPServer(("0.0.0.0", args.port), Handler)
    server.daemon_threads = True
    threading.Thread(target=server.serve_forever, daemon=True).start()
    stopped = threading.Event()
    signal.signal(signal.SIGINT, lambda *_: stopped.set())
    signal.signal(signal.SIGTERM, lambda *_: stopped.set())
    try:
        stopped.wait()
    finally:
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    main()
