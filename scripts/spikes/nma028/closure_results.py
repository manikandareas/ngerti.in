"""Aggregate explicit closure batches without dispatch or cherry-picked retries."""

import argparse
import collections
import hashlib
import json
from pathlib import Path

from results import summarize


def aggregate(batches, protocol_path, reviews=()):
    protocol = json.loads(protocol_path.read_text())
    protocol_hash = hashlib.sha256(protocol_path.read_bytes()).hexdigest()
    evidence = {}
    for path in reviews:
        for record in json.loads(path.read_text())["records"]:
            if record["attempt_id"] in evidence:
                raise ValueError("Duplicate receipt adjudication")
            evidence[record["attempt_id"]] = record
    rows, inputs = [], []
    for path in batches:
        group = [json.loads(line) for line in path.read_text().splitlines()]
        inputs.append(
            {
                "path": str(path),
                "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                "rows": len(group),
                "raw_outcomes": dict(collections.Counter(r["status"] for r in group)),
            }
        )
        for original in group:
            row = dict(original)
            proof = evidence.get(row["attempt_id"])
            if proof and proof["provider_credit_failure"]:
                row.update(
                    prior_score={
                        k: row[k] for k in ("status", "category", "oracle_passed")
                    },
                    status="failed",
                    category="provider",
                    oracle_passed=False,
                    receipt_review=proof,
                )
            rows.append(row)
    present = {(r["surface"], r["scenario"], r["repeat"]) for r in rows}
    for surface in protocol["surfaces"]:
        for case in protocol["scenarios"]:
            for repeat in range(1, protocol["repeats"] + 1):
                if (surface, case["id"], repeat) not in present:
                    rows.append(
                        {
                            "surface": surface,
                            "scenario": case["id"],
                            "repeat": repeat,
                            "protocol_sha256": protocol_hash,
                            "status": "blocked",
                            "category": "prerequisite",
                            "oracle_passed": False,
                            "timings_s": {},
                            "reason": "Live corpus stopped after confirmed provider credit exhaustion; not executed",
                        }
                    )
    summary = summarize(rows, protocol, protocol_sha256=protocol_hash)
    summary.update(
        inputs=inputs,
        receipt_review_inputs=[
            {"path": str(p), "sha256": hashlib.sha256(p.read_bytes()).hexdigest()}
            for p in reviews
        ],
        limitations=[
            "Selected complete attempted batches are fixed explicitly; pilot batches and prior lifecycle scores remain separate, never cherry-picked into this matrix.",
            "Native group recovery is derived from original native receipts and bytes, not another model/action attempt. Its prior scores remain archived.",
            "Provider attribution never creates a pass or changes a denominator. A partial browser-navigation ledger was initially scored passed despite interrupted completion; its saved prior score is retained and conservatively downgraded.",
            "Blocked cells were not executed. Failed provider attempts do not prove required live tool behavior.",
        ],
    )
    return rows, summary


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--batch", type=Path, action="append", required=True)
    parser.add_argument("--review", type=Path, action="append", default=[])
    parser.add_argument(
        "--protocol",
        type=Path,
        default=Path(__file__).with_name("protocol-closure.json"),
    )
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.output.exists() or args.output.with_suffix(".jsonl").exists():
        raise ValueError("Refuse to overwrite derived evidence")
    rows, summary = aggregate(args.batch, args.protocol, args.review)
    args.output.with_suffix(".jsonl").write_text(
        "".join(json.dumps(row, ensure_ascii=False) + "\n" for row in rows)
    )
    args.output.write_text(json.dumps(summary, indent=2) + "\n")
