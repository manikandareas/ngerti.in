"""Build the foundation dependency profile from the unchanged Hermes lock."""

import argparse
import hashlib
import json
import re
import sys
import tempfile
import tomllib
from pathlib import Path

EXCLUDED = {"browser-harness", "fetch-use", "pillow-heif"}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--tests", action="store_true")
    args = parser.parse_args()
    source = args.source.resolve()
    sys.path.insert(0, str(source))
    import pm

    pin = json.loads(
        (Path(__file__).parent / "src/ngertiin_engine/runtime-pin.json").read_text()
    )
    for name in ("pyproject.toml", "uv.lock", "pm/lock.json"):
        if (
            hashlib.sha256((source / name).read_bytes()).hexdigest()
            != pin["source_hashes"][name]
        ):
            raise ValueError(f"Unreviewed upstream input: {name}")
    with tempfile.TemporaryDirectory() as directory:
        export = Path(directory) / "requirements.txt"
        pm.export_requirements(source, export, extras=["acp", "mcp"], explicit=True)
        lines = export.read_text().splitlines()
    requirements = [
        line for line in lines if re.split(r"[=\[; ]", line)[0] not in EXCLUDED
    ]
    if args.tests:
        lock = tomllib.loads((source / "uv.lock").read_text())
        # Test-only packages are selected from the same upstream lock, not latest PyPI.
        for name in (
            "pytest",
            "iniconfig",
            "pluggy",
            "pytest-asyncio",
            "anthropic",
            "docstring-parser",
        ):
            versions = {p["version"] for p in lock["package"] if p["name"] == name}
            if len(versions) != 1:
                raise ValueError(f"Ambiguous test dependency: {name}")
            requirements.append(f"{name}=={versions.pop()}")
    executable = pm.build_requirements_environment(
        requirements, out=args.out.resolve(), lock=source / "uv.lock", explicit=True
    )
    (args.out / "foundation-profile.json").write_text(
        json.dumps(
            {
                "upstream_revision": pin["revision"],
                "upstream_lock_sha256": pin["source_hashes"]["uv.lock"],
                "excluded": sorted(EXCLUDED),
                "test_dependencies": args.tests,
                "requirements": requirements,
            },
            indent=2,
        )
        + "\n"
    )
    print(executable)


if __name__ == "__main__":
    main()
