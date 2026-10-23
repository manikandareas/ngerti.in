"""Record source provenance and installed distribution license metadata for this spike."""

from __future__ import annotations

import argparse
import ast
import hashlib
import json
import platform
from importlib import metadata
from pathlib import Path

import tomllib

REVISION = "7489b22af47ce91b366dde81d5831ea422577498"
MODULES = {
    "run_agent.py": "Agent facade; execution remains upstream",
    "agent/turn_facade.py": "Conversation entry point and turn loop delegation",
    "agent/prompt_builder.py": "Profile SOUL, skills and context composition",
    "hermes_cli/profiles.py": "Profile creation and persistent home resolution",
    "hermes_state.py": "SQLite session storage facade",
    "hermes_state_runtime.py": "Runtime epochs and durable admission",
    "gateway/run.py": "Ordinary gateway process and lifecycle",
    "gateway/session_authority.py": "Canonical session execution authority",
    "gateway/session_hosted_service.py": "Canonical room ownership and member authorization",
    "gateway/session_hosted_members.py": "Served/configured member roster",
    "gateway/session_hosted_rpc.py": "Canonical member admission and receipts",
    "gateway/session_hosted_transport.py": "Cross-profile owner transport",
    "gateway/hosted_rooms.py": "Durable room identity and event log",
    "gateway/hosted_room_driver.py": "Task leases, generations, stop and recovery",
    "gateway/hosted_room_discussion.py": "Deterministic mentions and next-turn policy",
    "tui_gateway/hosted_room_service.py": "Shared room coordinator base",
    "tui_gateway/hosted_room_driver.py": "Transport-independent room worker",
    "tui_gateway/hosted_room_server_rpc.py": "Legacy in-process adapter; not native authority",
    "tools/skills_tool.py": "Skill discovery and content access; not exercised live",
    "tools/mcp_tool_registration.py": "MCP discovery and registration; not exercised live",
    "hermes_cli/goals.py": "Explicit session goal behavior; not automatic capture proof",
    "gateway/run_goals.py": "Goal continuation; not exercised live",
    "cron/scheduler.py": "Schedule runner; not exercised live",
    "tests/gateway/fixtures/local_recovery_probe.py": "Imported native daemon/socket probe helpers",
    "tests/gateway/test_normal_runtime_boot.py": "Imported bootstrap control-socket helper",
    "tests/gateway/test_session_hosted_daemon.py": "Executed native daemon restart/crash contracts",
}


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    source = args.source.resolve()
    project = tomllib.loads((source / "pyproject.toml").read_text(encoding="utf-8"))
    modules = []
    for name, responsibility in MODULES.items():
        path = source / name
        tree = ast.parse(path.read_text(encoding="utf-8"))
        imports = set()
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                imports.update(alias.name for alias in node.names)
            elif isinstance(node, ast.ImportFrom) and node.module:
                imports.add(node.module)
        modules.append(
            {
                "path": name,
                "responsibility": responsibility,
                "sha256": digest(path),
                "imports": sorted(imports),
                "url": f"https://github.com/NousResearch/hermes-agent/blob/{REVISION}/{name}",
            }
        )
    packages = []
    for dist in sorted(
        metadata.distributions(), key=lambda d: d.metadata["Name"].lower()
    ):
        meta = dist.metadata
        notices = []
        for entry in dist.files or []:
            if any(
                word in str(entry).lower() for word in ("license", "notice", "copying")
            ):
                path = Path(dist.locate_file(entry))
                if path.is_file():
                    notices.append({"path": str(entry), "sha256": digest(path)})
        packages.append(
            {
                "name": meta["Name"],
                "version": dist.version,
                "license_expression": meta.get("License-Expression"),
                "license": meta.get("License"),
                "license_classifiers": [
                    c for c in meta.get_all("Classifier", []) if c.startswith("License")
                ],
                "license_files": notices,
                "requires": meta.get_all("Requires-Dist", []),
            }
        )
    notices = []
    for path in sorted(source.rglob("*")):
        if any(part.startswith(".") for part in path.relative_to(source).parts):
            continue
        if path.is_file() and path.name.upper().split(".")[0] in {
            "LICENSE",
            "NOTICE",
            "COPYING",
        }:
            notices.append(
                {
                    "path": str(path.relative_to(source)),
                    "sha256": digest(path),
                    "opening": path.read_text(
                        encoding="utf-8", errors="replace"
                    ).splitlines()[:8],
                }
            )
    result = {
        "revision": REVISION,
        "python": platform.python_version(),
        "platform": platform.platform(),
        "pyproject_sha256": digest(source / "pyproject.toml"),
        "lock_sha256": digest(source / "uv.lock"),
        "modules": modules,
        "source_notices": notices,
        "declared_core": project["project"]["dependencies"],
        "declared_optional": project["project"].get("optional-dependencies", {}),
        "declared_development": project.get("dependency-groups", {}),
        "installed_distributions": packages,
        "scope": "Metadata inventory, not redistribution clearance. Not all extras were installed.",
    }
    args.output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(
        f"Recorded {len(modules)} modules, {len(notices)} source notices "
        f"and {len(packages)} distributions"
    )


if __name__ == "__main__":
    main()
