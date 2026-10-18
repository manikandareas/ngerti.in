"""Versioned capacity units; independent of payment and generation providers."""

import hashlib
import json
from datetime import UTC, datetime, timedelta
from typing import Literal

Meter = Literal["chat"]
Plan = Literal["free", "plus"]
METERS: tuple[Meter, ...] = ("chat",)
PERIOD = timedelta(days=30)
POLICY_VERSION = "chat-baseline-v1"
LIMITS: dict[Plan, dict[Meter, int]] = {
    "free": {"chat": 100},
    "plus": {"chat": 300},
}


def fingerprint(value: object) -> str:
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()
    ).hexdigest()


def positive_units(value: int) -> int:
    if type(value) is not int or not 0 < value <= 2_147_483_647:
        raise ValueError("Quota units must be a positive integer")
    return value


def utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        raise ValueError("A timezone-aware timestamp is required")
    return value.astimezone(UTC)


def free_window(anchor: datetime, at: datetime) -> tuple[datetime, datetime]:
    anchor, at = utc(anchor), utc(at)
    if at < anchor:
        raise ValueError("Period precedes account activation")
    start = anchor + ((at - anchor) // PERIOD) * PERIOD
    return start, start + PERIOD
