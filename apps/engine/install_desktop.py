"""Install the exact Hermes PM Linux driver artifact, verifying before extraction."""

import hashlib
import io
import json
import platform
import tarfile
import urllib.request
from pathlib import Path

spec = json.loads(Path("/opt/engine/native-dependencies.json").read_text())[
    "cua-driver"
]
target = "linux-arm64" if platform.machine() == "aarch64" else "linux-x64"
artifact = spec["artifacts"][target]
with urllib.request.urlopen(artifact["url"], timeout=90) as response:
    data = response.read()
assert hashlib.sha256(data).hexdigest() == artifact["sha256"], "Driver hash mismatch"
root = Path("/opt/cua")
root.mkdir()
with tarfile.open(fileobj=io.BytesIO(data)) as archive:
    archive.extractall(root, filter="data")
binary = next(root.rglob("cua-driver"))
if binary != root / "cua-driver":
    (root / "cua-driver").symlink_to(binary.relative_to(root))
binary.chmod(0o755)
