"""A provider-free account still owns a stable Tobi and a usable repair path."""

# ruff: noqa: F811
from test_direct_messages import send
from test_runtime import command, runtime  # noqa: F401


def test_account_and_empty_dm_do_not_require_openai_bootstrap(runtime):
    root, provider, call, start, *_ = runtime
    start.current.kill()
    start.current.wait(timeout=10)
    (root / "state").rename(root / "original-state")
    (root / "state").mkdir(mode=0o700)
    (root / "models.json").write_text("{}")
    start(
        overrides={
            "OPENAI_API_KEY": "",
            "NMA_BINDINGS_FILE": "",
            "NMA_DEFAULT_MODEL": "",
        }
    )
    setup = call(command("account.ensure"))
    assert "result" in setup, setup
    identity = setup["result"]["default_agent_id"]
    thread = call(
        command("thread.read", {"thread_id": setup["result"]["primary_dm_thread_id"]})
    )["result"]
    snap = call(command("thread.snapshot", {"thread_id": thread["thread_id"]}))[
        "result"
    ]
    assert len(snap["messages"]) == 1 and snap["messages"][0]["run_id"] is None
    assert (
        call(send(thread, "Needs a provider"))["error"]["code"] == "MODEL_UNAVAILABLE"
    )
    assert provider.requests == []
    assert call(command("connection.list"))["result"]["items"] == []
    start.current.kill()
    start.current.wait(timeout=10)
    start(
        overrides={
            "OPENAI_API_KEY": "",
            "NMA_BINDINGS_FILE": "",
            "NMA_DEFAULT_MODEL": "",
        }
    )
    assert call(command("account.ensure"))["result"]["default_agent_id"] == identity
    assert (
        call(command("agent.list", {"after": None, "limit": 100}))["result"]["models"]
        == []
    )
