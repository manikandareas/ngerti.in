"""Provision and supervise explicitly selected local account gateways."""

import fcntl
import hashlib
import json
import os
import secrets
import signal
import subprocess
import sys
import time
from pathlib import Path
from uuid import UUID

from dotenv import dotenv_values
from ngertiin.config import get_settings
from ngertiin.db import get_engine
from sqlalchemy import text

ROOT = Path(__file__).resolve().parents[1]


def write_private(path, content):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    temporary = path.with_suffix(path.suffix + ".tmp")
    with open(temporary, "w", opener=lambda p, flags: os.open(p, flags, 0o600)) as file:
        file.write(json.dumps(content, indent=2) + "\n")
    temporary.replace(path)


def prepare():
    if get_settings().app_env != "development":
        raise ValueError("Local gateway provisioning requires APP_ENV=development")
    env = {k: v for k, v in dotenv_values(ROOT / ".env").items() if v is not None}
    env.update(os.environ)
    owners = [
        str(UUID(value)) for value in json.loads(env.get("NMA_DEV_OWNER_IDS", "[]"))
    ]
    if not owners or len(owners) != len(set(owners)):
        raise ValueError(
            "Set NMA_DEV_OWNER_IDS to a non-empty JSON array of account UUIDs"
        )
    source = Path(env.get("HERMES_SOURCE", ROOT / ".dev/nma-001/source")).resolve()
    python = Path(
        env.get(
            "NMA_RUNTIME_PYTHON", ROOT / ".dev/nma-006-closure/production/bin/python"
        )
    ).absolute()
    if not python.is_file() or not (source / "gateway/run.py").is_file():
        raise ValueError(
            "Pinned runtime missing; configure HERMES_SOURCE and NMA_RUNTIME_PYTHON (apps/engine/README.md)"
        )
    if not env.get("OPENAI_API_KEY") or not env.get("OPENAI_MODEL"):
        raise ValueError(
            "OPENAI_API_KEY and OPENAI_MODEL are required for local gateways"
        )
    registry_name = env.get("NMA_PARTITIONS_FILE")
    if not registry_name:
        raise ValueError(
            "NMA_PARTITIONS_FILE is required; use .dev/engine/partitions.json"
        )
    registry = Path(registry_name).resolve()
    mappings = json.loads(registry.read_text()) if registry.exists() else {}
    root = (
        Path.home() / ".ngertiin" / hashlib.sha256(str(ROOT).encode()).hexdigest()[:8]
    )
    commands = []
    with get_engine().connect() as connection:
        for owner in owners:
            if not connection.execute(
                text("SELECT 1 FROM accounts WHERE id=:owner"), {"owner": owner}
            ).scalar():
                raise ValueError(f"Account {owner} does not exist; sign in first")
            home = root / owner
            home.mkdir(parents=True, exist_ok=True, mode=0o700)
            key = home / "service.key"
            socket = home / "nma.sock"
            if len(str(socket).encode()) >= 104:
                raise ValueError("Local gateway socket path exceeds the macOS limit")
            entry = {"socket": str(socket), "key_file": str(key)}
            if owner in mappings and mappings[owner] != entry:
                raise ValueError(
                    f"Account {owner} already has an external partition; refusing replacement"
                )
            if not key.exists():
                with open(
                    key, "xb", opener=lambda p, flags: os.open(p, flags, 0o600)
                ) as file:
                    file.write(secrets.token_bytes(32))
            workspace = home / "workspace"
            workspace.mkdir(exist_ok=True, mode=0o700)
            model = {
                "provider": "custom",
                "default": env["OPENAI_MODEL"],
                "base_url": env.get("OPENAI_BASE_URL", "https://api.openai.com/v1"),
            }
            write_private(
                home / "models.json",
                {
                    "default": {
                        "label": env["OPENAI_MODEL"],
                        "model": model["default"],
                        "provider": model["provider"],
                        "base_url": model["base_url"],
                        "cwd": str(workspace),
                    }
                },
            )
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
                    "tool_grants": {
                        "files": {
                            "enabled": True,
                            "label": "Files",
                            "toolset": "nma_workspace",
                        },
                        "browser": {
                            "enabled": bool(env.get("E2B_API_KEY")),
                            "label": "Browser",
                            "toolset": "nma_computer",
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
                "PYTHONPATH": os.pathsep.join(
                    [str(ROOT / "apps/engine/src"), str(source)]
                ),
                "PYTHONUNBUFFERED": "1",
                "NMA_OWNER_ID": owner,
                "NMA_MODELS_FILE": str(home / "models.json"),
                "NMA_CAPABILITIES_FILE": str(home / "capabilities.json"),
                "NMA_SERVICE_KEY_FILE": str(key),
                "NMA_COMPUTER_COMMAND": json.dumps(
                    [sys.executable, "-m", "ngertiin.agent_engine.computer_bridge"]
                ),
            }
            for name in (
                "NMA_BINDINGS_FILE",
                "NMA_WEBHOOK_ROUTES_FILE",
                "NMA_TEST_FAULT",
                "NMA_TEST_MARKER",
            ):
                child.pop(name, None)
            commands.append(
                (owner, [str(python), "-m", "ngertiin_engine.service"], child)
            )
            mappings[owner] = entry
    write_private(registry, mappings)
    return commands


def main():
    lock_path = ROOT / ".dev/engine/dev.lock"
    lock_path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    lock = lock_path.open("a")
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        lock.close()
        raise RuntimeError("Local engine supervisor is already running") from None
    processes = []
    stopping = False

    def stop(*_):
        nonlocal stopping
        stopping = True

    signal.signal(signal.SIGINT, stop)
    signal.signal(signal.SIGTERM, stop)
    try:
        for owner, command, env in prepare():
            process = subprocess.Popen(command, cwd=ROOT, env=env)
            processes.append(process)
            print(f"Starting local engine for account {owner}", flush=True)
        while not stopping:
            for process in processes:
                if process.poll() is not None:
                    raise RuntimeError(
                        "A local gateway exited; stopping development engines"
                    )
            time.sleep(0.3)
    finally:
        for process in processes:
            if process.poll() is None:
                process.terminate()
        for process in processes:
            try:
                process.wait(timeout=25)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
        lock.close()


if __name__ == "__main__":
    main()
