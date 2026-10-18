"""A bounded async pool per process; no connection survives an external model call."""

from contextlib import asynccontextmanager

from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool

from ngertiin.config import get_settings

_pool: AsyncConnectionPool | None = None


async def pool() -> AsyncConnectionPool:
    global _pool
    if _pool is None:
        _pool = AsyncConnectionPool(
            get_settings().database_url.get_secret_value(),
            min_size=0,
            max_size=8,
            timeout=5,
            open=False,
            kwargs={"row_factory": dict_row, "options": "-c statement_timeout=5000"},
        )
        await _pool.open()
    return _pool


@asynccontextmanager
async def transaction():
    async with (await pool()).connection() as connection, connection.transaction():
        yield connection


async def close_pool() -> None:
    global _pool
    if _pool:
        await _pool.close()
        _pool = None
