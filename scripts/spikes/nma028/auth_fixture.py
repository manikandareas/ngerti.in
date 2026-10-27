"""Real Clerk development sessions and isolated PostgreSQL for live acceptance.

Run with the backend interpreter. Private state contains JWT/database secrets and
must never be published. No email/phone identifier or outbound message is used.
"""

import argparse
import json
import os
import socket
import subprocess
import time
from pathlib import Path
from urllib.request import urlopen
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[3]


def save(path, value):
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2) + "\n")
    path.chmod(0o600)


def client():
    from clerk_backend_api import Clerk
    from ngertiin.config import get_settings

    key = get_settings().clerk_secret_key.get_secret_value()
    if not key.startswith("sk_test_"):
        raise ValueError("Disposable acceptance requires a Clerk development instance")
    return Clerk(bearer_auth=key)


def prepare(path):
    import psycopg
    from alembic import command
    from alembic.config import Config
    from ngertiin.config import get_settings
    from ngertiin.db import get_engine
    from psycopg import sql
    from sqlalchemy.engine import make_url

    if path.exists():
        raise ValueError("Refusing to overwrite a disposable identity ledger")
    state = {"identities": [], "database": "nma028_" + uuid4().hex[:12]}
    admin = make_url(get_settings().database_url.get_secret_value()).set(
        drivername="postgresql"
    )
    if admin.host not in {"127.0.0.1", "localhost"}:
        raise ValueError(
            "This fixture only creates a database on the configured local server"
        )
    state["admin_url"] = admin.render_as_string(hide_password=False)
    state["database_url"] = admin.set(database=state["database"]).render_as_string(
        hide_password=False
    )
    state["registry"] = str(path.with_name("partitions.json").resolve())
    save(path, state)
    c = client()
    for index in range(2):
        user = c.users.create(
            external_id="nma028-disposable-" + uuid4().hex,
            username="nma028_" + uuid4().hex[:16],
            skip_password_requirement=True,
            skip_user_requirement=True,
            private_metadata={
                "purpose": "NMA-028 disposable acceptance",
                "index": index,
            },
            retries=None,
            timeout_ms=15000,
        )
        state["identities"].append({"user_id": user.id})
        save(path, state)
        session = c.sessions.create(
            request={"user_id": user.id}, retries=None, timeout_ms=15000
        )
        state["identities"][-1]["session_id"] = session.id
        save(path, state)
    with psycopg.connect(state["admin_url"], autocommit=True) as connection:
        connection.execute(
            sql.SQL("CREATE DATABASE {}").format(sql.Identifier(state["database"]))
        )
    state["database_created"] = True
    save(path, state)
    os.environ["DATABASE_URL"] = state["database_url"]
    get_settings.cache_clear()
    get_engine.cache_clear()
    command.upgrade(Config(str(ROOT / "apps/backend/alembic.ini")), "head")
    save(Path(state["registry"]), {})
    print(
        "Prepared two real Clerk development identities and an isolated migrated database."
    )


def start_api(path):
    state = json.loads(path.read_text())
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    log = path.with_name("authenticated-api.log").open("w")
    env = dict(
        os.environ,
        DATABASE_URL=state["database_url"],
        NMA_PARTITIONS_FILE=state["registry"],
        WEB_ORIGIN=os.environ.get("NMA_ACCEPTANCE_WEB_ORIGIN", "http://127.0.0.1:3028"),
        PYTHONPATH=str(ROOT / "apps/backend/src"),
    )
    process = subprocess.Popen(
        [
            str(ROOT / "apps/backend/.venv/bin/python"),
            "-m",
            "uvicorn",
            "ngertiin.api.app:app",
            "--host",
            "127.0.0.1",
            "--port",
            str(port),
            "--timeout-graceful-shutdown",
            "2",
            "--log-level",
            "error",
        ],
        env=env,
        stdout=log,
        stderr=log,
        start_new_session=True,
    )
    state.update(api_pid=process.pid, base=f"http://127.0.0.1:{port}")
    save(path, state)
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline and process.poll() is None:
        try:
            with urlopen(state["base"] + "/health/live", timeout=2):
                break
        except OSError:
            time.sleep(0.1)
    else:
        raise RuntimeError("Authenticated API did not start; inspect the private log")
    print(
        "Disposable production API ready. Complete ClerkJS browser sign-in to verify authentication and owner mapping."
    )


def cleanup(path):
    import signal

    import psycopg
    from psycopg import sql

    state = json.loads(path.read_text())
    c = client()
    results = []
    if state.get("api_pid"):
        try:
            os.kill(state["api_pid"], signal.SIGTERM)
        except ProcessLookupError:
            pass
    for identity in state["identities"]:
        if identity.get("session_id"):
            c.sessions.revoke(
                session_id=identity["session_id"], retries=None, timeout_ms=15000
            )
        deleted = c.users.delete(
            user_id=identity["user_id"], retries=None, timeout_ms=15000
        )
        results.append({"user_id": identity["user_id"], "deleted": deleted.deleted})
    if state.get("database_created"):
        with psycopg.connect(state["admin_url"], autocommit=True) as connection:
            connection.execute(
                sql.SQL("DROP DATABASE {} WITH (FORCE)").format(
                    sql.Identifier(state["database"])
                )
            )
    state["cleanup"] = {
        "identities": results,
        "database_dropped": state.get("database_created", False),
    }
    for identity in state["identities"]:
        identity.pop("jwt", None)
    save(path, state)
    print("Deleted only the recorded disposable Clerk identities/database.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("operation", choices=["prepare", "start", "cleanup"])
    parser.add_argument("--state", type=Path, required=True)
    args = parser.parse_args()
    if args.operation == "prepare":
        prepare(args.state.resolve())
    elif args.operation == "start":
        start_api(args.state.resolve())
    elif args.operation == "cleanup":
        cleanup(args.state.resolve())
