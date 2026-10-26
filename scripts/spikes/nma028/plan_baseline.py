"""Fresh paired ChatGPT Luna corpus, retaining the immutable closure-v2 harness.

Only provider/wire configuration changes. Native lifecycle helpers and scenario
oracles remain imported from the archived harness. Each output is append-only.
"""

import argparse
import asyncio
import hashlib
import json
import os
import sys
import tempfile
from pathlib import Path
from urllib.parse import urlsplit
from uuid import uuid4

HERE = Path(__file__).parent
ROOT = HERE.resolve().parents[2]


def settings(credentials):
    if credentials["OPENAI_MODEL"] != "gpt-6-luna":
        raise ValueError("This corpus requires exactly gpt-6-luna")
    route = urlsplit(credentials["OPENAI_BASE_URL"])
    if route.scheme != "http" or route.hostname != "127.0.0.1":
        raise ValueError("This corpus requires the fixed plan credential relay")
    return {
        "provider": "chatgpt",
        "model": "gpt-6-luna",
        "protocol": "codex_responses",
        "endpoint": "https://api.openai.com/v1",
        "relay": credentials["OPENAI_BASE_URL"],
        "max_turns": 8,
        "credential": "Short-lived plan access token; renewable journal stays with product gateway",
        "native_revision": "7489b22af47ce91b366dde81d5831ea422577498",
    }


def paired(args, credentials):
    import complete_baseline as baseline
    from baseline import redact

    baseline.PROTOCOL = args.protocol
    os.environ["NMA_TEST_LIVE_PROTOCOL"] = "codex_responses"

    class NativePlan(baseline.Native):
        def boot(self):
            path = self.home / "config.yaml"
            config = json.loads(path.read_text())
            config["model"]["api_mode"] = "codex_responses"
            config["model"]["provider"] = "custom:nma028-plan"
            config["custom_providers"] = [
                {
                    "name": "nma028-plan",
                    "base_url": credentials["OPENAI_BASE_URL"],
                    "api_mode": "codex_responses",
                    "key_env": "OPENAI_API_KEY",
                }
            ]
            path.write_text(json.dumps(config))
            super().boot()

    driver = (
        NativePlan(args, credentials)
        if args.surface == "direct"
        else baseline.Product(args)
    )
    try:
        protocol = json.loads(args.protocol.read_text())
        for case in protocol["scenarios"]:
            if args.scenario and case["id"] not in args.scenario:
                continue
            if args.surface == "direct" and case["id"] in {
                "offline_goal",
                "group_handoff",
            }:
                continue
            for repeat in range(1, protocol["repeats"] + 1):
                row = baseline.run_case(driver, case, repeat)
                row["settings"] = settings(credentials)
                # The old navigation scorer accepted a server hit alone. Require
                # the independently observed final URL and completed model turn.
                if case["id"] == "browser_navigation" and row["oracle_passed"]:
                    text = row.get("result", {}).get("text", "")
                    if "/form" not in text:
                        row.update(
                            status="failed", category="oracle", oracle_passed=False
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
                if row["category"] == "provider":
                    return
    finally:
        driver.close()


def lifecycle(args, credentials):
    from hermes_cli.profiles import create_profile
    from isolated_tools import IsolatedTools
    from native_lifecycle_cases import Evidence, Gateway, group_cases, offline_cases
    from tests.gateway.fixtures.local_recovery_probe import child_env

    work = Path(tempfile.mkdtemp(prefix="n28-plan-lifecycle-", dir="/tmp")).resolve()
    home = work / "state"
    home.mkdir(mode=0o700)
    (work / "workspace").mkdir(mode=0o700)
    os.environ["HERMES_HOME"] = str(home)
    writer = create_profile("writer", no_alias=True, no_skills=True)
    reviewer = create_profile("reviewer", no_alias=True, no_skills=True)
    profiles = {"researcher": home, "writer": writer, "reviewer": reviewer}
    config = {
        "model": {
            "provider": "custom:nma028-plan",
            "default": "gpt-6-luna",
            "base_url": credentials["OPENAI_BASE_URL"],
            "api_mode": "codex_responses",
        },
        "agent": {"max_turns": 8},
        "custom_providers": [
            {
                "name": "nma028-plan",
                "base_url": credentials["OPENAI_BASE_URL"],
                "api_mode": "codex_responses",
                "key_env": "OPENAI_API_KEY",
            }
        ],
        "platform_toolsets": {
            surface: ["nma_computer", "todo", "cronjob"]
            for surface in ("cli", "gui", "bot_room")
        },
        "auxiliary": {"title_generation": {"enabled": False}},
        "terminal": {"cwd": str(work / "workspace")},
        "gateway": {"multiplex_profiles": False},
        "hosted_rooms": {
            "profiles": {"writer": str(writer), "reviewer": str(reviewer)}
        },
    }
    souls = {
        "researcher": "You are Researcher. Start your response RESEARCHER_PROOF. Calculate supplied facts then explicitly hand off to @writer. Never fabricate tool success.",
        "writer": "You are Writer. Start your response WRITER_PROOF. Write the requested file using the native terminal tool, then hand off to @reviewer. Never fabricate file creation. Keep prose concise.",
        "reviewer": "You are Reviewer. Start your response REVIEWER_PROOF. Independently verify arithmetic and report the result. Do not mention another agent after finishing. When asked to review an attached artifact, use its trusted inline content and acknowledge only if correct.",
    }
    for name, profile in profiles.items():
        (profile / "config.yaml").write_text(
            json.dumps(
                config
                if name == "researcher"
                else config | {"gateway": {"standalone": True}}
            )
        )
        (profile / "SOUL.md").write_text(souls[name] + "\n")
        token_path = profile / ".env"
        token_path.write_text(
            "OPENAI_API_KEY=" + json.dumps(credentials["OPENAI_API_KEY"]) + "\n"
        )
        token_path.chmod(0o600)
    environment = child_env() | {
        "HERMES_SOURCE": str(args.source),
        "PYTHONPATH": str(ROOT / "apps/engine/src") + os.pathsep + str(args.source),
        "NMA028_OWNER_ID": args.owner,
        "NMA028_CONTROL_DIR": str(args.control_dir),
        "NMA028_SURFACE": "direct",
        "OPENAI_API_KEY": credentials["OPENAI_API_KEY"],
        "OPENAI_BASE_URL": credentials["OPENAI_BASE_URL"],
        "PYTHONUNBUFFERED": "1",
        "HERMES_DISABLE_LAZY_INSTALLS": "1",
    }
    evidence = Evidence(
        args,
        settings(credentials)
        | {"secret": credentials["OPENAI_API_KEY"], "work": str(work)},
    )
    gateways = {
        name: Gateway(args.source, path, environment, work)
        for name, path in profiles.items()
    }
    broker = IsolatedTools(args.control_dir, args.owner)
    try:
        gateways["researcher"].start()
        if not args.scenario or "offline_goal" in args.scenario:
            asyncio.run(offline_cases(args, evidence, gateways["researcher"]))
        if not args.scenario or "group_handoff" in args.scenario:
            for name in ("writer", "reviewer"):
                gateways[name].start()
            asyncio.run(
                group_cases(args, evidence, gateways["researcher"], profiles, broker)
            )
    finally:
        for gateway in gateways.values():
            gateway.stop()
        for profile in profiles.values():
            (profile / ".env").unlink(missing_ok=True)
        broker.cleanup()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for field in ("source", "env-file", "auth-state", "control-dir", "output"):
        parser.add_argument("--" + field, type=Path, required=True)
    parser.add_argument("--protocol", type=Path, default=HERE / "protocol-plan.json")
    parser.add_argument(
        "--surface",
        choices=["direct", "adapter", "application", "lifecycle"],
        required=True,
    )
    parser.add_argument("--scenario", action="append")
    parser.add_argument("--owner", default=str(uuid4()))
    args = parser.parse_args()
    for field in (
        "source",
        "env_file",
        "auth_state",
        "control_dir",
        "output",
        "protocol",
    ):
        setattr(args, field, getattr(args, field).resolve())
    if args.output.exists():
        raise FileExistsError("Refuse to overwrite an earlier attempt")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    os.environ["HERMES_SOURCE"] = str(args.source)
    sys.path[:0] = [
        str(ROOT / "apps/engine/tests"),
        str(ROOT / "apps/engine/src"),
        str(args.source),
    ]
    from dotenv import dotenv_values
    from ngertiin_engine.runtime import verify

    verify(args.source)
    credentials = dotenv_values(args.env_file)
    settings(credentials)
    print(
        "Protocol SHA-256 " + hashlib.sha256(args.protocol.read_bytes()).hexdigest(),
        flush=True,
    )
    if args.surface == "lifecycle":
        lifecycle(args, credentials)
    else:
        paired(args, credentials)


if __name__ == "__main__":
    main()
