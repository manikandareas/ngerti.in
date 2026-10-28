"""Schema-17 upgrade, complete snapshot restore and Git-plus-backup rollback."""

# ruff: noqa: F811
import io
import json
import os
import signal
import sqlite3
import subprocess
import tarfile
import time
from pathlib import Path

from ngertiin_engine.backup import QUARANTINE, backup, restore
from test_capabilities import capability_agent
from test_delegation import setup, tool
from test_direct_messages import send, snapshot
from test_learning import conversation
from test_runtime import OWNER, SOURCE, command, runtime, settle  # noqa: F401


def test_additive_upgrade_restore_and_previous_git_runtime_rollback(runtime, tmp_path):
    root, provider, call, start, *_ = runtime
    agent = capability_agent(call, "preserved-identity")
    dm = conversation(call, agent)
    receipt = call(send(dm, "Preserve this original conversation"))["result"]
    settle(call, receipt["run_id"])
    messages = snapshot(call, dm)["messages"]

    def stop():
        start.current.send_signal(signal.SIGINT)
        start.current.wait(timeout=25)

    stop()
    with sqlite3.connect(root / "state/state.db") as db:
        for name in (
            "nma_collaboration_units",
            "nma_collaboration_operations",
            "nma_collaboration_tasks",
            "nma_delegation_batches",
            "nma_delegated_children",
        ):
            db.execute("DROP TABLE " + name)
        db.execute("DELETE FROM nma_schema_migrations WHERE version=18")
        db.execute("UPDATE nma_partition SET schema_version=17")
    predecessor = tmp_path / "predecessor"
    assert backup(root / "state", predecessor)["schema_version"] == 17
    start()
    assert call(command("runtime.describe"))["result"]["extension_schema"] == "18"
    assert snapshot(call, dm)["messages"] == messages
    assert (
        call(command("thread.read", {"thread_id": dm["thread_id"]}))["result"][
            "agents"
        ][0]["agent_id"]
        == agent["agent_id"]
    )

    _coordinator, child_dm = setup(root, call)

    def script(body, text):
        messages = body.get("messages", [])
        if not messages:
            return None
        if "focused subagent" in json.dumps(
            [m for m in messages if m["role"] == "system"]
        ):
            return {"role": "assistant", "content": '{"answer":42}'}
        if any(m["role"] == "tool" for m in messages):
            return {"role": "assistant", "content": "Known child result retained."}
        return tool("delegate_task", {"goal": "Produce the snapshot calculation"})

    provider.goal_script = script
    receipt = call(send(child_dm, "Calculate once with a temporary assistant"))[
        "result"
    ]
    settle(call, receipt["run_id"])
    deadline = time.monotonic() + 15
    while time.monotonic() < deadline:
        child_snapshot = snapshot(call, child_dm)
        if (
            child_snapshot["delegations"]
            and child_snapshot["delegations"][0]["status"] == "completed"
            and all(r["status"] == "succeeded" for r in child_snapshot["runs"])
        ):
            time.sleep(0.5)
            break
        time.sleep(0.1)
    assert child_snapshot["delegations"][0]["status"] == "completed"
    # Include the actual native board, shared artifacts and verified review history.
    from test_collaboration import test_peer_handoff_review_changes_artifact_and_restart

    test_peer_handoff_review_changes_artifact_and_restart(runtime, False)
    stop()
    forward = tmp_path / "forward"
    manifest = backup(root / "state", forward)
    assert manifest["schema_version"] == 18
    assert any("kanban/boards/nma-peers-" in name for name in manifest["files"])
    restore(forward, tmp_path / "restored", OWNER)
    (root / "state").rename(root / "offline-forward")
    (tmp_path / "restored").rename(root / "state")
    assert (root / "state" / QUARANTINE).exists()
    (root / "state" / QUARANTINE).unlink()
    count = len(provider.requests)
    start()
    assert snapshot(call, dm)["messages"] == messages
    assert snapshot(call, child_dm)["delegations"] == child_snapshot["delegations"]
    time.sleep(0.5)
    assert len(provider.requests) == count
    stop()

    archive = subprocess.check_output(
        ["git", "archive", "HEAD", "apps/engine/src"],
        cwd=Path(__file__).resolve().parents[3],
    )
    previous = tmp_path / "previous-git"
    with tarfile.open(fileobj=io.BytesIO(archive)) as contents:
        contents.extractall(previous, filter="data")
    (root / "state").rename(root / "offline-restored-forward")
    restore(predecessor, root / "state", OWNER)
    (root / "state" / QUARANTINE).unlink()
    _, description = start(
        overrides={
            "PYTHONPATH": os.pathsep.join(
                (str(previous / "apps/engine/src"), str(SOURCE))
            )
        }
    )
    assert description["extension_schema"] == "17"
    assert snapshot(call, dm)["messages"] == messages
    assert len(provider.requests) == count
    print("SCHEMA_17_TO_18_RESTORE_AND_PREVIOUS_GIT_ROLLBACK_VERIFIED")
