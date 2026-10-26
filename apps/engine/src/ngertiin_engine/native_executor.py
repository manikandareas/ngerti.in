"""Scoped Linux tool supervisor adopted from the verified NMA-028 placement seam.

Hermes retains admission and execution. This module supervises only isolated native
handlers and their durable receipts. Model and control credentials stay outside
containers. Source provenance: scripts/spikes/nma028/isolated_tools.py, same repo.
"""

import contextlib
import fcntl
import hashlib
import json
import os
import re
import sqlite3
import subprocess
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from uuid import UUID, uuid4

DEFAULT_IMAGE = "ngertiin-native-tools:local"


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
        from cryptography.hazmat.primitives import serialization
        from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

        self.owner = str(UUID(owner_id))
        self.control_dir = Path(control_dir).resolve()
        self.control_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
        self.database = self.control_dir / "isolated-tools.db"
        key_path = self.control_dir / "request-signing.key"
        try:
            descriptor = os.open(key_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        except FileExistsError:
            pass
        else:
            with os.fdopen(descriptor, "wb") as stream:
                stream.write(
                    Ed25519PrivateKey.generate().private_bytes(
                        serialization.Encoding.Raw,
                        serialization.PrivateFormat.Raw,
                        serialization.NoEncryption(),
                    )
                )
        self.signing_key = Ed25519PrivateKey.from_private_bytes(key_path.read_bytes())
        self.public_key = (
            self.signing_key.public_key()
            .public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)
            .hex()
        )
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
        self.label = "nma-native.controller=" + self.controller

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
                container = "nma-native-" + self.controller[:8] + "-" + key[:16]
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
                    "nma-native.scope=" + key,
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
                    labels.get("nma-native.controller") != self.controller
                    or labels.get("nma-native.scope") != key
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
                    "nma-native.scope=" + key,
                    "--network",
                    "none",
                    "--env",
                    "NMA_NATIVE_VERIFY_KEY=" + self.public_key,
                    "--env",
                    "NMA_NATIVE_SCOPE_KEY=" + key,
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
                    or labels.get("nma-native.controller") != self.controller
                    or labels.get("nma-native.scope") != key
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

    def invoke(
        self,
        scope,
        operation_id,
        native_name,
        arguments,
        *,
        schema_hash,
        allowed_tools,
        timeout=90,
    ):
        key = self._scope(scope)
        with self._execution_lock(key):
            return self._invoke(
                scope,
                operation_id,
                native_name,
                arguments,
                schema_hash=schema_hash,
                allowed_tools=allowed_tools,
                timeout=timeout,
            )

    def _invoke(
        self,
        scope,
        operation_id,
        native_name,
        arguments,
        *,
        schema_hash,
        allowed_tools,
        timeout=90,
    ):
        key = self._scope(scope)
        if not isinstance(native_name, str) or not isinstance(arguments, dict):
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
                        return json.loads(previous[3])["result"]
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
        payload = {
            "native_name": native_name,
            "arguments": arguments,
            "task_id": key,
            "schema_hash": schema_hash,
            "allowed_tools": sorted(allowed_tools),
            "operation_id": operation_id,
            "issued_at": time.time(),
        }
        encoded = json.dumps(
            payload, sort_keys=True, separators=(",", ":"), allow_nan=False
        ).encode()
        request = json.dumps(
            {"payload": payload, "signature": self.signing_key.sign(encoded).hex()}
        )
        try:
            executed = self._docker(
                "exec",
                "-i",
                target["container"],
                "/opt/native/bin/python",
                "/opt/engine/ngertiin_engine/native_worker.py",
                "call",
                input=request,
                timeout=timeout,
                check=False,
            )
            if executed.returncode:
                raise UnknownOutcome("Native process ended without a receipt")
            envelope = json.loads(executed.stdout)
            value = envelope["native_result"]
            if not isinstance(value, (str, dict)):
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
                    (
                        outcome,
                        json.dumps({"result": value}),
                        time.time(),
                        key,
                        operation_id,
                    ),
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
            labels.get("nma-native.controller") != self.controller
            or labels.get("nma-native.scope") != key
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
