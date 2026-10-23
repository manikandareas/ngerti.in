"""Reproduce an uncertain native admission followed by an agent configuration edit.

Run from the repository root with HERMES_SOURCE and PYTHONPATH as for engine tests.
Only the test fixture's new disposable partition is modified.
"""
import importlib.util
import json
import sqlite3
import time
from pathlib import Path
from uuid import uuid4

path = Path("apps/engine/tests/test_runtime.py").resolve()
spec = importlib.util.spec_from_file_location("nma_tests", path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
fixture = module.runtime.__wrapped__(None)
root, server, call, start, process, description = next(fixture)
try:
    create = module.command("agent.create", {
        "display_name": "Retry", "handle": "retry",
        "config": {"soul": "one", "instructions": "", "model": "test"},
    })
    agent = call(create)["result"]["agent"]
    send = module.command("runtime.submit", {
        "agent_id": agent["agent_id"], "thread_id": str(uuid4()),
        "config_revision": "1", "context_generation": "1", "text": "RETRY_PROBE",
    })
    receipt = call(send)["result"]
    time.sleep(0.5)
    # Reconstruct the valid post-native-commit/pre-extension-finish boundary.
    with sqlite3.connect(root / "state/state.db") as db:
        db.execute("UPDATE nma_commands SET result=NULL WHERE command_id=?", (send["command_id"],))
        db.execute("UPDATE nma_runtime_outbox SET state='pending',result=NULL WHERE operation_id=?", (send["command_id"],))
        db.execute("DELETE FROM nma_events WHERE event_id=?", (send["command_id"],))
    update = module.command("agent.configure", {
        **create["payload"], "agent_id": agent["agent_id"],
        "config": {"soul": "two", "instructions": "", "model": "test"},
    })
    update["expected_revision"] = "1"
    revised = call(update)
    retry = call(send)
    existing = call(module.command("runtime.read", {"run_id": receipt["run_id"]}))
    result = {
        "config_revision_after_edit": revised["result"]["agent"]["config_revision"],
        "retry": retry,
        "existing_native_run": existing,
        "reproduced": retry.get("error", {}).get("code") == "REVISION_CONFLICT"
            and existing.get("result", {}).get("config_revision") == "1",
    }
    print(json.dumps(result, indent=2))
    assert result["reproduced"]
finally:
    try:
        next(fixture)
    except StopIteration:
        pass
