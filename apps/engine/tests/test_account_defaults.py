"""Default configuration repair preserves receipts and user-owned identities."""

# ruff: noqa: F811
import sqlite3

from test_runtime import command, runtime  # noqa: F401
from test_threads import create_agent


def test_default_configuration_retry_handle_collision_and_archive(runtime):
    root, provider, call, start, *_ = runtime
    existing = create_agent(call, "tobi")
    models = root / "models.json"
    original = models.read_bytes()
    start.current.terminate()
    start.current.wait(timeout=25)
    models.write_text("{}")
    start()
    setup = command("account.ensure")
    assert call(setup)["error"]["code"] == "MODEL_UNAVAILABLE"
    with sqlite3.connect(root / "state/state.db") as db:
        assert db.execute("SELECT count(*) FROM nma_account_setup").fetchone()[0] == 0
        assert db.execute("SELECT count(*) FROM nma_agents").fetchone()[0] == 1
    start.current.terminate()
    start.current.wait(timeout=25)
    models.write_bytes(original)
    start()
    result = call(setup)["result"]
    assert result["default_agent_id"] != existing["agent_id"]
    agents = call(command("agent.list", {"after": None, "limit": 100}))["result"][
        "items"
    ]
    default = next(a for a in agents if a["agent_id"] == result["default_agent_id"])
    assert default["display_name"] == "Tobi" and default["handle"] == "tobi-2"
    archive = command("agent.archive", {"agent_id": default["agent_id"]})
    archive["expected_revision"] = default["revision"]
    assert "result" in call(archive)
    current = call(command("account.ensure"))["result"]
    assert current["default_agent_id"] == default["agent_id"]
    assert current["agent_status"] == "archived"
    assert call(setup)["result"] == result
    assert provider.requests == []
