"""Authenticated app setup; credentials are forwarded only to the owning gateway."""

from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict, Field

from ngertiin.agent_engine.api import AccountDep, forward, provider_command, session_binding
from ngertiin.config import get_settings


def no_store(response: Response):
    response.headers["Cache-Control"] = "no-store"


router = APIRouter(
    prefix="/api/agent-engine/v1/apps", tags=["agent-engine"], dependencies=[Depends(no_store)]
)


class AppConfiguration(BaseModel):
    model_config = ConfigDict(extra="forbid")
    connection_id: UUID
    application: Literal["notion", "linear", "github", "n8n", "google-workspace"]
    label: str = Field(min_length=1, max_length=100)
    url: str | None = Field(default=None, max_length=2048)
    auth_method: Literal["oauth", "bearer"] = "oauth"
    api_key: str | None = Field(default=None, min_length=1, max_length=16384, repr=False)
    oauth_client_id: str | None = Field(default=None, min_length=1, max_length=16384, repr=False)
    oauth_client_secret: str | None = Field(
        default=None, min_length=1, max_length=16384, repr=False
    )
    tools: list[str] = Field(default_factory=list, max_length=256)
    stdio_profile: str | None = Field(default=None, max_length=64)
    expected_generation: int | None = Field(default=None, ge=1)


class AppCallback(BaseModel):
    model_config = ConfigDict(extra="forbid")
    callback_url: str = Field(max_length=16384, repr=False)


class AppTools(BaseModel):
    model_config = ConfigDict(extra="forbid")
    generation: int = Field(ge=1)
    tools: list[str] = Field(max_length=256)


class ResearchConfiguration(BaseModel):
    model_config = ConfigDict(extra="forbid")
    search_backend: str
    extract_backend: str
    credentials: dict[str, str] = Field(default_factory=dict, repr=False)
    workspace_grant: str | None = None
    expected_generation: int | None = Field(default=None, ge=1)


class AppAnswer(BaseModel):
    model_config = ConfigDict(extra="forbid")
    interaction_id: UUID
    action: Literal["accept", "decline", "cancel"]
    content: dict = Field(default_factory=dict)


@router.get("/interactions")
async def interactions(account: AccountDep):
    return await forward(str(account.id), provider_command("app.interactions", {}))


@router.post("/interactions")
async def answer_interaction(body: AppAnswer, account: AccountDep):
    return await forward(
        str(account.id), provider_command("app.answer", body.model_dump(mode="json"))
    )


@router.get("/research")
async def research_listing(account: AccountDep):
    return await forward(str(account.id), provider_command("research.list", {}))


@router.delete("/research")
async def disconnect_research(account: AccountDep):
    return await forward(str(account.id), provider_command("research.disconnect", {}))


@router.post("/research")
async def configure_research(body: ResearchConfiguration, account: AccountDep):
    return await forward(
        str(account.id), provider_command("research.configure", body.model_dump(exclude_none=True))
    )


@router.get("")
async def listing(account: AccountDep):
    return await forward(str(account.id), provider_command("app.list", {}))


@router.post("")
async def configure(body: AppConfiguration, account: AccountDep):
    return await forward(
        str(account.id),
        provider_command("app.configure", body.model_dump(mode="json", exclude_none=True)),
    )


@router.post("/{connection_id}/discover")
async def discover(connection_id: UUID, account: AccountDep):
    return await forward(
        str(account.id), provider_command("app.discover", {"connection_id": str(connection_id)})
    )


@router.delete("/{connection_id}")
async def disconnect(connection_id: UUID, account: AccountDep):
    return await forward(
        str(account.id), provider_command("app.disconnect", {"connection_id": str(connection_id)})
    )


@router.post("/{connection_id}/tools")
async def select_tools(connection_id: UUID, body: AppTools, account: AccountDep):
    return await forward(
        str(account.id),
        provider_command(
            "app.select_tools",
            {
                "connection_id": str(connection_id),
                **body.model_dump(),
            },
        ),
    )


@router.post("/{connection_id}/authorize")
async def authorize(connection_id: UUID, account: AccountDep, request: Request):
    origin = request.headers.get("origin", get_settings().web_origin).rstrip("/")
    if origin not in get_settings().allowed_origins:
        raise HTTPException(403, "Untrusted application origin")
    return await forward(
        str(account.id),
        provider_command(
            "app_auth.start",
            {
                "connection_id": str(connection_id),
                "redirect_uri": origin + "/connections",
                "session_binding": session_binding(request),
            },
        ),
    )


@router.get("/auth/{attempt_id}")
async def auth_status(attempt_id: UUID, account: AccountDep, request: Request):
    return await forward(
        str(account.id),
        provider_command(
            "app_auth.status",
            {
                "attempt_id": str(attempt_id),
                "session_binding": session_binding(request),
            },
        ),
    )


@router.post("/auth/{attempt_id}/callback")
async def callback(attempt_id: UUID, body: AppCallback, account: AccountDep, request: Request):
    return await forward(
        str(account.id),
        provider_command(
            "app_auth.callback",
            {
                "attempt_id": str(attempt_id),
                "session_binding": session_binding(request),
                "callback_url": body.callback_url,
            },
        ),
    )


@router.delete("/auth/{attempt_id}")
async def cancel(attempt_id: UUID, account: AccountDep, request: Request):
    return await forward(
        str(account.id),
        provider_command(
            "app_auth.cancel",
            {
                "attempt_id": str(attempt_id),
                "session_binding": session_binding(request),
            },
        ),
    )
