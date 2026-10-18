"""Read-only account usage. Grants and ledger mutations are server-internal."""

import math
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from ngertiin.accounts.auth import current_account
from ngertiin.async_db import transaction
from ngertiin.models import Account
from ngertiin.quotas.errors import QuotaConflict, QuotaExceeded, QuotaNotFound
from ngertiin.quotas.ledger import usage
from ngertiin.quotas.policy import Meter, Plan

router = APIRouter(prefix="/quotas", tags=["quotas"])


class MeterUsage(BaseModel):
    limit: int = Field(ge=0)
    used: int = Field(ge=0)
    reserved: int = Field(ge=0)
    remaining: int = Field(ge=0)


class UsagePeriod(BaseModel):
    starts_at: datetime
    ends_at: datetime
    policy_version: str


class UsageResponse(BaseModel):
    plan: Plan
    period: UsagePeriod
    meters: dict[Meter, MeterUsage]


@router.get("", response_model=UsageResponse)
async def account_usage(account: Annotated[Account, Depends(current_account)]):
    async with transaction() as conn:
        return await usage(conn, account.id)


async def quota_error(request: Request, error: Exception):
    if isinstance(error, QuotaExceeded):
        message = "Sisa kuota chat periode ini tidak cukup. Draftmu tetap tersimpan."
        reset = error.period["ends_at"]
        return JSONResponse(
            status_code=429,
            headers={
                "Retry-After": str(max(1, math.ceil((reset - datetime.now(UTC)).total_seconds())))
            },
            content={
                "detail": {
                    "code": "quota_exceeded",
                    "message": message,
                    "meter": error.meter,
                    "required": error.required,
                    **error.usage,
                    "reset_at": reset.isoformat(),
                }
            },
        )
    code = 404 if isinstance(error, QuotaNotFound) else 409
    return JSONResponse(status_code=code, content={"detail": str(error)})


ERROR_TYPES = (QuotaExceeded, QuotaConflict, QuotaNotFound)
