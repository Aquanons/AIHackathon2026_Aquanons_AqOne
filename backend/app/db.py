import os

import asyncpg

_pool: asyncpg.Pool | None = None


async def startup_db() -> None:
    global _pool
    if _pool is not None:
        return

    database_url = os.environ.get('DATABASE_URL')
    if not database_url:
        return

    try:
        _pool = await asyncpg.create_pool(database_url)
    except (asyncpg.PostgresError, OSError, TimeoutError, ConnectionError):
        _pool = None


async def shutdown_db() -> None:
    global _pool
    if _pool is None:
        return

    await _pool.close()
    _pool = None


def get_pool() -> asyncpg.Pool:
    if _pool is None:
        raise RuntimeError('database pool is not initialized')
    return _pool
