"""Inventory an already built disposable image; no credentials or user state."""

import hashlib
import importlib.metadata
import json
import platform
import sqlite3
import subprocess
from pathlib import Path

packages = []
for dist in importlib.metadata.distributions():
    notices = []
    for member in dist.files or []:
        if any(
            word in member.name.lower()
            for word in ("license", "licence", "notice", "copying")
        ):
            path = dist.locate_file(member)
            if path.is_file():
                notices.append(
                    {
                        "member": str(member),
                        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                    }
                )
    packages.append(
        {
            "name": dist.metadata["Name"],
            "version": dist.version,
            "notice_files": notices,
        }
    )
print(
    json.dumps(
        {
            "python": platform.python_version(),
            "sqlite": sqlite3.sqlite_version,
            "architecture": platform.machine(),
            "profile": json.loads(Path("/probe/profile.json").read_text()),
            "packages": sorted(packages, key=lambda p: p["name"].lower()),
            "os_packages": subprocess.check_output(
                ["dpkg-query", "-W", "-f=${Package}\t${Version}\n"]
            )
            .decode()
            .splitlines(),
            "chromium": subprocess.check_output(["chromium", "--version"])
            .decode()
            .strip(),
            "native_probe_sha256": hashlib.sha256(
                Path("/probe/native_probe.py").read_bytes()
            ).hexdigest(),
        },
        indent=2,
    )
)
