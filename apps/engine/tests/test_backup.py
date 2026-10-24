"""Offline snapshot rehearsal against the real native gateway store."""

# ruff: noqa: F811
import json
import os
import signal
import sqlite3
import subprocess

import pytest
from ngertiin_engine.backup import QUARANTINE, backup, inspect, restore
from test_capabilities import capability_agent
from test_direct_messages import dm, send, snapshot
from test_goal_lifecycle import begin
from test_runtime import OWNER, RUNTIME_PYTHON, command, runtime, settle  # noqa: F401


def test_complete_partition_restore_and_preserve_new_writes(runtime, tmp_path):
    root, provider, call, start, *_ = runtime
    home = root / "state"
    thread = dm(call, "backup-owner")
    receipt = call(send(thread, "Preserve this private transcript"))["result"]
    settle(call, receipt["run_id"])
    goal = begin(call, thread)
    assert "result" in call(command("goal.stop", {"goal_id": goal["goal_id"]}))
    (root / "capabilities.json").write_text(
        json.dumps(
            {"tool_grants": {"files": {"enabled": True, "toolset": "nma_workspace"}}}
        )
    )
    writer = capability_agent(call, "backup-writer", tool_grants=["files"])
    file_thread = call(
        command(
            "thread.create",
            {"kind": "dm", "title": "Private file", "agent_ids": [writer["agent_id"]]},
        )
    )["result"]["thread"]

    def publish(body, text):
        if not body.get("messages"):
            return None
        if body["messages"][-1]["role"] == "tool":
            return {"role": "assistant", "content": "Artifact saved."}
        return {
            "role": "assistant",
            "content": None,
            "tool_calls": [
                {
                    "id": "backup-file",
                    "type": "function",
                    "function": {
                        "name": "workspace",
                        "arguments": json.dumps(
                            {
                                "action": "publish",
                                "filename": "preserved.txt",
                                "content": "Private artifact bytes survive restore.",
                            }
                        ),
                    },
                }
            ],
        }

    provider.goal_script = publish
    file_run = call(send(file_thread, "Save the private artifact"))["result"]
    settle(call, file_run["run_id"])
    provider.goal_script = None
    file_before = snapshot(call, file_thread)
    assert len(file_before["artifacts"]) == 1
    before = snapshot(call, thread)
    with pytest.raises(BlockingIOError):
        backup(home, tmp_path / "live-backup")
    start.current.send_signal(signal.SIGINT)
    start.current.wait(timeout=25)
    original = inspect(home)
    saved = backup(home, tmp_path / "snapshot")
    assert saved["owner_id"] == OWNER
    restored = tmp_path / "restored"
    assert restore(tmp_path / "snapshot", restored, OWNER) == original
    assert (restored / QUARANTINE).exists()
    refused = subprocess.run(
        [RUNTIME_PYTHON, "-m", "ngertiin_engine.service"],
        env=os.environ | {"HERMES_HOME": str(restored), "NMA_OWNER_ID": OWNER},
        check=False,
        capture_output=True,
        text=True,
        timeout=30,
    )
    assert refused.returncode != 0 and "RESTORE_QUARANTINED" in refused.stderr
    with pytest.raises(ValueError, match="owner"):
        restore(tmp_path / "snapshot", tmp_path / "wrong-owner", "another-owner")
    with pytest.raises(ValueError, match="new directory"):
        restore(tmp_path / "snapshot", home, OWNER)
    # Reopen a restored partition only after explicit operator release.
    home.rename(root / "original-offline")
    restore(tmp_path / "snapshot", home, OWNER)
    (home / QUARANTINE).unlink()
    start()
    assert snapshot(call, thread) == before
    assert snapshot(call, file_thread) == file_before
    later = call(send(thread, "Post-cutover data must survive rollback"))["result"]
    settle(call, later["run_id"])
    start.current.send_signal(signal.SIGINT)
    start.current.wait(timeout=25)
    newer = backup(home, tmp_path / "post-cutover")
    assert (
        newer["databases"]["state.db"]["nma_messages"]
        > saved["databases"]["state.db"]["nma_messages"]
    )
    with sqlite3.connect(restored / "state.db") as db:
        assert db.execute("PRAGMA integrity_check").fetchone() == ("ok",)
    (tmp_path / "snapshot" / "state.db").write_bytes(b"corrupt")
    with pytest.raises(ValueError, match="checksum"):
        restore(tmp_path / "snapshot", tmp_path / "corrupt", OWNER)
    (root / "backup-rehearsal.json").write_text(
        json.dumps(
            {"before": original, "after": newer["databases"], "quarantined": True},
            indent=2,
        )
    )
    start()
