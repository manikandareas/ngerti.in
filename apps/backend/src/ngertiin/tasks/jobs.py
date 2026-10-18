"""Only stable IDs cross the queue boundary."""

from ngertiin.worker.queue import queue_app


@queue_app.task(name="task.execute", queue="default")
async def task_job(task_id: str):
    from ngertiin.tasks.runtime import run_task

    await run_task(task_id)
