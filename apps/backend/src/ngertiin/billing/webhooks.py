"""Authenticate raw provider events before persisting a minimal durable inbox entry."""

import hashlib
import hmac
import json
from urllib.parse import parse_qs
from uuid import UUID

from fastapi import HTTPException
from psycopg.types.json import Jsonb

from ngertiin.async_db import transaction
from ngertiin.billing import duitku
from ngertiin.config import get_settings


def verify(raw, headers, provider):
    s = get_settings()
    if len(raw) > 65536:
        raise HTTPException(413, "Webhook terlalu besar.")
    try:
        if provider == "lemonsqueezy":
            key = s.lemonsqueezy_webhook_secret.get_secret_value()
            digest = hmac.new(key.encode(), raw, hashlib.sha256).hexdigest()
            if not key or not hmac.compare_digest(digest, headers.get("x-signature", "")):
                raise HTTPException(403, "Signature tidak valid.")
            event = json.loads(raw)
            mode = "test" if event["meta"]["test_mode"] else "live"
            if mode != s.billing_mode:
                raise HTTPException(403, "Mode pembayaran tidak sesuai.")
            obj, meta = event["data"], event["meta"]
            if obj["type"] not in ("subscriptions", "subscription-invoices"):
                return None
            sub = str(
                obj["id"]
                if obj["type"] == "subscriptions"
                else obj["attributes"]["subscription_id"]
            )
            if not sub.isdigit():
                raise ValueError("Invalid subscription id")
            custom = meta.get("custom_data") or {}
            order = custom.get("billing_order")
            return {
                "subscription_id": sub,
                "event": str(meta["event_name"])[:100],
                "billing_order": str(UUID(order)) if order else None,
                "binding": str(custom.get("binding", ""))[:100],
            }
        code, key = s.duitku_merchant_code, s.duitku_api_key.get_secret_value()
        if not code or not key:
            raise HTTPException(503, "Webhook belum dikonfigurasi.")
        if "application/json" in headers.get("content-type", ""):
            stamp = headers.get("x-duitku-timestamp", "")
            merchant = headers.get("x-duitku-merchant", "")
            digest = hashlib.sha256(code.encode() + stamp.encode() + raw + key.encode()).hexdigest()
            if (
                not stamp.isdigit()
                or merchant != code
                or not hmac.compare_digest(digest, headers.get("x-duitku-signature", ""))
            ):
                raise HTTPException(403, "Signature tidak valid.")
            data = json.loads(raw)
            return {"subscription_id": str(data["subscriptionId"])[:100], "event": "status_change"}
        values = parse_qs(raw.decode(), strict_parsing=True)
        if any(len(v) != 1 for v in values.values()):
            raise ValueError("Duplicate form field")
        data = {k: v[0] for k, v in values.items()}
        if data["merchantCode"] != code:
            raise HTTPException(403, "Merchant tidak sesuai.")
        expected = duitku.signature(code + data["amount"] + data["merchantOrderId"])
        if not hmac.compare_digest(expected, data["signature"]):
            raise HTTPException(403, "Signature tidak valid.")
        try:
            order_id = str(UUID(data["merchantOrderId"]))
        except ValueError:
            order_id = None  # Renewal transaction IDs can differ from the original order.
        return {
            "subscription_id": data.get("subscriptionId", "")[:100] or None,
            "billing_order": order_id,
            "event": "payment_callback",
            "transaction_id": data["merchantOrderId"][:100],
        }
    except (ValueError, KeyError, TypeError, UnicodeDecodeError) as error:
        raise HTTPException(400, "Payload webhook tidak valid.") from error


async def accept(raw, headers, provider):
    payload = verify(raw, headers, provider)
    if payload is None:
        return
    s = get_settings()
    async with transaction() as conn:
        await conn.execute(
            "INSERT INTO billing_events(provider,mode,fingerprint,payload) "
            "VALUES (%s,%s,%s,%s) ON CONFLICT DO NOTHING",
            (provider, s.billing_mode, hashlib.sha256(raw).hexdigest(), Jsonb(payload)),
        )
