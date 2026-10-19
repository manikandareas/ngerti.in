"""Small queue wrappers; no request token is stored in a job payload."""

import asyncio

import structlog
from procrastinate import RetryStrategy
from procrastinate.jobs import Status

from ngertiin.worker.queue import queue_app

logger = structlog.get_logger()


@queue_app.task(
    name="foundation.diagnostic",
    queue="default",
    retry=RetryStrategy(max_attempts=3, wait=10),
)
async def diagnostic_job(run_id: str) -> None:
    from ngertiin.worker.workflow import run_workflow

    logger.info("diagnostic.started", run_id=run_id)
    await asyncio.to_thread(run_workflow, run_id)
    logger.info("diagnostic.completed", run_id=run_id)


@queue_app.periodic(cron="* * * * *")
@queue_app.task(
    name="foundation.recover_stalled", queue="maintenance", queueing_lock="recover_stalled"
)
async def recover_stalled_jobs(timestamp: int | None = None) -> None:
    # Heartbeats, not job age: a healthy long-running job must never be stolen.
    # Include maintenance jobs so a dead cleanup/dispatch cannot keep its lock forever.
    jobs = await queue_app.job_manager.get_stalled_jobs()
    for job in jobs:
        try:
            if (
                job.task_name in ("task.execute", "chat.turn")
                or job.task_name not in queue_app.tasks
                or job.attempts >= 3
            ):
                # The domain reconciler revokes the old lease before creating a
                # replacement. Retrying the raw job would find status=running.
                await queue_app.job_manager.finish_job(job, status=Status.FAILED, delete_job=False)
            else:
                await queue_app.job_manager.retry_job(job)
            logger.warning("job.recovered", job_id=job.id, task_name=job.task_name)
        except Exception:
            logger.exception("job.recovery_failed", job_id=job.id)
    from ngertiin.recovery.service import reconcile

    await reconcile()


__all__ = ["diagnostic_job", "recover_stalled_jobs"]
