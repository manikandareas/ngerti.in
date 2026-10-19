"""Server-owned price snapshots and normalized provider observations."""

from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Literal
from urllib.parse import urlparse
from uuid import UUID

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator

from ngertiin.config import get_settings

Provider = Literal["duitku", "lemonsqueezy"]
PERIOD = timedelta(days=30)


class CheckoutInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    request_key: UUID
    provider: Provider
    email: str = Field(min_length=3, max_length=254)
    first_name: str = Field(min_length=1, max_length=50)
    last_name: str = Field(min_length=1, max_length=50)
    consent: Literal[True]

    @field_validator("email")
    @classmethod
    def valid_email(cls, value):
        value = value.strip()
        if value.count("@") != 1 or any(c.isspace() for c in value):
            raise ValueError("Email pembayaran tidak valid")
        return value


class ProviderUnavailable(Exception):
    """No trustworthy provider observation; never inferred to mean unpaid."""


class PaymentMismatch(Exception):
    """An observed payment or subscription conflicts with the pinned contract."""


@dataclass
class Payment:
    receipt_id: str
    start: datetime
    amount: int
    tax: int = 0
    currency: str = "USD"
    evidence: dict = field(default_factory=dict)
    validated_quote: int | None = None


@dataclass
class Refund:
    payment: Payment
    full: bool
    amount: int


@dataclass
class Observation:
    subscription_id: str
    status: str
    payments: list[Payment] = field(default_factory=list)
    cancelled: bool = False
    refunds: list[Refund] = field(default_factory=list)


def contract(provider):
    s = get_settings()
    return {
        "version": "plus-subscription-v1-idr-2026-10-19",
        "product": "plus",
        "period_days": 30,
        "amount": 149000 if provider == "duitku" else s.lemonsqueezy_price_minor,
        "currency": "IDR" if provider == "duitku" else s.lemonsqueezy_currency,
        "unit_divisor": 1 if provider == "duitku" else 100,
        "usd_reference": 15 if provider == "lemonsqueezy" else None,
        "fx_reference": {"idr_per_usd": 18050, "date": "2026-10-19", "source": "BI JISDOR"}
        if provider == "lemonsqueezy" and s.lemonsqueezy_currency == "IDR"
        else None,
        "chat_messages": 300,
        "compute_credits": 5000,
        "chat_policy": "chat-v1-2026-10-19",
        "compute_policy": "compute-allowance-v1",
        "store_id": s.lemonsqueezy_store_id if provider == "lemonsqueezy" else None,
        "variant_id": s.lemonsqueezy_variant_id if provider == "lemonsqueezy" else None,
        "merchant_code": s.duitku_merchant_code if provider == "duitku" else None,
        "tax_exclusive": provider == "lemonsqueezy",
    }


def checkout_enabled(provider):
    s = get_settings()
    return s.duitku_enabled if provider == "duitku" else s.lemonsqueezy_enabled


def available(provider, *, checkout=True):
    s = get_settings()
    if checkout and not checkout_enabled(provider):
        return False
    if s.app_env == "production" and s.billing_mode != "live":
        return False
    public = urlparse(s.billing_public_api_url)
    if public.scheme != "https" or not public.hostname:
        return False
    if provider == "duitku":
        return bool(s.duitku_merchant_code and s.duitku_api_key.get_secret_value())
    return bool(
        s.lemonsqueezy_api_key.get_secret_value()
        and s.lemonsqueezy_webhook_secret.get_secret_value()
        and s.lemonsqueezy_store_id
        and s.lemonsqueezy_variant_id
    )


def require_available(provider, *, checkout=True):
    if not available(provider, checkout=checkout):
        raise HTTPException(503, "Pembayaran ini belum tersedia. Coba kembali nanti.")


def timestamp(value, *, jakarta=False):
    from zoneinfo import ZoneInfo

    parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        if not jakarta:
            raise PaymentMismatch("Missing provider timezone")
        parsed = parsed.replace(tzinfo=ZoneInfo("Asia/Jakarta"))
    return parsed.astimezone(UTC)


def checkout_url(value, provider):
    parsed = urlparse(value)
    domain = "duitku.com" if provider == "duitku" else "lemonsqueezy.com"
    if (
        parsed.scheme != "https"
        or parsed.username
        or parsed.password
        or not parsed.hostname
        or not parsed.hostname.endswith("." + domain)
    ):
        raise PaymentMismatch("Invalid checkout host")
    return value
