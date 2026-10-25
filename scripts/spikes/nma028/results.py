"""Read-only baseline replay and statistics. This module cannot dispatch work."""

import argparse
import collections
import hashlib
import json
import math
from pathlib import Path

STATUSES = {"passed", "failed", "blocked", "user_stop"}
CATEGORIES = {
    "integration",
    "provider",
    "tool",
    "unknown_effect",
    "oracle",
    "prerequisite",
    "user_stop",
    "none",
    "unknown",
    "harness",
}


def oracle(case, text, trace):
    if case == "long_dm":
        return text.strip() == "NMA028_LONG_7319"
    if case == "multi_step_tools":
        completed = [
            e
            for e in trace
            if e.get("role") == "tool" and e.get("tool_name") == "todo_list"
        ]
        if len(completed) < 2 or len({e.get("tool_call_id") for e in completed}) < 2:
            return False
        first, last = (json.loads(e["content"]) for e in (completed[0], completed[-1]))
        todos = last.get("todos", [])
        return (
            len(first.get("todos", [])) == 2
            and first.get("summary", {}).get("completed") == 0
            and len(todos) == 2
            and all(t["status"] == "completed" for t in todos)
            and {t["content"] for t in todos} == {"inspect ledger", "verify total"}
            and "NMA028_TOOLS_DONE" in text
        )
    return (
        text.strip()
        == {
            "short_dm": "NMA028_SHORT_42",
            "restart": "NMA028_RESTART_42",
            "reconnect": "NMA028_RECONNECT_42",
        }[case]
    )


def rescore(row):
    """Repair instrumentation scoring from saved results, without rerunning effects."""
    if row["scenario"] == "multi_step_tools" and "native_tools" in row:
        prior = {k: row[k] for k in ("status", "category", "oracle_passed")}
        passed = oracle(row["scenario"], row.get("final", ""), row["native_tools"])
        row = {
            **row,
            "prior_score": prior,
            "score_method": "Persisted todo results and distinct tool call IDs; supports native tool_call batching.",
            "status": "passed" if passed else "failed",
            "category": "none" if passed else "oracle",
            "oracle_passed": passed,
        }
    return validate(row)


def validate(row):
    if row["status"] not in STATUSES or row["category"] not in CATEGORIES:
        raise ValueError("Unknown outcome classification")
    if row["status"] == "passed" and (
        row["category"] != "none" or not row.get("oracle_passed")
    ):
        raise ValueError("A pass requires a verified oracle")
    if row["status"] == "blocked" and row["category"] != "prerequisite":
        raise ValueError("A blocked attempt needs an explicit prerequisite gap")
    for value in row.get("timings_s", {}).values():
        if value is not None and (not math.isfinite(value) or value < 0):
            raise ValueError("Invalid phase timing")
    return row


def percentile(values, p):
    values = sorted(v for v in values if v is not None)
    return values[max(0, math.ceil(len(values) * p) - 1)] if values else None


def wilson(success, n):
    if not n:
        return None
    z = 1.959963984540054
    center = (success / n + z * z / (2 * n)) / (1 + z * z / n)
    delta = (
        z
        * math.sqrt(success / n * (1 - success / n) / n + z * z / (4 * n * n))
        / (1 + z * z / n)
    )
    return [max(0, center - delta), min(1, center + delta)]


def summarize(rows, protocol, *, protocol_sha256=None):
    keys = [(r["surface"], r["scenario"], r["repeat"]) for r in rows]
    if len(set(keys)) != len(keys):
        raise ValueError("Duplicate attempt identity; do not cherry-pick retries")
    expected = {
        (s, c["id"], r)
        for s in protocol["surfaces"]
        for c in protocol["scenarios"]
        for r in range(1, protocol["repeats"] + 1)
    }
    if set(keys) != expected:
        raise ValueError("Report every pre-registered cell, including blocked cells")
    hashes = {r["protocol_sha256"] for r in rows}
    if len(hashes) != 1:
        raise ValueError("Mixed frozen protocols cannot be pooled")
    if protocol_sha256 is not None and hashes != {protocol_sha256}:
        raise ValueError("Attempt hash does not match the supplied frozen protocol")
    output = {
        "protocol_id": protocol["protocol_id"],
        "protocol_sha256": next(iter(hashes)),
        "surfaces": {},
    }
    for surface in protocol["surfaces"]:
        group = [validate(r) for r in rows if r["surface"] == surface]
        executed = [r for r in group if r["status"] != "blocked"]
        passed = sum(r["status"] == "passed" for r in group)
        output["surfaces"][surface] = {
            "planned": len(group),
            "executed": len(executed),
            "passed": passed,
            "outcomes": dict(collections.Counter(r["status"] for r in group)),
            "categories": dict(collections.Counter(r["category"] for r in group)),
            "success_per_planned": passed / len(group),
            "success_per_executed": passed / len(executed) if executed else None,
            "wilson95_executed": wilson(passed, len(executed)),
            "timings_s": {
                phase: {
                    "n": len(values),
                    "p50": percentile(values, 0.5),
                    "p95": percentile(values, 0.95),
                }
                for phase in ("admission", "first_progress", "settlement", "recovery")
                for values in [
                    [
                        r.get("timings_s", {}).get(phase)
                        for r in executed
                        if r.get("timings_s", {}).get(phase) is not None
                    ]
                ]
            },
            "effect_metrics": "unavailable unless independently instrumented; never inferred as zero from missing events",
        }
    output["release_gate"] = (
        "Not established by smoke baseline; required blocked cells remain open. See pre-registered release thresholds."
    )
    return output


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("attempts", type=Path)
    parser.add_argument(
        "--protocol", type=Path, default=Path(__file__).with_name("protocol.json")
    )
    parser.add_argument(
        "--rescore",
        action="store_true",
        help="Emit derived JSONL scores from retained native tool results, without dispatch",
    )
    args = parser.parse_args()
    rows = [json.loads(line) for line in args.attempts.read_text().splitlines()]
    if args.rescore:
        for row in rows:
            print(json.dumps(rescore(row), ensure_ascii=False))
    else:
        print(
            json.dumps(
                summarize(
                    rows,
                    json.loads(args.protocol.read_text()),
                    protocol_sha256=hashlib.sha256(
                        args.protocol.read_bytes()
                    ).hexdigest(),
                ),
                indent=2,
            )
        )
