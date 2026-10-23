"""Server-owned bounds match Task admission, including uncached full-file OCR."""

from ngertiin.accounts.access import unlimited_usage
from ngertiin.chat.store import one
from ngertiin.config import get_settings
from ngertiin.files.store import revision
from ngertiin.tasks.policy import snapshot
from ngertiin.usage import ledger, policy, prices


async def estimate(conn, owner, runtime="text", inputs=(), per_run_cap=None):
    rules = snapshot()
    if per_run_cap:
        rules["task_cap"] = min(per_run_cap, rules["task_cap"])
    if runtime == "code":
        from ngertiin.sandbox.policy import snapshot as sandbox

        rules["sandbox"] = sandbox()
    if runtime == "browser":
        from ngertiin.computer.policy import snapshot as computer

        rules["computer"] = computer()
    p = await ledger.period(conn, owner)
    amount = policy.task_estimate(rules, p["policy"]["prices"].get(rules["model"]))
    for rid in set(inputs):
        file = await revision(conn, owner, rid)
        if file["content_type"] not in ("application/pdf", "image/png", "image/jpeg"):
            continue
        cache = await one(
            conn,
            "SELECT id FROM file_extractions WHERE revision_id=%s "
            "AND status='ready' AND policy->>'model'=%s",
            (rid, get_settings().mistral_ocr_model),
        )
        if not cache:
            amount += prices.ceiling(
                file["page_count"] * get_settings().mistral_ocr_usd_per_1000_pages * 1000
            )
    p = await ledger.period(conn, owner)
    totals = await one(
        conn,
        "SELECT COALESCE(sum(used+reserved),0) AS n FROM compute_balances WHERE period_id=%s",
        (p["id"],),
    )
    remaining = max(0, p["policy"][p["plan"]] - totals["n"])
    return {
        "maximum": round(amount / policy.CREDIT, 3),
        "remaining": round(remaining / policy.CREDIT, 3),
        "available": unlimited_usage(owner) or amount <= remaining,
        "unlimited": unlimited_usage(owner),
        "reset_at": p["ends_at"],
        "policy_version": p["policy"]["version"],
        "binding": False,
    }
