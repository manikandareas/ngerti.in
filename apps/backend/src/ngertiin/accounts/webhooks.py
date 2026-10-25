"""Verified Clerk registration events enqueue the same setup as first login."""

import hashlib
import json
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import text
from sqlmodel import Session
from svix.webhooks import Webhook, WebhookVerificationError

from ngertiin.accounts.provisioning import ensure_account
from ngertiin.config import get_settings
from ngertiin.db import get_session

router = APIRouter()


@router.post("/api/accounts/webhooks/clerk")
async def registration(request: Request, session: Annotated[Session, Depends(get_session)]):
    secret = get_settings().clerk_webhook_signing_secret.get_secret_value()
    if not secret:
        raise HTTPException(503, "Registration webhook is not configured")
    raw = bytearray()
    async for chunk in request.stream():
        raw.extend(chunk)
        if len(raw) > 256 * 1024:
            raise HTTPException(413, "Webhook is too large")
    try:
        Webhook(secret).verify(bytes(raw), dict(request.headers))
        payload = json.loads(raw)
    except (WebhookVerificationError, ValueError):
        raise HTTPException(401, "Invalid webhook signature") from None
    if not isinstance(payload, dict):
        raise HTTPException(422, "Invalid registration event")
    if payload.get("type") != "user.created":
        return {"status": "ignored"}
    data = payload.get("data")
    subject = data.get("id") if isinstance(data, dict) else None
    delivery = request.headers.get("svix-id", "")
    if (
        not isinstance(subject, str)
        or not subject
        or len(subject) > 255
        or not delivery
        or len(delivery) > 255
    ):
        raise HTTPException(422, "Invalid registration event")
    account = ensure_account(session, subject)
    checksum = hashlib.sha256(raw).hexdigest()
    session.execute(
        text(
            "INSERT INTO "
            "account_registration_receipts(delivery_id,payload_digest,owner_id) "
            "VALUES (:id,:digest,:owner) ON CONFLICT(delivery_id) DO NOTHING"
        ),
        {"id": delivery, "digest": checksum, "owner": account.id},
    )
    prior = session.execute(
        text(
            "SELECT payload_digest,owner_id FROM account_registration_receipts WHERE "
            "delivery_id=:id"
        ),
        {"id": delivery},
    ).one()
    if prior[0] != checksum or prior[1] != account.id:
        session.rollback()
        raise HTTPException(409, "Registration delivery conflict")
    session.commit()
    return {"status": "accepted"}
