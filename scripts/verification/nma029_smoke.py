"""Paired NMA-029 runtime smoke using the frozen NMA-028 task oracles.

The signed adapter uses a disposable internal principal. The application uses
an actual ClerkJS JWT and unmodified current_account. Native tool placement is
the ADR-08 versioned verification transport; browser adoption remains NMA-032.
"""

import argparse
import hashlib
import json
import os
import signal
import sqlite3
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def api_restart_probe(driver, baseline, output):
    """Restart only the disposable API while a native terminal call is active."""
    row = {"scenario": "api_restart_during_native_work", "status": "failed"}
    try:
        conversation = driver.create()
        submission = driver.send(
            conversation,
            "Use terminal to run: sleep 12; printf API_RESTART_CONTINUITY. "
            "Report the actual output. This is a disposable API restart test.",
        )
        baseline.wait_until(
            lambda: baseline.journal_pending(driver.broker, conversation["scope"]),
            bool,
            timeout=60,
        )
        with sqlite3.connect(driver.root / "state/state.db") as db:
            before = db.execute(
                "SELECT native_admission_id,b.native_session_id FROM nma_adapter_runs r JOIN nma_adapter_bindings b USING(owner_id,binding_id) WHERE run_id=?",
                (submission["receipt"]["run_id"],),
            ).fetchone()
        state = json.loads(driver.args.auth_state.read_text())
        previous_pid = state["api_pid"]
        os.kill(previous_pid, signal.SIGTERM)
        started = time.monotonic()
        # Reuses the same disposable database, registry, account and Clerk session.
        completed = subprocess.run(
            [
                str(ROOT / "apps/backend/.venv/bin/python"),
                str(ROOT / "scripts/spikes/nma028/auth_fixture.py"),
                "start",
                "--state",
                str(driver.args.auth_state),
            ],
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
            timeout=45,
        )
        driver.auth = json.loads(driver.args.auth_state.read_text())
        result = driver.settled(conversation, submission)
        with sqlite3.connect(driver.root / "state/state.db") as db:
            after = db.execute(
                "SELECT native_admission_id,b.native_session_id FROM nma_adapter_runs r JOIN nma_adapter_bindings b USING(owner_id,binding_id) WHERE run_id=?",
                (submission["receipt"]["run_id"],),
            ).fetchone()
        passed = (
            before == after
            and "API_RESTART_CONTINUITY" in result["text"]
            and result["state"]["status"] == "succeeded"
        )
        row.update(
            status="passed" if passed else "failed",
            before=list(before),
            after=list(after),
            application_owner=driver.owner,
            authentication="Actual ClerkJS JWT with production current_account",
            api_pid_changed=driver.auth["api_pid"] != previous_pid,
            restart_and_settlement_s=time.monotonic() - started,
            run_id=submission["receipt"]["run_id"],
            terminal_state=result["state"]["status"],
            response_marker_present="API_RESTART_CONTINUITY" in result["text"],
            restart_command_completed=completed.returncode == 0,
        )
    except Exception as error:  # noqa: BLE001 - retain unsuccessful acceptance evidence
        row["error_type"] = type(error).__name__
    output.write_text(json.dumps(row, indent=2) + "\n")
    return row


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in (
        "source",
        "env-file",
        "auth-state",
        "control-dir",
        "output",
        "protocol",
    ):
        parser.add_argument("--" + name, type=Path, required=True)
    parser.add_argument(
        "--surface", choices=["direct", "adapter", "application"], required=True
    )
    parser.add_argument("--hold-ui", type=Path)
    args = parser.parse_args()
    for name in (
        "source",
        "env_file",
        "auth_state",
        "control_dir",
        "output",
        "protocol",
    ):
        setattr(args, name, getattr(args, name).resolve())
    if args.output.exists():
        raise FileExistsError("An earlier live attempt must remain unchanged")
    args.scenario = None
    os.environ["HERMES_SOURCE"] = str(args.source)
    os.environ["NMA_TEST_LIVE_PROTOCOL"] = "codex_responses"
    sys.path[:0] = [
        str(ROOT / "scripts/spikes/nma028"),
        str(ROOT / "apps/engine/tests"),
        str(ROOT / "apps/engine/src"),
        str(args.source),
    ]
    import complete_baseline as baseline
    from baseline import redact
    from dotenv import dotenv_values

    baseline.PROTOCOL = args.protocol
    credentials = dotenv_values(args.env_file)
    if credentials["OPENAI_MODEL"] != "gpt-6-luna":
        raise ValueError("The frozen protocol requires the existing Luna plan route")

    class Native(baseline.Native):
        def boot(self):
            path = self.home / "config.yaml"
            config = json.loads(path.read_text())
            config["agent"]["max_turns"] = 0
            config["model"].update(
                provider="custom:nma029-plan", api_mode="codex_responses"
            )
            config["custom_providers"] = [
                {
                    "name": "nma029-plan",
                    "base_url": credentials["OPENAI_BASE_URL"],
                    "api_mode": "codex_responses",
                    "key_env": "OPENAI_API_KEY",
                }
            ]
            path.write_text(json.dumps(config))
            super().boot()

    driver = (
        Native(args, credentials)
        if args.surface == "direct"
        else baseline.Product(args)
    )
    try:
        protocol = json.loads(args.protocol.read_text())
        for case in protocol["scenarios"]:
            for repeat in range(1, protocol["repeats"] + 1):
                row = baseline.run_case(driver, case, repeat)
                row["settings"] = {
                    "model": "gpt-6-luna",
                    "provider": "chatgpt",
                    "wire": "codex_responses",
                    "max_turns": "native unlimited",
                    "runtime_revision": "7489b22af47ce91b366dde81d5831ea422577498",
                }
                row["candidate"] = (
                    "NMA-029 product integration with the ADR-08 native-tool verification transport"
                )
                row = redact(row, [credentials["OPENAI_API_KEY"]])
                with args.output.open("a") as stream:
                    stream.write(json.dumps(row, ensure_ascii=False) + "\n")
                print(
                    json.dumps(
                        {
                            k: row[k]
                            for k in (
                                "surface",
                                "scenario",
                                "repeat",
                                "status",
                                "category",
                            )
                        }
                    ),
                    flush=True,
                )
        if args.surface == "application":
            probe = api_restart_probe(
                driver, baseline, args.output.with_suffix(".api-restart.json")
            )
            print(
                json.dumps({"companion": probe["scenario"], "status": probe["status"]}),
                flush=True,
            )
        if args.hold_ui and args.surface == "application":
            rows = [json.loads(line) for line in args.output.read_text().splitlines()]
            target = next(
                row
                for row in rows
                if row["scenario"] == "long_dm" and row["status"] == "passed"
            )
            ui_conversation = driver.create()
            seed = {
                "scenario": "authenticated_context_ui_seed",
                "status": "running",
                "completed_turns": 0,
                "thread_id": ui_conversation["thread"]["thread_id"],
                "planned_turns": 26,
            }
            seed_path = args.output.with_suffix(".ui-seed.json")
            seed_path.write_text(json.dumps(seed, indent=2) + "\n")
            for index in range(26):
                submission = driver.send(
                    ui_conversation,
                    f"Synthetic session UI fixture FACT_{index}=value_{index}. "
                    "Reply with a compact 50-word description of this fact. Do not use tools.",
                )
                result = driver.settled(ui_conversation, submission)
                if result["state"]["status"] != "succeeded":
                    raise RuntimeError("Authenticated context seed did not settle")
                seed["completed_turns"] += 1
                seed_path.write_text(json.dumps(seed, indent=2) + "\n")
            seed["status"] = "passed"
            seed_path.write_text(json.dumps(seed, indent=2) + "\n")
            group = driver.create(group=True)
            driver.send(
                group,
                "@all Reply with GROUP_CONTEXT_READY once. Do not mention peers or delegate.",
            )

            def group_complete():
                with sqlite3.connect(driver.root / "state/state.db") as db:
                    state = db.execute(
                        "SELECT status FROM nma_discussions WHERE thread_id=? ORDER BY rowid DESC LIMIT 1",
                        (group["thread"]["thread_id"],),
                    ).fetchone()
                return state and state[0] != "active"

            baseline.wait_until(group_complete, bool, timeout=180)
            metadata = {
                "group_thread_id": group["thread"]["thread_id"],
                "group_agents": [
                    {"agent_id": a["agent_id"], "handle": a["handle"]}
                    for a in group["agents"]
                ],
                "base": driver.auth["base"],
                "thread_id": ui_conversation["thread"]["thread_id"],
                "baseline_long_thread_id": target["scope"]["thread_id"],
                "root": str(driver.root),
                "protocol_sha256": hashlib.sha256(
                    args.protocol.read_bytes()
                ).hexdigest(),
                "authentication": "Actual ClerkJS JWT, production current_account",
            }
            args.hold_ui.with_suffix(".json").write_text(
                json.dumps(metadata, indent=2) + "\n"
            )
            print(
                "Authenticated UI gateway ready; waiting for the recorded completion marker",
                flush=True,
            )
            while not args.hold_ui.exists():
                time.sleep(0.5)
    finally:
        driver.close()


if __name__ == "__main__":
    main()
