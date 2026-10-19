"""Duitku Subscription v1: card mandate, remote cycle receipts and cancellation."""

import hashlib
import hmac
import json
import time
from decimal import Decimal
from urllib.parse import quote

from ngertiin.billing import http
from ngertiin.billing.contracts import (
    PERIOD,
    Observation,
    Payment,
    PaymentMismatch,
    ProviderUnavailable,
    checkout_url,
    timestamp,
)
from ngertiin.config import get_settings


def signature(value):
    s = get_settings()
    key = s.duitku_api_key.get_secret_value()
    if s.duitku_signature_algorithm == "hmac_sha256":
        return hmac.new(key.encode(), value.encode(), hashlib.sha256).hexdigest()
    # Subscription v1 documents this legacy algorithm, unlike general API v2.
    return hashlib.md5((value + key).encode(), usedforsecurity=False).hexdigest()


def base(order):
    return (
        "https://sandbox.duitku.com" if order["mode"] == "test" else "https://passport.duitku.com"
    )


async def create(order):
    s, c, contact = get_settings(), order["contract"], order["contact"]
    public = s.billing_public_api_url.rstrip("/")
    body = {
        "merchantCode": c["merchant_code"],
        "paymentAmount": c["amount"],
        "paymentMethod": s.duitku_card_method,
        "merchantOrderId": str(order["id"]),
        "productDetails": "Ngertiin Plus - subscription 30 hari",
        "customerVaName": contact["first_name"][:20],
        "email": contact["email"],
        "customerDetail": {
            "firstName": contact["first_name"],
            "lastName": contact["last_name"],
            "email": contact["email"],
        },
        "callbackUrl": public + "/billing/webhooks/duitku",
        "returnUrl": s.web_origin + "/?view=usage",
        "expiryPeriod": 60,
        "isSubscription": True,
        "subscriptionDetail": {
            "description": "ngertiin:" + str(order["id"]) + ":" + order["binding_token"],
            "frequencyType": 1,
            "frequencyInterval": 30,
            "totalNoOfCycles": 0,
        },
        "signature": signature(c["merchant_code"] + str(order["id"]) + str(c["amount"])),
    }
    result = await http.request("POST", base(order) + "/webapi/api/merchant/v2/inquiry", json=body)
    if result.get("statusCode") != "00" or result.get("merchantCode") != c["merchant_code"]:
        raise ProviderUnavailable("Duitku checkout not confirmed")
    return str(result["reference"]), checkout_url(result["paymentUrl"], "duitku")


async def detail(order, subscription_id, *, cancel=False):
    s = get_settings()
    host = (
        "https://subscription-sandbox.duitku.com"
        if order["mode"] == "test"
        else "https://subscription.duitku.com"
    )
    stamp, code = str(int(time.time() * 1000)), order["contract"]["merchant_code"]
    key = s.duitku_api_key.get_secret_value()
    body = json.dumps({"subscriptionStatus": 5}, separators=(",", ":")) if cancel else ""
    digest = hashlib.sha256((code + stamp + body + key).encode()).hexdigest()
    return await http.request(
        "PUT" if cancel else "GET",
        host + "/api/subscription/detail/" + quote(str(subscription_id), safe=""),
        headers={
            "x-duitku-merchant": code,
            "x-duitku-timestamp": stamp,
            "x-duitku-signature": digest,
            "Content-Type": "application/json",
        },
        **({"content": body} if cancel else {}),
    )


async def observe(order, subscription_id):
    a, c = await detail(order, subscription_id), order["contract"]
    marker = "ngertiin:" + str(order["id"]) + ":" + order["binding_token"]
    if (
        a.get("statusCode") != "00"
        or str(a["subscriptionId"]) != str(subscription_id)
        or Decimal(str(a["subscriptionAmount"])) != c["amount"]
        or a["subscriptionDescription"] != marker
        or a["frequencyType"] != 1
        or a["frequencyInterval"] != 30
    ):
        raise PaymentMismatch("Duitku subscription contract mismatch")
    states = {1: "pending", 2: "active", 3: "failed", 4: "past_due", 5: "cancelled", 6: "expired"}
    if a["subscriptionStatus"] not in states:
        raise PaymentMismatch("Unknown Duitku subscription status")
    payments = []
    # Only an authoritative successful cycle grants allowance; a notification never does.
    if a.get("lastRunStatus") == 0 and a.get("lastRunDate"):
        cycle = int(a["currentCycle"])
        start = timestamp(a["lastRunDate"], jakarta=True)
        anchor = order.get("cycle_anchor")
        if anchor:
            delta = cycle - int(anchor["evidence"]["cycle"])
            if delta < 0:
                raise ProviderUnavailable("Provider cycle is older than recorded evidence")
            start = anchor["cycle_start"] + delta * PERIOD
        payments.append(
            Payment(
                f"{subscription_id}:cycle:{cycle}",
                start,
                c["amount"],
                currency="IDR",
                evidence={"subscription_id": str(subscription_id), "cycle": cycle},
            )
        )
    return Observation(
        str(subscription_id),
        states[a["subscriptionStatus"]],
        payments,
        a["subscriptionStatus"] in (5, 6),
    )


async def cancel(order):
    result = await detail(order, order["subscription_id"], cancel=True)
    if result.get("statusCode") != "00":
        raise ProviderUnavailable("Duitku cancellation not confirmed")


async def transaction_status(order):
    code, ident = order["contract"]["merchant_code"], str(order["id"])
    return await http.request(
        "POST",
        base(order) + "/webapi/api/merchant/transactionStatus",
        json={
            "merchantCode": code,
            "merchantOrderId": ident,
            "signature": hmac.new(
                get_settings().duitku_api_key.get_secret_value().encode(),
                (code + ident).encode(),
                hashlib.sha256,
            ).hexdigest(),
        },
    )
