"""Execute the registered real-model browser corpus with exact independent oracles."""

import argparse
import json
import os
import shlex
import sqlite3
import subprocess
import sys
import tempfile
import time
from datetime import datetime
from pathlib import Path
from urllib.request import Request, urlopen
from uuid import NAMESPACE_URL, uuid4, uuid5

ROOT = Path(__file__).resolve().parents[3]
sys.path[:0] = [str(ROOT / "apps/engine/tests"), str(ROOT / "scripts/spikes/nma028")]
import model_tools  # noqa: F401
from complete_baseline import Native, wait_until
from ngertiin_engine.contracts import digest, sign
from ngertiin_engine.native_executor import IsolatedTools, Scope, ScopeRefused
from test_direct_messages import send
from test_native_screens import FIXTURE
from test_runtime import command
from tools.registry import registry

PROMPT = "Use native browser_exec to open http://127.0.0.1:8765/. Inspect the iframe and report FRAME_READY. The iframe contains only FRAME_READY text; the form and name input are in the TOP-LEVEL document, not inside the iframe. Fill input[name=name] with NMA032 and submit the form exactly once using document.querySelector('form').submit(). The fixture uses a default submit button without a type attribute; do not assume button[type=submit] exists. Verify FORM_VERIFIED and use Chromium to download the Download link into /work/downloads/browser-proof.txt (set Browser.setDownloadBehavior through cdp). Use terminal only to verify downloaded bytes, not to replace browser input or download. Finally report NATIVE_BROWSER_DOWNLOAD. Do not publish artifacts in this paired corpus."


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "--surface", choices=["direct", "adapter", "application"], required=True
    )
    p.add_argument("--auth", type=Path, required=True)
    p.add_argument("--route", type=Path, required=True)
    p.add_argument("--live", type=Path, required=True)
    p.add_argument("--output", type=Path, required=True)
    args = p.parse_args()
    if args.output.exists():
        raise ValueError("Append-only batch requires a fresh output file")
    route = json.loads(args.route.read_text())
    live = json.loads(args.live.read_text())
    auth = json.loads(args.auth.read_text())
    image = os.environ["NMA_TEST_DESKTOP_IMAGE"]
    source = Path(os.environ["HERMES_SOURCE"])
    owner = live["owner"] if args.surface != "direct" else str(uuid4())
    direct = None

    def call(body):
        if args.surface == "application":
            current = json.loads(args.auth.read_text())
            req = Request(
                current["base"] + "/api/agent-engine/v1/commands",
                data=json.dumps(body).encode(),
                headers={
                    "Authorization": "Bearer " + current["identities"][0]["jwt"],
                    "Content-Type": "application/json",
                },
            )
            with urlopen(req, timeout=45) as response:
                return json.load(response)
        import socket

        partition = json.loads(Path(auth["registry"]).read_text())[owner]
        with socket.socket(socket.AF_UNIX) as sock:
            sock.settimeout(45)
            sock.connect(partition["socket"])
            sock.sendall(
                (
                    json.dumps(
                        sign(body, owner, Path(partition["key_file"]).read_bytes())
                    )
                    + "\n"
                ).encode()
            )
            value = json.loads(sock.makefile("rb").readline())
        if "error" in value:
            raise ValueError(value["error"])
        return value["result"]

    if args.surface == "direct":
        from tests.gateway.fixtures.local_recovery_probe import child_env
        from tests.gateway.test_normal_runtime_boot import control

        direct = object.__new__(Native)
        direct.owner = owner
        direct.root = Path(tempfile.mkdtemp(prefix="nma032-direct-")).resolve()
        direct.home = direct.root / "state"
        direct.home.mkdir()
        direct.workspace = direct.root / "workspace"
        direct.workspace.mkdir()
        direct.processes = []
        direct.broker = IsolatedTools(direct.root / "control", owner, image=image)
        config = {
            "model": {
                "provider": "custom:nma032-plan",
                "default": route["model"],
                "base_url": route["base_url"],
                "api_mode": route["protocol"],
            },
            "custom_providers": [
                {
                    "name": "nma032-plan",
                    "base_url": route["base_url"],
                    "api_mode": route["protocol"],
                    "key_env": "OPENAI_API_KEY",
                }
            ],
            "agent": {"max_turns": 0},
            "platform_toolsets": {"cli": ["nma032_direct"]},
            "terminal": {"cwd": str(direct.workspace)},
            "auxiliary": {"title_generation": {"enabled": False}},
        }
        (direct.home / "config.yaml").write_text(json.dumps(config))
        env = child_env() | dict(
            os.environ,
            HERMES_HOME=str(direct.home),
            NMA032_OWNER=owner,
            NMA032_CONTROL=str(direct.root / "control"),
            OPENAI_API_KEY=route["api_key"],
            OPENAI_BASE_URL=route["base_url"],
        )
        log = (direct.root / "gateway.log").open("w")
        direct.process = subprocess.Popen(
            [
                os.environ["NMA_TEST_RUNTIME_PYTHON"],
                str(Path(__file__).with_name("direct_gateway.py")),
            ],
            cwd=source,
            env=env,
            stdout=log,
            stderr=log,
        )
        direct.processes.append(direct.process)
        direct.descriptor = wait_until(
            lambda: direct.identify(control),
            lambda value: value.get("state") == "ready",
            timeout=90,
        )
    try:
        for repeat in range(1, 4):
            if direct:
                created = direct.rpc(
                    "session.create",
                    request_id=str(uuid4()),
                    source="cli",
                    cwd=str(direct.workspace),
                    toolsets=["nma032_direct"],
                    ignore_rules=True,
                )
                sid = created["session_id"]
                scope = Scope(
                    owner,
                    str(
                        uuid5(
                            NAMESPACE_URL,
                            owner + ":profile:" + str(direct.home.resolve()),
                        )
                    ),
                    str(uuid5(NAMESPACE_URL, owner + ":session:" + sid)),
                )
                conversation = {
                    "sid": sid,
                    "scope": scope,
                    "initial": direct.rpc("session.resume", session_id=sid),
                }
                broker = direct.broker
            else:
                from test_capabilities import capability_agent

                agent = capability_agent(
                    lambda body: {"result": call(body)},
                    "paired-" + args.surface + "-" + uuid4().hex[:8],
                    tool_grants=["browser", "terminal"],
                )
                thread = (
                    call(
                        command(
                            "thread.read", {"thread_id": agent["primary_dm_thread_id"]}
                        )
                    )
                    if args.surface == "adapter"
                    else None
                )
                if thread is None:
                    current = json.loads(args.auth.read_text())
                    req = Request(
                        current["base"]
                        + "/api/agent-engine/v1/threads/"
                        + agent["primary_dm_thread_id"],
                        headers={
                            "Authorization": "Bearer " + current["identities"][0]["jwt"]
                        },
                    )
                    thread = json.load(urlopen(req, timeout=30))
                call(
                    command(
                        "screen.action",
                        {
                            "thread_id": thread["thread_id"],
                            "agent_id": agent["agent_id"],
                            "action": "connect",
                        },
                    )
                )
                journal = Path(live["journal"])
                with sqlite3.connect(journal) as db:
                    scope = Scope(
                        **json.loads(
                            db.execute(
                                "SELECT scope_json FROM scopes WHERE json_extract(scope_json,'$.thread_id')=?",
                                (thread["thread_id"],),
                            ).fetchone()[0]
                        )
                    )
                broker = IsolatedTools(journal.parent, owner, image=image)

            def invoke(name, arguments, broker=broker, scope=scope):
                return broker.invoke(
                    scope,
                    str(uuid4()),
                    name,
                    arguments,
                    schema_hash=digest(registry.get_entry(name).schema),
                    allowed_tools={"terminal", "browser_exec"},
                )

            fixture_source = FIXTURE.replace(
                "data=b'<title>Submitted</title>FORM_VERIFIED'",
                "data=b'<title>Submitted</title>FORM_VERIFIED<a download=browser-proof.txt href=data:text/plain,NATIVE_BROWSER_DOWNLOAD>Download</a>'",
            )
            invoke(
                "terminal",
                {
                    "command": "python -c " + shlex.quote(fixture_source),
                    "background": True,
                },
            )
            configure = "import json;from pathlib import Path;p=Path('/work/state/config.yaml');c=json.loads(p.read_text());c['browser']['allow_private_urls']=True;p.write_text(json.dumps(c))"
            invoke("terminal", {"command": "python -c " + shlex.quote(configure)})
            row = {
                "surface": args.surface,
                "repeat": repeat,
                "model": route["model"],
                "image": image,
                "started_at": time.time(),
                "runtime_root": str(direct.root) if direct else live["root"],
                "control_journal": str(broker.database),
                "scope_key": scope.key,
            }
            start = time.monotonic()
            try:
                if direct:
                    submitted = direct.send(conversation, PROMPT)
                    result = direct.settled(conversation, submitted)
                    row.update(
                        native_session_id=sid,
                        native_admission_id=result["native_admission_id"],
                        first_progress_s=result["first_progress_s"],
                        text=result["text"],
                    )
                else:
                    submitted = call(send(thread, PROMPT))
                    run_id = submitted["run_id"]
                    row["run_id"] = run_id
                    # Runtime reads use the signed adapter even for the HTTP
                    # surface; admission and public result/snapshot remain HTTP.
                    import socket

                    partition = json.loads(Path(auth["registry"]).read_text())[owner]

                    def read(run_id=run_id, partition=partition):
                        body = command("runtime.read", {"run_id": run_id})
                        with socket.socket(socket.AF_UNIX) as sock:
                            sock.settimeout(30)
                            sock.connect(partition["socket"])
                            sock.sendall(
                                (
                                    json.dumps(
                                        sign(
                                            body,
                                            owner,
                                            Path(partition["key_file"]).read_bytes(),
                                        )
                                    )
                                    + "\n"
                                ).encode()
                            )
                            return json.loads(sock.makefile("rb").readline())["result"]

                    result = wait_until(
                        read,
                        lambda value: value["status"] not in {"queued", "running"},
                        timeout=180,
                    )
                    row["state"] = result["status"]
                    with sqlite3.connect(
                        Path(live["root"]) / "state/state.db"
                    ) as events_db:
                        lineage = events_db.execute(
                            "SELECT b.native_session_id,r.native_admission_id FROM nma_adapter_runs r JOIN nma_adapter_bindings b USING(owner_id,binding_id) WHERE r.run_id=?",
                            (run_id,),
                        ).fetchone()
                        row["native_session_id"], row["native_admission_id"] = lineage
                        events = [
                            json.loads(item[0])
                            for item in events_db.execute(
                                "SELECT e.payload FROM nma_run_events r JOIN nma_events e USING(owner_id,sequence) WHERE r.run_id=? ORDER BY sequence",
                                (run_id,),
                            )
                        ]
                    moments = [
                        datetime.fromisoformat(event["occurred_at"]).timestamp()
                        for event in events
                        if event["type"] in {"tool.started", "message.delta"}
                    ]
                    row["first_progress_s"] = (
                        min(moments) - row["started_at"] if moments else None
                    )
                    row["progress_measure"] = (
                        "durable event wall time minus registered admission wall time"
                    )
                with sqlite3.connect(broker.database) as receipt_db:
                    row["iframe_observation_receipt"] = any(
                        "FRAME_READY" in (item[0] or "")
                        for item in receipt_db.execute(
                            "SELECT result FROM operations WHERE scope_key=? AND tool='browser_exec' AND state='returned'",
                            (scope.key,),
                        )
                    )
                row["post_count"] = broker.file_bytes(scope, "post-count").decode()
                row["download"] = broker.file_bytes(
                    scope, "downloads/browser-proof.txt"
                ).decode()
                row["passed"] = (
                    row["post_count"] == "1"
                    and row["download"] == "NATIVE_BROWSER_DOWNLOAD"
                    and (row.get("state", "succeeded") == "succeeded")
                    and row["iframe_observation_receipt"]
                )
            except (
                OSError,
                ValueError,
                RuntimeError,
                TimeoutError,
                sqlite3.Error,
                KeyError,
            ) as exc:
                row.update(
                    passed=False, error_type=type(exc).__name__, error=str(exc)[:300]
                )
            row["settlement_s"] = time.monotonic() - start
            with args.output.open("a") as stream:
                stream.write(json.dumps(row) + "\n")
            print(
                json.dumps(
                    {
                        key: row[key]
                        for key in ["surface", "repeat", "passed", "settlement_s"]
                    }
                ),
                flush=True,
            )
            if not direct:
                try:
                    broker.pause(scope)
                except ScopeRefused:
                    row["cleanup"] = (
                        "Uncertain receipt retained; no automatic pause/replay"
                    )
    finally:
        if direct:
            direct.close()


if __name__ == "__main__":
    main()
