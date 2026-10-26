"""Secret-free native handler process inside the selected scoped Linux image."""

import argparse
import contextlib
import hashlib
import json
import os
import signal
import socket
import socketserver
import subprocess
import sys
import threading
import time
from pathlib import Path

_started = time.time()
_seen = set()
_allowed = None
_registry = None


def registry():
    global _registry
    if _registry is not None:
        return _registry
    import model_tools  # noqa: F401 - native registry/plugin discovery
    from tools.registry import registry

    original = registry.dispatch

    def authorized(name, args, **kwargs):
        if _allowed is None or name not in _allowed:
            return json.dumps({"error": "CAPABILITY_DENIED", "outcome": "rejected"})
        return original(name, args, **kwargs)

    registry.dispatch = authorized
    _registry = registry
    return registry


def dispatch(request):
    import jsonschema

    tools = registry()
    entry = tools.get_entry(request["native_name"])
    if entry is None:
        return {
            "native_result": json.dumps(
                {"error": "NATIVE_TOOL_NOT_INSTALLED", "outcome": "rejected"}
            ),
            "outcome": "returned",
        }
    schema = hashlib.sha256(
        json.dumps(
            entry.schema, sort_keys=True, separators=(",", ":"), allow_nan=False
        ).encode()
    ).hexdigest()
    if schema != request["schema_hash"]:
        return {
            "native_result": json.dumps(
                {"error": "NATIVE_SCHEMA_CHANGED", "outcome": "rejected"}
            ),
            "outcome": "returned",
        }
    try:
        jsonschema.validate(request["arguments"], entry.schema["parameters"])
    except jsonschema.ValidationError:
        return {
            "native_result": json.dumps(
                {"error": "INVALID_TOOL_ARGUMENTS", "outcome": "rejected"}
            ),
            "outcome": "returned",
        }
    with contextlib.redirect_stdout(sys.stderr):
        value = tools.dispatch(
            entry.name,
            request["arguments"],
            task_id=request["task_id"],
            session_id=request["task_id"],
            enabled_tools=request["allowed_tools"],
        )
    try:
        result = json.loads(value) if isinstance(value, str) else value
    except ValueError:
        result = {}
    unknown = isinstance(result, dict) and (
        result.get("outcome") == "indeterminate"
        or (entry.name == "browser_exec" and result.get("success") is False)
    )
    return {
        "native_result": value,
        "outcome": "indeterminate" if unknown else "returned",
    }


class NativeRPC(socketserver.StreamRequestHandler):
    def handle(self):
        global _allowed
        from cryptography.exceptions import InvalidSignature
        from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

        raw = self.rfile.readline(2 * 1024 * 1024 + 1)
        if len(raw) > 2 * 1024 * 1024:
            raise ValueError("Native tool request too large")
        try:
            envelope = json.loads(raw)
            payload = envelope["payload"]
            encoded = json.dumps(
                payload, sort_keys=True, separators=(",", ":"), allow_nan=False
            ).encode()
            Ed25519PublicKey.from_public_bytes(
                bytes.fromhex(os.environ["NMA_NATIVE_VERIFY_KEY"])
            ).verify(bytes.fromhex(envelope["signature"]), encoded)
            if (
                payload["task_id"] != os.environ["NMA_NATIVE_SCOPE_KEY"]
                or not _started <= payload["issued_at"] <= time.time()
                or time.time() - payload["issued_at"] > 300
                or payload["operation_id"] in _seen
            ):
                raise ValueError(
                    "Native authorization is expired or already dispatched"
                )
            _seen.add(payload["operation_id"])
            _allowed = frozenset(payload["allowed_tools"])
            result = dispatch(payload)
        except (InvalidSignature, ValueError, KeyError, TypeError):
            result = {
                "native_result": json.dumps(
                    {"error": "ACCESS_REVOKED", "outcome": "rejected"}
                ),
                "outcome": "returned",
            }
        finally:
            _allowed = None
        self.wfile.write((json.dumps(result) + "\n").encode())


def serve():
    state = Path("/work/state")
    state.mkdir(mode=0o700, exist_ok=True)
    (state / "config.yaml").write_text(
        json.dumps(
            {
                "terminal": {"backend": "local", "cwd": "/work"},
                "browser": {"engine": "chromium", "allow_private_urls": False},
                "plugins": {"enabled": []},
            }
        )
    )
    socket_path = Path("/work/native.sock")
    socket_path.unlink(missing_ok=True)
    native = socketserver.UnixStreamServer(str(socket_path), NativeRPC)
    socket_path.chmod(0o600)
    threading.Thread(target=native.serve_forever, daemon=True).start()
    stopped = threading.Event()
    signal.signal(signal.SIGTERM, lambda *_: stopped.set())
    signal.signal(signal.SIGINT, lambda *_: stopped.set())
    with Path("/work/chromium.log").open("a") as log:
        browser = subprocess.Popen(
            [
                "chromium",
                "--headless",
                "--no-sandbox",
                "--disable-dev-shm-usage",
                "--remote-debugging-port=9222",
                "--user-data-dir=/work/chromium",
                "about:blank",
            ],
            stdout=log,
            stderr=log,
        )
        try:
            stopped.wait()
        finally:
            browser.terminate()
            browser.wait(timeout=10)
            native.shutdown()
            native.server_close()


def call():
    request = json.load(sys.stdin)
    with socket.socket(socket.AF_UNIX) as client:
        client.connect("/work/native.sock")
        client.sendall((json.dumps(request) + "\n").encode())
        with client.makefile("rb") as stream:
            raw = stream.readline(16 * 1024 * 1024 + 1)
    if len(raw) > 16 * 1024 * 1024:
        raise ValueError("Native tool response too large")
    json.loads(raw)
    sys.stdout.buffer.write(raw)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("operation", choices=("serve", "call"))
    args = parser.parse_args()
    {"serve": serve, "call": call}[args.operation]()
