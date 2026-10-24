"""Preserve the account-database restore quarantine without a second executor."""

from ngertiin.async_db import transaction


async def ensure_database_released():
    async with transaction() as connection:
        relation = await (
            await connection.execute("SELECT to_regclass('recovery_restores') AS name")
        ).fetchone()
        if not relation or not relation["name"]:
            return
        latest = await (
            await connection.execute(
                "SELECT released_at FROM recovery_restores ORDER BY created_at DESC LIMIT 1"
            )
        ).fetchone()
        if latest and latest["released_at"] is None:
            raise RuntimeError(
                "Restored account database is quarantined pending operator reconciliation"
            )
