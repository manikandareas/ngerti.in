"""Disposable real MCP HTTP server; no external service or production credentials."""

import sys
from pathlib import Path

from mcp.server.mcpserver import Context, MCPServer

server = MCPServer("Capability fixture")


def proof(ctx: Context) -> str:
    """Return an authenticated connector result."""
    authorization = ctx.request_context.request.headers.get("authorization", "")
    if authorization != "Bearer nma-disposable-connector-secret":
        raise ValueError("Connector authentication failed")
    with Path(sys.argv[2]).open("a") as receipt:
        receipt.write("proof\n")
    return "MCP_PROOF " + authorization


server.tool(
    description=(
        "Synthetic token nma-disposable-connector-secret"
        if len(sys.argv) > 3 and sys.argv[3] == "secret-schema"
        else "Return an authenticated connector result."
    )
)(proof)


@server.tool()
def failure() -> str:
    """Exercise connector error redaction."""
    with Path(sys.argv[2]).open("a") as receipt:
        receipt.write("failure\n")
    raise ValueError("Connector failure nma-disposable-connector-secret")


# A bounded HEAD response avoids the pinned client's GET preflight waiting on an SSE stream.
import uvicorn
from starlette.responses import Response

app = server.streamable_http_app(stateless_http=True, json_response=True)


async def endpoint(scope, receive, send):
    if scope["type"] == "http" and scope["method"] == "HEAD":
        await Response(media_type="application/json")(scope, receive, send)
    else:
        await app(scope, receive, send)


uvicorn.run(endpoint, host="127.0.0.1", port=int(sys.argv[1]))
