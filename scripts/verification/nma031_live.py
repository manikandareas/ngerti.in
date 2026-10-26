"""Disposable real-model/native-workspace acceptance and authenticated web fixture."""

import argparse
import hashlib
import io
import json
import os
import signal
import sqlite3
import sys
import threading
import time
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "apps/engine/tests"))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--auth", type=Path, required=True)
    parser.add_argument("--evidence", type=Path, required=True)
    args = parser.parse_args()
    import test_runtime
    from ngertiin_engine.native_executor import IsolatedTools
    from test_capabilities import capability_agent
    from test_direct_messages import send, snapshot
    from test_files import upload
    from test_workspace_delivery import catalog

    auth = json.loads(args.auth.read_text())
    owner = auth["identities"][0]["owner_id"]
    test_runtime.OWNER = owner
    fixture = test_runtime.runtime.__wrapped__(None)
    state = next(fixture)
    root, _, call, start, *_ = state
    image = os.environ["NMA_TEST_NATIVE_IMAGE"]
    (root / "capabilities.json").write_text(json.dumps(catalog(image)))
    registry = json.loads(Path(auth["registry"]).read_text())
    registry[owner] = {
        "key_file": str(root / "key"),
        "socket": str(root / "state/nma.sock"),
    }
    Path(auth["registry"]).write_text(json.dumps(registry))
    agent = capability_agent(
        call, "workspace-acceptance", tool_grants=list(catalog(image)["tool_grants"])
    )
    thread = call(
        test_runtime.command(
            "thread.read", {"thread_id": agent["primary_dm_thread_id"]}
        )
    )["result"]
    metadata = {
        "root": str(root),
        "owner": owner,
        "thread": thread["thread_id"],
        "agent": agent["agent_id"],
        "pid": os.getpid(),
        "gateway_pid": start.current.pid,
        "image": image,
    }
    Path(".dev/nma031/live.json").write_text(json.dumps(metadata))
    args.evidence.mkdir(parents=True, exist_ok=True)
    results = {
        "model": "gpt-6-luna",
        "protocol": "codex_responses",
        "image": image,
        "cases": [],
        "denominator": 3,
        "fixture": "actual Clerk API, real model, production native workers; synthetic user files",
    }
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr(
            "word/document.xml",
            '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>The expedition inventory contains 17 blue crates and 26 green crates.</w:t></w:r></w:p></w:body></w:document>',
        )
    uploaded = upload(
        call, thread["thread_id"], buffer.getvalue(), "資料 inventory.docx"
    )
    prompts = [
        (
            "document_binary",
            "Import the attached DOCX using workspace import_file, read it with native read_file, and produce /work/project/inventory.zip containing a UTF-8 inventory.txt summarizing both crate counts and their total. Publish inventory.zip using workspace publish_file with path project/inventory.zip. Reply with the durable artifact reference.",
            [uploaded["artifact_id"]],
        ),
        (
            "coding_diagnostics",
            "In your native workspace, create a small committed Git repository with main.py containing value: int = 'broken'. Use coding diagnostics to observe the actual Python type error, fix it with native file tools, and obtain clean coding diagnostics. Publish the corrected main.py as a durable file. Do the work, not just instructions.",
            [],
        ),
        (
            "background_completion",
            "Start a background native terminal process with pty=true that reads one line from stdin, writes that line to /work/project/process-result.txt and exits. Use process_manage to supply the line NATIVE_STDIN_VERIFIED, inspect its logs, and verify completion. Publish process-result.txt as a durable file.",
            [],
        ),
    ]
    stopped = threading.Event()
    signal.signal(signal.SIGTERM, lambda *_: stopped.set())
    signal.signal(signal.SIGINT, lambda *_: stopped.set())
    try:
        for name, text, ids in prompts:
            request = send(thread, text)
            request["payload"]["attachment_ids"] = ids
            before = time.monotonic()
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
                    and bool(result["artifacts"])
                    and result["duplicate_run_id"] == run_id
                )
                if name == "document_binary" and result["artifacts"]:
                    item = next(
                        (
                            a
                            for a in result["artifacts"]
                            if a["filename"].endswith(".zip")
                        ),
                        None,
                    )
                    if item:
                        data = (
                            root
                            / "state/files/objects"
                            / item["sha256"][:2]
                            / item["sha256"]
                        ).read_bytes()
                        with zipfile.ZipFile(io.BytesIO(data)) as archive:
                            content = archive.read("inventory.txt").decode()
                        result["content_oracle"] = all(
                            str(n) in content for n in (17, 26, 43)
                        )
                        result["passed"] &= (
                            result["content_oracle"]
                            and hashlib.sha256(data).hexdigest() == item["sha256"]
                        )
                if name == "background_completion" and result["artifacts"]:
                    item = result["artifacts"][0]
                    data = (
                        root
                        / "state/files/objects"
                        / item["sha256"][:2]
                        / item["sha256"]
                    ).read_bytes()
                    result["passed"] &= b"NATIVE_STDIN_VERIFIED" in data
            else:
                result["passed"] = False
            result["elapsed_seconds"] = time.monotonic() - before
            results["cases"].append(result)
            (args.evidence / "live-results.json").write_text(
                json.dumps(results, indent=2) + "\n"
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
        (args.evidence / "live-snapshot.json").write_text(
            json.dumps(snapshot(call, thread), indent=2) + "\n"
        )
        print(
            "Live native workspace fixture ready for authenticated browser walkthrough.",
            flush=True,
        )
        while not stopped.wait(1):
            pass
    finally:
        for path in (root / "state/native-execution").glob("*/isolated-tools.db"):
            IsolatedTools(path.parent, owner, image=image).cleanup()
        fixture.close()
        with sqlite3.connect(root / "state/state.db") as conn:
            counts = dict(
                conn.execute("SELECT state,COUNT(*) FROM nma_files GROUP BY state")
            )
        (args.evidence / "fixture-cleanup.json").write_text(
            json.dumps(
                {
                    "owned_native_resources_cleaned": True,
                    "gateway_stopped": start.current.poll() is not None,
                    "retained_file_states": counts,
                },
                indent=2,
            )
            + "\n"
        )


if __name__ == "__main__":
    main()
