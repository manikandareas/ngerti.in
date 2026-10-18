"""Resource reconciliation survives request cancellation and host worker crashes."""

from uuid import UUID

from ngertiin.worker.queue import queue_app


@queue_app.task(name="sandbox.cleanup", queue="maintenance")
async def cleanup_task(task_id: str, owner_id: str):
    from ngertiin.sandbox.lifecycle import for_task

    await for_task(UUID(owner_id), UUID(task_id))


@queue_app.periodic(cron="* * * * *")
@queue_app.task(name="sandbox.sweep", queue="maintenance", queueing_lock="sandbox_sweep")
async def sweep_task(timestamp: int | None = None):
    from ngertiin.sandbox.lifecycle import sweep

    await sweep()
