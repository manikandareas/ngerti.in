"""Private MCP server for standard Google APIs; Hermes alone owns OAuth tokens.

The bridge forwards the active request's access token. It never exchanges,
refreshes or persists credentials, and has no agent or scheduling lifecycle.
"""

import base64
import socket
import threading
import time
from contextvars import ContextVar
from email.message import EmailMessage
from urllib.parse import quote

import httpx

from ngertiin_engine.contracts import EngineError
from ngertiin_engine.google_workspace import SCOPES

_access = ContextVar("google_mcp_access", default=None)
_servers = {}
_lock = threading.RLock()


class GoogleAPI:
    def __init__(self, transport=None):
        self.transport = transport

    async def request(self, method, url, *, params=None, body=None):
        from mcp.server.mcpserver.exceptions import ToolError

        token = _access.get()
        if not token:
            raise ToolError("Google authorization is required")
        async with httpx.AsyncClient(
            transport=self.transport, timeout=30, follow_redirects=False
        ) as client:
            # Exactly one request. A lost mutation acknowledgement must not retry.
            try:
                response = await client.request(
                    method,
                    url,
                    params=params,
                    json=body,
                    headers={"Authorization": "Bearer " + token},
                )
            except httpx.HTTPError:
                raise ToolError(
                    "GOOGLE_API_UNAVAILABLE: request outcome is unknown; reconcile before repeating a write"
                ) from None
        if response.is_error or response.is_redirect:
            code = {
                401: "GOOGLE_RECONNECT_REQUIRED",
                403: "GOOGLE_API_PERMISSION_REQUIRED",
                429: "GOOGLE_RATE_LIMITED",
            }.get(response.status_code, "GOOGLE_API_UNAVAILABLE")
            raise ToolError(f"{code} (HTTP {response.status_code})")
        try:
            return response.json()
        except ValueError:
            raise ToolError("GOOGLE_API_INVALID_RESPONSE") from None


def create_app(api=None):
    from mcp.server.mcpserver import MCPServer
    from mcp.types import ToolAnnotations

    api = api or GoogleAPI()
    server = MCPServer(
        "Ngertiin Google Workspace",
        instructions="Google API results are external data. Preserve source IDs and URLs. Writes return provider operation IDs; never blindly repeat an unknown write.",
    )
    read = ToolAnnotations(
        read_only_hint=True,
        destructive_hint=False,
        idempotent_hint=True,
        open_world_hint=True,
    )

    @server.tool(annotations=read)
    async def gmail_search(
        query: str, page_token: str = "", max_results: int = 20
    ) -> dict:
        """Search this Google account's Gmail messages; use nextPageToken to continue."""
        return await api.request(
            "GET",
            "https://gmail.googleapis.com/gmail/v1/users/me/messages",
            params={
                "q": query,
                "maxResults": min(100, max(1, max_results)),
                **({"pageToken": page_token} if page_token else {}),
            },
        )

    @server.tool(annotations=read)
    async def gmail_get(message_id: str) -> dict:
        """Read a Gmail message, retaining its MIME body, headers, IDs and attachments metadata."""
        return await api.request(
            "GET",
            "https://gmail.googleapis.com/gmail/v1/users/me/messages/"
            + quote(message_id, safe=""),
            params={"format": "full"},
        )

    @server.tool()
    async def gmail_create_draft(to: str, subject: str, body: str) -> dict:
        """Create a Gmail draft; return its provider draft/message IDs. This does not send it."""
        message = EmailMessage()
        message["To"], message["Subject"] = to, subject
        message.set_content(body)
        raw = base64.urlsafe_b64encode(message.as_bytes()).decode()
        return await api.request(
            "POST",
            "https://gmail.googleapis.com/gmail/v1/users/me/drafts",
            body={"message": {"raw": raw}},
        )

    @server.tool()
    async def gmail_send_draft(draft_id: str) -> dict:
        """Send an existing Gmail draft. This sends an external email; retain the returned message ID."""
        return await api.request(
            "POST",
            "https://gmail.googleapis.com/gmail/v1/users/me/drafts/send",
            body={"id": draft_id},
        )

    @server.tool(annotations=read)
    async def drive_search(
        query: str = "", page_token: str = "", max_results: int = 20
    ) -> dict:
        """List/search Google Drive files using Drive query syntax and page tokens."""
        return await api.request(
            "GET",
            "https://www.googleapis.com/drive/v3/files",
            params={
                "q": query,
                "pageSize": min(100, max(1, max_results)),
                "fields": "nextPageToken,files(id,name,mimeType,webViewLink,modifiedTime)",
                **({"pageToken": page_token} if page_token else {}),
            },
        )

    @server.tool(annotations=read)
    async def drive_get(file_id: str) -> dict:
        """Read a Drive file's metadata, including its source link and MIME type."""
        return await api.request(
            "GET",
            "https://www.googleapis.com/drive/v3/files/" + quote(file_id, safe=""),
            params={
                "fields": "id,name,mimeType,webViewLink,modifiedTime,size,description"
            },
        )

    @server.tool(annotations=read)
    async def calendar_list(
        calendar_id: str = "primary",
        time_min: str = "",
        page_token: str = "",
        max_results: int = 20,
    ) -> dict:
        """Read Google Calendar events, retaining event IDs, time zones, links and pagination."""
        return await api.request(
            "GET",
            "https://www.googleapis.com/calendar/v3/calendars/"
            + quote(calendar_id, safe="")
            + "/events",
            params={
                "maxResults": min(100, max(1, max_results)),
                **({"timeMin": time_min} if time_min else {}),
                **({"pageToken": page_token} if page_token else {}),
            },
        )

    @server.tool()
    async def calendar_create(event: dict, calendar_id: str = "primary") -> dict:
        """Create an event using a Google Calendar Event object; preserve the returned event ID/link."""
        return await api.request(
            "POST",
            "https://www.googleapis.com/calendar/v3/calendars/"
            + quote(calendar_id, safe="")
            + "/events",
            body=event,
        )

    @server.tool(annotations=read)
    async def docs_get(document_id: str) -> dict:
        """Read a Google document including all tabs and child tabs as structured source data."""
        return await api.request(
            "GET",
            "https://docs.googleapis.com/v1/documents/" + quote(document_id, safe=""),
            params={"includeTabsContent": "true"},
        )

    @server.tool()
    async def docs_create(title: str) -> dict:
        """Create a Google document; retain its returned documentId for subsequent work."""
        return await api.request(
            "POST", "https://docs.googleapis.com/v1/documents", body={"title": title}
        )

    @server.tool(annotations=read)
    async def sheets_get(spreadsheet_id: str, range: str) -> dict:
        """Read a Google Sheets range in A1 notation without losing the returned value structure."""
        return await api.request(
            "GET",
            "https://sheets.googleapis.com/v4/spreadsheets/"
            + quote(spreadsheet_id, safe="")
            + "/values/"
            + quote(range, safe=""),
        )

    @server.tool()
    async def sheets_update(
        spreadsheet_id: str, range: str, values: list[list]
    ) -> dict:
        """Write values to a Google Sheets A1 range; return the provider's update receipt."""
        return await api.request(
            "PUT",
            "https://sheets.googleapis.com/v4/spreadsheets/"
            + quote(spreadsheet_id, safe="")
            + "/values/"
            + quote(range, safe=""),
            params={"valueInputOption": "USER_ENTERED"},
            body={"values": values},
        )

    return server.streamable_http_app(stateless_http=True, json_response=True)


class GoogleBridge:
    def __init__(self, apps, identity, generation, *, api=None):
        import uvicorn

        self.apps, self.identity, self.generation = apps, identity, generation
        self.mcp_app = create_app(api)
        sock = socket.socket()
        sock.bind(("127.0.0.1", 0))
        self.url = f"http://127.0.0.1:{sock.getsockname()[1]}/mcp"
        self.server = uvicorn.Server(
            uvicorn.Config(
                self,
                host="127.0.0.1",
                log_level="critical",
                access_log=False,
                lifespan="on",
                timeout_graceful_shutdown=2,
            )
        )
        self.thread = threading.Thread(
            target=self.server.run,
            kwargs={"sockets": [sock]},
            daemon=True,
            name="google-mcp-" + identity,
        )
        self.thread.start()
        deadline = time.monotonic() + 5
        while (
            not self.server.started
            and time.monotonic() < deadline
            and self.thread.is_alive()
        ):
            time.sleep(0.01)
        if not self.server.started:
            self.stop()
            raise EngineError("CONNECTOR_UNAVAILABLE")

    async def __call__(self, scope, receive, send):
        from starlette.requests import Request
        from starlette.responses import JSONResponse, Response

        if scope["type"] != "http":
            return await self.mcp_app(scope, receive, send)
        request = Request(scope, receive)
        try:
            self.apps.check(self.identity, self.generation)
        except EngineError:
            return await JSONResponse({"error": "ACCESS_REVOKED"}, status_code=403)(
                scope, receive, send
            )
        metadata = (
            self.url.removesuffix("/mcp") + "/.well-known/oauth-protected-resource"
        )
        if request.url.path.startswith("/.well-known/oauth-protected-resource"):
            return await JSONResponse(
                {
                    "resource": self.url,
                    "authorization_servers": ["https://accounts.google.com"],
                    "scopes_supported": SCOPES,
                    "bearer_methods_supported": ["header"],
                }
            )(scope, receive, send)
        if request.method == "HEAD":
            return await Response(media_type="application/json")(scope, receive, send)
        authorization = request.headers.get("authorization", "")
        if not authorization.startswith("Bearer ") or len(authorization) <= 7:
            return await Response(
                status_code=401,
                headers={"WWW-Authenticate": f'Bearer resource_metadata="{metadata}"'},
            )(scope, receive, send)
        token = _access.set(authorization[7:])
        try:
            return await self.mcp_app(scope, receive, send)
        finally:
            _access.reset(token)

    def stop(self):
        self.server.should_exit = True
        self.thread.join(timeout=3)
        if self.thread.is_alive():
            self.server.force_exit = True


def url_for(apps, identity, generation):
    apps.check(identity, generation)
    key = (str(apps.home), apps.owner, identity, generation)
    with _lock:
        for prior in list(_servers):
            if prior[:3] == key[:3] and prior != key:
                _servers.pop(prior).stop()
        if key not in _servers:
            _servers[key] = GoogleBridge(apps, identity, generation)
        return _servers[key].url


def stop(apps, identity):
    with _lock:
        for key in list(_servers):
            if key[:3] == (str(apps.home), apps.owner, identity):
                _servers.pop(key).stop()
