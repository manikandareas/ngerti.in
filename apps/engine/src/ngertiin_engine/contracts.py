"""Strict internal service envelopes; browser identity is never trusted here."""

import hashlib
import hmac
import json
import time
from uuid import UUID

from ngertiin_engine import SCHEMA_VERSION


class EngineError(Exception):
    def __init__(self, code: str):
        self.code = code
        super().__init__(code)


def canonical(value: object) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False)


def digest(value: object) -> str:
    return hashlib.sha256(canonical(value).encode()).hexdigest()


def uuid(value: object) -> str:
    if not isinstance(value, str):
        raise EngineError("INVALID_REQUEST")
    try:
        if str(UUID(value)) != value:
            raise ValueError
    except ValueError as exc:
        raise EngineError("INVALID_REQUEST") from exc
    return value


def counter(value: object) -> str:
    if not isinstance(value, str) or not value.isascii() or not value.isdecimal():
        raise EngineError("INVALID_REQUEST")
    if not 1 <= int(value) <= 2**63 - 1 or str(int(value)) != value:
        raise EngineError("INVALID_REQUEST")
    return value


def sign(body: dict, owner: str, key: bytes, *, now: int | None = None) -> dict:
    now = int(time.time()) if now is None else now
    claims = {
        "audience": "ngertiin-engine",
        "owner_id": owner,
        "actor": "owner",
        "expires_at": now + 60,
        "body": body,
        "payload_digest": digest(body),
    }
    return {
        **claims,
        "signature": hmac.new(key, canonical(claims).encode(), "sha256").hexdigest(),
    }


def authenticate(envelope: dict, owner: str, key: bytes) -> dict:
    if set(envelope) != {
        "audience",
        "owner_id",
        "actor",
        "expires_at",
        "body",
        "payload_digest",
        "signature",
    }:
        raise EngineError("UNAUTHENTICATED")
    claims = {k: v for k, v in envelope.items() if k != "signature"}
    expected = hmac.new(key, canonical(claims).encode(), "sha256").hexdigest()
    signature = envelope["signature"]
    if not isinstance(signature, str) or not hmac.compare_digest(expected, signature):
        raise EngineError("UNAUTHENTICATED")
    expiry = envelope["expires_at"]
    if type(expiry) is not int or not time.time() < expiry <= time.time() + 65:
        raise EngineError("UNAUTHENTICATED")
    if envelope["audience"] != "ngertiin-engine" or envelope["actor"] != "owner":
        raise EngineError("UNAUTHENTICATED")
    if envelope["owner_id"] != owner:
        raise EngineError("NOT_FOUND")
    body = envelope["body"]
    if not isinstance(body, dict) or digest(body) != envelope["payload_digest"]:
        raise EngineError("INVALID_REQUEST")
    if set(body) != {
        "schema_version",
        "command_id",
        "type",
        "expected_revision",
        "payload",
    }:
        raise EngineError("INVALID_REQUEST")
    if body["schema_version"] != SCHEMA_VERSION:
        raise EngineError("UNSUPPORTED_VERSION")
    uuid(body["command_id"])
    if body["expected_revision"] is not None or not isinstance(body["payload"], dict):
        raise EngineError("INVALID_REQUEST")
    return body
