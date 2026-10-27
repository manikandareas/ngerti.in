"""App setup boundaries without external accounts or a running gateway."""

import json
import os
from pathlib import Path
from uuid import uuid4

import pytest
from ngertiin_engine.app_connections import AppConnections
from ngertiin_engine.contracts import EngineError


@pytest.fixture
def apps(tmp_path, monkeypatch):
    monkeypatch.setenv(
        "HERMES_SOURCE", str(Path(os.environ["HERMES_SOURCE"]).resolve())
    )
    monkeypatch.setenv("NMA_APP_ALLOWED_ORIGINS", "[]")
    monkeypatch.delenv("NMA_GOOGLE_OAUTH_CLIENT_ID", raising=False)
    monkeypatch.delenv("NMA_GOOGLE_OAUTH_CLIENT_SECRET", raising=False)
    return AppConnections(tmp_path, str(uuid4()))


@pytest.mark.parametrize("application", ["github", "notion", "linear"])
def test_vendor_connection_can_resubmit_its_stored_endpoint(apps, application):
    payload = {
        "connection_id": str(uuid4()),
        "application": application,
        "label": "First account",
        "auth_method": "bearer" if application == "github" else "oauth",
    }
    if application == "github":
        payload["api_key"] = "app-setup-disposable-secret"
    saved = apps.configure(payload)
    updated = apps.configure(
        {
            **payload,
            "label": "Updated account",
            "expected_generation": saved["generation"],
            "url": saved["url"],
        }
    )
    assert updated["connection_id"] == saved["connection_id"]
    assert updated["generation"] == saved["generation"] + 1
    assert updated["label"] == "Updated account"


@pytest.mark.parametrize(
    "url",
    [
        "https://example.org/mcp/",
        "https://api.githubcopilot.com/mcp/other",
        "https://api.githubcopilot.com/mcp/?token=bad",
        "https://api.githubcopilot.com@evil.example/mcp/",
    ],
)
def test_github_canonicalization_does_not_accept_other_targets(apps, url):
    with pytest.raises(EngineError, match="INVALID_ENDPOINT"):
        apps.configure(
            {
                "connection_id": str(uuid4()),
                "application": "github",
                "label": "Account",
                "auth_method": "bearer",
                "api_key": "app-setup-disposable-secret",
                "url": url,
            }
        )


def test_personal_google_setup_has_no_server_url_and_requires_registration(apps):
    from ngertiin_engine.app_auth import AppAuth

    saved = apps.configure(
        {
            "connection_id": str(uuid4()),
            "application": "google-workspace",
            "label": "Personal Gmail",
            "auth_method": "oauth",
        }
    )
    assert saved["builtin_mcp"] == "google_standard_api"
    assert saved["oauth_configured"] is False
    google = next(
        v for v in apps.listing()["applications"] if v["id"] == "google-workspace"
    )
    assert google["setup"]["requires_server_url"] is False
    assert "personal" in google["setup"]["account_types"]
    assert "n8n" not in {v["id"] for v in apps.listing()["applications"]}
    with pytest.raises(EngineError, match="APP_GOOGLE_OAUTH_REQUIRED"):
        AppAuth(apps).start(
            {
                "connection_id": saved["connection_id"],
                "redirect_uri": "http://localhost:3033/connections",
                "session_binding": "browser",
            }
        )


def test_google_registration_stays_private_and_survives_edit(apps):
    payload = {
        "connection_id": str(uuid4()),
        "application": "google-workspace",
        "label": "Google account",
        "auth_method": "oauth",
        "oauth_client_id": "google-app-client",
        "oauth_client_secret": "google-app-client-secret",
    }
    saved = apps.configure(payload)
    assert saved["oauth_configured"] is True
    updated = apps.configure(
        {
            "connection_id": saved["connection_id"],
            "application": "google-workspace",
            "label": "Updated",
            "auth_method": "oauth",
            "expected_generation": saved["generation"],
        }
    )
    assert updated["oauth_configured"] is True
    assert "google-app-client-secret" not in json.dumps(apps.listing())
    assert (
        apps.read(saved["connection_id"])["oauth_client_secret"]
        == "google-app-client-secret"
    )
