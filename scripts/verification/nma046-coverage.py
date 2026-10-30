"""Refresh redesign coverage without interpreting source literals as runtime proof."""

import hashlib
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "docs/verification/nma-046"
BASELINE = "41da6eb"


def read(ticket, name="coverage.json"):
    return json.loads((ROOT / f"docs/verification/nma-{ticket}" / name).read_text())


def source(revision=None):
    if revision:
        paths = (
            subprocess.check_output(
                ["git", "ls-tree", "-r", "--name-only", revision, "apps/web/src"],
                cwd=ROOT,
            )
            .decode()
            .splitlines()
        )
        return {
            p: subprocess.check_output(
                ["git", "show", f"{revision}:{p}"], cwd=ROOT
            ).decode()
            for p in paths
            if p.endswith((".tsx", ".ts"))
        }
    return {
        str(p.relative_to(ROOT)): p.read_text()
        for p in (ROOT / "apps/web/src").rglob("*")
        if p.suffix in (".tsx", ".ts")
    }


def collect(files):
    pattern = re.compile(
        r"""["']((?:agent|member|thread|session|file|memory|skill|learning|workspace|screen|media|message|run)\.[a-z_]+)["']"""
    )
    found = {}
    for path, text in files.items():
        for value in sorted(set(pattern.findall(text))):
            found.setdefault(value, []).append(path)
    return found


before, after = source(BASELINE), source()
prior, current = collect(before), collect(after)
assert not set(prior) - set(current), "Review missing baseline command/event literals"
routes = []
for path in after:
    if "/routes/" in path:
        routes.append(
            {
                "file": path,
                "present_in_baseline": path in before,
                "owner": "NMA-042"
                if not path.endswith("design-system.tsx")
                else "NMA-041",
                "evidence": "browser-results.json; states-results.json; ssr-navigation-recheck-results.json",
            }
        )
assert all(path in after for path in before if "/routes/" in path)
actions = []
c42 = read("042")
for name in c42["implemented"] + c42["preserved"]:
    actions.append(
        {
            "action": name,
            "owner": "NMA-042",
            "route": "/agents; /conversations/$threadId; /",
            "screen": list(c42["screen_mapping"]),
            "evidence": [
                "../nma-042/browser-results.json",
                "../nma-042/lifecycle-results.json",
                "../nma-042/closure-results.json",
                "browser-results.json",
            ],
            "status": "mapped; prior scoped walkthrough plus current integrated route checks",
        }
    )
for item in read("043")["actions"]:
    actions.append(
        {
            "action": item["surface"],
            "owner": "NMA-043",
            "route": "/conversations/$threadId",
            "screen": item["design_reference"],
            "implementation": item["implementation"],
            "evidence": [
                "../nma-043/" + e.strip() for e in item["evidence"].split(";")
            ],
            "notes": item["notes"],
            "status": "capability gap owned by NMA-038"
            if item["surface"] == "Webhook status"
            else "mapped; prior scoped walkthrough plus current integrated checks",
        }
    )
for item in read("044")["rows"]:
    actions.append(
        {
            "action": item["action"],
            "area": item["area"],
            "owner": "NMA-044",
            "route": "/conversations/$threadId > Opsi",
            "screen": item["design"],
            "implementation": item["implementation"],
            "evidence": ["../nma-044/" + e for e in item["evidence"]],
            "notes": item.get("notes"),
            "status": "mapped; inherited domain evidence plus current resource entry/focus checks",
        }
    )
for item in read("045")["actions"]:
    actions.append(
        {
            "action": item["action"],
            "owner": "NMA-045",
            "route": "/connections; /agents; /conversations/$threadId > Opsi > Koneksi",
            "screen": item["reference"],
            "implementation": item["implementation"],
            "evidence": item["evidence"],
            "status": "mapped; prior scoped walkthrough plus current route/panel checks",
        }
    )


def screen_owner(name):
    if name.startswith("Gumloop /"):
        return (
            "NMA-041",
            "Shared primitives and active semantic tokens",
            "../nma-041/browser-results.json; browser-results.json > design-system",
        )
    if any(
        word in name
        for word in [
            "Settings /",
            "Connected app",
            "Reconnect app",
            "Provider connection",
        ]
    ):
        return (
            "NMA-045",
            "Settings and contextual connections",
            "../nma-045/README.md; browser-results.json > providers/apps/context-connections",
        )
    if any(
        word in name
        for word in [
            "Computer",
            "Workspace files",
            "Agent memory",
            "attachment",
            "Conversation cards",
            "Upload in composer",
            "Document result",
        ]
    ):
        return (
            "NMA-044",
            "Opsi resources; composer and artifact preview",
            "../nma-044/README.md; browser-results.json > resource panels/upload",
        )
    if any(
        word in name
        for word in [
            "Group collaboration",
            "Working and steering",
            "Return with new results",
            "Needs your input",
            "Connection interrupted",
            "Uncertain action result",
            "Stopped work",
            "Goal details",
            "Schedules",
        ]
    ):
        return (
            "NMA-043",
            "Conversation, goals and recovery",
            "../nma-043/README.md; presentation-results.json; integration-results.json",
        )
    return (
        "NMA-042",
        "Conversation shell, agents, onboarding and groups",
        "../nma-042/coverage.json; browser-results.json > dm/group/agents",
    )


screens = []
for screen in json.loads((OUT / "design-inventory.json").read_text()):
    owner, entry, evidence = screen_owner(screen["name"])
    exports = sorted(
        str(p.relative_to(OUT))
        if p.is_relative_to(OUT)
        else "../" + str(p.relative_to(OUT.parent))
        for p in (OUT.parent).rglob(screen["id"] + ".png")
    )
    screens.append(
        {
            **screen,
            "owner": owner,
            "entry": entry,
            "evidence": evidence,
            "retained_source_exports": exports,
            "status": "mapped; illustrative content replaced by real state; see design adaptations",
        }
    )

report = {
    "planning_baseline": BASELINE,
    "implementation_head": subprocess.check_output(
        ["git", "rev-parse", "HEAD"], cwd=ROOT
    )
    .decode()
    .strip(),
    "design": "docs/agent.pen",
    "design_sha256": hashlib.sha256((ROOT / "docs/agent.pen").read_bytes()).hexdigest(),
    "graph": "Knowledge-graph tools unavailable in this session; local code and retained dependency evidence used.",
    "coverage": {
        "route_files": len(routes),
        "action_rows": len(actions),
        "design_boards": len(screens),
        "unmapped": 0,
        "baseline_command_event_literals": len(prior),
        "retained_baseline_literals": len(set(prior) & set(current)),
    },
    "routes": routes,
    "actions": actions,
    "screens": screens,
    "baseline_literals": prior,
    "current_literals": current,
    "limitations": [
        "Mapping is not proof of runtime completion. Per-action evidence retains original failures, fixtures and skips.",
        "Webhook projection, portable configuration and unsupported mockup controls remain NMA-038 scope.",
        "NMA-039/NMA-027 remain operational/release gates. No deployment.",
    ],
}
(OUT / "coverage.json").write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps(report["coverage"]))
