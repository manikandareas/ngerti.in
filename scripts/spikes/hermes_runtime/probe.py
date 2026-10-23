"""Run the pinned Hermes canonical gateway with two profiles and a real model.

This spike imports upstream native-socket probe helpers without modifying Hermes.
Their source and MIT notice are recorded in the accompanying audit.
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import os
import re
import shutil
import sys
import time
from contextlib import ExitStack
from pathlib import Path


def save(path: Path, value: object) -> None:
    path.write_text(
        json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--env-file", type=Path, required=True)
    args = parser.parse_args()
    source, output = args.source.resolve(), args.output.resolve()
    output.mkdir(parents=True, exist_ok=False)
    home = output / "state"
    home.mkdir(mode=0o700)
    os.environ["HERMES_HOME"] = str(home)
    sys.path.insert(0, str(source))

    from dotenv import dotenv_values
    from hermes_cli.profiles import create_profile, list_profile_names
    from tests.gateway.fixtures.local_recovery_probe import (
        child_env,
        daemon,
        rpc,
        websocket,
    )

    credentials = dotenv_values(args.env_file)
    api_key = credentials.get("OPENAI_API_KEY")
    model = credentials.get("OPENAI_MODEL")
    base_url = credentials.get("OPENAI_BASE_URL") or "https://api.openai.com/v1"
    if not api_key or not model:
        raise ValueError("OPENAI_API_KEY and OPENAI_MODEL are required")
    writer = create_profile("writer", no_alias=True, no_skills=True)
    config = {
        "model": {"provider": "custom", "default": model, "base_url": base_url},
        "agent": {"reasoning_effort": "low", "max_turns": 4},
        "platform_toolsets": {"cli": [], "gui": [], "bot_room": []},
        "auxiliary": {"title_generation": {"enabled": False}},
        "terminal": {"cwd": str(home / "workspace")},
        "hosted_rooms": {"profiles": {"writer": str(writer)}},
    }
    (home / "workspace").mkdir(exist_ok=True)
    save(home / "config.yaml", config)
    save(writer / "config.yaml", {**config, "gateway": {"standalone": True}})
    souls = {
        home: "You are Researcher. Start every contribution with RESEARCHER_PROOF. "
        "Calculate from the supplied facts, then ask @writer to produce the final report. "
        "Keep your response under 100 words. Do not invent facts.",
        writer: "You are Writer. Start every contribution with WRITER_PROOF. "
        "Write a concise final report using the supplied facts and Researcher's calculation. "
        "Do not mention another agent after completing the report. Keep it under 120 words.",
    }
    for profile, soul in souls.items():
        (profile / "SOUL.md").write_text(soul + "\n", encoding="utf-8")
        secret_file = profile / ".env"
        secret_file.write_text("OPENAI_API_KEY=" + api_key + "\n", encoding="utf-8")
        secret_file.chmod(0o600)
    env = child_env() | {
        "HERMES_HOME": str(home),
        "PYTHONPATH": str(source),
        "PYTHONUNBUFFERED": "1",
        "OPENAI_API_KEY": api_key,
        "OPENAI_BASE_URL": base_url,
    }
    members = [
        {"member_id": "researcher", "profile": "default", "handle": "researcher"},
        {"member_id": "writer", "profile": "writer", "handle": "writer"},
    ]
    request = {
        "room_id": "fleet-report",
        "event_id": "fleet-input-1",
        "payload": {
            "thread_id": "fleet-thread",
            "text": "@researcher Prepare a fleet efficiency report with Writer. Verified facts: "
            "vehicle Alpha travelled 1500 km and used 120 litres of fuel. Calculate litres "
            "per 100 km, then hand the result to @writer for a final report. No external research.",
        },
    }
    evidence = {
        "model": model,
        "provider_base_url": base_url,
        "profiles": list_profile_names(),
        "soul_sha256": {
            p.name: hashlib.sha256(s.encode()).hexdigest() for p, s in souls.items()
        },
        "runs": [],
    }

    async def call(ws, method: str, **params):
        reply = await rpc(ws, method, **params)
        if "error" in reply:
            raise RuntimeError(f"{method}: {reply['error']}")
        return reply["result"]

    async def settled(ws, minimum: int):
        deadline = time.monotonic() + 180
        while time.monotonic() < deadline:
            state = await call(ws, "groups.state", room_id="fleet-report")
            log = await call(ws, "groups.log", room_id="fleet-report")
            save(output / "latest-state.json", state)
            save(output / "latest-log.json", log)
            counts = state["driver_status"]["counts"]
            if counts.get("settled", 0) >= minimum and not state["driver_status"].get(
                "working"
            ):
                return state, log
            if counts.get("failed") or counts.get("indeterminate"):
                raise RuntimeError(f"Room did not settle: {counts}")
            await asyncio.sleep(0.25)
        raise TimeoutError("Hosted room did not finish within 180 seconds")

    async def first(desc):
        async with websocket(home, desc) as ws:
            capabilities = await call(ws, "groups.capabilities")
            assert capabilities["driver"], capabilities
            save(output / "capabilities.json", capabilities)
            await call(
                ws,
                "groups.create",
                room_id="fleet-report",
                name="Fleet report",
                members=members,
            )
            accepted = await call(ws, "groups.send", **request)
            assert accepted["accepted"], accepted
        # The socket is closed while the gateway performs the actual work.
        async with websocket(home, desc) as ws:
            state, log = await settled(ws, 2)
        events = log["events"]
        messages = [e for e in events if e["kind"] == "message.member"]
        assert len(messages) == 2, messages
        assert [m["actor"]["id"] for m in messages] == ["researcher", "writer"], (
            messages
        )
        assert "RESEARCHER_PROOF" in messages[0]["payload"]["text"], messages
        assert "WRITER_PROOF" in messages[1]["payload"]["text"], messages
        assert re.search(r"\b8(?:\.0+)?\b", messages[1]["payload"]["text"]), messages
        save(output / "first-transcript.json", log)
        (output / "fleet-report.md").write_text(
            messages[1]["payload"]["text"] + "\n", encoding="utf-8"
        )
        return state, log

    async def restarted(desc, original):
        async with websocket(home, desc) as ws:
            before = await call(ws, "groups.log", room_id="fleet-report")
            assert before["events"] == original["events"], (
                "Transcript changed across restart"
            )
            duplicate = await call(ws, "groups.send", **request)
            after = await call(ws, "groups.log", room_id="fleet-report")
            assert after["events"] == original["events"], (
                "Duplicate admission changed the log"
            )
            await call(
                ws,
                "groups.send",
                room_id="fleet-report",
                event_id="fleet-input-2",
                payload={
                    "thread_id": "fleet-thread",
                    "text": "@writer Restate the verified fuel efficiency in one sentence. "
                    "Use the existing facts; do not ask another agent.",
                },
            )
            state, log = await settled(ws, 3)
        messages = [e for e in log["events"] if e["kind"] == "message.member"]
        assert len(messages) == 3, messages
        assert messages[-1]["actor"]["id"] == "writer", messages
        assert "WRITER_PROOF" in messages[-1]["payload"]["text"], messages
        assert re.search(r"\b8(?:\.0+)?\b", messages[-1]["payload"]["text"]), messages
        assert sum(e["kind"] == "message.user" for e in log["events"]) == 2
        save(output / "restart-transcript.json", log)
        return {
            "counts": state["driver_status"]["counts"],
            "duplicate_receipt": duplicate,
            "transcript_preserved": True,
            "duplicate_suppressed": True,
            "followup_settled": True,
        }

    try:
        for phase in ("first", "restart"):
            with ExitStack() as stack:
                stack.enter_context(
                    daemon(
                        source,
                        writer,
                        env | {"HERMES_HOME": str(writer)},
                        barrier=False,
                    )
                )
                process, descriptor = stack.enter_context(
                    daemon(source, home, env, barrier=False)
                )
                print(f"{phase}: native gateway ready; pid={process.pid}", flush=True)
                evidence["runs"].append(
                    {
                        "phase": phase,
                        "pid": process.pid,
                        "epoch": descriptor["authority_epoch"],
                    }
                )
                if phase == "first":
                    state, original = asyncio.run(first(descriptor))
                    evidence["first_counts"] = state["driver_status"]["counts"]
                else:
                    evidence["restart"] = asyncio.run(restarted(descriptor, original))
            for name, profile in (("researcher", home), ("writer", writer)):
                shutil.copyfile(profile / "restart.log", output / f"{phase}-{name}.log")
            print(f"{phase}: verified", flush=True)
        assert evidence["runs"][1]["epoch"] > evidence["runs"][0]["epoch"]
        evidence["passed"] = True
    finally:
        save(output / "result.json", evidence)
        for profile in souls:
            (profile / ".env").unlink(missing_ok=True)
    print(json.dumps(evidence, indent=2), flush=True)


if __name__ == "__main__":
    main()
