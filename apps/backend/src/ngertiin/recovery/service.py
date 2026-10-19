"""Independent bounded passes keep a failing domain from starving other recovery."""

import structlog

logger = structlog.get_logger()


async def reconcile():
    from ngertiin.chat.recovery import reconcile_deliveries as chat
    from ngertiin.files.cleanup import reconcile as files
    from ngertiin.memory.jobs import recover as memory
    from ngertiin.proactivity.jobs import recover as proactivity
    from ngertiin.tasks.recovery import reconcile_deliveries as tasks
    from ngertiin.usage.recovery import reconcile as usage

    outcomes = {}
    for name, operation in (
        ("chat", chat),
        ("tasks", tasks),
        ("files", files),
        ("memory", memory),
        ("proactivity", proactivity),
        ("usage", usage),
    ):
        try:
            await operation()
            outcomes[name] = "ok"
        except Exception:
            outcomes[name] = "failed"
            logger.exception("recovery.component_failed", component=name)
    return outcomes
