"""Finite operational ceilings, independent of commercial chat entitlements."""

from typing import TYPE_CHECKING

from ngertiin.config import get_settings

if TYPE_CHECKING:
    from ngertiin.sandbox.contracts import SandboxRuntime


def snapshot() -> dict:
    settings = get_settings()
    return {
        "version": "code-sandbox-v1",
        "provider": settings.sandbox_provider,
        "cpu": 2,
        "ram_gib": 4,
        "disk_gib": 22,
        "command_seconds": 60,
        "task_seconds": 300,
        "ttl_minutes": 10,
        "cleanup_margin_seconds": 120,
        "max_steps": 3,
        "max_sessions": 3,
        "max_code_bytes": 20000,
        "max_log_bytes": 16000,
        "session_microusd": 36000,
        "task_microusd": 108000,
        "account_daily_microusd": settings.sandbox_account_daily_microusd,
        "global_daily_microusd": settings.sandbox_global_daily_microusd,
        "account_concurrency": 1,
        "global_concurrency": 2,
        "price_version": settings.sandbox_price_version,
        "microusd_per_hour": settings.sandbox_resource_microusd_per_hour,
        "network": "deny_all",
    }


def get_runtime(provider: str | None = None) -> "SandboxRuntime":
    from ngertiin.sandbox.e2b import E2BAdapter

    if (provider or get_settings().sandbox_provider) != "e2b":
        raise ValueError("Provider runtime tidak didukung. Gunakan E2B.")
    return E2BAdapter()
