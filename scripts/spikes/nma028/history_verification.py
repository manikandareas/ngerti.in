"""Reopen only settled disposable partitions for authenticated read-only UI proof."""

import argparse
import hashlib
import json
import os
import signal
import sqlite3
import subprocess
import sys
import threading
import time
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[3]


def main(args):
    auth = json.loads(args.auth_state.read_text())
    pilot = [json.loads(x) for x in args.pilot.read_text().splitlines()]
    target = next(
        r for r in pilot if r["scenario"] == "browser_form" and r["status"] == "passed"
    )
    target_run = target["result"]["state"]["run_id"]
    target_thread = target["result"]["state"]["thread_id"]
    records = []
    processes = []
    registry = {}
    owners = [i["owner_id"] for i in auth["identities"]]
    for index, owner in enumerate(owners):
        candidates = []
        for root in Path("/tmp").glob("nma-*"):
            database = root / "state/state.db"
            if not database.exists():
                continue
            with sqlite3.connect(f"file:{database}?mode=ro", uri=True) as db:
                try:
                    if db.execute("SELECT owner_id FROM nma_partition").fetchone() != (
                        owner,
                    ):
                        continue
                    if (
                        index == 0
                        and not db.execute(
                            "SELECT 1 FROM nma_adapter_runs WHERE run_id=?",
                            (target_run,),
                        ).fetchone()
                    ):
                        continue
                    pending = db.execute(
                        "SELECT count(*) FROM session_admissions WHERE status IN ('queued','started','unknown')"
                    ).fetchone()[0]
                    goals = db.execute(
                        "SELECT count(*) FROM nma_goals WHERE status IN ('active','waiting')"
                    ).fetchone()[0]
                    if pending or goals:
                        continue
                    receipts = db.execute(
                        "SELECT command_id,result FROM nma_commands ORDER BY command_id"
                    ).fetchall()
                    messages = db.execute(
                        "SELECT message_id,parts FROM nma_messages ORDER BY message_id"
                    ).fetchall()
                except sqlite3.OperationalError:
                    continue
            candidates.append((root, receipts, messages))
        if not candidates:
            raise RuntimeError("No settled disposable partition for verified owner")
        root, receipts, messages = candidates[-1]
        home = (root / "state").resolve()
        record = {
            "owner_id": owner,
            "root": str(root),
            "receipt_sha256": hashlib.sha256(json.dumps(receipts).encode()).hexdigest(),
            "message_sha256": hashlib.sha256(json.dumps(messages).encode()).hexdigest(),
        }
        env = {k: v for k, v in os.environ.items() if k in {"PATH", "LANG", "TZ"}} | {
            "HERMES_HOME": str(home),
            "HERMES_SOURCE": str(args.source),
            "PYTHONPATH": os.pathsep.join(
                [str(ROOT / "apps/engine/src"), str(args.source)]
            ),
            "NMA028_OWNER_ID": owner,
            "NMA028_CONTROL_DIR": str(args.output / "control" / owner),
            "NMA028_SURFACE": "application",
            "NMA_OWNER_ID": owner,
            "NMA_SERVICE_KEY_FILE": str(root / "key"),
            "NMA_MODELS_FILE": str(root / "models.json"),
            "NMA_CAPABILITIES_FILE": str(root / "capabilities.json"),
            "NMA_BINDINGS_FILE": str(root / "bindings.json"),
            "NMA_DEFAULT_MODEL": "test",
            "OPENAI_API_KEY": "disabled-for-readonly-history-verification",
            "HERMES_DISABLE_LAZY_INSTALLS": "1",
        }
        log = (args.output / f"gateway-{index}.log").open("w")
        process = subprocess.Popen(
            [sys.executable, str(Path(__file__).with_name("spike_gateway.py"))],
            cwd=args.source,
            env=env,
            stdout=log,
            stderr=log,
        )
        processes.append(process)
        record["pid"] = process.pid
        records.append(record)
        deadline = time.monotonic() + 30
        while time.monotonic() < deadline and process.poll() is None:
            if (home / "nma.sock").exists():
                break
            time.sleep(0.1)
        else:
            raise RuntimeError("Read-only history gateway failed startup")
        registry[owner] = {
            "key_file": str(root / "key"),
            "socket": str(home / "nma.sock"),
        }
    Path(auth["registry"]).write_text(json.dumps(registry))

    def request(path, identity=0, extra=None):
        state = json.loads(args.auth_state.read_text())
        return urlopen(
            Request(
                state["base"] + "/api/agent-engine/v1" + path,
                headers={
                    "Authorization": "Bearer " + state["identities"][identity]["jwt"],
                    **(extra or {}),
                },
            ),
            timeout=15,
        )

    report = {
        "authentication": "Unmodified production current_account; real frontend Clerk session JWTs",
        "partitions": records,
        "thread_id": target_thread,
        "model_invocation": "disabled; only settled history is read",
    }
    for identity in (0, 1):
        with request("/agents", identity) as response:
            report.setdefault("owner_lists", []).append(
                {
                    "identity": identity,
                    "status": response.status,
                    "agent_ids": [a["agent_id"] for a in json.load(response)["items"]],
                }
            )
    path = "/threads/" + target_thread + "/snapshot"
    with request(path) as response:
        snap = json.load(response)
        report["visible_thread"] = {
            "status": response.status,
            "message_ids": [m["message_id"] for m in snap["messages"]],
        }
    try:
        request(path, 1, {"X-Owner-ID": owners[0]})
    except HTTPError as error:
        if error.code != 404:
            raise
        report["foreign_thread_denied"] = {
            "status": error.code,
            "forged_owner_header_ignored": True,
        }
    else:
        raise RuntimeError("Foreign owner read was accepted")
    args.output.joinpath("auth-history-proof.json").write_text(
        json.dumps(report, indent=2) + "\n"
    )
    meta = {
        "base": auth["base"],
        "thread_id": target_thread,
        "auth": "Real Clerk frontend token through production current_account",
    }
    Path(".dev/nma-028-closure/ui-metadata.json").write_text(
        json.dumps(meta, indent=2) + "\n"
    )
    print(
        "Authenticated history and foreign-owner refusal verified; ready for UI.",
        flush=True,
    )
    stopped = threading.Event()
    signal.signal(signal.SIGTERM, lambda *_: stopped.set())
    signal.signal(signal.SIGINT, lambda *_: stopped.set())
    try:
        stopped.wait()
    finally:
        for process in processes:
            if process.poll() is None:
                process.terminate()
            try:
                process.wait(timeout=8)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
        for record in records:
            with sqlite3.connect(
                f"file:{record['root']}/state/state.db?mode=ro", uri=True
            ) as db:
                current = db.execute(
                    "SELECT message_id,parts FROM nma_messages ORDER BY message_id"
                ).fetchall()
                record["history_preserved"] = (
                    hashlib.sha256(json.dumps(current).encode()).hexdigest()
                    == record["message_sha256"]
                )
        report["cleanup"] = "Only the recorded settled disposable gateways stopped"
        args.output.joinpath("auth-history-proof.json").write_text(
            json.dumps(report, indent=2) + "\n"
        )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--auth-state", type=Path, required=True)
    parser.add_argument("--pilot", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    args.source = args.source.resolve()
    args.auth_state = args.auth_state.resolve()
    args.output.mkdir(parents=True, exist_ok=True)
    main(args)
