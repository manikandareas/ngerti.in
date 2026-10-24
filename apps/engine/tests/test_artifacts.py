"""Real agent tool publication, scoped peer reads, explicit sharing and restart."""

# ruff: noqa: F811
import json
from uuid import uuid4

from ngertiin_engine.contracts import sign
from test_capabilities import capability_agent
from test_direct_messages import public_api, send, snapshot  # noqa: F401
from test_runtime import KEY, command, runtime, settle  # noqa: F401


def test_artifact_publish_download_scope_share_revoke_restart(runtime, public_api):
    root, provider, call, start, *_ = runtime
    (root / "capabilities.json").write_text(
        json.dumps(
            {"tool_grants": {"files": {"enabled": True, "toolset": "nma_workspace"}}}
        )
    )
    writer = capability_agent(call, "file-writer", tool_grants=["files"])
    reviewer = capability_agent(call, "file-reviewer", tool_grants=["files"])
    private = call(
        command(
            "thread.create",
            {"kind": "dm", "title": "Private", "agent_ids": [writer["agent_id"]]},
        )
    )["result"]["thread"]
    group = call(
        command(
            "thread.create",
            {
                "kind": "group",
                "title": "Shared",
                "agent_ids": [writer["agent_id"], reviewer["agent_id"]],
            },
        )
    )["result"]["thread"]

    def scripted(body, text):
        if not body.get("messages"):
            return None
        if body["messages"][-1]["role"] == "tool":
            return {"role": "assistant", "content": body["messages"][-1]["content"]}
        if text.startswith("FILE:"):
            return {
                "role": "assistant",
                "content": None,
                "tool_calls": [
                    {
                        "id": "file-operation",
                        "type": "function",
                        "function": {
                            "name": "workspace",
                            "arguments": text.split(":", 1)[1],
                        },
                    }
                ],
            }
        return None

    provider.goal_script = scripted
    try:
        body = send(
            private,
            "FILE:"
            + json.dumps(
                {
                    "action": "publish",
                    "filename": "report.md",
                    "content": "PRIVATE_FILE_CANARY\nA verified report.",
                }
            ),
        )
        receipt = call(body)["result"]
        settle(call, receipt["run_id"])
        snap = snapshot(call, private)
        assert len(snap["artifacts"]) == 1, snap
        artifact = snap["artifacts"][0]
        assert artifact["producing_run_id"] == receipt["run_id"]
        assert artifact["producing_agent_id"] == writer["agent_id"]
        path = f"/artifacts/{artifact['artifact_id']}/revisions/{artifact['revision_id']}/download"
        response = public_api(path)
        assert response.read() == b"PRIVATE_FILE_CANARY\nA verified report."
        assert response.headers["X-Content-Type-Options"] == "nosniff"
        assert snapshot(call, group)["artifacts"] == []
        outsider = command("artifact.read", {"artifact_id": artifact["artifact_id"]})
        assert (
            call(outsider, envelope=sign(outsider, str(uuid4()), KEY))["error"]["code"]
            == "NOT_FOUND"
        )
        other = call(
            command(
                "thread.create",
                {
                    "kind": "dm",
                    "title": "Isolated reviewer",
                    "agent_ids": [reviewer["agent_id"]],
                },
            )
        )["result"]["thread"]
        denied = call(
            send(
                other,
                "FILE:"
                + json.dumps(
                    {"action": "read", "artifact_id": artifact["artifact_id"]}
                ),
            )
        )["result"]
        settle(call, denied["run_id"])
        other_snapshot = snapshot(call, other)
        assert "PRIVATE_FILE_CANARY" not in json.dumps(other_snapshot)
        assert "NOT_FOUND" in other_snapshot["messages"][-1]["content"]
        assert call(body)["result"]["run_id"] == receipt["run_id"]
        source = snap["messages"][0]["message_id"]
        share = command(
            "artifact.share",
            {
                "artifact_id": artifact["artifact_id"],
                "target_thread_id": group["thread_id"],
                "source_message_id": source,
                "reason": "Share the selected report for peer review",
            },
        )
        assert call(share)["result"]["active"]
        assert snapshot(call, group)["artifacts"] == [artifact]
        start.current.kill()
        start.current.wait(timeout=10)
        start()
        assert snapshot(call, group)["artifacts"] == [artifact]
        assert public_api(path).read().startswith(b"PRIVATE_FILE_CANARY")
        revoke = command("artifact.revoke", share["payload"])
        assert call(revoke)["result"]["active"] is False
        assert snapshot(call, group)["artifacts"] == []
        assert len(snapshot(call, private)["artifacts"]) == 1
        # No path parameter can select a host file.
        bad = call(command("artifact.read", {"artifact_id": "../../.env"}))
        assert bad["error"]["code"] == "INVALID_REQUEST"
    finally:
        provider.goal_script = None
