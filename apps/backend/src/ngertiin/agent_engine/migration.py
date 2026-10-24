"""Explicit account migration plan; historical work is preserved, never re-executed.

Run plan before cutover with a read-only database transaction. Apply the saved plan
only after backing up PostgreSQL, objects and the destination owner partition.
An uncertain apply is retried with the same saved command identity.
"""

import argparse
import asyncio
import json
import os
from pathlib import Path
from uuid import UUID, uuid5

import psycopg
from psycopg.rows import dict_row

from ngertiin.agent_engine.api import forward
from ngertiin.config import get_settings


def plan(owner: str, profile: dict | None, model: str):
    owner = str(UUID(owner))
    profile = profile or {"name": "Assistant", "soul": "", "revision": 0}
    return {
        "format": 1,
        "owner_id": owner,
        "source_profile_revision": profile["revision"],
        "historical_data": {
            "transcripts": "Preserve original IDs/order; no synthetic Hermes sessions",
            "goals": "Preserve revisions/status/evidence; no automatic activation",
            "schedules": "Preserve definitions/receipts; retired workers must remain stopped",
            "memory": "Preserve source exclusions/tombstones; do not import into group context",
            "artifacts": "Preserve immutable object bytes/keys/hashes and producing history",
            "active_work": "Quarantine old jobs/checkpoints; never replay unknown external effects",
        },
        "command": {
            "schema_version": "nma.v1",
            "command_id": str(uuid5(UUID(owner), "default-agent-migration-v1")),
            "type": "agent.create",
            "expected_revision": None,
            "payload": {
                "display_name": profile["name"],
                "handle": "default-assistant",
                "config": {"soul": profile["soul"], "instructions": "", "model": model},
            },
        },
    }


def save(path: Path, value):
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w") as stream:
        json.dump(value, stream, indent=2)
        stream.write("\n")
        stream.flush()
        os.fsync(stream.fileno())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="action", required=True)
    preview = sub.add_parser("plan")
    preview.add_argument("--owner", required=True)
    preview.add_argument("--model", required=True)
    preview.add_argument("--output", type=Path, required=True)
    apply = sub.add_parser("apply")
    apply.add_argument("plan", type=Path)
    apply.add_argument("--receipt", type=Path, required=True)
    args = parser.parse_args()
    if args.action == "plan":
        owner = str(UUID(args.owner))
        with psycopg.connect(
            get_settings().database_url.get_secret_value(), row_factory=dict_row
        ) as db:
            db.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
            if not db.execute("SELECT id FROM accounts WHERE id=%s", (owner,)).fetchone():
                raise ValueError("Account does not exist")
            profile = db.execute(
                "SELECT name,soul,revision FROM agent_profiles WHERE owner_id=%s", (owner,)
            ).fetchone()
            result = plan(owner, profile, args.model)
            counts = {}
            for table in ("chat_threads", "chat_runs", "user_goals", "product_files"):
                row = db.execute(
                    f"SELECT count(*) AS n FROM {table} WHERE owner_id=%s", (owner,)
                ).fetchone()
                assert row is not None
                counts[table] = row["n"]
            result["source_counts"] = counts
        save(args.output, result)
        print("Migration plan saved; no data or execution state changed.")
    else:
        if args.receipt.exists():
            raise ValueError("Receipt path already exists; inspect the stored result")
        result = json.loads(args.plan.read_text())
        if result["format"] != 1 or result["command"]["type"] != "agent.create":
            raise ValueError("Unsupported migration plan")
        receipt = asyncio.run(forward(str(UUID(result["owner_id"])), result["command"]))
        save(
            args.receipt,
            {
                "owner_id": result["owner_id"],
                "command_id": result["command"]["command_id"],
                "result": receipt,
            },
        )
        print("Default-agent mapping saved. Historical work remains inactive.")


if __name__ == "__main__":
    main()
