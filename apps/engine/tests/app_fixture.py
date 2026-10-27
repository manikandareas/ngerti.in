"""Real local MCP/OAuth/PKCE fixture with independently counted external effects."""

import asyncio
import base64
import hashlib
import json
import sys
from pathlib import Path
from urllib.parse import parse_qs, urlencode
from uuid import uuid4

import uvicorn
from mcp.server.mcpserver import Context, MCPServer
from mcp.types import SamplingMessage, TextContent
from pydantic import BaseModel
from starlette.requests import Request
from starlette.responses import JSONResponse, RedirectResponse, Response

port, receipt_path = int(sys.argv[1]), Path(sys.argv[2])
base = f"http://127.0.0.1:{port}"
oauth = len(sys.argv) > 3 and sys.argv[3] == "oauth"
server = MCPServer("App acceptance fixture")
tokens, codes = set(), {}


def receipt(value):
    with receipt_path.open("a") as stream:
        stream.write(json.dumps(value) + "\n")


@server.tool()
def proof() -> str:
    """Return a source-backed proof from this configured account."""
    receipt({"operation": "proof"})
    return "APP_PROOF nma-disposable-connector-secret"


class Form(BaseModel):
    topic: str


@server.tool()
async def form(ctx: Context) -> str:
    """Request a structured form through the same active tool call."""
    result = await ctx.elicit("Choose the research topic", Form)
    receipt({"operation": "form", "action": result.action})
    return "FORM_PROOF " + str(result)


@server.tool()
async def sampling(ctx: Context) -> str:
    """Request inference from the calling agent's native model route."""
    try:
        result = await ctx.session.create_message(
            [
                SamplingMessage(
                    role="user",
                    content=TextContent(type="text", text="APP_SAMPLING_PROOF"),
                )
            ],
            max_tokens=128,
        )
    except Exception as exc:
        receipt(
            {
                "operation": "sampling_error",
                "details": repr(exc),
                "data": str(getattr(exc, "error", None)),
            }
        )
        raise
    receipt({"operation": "sampling"})
    return "SAMPLING_PROOF " + str(result)


@server.tool()
async def lost_write() -> str:
    """Perform one counted write, then lose the acknowledgement."""
    receipt({"operation": "lost_write"})
    await asyncio.sleep(300)
    return "UNREACHABLE"


mcp_app = server.streamable_http_app(stateless_http=False, json_response=False)


async def app(scope, receive, send):
    if scope["type"] != "http":
        return await mcp_app(scope, receive, send)
    request = Request(scope, receive)
    path = request.url.path
    response = None
    if request.method == "HEAD":
        response = Response(media_type="application/json")
    elif path == "/v2/search":
        body = await request.json()
        receipt({"operation": "web_search", "query": body.get("query")})
        if body.get("query") == "rate-limit":
            response = JSONResponse(
                {"success": False, "error": "Fixture rate limit"},
                status_code=429,
                headers={"Retry-After": "0"},
            )
        elif body.get("query") == "malformed":
            response = Response("invalid-json", media_type="application/json")
        else:
            response = JSONResponse(
                {
                    "success": True,
                    "data": {
                        "web": [
                            {
                                "url": "https://example.org/source",
                                "title": "Verified source",
                                "description": "SOURCE_ATTRIBUTION_PROOF",
                            }
                        ]
                    },
                }
            )
    elif path == "/v2/scrape":
        body = await request.json()
        receipt({"operation": "web_extract", "url": body.get("url")})
        content = "\n".join(f"Line {i}: long source evidence" for i in range(1600))
        content += "\nLONG_PAGE_FINAL_PROOF\n"
        response = JSONResponse(
            {
                "success": True,
                "data": {
                    "markdown": content,
                    "metadata": {"title": "Long source", "sourceURL": body.get("url")},
                },
            }
        )
    elif path.startswith("/.well-known/oauth-protected-resource"):
        response = JSONResponse(
            {
                "resource": base + "/mcp",
                "authorization_servers": [base],
                "scopes_supported": ["tools"],
            }
        )
    elif path.startswith("/.well-known/oauth-authorization-server"):
        response = JSONResponse(
            {
                "issuer": base,
                "authorization_endpoint": base + "/authorize",
                "token_endpoint": base + "/token",
                "registration_endpoint": base + "/register",
                "response_types_supported": ["code"],
                "grant_types_supported": ["authorization_code", "refresh_token"],
                "code_challenge_methods_supported": ["S256"],
                "token_endpoint_auth_methods_supported": ["none"],
            }
        )
    elif path == "/register":
        value = await request.json()
        response = JSONResponse(
            {
                **value,
                "client_id": "fixture-web-client",
                "token_endpoint_auth_method": "none",
            },
            status_code=201,
        )
    elif path == "/authorize":
        query = dict(request.query_params)
        code = str(uuid4())
        codes[code] = query
        response = RedirectResponse(
            query["redirect_uri"]
            + "?"
            + urlencode({"code": code, "state": query["state"]})
        )
    elif path == "/token":
        form_data = parse_qs((await request.body()).decode())
        if form_data.get("grant_type") == ["authorization_code"]:
            data = codes.pop(form_data.get("code", [""])[0], {})
            verifier = form_data.get("code_verifier", [""])[0]
            challenge = (
                base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest())
                .decode()
                .rstrip("=")
            )
            if data.get("code_challenge") != challenge:
                return await JSONResponse({"error": "invalid_grant"}, status_code=400)(
                    scope, receive, send
                )
        token = "app-access-" + str(uuid4())
        tokens.add(token)
        receipt({"operation": "token", "grant_type": form_data.get("grant_type")})
        response = JSONResponse(
            {
                "access_token": token,
                "token_type": "Bearer",
                "refresh_token": "app-refresh-token",
                "expires_in": 3,
                "scope": "tools",
            }
        )
    elif path == "/mcp":
        auth = request.headers.get("authorization", "")
        valid = (
            auth.removeprefix("Bearer ") in tokens
            if oauth
            else auth == "Bearer nma-disposable-connector-secret"
        )
        if not valid:
            response = JSONResponse(
                {"error": "unauthorized"},
                status_code=401,
                headers={
                    "WWW-Authenticate": 'Bearer resource_metadata="'
                    + base
                    + '/.well-known/oauth-protected-resource"'
                },
            )
    if response is not None:
        return await response(scope, receive, send)

    async def observed(message):
        if message.get("type") == "http.response.body":
            for line in message.get("body", b"").decode(errors="replace").splitlines():
                if line.startswith("data: "):
                    try:
                        data = json.loads(line[6:])
                    except ValueError:
                        continue
                    if str(data.get("method", "")).startswith("sampling/"):
                        receipt({"operation": "sampling_wire", "value": data})
        await send(message)

    return await mcp_app(scope, receive, observed)


uvicorn.run(app, host="127.0.0.1", port=port)
