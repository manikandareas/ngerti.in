"""Private fixed-model acceptance relays; the existing gateway alone refreshes grants."""

import argparse
import json
import os
import secrets
import signal
import socket
import threading
import time
from contextlib import ExitStack
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from uuid import uuid4

import httpx
from ngertiin_engine.contracts import sign
from ngertiin_engine.provider_secrets import Vault


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--metadata", type=Path, required=True)
    parser.add_argument("--private-output", type=Path, required=True)
    parser.add_argument("--evidence", type=Path, required=True)
    args = parser.parse_args()
    if args.private_output.exists() or args.evidence.exists():
        raise ValueError("Choose fresh private and evidence paths")
    owners = json.loads(args.metadata.read_text())
    owner = next(
        row
        for row in owners
        if any(
            c["provider"] == "chatgpt" and c["status"] == "connected"
            for c in row["connections"]
        )
    )
    partition = json.loads(Path(owner["partition_file"]).read_text())[owner["owner"]]
    home = Path(partition["key_file"]).parent
    vault = Vault(home, owner["owner"])
    servers, private, proof = (
        [],
        [],
        {"refresh_writer": "Existing product gateway only", "routes": []},
    )
    for provider in ("chatgpt", "openrouter"):
        candidates_connections = [
            c
            for c in owner["connections"]
            if c["provider"] == provider and c["status"] == "connected"
        ]

        def preferred(candidate):
            with vault.locked(candidate["connection_id"]):
                value = vault.read(candidate["connection_id"])
            return value["metadata"].get("auth_method") == "oauth"

        connection = max(candidates_connections, key=preferred)
        candidates = (
            ("gpt-6-luna",)
            if provider == "chatgpt"
            else ("openai/gpt-6-luna", "openai/gpt-5-nano", "openai/gpt-oss-20b")
        )
        model = next((m for m in candidates if m in connection["models"]), None)
        if model is None:
            raise ValueError("No preselected acceptance model is available")
        server, configuration, evidence = prepare(
            vault,
            owner["owner"],
            partition,
            connection["connection_id"],
            provider,
            model,
        )
        servers.append(server)
        private.append(configuration)
        proof["routes"].append(evidence)
    args.private_output.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    descriptor = os.open(
        args.private_output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600
    )
    with os.fdopen(descriptor, "w") as stream:
        json.dump(private, stream)
    args.evidence.parent.mkdir(parents=True, exist_ok=True)
    stopped = threading.Event()
    signal.signal(signal.SIGTERM, lambda *_: stopped.set())
    signal.signal(signal.SIGINT, lambda *_: stopped.set())
    print(
        "Two fixed-model provider relays are ready; credentials remain private.",
        flush=True,
    )
    try:
        while not stopped.wait(1):
            args.evidence.write_text(json.dumps(proof, indent=2) + "\n")
    finally:
        for server in servers:
            server.shutdown()
            server.server_close()
        args.evidence.write_text(json.dumps(proof, indent=2) + "\n")
        args.private_output.unlink(missing_ok=True)


def prepare(vault, owner, partition, connection_id, provider, model):
    def current():
        with vault.locked(connection_id):
            value = vault.read(connection_id)
        if (
            provider == "chatgpt"
            and (value.get("expires_at_ms") or 0) < (time.time() + 65) * 1000
        ):
            body = {
                "schema_version": "nma.v1",
                "command_id": str(uuid4()),
                "type": "connection.models",
                "expected_revision": None,
                "payload": {"connection_id": connection_id},
            }
            with socket.socket(socket.AF_UNIX) as client:
                client.settimeout(90)
                client.connect(partition["socket"])
                client.sendall(
                    (
                        json.dumps(
                            sign(body, owner, Path(partition["key_file"]).read_bytes())
                        )
                        + "\n"
                    ).encode()
                )
                result = json.loads(client.makefile("rb").readline())
            if "error" in result:
                raise ValueError("The original provider connection requires repair")
            with vault.locked(connection_id):
                value = vault.read(connection_id)
        if value["metadata"]["status"] != "connected":
            raise ValueError("The original provider connection is disconnected")
        return value

    selected = current()
    metadata = selected["metadata"]
    key = secrets.token_urlsafe(40)
    protocol = "codex_responses" if provider == "chatgpt" else "chat_completions"
    suffix = "/responses" if provider == "chatgpt" else "/chat/completions"
    evidence = {
        "provider": provider,
        "model": model,
        "protocol": protocol,
        "connection_id": connection_id,
        "auth_method": metadata.get("auth_method"),
        "requests": [],
        "failures": [],
    }

    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def log_message(self, *args):
            pass

        def reply(self, status, body, content_type="application/json"):
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Connection", "close")
            self.end_headers()
            self.close_connection = True
            self.wfile.write(body)

        def authorized(self):
            return secrets.compare_digest(
                self.headers.get("Authorization", ""), "Bearer " + key
            )

        def do_GET(self):
            if not self.authorized() or self.path != "/v1/models":
                return self.reply(403, b"{}")
            self.reply(200, json.dumps({"data": [{"id": model}]}).encode())

        def do_POST(self):
            if not self.authorized() or self.path != "/v1" + suffix:
                return self.reply(403, b"{}")
            body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            if body.get("model") != model:
                return self.reply(400, b"{}")
            if provider == "chatgpt":
                body.update(store=False, stream=True)
            attempt = {
                "started": time.monotonic(),
                "parameters": {
                    k: body[k]
                    for k in (
                        "reasoning",
                        "reasoning_effort",
                        "max_output_tokens",
                        "max_tokens",
                        "service_tier",
                        "provider",
                    )
                    if k in body
                },
            }
            evidence["requests"].append(attempt)
            try:
                current()
                with ExitStack() as stack:
                    client = stack.enter_context(
                        httpx.Client(
                            timeout=180, trust_env=False, follow_redirects=False
                        )
                    )
                    with vault.locked(connection_id):
                        value = vault.read(connection_id)
                        if value["metadata"]["status"] != "connected":
                            raise ValueError("Provider disconnected")
                        secret = value.get("api_key") or value["access_token"]
                        response = stack.enter_context(
                            client.stream(
                                "POST",
                                metadata["base_url"] + suffix,
                                json=body,
                                headers={
                                    "Authorization": "Bearer " + secret,
                                    "User-Agent": "Ngertiin/0.1 (native route acceptance)",
                                },
                            )
                        )
                    attempt["http_status"] = response.status_code
                    if response.is_error:
                        raw = response.read()
                        try:
                            payload = json.loads(raw).get("error", {})
                        except (ValueError, AttributeError):
                            payload = {}
                        return self.reply(
                            response.status_code,
                            json.dumps(
                                {
                                    "error": {
                                        "code": payload.get("code", "provider_error"),
                                        "type": payload.get("type", "provider_error"),
                                        "message": "Provider rejected the acceptance request",
                                    }
                                }
                            ).encode(),
                        )
                    self.send_response(response.status_code)
                    self.send_header(
                        "Content-Type",
                        response.headers.get("Content-Type", "application/json"),
                    )
                    self.send_header("Connection", "close")
                    self.end_headers()
                    self.close_connection = True
                    for chunk in response.iter_bytes():
                        self.wfile.write(chunk)
                        self.wfile.flush()
                attempt["completed"] = True
            except (BrokenPipeError, ConnectionResetError):
                attempt["client_disconnected"] = True
            except Exception as error:  # noqa: BLE001 - retain typed failures without credential values
                evidence["failures"].append(type(error).__name__)
                self.reply(503, b'{"error":{"code":"provider_unavailable"}}')
            finally:
                attempt["duration_s"] = time.monotonic() - attempt["started"]

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    server.daemon_threads = True
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return (
        server,
        {
            "provider": provider,
            "model": model,
            "protocol": protocol,
            "base_url": f"http://127.0.0.1:{server.server_port}/v1",
            "api_key": key,
        },
        evidence,
    )


if __name__ == "__main__":
    main()
