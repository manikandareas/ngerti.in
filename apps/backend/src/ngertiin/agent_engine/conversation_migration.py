"""Inspect primary-DM ambiguity and apply an explicit, revision-bound mapping.

Inventory is read-only. Save an apply plan containing the inventory_digest,
default_agent_id (or null), and primary_dms mapping agent IDs to existing DM IDs.
Use one immutable command_id for retries. No transcript or run is moved.
"""

import argparse
import asyncio
import json
from pathlib import Path
from uuid import UUID

from ngertiin.agent_engine.api import forward
from ngertiin.agent_engine.migration import save
from ngertiin.agent_engine.stream import read_command


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["inventory", "apply"])
    parser.add_argument("--owner", required=True, type=UUID)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--plan", type=Path)
    args = parser.parse_args()
    if args.output.exists():
        raise ValueError("Output already exists; inspect the saved receipt")
    body = read_command("account.inventory", {})
    if args.action == "apply":
        if not args.plan:
            parser.error("--plan is required for apply")
        body = json.loads(args.plan.read_text())
        if body.get("type") != "account.reconcile":
            raise ValueError("Expected a frozen account.reconcile command")
    result = asyncio.run(forward(str(args.owner), body))
    save(args.output, result)


if __name__ == "__main__":
    main()
