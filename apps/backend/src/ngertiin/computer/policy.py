"""Browser compute and profile retention have separate finite budgets."""

import math

from ngertiin.config import get_settings


def snapshot():
    s = get_settings()
    seconds = s.computer_task_seconds
    storage = math.ceil(s.computer_storage_microusd_per_hour * 24 * s.computer_retention_days)
    return {
        "version": "private-browser-v1",
        "provider": "daytona",
        "seconds": seconds,
        "idle_minutes": 2,
        "cleanup_seconds": 180,
        "max_steps": 24,
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


def get_runtime(provider="daytona"):
    from ngertiin.computer.contracts import ComputerRuntime
    from ngertiin.computer.daytona import DaytonaComputer

    if provider != "daytona" or not get_settings().daytona_api_key.get_secret_value():
        raise ValueError("Komputer belum dikonfigurasi. Draft tetap tersimpan.")
    runtime: ComputerRuntime = DaytonaComputer()
    return runtime
