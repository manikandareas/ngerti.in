import asyncio
import logging

import ngertiin.chat.tasks  # noqa: F401
import ngertiin.computer.jobs  # noqa: F401
import ngertiin.files.jobs  # noqa: F401
import ngertiin.memory.jobs  # noqa: F401
import ngertiin.proactivity.jobs  # noqa: F401
import ngertiin.sandbox.jobs  # noqa: F401
import ngertiin.schedules.jobs  # noqa: F401
import ngertiin.tasks.jobs  # noqa: F401
from ngertiin.worker.queue import queue_app
from ngertiin.worker.tasks import recover_stalled_jobs


async def main() -> None:
    logging.basicConfig(level=logging.INFO)
    async with queue_app.open_async():
        await recover_stalled_jobs()
        await queue_app.run_worker_async(
            queues=["default", "maintenance"],
            concurrency=2,
            name="ngertiin",
            shutdown_graceful_timeout=20,
        )


if __name__ == "__main__":
    asyncio.run(main())
