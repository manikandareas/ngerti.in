"""Bound multipart ingress before Starlette can spool an oversized upload."""

from starlette.exceptions import HTTPException
from starlette.responses import JSONResponse


class UploadBodyLimitMiddleware:
    def __init__(self, app, max_bytes: int):
        self.app = app
        self.max_bytes = max_bytes + 65536

    async def __call__(self, scope, receive, send):
        if (
            scope["type"] != "http"
            or scope["method"] != "POST"
            or not scope["path"].startswith("/files")
        ):
            await self.app(scope, receive, send)
            return
        length = dict(scope["headers"]).get(b"content-length")
        if length and (not length.isdigit() or int(length) > self.max_bytes):
            await JSONResponse({"detail": "Upload maksimal 10 MiB per file."}, status_code=413)(
                scope, receive, send
            )
            return
        consumed = 0

        async def bounded_receive():
            nonlocal consumed
            message = await receive()
            consumed += len(message.get("body", b""))
            if consumed > self.max_bytes:
                raise HTTPException(413, "Upload maksimal 10 MiB per file.")
            return message

        await self.app(scope, bounded_receive, send)
