"""Browser compute and profile retention have separate finite budgets."""

import math
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from ngertiin.computer.contracts import ComputerRuntime

from ngertiin.config import get_settings


def snapshot():
    s = get_settings()
    seconds = s.computer_task_seconds
    storage = math.ceil(s.computer_storage_microusd_per_hour * 24 * s.computer_retention_days)
    return {
        "version": "private-browser-e2b-v2",
        "permissions": "routine-auto-sensitive-approval-v1",
        "provider": s.computer_provider,
        "engine": s.computer_engine,
        "workflow_version": s.computer_workflow_version,
        "jev_model": s.typesafe_model,
        "verify_results": True,
        "seconds": seconds,
        "idle_minutes": 2,
        "cleanup_seconds": 180,
        "max_steps": s.computer_max_steps,
        "retention_days": s.computer_retention_days,
        "profile_bytes": 1024 * 1024 * 1024,
        "download_bytes": 25 * 1024 * 1024,
        "egress_bytes": 200 * 1024 * 1024,
        "global_profiles": 20,
        "global_concurrency": 2,
        "max_sessions": 3,
        "microusd_per_hour": s.sandbox_resource_microusd_per_hour,
        "storage_microusd_per_hour": s.computer_storage_microusd_per_hour,
        "compute_reservation": math.ceil(
            (seconds + 180) * s.sandbox_resource_microusd_per_hour / 3600
        ),
        "storage_reservation": storage,
        "account_daily_microusd": s.sandbox_account_daily_microusd,
        "global_daily_microusd": s.sandbox_global_daily_microusd,
        "price_version": s.sandbox_price_version,
    }


def get_runtime(provider: str | None = None) -> "ComputerRuntime":
    from ngertiin.computer.e2b import E2BComputer

    if (provider or get_settings().computer_provider) != "e2b":
        raise ValueError("Provider runtime tidak didukung. Gunakan E2B.")
    return E2BComputer()
