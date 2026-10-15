"""Clerk verifies the request; application code never trusts a client owner_id."""

from functools import lru_cache
from typing import Annotated

from clerk_backend_api import Clerk
from clerk_backend_api.security.types import AuthenticateRequestOptions
from fastapi import Depends, HTTPException, Request
from sqlalchemy.dialects.postgresql import insert
from sqlmodel import Session, select

from ngertiin.config import get_settings
from ngertiin.db import get_session
from ngertiin.models import Account


@lru_cache
def clerk_client() -> Clerk:
    return Clerk(bearer_auth=get_settings().clerk_secret_key.get_secret_value())


def current_account(request: Request, session: Annotated[Session, Depends(get_session)]) -> Account:
    settings = get_settings()
    if not settings.clerk_secret_key.get_secret_value():
        raise HTTPException(503, "Clerk belum dikonfigurasi pada server.")
    if not request.headers.get("authorization", "").startswith("Bearer "):
        raise HTTPException(401, "Silakan masuk kembali.")
    state = clerk_client().authenticate_request(
        request,
        AuthenticateRequestOptions(
            authorized_parties=settings.allowed_origins,
            accepts_token=["session_token"],
        ),
    )
    if not state.is_signed_in or not state.payload or not state.payload.get("sub"):
        raise HTTPException(401, "Silakan masuk kembali.")
    subject = state.payload["sub"]
    account = Account(clerk_user_id=subject)
    session.exec(
        insert(Account)
        .values(
            id=account.id,
            clerk_user_id=subject,
            created_at=account.created_at,
        )
        .on_conflict_do_nothing(index_elements=["clerk_user_id"])
    )
    session.commit()
    return session.exec(select(Account).where(Account.clerk_user_id == subject)).one()


__all__ = ["current_account"]
