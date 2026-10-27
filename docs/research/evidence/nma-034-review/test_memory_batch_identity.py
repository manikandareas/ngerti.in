"""Review reproduction: native mixed batches must preserve patched memory identity."""
import json
import sqlite3

from test_capabilities import capability_agent
from test_learning import conversation, inventory, invoke
from test_runtime import runtime  # noqa: F401


def test_remove_and_patch_preserve_the_patched_entry_identity(runtime):
    root, model, call, *_ = runtime
    agent = capability_agent(call, "batch-identity-review")
    dm = conversation(call, agent)
    for content in ("First independent preference: amber.", "Second independent preference: blue."):
        assert invoke(model, call, dm, "memory", {"action": "add", "target": "memory", "content": content})["success"]
    first, second = inventory(call, agent, dm)["memories"]
    result = invoke(model, call, dm, "memory", {
        "target": "memory", "operations": [
            {"action": "remove", "old_text": first["content"]},
            {"action": "patch", "old_text": second["content"], "content": "Corrected remaining preference: violet."},
        ],
    })
    assert result["success"], result
    remaining = inventory(call, agent, dm)["memories"]
    with sqlite3.connect(root / "state/state.db") as db:
        rows = db.execute("SELECT memory_id,content,status,revision FROM nma_memory_entries WHERE agent_id=? ORDER BY memory_id", (agent["agent_id"],)).fetchall()
    print("BATCH_IDENTITY_EVIDENCE", json.dumps({"removed_id": first["memory_id"], "patched_id": second["memory_id"], "remaining": remaining, "rows": rows}))
    assert len(remaining) == 1
    assert remaining[0]["memory_id"] == second["memory_id"]
