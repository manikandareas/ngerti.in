"""Build the explicit local-CDP profile from unchanged pinned native modules."""

import hashlib
import json
import sys
import tempfile
from pathlib import Path

SOURCE = Path("/opt/hermes")
sys.path.insert(0, str(SOURCE))
sys.path.insert(0, "/probe")

import pm
from packaging_resolve import PROFILE_VERSION

pin = json.loads(Path("/probe/runtime-pin.json").read_text())
for name in ("pyproject.toml", "uv.lock", "pm/lock.json"):
    if (
        hashlib.sha256((SOURCE / name).read_bytes()).hexdigest()
        != pin["source_hashes"][name]
    ):
        raise ValueError("Unreviewed upstream input: " + name)
wheel = Path("/probe/packages") / f"browser_harness-{PROFILE_VERSION}-py3-none-any.whl"
with tempfile.TemporaryDirectory() as directory:
    exported = Path(directory) / "requirements.txt"
    pm.export_requirements(SOURCE, exported, extras=["acp", "mcp"], explicit=True)
    requirements = [
        line
        for line in exported.read_text().splitlines()
        if not line.startswith(("pillow-heif==", "browser-harness==", "fetch-use=="))
    ]
requirements.append("browser-harness @ " + wheel.as_uri())
python = pm.build_requirements_environment(
    requirements, out=Path("/opt/native"), lock=SOURCE / "uv.lock", explicit=True
)
Path("/probe/profile.json").write_text(
    json.dumps(
        {
            "revision": pin["revision"],
            "requirements": requirements,
            "profile": "local-cdp-v1",
            "fetch_proxy_selected": False,
            "packaging_provenance": json.loads(
                Path("/probe/packages/packaging-local-cdp.json").read_text()
            ),
        },
        indent=2,
    )
    + "\n"
)
print(python)
