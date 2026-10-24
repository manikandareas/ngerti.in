"""Revocation and ambiguous external effects at the real gateway dispatch boundary."""

import json
import os
import tempfile
from pathlib import Path

import pytest
from test_capabilities import capability_agent
from test_direct_messages import send, snapshot
from test_goal_lifecycle import eventually
from test_runtime import command, settle
from test_runtime import runtime as native_runtime


@pytest.fixture(scope="module")
def runtime(tmp_path_factory):
    root = Path(tempfile.mkdtemp(prefix="nma-actuator-"))
    (root / "calls").touch()
    script = root / "actuator.py"
    script.write_text("""import json,sys,time
from pathlib import Path
root=Path(__file__).parent
request=json.load(sys.stdin)
with (root/'calls').open('a') as f: f.write(json.dumps(request)+'\\n')
mode=request.get('action',{}).get('description','')
if mode=='block':
 (root/'started').touch()
 until=time.monotonic()+30
 while not (root/'release').exists() and time.monotonic()<until: time.sleep(.05)
if mode=='unknown': sys.exit(1)
print(json.dumps({'resource_id':'private-provider-id','observation':{'title':'PRIVATE_BROWSER_CANARY'}}))
""")
    previous = os.environ.get("NMA_TEST_COMPUTER_COMMAND")
    os.environ["NMA_TEST_COMPUTER_COMMAND"] = json.dumps(
        [os.environ.get("NMA_TEST_RUNTIME_PYTHON", "python3"), str(script)]
    )
    generator = native_runtime.__wrapped__(tmp_path_factory)
    state = next(generator)
    try:
        yield (*state, root)
    finally:
        next(generator, None)
        if previous is None:
            os.environ.pop("NMA_TEST_COMPUTER_COMMAND", None)
        else:
            os.environ["NMA_TEST_COMPUTER_COMMAND"] = previous


def setup(runtime, handle):
    root, provider, call, *_ = runtime
    (root / "capabilities.json").write_text(
        json.dumps(
            {"tool_grants": {"browser": {"enabled": True, "toolset": "nma_computer"}}}
        )
    )
    agent = capability_agent(call, handle, tool_grants=["browser"])
    thread = call(
        command(
            "thread.create",
            {"kind": "dm", "title": handle, "agent_ids": [agent["agent_id"]]},
        )
    )["result"]["thread"]

    def script(body, text):
        if not body.get("messages"):
            return None
        if body["messages"][-1]["role"] == "tool":
            return {"role": "assistant", "content": body["messages"][-1]["content"]}
        if text.startswith("BROWSER:"):
            return {
                "role": "assistant",
                "content": None,
                "tool_calls": [
                    {
                        "id": "browser-test",
                        "type": "function",
                        "function": {
                            "name": "computer",
                            "arguments": json.dumps(
                                {
                                    "operation": "act",
                                    "action": {
                                        "kind": "navigate",
                                        "url": "https://example.com",
                                        "description": text.split(":")[1],
                                    },
                                }
                            ),
                        },
                    }
                ],
            }
        return None

    provider.goal_script = script
    return agent, thread


def test_active_revoke_fences_browser_result(runtime):
    _, provider, call, _, *_, actuator = runtime
    agent, thread = setup(runtime, "active-browser-revoke")
    request = call(send(thread, "BROWSER:block"))["result"]
    eventually(lambda: (actuator / "started").exists(), bool)
    disabled = command("agent.disable", {"agent_id": agent["agent_id"]})
    disabled["expected_revision"] = agent["revision"]
    assert "result" in call(disabled)
    (actuator / "release").touch()
    settle(call, request["run_id"], "cancelled")
    final = snapshot(call, thread)
    assert "PRIVATE_BROWSER_CANARY" not in json.dumps(final)
    provider.goal_script = None


def test_unknown_effect_not_retried_after_restart_or_new_run(runtime):
    _, provider, call, start, *_, actuator = runtime
    _, thread = setup(runtime, "unknown-browser-effect")
    before = len((actuator / "calls").read_text().splitlines())
    request = call(send(thread, "BROWSER:unknown"))["result"]
    settle(call, request["run_id"], "indeterminate")
    assert len((actuator / "calls").read_text().splitlines()) == before + 1
    start.current.kill()
    start.current.wait(timeout=10)
    start()
    diagnosis = call(command("run.diagnostics", {"run_id": request["run_id"]}))[
        "result"
    ]
    assert diagnosis["run"]["status"] == "indeterminate"
    assert diagnosis["effects"][0]["status"] == "dispatching"
    fresh = call(send(thread, "BROWSER:observe"))["result"]
    settle(call, fresh["run_id"], "indeterminate")
    assert len((actuator / "calls").read_text().splitlines()) == before + 1
    provider.goal_script = None
