"""Read-only Luna corpus statistics; this module cannot dispatch model/tool work."""

import argparse
import collections
import hashlib
import json
import sqlite3
from pathlib import Path

from results import oracle, summarize


def review_labels(original):
    """Apply the written task oracle without an unintended capitalization rule.

    Preserve distinct call IDs and the initial uncompleted -> completed states.
    This correction reads retained results only and never replays an action.
    """
    if original["scenario"] != "multi_step_tools" or original["category"] != "oracle":
        return original
    trace = json.loads(json.dumps(original.get("native_tools", [])))
    for event in trace:
        if event.get("role") == "tool" and event.get("tool_name") == "todo_list":
            content = json.loads(event["content"])
            for todo in content.get("todos", []):
                todo["content"] = todo["content"].casefold()
            event["content"] = json.dumps(content)
    if not oracle(
        "multi_step_tools", original.get("result", {}).get("text", ""), trace
    ):
        return original
    return {
        **original,
        "status": "passed",
        "category": "none",
        "oracle_passed": True,
        "score_review": {
            "raw_score": {
                k: original[k] for k in ("status", "category", "oracle_passed")
            },
            "reason": "Written oracle requires two distinct successful updates and completed named tasks, without requiring lowercase task labels. Only casefolding is applied to saved labels; raw traces remain unchanged.",
        },
    }


def review_native_offline(original):
    """Use the pinned scheduler status and response bytes, never prompt echoes."""
    if original["surface"] != "direct" or original["scenario"] != "offline_goal":
        return original
    job = original.get("final_job") or {}
    outputs = original.get("output", [])
    responses = [
        item["text"].split("\n## Response\n\n", 1)[-1]
        if "\n## Response\n\n" in item["text"]
        else ""
        for item in outputs
    ]
    expected = f"NMA028_OFFLINE_{original['repeat']}_238"
    admissions = original.get("native_admissions", [])
    passed = bool(
        job.get("last_status") == "ok"
        and not job.get("last_error")
        and len(outputs) == 1
        and expected in "\n".join(responses)
        and job.get("repeat", {}).get("completed") == 1
        and len(job.get("canonical_completions", [])) == 1
        and len(admissions) == 1
        and admissions[0].get("status") == "terminal"
    )
    if not passed:
        return original
    return {
        **original,
        "status": "passed",
        "category": "none",
        "oracle_passed": True,
        "score_review": {
            "raw_score": {
                k: original[k] for k in ("status", "category", "oracle_passed")
            },
            "reason": "Pinned cron persists successful last_status=ok, not success. One terminal admission/canonical completion/output is required. The expected marker must occur in actual response bytes after the Markdown Response heading, never in the saved prompt.",
        },
    }


def calculate(batches, protocol_path, controls):
    protocol = json.loads(protocol_path.read_text())
    raw_rows = [
        json.loads(line) for path in batches for line in path.read_text().splitlines()
    ]
    rows = [review_native_offline(review_labels(row)) for row in raw_rows]
    summary = summarize(
        rows,
        protocol,
        protocol_sha256=hashlib.sha256(protocol_path.read_bytes()).hexdigest(),
    )
    summary["inputs"] = [
        {"path": str(p), "sha256": hashlib.sha256(p.read_bytes()).hexdigest()}
        for p in batches
    ]
    summary["raw_outcomes"] = dict(collections.Counter(r["status"] for r in raw_rows))
    summary["read_only_score_reviews"] = [
        {
            "attempt_id": r["attempt_id"],
            "surface": r["surface"],
            "repeat": r["repeat"],
            **r["score_review"],
        }
        for r in rows
        if "score_review" in r
    ]
    summary["totals"] = {
        "planned": len(rows),
        "attempted": sum(r["status"] != "blocked" for r in rows),
        "task_successes": sum(r["status"] == "passed" for r in rows),
        "verified_user_stops": sum(
            r["status"] == "user_stop" and r["oracle_passed"] for r in rows
        ),
        "outcomes": dict(collections.Counter(r["status"] for r in rows)),
        "categories": dict(collections.Counter(r["category"] for r in rows)),
    }
    summary["families"] = {
        case["id"]: {
            surface: [
                {k: r[k] for k in ("repeat", "status", "category", "oracle_passed")}
                for r in rows
                if r["scenario"] == case["id"] and r["surface"] == surface
            ]
            for surface in protocol["surfaces"]
        }
        for case in protocol["scenarios"]
    }
    summary["tool_journals"] = []
    for control in controls:
        database = control / "isolated-tools.db"
        before = hashlib.sha256(database.read_bytes()).hexdigest()
        with sqlite3.connect(database.resolve().as_uri() + "?mode=ro", uri=True) as db:
            states = db.execute(
                "SELECT state,count(*) FROM operations GROUP BY state"
            ).fetchall()
            tools = db.execute(
                "SELECT tool,count(*) FROM operations GROUP BY tool"
            ).fetchall()
            scopes = db.execute(
                "SELECT state,count(*) FROM scopes GROUP BY state"
            ).fetchall()
        after = hashlib.sha256(database.read_bytes()).hexdigest()
        if before != after:
            raise ValueError("Original journal changed during read-only aggregation")
        summary["tool_journals"].append(
            {
                "path": str(database),
                "sha256": before,
                "operations": sum(n for _, n in states),
                "states": dict(states),
                "tools": dict(tools),
                "scopes": dict(scopes),
                "original_bytes_unchanged": True,
            }
        )
    forms = [r for r in rows if r["scenario"] == "browser_form"]
    summary["form_effects"] = {
        "attempts": len(forms),
        "posts_per_attempt": [
            {
                "attempt_id": r["attempt_id"],
                "posts": sum(
                    e.get("method") == "POST"
                    for e in r.get("observed", {}).get("ledger", [])
                ),
            }
            for r in forms
        ],
        "limitation": "Missing observations are unavailable, not proof of zero effects; journals retain unknown/indeterminate outcomes.",
    }
    summary["release_gate"] = (
        "This is a decision-spike smoke corpus. All observed failures remain failures. "
        "The unchanged NMA-039 release thresholds and >=100 representative tasks per configuration are not established here."
    )
    return summary


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--batch", type=Path, action="append", required=True)
    parser.add_argument("--control", type=Path, action="append", default=[])
    parser.add_argument(
        "--protocol", type=Path, default=Path(__file__).with_name("protocol-plan.json")
    )
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.output.exists():
        raise FileExistsError("Choose a new output; retained scores are immutable")
    args.output.write_text(
        json.dumps(calculate(args.batch, args.protocol, args.control), indent=2) + "\n"
    )
