"""Rehearse offline partition backup and quarantined restore without activation."""

import argparse
import hashlib
import json
import sqlite3
from contextlib import closing
from pathlib import Path

from ngertiin_engine.backup import QUARANTINE, backup, restore


def inventory(home):
    with closing(sqlite3.connect(home / "state.db")) as database:
        tables = [
            row[0]
            for row in database.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'nma_%' ORDER BY name"
            )
        ]
        result = {}
        for table in tables:
            rows = database.execute('SELECT * FROM "' + table + '"').fetchall()
            result[table] = {
                "rows": len(rows),
                "sha256": hashlib.sha256(
                    "\n".join(sorted(repr(row) for row in rows)).encode()
                ).hexdigest(),
            }
        return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--home", type=Path, required=True)
    parser.add_argument("--private", type=Path, required=True)
    parser.add_argument("--evidence", type=Path, required=True)
    args = parser.parse_args()
    args.private.mkdir(mode=0o700, parents=True, exist_ok=True)
    before = inventory(args.home)
    manifest = backup(args.home, args.private / "snapshot")
    restored = args.private / "restored"
    result = restore(args.private / "snapshot", restored, manifest["owner_id"])
    after = inventory(restored)
    assert before == after
    assert manifest["databases"] == result["databases"]
    assert (restored / QUARANTINE).exists()
    evidence = {
        "status": "passed",
        "scope": "Stopped disposable real-provider acceptance partition; no original user partition",
        "schema_version": manifest["schema_version"],
        "quarantined": True,
        "activation_attempted": False,
        "all_domain_rows_unchanged": True,
        "all_sqlite_counts_unchanged": True,
        "verified_files": len(manifest["files"]),
        "databases": result["databases"],
        "domain_tables": before,
        "external_resources": "No scoped Linux capsule in this partition. Provider relay credentials are disposable and removed by the live harness on shutdown; production secrets and external volumes require separate private backup.",
    }
    args.evidence.write_text(json.dumps(evidence, indent=2) + "\n")
    print(json.dumps({"status": "passed", "verified_files": len(manifest["files"])}))


if __name__ == "__main__":
    main()
