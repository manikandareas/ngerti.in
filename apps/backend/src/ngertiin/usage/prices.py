"""Integer microUSD, pinned standard-route prices; never infer zero for unknown models."""

from decimal import ROUND_CEILING, Decimal

VERSION = "provider-list-2026-10-19"
# USD per million tokens: input, cached input, output. Sources are recorded in usage-runtime.md.
RATES = {
    "gpt-6-luna": ("0.10", "0.01", "0.50"),
    "gpt-5-mini": ("0.25", "0.025", "2.00"),
    "text-embedding-3-small": ("0.02", "0.02", "0"),
    "jev-1.13.0": ("0.042", "0.042", "0"),
}


def ceiling(value):
    return int(Decimal(str(value)).to_integral_value(rounding=ROUND_CEILING))


def snapshot(model):
    rates = RATES.get(model)
    if rates is None:
        # A conservative operational ceiling is not a published price.
        rates = ("50", "50", "100")
    return {
        "version": VERSION,
        "model": model,
        "input": rates[0],
        "cached": rates[1],
        "output": rates[2],
        "known": model in RATES,
        "currency": "USD",
        "route": "standard-short-context",
        "invoice_confirmed": False,
    }


def maximum(tokens, price):
    return ceiling(Decimal(tokens) * max(Decimal(price["input"]), Decimal(price["output"])))


def model_cost(usage, price, fallback):
    """Provider-reported quantities confirm tokens, not the vendor invoice."""
    usage = usage or {}
    incoming = usage.get("input_tokens", usage.get("prompt_tokens"))
    outgoing = usage.get("output_tokens", usage.get("completion_tokens", 0))
    if type(incoming) is not int or type(outgoing) is not int or min(incoming, outgoing) < 0:
        return fallback, "unknown"
    details = usage.get("input_token_details") or usage.get("prompt_tokens_details") or {}
    cached = details.get("cache_read", details.get("cached_tokens", 0))
    if type(cached) is not int or not 0 <= cached <= incoming:
        cached = 0
    if incoming > 272000 or not price["known"]:
        return max(fallback, maximum(incoming + outgoing, price)), "unknown"
    amount = (
        (incoming - cached) * Decimal(price["input"])
        + cached * Decimal(price["cached"])
        + outgoing * Decimal(price["output"])
    )
    return ceiling(amount), "estimated"
