"""Credential-only loopback relay. Native Hermes owns inference and tool execution."""

import hashlib
import hmac
import json
import os
import threading
from contextlib import ExitStack
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

import httpx

from ngertiin_engine.connections import provider_error
from ngertiin_engine.contracts import EngineError, canonical, digest
from ngertiin_engine.provider_auth import ProviderAuth


class ProviderTransport:
    def __init__(self, connections):
        from hermes_cli.auth import _save_private_json

        self.connections, self.routes = connections, {}
        self.key = Path(os.environ["NMA_SERVICE_KEY_FILE"]).read_bytes()
        path = connections.home / "provider-relay.json"
        saved = json.loads(path.read_text()) if path.exists() else {}
        transport = self

        class Handler(BaseHTTPRequestHandler):
            protocol_version = "HTTP/1.1"

            def log_message(self, *args):
                pass

            def reply(self, status, body, content_type="application/json"):
                self.send_response(status)
                self.send_header("Content-Type", content_type)
                self.send_header("Content-Length", str(len(body)))
                self.send_header("Cache-Control", "no-store")
                self.send_header("Referrer-Policy", "no-referrer")
                self.send_header("Connection", "close")
                self.end_headers()
                self.close_connection = True
                self.wfile.write(body)

            def cookies(self):
                cookies = SimpleCookie()
                cookies.load(self.headers.get("Cookie", ""))
                return {k: v.value for k, v in cookies.items()}

            def do_GET(self):
                parsed = urlsplit(self.path)
                if parsed.path.startswith("/auth/start/"):
                    try:
                        query = parse_qs(parsed.query, max_num_fields=2)
                        url, name, value = transport.auth.launch(
                            parsed.path.removeprefix("/auth/start/"),
                            query.get("ticket", [""])[0],
                            self.cookies(),
                        )
                        self.send_response(302)
                        self.send_header("Location", url)
                        self.send_header(
                            "Set-Cookie",
                            f"{name}={value}; HttpOnly; SameSite=Lax; Path=/auth; Max-Age=600",
                        )
                        self.send_header("Cache-Control", "no-store")
                        self.send_header("Referrer-Policy", "no-referrer")
                        self.send_header("Content-Length", "0")
                        self.end_headers()
                    except (EngineError, ValueError):
                        self.reply(400, b"Sign-in could not be started.", "text/plain")
                    return
                if not (
                    parsed.path == "/auth/callback"
                    or parsed.path.startswith("/auth/callback/")
                ):
                    self.reply(404, b"{}")
                    return
                params = parse_qs(
                    parsed.query, keep_blank_values=True, max_num_fields=12
                )
                if any(len(v) != 1 for v in params.values()):
                    self.reply(400, b"{}")
                    return
                params = {k: v[0] for k, v in params.items()}
                if parsed.path.startswith("/auth/callback/"):
                    params.setdefault(
                        "state", parsed.path.removeprefix("/auth/callback/")
                    )
                try:
                    cookies = SimpleCookie()
                    cookies.load(self.headers.get("Cookie", ""))
                    status = transport.auth.callback(
                        params, {k: v.value for k, v in cookies.items()}
                    )
                    message = (
                        "Connection saved. Return to Ngertiin to refresh its models."
                        if status == "completed"
                        else "Sign-in did not complete. Return to Ngertiin and try again."
                    )
                    self.reply(200, message.encode(), "text/plain; charset=utf-8")
                except EngineError:
                    self.reply(
                        400,
                        b"Sign-in could not be verified. Return to Ngertiin and start again.",
                        "text/plain",
                    )

            def do_POST(self):
                try:
                    transport.forward(self)
                except EngineError as exc:
                    self.reply(
                        401 if exc.code == "PROVIDER_RECONNECT_REQUIRED" else 503,
                        canonical(
                            {"error": {"code": exc.code, "message": exc.code}}
                        ).encode(),
                    )
                except (httpx.HTTPError, ValueError, KeyError, TypeError):
                    self.reply(503, b'{"error":{"code":"PROVIDER_UNAVAILABLE"}}')
                except (BrokenPipeError, ConnectionResetError):
                    pass

        self.server = ThreadingHTTPServer(("127.0.0.1", saved.get("port", 0)), Handler)
        self.server.daemon_threads = True
        self.base = f"http://127.0.0.1:{self.server.server_port}"
        _save_private_json(path, {"port": self.server.server_port}, fsync_dir=True)
        self.auth = ProviderAuth(connections, self.base)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def close(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=5)

    def runtime(
        self,
        snapshot,
        thread_id,
        run_id=None,
        session_id=None,
        execution=None,
        control=None,
    ):
        route = {
            "snapshot": snapshot,
            "thread_id": thread_id,
            "run_id": run_id,
            "session_id": session_id,
            "execution": dict(execution or {}),
            "control": control,
        }
        identity = digest(route)
        token = hmac.new(self.key, identity.encode(), "sha256").hexdigest()
        self.routes[identity] = route
        return snapshot["model"], {
            "provider": "custom",
            "requested_provider": snapshot["provider_id"],
            "api_mode": snapshot["protocol"],
            "base_url": self.base + "/inference/" + identity,
            "api_key": token,
            "credential_pool": None,
        }

    def forward(self, handler):
        parts = urlsplit(handler.path).path.split("/")
        if len(parts) < 4 or parts[1] != "inference":
            raise EngineError("NOT_FOUND")
        identity = parts[2]
        expected = hmac.new(self.key, identity.encode(), "sha256").hexdigest()
        supplied = handler.headers.get("Authorization", "").removeprefix("Bearer ")
        supplied = handler.headers.get("x-api-key", supplied)
        if not hmac.compare_digest(expected, supplied) or identity not in self.routes:
            raise EngineError("PROVIDER_RECONNECT_REQUIRED")
        route = dict(self.routes[identity])
        if route.get("control"):
            from ngertiin_engine.session_controls import authorize_control

            authorize_control(
                self.connections.store, route["control"], route["session_id"]
            )
        else:
            if not route["run_id"] or not route["session_id"] or not route["execution"]:
                raise EngineError("ACCESS_REVOKED")
            from ngertiin_engine.reliability import Reliability

            row = self.connections.store.write(
                lambda conn: Reliability(self.connections.store).check(
                    conn, route["execution"]
                )
            )
            if not row or row[0] != route["run_id"]:
                raise EngineError("ACCESS_REVOKED")
        snapshot = route["snapshot"]
        suffix = "/" + "/".join(parts[3:])
        allowed = {
            "chat_completions": "/chat/completions",
            "codex_responses": "/responses",
            "anthropic_messages": "/v1/messages",
        }[snapshot["protocol"]]
        if suffix != allowed:
            raise EngineError("UNSUPPORTED_PROTOCOL")
        length = int(handler.headers.get("Content-Length", "0"))
        if not 0 < length <= 8 * 1024 * 1024:
            raise EngineError("INVALID_REQUEST")
        body = json.loads(handler.rfile.read(length))
        if body.get("model") != snapshot["model"]:
            raise EngineError("MODEL_UNAVAILABLE")
        if snapshot["provider_id"] == "chatgpt":
            body.update(store=False, stream=True)
        # The lock orders disconnect/replacement against actual dispatch, then releases for streaming.
        with ExitStack() as resources:
            client = resources.enter_context(
                httpx.Client(
                    timeout=httpx.Timeout(120, connect=15),
                    follow_redirects=False,
                    trust_env=False,
                )
            )
            with self.connections.vault.locked(snapshot["connection_id"]):
                try:
                    key = self.connections.credential(snapshot)
                except EngineError as exc:
                    self.connections.record_failure(route["run_id"], exc.code)
                    raise
                headers = {
                    "Authorization": "Bearer " + key,
                    "Content-Type": "application/json",
                    "User-Agent": "Ngertiin/0.1 (Hermes native transport)",
                }
                if snapshot["protocol"] == "anthropic_messages":
                    headers.update(
                        {"x-api-key": key, "anthropic-version": "2023-06-01"}
                    )
                if snapshot["provider_id"].startswith("opencode-"):
                    headers["x-opencode-session"] = hashlib.sha256(
                        (self.connections.owner + ":" + route["thread_id"]).encode()
                    ).hexdigest()
                response = resources.enter_context(
                    client.stream(
                        "POST",
                        snapshot["base_url"] + suffix,
                        json=body,
                        headers=headers,
                    )
                )
            if response.is_error:
                raw = response.read()
                try:
                    payload = json.loads(raw).get("error", {})
                    code = payload.get("code", "")
                    error_type = payload.get("type", "")
                except (ValueError, AttributeError):
                    code, error_type = "", ""
                error = provider_error(response.status_code, code, error_type)
                self.connections.record_failure(route["run_id"], error)
                handler.reply(
                    response.status_code,
                    canonical({"error": {"code": error, "message": error}}).encode(),
                )
                return
            handler.send_response(response.status_code)
            handler.send_header(
                "Content-Type",
                response.headers.get("Content-Type", "application/json"),
            )
            handler.send_header("Connection", "close")
            handler.end_headers()
            handler.close_connection = True
            if snapshot["protocol"] == "codex_responses":
                for line in response.iter_lines():
                    if line.startswith("data:"):
                        try:
                            event = json.loads(line[5:])
                            if event.get("type") == "response.failed":
                                error = event.get("response", {}).get("error") or {}
                                code = provider_error(
                                    503, error.get("code", ""), error.get("type", "")
                                )
                                self.connections.record_failure(route["run_id"], code)
                                line = "data: " + canonical(
                                    {
                                        "type": "response.failed",
                                        "response": {
                                            "status": "failed",
                                            "error": {
                                                "code": code,
                                                "message": code,
                                            },
                                        },
                                    }
                                )
                        except ValueError:
                            pass
                    handler.wfile.write((line + "\n").encode())
                    handler.wfile.flush()
            else:
                for chunk in response.iter_bytes():
                    handler.wfile.write(chunk)
                    handler.wfile.flush()
