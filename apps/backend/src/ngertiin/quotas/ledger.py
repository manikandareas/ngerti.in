"""Atomic admission and fenced settlement on a caller-owned database transaction."""

from dataclasses import dataclass
from datetime import datetime
from uuid import UUID, uuid4, uuid5

from ngertiin.quotas.errors import QuotaConflict, QuotaExceeded, QuotaNotFound
from ngertiin.quotas.periods import current_period, lock_account, one
from ngertiin.quotas.policy import METERS, Meter, positive_units


@dataclass(frozen=True)
class Reservation:
    id: UUID
    token: UUID
    period_id: UUID
    state: str


def reservation(row: dict) -> Reservation:
    return Reservation(row["id"], row["token"], row["period_id"], row["state"])


async def balance(conn, period: dict, meter: Meter) -> dict:
    row = await one(
        conn,
        "SELECT COALESCE(sum(amount) FILTER (WHERE state='reserved'),0)::bigint AS reserved, "
        "COALESCE(sum(amount) FILTER (WHERE state='committed'),0)::bigint AS used "
        "FROM quota_operations WHERE period_id=%s AND meter=%s",
        (period["id"], meter),
    )
    limit = period["limits"][meter]
    return {"limit": limit, **row, "remaining": limit - row["used"] - row["reserved"]}


async def record(conn, operation: dict, action: str, reason: str):
    if not reason.strip() or len(reason) > 512:
        raise ValueError("A bounded quota audit reason is required")
    await conn.execute(
        "INSERT INTO quota_events(operation_id,period_id,revision,token,amount,action,reason) "
        "VALUES (%s,%s,%s,%s,%s,%s,%s)",
        (
            operation["id"],
            operation["period_id"],
            operation["revision"],
            operation["token"],
            operation["amount"],
            action,
            reason,
        ),
    )


async def reserve(
    conn,
    owner: UUID,
    meter: Meter,
    resource_key: str,
    amount: int,
    fingerprint: str,
    *,
    at: datetime | None = None,
) -> Reservation:
    """Lock the account first; callers must acquire domain locks in that same order."""
    positive_units(amount)
    if meter not in METERS or not 0 < len(resource_key) <= 512:
        raise ValueError("Invalid quota resource")
    if len(fingerprint) != 64 or any(c not in "0123456789abcdef" for c in fingerprint):
        raise ValueError("An input SHA-256 fingerprint is required")
    await lock_account(conn, owner)
    operation = await one(
        conn,
        "SELECT * FROM quota_operations WHERE owner_id=%s AND meter=%s AND resource_key=%s",
        (owner, meter, resource_key),
    )
    if operation:
        if operation["amount"] != amount or operation["fingerprint"] != fingerprint:
            raise QuotaConflict("Identitas pekerjaan sudah dipakai untuk input yang berbeda.")
        if operation["state"] in ("reserved", "committed"):
            return reservation(operation)
    period = await current_period(conn, owner, at=at)
    usage = await balance(conn, period, meter)
    if usage["remaining"] < amount:
        raise QuotaExceeded(meter, amount, usage, period)
    if operation:
        operation = await one(
            conn,
            "UPDATE quota_operations SET state='reserved',period_id=%s,token=%s,"
            "revision=revision+1,updated_at=now() WHERE id=%s RETURNING *",
            (period["id"], uuid4(), operation["id"]),
        )
    else:
        operation = await one(
            conn,
            "INSERT INTO quota_operations(id,owner_id,period_id,meter,resource_key,fingerprint,"
            "amount,token,state) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,'reserved') RETURNING *",
            (
                uuid5(owner, f"quota:{meter}:{resource_key}"),
                owner,
                period["id"],
                meter,
                resource_key,
                fingerprint,
                amount,
                uuid4(),
            ),
        )
    await record(conn, operation, "reserve", "admission")
    return reservation(operation)


async def settle(conn, owner: UUID, operation_id: UUID, token: UUID, action: str, reason: str):
    await lock_account(conn, owner)
    operation = await one(
        conn, "SELECT * FROM quota_operations WHERE id=%s AND owner_id=%s", (operation_id, owner)
    )
    if not operation:
        raise QuotaNotFound("Pemakaian tidak ditemukan.")
    if operation["token"] != token:
        raise QuotaConflict("Reservasi sudah diganti; pekerjaan lama tidak boleh melanjutkan.")
    transitions = {
        "commit": ("reserved", "committed"),
        "release": ("reserved", "released"),
        "reverse": ("committed", "reversed"),
    }
    if action not in transitions:
        raise ValueError("Unknown quota transition")
    source, target = transitions[action]
    if operation["state"] == target or (action == "release" and operation["state"] == "committed"):
        return reservation(operation)
    if operation["state"] != source:
        raise QuotaConflict("Status reservasi tidak sesuai dengan tindakan ini.")
    operation = await one(
        conn,
        "UPDATE quota_operations SET state=%s,revision=revision+1,updated_at=now() "
        "WHERE id=%s RETURNING *",
        (target, operation_id),
    )
    await record(conn, operation, action, reason)
    return reservation(operation)


async def commit(conn, owner: UUID, item: Reservation, reason: str):
    return await settle(conn, owner, item.id, item.token, "commit", reason)


async def release(conn, owner: UUID, item: Reservation, reason: str):
    return await settle(conn, owner, item.id, item.token, "release", reason)


async def reverse(conn, owner: UUID, item: Reservation, reason: str):
    return await settle(conn, owner, item.id, item.token, "reverse", reason)


async def usage(conn, owner: UUID, *, at: datetime | None = None):
    period = await current_period(conn, owner, at=at)
    meters = {meter: await balance(conn, period, meter) for meter in METERS}
    return {
        "plan": period["plan"],
        "period": {key: period[key] for key in ("starts_at", "ends_at", "policy_version")},
        "meters": meters,
    }
