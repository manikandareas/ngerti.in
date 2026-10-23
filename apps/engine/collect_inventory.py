"""Inventory the exact installed verification runtime and its packaged notices."""

import argparse
import hashlib
import json
import platform
import sqlite3
from importlib import metadata
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--verify-foundation", action="store_true")
args = parser.parse_args()
supplements = Path(__file__).parent / "notices"
provenance = (
    json.loads((supplements / "provenance.json").read_text())
    if supplements.exists()
    else {}
)
packages = []
for distribution in sorted(
    metadata.distributions(), key=lambda d: d.metadata["Name"].lower()
):
    notices = []
    for entry in distribution.files or []:
        if any(word in str(entry).lower() for word in ("license", "notice", "copying")):
            file = Path(distribution.locate_file(entry))
            if file.is_file():
                notices.append(
                    {
                        "path": str(entry),
                        "sha256": hashlib.sha256(file.read_bytes()).hexdigest(),
                    }
                )
    supplement = provenance.get(distribution.metadata["Name"])
    if supplement:
        notice = supplements / supplement["notice"]
        checksum = hashlib.sha256(notice.read_bytes()).hexdigest()
        if (
            distribution.version != supplement["version"]
            or checksum != supplement["sha256"]
        ):
            raise ValueError(
                "Supplemental notice does not match the installed distribution"
            )
        notices.append(
            {"path": str(notice), "sha256": checksum, "source": supplement["source"]}
        )
    packages.append(
        {
            "name": distribution.metadata["Name"],
            "version": distribution.version,
            "license_expression": distribution.metadata.get("License-Expression"),
            "license": distribution.metadata.get("License"),
            "notices": notices,
        }
    )
if args.verify_foundation:
    excluded = {"pillow-heif", "pillow_heif", "browser-harness", "fetch-use"}
    if any(p["name"] in excluded or not p["notices"] for p in packages):
        raise ValueError(
            "Foundation packaging gate failed: excluded package or missing notice"
        )
print(
    json.dumps(
        {
            "python": platform.python_version(),
            "sqlite": sqlite3.sqlite_version,
            "system": platform.system(),
            "architecture": platform.machine(),
            "distribution_count": len(packages),
            "packages": packages,
            "missing_packaged_notices": [
                p["name"] for p in packages if not p["notices"]
            ],
        },
        indent=2,
    )
)
