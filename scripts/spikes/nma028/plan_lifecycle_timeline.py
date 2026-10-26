"""Instrument native companion restart times without changing tasks or oracles."""

import json
import sys
from datetime import UTC, datetime
from pathlib import Path

import native_lifecycle_cases
from plan_baseline import main

OriginalGateway = native_lifecycle_cases.Gateway
timeline = []


def record(gateway, phase):
    timeline.append(
        {
            "profile": str(gateway.home),
            "phase": phase,
            "at": datetime.now(UTC).isoformat(),
            "instance_id": (gateway.descriptor or {}).get("instance_id"),
        }
    )


class TimedGateway(OriginalGateway):
    def start(self):
        record(self, "start_requested")
        super().start()
        record(self, "ready")

    def stop(self):
        record(self, "stop_requested")
        super().stop()
        record(self, "stopped")


if __name__ == "__main__":
    native_lifecycle_cases.Gateway = TimedGateway
    target = Path(sys.argv[sys.argv.index("--output") + 1]).with_suffix(
        ".timeline.json"
    )
    if target.exists():
        raise FileExistsError("Refuse to overwrite an earlier timeline")
    try:
        main()
    finally:
        target.write_text(json.dumps(timeline, indent=2) + "\n")
