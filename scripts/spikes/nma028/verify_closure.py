"""Verify archived artifact bytes without starting any runtime or replaying work."""

import argparse
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]


def verify(manifest):
    value = json.loads(manifest.read_text())
    mismatches = []
    for artifact in value["artifacts"]:
        path = (ROOT / artifact["path"]).resolve()
        if not path.is_relative_to(ROOT):
            raise ValueError("Manifest artifact escapes the repository")
        if (
            not path.is_file()
            or hashlib.sha256(path.read_bytes()).hexdigest() != artifact["sha256"]
        ):
            mismatches.append(artifact["path"])
    if mismatches:
        raise ValueError("Artifact mismatch: " + ", ".join(mismatches))
    return len(value["artifacts"])


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "manifest",
        nargs="?",
        type=Path,
        default=ROOT / "docs/research/evidence/nma-028-closure/verification.json",
    )
    args = parser.parse_args()
    print(f"Verified {verify(args.manifest)} artifact hashes; no execution or replay")
