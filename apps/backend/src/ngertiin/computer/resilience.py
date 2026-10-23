"""Bounded recovery at confirmed effect boundaries; never replay unknown input."""

import asyncio

import structlog

from ngertiin.computer import continuation
from ngertiin.computer.contracts import ComputerPaused, NeedsHuman
from ngertiin.tasks import budget, store

logger = structlog.get_logger(__name__)


class FinalizationUnavailable(ValueError):
    pass


async def model_result(operation, *args):
    for attempt in range(2):
        try:
            return await operation(*args)
        except (
            store.StaleExecution,
            ComputerPaused,
            NeedsHuman,
            budget.BudgetExhausted,
            budget.AdmissionDenied,
        ):
            raise
        except Exception as error:
            logger.warning(
                "computer.finalization_retry", error_type=type(error).__name__, attempt=attempt + 1
            )
            if attempt:
                raise FinalizationUnavailable("Finalisasi model belum tersedia.") from None
            await asyncio.sleep(0.5)
    raise AssertionError("unreachable")


async def recover(execution, error):
    logger.warning(
        "computer.recover", task_id=str(execution["id"]), error_type=type(error).__name__
    )
    async with store.locked(execution["owner_id"], execution["id"]) as (conn, task):
        store.fence(task, execution)
        state = dict(task.get("runtime_state", {}))
        attempts = state.get("recovery_attempts", 0)
        if attempts >= 3 or isinstance(error, budget.AdmissionDenied):
            return False
        state.update(
            recovery_attempts=attempts + 1,
            last_error_type=type(error).__name__,
            feedback="Gangguan sementara; amati ulang keadaan sebelum melanjutkan.",
        )
        from ngertiin.chat.store import json_value

        await store.change(conn, task, runtime_state=json_value(state))
        # Checks current ownership, deadline, unknown/dispatched mutations and control.
        return await continuation.recover(conn, task, "provider_retry")
