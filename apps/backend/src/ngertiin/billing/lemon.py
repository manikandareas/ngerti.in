"""Lemon Squeezy recurring checkout and authoritative subscription invoice reads."""

from decimal import ROUND_HALF_UP, Decimal

from ngertiin.billing import http
from ngertiin.billing.contracts import (
    PERIOD,
    Observation,
    Payment,
    PaymentMismatch,
    ProviderUnavailable,
    Refund,
    checkout_url,
    timestamp,
)
from ngertiin.config import get_settings

BASE = "https://api.lemonsqueezy.com/v1"


def verify_settlement_amount(invoice, pinned):
    """Non-USD invoices round through USD cents; never allow a percentage discount."""
    if invoice["subtotal"] == pinned["amount"]:
        return
    if pinned["currency"] != "IDR":
        raise PaymentMismatch("Invoice amount mismatch")
    rate = Decimal(str(invoice.get("currency_rate", "0")))
    if not rate.is_finite() or rate <= 0:
        raise PaymentMismatch("Missing invoice conversion rate")
    quoted_usd = (Decimal(pinned["amount"]) * rate).quantize(Decimal(1), rounding=ROUND_HALF_UP)
    actual_usd = (Decimal(invoice["subtotal"]) * rate).quantize(Decimal(1), rounding=ROUND_HALF_UP)
    if (
        quoted_usd != invoice.get("subtotal_usd")
        or actual_usd != quoted_usd
        or abs(Decimal(invoice["subtotal"]) - pinned["amount"]) * rate > Decimal("0.500001")
        or invoice.get("discount_total_usd") != 0
        or invoice.get("total_usd") != quoted_usd + invoice.get("tax_usd", 0)
    ):
        raise PaymentMismatch("USD rounding does not explain invoice amount")


async def call(method, path, **kwargs):
    s = get_settings()
    return await http.request(
        method,
        BASE + path,
        headers={
            "Authorization": "Bearer " + s.lemonsqueezy_api_key.get_secret_value(),
            "Accept": "application/vnd.api+json",
            "Content-Type": "application/vnd.api+json",
        },
        **kwargs,
    )


async def validate_price(price_id, order):
    p = (await call("GET", f"/prices/{int(price_id)}"))["data"]["attributes"]
    c = order["contract"]
    if (
        str(p["variant_id"]) != c["variant_id"]
        or p["category"] != "subscription"
        or p["scheme"] != "standard"
        or p.get("usage_aggregation")
        or p["unit_price"] != c["amount"]
        or p.get("setup_fee_enabled")
        or p.get("trial_interval_quantity")
        or p["renewal_interval_unit"] != "day"
        or p["renewal_interval_quantity"] != 30
    ):
        raise PaymentMismatch("Subscription price/interval differs from contract")


async def create(order):
    c = order["contract"]
    store = (await call("GET", f"/stores/{int(c['store_id'])}"))["data"]["attributes"]
    if store["currency"] != c["currency"]:
        raise PaymentMismatch("Store currency differs from the configured contract")
    prices = await call("GET", "/prices", params={"filter[variant_id]": c["variant_id"]})
    current = [p for p in prices["data"] if p["attributes"]["category"] == "subscription"]
    if not current:
        raise PaymentMismatch("Subscription price missing")
    # The most recently created price is the current variant price.
    newest = max(current, key=lambda p: p["attributes"]["created_at"])
    await validate_price(newest["id"], order)
    contact = order["contact"]
    body = {
        "data": {
            "type": "checkouts",
            "attributes": {
                "custom_price": c["amount"],
                "test_mode": order["mode"] == "test",
                "expires_at": order["expires_at"].isoformat(),
                "product_options": {
                    "enabled_variants": [int(c["variant_id"])],
                    "redirect_url": get_settings().web_origin + "/?view=usage",
                },
                "checkout_options": {"discount": False},
                "checkout_data": {
                    "email": contact["email"],
                    "name": contact["first_name"] + " " + contact["last_name"],
                    "custom": {
                        "billing_order": str(order["id"]),
                        "binding": order["binding_token"],
                    },
                    "variant_quantities": [{"variant_id": int(c["variant_id"]), "quantity": 1}],
                },
            },
            "relationships": {
                "store": {"data": {"type": "stores", "id": c["store_id"]}},
                "variant": {"data": {"type": "variants", "id": c["variant_id"]}},
            },
        }
    }
    result = (await call("POST", "/checkouts", json=body))["data"]
    return str(result["id"]), checkout_url(result["attributes"]["url"], "lemonsqueezy")


async def observe(order, subscription_id):
    obj = (await call("GET", f"/subscriptions/{int(subscription_id)}"))["data"]
    a, c = obj["attributes"], order["contract"]
    item = a.get("first_subscription_item") or {}
    if (
        str(obj["id"]) != str(subscription_id)
        or str(a["store_id"]) != c["store_id"]
        or str(a["variant_id"]) != c["variant_id"]
        or a["test_mode"] != (order["mode"] == "test")
        or item.get("quantity") != 1
    ):
        raise PaymentMismatch("Subscription identity mismatch")
    await validate_price(item["price_id"], order)
    invoices = []
    for page in range(1, 6):
        result = await call(
            "GET",
            "/subscription-invoices",
            params={
                "filter[subscription_id]": subscription_id,
                "page[number]": page,
                "page[size]": 100,
            },
        )
        invoices.extend(result["data"])
        if not result.get("links", {}).get("next"):
            break
    else:
        raise ProviderUnavailable("Invoice pagination limit reached")
    initial = [i for i in invoices if i["attributes"]["billing_reason"] == "initial"]
    if not initial:
        raise ProviderUnavailable("Initial invoice needed to anchor fixed billing cycles")
    anchor = min(timestamp(i["attributes"]["created_at"]) for i in initial)
    payments, refunds = [], []
    for invoice in invoices:
        i = invoice["attributes"]
        if (
            str(i["subscription_id"]) != str(subscription_id)
            or str(i["store_id"]) != c["store_id"]
            or i["test_mode"] != (order["mode"] == "test")
        ):
            raise PaymentMismatch("Invoice identity mismatch")
        if i["status"] not in ("paid", "refunded", "partial_refund"):
            continue
        if (
            i["currency"] != c["currency"]
            or i["discount_total"] != 0
            or i["tax_inclusive"]
            or i["total"] != i["subtotal"] + i["tax"]
            or i["billing_reason"] not in ("initial", "renewal")
        ):
            raise PaymentMismatch("Invoice amount/currency/product mismatch")
        verify_settlement_amount(i, c)
        at = timestamp(i["created_at"])
        cycle = round((at - anchor).total_seconds() / PERIOD.total_seconds())
        start = anchor + cycle * PERIOD
        if cycle < 0 or abs((start - at).total_seconds()) > 300:
            raise PaymentMismatch("Invoice does not align with fixed thirty-day cycle")
        payment = Payment(
            str(invoice["id"]),
            start,
            i["subtotal"],
            i["tax"],
            c["currency"],
            {
                "subscription_id": str(subscription_id),
                "billing_reason": i["billing_reason"],
                "quoted_amount": c["amount"],
                "currency_rate": i.get("currency_rate"),
                "subtotal_usd": i.get("subtotal_usd"),
            },
            validated_quote=c["amount"],
        )
        refunded = i.get("refunded_amount", 0)
        if type(refunded) is not int or not 0 <= refunded <= i["total"]:
            raise PaymentMismatch("Invalid refund amount")
        full = i["status"] == "refunded" or i.get("refunded") is True
        if full or i["status"] == "partial_refund" or refunded:
            if not full and not 0 < refunded < i["total"]:
                raise PaymentMismatch("Partial refund needs a bounded amount")
            refunds.append(Refund(payment, full, i["total"] if full else refunded))
        else:
            payments.append(payment)
    states = {
        "active": "active",
        "past_due": "past_due",
        "unpaid": "past_due",
        "cancelled": "cancelled",
        "expired": "expired",
        "on_trial": "pending",
        "paused": "past_due",
    }
    if a["status"] not in states:
        raise PaymentMismatch("Unknown subscription state")
    return Observation(
        str(subscription_id),
        states[a["status"]],
        payments,
        bool(a.get("cancelled")) or a["status"] == "expired",
        refunds,
    )


async def cancel(order):
    await call("DELETE", f"/subscriptions/{int(order['subscription_id'])}")


async def payment_method(order):
    obj = (await call("GET", f"/subscriptions/{int(order['subscription_id'])}"))["data"]
    a, c = obj["attributes"], order["contract"]
    if (
        str(obj["id"]) != order["subscription_id"]
        or str(a["store_id"]) != c["store_id"]
        or str(a["variant_id"]) != c["variant_id"]
        or a["test_mode"] != (order["mode"] == "test")
    ):
        raise PaymentMismatch("Subscription identity mismatch")
    # Fetch just in time; signed URLs are never stored in history, audit or logs.
    return checkout_url(a["urls"]["update_payment_method"], "lemonsqueezy")
