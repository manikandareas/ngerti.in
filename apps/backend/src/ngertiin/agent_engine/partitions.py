"""Trusted partition process provisioning, never agent execution scheduling."""

import asyncio
import fcntl
import hashlib
import json
import os
import secrets
import subprocess
import tempfile
from pathlib import Path
from uuid import UUID

from dotenv import dotenv_values
from fastapi import HTTPException

from ngertiin.agent_engine.api import forward_partition
from ngertiin.agent_engine.stream import read_command
from ngertiin.config import ROOT, get_settings


class ProvisioningError(Exception):
    def __init__(self, code):
        super().__init__(code)
        self.code = code


def write_private(path: Path, value):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    fd, name = tempfile.mkstemp(prefix=path.name + ".", dir=path.parent)
    try:
        with os.fdopen(fd, "w") as stream:
            json.dump(value, stream)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(name, path)
        descriptor = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def registry_path():
    name = os.environ.get("NMA_PARTITIONS_FILE") or get_settings().nma_partitions_file
    if not name:
        raise ProvisioningError("PARTITION_REGISTRY_REQUIRED")
    return Path(name).resolve()


def registered(owner):
    path = registry_path()
    if not path.exists():
        return None
    return json.loads(path.read_text()).get(owner)


def engine_unavailable(exc: HTTPException) -> bool:
    return isinstance(exc.detail, dict) and exc.detail.get("code") == "ENGINE_UNAVAILABLE"


def publish(owner, entry):
    path = registry_path()
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    with path.with_suffix(".lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        entries = json.loads(path.read_text()) if path.exists() else {}
        if owner in entries and entries[owner] != entry:
            raise ProvisioningError("EXTERNAL_PARTITION_CONFLICT")
        entries[owner] = entry
        write_private(path, entries)


class Partitions:
    def __init__(self):
        self.processes = {}
        self.locks = {}

    async def ensure(self, owner):
        owner = str(UUID(owner))
        entry = await asyncio.to_thread(registered, owner)
        if entry:
            try:
                await forward_partition(owner, read_command("runtime.describe", {}), entry)
                return entry
            except HTTPException as exc:
                if not engine_unavailable(exc):
                    raise
        if get_settings().app_env == "development":
            return await self.local(owner, entry)
        argv = get_settings().nma_partition_driver
        if (
            not argv
            or not all(isinstance(arg, str) for arg in argv)
            or not Path(argv[0]).is_absolute()
        ):
            raise ProvisioningError("ISOLATED_PARTITION_DRIVER_REQUIRED")
        # The operator-owned driver must idempotently supervise isolated gateways.
        # It receives only a verified UUID, never client paths or shell text.
        process = await asyncio.create_subprocess_exec(
            *argv,
            owner,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
            limit=65536,
        )
        try:
            async with asyncio.timeout(60):
                assert process.stdout is not None
                raw = bytearray()
                while len(raw) <= 65536:
                    chunk = await process.stdout.read(min(8192, 65537 - len(raw)))
                    if not chunk:
                        break
                    raw.extend(chunk)
                if len(raw) > 65536:
                    raise ProvisioningError("INVALID_PARTITION_DRIVER_RESULT")
                await process.wait()
            if process.returncode or len(raw) > 65536:
                raise ProvisioningError("PARTITION_DRIVER_FAILED")
            candidate = json.loads(raw)
            if set(candidate) != {"socket", "key_file"} or any(
                not isinstance(v, str) or not Path(v).is_absolute() for v in candidate.values()
            ):
                raise ProvisioningError("INVALID_PARTITION_DRIVER_RESULT")
            if entry and candidate != entry:
                raise ProvisioningError("EXTERNAL_PARTITION_CONFLICT")
            await forward_partition(owner, read_command("runtime.describe", {}), candidate)
            await asyncio.to_thread(publish, owner, candidate)
            return candidate
        finally:
            if process.returncode is None:
                process.kill()
                await process.wait()

    def _spawn_local(self, owner, existing):
        """Blocking filesystem and process setup; only run from a worker thread."""
        env = {k: v for k, v in dotenv_values(ROOT / ".env").items() if v is not None}
        env.update(os.environ)
        root = Path(
            env.get("NMA_STATE_ROOT")
            or (Path.home() / ".ngertiin" / hashlib.sha256(str(ROOT).encode()).hexdigest()[:8])
        ).resolve()
        home = root / owner
        entry = {"socket": str(home / "nma.sock"), "key_file": str(home / "service.key")}
        if existing and existing != entry:
            raise ProvisioningError("EXTERNAL_PARTITION_UNAVAILABLE")
        home.mkdir(parents=True, exist_ok=True, mode=0o700)
        if home.is_symlink() or home.resolve().parent != root:
            raise ProvisioningError("INVALID_PARTITION_PATH")
        if (home / "nma-restore-quarantine.json").exists():
            raise ProvisioningError("RESTORE_QUARANTINED")
        marker = home / "provisioning.json"
        state = (
            json.loads(marker.read_text())
            if marker.exists()
            else {"owner_id": owner, "ready": False}
        )
        if state["owner_id"] != owner:
            raise ProvisioningError("PARTITION_MISMATCH")
        if (state["ready"] or existing) and (
            not (home / "state.db").is_file() or not (home / "service.key").is_file()
        ):
            raise ProvisioningError("PARTITION_STATE_MISSING")
        if owner not in self.locks:
            lock = (home / "provision.lock").open("a")
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                lock.close()
                raise ProvisioningError("PARTITION_BUSY") from None
            self.locks[owner] = lock
        write_private(marker, state)
        process = self.processes.get(owner)
        if process is None or process.poll() is not None:
            argv, child = local_configuration(owner, home, env)
            with open(
                home / "gateway.log", "ab", opener=lambda p, flags: os.open(p, flags, 0o600)
            ) as log:
                process = subprocess.Popen(
                    argv, env=child, cwd=ROOT, stdout=log, stderr=subprocess.STDOUT
                )
            self.processes[owner] = process
        return entry, marker, process

    async def local(self, owner, existing):
        entry, marker, process = await asyncio.to_thread(self._spawn_local, owner, existing)
        for _ in range(120):
            if process.poll() is not None:
                raise ProvisioningError("GATEWAY_START_FAILED")
            try:
                await forward_partition(owner, read_command("runtime.describe", {}), entry)
                await asyncio.to_thread(write_private, marker, {"owner_id": owner, "ready": True})
                await asyncio.to_thread(publish, owner, entry)
                return entry
            except HTTPException as exc:
                if not engine_unavailable(exc):
                    raise
            await asyncio.sleep(0.25)
        raise ProvisioningError("GATEWAY_START_TIMEOUT")

    def close(self):
        for process in self.processes.values():
            if process.poll() is None:
                process.terminate()
        for process in self.processes.values():
            try:
                process.wait(timeout=25)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
        for lock in self.locks.values():
            lock.close()


def local_configuration(owner, home, env):
    source = Path(env.get("HERMES_SOURCE", ROOT / ".dev/nma-001/source")).resolve()
    python = Path(
        env.get("NMA_RUNTIME_PYTHON", ROOT / ".dev/nma-033/production/bin/python")
    ).absolute()
    if not python.is_file() or not (source / "gateway/run.py").is_file():
        raise ProvisioningError("PINNED_RUNTIME_REQUIRED")
    if len(str(home / "nma.sock").encode()) > 100:
        raise ProvisioningError("PARTITION_PATH_TOO_LONG")
    key = home / "service.key"
    if not key.exists():
        fd = os.open(key, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "wb") as file:
            file.write(secrets.token_bytes(32))
            file.flush()
            os.fsync(file.fileno())
    workspace = home / "workspace"
    workspace.mkdir(exist_ok=True, mode=0o700)
    model = {
        "provider": "custom",
        "default": env.get("OPENAI_MODEL", ""),
        "base_url": env.get("OPENAI_BASE_URL", "https://api.openai.com/v1"),
    }
    # Bootstrap only a new owner catalog. Durable saved connections survive restarts.
    if not (home / "models.json").exists():
        if (
            env.get("NMA_BOOTSTRAP_OWNER_ID") == owner
            and env.get("OPENAI_API_KEY")
            and env.get("OPENAI_MODEL")
        ):
            write_private(
                home / "models.json",
                {
                    "default": {
                        "label": env.get("OPENAI_MODEL", ""),
                        "model": model["default"],
                        "provider": model["provider"],
                        "base_url": model["base_url"],
                        "cwd": str(workspace),
                    }
                },
            )
        else:
            write_private(home / "models.json", {})
    write_private(
        home / "config.yaml",
        {
            "model": model,
            "platform_toolsets": {"cli": []},
            "auxiliary": {"title_generation": {"enabled": False}},
            "terminal": {"cwd": str(workspace)},
        },
    )
    write_private(
        home / "capabilities.json",
        {
            "version": 2,
            "execution_surfaces": {
                "native_children": {"kind": "scoped_delegation", "ready": True},
                "conversation": {"kind": "scoped_conversation", "ready": True},
                "native_linux": {
                    "kind": "scoped_linux",
                    "ready": bool(env.get("NMA_NATIVE_TOOLS_IMAGE")),
                    "image": env.get("NMA_NATIVE_TOOLS_IMAGE"),
                },
            },
            "tool_grants": {
                "clarification": {
                    "enabled": True,
                    "label": "Clarifying questions",
                    "toolset": "clarify",
                    "execution_surface": "conversation",
                },
                "delegation": {
                    "enabled": True,
                    "label": "Temporary assistants",
                    "toolset": "delegation",
                    "execution_surface": "native_children",
                },
                "tasks": {
                    "enabled": True,
                    "label": "Task list",
                    "toolset": "todo",
                },
                "files": {
                    "enabled": True,
                    "label": "Files",
                    "toolset": "nma_workspace",
                },
                "browser": {
                    "enabled": bool(env.get("NMA_NATIVE_TOOLS_IMAGE")),
                    "label": "Native browser",
                    "toolset": "browser",
                    "execution_surface": "native_linux",
                    "requires": ["terminal"],
                },
                "terminal": {
                    "enabled": bool(env.get("NMA_NATIVE_TOOLS_IMAGE")),
                    "label": "Isolated terminal",
                    "toolset": "terminal",
                    "execution_surface": "native_linux",
                },
                "native_files": {
                    "enabled": bool(env.get("NMA_NATIVE_TOOLS_IMAGE")),
                    "label": "Native file tools",
                    "toolset": "file",
                    "execution_surface": "native_linux",
                },
                "desktop": {
                    "enabled": bool(env.get("NMA_NATIVE_TOOLS_IMAGE")),
                    "label": "Isolated desktop",
                    "toolset": "computer_use",
                    "execution_surface": "native_linux",
                },
                "assistance": {
                    "enabled": bool(env.get("NMA_NATIVE_TOOLS_IMAGE")),
                    "label": "Screen assistance",
                    "toolset": "nma_assistance",
                    "execution_surface": "native_linux",
                },
            },
            "mcp_grants": {},
            "skill_refs": {},
        },
    )
    child = env | {
        "HERMES_SOURCE": str(source),
        "HERMES_HOME": str(home),
        "HERMES_GATEWAY_LOCK_DIR": str(home / "locks"),
        "PYTHONPATH": os.pathsep.join([str(ROOT / "apps/engine/src"), str(source)]),
        "PYTHONUNBUFFERED": "1",
        "NMA_OWNER_ID": owner,
        "NMA_MODELS_FILE": str(home / "models.json"),
        "NMA_CAPABILITIES_FILE": str(home / "capabilities.json"),
        "NMA_SERVICE_KEY_FILE": str(key),
    }
    for name in (
        "NMA_BINDINGS_FILE",
        "NMA_WEBHOOK_ROUTES_FILE",
        "NMA_TEST_FAULT",
        "NMA_TEST_MARKER",
        "NMA_COMPUTER_COMMAND",
    ):
        child.pop(name, None)
    child["NMA_DEFAULT_MODEL"] = "default"
    child["NMA_DEFAULT_GRANTS"] = json.dumps(
        {
            "tool_grants": ["tasks", "files", "clarification"]
            + (["terminal", "browser", "assistance"] if env.get("NMA_NATIVE_TOOLS_IMAGE") else [])
        }
    )
    # The local OSS ChatGPT flow is opt-in; hosted product availability is separate.
    child["NMA_CHATGPT_LOCAL_OSS"] = env.get("NMA_CHATGPT_LOCAL_OSS", "0")
    return [str(python), "-m", "ngertiin_engine.service"], child
