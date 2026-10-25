"""Execute the closure matrix with real models, native tools and real Clerk auth.

The original baseline is immutable. This is the explicitly versioned native
placement candidate, with production product scopes and final-dispatch fences.
"""

import argparse
import asyncio
import contextlib
import hashlib
import json
import os
import shlex
import sqlite3
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from urllib.request import Request, urlopen
from uuid import NAMESPACE_URL, uuid4, uuid5

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).parent
PROTOCOL = HERE / "protocol-closure.json"
EXPECTED_CSV = "b611b0fafb38f99c14d214548fe8f89e1a7839670c66bb72e2824c9eb181dfb4"


class ProviderUnavailable(RuntimeError):
    pass


def check_provider(text):
    if any(
        value in text.lower()
        for value in (
            "no credits remaining",
            "billing or credits exhausted",
            "insufficient_quota",
        )
    ):
        raise ProviderUnavailable(
            "Configured model provider reports exhausted credits; no tool task was substituted."
        )


def dump(path, value):
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n")


def wait_until(read, accept, timeout=180):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        value = read()
        if accept(value):
            return value
        time.sleep(0.2)
    raise TimeoutError("Closure scenario deadline exceeded")


class Product:
    def __init__(self, args):
        import test_runtime
        from baseline import finish_runtime
        from isolated_tools import IsolatedTools

        self.args = args
        self.auth = json.loads(args.auth_state.read_text())
        self.identity_index = 0 if args.surface == "application" else 1
        self.owner = self.auth["identities"][self.identity_index]["owner_id"]
        self.control = args.control_dir
        self.broker = IsolatedTools(self.control, self.owner)
        self.process_wrapper = args.output.parent / (args.surface + "-python")
        python = Path(sys.executable).absolute()
        command = [
            "env",
            "NMA028_OWNER_ID=" + self.owner,
            "NMA028_CONTROL_DIR=" + str(self.control),
            "NMA028_SURFACE=" + args.surface,
            str(python),
            str(HERE / "spike_gateway.py"),
        ]
        self.process_wrapper.write_text("#!/bin/sh\nexec " + shlex.join(command) + "\n")
        self.process_wrapper.chmod(0o700)
        test_runtime.OWNER = self.owner
        test_runtime.RUNTIME_PYTHON = str(self.process_wrapper)
        if getattr(args, "synthetic", False):
            os.environ.pop("NMA_TEST_LIVE_ENV", None)
        else:
            os.environ["NMA_TEST_LIVE_ENV"] = str(args.env_file)
        self.fixture = test_runtime.runtime.__wrapped__(None)
        self.state = next(self.fixture)
        self.root, _provider, self.call, self.start, *_ = self.state
        self.command = test_runtime.command
        (self.root / "capabilities.json").write_text(
            json.dumps(
                {
                    "tool_grants": {
                        "native": {"enabled": True, "toolset": "nma_computer"},
                        "tasks": {"enabled": True, "toolset": "todo"},
                        "files": {"enabled": True, "toolset": "nma_workspace"},
                    }
                }
            )
        )
        registry_path = Path(self.auth["registry"])
        registry = (
            json.loads(registry_path.read_text()) if registry_path.exists() else {}
        )
        registry.update(
            {
                self.owner: {
                    "key_file": str(self.root / "key"),
                    "socket": str(self.root / "state/nma.sock"),
                }
            }
        )
        registry_path.write_text(json.dumps(registry))
        self.finish_runtime = finish_runtime

    def http(self, path, body=None, identity=0, headers=None):
        current = json.loads(self.args.auth_state.read_text())
        jwt = current["identities"][identity]["jwt"]
        data = json.dumps(body).encode() if body is not None else None
        request = Request(
            current["base"] + path,
            data=data,
            headers={
                "Authorization": "Bearer " + jwt,
                "Content-Type": "application/json",
                **(headers or {}),
            },
        )
        return urlopen(request, timeout=35)

    def invoke(self, body):
        if self.args.surface == "application":
            with self.http("/api/agent-engine/v1/commands", body) as response:
                return json.load(response)
        response = self.call(body)
        if "error" in response:
            raise ValueError(response["error"])
        return response["result"]

    def create(self, group=False):
        from isolated_tools import Scope
        from test_capabilities import capability_agent

        handles = ["researcher", "writer", "reviewer"] if group else ["baseline"]
        agent_call = (
            (lambda body: {"result": self.invoke(body)})
            if self.args.surface == "application"
            else self.call
        )
        agents = [
            capability_agent(
                agent_call,
                h + "-" + uuid4().hex[:8],
                tool_grants=["native", "tasks", "files"],
            )
            for h in handles
        ]
        thread = self.invoke(
            self.command(
                "thread.create",
                {
                    "kind": "group" if group else "dm",
                    "title": "Closure baseline",
                    "agent_ids": [a["agent_id"] for a in agents],
                },
            )
        )["thread"]
        scope = Scope(self.owner, agents[0]["agent_id"], thread["thread_id"])
        return {"thread": thread, "agents": agents, "scope": scope}

    def send(self, conversation, text):
        from test_direct_messages import send

        command = send(conversation["thread"], text)
        started = time.monotonic()
        receipt = self.invoke(command)
        return {
            "command": command,
            "receipt": receipt,
            "started": started,
            "admission_s": time.monotonic() - started,
        }

    def settled(self, conversation, submission):
        run_id = submission["receipt"]["run_id"]
        progress = None

        def read():
            nonlocal progress
            events = self.call(
                self.command(
                    "runtime.events",
                    {"run_id": run_id, "replay_epoch": None, "last_sequence": "0"},
                )
            )["result"]["events"]
            if progress is None and any(
                e["type"] in {"message.delta", "tool.started"} for e in events
            ):
                progress = time.monotonic() - submission["started"]
            if self.args.surface == "application":
                with self.http("/api/agent-engine/v1/runs/" + run_id) as response:
                    return json.load(response)
            return self.call(self.command("runtime.read", {"run_id": run_id}))["result"]

        value = wait_until(
            read,
            lambda r: r["status"] not in {"queued", "running"},
            timeout=180,
        )
        snap = self.snapshot(conversation)
        diagnostics = self.call(self.command("run.diagnostics", {"run_id": run_id}))[
            "result"
        ]
        with sqlite3.connect(self.root / "state/state.db") as db:
            row = db.execute(
                "SELECT r.native_admission_id,b.native_session_id FROM nma_adapter_runs r JOIN nma_adapter_bindings b ON b.binding_id=r.binding_id WHERE r.run_id=?",
                (run_id,),
            ).fetchone()
            stored = db.execute(
                "SELECT value FROM state_meta WHERE key=?",
                ("gateway.admission.result.v1." + row[0],),
            ).fetchone()
        if stored:
            from hermes_state_terminal import load_result

            native = load_result(stored[0]).get("result", {})
            check_provider(
                str(native.get("final_response", ""))
                + " "
                + str(native.get("error", ""))
            )
        text = "\n".join(
            m["content"]
            for m in snap["messages"]
            if m.get("run_id") == run_id and m["author_kind"] == "agent"
        )
        return {
            "text": text,
            "state": value,
            "snapshot": snap,
            "diagnostics": diagnostics,
            "native_admission_id": row[0],
            "native_session_id": row[1],
            "settlement_s": time.monotonic() - submission["started"],
            "first_progress_s": progress,
        }

    def snapshot(self, conversation):
        if self.args.surface == "application":
            with self.http(
                "/api/agent-engine/v1/threads/"
                + conversation["thread"]["thread_id"]
                + "/snapshot"
            ) as response:
                return json.load(response)
        return self.call(
            self.command(
                "thread.snapshot", {"thread_id": conversation["thread"]["thread_id"]}
            )
        )["result"]

    def restart(self):
        self.start.current.kill()
        self.start.current.wait(timeout=10)
        started = time.monotonic()
        self.start()
        return time.monotonic() - started

    def cancel(self, conversation, submission):
        return self.invoke(
            self.command("run.cancel", {"run_id": submission["receipt"]["run_id"]})
        )

    def close(self):
        try:
            self.finish_runtime(self.fixture)
        finally:
            self.broker.cleanup()


class Native:
    def __init__(self, args, credentials):
        from isolated_tools import IsolatedTools
        from tests.gateway.fixtures.local_recovery_probe import child_env

        self.args = args
        self.owner = str(uuid4())
        self.control = args.control_dir
        self.broker = IsolatedTools(self.control, self.owner)
        self.root = Path(tempfile.mkdtemp(prefix="n28-native-", dir="/tmp")).resolve()
        self.home = self.root / "state"
        self.home.mkdir(mode=0o700)
        self.workspace = self.root / "workspace"
        self.workspace.mkdir()
        self.env = child_env() | {
            "HERMES_HOME": str(self.home),
            "HERMES_SOURCE": str(args.source),
            "NMA028_OWNER_ID": self.owner,
            "NMA028_CONTROL_DIR": str(self.control),
            "NMA028_SURFACE": "direct",
            "PYTHONPATH": os.pathsep.join(
                [str(ROOT / "apps/engine/src"), str(args.source)]
            ),
            "OPENAI_API_KEY": credentials["OPENAI_API_KEY"],
            "OPENAI_BASE_URL": credentials.get("OPENAI_BASE_URL")
            or "https://api.openai.com/v1",
            "HERMES_DISABLE_LAZY_INSTALLS": "1",
        }
        dump(
            self.home / "config.yaml",
            {
                "model": {
                    "provider": "custom",
                    "default": credentials["OPENAI_MODEL"],
                    "base_url": self.env["OPENAI_BASE_URL"],
                },
                "agent": {"max_turns": 8},
                "platform_toolsets": {"cli": ["todo", "nma_computer"]},
                "auxiliary": {"title_generation": {"enabled": False}},
                "terminal": {"cwd": str(self.workspace)},
            },
        )
        self.processes = []
        self.boot()

    def boot(self):
        from tests.gateway.test_normal_runtime_boot import control

        log = (self.root / f"native-{len(self.processes)}.log").open("w")
        self.process = subprocess.Popen(
            [sys.executable, str(HERE / "spike_gateway.py")],
            cwd=self.args.source,
            env=self.env,
            stdout=log,
            stderr=log,
        )
        self.processes.append(self.process)
        self.descriptor = wait_until(
            lambda: self.identify(control),
            lambda d: d.get("state") == "ready",
            timeout=90,
        )

    def identify(self, control):
        if self.process.poll() is not None:
            raise RuntimeError(
                "Native gateway failed startup; inspect private log " + str(self.root)
            )
        try:
            return control(self.home, "identify")
        except (OSError, ValueError):
            return {}

    def rpc(self, method, **params):
        from tests.gateway.fixtures.local_recovery_probe import rpc, websocket

        async def request():
            async with websocket(self.home, self.descriptor) as ws:
                if params.get("session_id") and method != "session.resume":
                    attached = await rpc(
                        ws, "session.resume", session_id=params["session_id"]
                    )
                    if "error" in attached:
                        return attached
                return await rpc(ws, method, **params)

        result = asyncio.run(request())
        if "error" in result:
            raise ValueError({"method": method, "error": result["error"]})
        return result["result"]

    def create(self, group=False):
        from isolated_tools import Scope

        if group:
            raise ValueError(
                "Native groups are executed by the canonical lifecycle companion"
            )
        created = self.rpc(
            "session.create",
            request_id=str(uuid4()),
            source="cli",
            cwd=str(self.workspace),
            toolsets=["todo", "nma_computer"],
            ignore_rules=True,
        )
        sid = created["session_id"]
        scope = Scope(
            self.owner,
            str(uuid5(NAMESPACE_URL, self.owner + ":profile:" + str(self.home))),
            str(uuid5(NAMESPACE_URL, self.owner + ":session:" + sid)),
        )
        return {
            "sid": sid,
            "scope": scope,
            "initial": self.rpc("session.resume", session_id=sid),
        }

    def send(self, conversation, text):
        ident = str(uuid4())
        started = time.monotonic()
        receipt = self.rpc(
            "prompt.submit", session_id=conversation["sid"], input_id=ident, text=text
        )
        return {
            "command": {"input_id": ident, "text": text},
            "receipt": receipt,
            "started": started,
            "admission_s": time.monotonic() - started,
        }

    def settled(self, conversation, submission):
        initial = conversation["initial"]
        progress = None

        def read():
            nonlocal progress
            value = self.rpc(
                "session.events.since",
                session_id=conversation["sid"],
                replay_epoch=initial["replay_epoch"],
                last_sequence=initial["last_sequence"],
            )
            if progress is None and any(
                e.get("type") in {"tool.start", "message.delta"}
                for e in value.get("events", [])
            ):
                progress = time.monotonic() - submission["started"]
            return value

        replay = wait_until(
            read,
            lambda r: any(
                e.get("type") == "message.complete" for e in r.get("events", [])
            ),
            timeout=180,
        )
        final = [e for e in replay["events"] if e.get("type") == "message.complete"][
            -1
        ]["payload"].get("text", "")
        check_provider(final)
        snapshot = self.rpc("session.resume", session_id=conversation["sid"])
        conversation["initial"] = snapshot
        return {
            "text": final,
            "snapshot": snapshot,
            "trace": replay,
            "state": {"status": "succeeded"},
            "native_session_id": conversation["sid"],
            "native_admission_id": submission["receipt"].get("admission_id"),
            "settlement_s": time.monotonic() - submission["started"],
            "first_progress_s": progress,
        }

    def snapshot(self, conversation):
        return self.rpc("session.resume", session_id=conversation["sid"])

    def restart(self):
        self.process.kill()
        self.process.wait(timeout=10)
        started = time.monotonic()
        self.boot()
        return time.monotonic() - started

    def cancel(self, conversation, submission):
        snap = self.snapshot(conversation)
        return self.rpc(
            "session.interrupt",
            session_id=conversation["sid"],
            execution_generation=snap["execution_generation"],
        )

    def close(self):
        for p in self.processes:
            if p.poll() is None:
                p.terminate()
            try:
                p.wait(timeout=8)
            except subprocess.TimeoutExpired:
                p.kill()
                p.wait()
        self.broker.cleanup()


def case_prompt(ident):
    prompts = {
        "short_dm": "Reply with exactly NMA028_SHORT_42. Do not use tools.",
        "multi_step_tools": "Use todo_list to create two tasks: inspect ledger and verify total. Then in a separate tool call mark both completed. Finally reply NMA028_TOOLS_DONE.",
        "restart": "Reply with exactly NMA028_RESTART_42. Do not use tools.",
        "reconnect": "Reply with exactly NMA028_RECONNECT_42. Do not use tools.",
        "browser_navigation": "Use browser_exec to open http://127.0.0.1:8765/ and click its Continue link. Inspect the resulting DOM and URL, then report the observed URL ending /form. Use the actual browser.",
        "browser_form": "Use browser_exec to open http://127.0.0.1:8765/form. Fill input[name=name] with Synthetic and input[name=note] with NMA028. Submit the form once. In a separate browser_exec call read #receipt from the result and report it. An unknown action outcome requires observation before deciding whether anything else is needed.",
        "browser_download": "Use the browser to open http://127.0.0.1:8765/form. Set CDP Browser.setDownloadBehavior to allow downloads into /work/downloads with eventsEnabled=true, click the Download CSV link, then use terminal to verify sha256sum /work/downloads/report.csv. Do not use HTTP libraries or fetch to replace the browser download. Report the observed hash.",
        "cancellation": "Use terminal to run: sleep 20; printf forbidden > /work/after-stop . This synthetic delayed marker is a cancellation test; begin the terminal call now.",
    }
    return prompts[ident]


def journal_pending(broker, scope):
    if not broker.database.exists():
        return False
    with sqlite3.connect(broker.database) as db:
        return (
            db.execute(
                "SELECT 1 FROM operations WHERE scope_key=? AND tool='terminal' AND state='dispatching'",
                (scope.key,),
            ).fetchone()
            is not None
        )


def run_case(driver, case, repeat):
    from baseline import native_tools
    from results import oracle

    ident = case["id"]
    conversation = driver.create(group=ident == "group_handoff")
    row = {
        "surface": driver.args.surface,
        "scenario": ident,
        "repeat": repeat,
        "attempt_id": str(uuid4()),
        "protocol_sha256": hashlib.sha256(PROTOCOL.read_bytes()).hexdigest(),
        "status": "failed",
        "category": "unknown",
        "oracle_passed": False,
        "timings_s": {},
        "candidate": "Versioned scoped native-tool placement prototype; existing product auth/grant/context gates retained",
        "scope": conversation["scope"].__dict__,
        "differences": "Native direct uses canonical sessions; adapter uses product scope; application uses real Clerk auth. Lifecycle companion records native cron/group differences.",
    }
    submissions = []
    try:
        if ident == "long_dm":
            filler = (" synthetic-ledger 17 29 43" * 3000)[:64000]
            prompts = [
                "Remember NMA028_LONG_7319. Read this synthetic ledger and reply ACK.\n"
                + filler,
                "Read this additional synthetic ledger; retain the earlier marker and reply ACK.\n"
                + filler,
                "Return only the marker from the first message in this conversation.",
            ]
        elif ident in {"offline_goal", "group_handoff"}:
            return run_product_lifecycle(driver, conversation, row, ident)
        else:
            prompts = [case_prompt(ident)]
        for prompt in prompts:
            submission = driver.send(conversation, prompt)
            submissions.append(submission)
            row.setdefault("lineage", {}).setdefault("submissions", []).append(
                {
                    "receipt": submission["receipt"],
                    "command_id": submission["command"].get(
                        "command_id", submission["command"].get("input_id")
                    ),
                }
            )
            if ident == "cancellation":
                wait_until(
                    lambda: journal_pending(driver.broker, conversation["scope"]),
                    bool,
                    timeout=60,
                )
                stopped = time.monotonic()
                row["stop_receipt"] = driver.cancel(conversation, submission)
                time.sleep(2)
                observation = driver.broker.inspect(conversation["scope"])
                row["post_stop_observation"] = observation
                row["timings_s"]["recovery"] = driver.restart()
                # Observe beyond the original 20-second delayed effect, not only
                # immediately after the stop acknowledgement.
                time.sleep(max(0, 22 - (time.monotonic() - stopped)))
                after = driver.broker.inspect(conversation["scope"])
                row["after_original_delay"] = after
                with sqlite3.connect(driver.broker.database) as db:
                    scope_state = db.execute(
                        "SELECT state FROM scopes WHERE scope_key=?",
                        (conversation["scope"].key,),
                    ).fetchone()[0]
                row["stop_scope_state"] = scope_state
                passed = scope_state == "cancelled" and all(
                    f["path"] != "after-stop" for f in after["files"]
                )
                row.update(
                    status="user_stop" if passed else "failed",
                    category="user_stop" if passed else "integration",
                    oracle_passed=passed,
                )
                row["timings_s"]["stop_ack"] = time.monotonic() - stopped
                row["timings_s"]["settlement"] = (
                    time.monotonic() - submission["started"]
                )
                return row
            result = driver.settled(conversation, submission)
        row["result"] = result
        row["lineage"] = {
            k: result.get(k) for k in ("native_admission_id", "native_session_id")
        }
        row["lineage"]["submissions"] = [
            {
                "receipt": s["receipt"],
                "command_identity": s["command"].get(
                    "command_id", s["command"].get("input_id")
                ),
            }
            for s in submissions
        ]
        row["timings_s"] = {
            "admission": submissions[-1]["admission_s"],
            "settlement": result["settlement_s"],
            "first_progress": result.get("first_progress_s"),
        }
        row["native_tools"] = native_tools(
            driver.root / "state/state.db", result["native_session_id"]
        )
        if ident.startswith("browser_"):
            observed = driver.broker.inspect(conversation["scope"])
            row["observed"] = observed
            ledger = observed["ledger"]
            if ident == "browser_navigation":
                passed = any(x.get("path") == "/form" for x in ledger)
            elif ident == "browser_form":
                posts = [x for x in ledger if x.get("method") == "POST"]
                passed = (
                    len(posts) == 1
                    and posts[0].get("fields")
                    == {"name": ["Synthetic"], "note": ["NMA028"]}
                    and "NMA028_SAVED" in result["text"]
                )
            else:
                passed = (
                    any(
                        f["path"] == "downloads/report.csv"
                        and f["sha256"] == EXPECTED_CSV
                        for f in observed["files"]
                    )
                    and EXPECTED_CSV in result["text"]
                )
        else:
            tools = native_tools(
                driver.root / "state/state.db", result["native_session_id"]
            )
            row["native_tools"] = tools
            passed = oracle(ident, result["text"], tools)
        if ident == "restart":
            before = driver.snapshot(conversation)
            row["timings_s"]["recovery"] = driver.restart()
            after = driver.snapshot(conversation)
            passed = passed and before["messages"] == after["messages"]
            if isinstance(driver, Product):
                retry = driver.invoke(submissions[0]["command"])
                passed = (
                    passed and retry["run_id"] == submissions[0]["receipt"]["run_id"]
                )
            else:
                retry = driver.rpc(
                    "prompt.submit",
                    session_id=conversation["sid"],
                    **submissions[0]["command"],
                )
                passed = passed and retry.get("admission_id") == submissions[0][
                    "receipt"
                ].get("admission_id")
            row["retry_receipt"] = retry
        row.update(
            status="passed" if passed else "failed",
            category="none" if passed else "oracle",
            oracle_passed=passed,
        )
    except Exception as error:  # noqa: BLE001 - every executed cell remains in evidence
        row.update(
            error_type=type(error).__name__,
            error=str(error)[:1000],
            category="provider"
            if isinstance(error, ProviderUnavailable)
            else "unknown",
        )
    finally:
        if hasattr(driver.broker, "pause"):
            with contextlib.suppress(Exception):
                driver.broker.pause(conversation["scope"])
    return row


def run_product_lifecycle(driver, conversation, row, ident):
    if not isinstance(driver, Product):
        raise TypeError("Native lifecycle companion required")
    if ident == "offline_goal":
        from ngertiin_engine.wakes import utc

        due = time.time() + 70
        submission = driver.send(
            conversation,
            f"At {utc(due)} UTC calculate 14 multiplied by 17 and publish the result here once. Take responsibility and schedule the work. Wait until then; I will be offline. This is a real request.",
        )
        first = wait_until(
            lambda: driver.snapshot(conversation),
            lambda s: (
                bool(s["goals"])
                and s["goals"][0].get("wake") is not None
                and all(u["settled"] for u in s["goals"][0]["units"])
            ),
            timeout=65,
        )
        row["scheduled"] = first
        row["timings_s"]["recovery"] = driver.restart()
        # No browser/HTTP/socket reads during the due interval.
        time.sleep(max(0, due - time.time()) + 3)
        final = wait_until(
            lambda: driver.snapshot(conversation),
            lambda s: any(
                m["author_kind"] == "agent"
                and "238" in m["content"]
                and m["message_id"] not in {x["message_id"] for x in first["messages"]}
                for m in s["messages"]
            ),
            timeout=90,
        )
        goal = final["goals"][0]
        driver.invoke(driver.command("goal.stop", {"goal_id": goal["goal_id"]}))
        passed = goal["goal_id"] == first["goals"][0]["goal_id"]
    else:
        agents = conversation["agents"]
        handles = [a["handle"] for a in agents]
        submission = driver.send(
            conversation,
            f"@{handles[0]} calculate fuel efficiency for 360 km and 45 litres in litres per 100 km. Mention @{handles[1]} to write the report. @{handles[1]} publish report.md as a workspace artifact containing the calculation, then mention @{handles[2]}. @{handles[2]} read the published artifact using workspace and verify its arithmetic in your own final reply. Work together until the verified file is delivered.",
        )
        final = wait_until(
            lambda: driver.snapshot(conversation),
            lambda s: (
                len(
                    {
                        m["author_agent_id"]
                        for m in s["messages"]
                        if m["author_kind"] == "agent"
                    }
                )
                == 3
                and bool(s["artifacts"])
                and s.get("discussion", {}).get("status") != "active"
            ),
            timeout=180,
        )
        artifact = final["artifacts"][0]
        row["artifact"] = artifact
        passed = any(
            "12.5" in m["content"]
            for m in final["messages"]
            if m["author_agent_id"] == agents[2]["agent_id"]
        )
        if driver.args.surface == "application":
            path = f"/api/agent-engine/v1/artifacts/{artifact['artifact_id']}/revisions/{artifact['revision_id']}/download"
            with driver.http(path) as response:
                data = response.read()
            row["artifact_download"] = {
                "bytes": len(data),
                "sha256": hashlib.sha256(data).hexdigest(),
            }
            passed = passed and b"12.5" in data
    row.update(
        status="passed" if passed else "failed",
        category="none" if passed else "oracle",
        oracle_passed=passed,
        submission={
            "receipt": submission["receipt"],
            "command_id": submission["command"]["command_id"],
        },
        final=final,
    )
    row["timings_s"]["admission"] = submission["admission_s"]
    row["timings_s"]["settlement"] = time.monotonic() - submission["started"]
    return row


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--env-file", type=Path, required=True)
    parser.add_argument("--auth-state", type=Path, required=True)
    parser.add_argument("--control-dir", type=Path, required=True)
    parser.add_argument(
        "--surface", choices=["direct", "adapter", "application"], required=True
    )
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--scenario", action="append")
    args = parser.parse_args()
    for field in ("source", "env_file", "auth_state", "control_dir", "output"):
        setattr(args, field, getattr(args, field).resolve())
    if args.output.exists():
        raise ValueError("Refuse to overwrite live attempts")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    os.environ["HERMES_SOURCE"] = str(args.source)
    sys.path[:0] = [
        str(ROOT / "apps/engine/tests"),
        str(ROOT / "apps/engine/src"),
        str(args.source),
    ]
    from baseline import redact
    from dotenv import dotenv_values

    credentials = dotenv_values(args.env_file)
    driver = Native(args, credentials) if args.surface == "direct" else Product(args)
    try:
        cases = json.loads(PROTOCOL.read_text())["scenarios"]
        for case in cases:
            if args.scenario and case["id"] not in args.scenario:
                continue
            if args.surface == "direct" and case["id"] in {
                "offline_goal",
                "group_handoff",
            }:
                continue
            for repeat in range(1, 4):
                row = run_case(driver, case, repeat)
                row = redact(row, [credentials.get("OPENAI_API_KEY")])
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
                    print(
                        "Provider prerequisite failed; stop this batch and retain remaining planned cells as unexecuted.",
                        flush=True,
                    )
                    break
            else:
                continue
            break
    finally:
        driver.close()
