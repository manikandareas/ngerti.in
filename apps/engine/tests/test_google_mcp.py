"""Standard Google APIs behind the real native MCP client; no live Google grant."""

import base64
import json
from concurrent.futures import ThreadPoolExecutor
from email import policy
from email.parser import BytesParser
from uuid import uuid4

import httpx
from ngertiin_engine.app_connections import AppConnections
from ngertiin_engine.google_mcp import GoogleAPI, GoogleBridge
from tools.mcp_tool_discovery import register_mcp_servers
from tools.mcp_tool_lifecycle import shutdown_mcp_servers
from tools.mcp_tool_schema import mcp_prefixed_tool_name
from tools.registry import registry, session_tool_scope


def connection(tmp_path):
    apps = AppConnections(tmp_path, str(uuid4()))
    metadata = apps.configure(
        {
            "connection_id": str(uuid4()),
            "application": "google-workspace",
            "label": "Personal Google",
            "auth_method": "oauth",
            "oauth_client_id": "registered-client-id",
            "oauth_client_secret": "registered-client-secret",
        }
    )
    return apps, metadata


def test_google_native_mcp_tools_preserve_results_and_revoke(tmp_path):
    apps, metadata = connection(tmp_path)
    requests = []

    def respond(request):
        requests.append(request)
        assert request.headers["authorization"] == "Bearer google-access-canary"
        if len(requests) == 3:
            return httpx.Response(503, json={"error": "Unavailable"})
        return httpx.Response(
            200,
            json={
                "id": "provider-receipt",
                "messages": [{"id": "message-1"}],
                "nextPageToken": "next-page",
            },
        )

    bridge = GoogleBridge(
        apps,
        metadata["connection_id"],
        metadata["generation"],
        api=GoogleAPI(httpx.MockTransport(respond)),
    )
    scope, name = "google-wire-" + uuid4().hex, "google"
    try:
        challenge = httpx.get(bridge.url)
        assert challenge.status_code == 401
        protected = httpx.get(
            bridge.url.removesuffix("/mcp") + "/.well-known/oauth-protected-resource"
        ).json()
        assert protected["authorization_servers"] == ["https://accounts.google.com"]
        initialized = httpx.post(
            bridge.url,
            json={
                "jsonrpc": "2.0",
                "id": 1,
                "method": "initialize",
                "params": {
                    "protocolVersion": "2025-11-25",
                    "clientInfo": {"name": "probe", "version": "1"},
                    "capabilities": {},
                },
            },
            headers={
                "Authorization": "Bearer google-access-canary",
                "Accept": "application/json, text/event-stream",
            },
        )
        assert initialized.status_code == 200, initialized.text
        assert (
            "https://www.googleapis.com/auth/gmail.readonly"
            in protected["scopes_supported"]
        )
        with session_tool_scope(scope):
            names = register_mcp_servers(
                {
                    name: {
                        "url": bridge.url,
                        "headers": {"Authorization": "Bearer google-access-canary"},
                        "connect_timeout": 5,
                        "tool_timeout": 5,
                    }
                }
            )
            assert len(names) >= 12
            search = mcp_prefixed_tool_name(name, "gmail_search")
            draft = mcp_prefixed_tool_name(name, "gmail_create_draft")
            result = registry.dispatch(
                search,
                {"query": "is:unread", "max_results": 200, "page_token": "cursor"},
            )
            assert "message-1" in str(result) and "next-page" in str(result)
            assert requests[0].url.host == "gmail.googleapis.com"
            assert requests[0].url.params["maxResults"] == "100"
            assert requests[0].url.params["pageToken"] == "cursor"
            result = registry.dispatch(
                draft,
                {
                    "to": "fixture@example.org",
                    "subject": "Fixture draft",
                    "body": "Draft only",
                },
            )
            assert "provider-receipt" in str(result)
            assert requests[1].method == "POST" and requests[1].url.path.endswith(
                "/drafts"
            )
            message = BytesParser(policy=policy.default).parsebytes(
                base64.urlsafe_b64decode(
                    json.loads(requests[1].content)["message"]["raw"]
                )
            )
            assert message["To"] == "fixture@example.org"
            assert message["Subject"] == "Fixture draft"
            assert message.get_content().strip() == "Draft only"
            result = registry.dispatch(
                draft,
                {
                    "to": "fixture@example.org",
                    "subject": "Failed write",
                    "body": "Do not retry",
                },
            )
            assert "GOOGLE_API_UNAVAILABLE" in str(result)
            assert len(requests) == 3
            apps.disconnect(metadata["connection_id"])
            result = registry.dispatch(search, {"query": "must not dispatch"})
            assert "error" in str(result).lower()
            assert len(requests) == 3
    finally:
        shutdown_mcp_servers(scope=scope)
        bridge.stop()


def test_google_service_tools_keep_provider_contracts(tmp_path):
    apps, metadata = connection(tmp_path)
    requests = []

    def respond(request):
        requests.append(request)
        return httpx.Response(200, json={"id": "receipt-" + str(len(requests))})

    bridge = GoogleBridge(
        apps,
        metadata["connection_id"],
        metadata["generation"],
        api=GoogleAPI(httpx.MockTransport(respond)),
    )
    scope, name = "google-contract-" + uuid4().hex, "google"
    event = {
        "summary": "Fixture",
        "start": {"dateTime": "2026-10-28T10:00:00+08:00"},
        "end": {"dateTime": "2026-10-28T11:00:00+08:00"},
    }
    calls = [
        ("gmail_get", {"message_id": "message/one?"}),
        ("gmail_send_draft", {"draft_id": "draft-one"}),
        ("drive_get", {"file_id": "file/one?"}),
        ("calendar_list", {"calendar_id": "primary", "page_token": "next"}),
        ("calendar_create", {"event": event}),
        ("docs_get", {"document_id": "document-one"}),
        ("docs_create", {"title": "Fixture document"}),
        ("sheets_get", {"spreadsheet_id": "sheet-one", "range": "Tab 1!A1:B2"}),
        (
            "sheets_update",
            {"spreadsheet_id": "sheet-one", "range": "A1", "values": [["Fixture", 42]]},
        ),
    ]
    try:
        with session_tool_scope(scope):
            register_mcp_servers(
                {
                    name: {
                        "url": bridge.url,
                        "headers": {"Authorization": "Bearer contract-secret"},
                        "connect_timeout": 5,
                    }
                }
            )
            from tools.mcp_tool_handlers import _tool_is_read_only

            assert _tool_is_read_only(name, "gmail_get") is True
            assert _tool_is_read_only(name, "gmail_send_draft") is False
            for index, (tool, arguments) in enumerate(calls, start=1):
                result = registry.dispatch(
                    mcp_prefixed_tool_name(name, tool), arguments
                )
                assert json.loads(json.loads(result)["result"]) == {
                    "id": "receipt-" + str(index)
                }
        assert len(requests) == len(calls)
        assert requests[0].url.host == "gmail.googleapis.com"
        assert b"message%2Fone%3F" in requests[0].url.raw_path
        assert json.loads(requests[1].content) == {"id": "draft-one"}
        assert requests[2].url.host == "www.googleapis.com"
        assert b"file%2Fone%3F" in requests[2].url.raw_path
        assert requests[3].url.params["pageToken"] == "next"
        assert requests[4].method == "POST" and json.loads(requests[4].content) == event
        assert requests[5].url.host == "docs.googleapis.com"
        assert requests[5].url.params["includeTabsContent"] == "true"
        assert json.loads(requests[6].content) == {"title": "Fixture document"}
        assert requests[7].url.host == "sheets.googleapis.com"
        assert b"Tab%201%21A1%3AB2" in requests[7].url.raw_path
        assert requests[8].method == "PUT"
        assert requests[8].url.params["valueInputOption"] == "USER_ENTERED"
        assert json.loads(requests[8].content) == {"values": [["Fixture", 42]]}
    finally:
        shutdown_mcp_servers(scope=scope)
        bridge.stop()


def test_google_access_tokens_are_request_local(tmp_path):
    apps, metadata = connection(tmp_path)

    def respond(request):
        account = {"Bearer account-a-secret": "A", "Bearer account-b-secret": "B"}[
            request.headers["authorization"]
        ]
        return httpx.Response(200, json={"account": account})

    bridge = GoogleBridge(
        apps,
        metadata["connection_id"],
        metadata["generation"],
        api=GoogleAPI(httpx.MockTransport(respond)),
    )
    scopes = ["google-a-" + uuid4().hex, "google-b-" + uuid4().hex]
    try:
        for scope, label in zip(scopes, ["a", "b"]):
            with session_tool_scope(scope):
                register_mcp_servers(
                    {
                        label: {
                            "url": bridge.url,
                            "headers": {
                                "Authorization": "Bearer account-" + label + "-secret"
                            },
                            "connect_timeout": 5,
                            "tool_timeout": 5,
                        }
                    }
                )

        def call(label):
            index = 0 if label == "a" else 1
            with session_tool_scope(scopes[index]):
                result = registry.dispatch(
                    mcp_prefixed_tool_name(label, "drive_search"),
                    {"query": "shared query"},
                )
                return json.loads(json.loads(result)["result"])

        with ThreadPoolExecutor(max_workers=2) as pool:
            result = list(pool.map(call, ["a", "b"]))
        assert result == [{"account": "A"}, {"account": "B"}]
        assert "secret" not in json.dumps(result)
    finally:
        for scope in scopes:
            shutdown_mcp_servers(scope=scope)
        bridge.stop()
