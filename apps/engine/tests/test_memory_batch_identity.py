"""Native batch receipts preserve fact identity, provenance and atomic recovery."""

# ruff: noqa: F811
import json
import sqlite3

import pytest
from test_capabilities import capability_agent
from test_direct_messages import send
from test_learning import conversation, inventory, invoke
from test_runtime import runtime, settle  # noqa: F401


@pytest.mark.parametrize(
    "operations, expected",
    [
        ([("remove", "A", ""), ("patch", "B", "C")], [("B", "C")]),
        ([("remove", "A", ""), ("add", "", "C")], [("B", "B"), (None, "C")]),
        ([("patch", "B", "D"), ("patch", "A", "C")], [("A", "C"), ("B", "D")]),
        (
            [("add", "", "C"), ("patch", "C", "D"), ("remove", "A", "")],
            [("B", "B"), (None, "D")],
        ),
        ([("patch", "A", "B"), ("remove", "B", "")], [("B", "B")]),
        ([("remove", "A", ""), ("add", "", "A")], [("B", "B"), (None, "A")]),
        (
            [("add", "", "A"), ("patch", "B", "C"), ("patch", "C", "D")],
            [("A", "A"), ("B", "D")],
        ),
    ],
)
def test_native_batch_identity_provenance_retry_and_restart(
    runtime, operations, expected
):
    root, model, call, start, *_ = runtime
    agent = capability_agent(call, "batch-" + str(len(model.requests)))
    dm = conversation(call, agent)
    for text in ("First preference: amber.", "Second preference: blue."):
        assert invoke(
            model,
            call,
            dm,
            "memory",
            {"action": "add", "target": "memory", "content": text},
        )["success"]
    ordered = inventory(call, agent, dm)["memories"]
    originals = dict(zip(("A", "B"), ordered))
    texts = {key: item["content"] for key, item in originals.items()} | {
        "C": "Updated preference: coral.",
        "D": "Final preference: violet.",
    }
    arguments = {
        "target": "memory",
        "operations": [
            {
                "action": action,
                "old_text": texts.get(old, ""),
                "content": texts.get(new, ""),
            }
            for action, old, new in operations
        ],
    }

    def script(body, text):
        if body["messages"][-1]["role"] == "tool":
            return {"role": "assistant", "content": "Batch result observed."}
        return {
            "role": "assistant",
            "content": None,
            "tool_calls": [
                {
                    "id": "batch-proof",
                    "type": "function",
                    "function": {"name": "memory", "arguments": json.dumps(arguments)},
                }
            ],
        }

    request = send(dm, "Apply the requested memory batch.")
    model.goal_script = script
    try:
        response = call(request)
        assert "result" in response, response
        settle(call, response["result"]["run_id"])
    finally:
        model.goal_script = None
    after = inventory(call, agent, dm)["memories"]
    assert len(after) == len(expected)
    retained_ids = set()
    for original, content in expected:
        if original is None:
            item = next(item for item in after if item["content"] == texts[content])
            assert item["memory_id"] not in {old["memory_id"] for old in ordered}
            assert item["revision"] == "1"
            assert not set(item["source_message_ids"]) & {
                source for old in ordered for source in old["source_message_ids"]
            }
        else:
            old = originals[original]
            item = next(item for item in after if item["memory_id"] == old["memory_id"])
            retained_ids.add(item["memory_id"])
            assert item["content"] == texts[content]
            assert set(old["source_message_ids"]) <= set(item["source_message_ids"])
            other = originals["B" if original == "A" else "A"]
            assert not set(other["source_message_ids"]) & set(
                item["source_message_ids"]
            )
            assert item["revision"] == ("1" if content == original else "2")
            assert item["history"][-1]["content"] == old["content"]
    with sqlite3.connect(root / "state/state.db") as db:
        for old in ordered:
            status, content = db.execute(
                "SELECT status,content FROM nma_memory_entries WHERE memory_id=?",
                (old["memory_id"],),
            ).fetchone()
            assert status == (
                "active" if old["memory_id"] in retained_ids else "deleted"
            )
            if status == "deleted":
                assert content == old["content"]
    # A duplicate ingress reuses the same native admission and receipt; it must
    # not reapply the destructive batch, including after a gateway restart.
    assert call(request)["result"]["run_id"] == response["result"]["run_id"]
    assert inventory(call, agent, dm)["memories"] == after
    start.current.kill()
    start.current.wait(timeout=10)
    start()
    assert call(request)["result"]["run_id"] == response["result"]["run_id"]
    assert inventory(call, agent, dm)["memories"] == after


@pytest.mark.parametrize("failure", ["no_match", "budget", "empty"])
def test_rejected_native_batch_leaves_memory_and_history_unchanged(runtime, failure):
    _, model, call, *_ = runtime
    agent = capability_agent(call, "atomic-" + failure)
    dm = conversation(call, agent)
    for content in ("Independent fact: amber.", "Independent fact: blue."):
        assert invoke(
            model,
            call,
            dm,
            "memory",
            {"target": "memory", "action": "add", "content": content},
        )["success"]
    before = inventory(call, agent, dm)["memories"]
    operations = [{"action": "remove", "old_text": before[0]["content"]}]
    operations.append(
        {
            "no_match": {
                "action": "patch",
                "old_text": "Missing fact",
                "content": "coral",
            },
            "budget": {
                "action": "add",
                "content": "A long ordinary preference. " * 200,
            },
            "empty": {"action": "remove", "old_text": before[1]["content"]},
        }[failure]
    )
    result = invoke(
        model, call, dm, "memory", {"target": "memory", "operations": operations}
    )
    assert result["success"] is False, result
    assert inventory(call, agent, dm)["memories"] == before


def test_user_memory_partial_patch_alias_and_final_budget(runtime):
    _, model, call, *_ = runtime
    agent = capability_agent(call, "user-memory-spans")
    dm = conversation(call, agent)
    original = "The user prefers “green tea” in the morning."
    assert invoke(
        model,
        call,
        dm,
        "memory",
        {"target": "user", "action": "add", "content": original},
    )["success"]
    before = inventory(call, agent, dm)["memories"][0]
    assert invoke(
        model,
        call,
        dm,
        "memory",
        {
            "target": "user",
            "action": "patch",
            "old_text": "green tea",
            "new_text": "black coffee",
        },
    )["success"]
    changed = inventory(call, agent, dm)["memories"][0]
    assert changed["memory_id"] == before["memory_id"]
    assert changed["content"] == original.replace("green tea", "black coffee")
    assert changed["target"] == "user" and changed["revision"] == "2"
    # The temporarily oversized batch is valid against the final native budget.
    large = "Detailed preference: " + "ordinary text " * 85
    assert invoke(
        model, call, dm, "memory", {"target": "user", "action": "add", "content": large}
    )["success"]
    old = inventory(call, agent, dm)["memories"]
    replacement = "New preference: " + "different text " * 85
    result = invoke(
        model,
        call,
        dm,
        "memory",
        {
            "target": "user",
            "operations": [
                {"action": "add", "content": replacement},
                {"action": "remove", "old_text": large},
                {
                    "action": "patch",
                    "old_text": "“black coffee”",
                    "content": "herbal tea",
                },
            ],
        },
    )
    assert result["success"], result
    after = inventory(call, agent, dm)["memories"]
    assert len(after) == 2
    survivor = next(item for item in after if item["memory_id"] == before["memory_id"])
    assert survivor["content"] == "The user prefers herbal tea in the morning."
    assert survivor["revision"] == "3"
    added = next(item for item in after if item["content"] == replacement.strip())
    assert added["memory_id"] not in {item["memory_id"] for item in old}
    assert added["target"] == "user"
