"""Read-only initial unit economics from owner-scoped telemetry; never rewrites historical charges."""

import argparse
import json
from collections import defaultdict
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID

import psycopg
from ngertiin.config import get_settings
from ngertiin.usage import prices
from psycopg.rows import dict_row


def collect(owner):
    groups = defaultdict(
        lambda: {
            "observations": 0,
            "estimated_microusd": 0,
            "unknown_ceiling_microusd": 0,
            "reported_tokens": 0,
        }
    )
    refs = []

    def add(category, identity, amount, state, usage=None):
        group = groups[category]
        group["observations"] += 1
        group[
            "unknown_ceiling_microusd" if state == "unknown" else "estimated_microusd"
        ] += amount
        group["reported_tokens"] += (usage or {}).get("total_tokens", 0)
        refs.append(
            {
                "category": category,
                "id": str(identity),
                "amount_microusd": amount,
                "state": state,
            }
        )

    settings = get_settings()
    with psycopg.connect(
        settings.database_url.get_secret_value(), row_factory=dict_row
    ) as conn:
        for row in conn.execute(
            "SELECT id,usage FROM chat_runs WHERE owner_id=%s", (owner,)
        ):
            for response_id, usage in row["usage"].items():
                if not isinstance(usage, dict):
                    continue
                amount, state = prices.model_cost(
                    usage, prices.snapshot(settings.openai_model), 0
                )
                add("chat", str(row["id"]) + ":" + response_id, amount, state, usage)
        for row in conn.execute(
            "SELECT c.*,t.runtime_kind FROM task_cost_events c JOIN "
            "background_tasks t ON t.id=c.task_id WHERE t.owner_id=%s",
            (owner,),
        ):
            price = prices.snapshot(row["model"])
            amount, state = prices.model_cost(
                row["usage"], price, prices.maximum(row["charged_units"], price)
            )
            add("task_" + row["runtime_kind"], row["id"], amount, state, row["usage"])
        for table, category in [
            ("memory_cost_events", "memory"),
            ("proactive_cost_events", "proactive"),
        ]:
            for row in conn.execute(
                f"SELECT * FROM {table} WHERE owner_id=%s", (owner,)
            ):
                price = prices.snapshot(row["model"])
                amount, state = prices.model_cost(
                    row["usage"], price, prices.maximum(row["charged_units"], price)
                )
                add(category, row["id"], amount, state, row["usage"])
        for table, category in [
            ("sandbox_sessions", "python_resource"),
            ("computer_sessions", "browser_resource_and_retention"),
        ]:
            for row in conn.execute(
                f"SELECT * FROM {table} WHERE owner_id=%s", (owner,)
            ):
                add(category, row["id"], row["charged_microusd"], row["cost_state"])
        for row in conn.execute(
            "SELECT * FROM file_extractions WHERE owner_id=%s AND "
            "policy->>'provider'='mistral'",
            (owner,),
        ):
            rate = float(row["policy"]["usd_per_1000_pages"]) * 1000
            add(
                "ocr",
                row["id"],
                prices.ceiling(row["charged_pages"] * rate),
                "unknown" if row["status"] in ("running", "unknown") else "estimated",
            )
        for row in conn.execute(
            "SELECT e.* FROM compute_events e JOIN compute_work w ON w.id=e.work_id "
            "WHERE w.owner_id=%s AND e.category='storage'",
            (owner,),
        ):
            add("object_storage_io", row["id"], row["amount"], row["state"])
    return {
        "kind": "initial_observed_usage_repricing",
        "generated_at": datetime.now(UTC).isoformat(),
        "owner_id": str(owner),
        "price_version": prices.VERSION,
        "invoice_verified": False,
        "historical_ledger_mutated": False,
        "historical_chat_model_assumption": settings.openai_model,
        "limits": [
            "Development sample; not population benchmark NG-041",
            "Historical model quantities repriced with the explicitly named current price table",
            "Browser retained disk is a conservative per-use window, not actual disk invoice",
            "S3 I/O uses configured R2-equivalent estimates; retained capacity beyond first 30 days and direct signed-download byte counts need provider reconciliation",
        ],
        "categories": dict(groups),
        "observations": refs,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--owner", type=UUID, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    report = collect(args.owner)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n")
    print(
        json.dumps(
            {
                "observations": sum(
                    g["observations"] for g in report["categories"].values()
                ),
                "categories": report["categories"],
                "invoice_verified": False,
            }
        )
    )


if __name__ == "__main__":
    main()
