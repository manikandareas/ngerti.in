"""Real gateway upload/finalization, message deduplication and scoped binary reads."""

# ruff: noqa: F811
import base64
import hashlib
from uuid import uuid4

from test_capabilities import capability_agent
from test_direct_messages import public_api, send, snapshot  # noqa: F401
from test_runtime import command, runtime, settle  # noqa: F401


def upload(call, thread_id, data, name="資料 résumé.bin"):
    identity = str(uuid4())
    sha = hashlib.sha256(data).hexdigest()
    begin = command(
        "file.begin",
        {
            "artifact_id": identity,
            "thread_id": thread_id,
            "filename": name,
            "media_type": "application/octet-stream",
            "sha256": sha,
            "byte_count": len(data),
        },
    )
    assert call(begin)["result"]["status"] == "uploading"
    assert (
        call(command("file.finalize", {"artifact_id": identity}))["error"]["code"]
        == "UPLOAD_INCOMPLETE"
    )
    for offset in range(0, len(data), 512 * 1024):
        part = command(
            "file.part",
            {
                "artifact_id": identity,
                "index": offset // (512 * 1024),
                "data_base64": base64.b64encode(
                    data[offset : offset + 512 * 1024]
                ).decode(),
            },
        )
        assert call(part)["result"] == call(part)["result"]
    final = command("file.finalize", {"artifact_id": identity})
    result = call(final)["result"]
    assert call(final)["result"] == result
    assert result["sha256"] == sha
    return result


def test_binary_lifecycle_message_share_revoke_restart(runtime, public_api):
    root, _provider, call, start, *_ = runtime
    writer = capability_agent(call, "binary-writer")
    peer = capability_agent(call, "binary-peer")
    thread = call(
        command("thread.read", {"thread_id": writer["primary_dm_thread_id"]})
    )["result"]
    group = call(
        command(
            "thread.create",
            {
                "kind": "group",
                "title": "Binary review",
                "agent_ids": [writer["agent_id"], peer["agent_id"]],
            },
        )
    )["result"]["thread"]
    data = bytes(range(256)) * 4097
    item = upload(call, thread["thread_id"], data)
    path = f"/artifacts/{item['artifact_id']}/revisions/{item['revision_id']}/download"
    assert public_api(path).read() == data
    sent = send(thread, "Inspect the attached file")
    sent["payload"]["attachment_ids"] = [item["artifact_id"]]
    first = call(sent)["result"]
    settle(call, first["run_id"])
    assert call(sent)["result"]["run_id"] == first["run_id"]
    messages = snapshot(call, thread)["messages"]
    attached = [m for m in messages if m.get("attachments")]
    assert (
        len(attached) == 1 and attached[0]["attachments"][0]["sha256"] == item["sha256"]
    )
    denied = command(
        "file.read",
        {
            "artifact_id": item["artifact_id"],
            "offset": 0,
            "thread_id": group["thread_id"],
        },
    )
    assert call(denied)["error"]["code"] == "NOT_FOUND"
    share = command(
        "artifact.share",
        {
            "artifact_id": item["artifact_id"],
            "target_thread_id": group["thread_id"],
            "source_message_id": attached[0]["message_id"],
            "reason": "Review this selected file",
        },
    )
    assert call(share)["result"]["active"]
    assert "result" in call(denied)
    start.current.kill()
    start.current.wait(timeout=10)
    start()
    assert public_api(path).read() == data
    assert (
        call(command("artifact.revoke", share["payload"]))["result"]["active"] is False
    )
    assert call(denied)["error"]["code"] == "NOT_FOUND"
    assert snapshot(call, group)["artifacts"] == []
    assert len(snapshot(call, thread)["artifacts"]) == 1
    changed = {**sent, "payload": {**sent["payload"], "attachment_ids": []}}
    assert call(changed)["error"]["code"] == "COMMAND_CONFLICT"
    assert (
        root / "state" / "files" / "objects" / item["sha256"][:2] / item["sha256"]
    ).read_bytes() == data


def test_invalid_uploads_and_incomplete_files_are_not_visible(runtime):
    _, _, call, *_ = runtime
    writer = capability_agent(call, "malformed-files")
    thread = call(
        command("thread.read", {"thread_id": writer["primary_dm_thread_id"]})
    )["result"]
    p = {
        "artifact_id": str(uuid4()),
        "thread_id": thread["thread_id"],
        "filename": "../../outside",
        "media_type": "text/plain",
        "sha256": "0" * 64,
        "byte_count": 4,
    }
    assert call(command("file.begin", p))["error"]["code"] == "INVALID_REQUEST"
    p["filename"] = "broken.pdf"
    assert "result" in call(command("file.begin", p))
    assert snapshot(call, thread)["artifacts"] == []
    assert "result" in call(
        command(
            "file.part",
            {
                "artifact_id": p["artifact_id"],
                "index": 0,
                "data_base64": base64.b64encode(b"nope").decode(),
            },
        )
    )
    assert (
        call(command("file.finalize", {"artifact_id": p["artifact_id"]}))["error"][
            "code"
        ]
        == "FILE_HASH_MISMATCH"
    )
    assert snapshot(call, thread)["artifacts"] == []
