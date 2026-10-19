"""One account-wide capacity unit per accepted user turn, settled with public output."""

from uuid import UUID

from ngertiin.quotas import Reservation, reserve
from ngertiin.quotas.ledger import settle as settle_operation
from ngertiin.quotas.policy import fingerprint


async def admit(conn, owner: UUID, run_id: UUID, text: str) -> Reservation:
    return await reserve(conn, owner, "chat", f"chat:{run_id}", 1, fingerprint({"input": text}))


async def retry(conn, run: dict):
    if not run["quota_operation_id"]:
        return  # Historical turns are not billed retroactively.
    item = await admit(conn, run["owner_id"], run["id"], run["input"])
    await conn.execute("UPDATE chat_runs SET quota_token=%s WHERE id=%s", (item.token, run["id"]))


async def settle(conn, run: dict, parts: list, status: str, *, approval: bool = False):
    if not run["quota_operation_id"]:
        return
    public_text = any(p.get("type") == "text" and p.get("text", "").strip() for p in parts)
    if approval or public_text:
        action, reason = "commit", "chat_public_result"
    elif status in ("failed", "cancelled", "complete"):
        action, reason = "release", f"chat_{status}_without_result"
    else:
        return
    await settle_operation(
        conn, run["owner_id"], run["quota_operation_id"], run["quota_token"], action, reason
    )

    if status in ("complete", "failed", "cancelled"):
        from ngertiin.usage.ledger import finish

        await finish(
            conn, run["owner_id"], f"chat:{run['id']}", refund=not (public_text or approval)
        )
