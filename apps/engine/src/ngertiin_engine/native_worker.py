"""Secret-free native handler process inside the selected scoped Linux image."""

import argparse
import base64
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
_browser_session = None


def registry():
    global _registry
    if _registry is not None:
        return _registry
    import model_tools  # noqa: F401 - native registry/plugin discovery
    from tools.registry import registry

    from ngertiin_engine.coding import install

    install(worker=True)
    from ngertiin_engine.browser_supervision import install as install_supervision

    install_supervision()
    from tools import vision_tools
    from tools.computer_use import tool as computer_tool

    # This process transports observations and never calls a model. The gateway
    # owns the actual provider/image routing and receives native image envelopes.
    vision_tools._should_use_native_vision_fast_path = lambda: True
    computer_tool._should_route_through_aux_vision = lambda: False
    from tools.process_registry import process_registry

    process_registry.recover_from_checkpoint()

    original = registry.dispatch

    def authorized(name, args, **kwargs):
        if _allowed is None or name not in _allowed:
            return json.dumps({"error": "CAPABILITY_DENIED", "outcome": "rejected"})
        return original(name, args, **kwargs)

    registry.dispatch = authorized
    _registry = registry
    return registry


def jobs(task_id):
    from tools.process_registry import process_registry

    location = Path("/work/state/native-jobs.json")
    previous = json.loads(location.read_text()) if location.exists() else {}
    observed = process_registry.list_sessions(task_id=task_id, include_retained=True)
    current = {
        p["session_id"]: {"handle": p["session_id"], "state": p["status"], **p}
        for p in observed
    }
    for handle, receipt in previous.items():
        if handle not in current:
            current[handle] = {
                **receipt,
                "state": "lost" if receipt["state"] == "running" else receipt["state"],
            }
    temporary = location.with_suffix(".tmp")
    with temporary.open("w") as stream:
        json.dump(current, stream)
        stream.flush()
        os.fsync(stream.fileno())
    temporary.replace(location)
    return list(current.values())


def transfer(args):
    from ngertiin_engine.coding import path_in

    target = path_in(Path("/work"), args["path"])
    if not target.is_relative_to(Path("/work/imports")):
        raise ValueError("Imports must use the private imports directory")
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_name(target.name + ".upload")
    data = base64.b64decode(args["data_base64"], validate=True)
    offset, size = args["offset"], args["byte_count"]
    if (
        type(offset) is not int
        or type(size) is not int
        or not 0 <= offset <= size <= 33554432
        or len(data) > 524288
        or offset + len(data) > size
    ):
        raise ValueError("Invalid import chunk")
    if target.exists():
        if hashlib.sha256(target.read_bytes()).hexdigest() != args["sha256"]:
            raise ValueError("Immutable import conflicts with an edited file")
        return {"path": str(target), "ready": True}
    with temporary.open("r+b" if temporary.exists() else "w+b") as stream:
        stream.seek(0, 2)
        length = stream.tell()
        if offset > length:
            raise ValueError("Import is missing an earlier chunk")
        stream.seek(offset)
        previous = stream.read(len(data))
        if previous and previous != data:
            raise ValueError("Import retry body changed")
        stream.seek(offset)
        stream.write(data)
        stream.flush()
        os.fsync(stream.fileno())
    ready = temporary.stat().st_size == size
    if ready:
        if hashlib.sha256(temporary.read_bytes()).hexdigest() != args["sha256"]:
            raise ValueError("Import hash mismatch")
        temporary.replace(target)
        if args.get("executable") is True:
            target.chmod(0o700)
    return {"path": str(target), "ready": ready}


def dispatch(request):
    global _browser_session
    import jsonschema

    tools = registry()
    if request["native_name"] in {"_nma_screen", "_nma_page"}:
        if (
            request["native_name"] not in request["allowed_tools"]
            or request["schema_hash"] != "nma.screen.v1"
        ):
            raise ValueError("Invalid screen authorization")
        from ngertiin_engine.desktop_worker import page, screen

        value = (
            screen(request["arguments"], request["task_id"], _browser_session)
            if request["native_name"] == "_nma_screen"
            else page(request["arguments"], request["task_id"])
        )
        return {"native_result": json.dumps(value), "outcome": "returned"}
    if request["native_name"] in {"_nma_file", "_nma_status", "_nma_reference"}:
        if (
            request["native_name"] not in request["allowed_tools"]
            or request["schema_hash"] != "nma.workspace.v1"
        ):
            raise ValueError("Invalid internal workspace authorization")
        if request["native_name"] == "_nma_file":
            value = transfer(request["arguments"])
        elif request["native_name"] == "_nma_reference":
            from ngertiin_engine.coding import reference

            value = reference(
                request["arguments"], request["task_id"], request["allowed_tools"]
            )
        else:
            value = {"processes": jobs(request["task_id"])}
        return {
            "native_result": json.dumps(value),
            "outcome": "returned",
            "jobs": jobs(request["task_id"]),
        }
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
        if entry.name in {"browser_exec", "execute_code"}:
            source = request["arguments"].get("code", "")
            if source:
                compile(source, "<native-tool>", "exec")
    except (jsonschema.ValidationError, SyntaxError) as exc:
        return {
            "native_result": json.dumps(
                {
                    "error": "INVALID_TOOL_ARGUMENTS",
                    "detail": str(exc)[:1000],
                    "outcome": "rejected",
                    "dispatched": False,
                }
            ),
            "outcome": "returned",
        }
    with contextlib.redirect_stdout(sys.stderr):
        from ngertiin_engine.coding import prepare

        prepare(request["task_id"])
        from ngertiin_engine.coding import after_edit, before_edit

        before_edit(entry.name)
        from tools.approval import _lock, _session_approved, approve_session
        from tools.approval_context import (
            reset_current_session_key,
            set_current_session_key,
        )

        approval_token = set_current_session_key(request["task_id"])
        try:
            if entry.name == "computer_use":
                mode = request["arguments"].get("delivery_mode", "background")
                # Map the authenticated product grant to ONE native action,
                # then clear it. Native hard checks and standard Cua mode stay.
                approve_session(
                    request["task_id"],
                    "cua:" + request["arguments"]["action"] + ":" + mode,
                )
            arguments = request["arguments"]
            if entry.name == "browser_exec":
                from ngertiin_engine.browser_load import PREAMBLE

                arguments = {**arguments, "code": PREAMBLE + arguments["code"]}
            value = tools.dispatch(
                entry.name,
                arguments,
                task_id=request["task_id"],
                session_id=request["task_id"],
                enabled_tools=request["allowed_tools"],
            )
        finally:
            # clear_session also destroys native capture/driver/kernel state.
            # Expire the one-call approval without ending the Hermes session.
            with _lock:
                _session_approved.pop(request["task_id"], None)
            reset_current_session_key(approval_token)
        after_edit(entry.name, request["arguments"])
        from types import SimpleNamespace

        from agent.lsp.deferred import settle_for_agent

        notes = settle_for_agent(
            SimpleNamespace(session_id=request["task_id"]), timeout=5
        )
        if notes:
            decoded = json.loads(value) if isinstance(value, str) else value
            if isinstance(decoded, dict):
                decoded["lsp_diagnostics"] = "\n".join(text for _, text in notes)
                value = json.dumps(decoded)
    try:
        result = json.loads(value) if isinstance(value, str) else value
    except ValueError:
        result = {}
    if (
        entry.name == "browser_exec"
        and isinstance(result, dict)
        and (result.get("success") or result.get("_multimodal"))
    ):
        _browser_session = request["arguments"].get("session", "")
    if (
        entry.name == "coding"
        and request["arguments"].get("action") == "inspect"
        and isinstance(result, dict)
    ):
        result["processes"] = jobs(request["task_id"])
        value = json.dumps(result)
    from ngertiin_engine.outcomes import failed

    unknown = isinstance(result, dict) and (
        result.get("outcome") == "indeterminate"
        or (
            entry.name
            in {"browser_exec", "browser_cdp", "browser_dialog", "computer_use"}
            and failed(result)
        )
    )
    return {
        "native_result": value,
        "outcome": "indeterminate" if unknown else "returned",
        "jobs": jobs(request["task_id"]),
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
    desktop = bool(os.environ.get("DISPLAY"))
    (state / "config.yaml").write_text(
        json.dumps(
            {
                "terminal": {"backend": "local", "cwd": "/work"},
                "browser": {
                    "engine": "chromium",
                    "allow_private_urls": False,
                    "cdp_url": "http://127.0.0.1:9222",
                },
                "computer_use": {"permission_mode": "standard", "no_overlay": True},
                "plugins": {"enabled": []},
                "lsp": {
                    "enabled": True,
                    "install_strategy": "manual",
                    "wait_timeout": 5,
                    "warmup_timeout": 15,
                    "trusted_workspaces": [],
                },
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
    display_processes = []
    if desktop:
        from ngertiin_engine.desktop_worker import start

        display_processes = start()
    # The supervisor has exclusive volume ownership and retires the old container
    # before starting this process. SIGKILL can leave Chromium's hostname/PID
    # singleton symlinks behind; they are not live browser or user file state.
    for name in ("SingletonLock", "SingletonSocket", "SingletonCookie"):
        (Path("/work/chromium") / name).unlink(missing_ok=True)
    with Path("/work/chromium.log").open("a") as log:
        browser = subprocess.Popen(
            [
                "chromium",
                *([] if desktop else ["--headless"]),
                "--no-sandbox",
                "--disable-dev-shm-usage",
                # Match upstream browser_launcher._PACKAGED_ONLY_FLAGS for this
                # fresh isolated profile; no host keychain is mounted here.
                "--password-store=basic",
                *(
                    ["--proxy-server=" + os.environ["NMA_BROWSER_PROXY"]]
                    if os.environ.get("NMA_BROWSER_PROXY")
                    else []
                ),
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
            from ngertiin_engine.desktop_worker import stop_browser

            stop_browser(browser)
            native.shutdown()
            native.server_close()
            for process in reversed(display_processes):
                process.terminate()
                process.wait(timeout=10)


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
