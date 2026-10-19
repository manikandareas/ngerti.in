"""The server wakes the dispatcher; user browsers own no timers."""

from ngertiin.worker.queue import queue_app


@queue_app.periodic(cron="* * * * *")
@queue_app.task(name="schedule.dispatch", queue="maintenance", queueing_lock="schedule.dispatch")
async def dispatch(timestamp: int | None = None):
    from ngertiin.schedules.dispatch import tick

    await tick()
