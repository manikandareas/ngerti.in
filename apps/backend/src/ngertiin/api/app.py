"""HTTP startup is independent from schema migrations and gateway lifecycle."""

import time
from contextlib import asynccontextmanager
from typing import Annotated
from uuid import uuid4

import psycopg
import structlog
from fastapi import Depends, FastAPI, Request
from fastapi.exception_handlers import request_validation_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError

from ngertiin.accounts.auth import current_account
from ngertiin.accounts.webhooks import router as account_webhook_router
from ngertiin.agent_engine.api import router as agent_engine_router
from ngertiin.agent_engine.conversations import router as conversation_router
from ngertiin.agent_engine.recovery import ensure_database_released
from ngertiin.agent_engine.stream import router as agent_stream_router
from ngertiin.async_db import close_pool
from ngertiin.billing.api import router as billing_router
from ngertiin.config import get_settings
from ngertiin.health import system_status
from ngertiin.models import Account

settings = get_settings()
logger = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await ensure_database_released()
    yield
    await close_pool()


app = FastAPI(
    title="Ngertiin API",
    docs_url="/docs" if settings.diagnostics_enabled else None,
    lifespan=lifespan,
)


app.include_router(account_webhook_router)
app.include_router(conversation_router)
app.include_router(agent_engine_router)
app.include_router(agent_stream_router)
app.include_router(billing_router)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Authorization", "Content-Type", "Last-Event-ID"],
    expose_headers=["X-Request-ID"],
)


@app.exception_handler(RequestValidationError)
async def validation_failure(request: Request, error: RequestValidationError):
    if request.url.path.startswith(
        ("/api/agent-engine/v1/connections", "/api/agent-engine/v1/provider-auth")
    ):
        # Validation errors must not echo secret-bearing input or callback bodies.
        return JSONResponse(
            status_code=422,
            content={
                "detail": {"code": "INVALID_REQUEST", "message": "Connection request is invalid."}
            },
        )
    return await request_validation_exception_handler(request, error)


@app.middleware("http")
async def request_logging(request: Request, call_next):
    request_id, started = str(uuid4()), time.monotonic()
    structlog.contextvars.bind_contextvars(request_id=request_id)
    try:
        try:
            response = await call_next(request)
        except Exception as error:
            logger.error("http.unexpected_error", error_type=type(error).__name__)
            response = JSONResponse(
                status_code=500,
                content={
                    "detail": "Request failed. Reload the current state before retrying.",
                    "request_id": request_id,
                },
            )
            origin = request.headers.get("origin")
            if origin in settings.allowed_origins:
                response.headers["Access-Control-Allow-Origin"] = origin
                response.headers["Access-Control-Allow-Credentials"] = "true"
                response.headers["Vary"] = "Origin"
        response.headers["X-Request-ID"] = request_id
        logger.info(
            "http.request",
            method=request.method,
            path=request.url.path,
            status=response.status_code,
            duration_ms=round((time.monotonic() - started) * 1000),
        )
        return response
    finally:
        structlog.contextvars.clear_contextvars()


async def dependency_failure(request: Request, error: Exception):
    logger.error("dependency.unavailable", dependency_error=type(error).__name__)
    return JSONResponse(
        status_code=503, content={"detail": "Service is unavailable. Check system status."}
    )


for error_type in (SQLAlchemyError, psycopg.Error):
    app.add_exception_handler(error_type, dependency_failure)


@app.get("/health/live")
def live():
    return {"status": "alive"}


@app.get("/health/ready")
def ready():
    status = system_status()
    return JSONResponse(
        status_code=200 if status["api_ready"] else 503,
        content={"status": "ready" if status["api_ready"] else "unavailable"},
    )


@app.get("/me")
def me(account: Annotated[Account, Depends(current_account)]):
    return {
        "id": account.id,
        "clerk_user_id": account.clerk_user_id,
        "created_at": account.created_at,
    }


__all__ = ["app"]
