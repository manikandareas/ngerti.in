"""Build a disposable research profile; never replace the production foundation."""

import hashlib
import json
import sys
import tempfile
from pathlib import Path

source = Path("/opt/hermes")
sys.path.insert(0, str(source))
import pm

pin = json.loads(Path("/probe/runtime-pin.json").read_text())
for name in ("pyproject.toml", "uv.lock", "pm/lock.json"):
    if (
        hashlib.sha256((source / name).read_bytes()).hexdigest()
        != pin["source_hashes"][name]
    ):
        raise ValueError("Unreviewed upstream input: " + name)
with tempfile.TemporaryDirectory() as directory:
    export = Path(directory) / "requirements.txt"
    pm.export_requirements(source, export, extras=["acp", "mcp"], explicit=True)
    # HEIF is unrelated to this browser/terminal probe. No browser dependency is removed.
    requirements = [
        line
        for line in export.read_text().splitlines()
        if not line.startswith("pillow-heif==")
    ]
python = pm.build_requirements_environment(
    requirements, out=Path("/opt/native"), lock=source / "uv.lock", explicit=True
)
Path("/probe/profile.json").write_text(
    json.dumps(
        {
            "revision": pin["revision"],
            "requirements": requirements,
            "distribution_status": "research only: fetch-use 0.4.0 notice unresolved; not a releasable product image",
        },
        indent=2,
    )
)
print(python)
