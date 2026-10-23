"""Independently check mutation effects and restart evidence in saved model results."""

import argparse
import json
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("results", type=Path)
args = parser.parse_args()
results = json.loads(args.results.read_text())
assert len(results) == 16, "Incomplete dataset"
for result in results:
    assert result["passed"], result["case"]
    before = {task["id"]: task for task in result["before"]}
    after = {task["id"]: task for task in result["after"]}
    changed = {action["id"] for action in result["applied"]}
    for task_id, task in before.items():
        assert task_id in after, "Mutation deleted a task"
        if task_id not in changed:
            assert after[task_id] == task, "Unrelated responsibility changed"
        if task["status"] == "archived":
            assert after[task_id]["status"] == "archived", "Stopped goal revived"
    for action in result["applied"]:
        task = after[action["id"]]
        if action["op"] == "stop":
            assert task["status"] == "archived", "Stop did not persist"
        elif action["op"] == "update":
            assert task["session_id"] == before[task["id"]]["session_id"], "Origin lost"
            assert task["status"] == before[task["id"]]["status"], (
                "Correction changed lifecycle"
            )
        else:
            assert task["status"] == "ready", "New responsibility not dispatchable"
            assert task["session_id"] == result["session"], "Incorrect origin session"
assert len({result["pid"] for result in results}) == len(results), (
    "Process not restarted"
)
print(
    "PASS: 16 cases; persisted stops, unchanged peers, stable origin, ready creations, distinct processes"
)
