"""Read-only corpus review; never import an executor or replay an external action."""

import argparse
import collections
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/spikes/nma028"))
from plan_results import calculate, review_labels


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--batch", type=Path, action="append", required=True)
    parser.add_argument("--control", type=Path, action="append", default=[])
    parser.add_argument("--protocol", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.output.exists():
        raise FileExistsError("Retained results require a new output path")
    summary = calculate(args.batch, args.protocol, args.control)
    raw = [json.loads(line) for p in args.batch for line in p.read_text().splitlines()]
    reviewed = [review_labels(r) for r in raw]
    protocol = json.loads(args.protocol.read_text())
    limits = protocol["release_thresholds"]
    summary["task_completion_excluding_planned_stops"] = {}
    for surface in protocol["surfaces"]:
        group = [r for r in reviewed if r["surface"] == surface]
        tasks = [r for r in group if r["scenario"] != "cancellation"]
        passed = sum(r["status"] == "passed" for r in tasks)
        executed = sum(r["status"] != "blocked" for r in tasks)
        integrations = sum(r["category"] == "integration" for r in group)
        attempted_all = sum(r["status"] != "blocked" for r in group)
        summary["task_completion_excluding_planned_stops"][surface] = {
            "planned": len(tasks),
            "attempted": executed,
            "passed": passed,
            "success_per_planned": passed / len(tasks),
            "success_per_executed": passed / executed if executed else None,
            "meets_task_success_point_threshold": passed / len(tasks)
            >= limits["task_success_rate_min"],
            "integration_category_count": integrations,
            "integration_category_per_attempted": integrations / attempted_all
            if attempted_all
            else None,
            "meets_integration_point_threshold": integrations / attempted_all
            <= limits["integration_failure_rate_max"]
            if attempted_all
            else None,
            "verified_stops": sum(
                r["status"] == "user_stop" and r["oracle_passed"] for r in group
            ),
        }
    summary["metric_note"] = (
        "Original all-cell success ratios remain unchanged above. Supplemental task-completion "
        "columns exclude deliberately stopped cancellation cases. Harness attribution categories "
        "are retained; unsupported model code is not automatically attributed to integration. "
        "Point thresholds do not establish the release SLO or its required sample size."
    )
    summary["syntax_repair_cases"] = [
        {
            "attempt_id": r["attempt_id"],
            "surface": r["surface"],
            "scenario": r["scenario"],
            "repeat": r["repeat"],
            "status": r["status"],
        }
        for r in reviewed
        if "INVALID_TOOL_CODE" in json.dumps(r.get("native_tools", []))
    ]
    summary["remaining_failures"] = [
        {
            "attempt_id": r["attempt_id"],
            "surface": r["surface"],
            "scenario": r["scenario"],
            "repeat": r["repeat"],
            "category": r["category"],
            "terminal_status": r.get("result", {}).get("state", {}).get("status"),
            "error": r.get("error"),
        }
        for r in reviewed
        if r["status"] == "failed"
    ]
    summary["verified_oracles"] = {
        surface: dict(
            collections.Counter(
                "verified" if r["oracle_passed"] else "not_verified"
                for r in reviewed
                if r["surface"] == surface
            )
        )
        for surface in protocol["surfaces"]
    }
    summary["reporter_sha256"] = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    args.output.write_text(json.dumps(summary, indent=2) + "\n")
    print(json.dumps(summary["totals"]))


if __name__ == "__main__":
    main()
