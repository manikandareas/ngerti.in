"""Production gateway model-tool routing, binary delivery and restart persistence."""

# ruff: noqa: F811
import hashlib
import io
import json
import os
import sqlite3
import time
import zipfile
from uuid import uuid4

import pytest
from ngertiin_engine.native_executor import IsolatedTools
from test_capabilities import capability_agent
from test_direct_messages import public_api, send, snapshot  # noqa: F401
from test_files import upload
from test_runtime import OWNER, command, runtime, settle  # noqa: F401

pytestmark = pytest.mark.skipif(
    not os.environ.get("NMA_TEST_NATIVE_IMAGE"),
    reason="Requires the reviewed native image",
)


def catalog(image):
    return {
        "version": 2,
        "execution_surfaces": {
            "linux": {"ready": True, "kind": "scoped_linux", "image": image}
        },
        "tool_grants": {
            name: {
                "enabled": True,
                "toolset": toolset,
                **({"execution_surface": "linux"} if name != "deliver" else {}),
            }
            for name, toolset in {
                "terminal": "terminal",
                "files": "file",
                "code": "code_execution",
                "coding": "nma_coding",
                "deliver": "nma_workspace",
            }.items()
        },
    }


def test_gateway_files_workspace_and_job_recovery(runtime, public_api):
    root, provider, call, start, *_ = runtime
    image = os.environ["NMA_TEST_NATIVE_IMAGE"]
    asset = root / "native-helper.py"
    asset.write_text(
        "#!/opt/native/bin/python\nimport json,os,urllib.request\nprint(json.dumps({'skill_asset':'EXECUTED','uid':os.getuid(),'provider_key':os.environ.get('OPENAI_API_KEY'),'chromium':bool(json.load(urllib.request.urlopen('http://127.0.0.1:9222/json/version'))['Browser'])}))\n"
    )
    entry = {
        "enabled": True,
        "content": "Run the assigned native helper when requested.",
        "native_assets": {
            "helper.py": {
                "path": str(asset),
                "sha256": hashlib.sha256(asset.read_bytes()).hexdigest(),
                "executable": True,
            }
        },
    }
    configured = catalog(image)
    configured["skill_refs"] = {"helper": entry}
    (root / "capabilities.json").write_text(json.dumps(configured))
    agent = capability_agent(
        call,
        "native-file-delivery",
        tool_grants=list(catalog(image)["tool_grants"]),
        skill_refs=["helper"],
    )
    thread = call(command("thread.read", {"thread_id": agent["primary_dm_thread_id"]}))[
        "result"
    ]
    target = {
        "name": "terminal",
        "arguments": {"command": "printf 'PERSISTENT_WORKSPACE' > retained.txt"},
    }

    def scripted(body, text):
        if not body.get("messages"):
            return None
        if body["messages"][-1]["role"] == "tool":
            return {"role": "assistant", "content": body["messages"][-1]["content"]}
        return {
            "role": "assistant",
            "content": None,
            "tool_calls": [
                {
                    "id": "native-" + uuid4().hex,
                    "type": "function",
                    "function": {
                        "name": target["name"],
                        "arguments": json.dumps(target["arguments"]),
                    },
                }
            ],
        }

    provider.goal_script = scripted

    def run(name, arguments, attachments=()):
        target.update(name=name, arguments=arguments)
        message = send(thread, "Execute the selected native workflow")
        message["payload"]["attachment_ids"] = list(attachments)
        receipt = call(message)
        assert "result" in receipt, receipt
        settle(call, receipt["result"]["run_id"])
        tool = next(
            m
            for m in reversed(provider.requests[-1]["messages"])
            if m["role"] == "tool"
        )
        result = json.loads(tool["content"])
        print(name, json.dumps(result)[:3000], flush=True)
        assert not result.get("error"), result
        return result

    try:
        from ngertiin_engine.skill_assets import directory

        helper = run(
            "terminal", {"command": "/work/" + directory(entry) + "/helper.py"}
        )
        assert json.loads(helper["output"]) == {
            "skill_asset": "EXECUTED",
            "uid": 10001,
            "provider_key": None,
            "chromium": True,
        }
        legacy = run(
            "workspace",
            {
                "action": "publish",
                "filename": "legacy.txt",
                "content": "LEGACY_UTF8_PRESERVED",
            },
        )
        collision = call(
            command(
                "file.begin",
                {
                    "artifact_id": legacy["artifact_id"],
                    "thread_id": thread["thread_id"],
                    "filename": "collision.bin",
                    "media_type": "application/octet-stream",
                    "sha256": hashlib.sha256(b"").hexdigest(),
                    "byte_count": 0,
                },
            )
        )
        assert collision["error"]["code"] == "COMMAND_CONFLICT"
        assert (
            call(command("artifact.read", {"artifact_id": legacy["artifact_id"]}))[
                "result"
            ]["content"]
            == "LEGACY_UTF8_PRESERVED"
        )
        run("terminal", {"command": "printf 'PERSISTENT_WORKSPACE' > retained.txt"})
        reread = run("read_file", {"path": "retained.txt"})
        assert (
            "PERSISTENT_WORKSPACE" in reread.get("content", "")
            or reread.get("status") == "unchanged"
        ), reread
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w") as archive:
            archive.writestr(
                "word/document.xml",
                '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>DOCUMENT_INPUT_CANARY</w:t></w:r></w:p></w:body></w:document>',
            )
        original = upload(
            call, thread["thread_id"], buffer.getvalue(), "試験 document.docx"
        )
        imported = run(
            "workspace",
            {"action": "import_file", "artifact_id": original["artifact_id"]},
            [original["artifact_id"]],
        )
        assert (
            "DOCUMENT_INPUT_CANARY"
            in run("read_file", {"path": imported["workspace_path"]})["content"]
        )
        run(
            "execute_code",
            {
                "code": "from pathlib import Path\nPath('/work/project/output.bin').write_bytes(bytes(range(256))*8192)\nprint('BINARY_READY')"
            },
        )
        produced = run(
            "workspace",
            {
                "action": "publish_file",
                "path": "project/output.bin",
                "filename": "結果 output.bin",
            },
        )
        path = f"/artifacts/{produced['artifact_id']}/revisions/{produced['revision_id']}/download?thread_id={thread['thread_id']}"
        assert public_api(path).read() == bytes(range(256)) * 8192
        inspection = call(
            command(
                "workspace.action",
                {
                    "thread_id": thread["thread_id"],
                    "agent_id": agent["agent_id"],
                    "arguments": {"action": "inspect"},
                },
            )
        )
        assert "retained.txt" in inspection["result"]["hashes"], inspection
        process = run(
            "terminal",
            {
                "command": "sleep 3; printf 'JOB_DONE' > /work/project/completed.txt",
                "background": True,
                "notify_on_complete": True,
            },
        )
        assert process["session_id"]
        start.current.kill()
        start.current.wait(timeout=10)
        start()
        assert public_api(path).read() == bytes(range(256)) * 8192
        reread = run("read_file", {"path": "retained.txt"})
        assert (
            "PERSISTENT_WORKSPACE" in reread.get("content", "")
            or reread.get("status") == "unchanged"
        ), reread
        deadline = time.monotonic() + 20
        events = []
        while time.monotonic() < deadline:
            with sqlite3.connect(root / "state/state.db") as conn:
                events = conn.execute(
                    "SELECT state,receipt FROM nma_native_job_events WHERE handle=?",
                    (process["session_id"],),
                ).fetchall()
            if any(state == "exited" for state, _ in events):
                break
            time.sleep(0.2)
        assert any(state == "exited" for state, _ in events), events
        assert "JOB_DONE" in run("read_file", {"path": "completed.txt"})["content"]
        assert any(
            a["artifact_id"] == produced["artifact_id"]
            for a in snapshot(call, thread)["artifacts"]
        )
    finally:
        provider.goal_script = None
        for path in (root / "state/native-execution").glob("*/isolated-tools.db"):
            IsolatedTools(path.parent, OWNER, image=image).cleanup()
