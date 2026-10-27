"""Selected application operations and pinned native MCP catalog provenance."""

import os
from pathlib import Path

APPLICATIONS = {
    "notion": ("Notion", "notion", ["pages", "databases", "search"]),
    "linear": ("Linear", "linear", ["issues", "projects", "comments"]),
    "github": ("GitHub", None, ["repositories", "issues", "pull_requests", "actions"]),
    "n8n": ("n8n", "n8n-official", ["exposed_workflows"]),
    "google-workspace": (
        "Google (Gmail & Workspace)",
        None,
        ["gmail", "calendar", "drive", "docs", "sheets"],
    ),
}


def manifest():
    from utils import fast_safe_load

    root = Path(os.environ["HERMES_SOURCE"])
    items = []
    for identity, (label, native, operations) in APPLICATIONS.items():
        source = f"optional-mcps/{native}/manifest.yaml" if native else None
        entry = fast_safe_load((root / source).read_text()) if source else {}
        url = entry.get("transport", {}).get("url", "")
        if identity == "github":
            url = "https://api.githubcopilot.com/mcp/"
        if "${" in url:
            url = ""
        items.append(
            {
                "id": identity,
                "label": label,
                "url": url,
                "source": source,
                "operations": operations,
                "operation_groups": [
                    {
                        "id": operation,
                        "auth": "connection_scopes",
                        "side_effects": "server_declared_per_tool",
                        "acceptance": "pending",
                        "evidence": [],
                    }
                    for operation in operations
                ],
                "protocol_features": {
                    "http": "native",
                    "stdio": "operator_pinned_isolation",
                    "sampling": "owning_agent_model",
                    "elicitation": "form",
                    "costs": "native_declared_estimates",
                    "events": "unavailable_pending_thread_wake_bridge",
                },
                "auth_methods": ["oauth"]
                if identity in {"notion", "linear"}
                else ["bearer", "oauth"]
                if identity == "github"
                else ["oauth", "bearer"],
                "verification": "live_acceptance_pending",
                "prerequisites": (
                    ["instance_mcp_url", "exposed_workflows"]
                    if identity == "n8n"
                    else ["account_authorization"]
                ),
            }
        )
        if identity == "google-workspace":
            from ngertiin_engine.google_workspace import setup

            items[-1]["setup"] = setup()
            items[-1]["prerequisites"] = [
                "google_oauth_web_client",
                "google_apis_enabled",
                "google_consent_test_user_or_verified_app",
            ]
    return items
