"""Measure selected isolated backend phases using real native tools, no model."""

import argparse
import hashlib
import json
import time
from pathlib import Path
from uuid import uuid4

from isolated_tools import IsolatedTools, Scope
from results import percentile


def measure(control):
    owner = str(uuid4())
    broker = IsolatedTools(control, owner)
    rows = []
    try:
        for repeat in range(1, 4):
            scope = Scope(owner, str(uuid4()), str(uuid4()))
            phases = {}

            def timed(name, call, phases=phases):
                start = time.monotonic()
                value = call()
                phases[name] = time.monotonic() - start
                return value

            resource = timed(
                "cold_scope_ready", lambda scope=scope: broker.ensure(scope)
            )
            for name in ("first_terminal", "warm_terminal"):
                result = json.loads(
                    timed(
                        name,
                        lambda n=name, scope=scope: broker.invoke(
                            scope, n, "terminal", {"command": "printf NATIVE_READY"}
                        ),
                    )
                )
                assert (
                    result.get("exit_code") == 0 and "NATIVE_READY" in result["output"]
                )
            browser = json.loads(
                timed(
                    "first_browser_navigation",
                    lambda scope=scope: broker.invoke(
                        scope,
                        "browser-nav",
                        "browser_exec",
                        {
                            "code": 'new_tab("http://127.0.0.1:8765/"); wait_for_load(); print(page_info())',
                            "session": "measurement",
                        },
                    ),
                )
            )
            assert not browser.get("error")
            observed = broker.inspect(scope)
            assert any(entry["path"] == "/" for entry in observed["ledger"])
            timed("idle_pause", lambda scope=scope: broker.pause(scope))
            restored = timed("scope_resume", lambda scope=scope: broker.ensure(scope))
            assert all(
                restored[key] == resource[key] for key in ("container", "volume")
            )
            rows.append(
                {
                    "repeat": repeat,
                    "scope_key": scope.key,
                    "timings_s": phases,
                    "passed": True,
                }
            )
    finally:
        broker.cleanup()
    return {
        "backend": "Linux Docker scoped native tool dispatcher",
        "image": broker.image,
        "supervisor_sha256": hashlib.sha256(
            Path(__file__).with_name("isolated_tools.py").read_bytes()
        ).hexdigest(),
        "model_calls": 0,
        "network": "none; synthetic container-local fixture",
        "attempts": rows,
        "phase_summary_s": {
            name: {
                "n": len(rows),
                "p50": percentile([r["timings_s"][name] for r in rows], 0.5),
                "p95": percentile([r["timings_s"][name] for r in rows], 0.95),
            }
            for name in rows[0]["timings_s"]
        },
        "limits": "3 cold scopes on this development Docker host; no image-pull time, production load, remote network or dollar-cost claim",
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--control-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.output.exists() or args.control_dir.exists():
        raise ValueError("Use new disposable paths")
    args.output.write_text(json.dumps(measure(args.control_dir), indent=2) + "\n")
