"""Read-only provenance and capability inventory for the native adoption spike."""

import argparse
import hashlib
import importlib.metadata
import json
import platform
import re
import sqlite3
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
EVIDENCE = ROOT / "docs/research/evidence/nma-028"
PROTOCOL = Path(__file__).with_name("protocol.json")


def sha(data):
    return hashlib.sha256(data).hexdigest()


def save(path, value):
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n")


def capture(source, output):
    """Hash paths and bytes, never publish file contents or environment secrets."""
    paths = (
        subprocess.check_output(
            ["git", "ls-files", "-z", "--cached", "--others", "--exclude-standard"],
            cwd=ROOT,
        )
        .decode()
        .split("\0")
    )
    files = {}
    for name in sorted(set(paths) - {""}):
        # Generated evidence cannot be part of its own input digest.
        if name.startswith("docs/research/evidence/nma-028/"):
            continue
        path = ROOT / name
        if path.is_file():
            files[name] = {
                "sha256": sha(path.read_bytes()),
                "size": path.stat().st_size,
            }
        else:
            files[name] = {"missing": True}
    pin = json.loads(
        (ROOT / "apps/engine/src/ngertiin_engine/runtime-pin.json").read_text()
    )
    source_files = {
        name: sha((source / name).read_bytes()) for name in pin["source_hashes"]
    }
    if source_files != pin["source_hashes"]:
        raise ValueError("Runtime source does not match the actual application pin")
    value = {
        "git_revision": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT)
        .decode()
        .strip(),
        "working_tree_sha256": sha(json.dumps(files, sort_keys=True).encode()),
        "files": files,
        "protocol_sha256": sha(PROTOCOL.read_bytes()),
        "runtime_pin": pin,
        "verified_source_hashes": source_files,
        "python": platform.python_version(),
        "sqlite": sqlite3.sqlite_version,
        "platform": platform.platform(),
        "dependencies": sorted(
            [
                {"name": d.metadata["Name"], "version": d.version}
                for d in importlib.metadata.distributions()
            ],
            key=lambda d: d["name"].lower(),
        ),
        "configuration": "Only whitelisted model/provider/tool settings are recorded per attempt; no environment-file contents.",
    }
    save(output, value)


def coverage(source, output):
    inventory = (
        ROOT / "docs/research/hermes-feature-inventory-2026-10-24.md"
    ).read_text()
    first = inventory.split("## Catalog and channel completeness notes")[0]
    references = dict(re.findall(r"^\[([^\]]+)\]:\s*(\S+)", inventory, re.MULTILINE))
    source_rows = {}
    for line in first.splitlines():
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) == 5 and re.fullmatch(r"[MSWCVAPNUO]\d{2}", cells[0]):
            source_rows[cells[0]] = cells
    plan = (EVIDENCE / "notion-plan-snapshot.md").read_text()
    plan_rows = {}
    for line in plan.splitlines():
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) == 5 and cells[0] in source_rows:
            plan_rows[cells[0]] = cells
    if len(source_rows) != 106 or source_rows.keys() != plan_rows.keys():
        raise ValueError("The complete 106-family Notion/source inventory is required")
    proposed_owners = {
        "V08": "NMA-037",
        "P03": "NMA-030",
        "U10": "NMA-038",
        "U11": "NMA-038",
        "O03": "NMA-030",
        "O04": "NMA-030",
        "O05": "NMA-038",
        "O06": "NMA-030",
    }
    expanded = {
        "M01": [
            "remember",
            "patch MEMORY.md and USER.md",
            "forget",
            "retain provenance",
        ],
        "M02": ["full-text search", "time-filter", "browse session", "scroll messages"],
        "S01": [
            "list",
            "search",
            "load SKILL.md",
            "read reference",
            "execute scoped script",
        ],
        "S02": ["create", "update", "patch", "delete"],
        "S04": ["discover", "install", "update", "reset", "preserve local edits"],
        "S06": ["record usage", "review", "consolidate", "archive", "restore"],
        "W04": [
            "navigate",
            "click",
            "fill",
            "inspect DOM",
            "scrape",
            "screenshot",
            "download",
            "reconnect",
        ],
        "W05": ["raw CDP command", "accept dialog", "dismiss dialog", "answer prompt"],
        "W06": [
            "save login",
            "fill login",
            "fill OTP",
            "fill address",
            "fill card",
            "redact secret egress",
        ],
        "W07": [
            "list applications",
            "read accessibility tree",
            "screenshot",
            "click",
            "type",
            "scroll",
            "drag",
        ],
        "W08": [
            "view screen",
            "take over",
            "release lease",
            "resume agent after observation",
        ],
        "C01": [
            "read",
            "page",
            "search",
            "write",
            "patch",
            "reject conflicting writes",
        ],
        "C02": [
            "extract notebook",
            "extract DOCX",
            "extract XLSX",
            "preview SQLite schema",
            "extract PDF",
        ],
        "C04": [
            "start",
            "poll",
            "stream",
            "write stdin",
            "wait",
            "kill",
            "completion notification",
        ],
        "C05": ["execute Python", "call tool via RPC", "persistent kernel", "cancel"],
        "C07": ["checkpoint", "diff", "restore all", "restore file"],
        "C08": ["create worktree", "inspect unfinished work", "clean stale worktree"],
        "A01": [
            "delegate",
            "parallel children",
            "scoped tools/context",
            "collect result",
        ],
        "A02": [
            "monitor",
            "steer",
            "interrupt",
            "inspect transcript",
            "async completion",
        ],
        "A03": [
            "structured output",
            "model override",
            "provider override",
            "nesting",
            "worktree",
        ],
        "A04": [
            "create task",
            "dependency",
            "attempt",
            "attachment",
            "board projection",
        ],
        "A05": ["request review", "request changes", "block", "unblock", "handoff"],
        "A06": [
            "create",
            "edit",
            "pause",
            "resume",
            "trigger",
            "once",
            "calendar cron",
            "delivery",
        ],
        "A07": ["script-only job", "chain result to next job"],
        "A10": [
            "automatic capture",
            "correct same goal",
            "judge",
            "subgoal",
            "continue",
            "stop",
        ],
        "P07": [
            "configure inference failover",
            "classify fault",
            "switch provider",
            "retain one executor",
        ],
        "P08": ["credential pool", "rotate key", "revoke key", "redact"],
        "P11": [
            "temperature",
            "top_p",
            "reasoning effort",
            "context length",
            "service tier",
        ],
        "N11": [
            "search",
            "playback",
            "queue",
            "devices",
            "playlists",
            "library",
            "history",
        ],
        "N12": [
            "discover",
            "connect OAuth",
            "reconnect",
            "name account",
            "choose account",
            "revoke",
        ],
        "O01": ["stdio", "streamable HTTP", "SSE where supported"],
        "O02": [
            "filter",
            "reload",
            "sampling",
            "elicitation",
            "mTLS",
            "identity headers",
            "cost",
            "experimental events",
        ],
        "O07": ["discover reviewed package", "install", "activate", "update", "remove"],
        "O08": ["observe event", "transform middleware", "signed outbound hook"],
        "O09": [
            "memory",
            "context",
            "model",
            "search",
            "image",
            "video",
            "browser",
            "delegation",
            "terminal",
            "secret source",
        ],
        "O10": [
            "import configuration",
            "import history read-only",
            "export without secrets",
            "Git distribution",
            "update",
        ],
        "O11": [
            "JSONL batch",
            "isolated environment",
            "checkpoint",
            "resume",
            "quality filter",
            "trajectory export",
        ],
        "O12": ["usage", "diagnostics", "trace", "latency", "failure attribution"],
        "O13": [
            "partition",
            "managed config",
            "egress",
            "secret source",
            "doctor",
            "upgrade",
            "restore",
        ],
        "O15": [
            "search catalog",
            "load schema",
            "dispatch selected tool",
            "revoke deferred access",
        ],
    }
    rows = []
    for ident, cells in source_rows.items():
        planned = plan_rows[ident]
        owner_url = re.search(r"https://app.notion.com/p/[a-f0-9]+", planned[3]).group()
        refs = re.findall(r"\[([^\]]+)\]", cells[4])
        rows.append(
            {
                "id": ident,
                "name": cells[1],
                "disposition": planned[2],
                "owner_url": owner_url,
                "decision_owner": proposed_owners.get(ident),
                "decision_status": "Assigned for implementation/design; not approved as an exclusion"
                if ident in proposed_owners
                else "As recorded in Notion",
                "operations": expanded.get(
                    ident,
                    [
                        p.strip().rstrip(".")
                        for p in re.split(r"; |, and | and |, ", cells[2])
                        if p.strip()
                    ],
                ),
                "operation_reference": cells[2],
                "prerequisites": cells[3],
                "scope": planned[4],
                "source_urls": [references[r] for r in refs if r in references],
                "verification": "open; inventory is not feature acceptance",
            }
        )
    skills = []
    sys.path.insert(0, str(source))
    from hermes_yaml import YAMLError, safe_load

    for folder in ("skills", "optional-skills"):
        for path in sorted((source / folder).rglob("SKILL.md")):
            content = path.read_text()
            metadata, parse_error = {}, None
            if content.startswith("---\n"):
                try:
                    metadata = safe_load(content.split("---", 2)[1]) or {}
                except YAMLError as error:
                    parse_error = type(error).__name__
            requirement_sections = re.findall(
                r"^## (?:Prerequisites|Requirements|Setup|Installation)[^\n]*\n(.*?)(?=^## |\Z)",
                content,
                re.MULTILINE | re.DOTALL,
            )
            skills.append(
                {
                    "path": str(path.relative_to(source)),
                    "sha256": sha(path.read_bytes()),
                    "name": metadata.get("name", path.parent.name),
                    "description": metadata.get("description"),
                    "platforms": metadata.get("platforms"),
                    "declared_prerequisites": metadata.get("prerequisites"),
                    "requirement_sections": requirement_sections,
                    "declared_license": metadata.get("license"),
                    "metadata_parse_error": parse_error,
                    "source_url": "https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/"
                    + str(path.relative_to(source)),
                    "family": "S07" if folder == "skills" else "S08",
                    "owner": "NMA-034",
                    "status": "requires per-workflow prerequisite and live verification",
                }
            )
    save(
        output,
        {
            "upstream_revision": json.loads(PROTOCOL.read_text())["upstream_revision"],
            "selected_new_pin": None,
            "pin_decision": "Retain verified current pin for baseline; packaging remains a release blocker, not a hidden exclusion.",
            "families": rows,
            "skills": skills,
            "connectors": {
                "selected": [],
                "owner": "NMA-033",
                "status": "No connector configuration selected by this spike; each selected operation needs its own manifest before acceptance.",
            },
            "proposed_exclusions": "All eight have subsequent implementation/design owners. None is silently accepted as excluded.",
        },
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=["capture", "coverage"])
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    {"capture": capture, "coverage": coverage}[args.mode](
        args.source.resolve(), args.output
    )
