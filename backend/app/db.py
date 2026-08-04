import os

import asyncpg
from fastapi import HTTPException

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
    """Return the connection pool, or signal that the service is not ready.

    Raising HTTPException(503) rather than RuntimeError matters during a
    redeploy: the app boots before Postgres is reachable, and an unhandled
    RuntimeError would turn every API call into a 500 with a stack trace. A 503
    is the honest answer - the service is up but its database is not - and the
    dashboard's error handling renders empty states for it instead of breaking.
    """
    if _pool is None:
        raise HTTPException(status_code=503, detail='database not ready')
    return _pool
