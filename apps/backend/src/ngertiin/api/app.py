"""HTTP startup is independent from migrations and worker lifecycle."""

import time
from contextlib import asynccontextmanager
from typing import Annotated
from uuid import uuid4

import psycopg
import structlog
from botocore.exceptions import BotoCoreError, ClientError
from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError

from ngertiin.accounts.auth import current_account
from ngertiin.api.diagnostics import router as diagnostic_router
from ngertiin.async_db import close_pool
from ngertiin.chat.api import router as chat_router
from ngertiin.config import get_settings
from ngertiin.health import system_status
from ngertiin.models import Account
from ngertiin.quotas.api import ERROR_TYPES, quota_error
from ngertiin.quotas.api import router as quota_router

settings = get_settings()
logger = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    await close_pool()


app = FastAPI(
    title="Ngertiin API",
    docs_url="/docs" if settings.diagnostics_enabled else None,
    lifespan=lifespan,
)
app.include_router(chat_router)
app.include_router(quota_router)
for quota_error_type in ERROR_TYPES:
    app.add_exception_handler(quota_error_type, quota_error)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Authorization", "Content-Type", "Last-Event-ID"],
    expose_headers=["X-Request-ID"],
)


@app.middleware("http")
async def request_logging(request: Request, call_next):
    request_id, started = str(uuid4()), time.monotonic()
    structlog.contextvars.bind_contextvars(request_id=request_id)
    try:
        response = await call_next(request)
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
        status_code=503, content={"detail": "Layanan belum siap. Periksa status sistem."}
    )


for error_type in (SQLAlchemyError, psycopg.Error, BotoCoreError, ClientError):
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


if settings.diagnostics_enabled:
    app.include_router(diagnostic_router)
    from daytona import DaytonaError

    from ngertiin.daytona_trial.api import router as daytona_router
    from ngertiin.daytona_trial.store import TrialError

    app.include_router(daytona_router)

    @app.exception_handler(DaytonaError)
    async def trial_provider_failure(request: Request, error: DaytonaError):
        logger.warning("daytona.unavailable", error_type=type(error).__name__)
        return JSONResponse(status_code=503, content={"detail": "Provider trial belum tersedia."})

    @app.exception_handler(TrialError)
    async def trial_precondition(request: Request, error: TrialError):
        return JSONResponse(status_code=409, content={"detail": str(error)})

    @app.get("/dev/status")
    def development_status():
        return system_status()


__all__ = ["app"]
