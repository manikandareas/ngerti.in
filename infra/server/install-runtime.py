#!/usr/bin/env python3
"""Install exact public Linux artifacts from the reviewed architecture manifest."""

import hashlib
import json
import os
import platform
import shutil
import subprocess
import tarfile
import tempfile
import urllib.request
import zipfile
from pathlib import Path


def main():
    architecture = {"aarch64": "arm64", "x86_64": "amd64"}.get(platform.machine())
    if os.geteuid() != 0 or platform.system() != "Linux" or not architecture:
        raise SystemExit("Runtime installation requires root on Linux ARM64 or AMD64.")
    if subprocess.run(["systemctl", "is-active", "--quiet", "ngertiin.service"],
                      stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False).returncode == 0:
        raise SystemExit("Stop the declared application service before installing runtime artifacts.")
    manifest = "versions.json" if architecture == "arm64" else "versions.amd64.json"
    versions = json.loads(Path(__file__).with_name(manifest).read_text())
    prefix = Path("/opt/ngertiin")
    (prefix / "bin").mkdir(parents=True, exist_ok=True)
    # Refuse an implicit executable upgrade. Recovery must retain its previous pinned release.
    for name in ("bun", "codex", "muse"):
        binary = prefix / "bin" / name
        if binary.exists():
            observed = subprocess.check_output([str(binary), "--version"], text=True).strip()
            expected = {"bun": versions["bun"], "codex": f"codex-cli {versions['codex']}",
                        "muse": f"Muse Code 1.4.14 ({versions['muse']})"}[name]
            if observed != expected:
                raise SystemExit(f"Existing {name} differs from the pinned profile; use the upgrade runbook.")
    with tempfile.TemporaryDirectory(prefix="ngertiin-runtime-") as temporary:
        root = Path(temporary)
        for name, artifact in versions["artifacts"].items():
            path = root / name
            with urllib.request.urlopen(artifact["url"], timeout=60) as response, path.open("wb") as output:
                shutil.copyfileobj(response, output)
            with path.open("rb") as source:
                digest = hashlib.file_digest(source, "sha256").hexdigest()
            if digest != artifact["sha256"]:
                raise SystemExit(f"Refusing {name}: artifact digest differs from the pinned manifest.")
        with zipfile.ZipFile(root / "bun") as archive:
            member = "bun-linux-aarch64/bun" if architecture == "arm64" else "bun-linux-x64/bun"
            with archive.open(member) as source, (prefix / "bin/bun").open("wb") as output:
                shutil.copyfileobj(source, output)
        with tarfile.open(root / "codex") as archive:
            archive.extractall(root / "codex-tree", filter="data")
        vendor = "aarch64-unknown-linux-musl" if architecture == "arm64" else "x86_64-unknown-linux-musl"
        shutil.copytree(root / "codex-tree/package/vendor" / vendor, prefix, dirs_exist_ok=True)
        shutil.copyfile(root / "muse", prefix / "bin/muse")
        for name in ("bun", "codex", "muse"):
            (prefix / "bin" / name).chmod(0o755)
    print("Pinned runtime artifacts installed and checksum-verified.")


if __name__ == "__main__":
    main()
