"""Small durable computer maintenance jobs."""

from uuid import UUID

from ngertiin.worker.queue import queue_app


@queue_app.task(name="computer.stop", queue="maintenance")
async def cleanup_task(task_id: str, owner_id: str):
    from ngertiin.computer.lifecycle import stop_task

    await stop_task(UUID(owner_id), UUID(task_id))


@queue_app.periodic(cron="* * * * *")
@queue_app.task(name="computer.sweep", queue="maintenance", queueing_lock="computer.sweep")
async def sweep(timestamp: int | None = None):
    from ngertiin.computer.lifecycle import sweep as reconcile

    await reconcile()
