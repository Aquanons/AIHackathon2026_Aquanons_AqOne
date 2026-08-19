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


def _split_statements(sql: str) -> list[str]:
    """Split a migration into statements on semicolons that actually end one.

    A plain sql.split(';') breaks on semicolons inside comments and string
    literals. A comment reading "-- direct-path only; will not fit in a frame"
    was cut in half, leaving "will not fit in a frame." to be executed as SQL -
    a syntax error that aborted the migration, which in turn stopped the
    container before uvicorn started and showed up only as a failed healthcheck.

    Tracks single-quoted strings and -- line comments, and splits only outside
    both.
    """
    statements: list[str] = []
    current: list[str] = []
    in_string = False
    in_comment = False
    index = 0

    while index < len(sql):
        char = sql[index]
        nxt = sql[index + 1] if index + 1 < len(sql) else ''

        if in_comment:
            current.append(char)
            if char == '\n':
                in_comment = False
        elif in_string:
            current.append(char)
            if char == "'":
                # '' is an escaped quote inside a string, not a terminator.
                if nxt == "'":
                    current.append(nxt)
                    index += 1
                else:
                    in_string = False
        elif char == '-' and nxt == '-':
            in_comment = True
            current.append(char)
        elif char == "'":
            in_string = True
            current.append(char)
        elif char == ';':
            statements.append(''.join(current))
            current = []
        else:
            current.append(char)
        index += 1

    tail = ''.join(current).strip()
    if tail:
        statements.append(tail)
    return [s.strip() for s in statements if s.strip()]


async def _apply_sql(conn: asyncpg.Connection, sql: str, filename: str) -> None:
    """Run a migration file statement by statement.

    Reports which statement failed. A migration error aborts the container
    before uvicorn starts, so the deploy dies with nothing but a red healthcheck
    unless the offending SQL is named here.
    """
    statements = _split_statements(sql)
    for index, statement in enumerate(statements, 1):
        # A fragment that is only a comment is not worth sending to the server.
        if all(
            not line.strip() or line.strip().startswith('--')
            for line in statement.splitlines()
        ):
            continue
        try:
            await conn.execute(statement)
        except Exception as error:
            preview = ' '.join(statement.split())[:200]
            print(
                f'MIGRATION FAILED: {filename} statement {index}/{len(statements)}\n'
                f'  error: {type(error).__name__}: {error}\n'
                f'  sql  : {preview}',
                flush=True,
            )
            raise


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
            print(f'applying migration {path.name}', flush=True)
            async with conn.transaction():
                await _apply_sql(conn, sql, path.name)
                await conn.execute(
                    'INSERT INTO schema_migrations (filename) VALUES ($1)',
                    path.name,
                )
            print(f'applied  migration {path.name}', flush=True)
    finally:
        await conn.close()


if __name__ == '__main__':
    asyncio.run(main())
