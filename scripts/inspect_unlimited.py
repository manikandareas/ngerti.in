"""Verify operator usage exemptions with synthetic accounts in a rolled-back transaction."""

import asyncio
from uuid import uuid4

import psycopg
from fastapi import HTTPException
from ngertiin.accounts.access import unlimited_usage
from ngertiin.config import get_settings
from ngertiin.files.store import capacity
from ngertiin.quotas import ledger as chat
from ngertiin.quotas.api import UsageResponse
from ngertiin.quotas.errors import QuotaExceeded
from ngertiin.quotas.policy import fingerprint
from ngertiin.tasks.budget import AdmissionDenied
from ngertiin.usage import ledger as compute
from ngertiin.usage.api import summary
from ngertiin.usage.estimates import estimate
from psycopg.rows import dict_row


async def main():
    settings = get_settings()
    original = settings.unlimited_account_ids
    privileged, ordinary = uuid4(), uuid4()
    settings.unlimited_account_ids = frozenset({privileged})
    try:
        assert unlimited_usage(privileged) and not unlimited_usage(ordinary)
        async with (
            await psycopg.AsyncConnection.connect(
                settings.database_url.get_secret_value(),
                row_factory=dict_row,
                autocommit=True,
            ) as conn,
            conn.transaction(force_rollback=True),
        ):
            for owner in (privileged, ordinary):
                await conn.execute(
                    "INSERT INTO accounts(id,clerk_user_id,created_at) VALUES (%s,%s,now())",
                    (owner, f"unlimited-inspector-{owner}"),
                )
            reservation = await chat.reserve(
                conn, privileged, "chat", "probe", 101, fingerprint("probe")
            )
            await chat.commit(conn, privileged, reservation, "inspector")
            usage = UsageResponse.model_validate(await chat.usage(conn, privileged))
            assert usage.unlimited and usage.meters["chat"].used == 101
            assert usage.meters["chat"].remaining == 0
            try:
                await chat.reserve(
                    conn, ordinary, "chat", "probe", 101, fingerprint("probe")
                )
            except QuotaExceeded:
                pass
            else:
                raise AssertionError("Ordinary account bypassed chat quota")
            # Far beyond both period and daily ceilings; no provider calls are made.
            work = await compute.open_work(
                conn, privileged, "probe", "chat", "Inspector", 1_000_000_000
            )
            await compute.reserve_event(
                conn, work, "probe:cost", "model", "inspector", {}, 100
            )
            assert (await summary(conn, privileged))["unlimited"]
            assert (await estimate(conn, privileged))["available"]
            try:
                await compute.open_work(
                    conn, ordinary, "probe", "chat", "Inspector", 1_000_000_000
                )
            except AdmissionDenied:
                pass
            else:
                raise AssertionError("Ordinary account bypassed compute quota")
            await capacity(conn, privileged, settings.file_account_bytes + 1)
            try:
                await capacity(conn, ordinary, settings.file_account_bytes + 1)
            except HTTPException as error:
                assert error.status_code == 429
            else:
                raise AssertionError("Ordinary account bypassed storage quota")
            # Revocation takes effect without rewriting historical policy snapshots.
            settings.unlimited_account_ids = frozenset()
            try:
                await chat.reserve(
                    conn, privileged, "chat", "revoked", 1, fingerprint("new")
                )
            except QuotaExceeded:
                pass
            else:
                raise AssertionError("Revoked account retained unlimited chat")
            period = await compute.period(conn, privileged)
            try:
                compute.ensure_capacity(
                    {
                        "period": 10**12,
                        "vendor_period": 10**12,
                        "account": 10**12,
                        "global": 10**12,
                    },
                    period,
                    period["policy"],
                    1,
                )
            except AdmissionDenied:
                pass
            else:
                raise AssertionError("Revoked account retained unlimited compute")
        print(
            "PASS: owner isolation, chat/compute/storage admission, accounting, API schema,"
        )
        print(
            "preflight and revocation. Synthetic database changes rolled back; no provider calls."
        )
    finally:
        settings.unlimited_account_ids = original


if __name__ == "__main__":
    asyncio.run(main())
