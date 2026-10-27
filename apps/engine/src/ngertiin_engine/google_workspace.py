"""Personal Google accounts use standard APIs through a native MCP transport."""

import os

RESOURCE_URL = "https://google-workspace.ngertiin.invalid/mcp"
SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.compose",
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/documents",
    "https://www.googleapis.com/auth/spreadsheets",
]
CLIENT_ENV = {
    "oauth_client_id": "NMA_GOOGLE_OAUTH_CLIENT_ID",
    "oauth_client_secret": "NMA_GOOGLE_OAUTH_CLIENT_SECRET",
}


def defaults():
    return {
        key: os.environ[name]
        for key, name in CLIENT_ENV.items()
        if os.environ.get(name)
    }


def setup():
    return {
        "kind": "google_standard_api",
        "account_types": ["personal", "workspace"],
        "requires_server_url": False,
        "oauth_configured": len(defaults()) == len(CLIENT_ENV),
        "documentation_url": "https://developers.google.com/identity/protocols/oauth2/web-server",
        "api_services": [
            "gmail.googleapis.com",
            "drive.googleapis.com",
            "calendar-json.googleapis.com",
            "docs.googleapis.com",
            "sheets.googleapis.com",
        ],
    }
