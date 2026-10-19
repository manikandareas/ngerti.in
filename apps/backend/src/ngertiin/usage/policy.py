"""One public compute credit represents 1,000 microUSD of configured cost allowance."""

from ngertiin.config import get_settings
from ngertiin.usage import prices

VERSION = "compute-allowance-v1"
CREDIT = 1000


def snapshot():
    s = get_settings()
    return {
        "version": VERSION,
        "vendor_period_percent": 120,
        "credit_microusd": CREDIT,
        "free": s.compute_free_credits * CREDIT,
        "plus": s.compute_plus_credits * CREDIT,
        "global_daily_cap": s.compute_global_daily_microusd,
        "account_daily_cap": s.compute_account_daily_microusd,
        "price_version": prices.VERSION,
        "plans": PLANS,
        "prices": {name: prices.snapshot(name) for name in prices.RATES},
    }


def task_estimate(rules, price=None):
    price = price or prices.snapshot(rules["model"])
    amount = prices.maximum(rules["task_cap"], price)
    if "sandbox" in rules:
        amount += rules["sandbox"]["task_microusd"]
    if "computer" in rules:
        p = rules["computer"]
        amount += (p["compute_reservation"] + p["storage_reservation"]) * p["max_sessions"]
    return amount


PLANS = {
    "free": {"price_idr": 0, "chat_messages": 100, "compute_credits": 1000, "period_days": 30},
    "plus": {"price_idr": 149000, "chat_messages": 300, "compute_credits": 5000, "period_days": 30},
}
