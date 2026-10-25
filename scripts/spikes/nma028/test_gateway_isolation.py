"""Supplemental controlled-model test of real Clerk/API/native cancellation.

This does not replace any live-model corpus cell. It verifies that the versioned
gateway hook actually cancels an in-flight scoped native command.
"""

import json
import os
import sqlite3
import time
from pathlib import Path
from types import SimpleNamespace

import pytest

pytestmark = pytest.mark.skipif(
    not os.environ.get("NMA028_AUTH_STATE"),
    reason="Real disposable Clerk/API and Docker required",
)


def test_authenticated_gateway_cancels_native_tool_and_deduplicates(tmp_path):
    from complete_baseline import Product, journal_pending, wait_until

    args = SimpleNamespace(
        surface="application",
        synthetic=True,
        auth_state=Path(os.environ["NMA028_AUTH_STATE"]).resolve(),
        control_dir=tmp_path / "control",
        output=tmp_path / "unused.jsonl",
        env_file=tmp_path / "unused.env",
    )
    driver = Product(args)
    _, provider, *_ = driver.state

    def script(body, _text):
        if not body.get("messages"):
            return None
        if body["messages"][-1]["role"] == "tool":
            return {"role": "assistant", "content": "CONTROLLED_COMPLETION"}
        return {
            "role": "assistant",
            "content": None,
            "tool_calls": [
                {
                    "id": "scoped-stop-proof",
                    "type": "function",
                    "function": {
                        "name": "terminal",
                        "arguments": json.dumps(
                            {"command": "sleep 4; printf forbidden > /work/after-stop"}
                        ),
                    },
                }
            ],
        }

    provider.goal_script = script
    try:
        conversation = driver.create()
        submission = driver.send(conversation, "CONTROLLED_NATIVE_CANCELLATION")
        wait_until(
            lambda: journal_pending(driver.broker, conversation["scope"]),
            bool,
            timeout=45,
        )
        stop = driver.cancel(conversation, submission)
        time.sleep(5)
        observation = driver.broker.inspect(conversation["scope"])
        with sqlite3.connect(driver.broker.database) as db:
            scope_state = db.execute(
                "SELECT state FROM scopes WHERE scope_key=?",
                (conversation["scope"].key,),
            ).fetchone()[0]
            operations = db.execute(
                "SELECT operation_id,state FROM operations WHERE scope_key=?",
                (conversation["scope"].key,),
            ).fetchall()
        assert scope_state == "cancelled"
        assert not any(f["path"] == "after-stop" for f in observation["files"])
        assert len(operations) == 1 and operations[0][1] == "indeterminate"
        recovery = driver.restart()
        retry = driver.invoke(submission["command"])
        assert retry["run_id"] == submission["receipt"]["run_id"]
        with driver.http("/api/agent-engine/v1/runs/" + retry["run_id"]) as response:
            state = json.load(response)
        assert state["status"] == "cancelled"
        output = {
            "live_model": False,
            "native_tools": True,
            "authentication": "Real Clerk JWT; production current_account",
            "run_id": retry["run_id"],
            "scope": conversation["scope"].__dict__,
            "stop": stop,
            "scope_state": scope_state,
            "operations": operations,
            "after_original_delay": observation,
            "recovery_s": recovery,
            "duplicate_request_same_run": True,
            "run_status": state["status"],
        }
        if os.environ.get("NMA028_GATEWAY_PROOF_OUTPUT"):
            Path(os.environ["NMA028_GATEWAY_PROOF_OUTPUT"]).write_text(
                json.dumps(output, indent=2) + "\n"
            )
    finally:
        driver.close()
