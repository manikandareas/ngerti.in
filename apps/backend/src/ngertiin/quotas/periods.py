"""Server-owned Free cycles and idempotent, scheduled thirty-day Plus grants."""

from datetime import datetime
from uuid import UUID, uuid4, uuid5

from psycopg.types.json import Jsonb

from ngertiin.quotas.errors import QuotaConflict, QuotaNotFound
from ngertiin.quotas.policy import LIMITS, PERIOD, POLICY_VERSION, Plan, free_window, utc


async def one(conn, query: str, args=()):
    return await (await conn.execute(query, args)).fetchone()


async def lock_account(conn, owner: UUID):
    account = await one(conn, "SELECT * FROM accounts WHERE id=%s FOR UPDATE", (owner,))
    if not account:
        raise QuotaNotFound("Akun tidak ditemukan.")
    return account


async def clock(conn, at: datetime | None = None) -> datetime:
    return (
        utc(at) if at is not None else utc((await one(conn, "SELECT clock_timestamp() AS t"))["t"])
    )


async def current_period(conn, owner: UUID, *, at: datetime | None = None):
    account = await lock_account(conn, owner)
    now = await clock(conn, at)
    grant = await one(
        conn,
        "SELECT * FROM quota_grants WHERE owner_id=%s AND starts_at<=%s AND ends_at>%s "
        "AND (revoked_at IS NULL OR revoked_at>%s)",
        (owner, now, now, now),
    )
    plan: Plan
    if grant:
        plan, start, end = "plus", grant["starts_at"], grant["ends_at"]
    else:
        last = await one(
            conn,
            "SELECT max(LEAST(ends_at,revoked_at)) AS t FROM quota_grants "
            "WHERE owner_id=%s AND LEAST(ends_at,revoked_at)<=%s",
            (owner, now),
        )
        start, end = free_window(last["t"] or account["created_at"], now)
        upcoming = await one(
            conn,
            "SELECT min(starts_at) AS t FROM quota_grants WHERE owner_id=%s AND starts_at>%s "
            "AND revoked_at IS NULL",
            (owner, now),
        )
        end = min(end, upcoming["t"]) if upcoming["t"] else end
        plan = "free"
    start, end = utc(start), utc(end)
    pid = uuid5(owner, f"quota-period:{plan}:{start.isoformat()}")
    await conn.execute(
        "INSERT INTO quota_periods(id,owner_id,plan,starts_at,ends_at,"
        "policy_version,limits,grant_id) "
        "VALUES (%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING",
        (
            pid,
            owner,
            plan,
            start,
            end,
            (grant.get("policy_snapshot") or {}).get("chat_policy", POLICY_VERSION)
            if grant
            else POLICY_VERSION,
            Jsonb(
                {"chat": grant["policy_snapshot"]["chat_messages"]}
                if grant and grant.get("policy_snapshot")
                else LIMITS[plan]
            ),
            grant["id"] if grant else None,
        ),
    )
    return await one(conn, "SELECT * FROM quota_periods WHERE id=%s", (pid,))


async def grant_plus(
    conn, owner: UUID, request_key: UUID, source: str, *, at: datetime | None = None
):
    """Trusted activation after payment verification or an explicit operator fixture."""
    if not source.strip() or len(source) > 512:
        raise ValueError("A bounded activation source is required")
    account = await lock_account(conn, owner)
    previous = await one(
        conn,
        "SELECT * FROM quota_grants WHERE owner_id=%s AND request_key=%s",
        (owner, request_key),
    )
    if previous:
        if previous["source"] != source:
            raise QuotaConflict("Kunci aktivasi sudah dipakai untuk sumber lain.")
        return previous
    now = await clock(conn, at)
    latest = await one(
        conn,
        "SELECT max(LEAST(ends_at,revoked_at)) AS t FROM quota_grants WHERE owner_id=%s",
        (owner,),
    )
    if now < utc(account["created_at"]):
        raise ValueError("Activation precedes account creation")
    start = max(now, utc(latest["t"])) if latest["t"] else now
    end, gid = start + PERIOD, uuid4()
    await conn.execute(
        "INSERT INTO quota_grants(id,owner_id,request_key,source,starts_at,ends_at) "
        "VALUES (%s,%s,%s,%s,%s,%s)",
        (gid, owner, request_key, source, start, end),
    )
    await conn.execute(
        "UPDATE quota_periods SET ends_at=%s WHERE owner_id=%s AND plan='free' "
        "AND starts_at<=%s AND ends_at>%s",
        (start, owner, start, start),
    )
    return await one(conn, "SELECT * FROM quota_grants WHERE id=%s", (gid,))
