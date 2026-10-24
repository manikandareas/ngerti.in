"""Apply a saved default-agent plan to the real gateway, with durable retry identity."""

# ruff: noqa: F811
import json
import subprocess
from pathlib import Path

from test_runtime import OWNER, command, runtime  # noqa: F401


def test_default_agent_plan_retry_restart_and_changed_source_conflict(runtime):
    _, _, call, start, *_ = runtime
    backend = Path(__file__).resolve().parents[2] / "backend"
    request = {
        "owner": OWNER,
        "profile": {
            "name": "Preserved assistant",
            "soul": "Original private user instructions",
            "revision": 7,
        },
        "model": "test",
    }
    generated = subprocess.run(
        [
            str(backend / ".venv/bin/python"),
            "-c",
            "import json,sys; from ngertiin.agent_engine.migration import plan; print(json.dumps(plan(**json.load(sys.stdin))))",
        ],
        input=json.dumps(request),
        capture_output=True,
        text=True,
        check=True,
    )
    saved = json.loads(generated.stdout)
    body = saved["command"]
    result = call(body)
    assert "result" in result, result
    assert call(body) == result
    agent = result["result"]["agent"]
    assert agent["config"]["soul"] == request["profile"]["soul"]
    start.current.kill()
    start.current.wait(timeout=10)
    start()
    assert call(body) == result
    listing = call(command("agent.list", {"after": None, "limit": 100}))["result"][
        "items"
    ]
    assert [a["agent_id"] for a in listing] == [agent["agent_id"]]
    changed = json.loads(json.dumps(body))
    changed["payload"]["config"]["soul"] = "Changed source requires reconciliation"
    assert call(changed)["error"]["code"] == "COMMAND_CONFLICT"
