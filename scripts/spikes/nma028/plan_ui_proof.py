"""Read the settled live form through production auth while the corpus continues.

Only an empty disposable peer partition is started. The active application
partition remains owned by its existing corpus controller. No history fixture,
model reply, goal state or authentication dependency is synthesized.
"""

import argparse
import hashlib
import json
import os
import signal
import sys
import threading
import time
from pathlib import Path
from urllib.error import HTTPError

ROOT = Path(__file__).resolve().parents[3]


def main(args):
    from complete_baseline import Product

    args.surface = "adapter"
    peer = Product(args)
    meta_path = ROOT / ".dev/nma-028-closure/ui-metadata.json"
    previous_meta = meta_path.read_bytes() if meta_path.exists() else None
    try:
        deadline = time.monotonic() + 180
        while time.monotonic() < deadline:
            records = [json.loads(line) for line in args.batch.read_text().splitlines()]
            target = next(
                (
                    r
                    for r in records
                    if r["scenario"] == "browser_form" and r["status"] == "passed"
                ),
                None,
            )
            if target:
                break
            time.sleep(0.5)
        else:
            raise RuntimeError("No successful settled real-model application form")
        thread = target["scope"]["thread_id"]
        path = "/api/agent-engine/v1/threads/" + thread + "/snapshot"

        def snapshot():
            deadline = time.monotonic() + 45
            while True:
                try:
                    with peer.http(path, identity=0) as response:
                        return json.load(response)
                except HTTPError as error:
                    if error.code != 503 or time.monotonic() >= deadline:
                        raise
                    # A read-only projection can safely wait through the corpus'
                    # deliberate gateway restart; no command/action is retried.
                    time.sleep(0.25)

        first = snapshot()
        report = {
            "authentication": "Actual ClerkJS development sessions; unmodified production current_account",
            "application_attempt_id": target["attempt_id"],
            "thread_id": thread,
            "native_lineage": target["lineage"],
            "message_sha256_before": hashlib.sha256(
                json.dumps(first["messages"]).encode()
            ).hexdigest(),
            "peer_model_invocations": 0,
            "own_lists": [],
        }
        for identity in (0, 1):
            with peer.http(
                "/api/agent-engine/v1/agents", identity=identity
            ) as response:
                report["own_lists"].append(
                    {"identity": identity, "status": response.status}
                )
        try:
            peer.http(
                path,
                identity=1,
                headers={"X-Owner-ID": peer.auth["identities"][0]["owner_id"]},
            )
        except HTTPError as error:
            if error.code != 404:
                raise
            report["foreign_owner_denied"] = {
                "status": 404,
                "forged_header_ignored": True,
            }
        else:
            raise AssertionError("A foreign owner read was accepted")
        for label, authorization in (
            ("missing", None),
            ("invalid", "Bearer invalid-fixture-token"),
        ):
            from urllib.request import Request, urlopen

            headers = {"Authorization": authorization} if authorization else {}
            try:
                urlopen(
                    Request(
                        peer.auth["base"] + "/api/agent-engine/v1/agents",
                        headers=headers,
                    ),
                    timeout=15,
                )
            except HTTPError as error:
                if error.code != 401:
                    raise
                report[label + "_token_denied"] = error.code
            else:
                raise AssertionError("Invalid product authentication was accepted")
        args.output.write_text(json.dumps(report, indent=2) + "\n")
        meta_path.write_text(
            json.dumps({"base": peer.auth["base"], "thread_id": thread}, indent=2)
            + "\n"
        )
        print(
            "Actual authenticated form/history, missing/invalid JWT and foreign-owner checks passed; UI ready",
            flush=True,
        )
        stopped = threading.Event()
        signal.signal(signal.SIGINT, lambda *_: stopped.set())
        signal.signal(signal.SIGTERM, lambda *_: stopped.set())
        stopped.wait()
        after = snapshot()
        report["message_sha256_after"] = hashlib.sha256(
            json.dumps(after["messages"]).encode()
        ).hexdigest()
        report["target_history_unchanged"] = (
            report["message_sha256_after"] == report["message_sha256_before"]
        )
        if not report["target_history_unchanged"]:
            raise AssertionError("Read-only UI verification changed target history")
        args.output.write_text(json.dumps(report, indent=2) + "\n")
    finally:
        peer.close()
        if previous_meta is None:
            meta_path.unlink(missing_ok=True)
        else:
            meta_path.write_bytes(previous_meta)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("source", "env-file", "auth-state", "control-dir", "output", "batch"):
        parser.add_argument("--" + name, type=Path, required=True)
    args = parser.parse_args()
    for key, value in vars(args).items():
        setattr(args, key, value.resolve())
    if args.output.exists():
        raise FileExistsError("Choose a new evidence output")
    os.environ["HERMES_SOURCE"] = str(args.source)
    sys.path[:0] = [
        str(ROOT / "apps/engine/tests"),
        str(ROOT / "apps/engine/src"),
        str(args.source),
    ]
    main(args)
