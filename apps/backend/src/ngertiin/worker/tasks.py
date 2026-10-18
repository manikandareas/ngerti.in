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
    for name in ("foundation.diagnostic", "chat.turn", "task.execute", "file.extract"):
        jobs = await queue_app.job_manager.get_stalled_jobs(task_name=name)
        for job in jobs:
            if job.attempts < 3:
                await queue_app.job_manager.retry_job(job)
                logger.warning("job.recovered", job_id=job.id)
            else:
                await queue_app.job_manager.finish_job(job, status=Status.FAILED, delete_job=False)
                logger.error("job.recovery_exhausted", job_id=job.id)
    from ngertiin.chat.recovery import reconcile_deliveries

    await reconcile_deliveries()
    from ngertiin.tasks.recovery import reconcile_deliveries as reconcile_tasks

    await reconcile_tasks()
    from ngertiin.files.cleanup import reconcile as reconcile_files

    await reconcile_files()


__all__ = ["diagnostic_job", "recover_stalled_jobs"]
