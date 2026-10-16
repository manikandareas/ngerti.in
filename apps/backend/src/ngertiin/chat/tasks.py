"""Queue registration; pending approvals complete their delivery job."""

from ngertiin.worker.queue import queue_app


@queue_app.task(name="chat.turn", queue="default")
async def chat_job(run_id: str) -> None:
    from ngertiin.chat.runtime import run_turn

    await run_turn(run_id)
