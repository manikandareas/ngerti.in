"""Stable file identities cross the queue boundary."""

from uuid import UUID

from ngertiin.worker.queue import queue_app


@queue_app.task(name="file.extract", queue="default")
async def extract_job(extraction_id: str):
    from ngertiin.files.extraction import run

    await run(UUID(extraction_id))


@queue_app.periodic(cron="*/5 * * * *")
@queue_app.task(name="files.cleanup", queue="maintenance", queueing_lock="files_cleanup")
async def cleanup_job(timestamp: int | None = None):
    from ngertiin.files.cleanup import cleanup

    await cleanup()
