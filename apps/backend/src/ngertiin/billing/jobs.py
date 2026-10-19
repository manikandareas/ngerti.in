"""A durable inbox and periodic reconciliation survive closed browsers and worker crashes."""

from ngertiin.worker.queue import queue_app


@queue_app.periodic(cron="* * * * *")
@queue_app.task(name="billing.reconcile", queue="maintenance", queueing_lock="billing.reconcile")
async def reconcile(timestamp: int | None = None):
    from ngertiin.billing.service import tick

    await tick()
