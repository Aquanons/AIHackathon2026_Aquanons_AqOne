import asyncio
import os
from pathlib import Path

import asyncpg


async def _ensure_schema_migrations(conn: asyncpg.Connection) -> None:
    await conn.execute(
        '''
        CREATE TABLE IF NOT EXISTS schema_migrations (
          filename TEXT PRIMARY KEY,
          applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        '''
    )


async def _applied_migrations(conn: asyncpg.Connection) -> set[str]:
    rows = await conn.fetch('SELECT filename FROM schema_migrations')
    return {row['filename'] for row in rows}


async def _apply_sql(conn: asyncpg.Connection, sql: str) -> None:
    statements = [part.strip() for part in sql.split(';') if part.strip()]
    for statement in statements:
        await conn.execute(statement)


async def main() -> None:
    database_url = os.environ.get('DATABASE_URL')
    if not database_url:
        raise RuntimeError('DATABASE_URL is required')

    migrations_dir = Path(__file__).resolve().parent / 'migrations'
    files = sorted(path for path in migrations_dir.glob('*.sql') if path.is_file())

    conn = await asyncpg.connect(database_url)
    try:
        await _ensure_schema_migrations(conn)
        applied = await _applied_migrations(conn)

        for path in files:
            if path.name in applied:
                continue
            sql = path.read_text(encoding='utf-8')
            async with conn.transaction():
                await _apply_sql(conn, sql)
                await conn.execute(
                    'INSERT INTO schema_migrations (filename) VALUES ($1)',
                    path.name,
                )
    finally:
        await conn.close()


if __name__ == '__main__':
    asyncio.run(main())
