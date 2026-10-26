"""Clerk verifies the request; application code never trusts a client owner_id."""

from functools import lru_cache
from typing import Annotated

from clerk_backend_api import Clerk
from clerk_backend_api.security.types import AuthenticateRequestOptions
from fastapi import Depends, HTTPException, Request
from sqlmodel import Session

from ngertiin.accounts.provisioning import ensure_account
from ngertiin.config import get_settings
from ngertiin.db import get_session
from ngertiin.models import Account


@lru_cache
def clerk_client() -> Clerk:
    return Clerk(bearer_auth=get_settings().clerk_secret_key.get_secret_value())


def current_account(
    request: Request, session: Annotated[Session, Depends(get_session, scope="function")]
) -> Account:
    settings = get_settings()
    if not settings.clerk_secret_key.get_secret_value():
        raise HTTPException(503, "Clerk is not configured on the server.")
    if not request.headers.get("authorization", "").startswith("Bearer "):
        raise HTTPException(401, "Please sign in again.")
    state = clerk_client().authenticate_request(
        request,
        AuthenticateRequestOptions(
            authorized_parties=settings.allowed_origins,
            accepts_token=["session_token"],
        ),
    )
    if not state.is_signed_in or not state.payload or not state.payload.get("sub"):
        raise HTTPException(401, "Please sign in again.")
    request.state.auth_session_id = state.payload.get("sid")
    subject = state.payload["sub"]
    account = ensure_account(session, subject)
    session.commit()
    session.refresh(account)
    return account


__all__ = ["current_account"]
