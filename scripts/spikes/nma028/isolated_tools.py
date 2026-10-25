"""Versioned spike seam: Hermes dispatches native tools into a scoped container.

The supervisor has the Docker handle and durable operation journal. The sandbox
has only its own workspace, native tool modules, Chromium and a synthetic fixture.
It receives no model route key, owner control database or signing credential.
This is a tool executor, not another model, admission or scheduling authority.
"""

import argparse
import contextlib
import fcntl
import hashlib
import json
import os
import re
import signal
import socket
import socketserver
import sqlite3
import subprocess
import sys
import threading
import time
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs
from uuid import UUID, uuid4

DEFAULT_IMAGE = "ngertiin-nma028-isolated:local"
TOOLS = {"browser_exec", "terminal", "read_file", "write_file", "search_files", "patch"}
CSV = b"name,total\nsynthetic,42\n"
FIXTURE_URL = "http://127.0.0.1:8765"


class ScopeRefused(ValueError):
    pass


class OperationConflict(ValueError):
    pass


class UnknownOutcome(RuntimeError):
    pass


@dataclass(frozen=True)
class Scope:
    owner_id: str
    agent_id: str
    thread_id: str
    generation: int = 1

    def __post_init__(self):
        for value in (self.owner_id, self.agent_id, self.thread_id):
            if str(UUID(value)) != value:
                raise ScopeRefused("Noncanonical scope identity")
        if type(self.generation) is not int or self.generation < 1:
            raise ScopeRefused("Invalid scope generation")

    @property
    def key(self):
        return hashlib.sha256(
            json.dumps(self.__dict__, sort_keys=True).encode()
        ).hexdigest()


class IsolatedTools:
    def __init__(self, control_dir, owner_id, *, image=DEFAULT_IMAGE):
        self.owner = str(UUID(owner_id))
        self.control_dir = Path(control_dir).resolve()
        self.control_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
        self.database = self.control_dir / "isolated-tools.db"
        self.lock = threading.RLock()
        self.image = self._docker(
            "image", "inspect", image, "--format", "{{.Id}}"
        ).strip()
        with self._db() as db:
            db.executescript("""
CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS scopes (scope_key TEXT PRIMARY KEY,scope_json TEXT NOT NULL,container TEXT NOT NULL,volume TEXT NOT NULL,state TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS operations (scope_key TEXT NOT NULL,operation_id TEXT NOT NULL,tool TEXT NOT NULL,args_hash TEXT NOT NULL,state TEXT NOT NULL,result TEXT,started REAL NOT NULL,finished REAL,PRIMARY KEY(scope_key,operation_id));
""")
            existing = db.execute(
                "SELECT value FROM metadata WHERE key='owner'"
            ).fetchone()
            if existing and existing[0] != self.owner:
                raise ScopeRefused("Supervisor directory belongs to a different owner")
            db.execute(
                "INSERT OR IGNORE INTO metadata VALUES ('owner',?)", (self.owner,)
            )
            db.execute(
                "INSERT OR IGNORE INTO metadata VALUES ('controller',?)",
                (str(uuid4()),),
            )
            self.controller = db.execute(
                "SELECT value FROM metadata WHERE key='controller'"
            ).fetchone()[0]
        self.label = "nma028.controller=" + self.controller

    @contextlib.contextmanager
    def _db(self):
        db = sqlite3.connect(self.database, timeout=30)
        db.execute("PRAGMA journal_mode=WAL")
        try:
            with db:
                yield db
        finally:
            db.close()

    @staticmethod
    def _docker(*args, timeout=60, input=None, check=True):
        result = subprocess.run(
            ["docker", *args],
            input=input,
            text=True,
            capture_output=True,
            timeout=timeout,
            check=False,
        )
        if check and result.returncode:
            raise RuntimeError("Docker operation failed: " + result.stderr[:1000])
        return result.stdout if check else result

    def _scope(self, scope):
        if scope.owner_id != self.owner:
            raise ScopeRefused("Foreign owner scope refused")
        return scope.key

    def ensure(self, scope):
        key = self._scope(scope)
        with self.lock:
            with self._db() as db:
                row = db.execute(
                    "SELECT container,volume,state FROM scopes WHERE scope_key=?",
                    (key,),
                ).fetchone()
                if row and row[2] not in {"allocating", "ready", "paused"}:
                    raise ScopeRefused("Scope is cancelled or has an unknown effect")
                container = "nma028-" + self.controller[:8] + "-" + key[:16]
                volume = container + "-work"
                if not row:
                    db.execute(
                        "INSERT INTO scopes VALUES (?,?,?,?,?)",
                        (
                            key,
                            json.dumps(scope.__dict__, sort_keys=True),
                            container,
                            volume,
                            "allocating",
                        ),
                    )
            volume_info = self._docker("volume", "inspect", volume, check=False)
            if volume_info.returncode:
                with self._db() as db:
                    current_state = db.execute(
                        "SELECT state FROM scopes WHERE scope_key=?", (key,)
                    ).fetchone()[0]
                    if current_state != "allocating":
                        db.execute(
                            "UPDATE scopes SET state='recovery_required' WHERE scope_key=?",
                            (key,),
                        )
                if current_state != "allocating":
                    raise ScopeRefused(
                        "Existing workspace missing; empty replacement refused"
                    )
                self._docker(
                    "volume",
                    "create",
                    "--label",
                    self.label,
                    "--label",
                    "nma028.scope=" + key,
                    volume,
                )
                self._docker(
                    "run",
                    "--rm",
                    "--network",
                    "none",
                    "--read-only",
                    "--cap-drop",
                    "ALL",
                    "--cap-add",
                    "CHOWN",
                    "--cap-add",
                    "FOWNER",
                    "--security-opt",
                    "no-new-privileges",
                    "--user",
                    "0",
                    "--mount",
                    "type=volume,src=" + volume + ",dst=/work",
                    "--entrypoint",
                    "/opt/native/bin/python",
                    self.image,
                    "-c",
                    "import os;os.chmod('/work',0o700);os.chown('/work',10001,10001)",
                )
            else:
                labels = json.loads(volume_info.stdout)[0].get("Labels") or {}
                if (
                    labels.get("nma028.controller") != self.controller
                    or labels.get("nma028.scope") != key
                ):
                    raise ScopeRefused("Unowned workspace volume refused")
            inspect = self._docker("inspect", container, check=False)
            if inspect.returncode:
                self._docker(
                    "create",
                    "--name",
                    container,
                    "--label",
                    self.label,
                    "--label",
                    "nma028.scope=" + key,
                    "--network",
                    "none",
                    "--read-only",
                    "--cap-drop",
                    "ALL",
                    "--security-opt",
                    "no-new-privileges",
                    "--pids-limit",
                    "512",
                    "--memory",
                    "2g",
                    "--cpus",
                    "2",
                    "--shm-size",
                    "512m",
                    "--mount",
                    "type=volume,src=" + volume + ",dst=/work",
                    "--tmpfs",
                    "/tmp:mode=1777",
                    "--tmpfs",
                    "/home/probe:uid=10001,gid=10001,mode=700",
                    self.image,
                )
            else:
                item = json.loads(inspect.stdout)[0]
                labels = item["Config"].get("Labels") or {}
                if (
                    item["Image"] != self.image
                    or labels.get("nma028.controller") != self.controller
                    or labels.get("nma028.scope") != key
                ):
                    raise ScopeRefused("Unowned or unreviewed container refused")
            self._docker("start", container)
            deadline = time.monotonic() + 30
            while time.monotonic() < deadline:
                ready = self._docker(
                    "exec",
                    container,
                    "/opt/native/bin/python",
                    "-c",
                    "from urllib.request import urlopen; from pathlib import Path;import json;json.load(urlopen('http://127.0.0.1:9222/json/version',timeout=1));assert Path('/work/native.sock').is_socket()",
                    check=False,
                )
                if ready.returncode == 0:
                    with self._db() as db:
                        db.execute(
                            "UPDATE scopes SET state='ready' WHERE scope_key=?", (key,)
                        )
                    return {
                        "container": container,
                        "volume": volume,
                        "scope_key": key,
                        "fixture_url": FIXTURE_URL,
                    }
                time.sleep(0.1)
            raise RuntimeError("Isolated native environment failed readiness")

    @contextlib.contextmanager
    def _execution_lock(self, key):
        # The controller-only OS lock survives supervisor re-instantiation and
        # serializes native batches in one scope without blocking cancellation.
        with (self.control_dir / (key + ".lock")).open("a+") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            try:
                yield
            finally:
                fcntl.flock(lock, fcntl.LOCK_UN)

    def invoke(self, scope, operation_id, native_name, arguments, *, timeout=90):
        key = self._scope(scope)
        with self._execution_lock(key):
            return self._invoke(
                scope, operation_id, native_name, arguments, timeout=timeout
            )

    def _invoke(self, scope, operation_id, native_name, arguments, *, timeout=90):
        key = self._scope(scope)
        if native_name not in TOOLS or not isinstance(arguments, dict):
            raise ScopeRefused("Unsupported native tool")
        if not isinstance(operation_id, str) or not re.fullmatch(
            r"[A-Za-z0-9_.:-]{1,200}", operation_id
        ):
            raise ScopeRefused("Invalid operation identity")
        if "task_id" in arguments or "session_id" in arguments:
            raise ScopeRefused("Native scope cannot be supplied by the model")
        args_hash = hashlib.sha256(
            json.dumps(
                arguments, sort_keys=True, separators=(",", ":"), allow_nan=False
            ).encode()
        ).hexdigest()
        with self.lock:
            with self._db() as db:
                previous = db.execute(
                    "SELECT tool,args_hash,state,result FROM operations WHERE scope_key=? AND operation_id=?",
                    (key, operation_id),
                ).fetchone()
                if previous:
                    if previous[:2] != (native_name, args_hash):
                        raise OperationConflict("Operation body changed")
                    if previous[3] is not None:
                        return previous[3]
                    raise UnknownOutcome("Operation already dispatched; replay refused")
            target = self.ensure(scope)
            with self._db() as db:
                db.execute(
                    "INSERT INTO operations VALUES (?,?,?,?,?,?,?,NULL)",
                    (
                        key,
                        operation_id,
                        native_name,
                        args_hash,
                        "dispatching",
                        None,
                        time.time(),
                    ),
                )
        request = json.dumps(
            {"native_name": native_name, "arguments": arguments, "task_id": key}
        )
        try:
            executed = self._docker(
                "exec",
                "-i",
                target["container"],
                "/opt/native/bin/python",
                "/probe/isolated_tools.py",
                "call",
                input=request,
                timeout=timeout,
                check=False,
            )
            if executed.returncode:
                raise UnknownOutcome("Native process ended without a receipt")
            envelope = json.loads(executed.stdout)
            value = envelope["native_result"]
            if not isinstance(value, str):
                raise TypeError("Invalid native result")
            outcome = envelope["outcome"]
        except (
            subprocess.TimeoutExpired,
            UnknownOutcome,
            ValueError,
            TypeError,
            KeyError,
        ) as error:
            with self.lock, self._db() as db:
                db.execute(
                    "UPDATE operations SET state='indeterminate',finished=? WHERE scope_key=? AND operation_id=?",
                    (time.time(), key, operation_id),
                )
                db.execute(
                    "UPDATE scopes SET state='uncertain' WHERE scope_key=? AND state='ready'",
                    (key,),
                )
            self._docker("rm", "--force", target["container"], check=False)
            raise UnknownOutcome(
                "Unknown native outcome; no automatic replay"
            ) from error
        fenced = False
        with self.lock, self._db() as db:
            state = db.execute(
                "SELECT state FROM scopes WHERE scope_key=?", (key,)
            ).fetchone()[0]
            if state != "ready":
                db.execute(
                    "UPDATE operations SET state='indeterminate',finished=? WHERE scope_key=? AND operation_id=?",
                    (time.time(), key, operation_id),
                )
                db.execute(
                    "UPDATE scopes SET state='uncertain' WHERE scope_key=? AND state='paused'",
                    (key,),
                )
                fenced = True
            else:
                db.execute(
                    "UPDATE operations SET state=?,result=?,finished=? WHERE scope_key=? AND operation_id=?",
                    (outcome, value, time.time(), key, operation_id),
                )
                if outcome == "indeterminate":
                    db.execute(
                        "UPDATE scopes SET state='uncertain' WHERE scope_key=?", (key,)
                    )
        if fenced:
            self._docker("rm", "--force", target["container"], check=False)
            raise UnknownOutcome("Scope cancelled during native dispatch")
        if outcome == "indeterminate":
            self._docker("rm", "--force", target["container"], check=False)
        return value

    def receipt(self, scope, operation_id):
        key = self._scope(scope)
        with self._db() as db:
            db.row_factory = sqlite3.Row
            row = db.execute(
                "SELECT * FROM operations WHERE scope_key=? AND operation_id=?",
                (key, operation_id),
            ).fetchone()
            return dict(row) if row else None

    def _read_volume(self, scope, code, *arguments):
        key = self._scope(scope)
        with self._db() as db:
            row = db.execute(
                "SELECT volume FROM scopes WHERE scope_key=?", (key,)
            ).fetchone()
            if not row:
                raise ScopeRefused("Unknown scope")
        volume_info = self._docker("volume", "inspect", row[0], check=False)
        if volume_info.returncode:
            with self._db() as db:
                db.execute(
                    "UPDATE scopes SET state='recovery_required' WHERE scope_key=? AND state IN ('ready','paused')",
                    (key,),
                )
            raise ScopeRefused(
                "Existing workspace missing; readonly observation cannot recreate it"
            )
        labels = json.loads(volume_info.stdout)[0].get("Labels") or {}
        if (
            labels.get("nma028.controller") != self.controller
            or labels.get("nma028.scope") != key
        ):
            raise ScopeRefused("Unowned workspace observation refused")
        return self._docker(
            "run",
            "--rm",
            "--network",
            "none",
            "--read-only",
            "--cap-drop",
            "ALL",
            "--security-opt",
            "no-new-privileges",
            "--user",
            "10001",
            "--mount",
            "type=volume,src=" + row[0] + ",dst=/work,readonly",
            "--entrypoint",
            "/opt/native/bin/python",
            self.image,
            "-c",
            code,
            *arguments,
        )

    def inspect(self, scope):
        """Supervisor-owned observation of scope bytes, with no model code."""
        code = """import hashlib,json
from pathlib import Path
work=Path('/work')
ledger=work/'fixture-ledger.jsonl'
files=[]
for path in sorted(work.rglob('*')):
 if path.is_file() and path.resolve().is_relative_to(work) and not path.is_relative_to(work/'chromium') and not path.is_relative_to(work/'state') and not path.is_relative_to(work/'harness'):
  files.append({'path':str(path.relative_to(work)),'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
print(json.dumps({'ledger':[json.loads(line) for line in ledger.read_text().splitlines()] if ledger.exists() else [],'files':files}))"""
        return json.loads(self._read_volume(scope, code))

    def file_bytes(self, scope, relative_path):
        """Export one scoped file for a trusted artifact publisher, bounded to 1 MiB."""
        import base64

        if (
            not isinstance(relative_path, str)
            or relative_path.startswith("/")
            or ".." in Path(relative_path).parts
            or "\x00" in relative_path
        ):
            raise ScopeRefused("Invalid scoped file path")
        code = """import base64,sys
from pathlib import Path
root=Path('/work')
path=(root/sys.argv[1]).resolve()
if not path.is_relative_to(root) or not path.is_file() or path.stat().st_size>1048576:raise ValueError('Invalid scoped artifact')
print(base64.b64encode(path.read_bytes()).decode())"""
        return base64.b64decode(
            self._read_volume(scope, code, relative_path).strip(), validate=True
        )

    def cancel(self, scope):
        key = self._scope(scope)
        with self.lock, self._db() as db:
            row = db.execute(
                "SELECT container FROM scopes WHERE scope_key=?", (key,)
            ).fetchone()
            if not row:
                return {"cancelled": False}
            db.execute("UPDATE scopes SET state='cancelled' WHERE scope_key=?", (key,))
            db.execute(
                "UPDATE operations SET state='indeterminate',finished=? WHERE scope_key=? AND state='dispatching'",
                (time.time(), key),
            )
        self._docker("rm", "--force", row[0], check=False)
        return {"cancelled": True, "scope_key": key}

    def pause(self, scope):
        """Retire an idle tool process while preserving its volume and receipts."""
        key = self._scope(scope)
        with self._execution_lock(key):
            return self._pause(scope)

    def _pause(self, scope):
        key = self._scope(scope)
        with self.lock, self._db() as db:
            row = db.execute(
                "SELECT container,state FROM scopes WHERE scope_key=?", (key,)
            ).fetchone()
            if not row:
                return {"paused": False}
            if row[1] not in {"ready", "paused"}:
                raise ScopeRefused("Only a settled ready scope can pause")
            pending = db.execute(
                "SELECT 1 FROM operations WHERE scope_key=? AND state='dispatching'",
                (key,),
            ).fetchone()
            if pending:
                raise ScopeRefused("Use cancellation for an active scope")
            db.execute("UPDATE scopes SET state='paused' WHERE scope_key=?", (key,))
        self._docker("stop", "--timeout", "3", row[0], check=False)
        return {"paused": True, "scope_key": key}

    retire = pause

    def cleanup(self):
        with self._db() as db:
            rows = db.execute("SELECT container,volume FROM scopes").fetchall()
        for container, volume in rows:
            self._docker("rm", "--force", container, check=False)
            self._docker("volume", "rm", volume, check=False)


class Fixture(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def _record(self, record):
        with (
            self.server.record_lock,
            Path("/work/fixture-ledger.jsonl").open("a") as stream,
        ):
            stream.write(json.dumps(record) + "\n")
            stream.flush()
            os.fsync(stream.fileno())

    def do_GET(self):
        self._record({"method": "GET", "path": self.path})
        if self.path == "/download.csv":
            value, kind = CSV, "text/csv"
        else:
            value = b"""<html><title>NMA028 isolated form</title><a href="/form">Continue</a><form method="POST" action="/submit"><label>Name<input name="name"></label><label>Note<input name="note"></label><button>Submit</button></form><a href="/download.csv" download="report.csv">Download CSV</a></html>"""
            kind = "text/html"
        self.send_response(200)
        self.send_header("Content-Type", kind)
        self.send_header("Content-Length", str(len(value)))
        if self.path == "/download.csv":
            self.send_header("Content-Disposition", 'attachment; filename="report.csv"')
        self.end_headers()
        self.wfile.write(value)

    def do_POST(self):
        body = self.rfile.read(int(self.headers["Content-Length"])).decode()
        self._record({"method": "POST", "path": self.path, "fields": parse_qs(body)})
        value = b'<html><title>Saved</title><p id="receipt">NMA028_SAVED</p><a href="/download.csv" download="report.csv">Download CSV</a></html>'
        self.send_response(200)
        self.send_header("Content-Type", "text/html")
        self.send_header("Content-Length", str(len(value)))
        self.end_headers()
        self.wfile.write(value)


def serve():
    state = Path("/work/state")
    state.mkdir(mode=0o700, exist_ok=True)
    Path("/work/ready").unlink(missing_ok=True)
    (state / "config.yaml").write_text(
        json.dumps(
            {
                "terminal": {"backend": "local", "cwd": "/work"},
                "browser": {"engine": "chromium", "allow_private_urls": True},
            }
        )
    )
    Path("/work/downloads").mkdir(exist_ok=True)
    server = ThreadingHTTPServer(("127.0.0.1", 8765), Fixture)
    server.record_lock = threading.Lock()
    threading.Thread(target=server.serve_forever, daemon=True).start()
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
            from urllib.request import urlopen

            deadline = time.monotonic() + 30
            while time.monotonic() < deadline:
                try:
                    with urlopen(
                        "http://127.0.0.1:9222/json/version", timeout=1
                    ) as response:
                        json.load(response)
                    Path("/work/ready").write_text("ready")
                    break
                except OSError:
                    time.sleep(0.1)
            else:
                raise RuntimeError("Chromium CDP readiness failed")
            stopped.wait()
        finally:
            browser.terminate()
            browser.wait(timeout=10)
            server.shutdown()
            native.shutdown()
            native.server_close()


def worker_dispatch(request):
    # Imports register original native handlers and their unmodified schemas.
    import tools.browser_use_cli
    import tools.file_tools
    import tools.terminal_tool  # noqa: F401
    from tools.registry import registry

    name = request["native_name"]
    if name not in TOOLS:
        raise ScopeRefused("Unsupported native tool")
    schema = registry.get_schema(name)
    import jsonschema

    jsonschema.validate(request["arguments"], schema["parameters"])
    with contextlib.redirect_stdout(sys.stderr):
        value = registry.dispatch(
            name,
            request["arguments"],
            task_id=request["task_id"],
            session_id=request["task_id"],
        )
    result = json.loads(value) if isinstance(value, str) else value
    # A returned receipt is not confirmation of an action. Unknown browser errors
    # fence the scope even when native transport returned successfully.
    unknown = (
        name == "browser_exec"
        and isinstance(result, dict)
        and (result.get("success") is False or result.get("outcome") == "indeterminate")
    )
    return {
        "native_result": value if isinstance(value, str) else json.dumps(value),
        "outcome": "indeterminate" if unknown else "returned",
    }


class NativeRPC(socketserver.StreamRequestHandler):
    def handle(self):
        raw = self.rfile.readline(2 * 1024 * 1024 + 1)
        if len(raw) > 2 * 1024 * 1024:
            raise ValueError("Native tool request too large")
        request = json.loads(raw)
        response = worker_dispatch(request)
        try:
            self.wfile.write((json.dumps(response) + "\n").encode())
        except BrokenPipeError:
            # The supervisor retains this operation as unknown and fences the
            # scope; the dispatcher never resubmits a missing acknowledgement.
            pass


def worker_call():
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
    parser.add_argument("mode", choices=["serve", "call"])
    args = parser.parse_args()
    {"serve": serve, "call": worker_call}[args.mode]()
