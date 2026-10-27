"""Real-model, native-browser/desktop and authenticated screen acceptance fixture."""

import argparse
import hashlib
import json
import os
import shlex
import signal
import sqlite3
import sys
import threading
import time
from pathlib import Path
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "apps/engine/tests"))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--auth", type=Path, required=True)
    parser.add_argument("--route", type=Path, required=True)
    parser.add_argument("--evidence", type=Path, required=True)
    parser.add_argument("--identity", type=int, choices=[0, 1], default=0)
    parser.add_argument("--metadata", type=Path)
    parser.add_argument("--skip-model", action="store_true")
    args = parser.parse_args()
    args.evidence.mkdir(parents=True, exist_ok=True)
    auth = json.loads(args.auth.read_text())
    route = json.loads(args.route.read_text())
    environment = args.route.with_name("bootstrap.env")
    environment.write_text(
        "".join(
            key + "=" + json.dumps(value) + "\n"
            for key, value in {
                "OPENAI_API_KEY": route["api_key"],
                "OPENAI_MODEL": route["model"],
                "OPENAI_BASE_URL": route["base_url"],
            }.items()
        )
    )
    environment.chmod(0o600)
    os.environ["NMA_TEST_LIVE_ENV"] = str(environment)
    os.environ["NMA_TEST_LIVE_PROTOCOL"] = route["protocol"]
    import model_tools  # noqa: F401
    import test_runtime
    from ngertiin_engine.contracts import digest
    from ngertiin_engine.native_executor import IsolatedTools, Scope
    from test_capabilities import capability_agent
    from test_direct_messages import send, snapshot
    from test_native_screens import FIXTURE
    from tools.registry import registry

    owner = auth["identities"][args.identity]["owner_id"]
    test_runtime.OWNER = owner
    fixture = test_runtime.runtime.__wrapped__(None)
    state = next(fixture)
    root, _, call, start, *_ = state
    image = os.environ["NMA_TEST_DESKTOP_IMAGE"]
    catalog = {
        "version": 2,
        "execution_surfaces": {
            "linux": {"kind": "scoped_linux", "ready": True, "image": image}
        },
        "tool_grants": {
            name: {
                "enabled": True,
                "label": name.title(),
                "toolset": toolset,
                **({"execution_surface": "linux"} if name != "deliver" else {}),
            }
            for name, toolset in {
                "browser": "browser",
                "desktop": "computer_use",
                "terminal": "terminal",
                "files": "file",
                "assistance": "nma_assistance",
                "deliver": "nma_workspace",
            }.items()
        },
    }
    (root / "capabilities.json").write_text(json.dumps(catalog))
    partitions = json.loads(Path(auth["registry"]).read_text())
    partitions[owner] = {
        "key_file": str(root / "key"),
        "socket": str(root / "state/nma.sock"),
    }
    Path(auth["registry"]).write_text(json.dumps(partitions))
    agent = capability_agent(
        call, "native-screen-acceptance", tool_grants=list(catalog["tool_grants"])
    )
    thread = call(
        test_runtime.command(
            "thread.read", {"thread_id": agent["primary_dm_thread_id"]}
        )
    )["result"]
    call(
        test_runtime.command(
            "screen.action",
            {
                "thread_id": thread["thread_id"],
                "agent_id": agent["agent_id"],
                "action": "connect",
            },
        )
    )
    journal = next((root / "state/native-execution").glob("*/isolated-tools.db"))
    broker = IsolatedTools(journal.parent, owner, image=image)
    with sqlite3.connect(journal) as conn:
        scope = Scope(
            **json.loads(conn.execute("SELECT scope_json FROM scopes").fetchone()[0])
        )

    def invoke(name, arguments):
        raw = broker.invoke(
            scope,
            str(uuid4()),
            name,
            arguments,
            schema_hash=digest(registry.get_entry(name).schema),
            allowed_tools={"browser_exec", "terminal"},
        )
        return json.loads(raw) if isinstance(raw, str) else raw

    fixture_source = FIXTURE.replace(
        "data=b'<title>Submitted</title>FORM_VERIFIED'",
        "data=b'<title>Submitted</title>FORM_VERIFIED<a download=browser-proof.txt href=data:text/plain,NATIVE_BROWSER_DOWNLOAD>Download</a>'",
    )
    assert (
        invoke(
            "terminal",
            {"command": "python -c " + shlex.quote(fixture_source), "background": True},
        )["exit_code"]
        == 0
    )
    configure = "import json;from pathlib import Path;p=Path('/work/state/config.yaml');c=json.loads(p.read_text());c['browser']['allow_private_urls']=True;p.write_text(json.dumps(c))"
    assert (
        invoke("terminal", {"command": "python -c " + shlex.quote(configure)})[
            "exit_code"
        ]
        == 0
    )
    metadata = {
        "pid": os.getpid(),
        "gateway_pid": start.current.pid,
        "root": str(root),
        "owner": owner,
        "agent": agent["agent_id"],
        "thread": thread["thread_id"],
        "image": image,
        "scope": scope.__dict__,
        "journal": str(journal),
    }
    (args.metadata or args.route.parent / "live.json").write_text(json.dumps(metadata))
    results = {
        "model": route["model"],
        "protocol": route["protocol"],
        "image": image,
        "planned": 3,
        "cases": [],
        "limits": "Three required useful-task smoke cases; not the release sample. Dedicated loopback fixture is explicitly allowed only in this capsule.",
    }
    prompts = [
        (
            "browser",
            "Use native browser tools to visit http://127.0.0.1:8765/. Inspect the iframe text FRAME_READY with js(\"document.querySelector('iframe').contentDocument.body.innerText\"). The iframe contains no form. Fill TOP-LEVEL input[name=name] with NMA032 and submit the TOP-LEVEL form exactly once via js(\"document.querySelector('form').submit()\"). Verify FORM_VERIFIED, then download the Download link using Chromium into /work/downloads/browser-proof.txt. You may set Browser.setDownloadBehavior through the native cdp helper. Publish the downloaded file using workspace publish_file path downloads/browser-proof.txt and filename browser-proof.txt. Do not replace browser interaction with HTTP/terminal requests; terminal may only inspect output bytes.",
        ),
        (
            "desktop",
            "Perform a real non-browser desktop task. Start mousepad /work/native-desktop.txt with terminal background=true. Use computer_use capture on Mousepad, then computer_use type to enter NATIVE_DESKTOP_MODEL_PROOF and save with ctrl+s using delivery_mode foreground (this isolated X11 host needs foreground for hotkeys). Publish native-desktop.txt with workspace publish_file path native-desktop.txt. Only computer_use may enter or save its content; terminal may launch Mousepad and read the file to verify it. Do not write it using code or shell.",
        ),
        (
            "assistance",
            "Navigate the native browser to http://127.0.0.1:8765/. Request my help with login using request_human, then end your turn so I can use the conversation screen. Do not request a password in chat. Wait for me to explicitly return control and send a continuation.",
        ),
    ]
    if args.skip_model:
        prompts = []
        results["planned"] = 0
        results["limits"] = (
            "Resource preparation only; no model task attempted or claimed."
        )
    stopped = threading.Event()
    signal.signal(signal.SIGTERM, lambda *_: stopped.set())
    signal.signal(signal.SIGINT, lambda *_: stopped.set())
    try:
        for name, text in prompts:
            request = send(thread, text)
            started = time.monotonic()
            admitted = call(request)
            result = {"name": name, "admission": admitted}
            if "result" in admitted:
                run_id = admitted["result"]["run_id"]
                deadline = time.monotonic() + 300
                while time.monotonic() < deadline:
                    value = call(
                        test_runtime.command("runtime.read", {"run_id": run_id})
                    )["result"]
                    if value["status"] not in {"queued", "running"}:
                        break
                    time.sleep(0.5)
                result["run"] = value
                result["duplicate_run_id"] = (
                    call(request).get("result", {}).get("run_id")
                )
                snap = snapshot(call, thread)
                result["artifacts"] = [
                    a for a in snap["artifacts"] if a["producing_run_id"] == run_id
                ]
                result["passed"] = (
                    value["status"] == "succeeded"
                    and result["duplicate_run_id"] == run_id
                )
                if name in {"browser", "desktop"}:
                    expected = (
                        b"NATIVE_BROWSER_DOWNLOAD"
                        if name == "browser"
                        else b"NATIVE_DESKTOP_MODEL_PROOF"
                    )
                    expected_name = (
                        "browser-proof.txt"
                        if name == "browser"
                        else "native-desktop.txt"
                    )
                    matches = [
                        a for a in result["artifacts"] if a["filename"] == expected_name
                    ]
                    result["passed"] &= bool(matches)
                    if matches:
                        item = matches[0]
                        data = (
                            root
                            / "state/files/objects"
                            / item["sha256"][:2]
                            / item["sha256"]
                        ).read_bytes()
                        result["bytes_oracle"] = (
                            data == expected
                            and hashlib.sha256(data).hexdigest() == item["sha256"]
                        )
                        result["passed"] &= result["bytes_oracle"]
                    if name == "browser":
                        try:
                            result["post_count"] = broker.file_bytes(
                                scope, "post-count"
                            ).decode()
                            result["passed"] &= result["post_count"] == "1"
                        except (RuntimeError, ValueError):
                            result["post_count"] = "unavailable"
                            result["passed"] = False
                else:
                    result["control"] = broker.screen.state(scope)[0]
                    result["passed"] &= result["control"] == "requested"
            else:
                result["passed"] = False
            result["elapsed_seconds"] = time.monotonic() - started
            results["cases"].append(result)
            (args.evidence / "live-results.json").write_text(
                json.dumps(results, indent=2) + "\n"
            )
            (args.evidence / "live-snapshot.json").write_text(
                json.dumps(snapshot(call, thread), indent=2) + "\n"
            )
            print(
                json.dumps(
                    {
                        "case": name,
                        "passed": result["passed"],
                        "seconds": result["elapsed_seconds"],
                    }
                ),
                flush=True,
            )
        print("Actual Clerk/native model fixture ready for web takeover.", flush=True)
        while not stopped.wait(1):
            pass
    finally:
        broker.cleanup()
        fixture.close()
        environment.unlink(missing_ok=True)
        (args.evidence / "fixture-cleanup.json").write_text(
            json.dumps(
                {"resources_cleaned": True, "original_account_changed": False}, indent=2
            )
            + "\n"
        )


if __name__ == "__main__":
    main()
