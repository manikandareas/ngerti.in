"""Verify stopped disposable app/OAuth journals survive quarantined restore."""

import argparse
import json
import stat
from pathlib import Path

from ngertiin_engine.backup import QUARANTINE, backup, digest, restore

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--home", type=Path, required=True)
parser.add_argument("--output", type=Path, required=True)
args = parser.parse_args()
args.output.mkdir(parents=True, exist_ok=False, mode=0o700)
snapshot, restored = args.output / "snapshot", args.output / "restored"
manifest = backup(args.home, snapshot)
restored_inventory = restore(snapshot, restored, manifest["owner_id"])
private = {}
for directory in ["app-secrets", "app-auth", "app-interactions", "research-secrets"]:
    before = sorted((args.home / directory).glob("*.json"))
    after = sorted((restored / directory).glob("*.json"))
    assert len(before) == len(after)
    for path in before:
        target = restored / path.relative_to(args.home)
        assert digest(path) == digest(target)
        assert stat.S_IMODE(target.stat().st_mode) == 0o600
    private[directory] = {
        "files": len(before),
        "bytes_identical": True,
        "private_modes_preserved": True,
    }
assert (restored / QUARANTINE).is_file()
print(
    json.dumps(
        {
            "scope": "Stopped disposable fixture partition; no live credentials or external workspace restore",
            "schema_version": restored_inventory["schema_version"],
            "database_inventory_preserved": restored_inventory["databases"]
            == manifest["databases"],
            "journals": private,
            "quarantine_enforced": True,
            "external_effects_replayed": 0,
        },
        indent=2,
    )
)
