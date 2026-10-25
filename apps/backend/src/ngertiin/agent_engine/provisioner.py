"""Reconcile durable account setup. Hermes owns all agent execution."""

import argparse
import asyncio
import contextlib
import json
import signal
from uuid import UUID

import structlog
from fastapi import HTTPException
from sqlalchemy import text

from ngertiin.agent_engine.api import forward_partition
from ngertiin.agent_engine.conversations import setup_command
from ngertiin.agent_engine.partitions import Partitions, ProvisioningError
from ngertiin.agent_engine.stream import read_command
from ngertiin.db import get_engine

logger = structlog.get_logger()


def claim(engine):
    with engine.begin() as conn:
        row = (
            conn.execute(
                text("""
            WITH candidate AS (
                SELECT owner_id FROM account_provisioning
                WHERE status!='operator_required' AND next_attempt_at<=now()
                  AND (lease_until IS NULL OR lease_until<now())
                ORDER BY next_attempt_at FOR UPDATE SKIP LOCKED LIMIT 1
            )
            UPDATE account_provisioning p SET
                status=CASE WHEN p.status='ready' THEN 'ready' ELSE 'provisioning' END,
                generation=p.generation+1, attempts=p.attempts+1,
                lease_until=now()+interval '180 seconds', updated_at=now()
            FROM candidate c WHERE p.owner_id=c.owner_id
            RETURNING p.owner_id,p.generation,p.attempts
        """)
            )
            .mappings()
            .first()
        )
        return dict(row) if row else None


def finish(engine, job, status, result=None, error=None):
    delay = 30 if status == "ready" else min(300, 2 ** min(job["attempts"], 8))
    with engine.begin() as conn:
        # Failure paths pass result=None and must keep the last successful
        # setup result instead of erasing the durable operational record.
        return (
            conn.execute(
                text("""
            UPDATE account_provisioning SET status=:status,
                result=COALESCE(CAST(:result AS jsonb),result),
                error_code=:error,lease_until=NULL,next_attempt_at=now()+:delay*interval '1 second',
                updated_at=now(),attempts=CASE WHEN :status='ready' THEN 0 ELSE attempts END
            WHERE owner_id=:owner AND generation=:generation AND lease_until>now()
        """),
                {
                    "owner": job["owner_id"],
                    "generation": job["generation"],
                    "status": status,
                    # SQL NULL (not jsonb null) so COALESCE keeps the prior result.
                    "result": json.dumps(result) if result is not None else None,
                    "error": error,
                    "delay": delay,
                },
            ).rowcount
            == 1
        )


async def reconcile(engine, partitions, job):
    owner = str(job["owner_id"])
    try:
        async with asyncio.timeout(120):
            entry = await partitions.ensure(owner)
            await forward_partition(owner, setup_command(owner), entry)
            current = await forward_partition(owner, read_command("account.read", {}), entry)
            if current.get("status") != "ready" or not current.get("primary_dm_thread_id"):
                raise ProvisioningError("SETUP_STATE_MISSING")
            finish(engine, job, "ready", current)
    except (ProvisioningError, HTTPException) as exc:
        code = (
            exc.code
            if isinstance(exc, ProvisioningError)
            else (
                exc.detail.get("code", "ENGINE_UNAVAILABLE")
                if isinstance(exc.detail, dict)
                else "ENGINE_UNAVAILABLE"
            )
        )
        manual = code in {
            "PARTITION_STATE_MISSING",
            "SETUP_STATE_MISSING",
            "PARTITION_MISMATCH",
            "RESTORE_QUARANTINED",
            "DM_RECONCILIATION_REQUIRED",
            "EXTERNAL_PARTITION_CONFLICT",
            "INVALID_PARTITION_PATH",
            "UNSUPPORTED_SCHEMA",
        }
        finish(engine, job, "operator_required" if manual else "retryable_failure", error=code)
    except (OSError, ValueError, KeyError, TimeoutError):
        finish(engine, job, "retryable_failure", error="PROVISIONING_UNAVAILABLE")


async def run():
    engine, partitions = get_engine(), Partitions()
    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for signum in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(signum, stop.set)
    try:
        while not stop.is_set():
            # One broken iteration (database blip, engine outage) must never
            # kill the loop; leases expire and claims retry on their own.
            try:
                job = claim(engine)
                if job:
                    await reconcile(engine, partitions, job)
                else:
                    with contextlib.suppress(TimeoutError):
                        await asyncio.wait_for(stop.wait(), 1)
            except Exception:
                logger.exception("provisioner.iteration_failed")
                with contextlib.suppress(TimeoutError):
                    await asyncio.wait_for(stop.wait(), 5)
    finally:
        partitions.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--retry", type=UUID, help="Requeue one account after operator reconciliation"
    )
    args = parser.parse_args()
    if args.retry:
        with get_engine().begin() as conn:
            result = conn.execute(
                text(
                    "UPDATE account_provisioning SET status='pending',error_code=NULL,"
                    "next_attempt_at=now() WHERE owner_id=:owner "
                    "AND (lease_until IS NULL OR lease_until<now())"
                ),
                {"owner": args.retry},
            )
            if result.rowcount != 1:
                raise RuntimeError("Account is missing or currently leased")
    else:
        asyncio.run(run())


if __name__ == "__main__":
    main()
