"""Inventory the exact installed verification runtime and its packaged notices."""

import hashlib
import json
import platform
import sqlite3
from importlib import metadata
from pathlib import Path

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
    packages.append(
        {
            "name": distribution.metadata["Name"],
            "version": distribution.version,
            "license_expression": distribution.metadata.get("License-Expression"),
            "license": distribution.metadata.get("License"),
            "notices": notices,
        }
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
