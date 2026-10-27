"""The retired custom action schema cannot be re-enabled or used as fallback."""

# ruff: noqa: F811
import json

from test_runtime import command, runtime  # noqa: F401


def test_retired_custom_browser_is_unavailable_even_when_configured(runtime):
    root, _, call, *_ = runtime
    (root / "capabilities.json").write_text(
        json.dumps(
            {"tool_grants": {"browser": {"enabled": True, "toolset": "nma_computer"}}}
        )
    )
    created = call(
        command(
            "agent.create",
            {
                "handle": "retired-browser",
                "display_name": "Retired browser",
                "config": {
                    "soul": "",
                    "model": "test",
                    "instructions": "Fixture",
                    "tool_grants": ["browser"],
                    "mcp_grants": [],
                    "skill_refs": [],
                },
            },
        )
    )
    assert created["error"]["code"] == "CAPABILITY_UNAVAILABLE", created
