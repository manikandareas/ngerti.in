"""Persisted workflows keep their version; upgrades never reinterpret unknown work."""

from fastapi import HTTPException

WORKFLOW_VERSION = 1
MESSAGE = (
    "Versi pekerjaan ini memerlukan pemulihan setelah pembaruan aplikasi. "
    "Draft dan hasil terdahulu tetap tersimpan. Hubungi pengelola untuk melanjutkan."
)


def require_supported(task):
    if task.get("workflow_version", 1) != WORKFLOW_VERSION:
        raise HTTPException(409, MESSAGE)
    if task.get("stage") == "restore_required":
        raise HTTPException(409, task.get("error") or MESSAGE)


async def block_unsupported(conn, task):
    from ngertiin.tasks import budget, store

    if task.get("workflow_version", 1) == WORKFLOW_VERSION:
        return False
    await budget.abandon_calls(conn, task)
    await store.finish_execution(conn, task, "interrupted")
    await store.change(
        conn, task, status="failed", stage="upgrade_required", lease_token=None, error=MESSAGE
    )
    await store.emit(conn, task)
    return True
