"""Run a disposable fixed-model credential relay for an existing plan connection.

The running product gateway alone refreshes the renewable connection. Disposable
controllers receive only an opaque relay key, never a provider token or a copy
of the user's credential journal. No model or account fallback is allowed.
"""

import argparse
import json
import os
import secrets
import socket
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from uuid import uuid4


def prepare(partitions, owner, connection_id, output, evidence):
    from ngertiin_engine.contracts import sign
    from ngertiin_engine.provider_secrets import Vault

    if output.exists() or evidence.exists():
        raise FileExistsError("Choose new private route and public evidence paths")
    partition = json.loads(partitions.read_text())[owner]
    key_path = Path(partition["key_file"])
    vault = Vault(key_path.parent, owner)

    def current():
        with vault.locked(connection_id):
            value = vault.read(connection_id)
        if (value.get("expires_at_ms") or 0) < (time.time() + 65) * 1000:
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
                        json.dumps(sign(body, owner, key_path.read_bytes())) + "\n"
                    ).encode()
                )
                response = json.loads(client.makefile("rb").readline())
            if "error" in response:
                raise RuntimeError(response["error"]["code"])
            with vault.locked(connection_id):
                value = vault.read(connection_id)
        if value["metadata"]["status"] != "connected":
            raise ValueError("The selected plan connection requires repair")
        return value

    value = current()
    metadata = value["metadata"]
    model = "gpt-6-luna"
    if metadata["provider"] != "chatgpt" or metadata["status"] != "connected":
        raise ValueError("An available ChatGPT plan connection is required")
    if model not in {entry["id"] for entry in metadata["models"]}:
        raise ValueError("The connected plan catalog does not offer gpt-6-luna")
    relay_key = secrets.token_urlsafe(40)
    refresh_lock = threading.Lock()
    counts = {"requests": 0, "models": {}, "http_statuses": {}, "failures": []}

    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def log_message(self, *args):
            pass

        def do_POST(self):
            import httpx

            if self.path != "/v1/responses" or not secrets.compare_digest(
                self.headers.get("Authorization", ""), "Bearer " + relay_key
            ):
                self.send_error(403)
                return
            body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            if body.get("model") != model:
                self.send_error(400)
                return
            body.update(store=False, stream=True)
            try:
                with refresh_lock:
                    access = current()["access_token"]
                    counts["requests"] += 1
                    counts["models"][model] = counts["models"].get(model, 0) + 1
                with httpx.Client(timeout=180, trust_env=False) as client:  # noqa: SIM117
                    with client.stream(
                        "POST",
                        metadata["base_url"] + "/responses",
                        json=body,
                        headers={
                            "Authorization": "Bearer " + access,
                            "User-Agent": "Ngertiin/0.1 (NMA028 paired research)",
                        },
                    ) as response:
                        status = str(response.status_code)
                        counts["http_statuses"][status] = (
                            counts["http_statuses"].get(status, 0) + 1
                        )
                        self.send_response(response.status_code)
                        self.send_header(
                            "Content-Type",
                            response.headers.get("Content-Type", "application/json"),
                        )
                        self.send_header("Connection", "close")
                        self.end_headers()
                        self.close_connection = True
                        for line in response.iter_lines():
                            if line.startswith("data:"):
                                try:
                                    event = json.loads(line[5:])
                                    if event.get("type") in {
                                        "response.completed",
                                        "response.failed",
                                        "response.incomplete",
                                    }:
                                        terminal = event["type"]
                                        counts[terminal] = counts.get(terminal, 0) + 1
                                except ValueError:
                                    pass
                            self.wfile.write((line + "\n").encode())
                            self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError):
                counts["client_disconnects"] = counts.get("client_disconnects", 0) + 1
            except Exception as error:  # noqa: BLE001 - retain typed transport failures without secrets
                counts["failures"].append(type(error).__name__)
                self.send_error(503)

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    server.daemon_threads = True
    relay_url = f"http://127.0.0.1:{server.server_port}/v1"
    output.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    output.parent.chmod(0o700)
    # JSON string quoting is accepted by python-dotenv, without shell evaluation.
    content = {
        "OPENAI_API_KEY": relay_key,
        "OPENAI_MODEL": model,
        "OPENAI_BASE_URL": relay_url,
    }
    descriptor = os.open(output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w") as stream:
        stream.write(
            "".join(k + "=" + json.dumps(v) + "\n" for k, v in content.items())
        )
    evidence.parent.mkdir(parents=True, exist_ok=True)
    proof = {
        "provider": "chatgpt",
        "model": model,
        "protocol": metadata["protocol"],
        "base_url": metadata["base_url"],
        "connection_id": connection_id,
        "catalog_models": [entry["id"] for entry in metadata["models"]],
        "renewal_owner": "Existing product gateway; renewable journal was not copied",
        "disposable_transport": "Fixed Luna-only loopback credential relay; original product gateway alone owns renewal",
        "expires_at_ms": value["expires_at_ms"],
        "refresh_token_exported": False,
        "relay_url": relay_url,
        "counts": counts,
    }
    evidence.write_text(json.dumps(proof, indent=2) + "\n")
    print(
        "Ready: fixed gpt-6-luna ChatGPT plan relay; no credential was printed",
        flush=True,
    )
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        evidence.write_text(json.dumps(proof, indent=2) + "\n")
        output.unlink(missing_ok=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--partitions", required=True, type=Path)
    parser.add_argument("--owner", required=True)
    parser.add_argument("--connection", required=True)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--evidence", required=True, type=Path)
    args = parser.parse_args()
    prepare(args.partitions, args.owner, args.connection, args.output, args.evidence)
