"""Paired live-model smoke baseline using disposable pinned native gateways.

Each invocation runs one surface in its own process. Application HTTP uses the
existing fixed-account test dependency; it does not impersonate production Clerk.
"""

import argparse
import asyncio
import hashlib
import json
import os
import re
import sqlite3
import subprocess
import sys
import tempfile
import time
from contextlib import ExitStack
from pathlib import Path
from urllib.error import HTTPError
from uuid import uuid4

from results import oracle, validate

ROOT = Path(__file__).resolve().parents[3]
PROTOCOL = Path(__file__).with_name("protocol.json")
SCRIPT_HASH = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
SUPPORTED = {"short_dm", "long_dm", "multi_step_tools", "restart", "reconnect"}


class InvocationError(Exception):
    pass


def native_tools(database, session_id):
    with sqlite3.connect(f"file:{database}?mode=ro", uri=True) as db:
        db.row_factory = sqlite3.Row
        return [
            dict(row)
            for row in db.execute(
                "SELECT role,tool_calls,tool_call_id,tool_name,content FROM messages WHERE session_id=? AND (tool_calls IS NOT NULL OR role='tool') ORDER BY id",
                (session_id,),
            )
        ]


def finish_runtime(fixture):
    # Teardown is after yield in the imported fixture; close() would skip it.
    next(fixture, None)


def close_api(api):
    process = api.gi_frame.f_locals.get("process") if api.gi_frame else None
    try:
        api.close()
    except subprocess.TimeoutExpired:
        if process is not None:
            process.kill()
            process.wait(timeout=10)


def redact(value, secrets):
    text = json.dumps(value, ensure_ascii=False)
    for secret in sorted((s for s in secrets if s), key=len, reverse=True):
        text = text.replace(secret, "[REDACTED]")
    text = re.sub(r"sk-[a-zA-Z0-9_-]{12,}", "[REDACTED]", text)
    return json.loads(text)


def prompt(case):
    if case["id"] == "long_dm":
        return (
            case["prompt"]
            + "\n"
            + " ".join(f"synthetic_{i}={i % 101}" for i in range(12000))
            + "\nReturn the exact code from the first sentence."
        )
    return case["prompt"]


def base_row(args, case, repeat, settings):
    return {
        "surface": args.surface,
        "scenario": case["id"],
        "repeat": repeat,
        "attempt_id": str(uuid4()),
        "protocol_sha256": hashlib.sha256(PROTOCOL.read_bytes()).hexdigest(),
        "settings": settings,
        "status": "failed",
        "category": "unknown",
        "oracle_passed": False,
        "timings_s": {},
        "lineage": {},
        "harness_sha256": SCRIPT_HASH,
    }


def write(args, row, secrets):
    row = redact(validate(row), secrets)
    with args.output.open("a") as out:
        out.write(json.dumps(row, ensure_ascii=False) + "\n")
    print(
        json.dumps(
            {k: row[k] for k in ("surface", "scenario", "repeat", "status", "category")}
        ),
        flush=True,
    )


async def direct(args, credentials, settings, cases):
    from tests.gateway.fixtures.local_recovery_probe import (
        child_env,
        daemon,
        rpc,
        websocket,
    )

    root = Path(tempfile.mkdtemp(prefix="nma028-direct-", dir="/tmp")).resolve()
    home, user, workspace = (root / name for name in ("state", "user", "workspace"))
    for path in (home, user, workspace):
        path.mkdir(mode=0o700)
    (home / "config.yaml").write_text(
        json.dumps(
            {
                "gateway": {"multiplex_profiles": False},
                "model": {
                    "provider": "custom",
                    "default": credentials["OPENAI_MODEL"],
                    "base_url": settings["endpoint"],
                },
                "agent": {"max_turns": 8},
                "platform_toolsets": {"cli": ["todo"]},
                "auxiliary": {"title_generation": {"enabled": False}},
                "terminal": {"cwd": str(workspace)},
            }
        )
    )
    env = child_env() | {
        "HOME": str(user),
        "USERPROFILE": str(user),
        "HERMES_HOME": str(home),
        "PYTHONPATH": str(args.source),
        "OPENAI_API_KEY": credentials["OPENAI_API_KEY"],
        "OPENAI_BASE_URL": settings["endpoint"],
        "PYTHONUNBUFFERED": "1",
        "HERMES_DISABLE_LAZY_INSTALLS": "1",
    }
    with ExitStack() as stack:
        process, descriptor = stack.enter_context(
            daemon(args.source, home, env, barrier=False)
        )
        for case in cases:
            for repeat in range(1, 4):
                row = base_row(args, case, repeat, settings)
                try:
                    if case["id"] not in SUPPORTED:
                        row.update(
                            status="blocked",
                            category="prerequisite",
                            gap="Requires instrumented browser environment or lifecycle fixture; not executed by the live paired smoke worker. See separate native/fault evidence.",
                        )
                        write(args, row, [credentials["OPENAI_API_KEY"]])
                        continue
                    async with websocket(home, descriptor) as ws:
                        created = await rpc(
                            ws,
                            "session.create",
                            request_id=row["attempt_id"],
                            source="cli",
                            cwd=str(workspace),
                            toolsets=["todo"],
                            ignore_rules=True,
                        )
                        if "error" in created:
                            raise ValueError(created)
                        sid = created["result"]["session_id"]
                        initial = (await rpc(ws, "session.resume", session_id=sid))[
                            "result"
                        ]
                        started = time.monotonic()
                        submitted = await rpc(
                            ws,
                            "prompt.submit",
                            session_id=sid,
                            input_id=row["attempt_id"],
                            text=prompt(case),
                        )
                        row["timings_s"]["admission"] = time.monotonic() - started
                    row["lineage"] = {
                        "session_id": sid,
                        "admission": submitted,
                        "input_id": row["attempt_id"],
                    }
                    # Every poll opens a fresh authenticated connection: ingress can be offline.
                    async with websocket(home, descriptor) as ws:
                        deadline = time.monotonic() + 180
                        trace, final = [], ""
                        while time.monotonic() < deadline:
                            response = await rpc(
                                ws,
                                "session.events.since",
                                session_id=sid,
                                replay_epoch=initial["replay_epoch"],
                                last_sequence=initial["last_sequence"],
                            )
                            trace = response["result"]["events"]
                            if (
                                any(
                                    e.get("type") in {"tool.start", "message.delta"}
                                    for e in trace
                                )
                                and "first_progress" not in row["timings_s"]
                            ):
                                row["timings_s"]["first_progress"] = (
                                    time.monotonic() - started
                                )
                            complete = [
                                e for e in trace if e.get("type") == "message.complete"
                            ]
                            if complete:
                                final = complete[-1]["payload"].get("text", "")
                                break
                            await asyncio.sleep(0.2)
                        else:
                            raise TimeoutError("Native settlement deadline exceeded")
                        row["timings_s"]["settlement"] = time.monotonic() - started
                        before = (await rpc(ws, "session.resume", session_id=sid))[
                            "result"
                        ]
                    row["trace"] = trace
                    row["final"] = final
                    row["native_tools"] = native_tools(home / "state.db", sid)
                    passed = oracle(case["id"], final, row["native_tools"])
                    if case["id"] == "restart":
                        process.kill()
                        process.wait(timeout=10)
                        recovery = time.monotonic()
                        process, descriptor = stack.enter_context(
                            daemon(args.source, home, env, barrier=False)
                        )
                        row["timings_s"]["recovery"] = time.monotonic() - recovery
                        async with websocket(home, descriptor) as ws:
                            after = (await rpc(ws, "session.resume", session_id=sid))[
                                "result"
                            ]
                            retry = await rpc(
                                ws,
                                "prompt.submit",
                                session_id=sid,
                                input_id=row["attempt_id"],
                                text=prompt(case),
                            )
                        passed = (
                            passed
                            and before["messages"] == after["messages"]
                            and submitted["result"].get("admission_id")
                            == retry["result"].get("admission_id")
                        )
                        row["restart_receipt"] = retry
                    row.update(
                        status="passed" if passed else "failed",
                        category="none" if passed else "oracle",
                        oracle_passed=passed,
                    )
                except Exception as error:  # noqa: BLE001 - retain every failed attempt
                    row.update(
                        error=type(error).__name__ + ": " + str(error),
                        category="unknown",
                    )
                write(args, row, [credentials["OPENAI_API_KEY"]])


def adapted(args, credentials, settings, cases):
    # Reuse exact reviewed process/bootstrap fixtures, not a replacement model loop.
    from test_capabilities import capability_agent
    from test_direct_messages import public_api, send
    from test_runtime import command, runtime

    os.environ["NMA_TEST_LIVE_ENV"] = str(args.env_file)
    fixture = runtime.__wrapped__(None)
    state = next(fixture)
    root, _server, call, start, *_ = state
    (root / "capabilities.json").write_text(
        json.dumps({"tool_grants": {"tasks": {"enabled": True, "toolset": "todo"}}})
    )
    api = None
    try:
        if args.surface == "application":
            api = public_api.__wrapped__(state)
            request = next(api)

        def invoke(body):
            if api:
                try:
                    return json.load(request("/commands", body))
                except HTTPError as error:
                    raise InvocationError(
                        f"HTTP {error.code}: {error.read().decode()}"
                    ) from error
            reply = call(body)
            if "error" in reply:
                raise InvocationError(json.dumps(reply["error"]))
            return reply["result"]

        for case in cases:
            for repeat in range(1, 4):
                row = base_row(args, case, repeat, settings)
                row["differences"] = (
                    [
                        "Ngertiin injects product identity, scoped context and automatic goal tools; native direct does not.",
                        "The public HTTP fixture overrides current_account with a fixed disposable owner; production Clerk/UI acceptance remains open.",
                    ]
                    if api
                    else [
                        "Product identity/context/goal tools are injected. Requests use signed internal commands."
                    ]
                )
                try:
                    if case["id"] not in SUPPORTED:
                        row.update(
                            status="blocked",
                            category="prerequisite",
                            gap="Requires instrumented browser or lifecycle fixture; separate deterministic tests are not a live paired pass.",
                        )
                        write(args, row, [credentials["OPENAI_API_KEY"]])
                        continue
                    agent = capability_agent(
                        call,
                        "b" + row["attempt_id"].replace("-", "")[:12],
                        tool_grants=["tasks"],
                    )
                    thread = call(
                        command(
                            "thread.create",
                            {
                                "kind": "dm",
                                "title": "Baseline",
                                "agent_ids": [agent["agent_id"]],
                            },
                        )
                    )["result"]["thread"]
                    body = send(thread, prompt(case))
                    started = time.monotonic()
                    receipt = invoke(body)
                    row["timings_s"]["admission"] = time.monotonic() - started
                    run_id = receipt["run_id"]
                    row["lineage"] = {
                        "command_id": body["command_id"],
                        "request_key": body["payload"]["request_key"],
                        "run_id": run_id,
                        "thread_id": thread["thread_id"],
                        "agent_id": agent["agent_id"],
                    }
                    deadline = time.monotonic() + 180
                    while time.monotonic() < deadline:
                        run = call(command("runtime.read", {"run_id": run_id}))[
                            "result"
                        ]
                        events = call(
                            command(
                                "runtime.events",
                                {
                                    "run_id": run_id,
                                    "replay_epoch": None,
                                    "last_sequence": "0",
                                },
                            )
                        )["result"]["events"]
                        if (
                            any(
                                e["type"] in {"tool.started", "message.delta"}
                                for e in events
                            )
                            and "first_progress" not in row["timings_s"]
                        ):
                            row["timings_s"]["first_progress"] = (
                                time.monotonic() - started
                            )
                        if run["status"] not in {"queued", "running"}:
                            break
                        time.sleep(0.2)
                    else:
                        raise TimeoutError("Adapter settlement deadline exceeded")
                    row["timings_s"]["settlement"] = time.monotonic() - started
                    diag = (
                        json.load(request(f"/runs/{run_id}/diagnostics"))
                        if api
                        else call(command("run.diagnostics", {"run_id": run_id}))[
                            "result"
                        ]
                    )
                    snap = call(
                        command("thread.snapshot", {"thread_id": thread["thread_id"]})
                    )["result"]
                    final = "\n".join(
                        m["content"]
                        for m in snap["messages"]
                        if m["run_id"] == run_id and m["author_kind"] == "agent"
                    )
                    # Diagnostics contain product tool lifecycle events; preserve their native names.
                    row.update(diagnostics=diag, final=final)
                    with sqlite3.connect(
                        f"file:{root / 'state/state.db'}?mode=ro", uri=True
                    ) as db:
                        admission, sid = db.execute(
                            "SELECT r.native_admission_id,b.native_session_id FROM nma_adapter_runs r JOIN nma_adapter_bindings b ON b.binding_id=r.binding_id WHERE r.run_id=?",
                            (run_id,),
                        ).fetchone()
                    row["lineage"].update(
                        native_admission_id=admission, native_session_id=sid
                    )
                    row["native_tools"] = native_tools(root / "state/state.db", sid)
                    passed = run["status"] == "succeeded" and oracle(
                        case["id"], final, row["native_tools"]
                    )
                    if case["id"] == "restart":
                        start.current.kill()
                        start.current.wait(timeout=10)
                        recovery = time.monotonic()
                        start()
                        row["timings_s"]["recovery"] = time.monotonic() - recovery
                        after = call(
                            command(
                                "thread.snapshot", {"thread_id": thread["thread_id"]}
                            )
                        )["result"]
                        retry = invoke(body)
                        passed = (
                            passed
                            and snap["messages"] == after["messages"]
                            and retry["run_id"] == run_id
                        )
                        row["restart_receipt"] = retry
                    if case["id"] == "reconnect" and api:
                        endpoint = "/events?thread_id=" + thread["thread_id"]
                        with request(endpoint) as stream:
                            seen = []
                            while len(seen) < 2:
                                line = stream.readline().decode().strip()
                                if line.startswith("data: "):
                                    event = json.loads(line[6:])
                                    if (
                                        event.get("type") == "message.created"
                                        and event.get("run_id") == run_id
                                    ):
                                        seen.append(event["event_id"])
                        passed = passed and len(set(seen)) == 2
                        row["reconnect_message_events"] = seen
                    row.update(
                        status="passed" if passed else "failed",
                        category="none" if passed else "oracle",
                        oracle_passed=passed,
                    )
                except Exception as error:  # noqa: BLE001 - retain every failed attempt
                    row.update(
                        error=type(error).__name__ + ": " + str(error),
                        category="integration"
                        if isinstance(error, InvocationError)
                        else "unknown",
                    )
                write(args, row, [credentials["OPENAI_API_KEY"]])
    finally:
        try:
            if api:
                close_api(api)
        finally:
            finish_runtime(fixture)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument(
        "--surface", choices=["direct", "adapter", "application"], required=True
    )
    parser.add_argument("--env-file", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.output.exists():
        raise ValueError("Refusing to overwrite attempts; choose a fresh output")
    args.source, args.env_file = args.source.resolve(), args.env_file.resolve()
    sys.path[:0] = [
        str(ROOT / "apps/engine/tests"),
        str(ROOT / "apps/engine/src"),
        str(args.source),
    ]
    os.environ["HERMES_SOURCE"] = str(args.source)
    from ngertiin_engine.runtime import verify

    verify(args.source)
    from dotenv import dotenv_values

    credentials = dotenv_values(args.env_file)
    if not credentials.get("OPENAI_API_KEY") or not credentials.get("OPENAI_MODEL"):
        raise ValueError("Explicit provider credentials/model required")
    settings = {
        "model": credentials["OPENAI_MODEL"],
        "endpoint": credentials.get("OPENAI_BASE_URL") or "https://api.openai.com/v1",
        "provider": "custom",
        "tools": ["todo"],
        "max_turns": 8,
        "python": sys.version.split()[0],
        "runtime_revision": json.loads(PROTOCOL.read_text())["upstream_revision"],
    }
    cases = json.loads(PROTOCOL.read_text())["scenarios"]
    if args.surface == "direct":
        asyncio.run(direct(args, credentials, settings, cases))
    else:
        adapted(args, credentials, settings, cases)
