"""Development-only tunnel origin: a public sandbox page and two webhook routes."""

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse, Response

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)


@app.get("/", response_class=HTMLResponse)
async def index():
    return """<!doctype html><html lang="en"><meta name="viewport" content="width=device-width">
    <title>Ngertiin sandbox</title><main><h1>Ngertiin payment sandbox</h1>
    <p>Development integration for a personal AI assistant. This endpoint accepts only
    authenticated payment webhooks. Test subscriptions do not charge real money.</p>
    <p>Subscription checkout through Lemon Squeezy: IDR270,750 per 30 days,
    a fixed USD15 equivalent using BI JISDOR IDR18,050/USD on 19 October 2026.</p>
    <p>Plus: 300 messages and 5,000 compute credits per paid period.
    Recurring access; cancellation stops future renewal.</p></main></html>"""


@app.post("/billing/webhooks/{provider}")
async def webhook(provider: str, request: Request):
    if provider not in ("duitku", "lemonsqueezy"):
        raise HTTPException(404)
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > 65536:
            raise HTTPException(413)
    headers = {
        k: v
        for k, v in request.headers.items()
        if k.lower()
        in (
            "content-type",
            "x-signature",
            "x-event-name",
            "x-duitku-signature",
            "x-duitku-timestamp",
            "x-duitku-merchant",
        )
    }
    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=False) as client:
            response = await client.post(
                "http://127.0.0.1:8000/billing/webhooks/" + provider,
                content=bytes(body),
                headers=headers,
            )
        return Response(
            response.content,
            response.status_code,
            media_type=response.headers.get("content-type", "text/plain"),
        )
    except httpx.HTTPError as error:
        raise HTTPException(503, "Local webhook receiver unavailable") from error
