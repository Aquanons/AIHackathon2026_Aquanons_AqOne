"""Live-Postgres verification of the operations_audit_events schema/trigger.

docs/41 Phase 2. This repo has no CI or docker-compose today - every other
test in this suite uses an in-memory fake pool - so this is the one test
that needs a real database, and is skipped when DATABASE_URL is not set
(as it is in this sandbox). It runs for real wherever DATABASE_URL points
at a live Postgres: applies just this migration's statements inside a
transaction each test rolls back at the end, so it never leaves anything
behind in whatever database it's pointed at.

No async pytest plugin is configured anywhere else in this suite (every
other async call site uses plain `asyncio.run(...)` inside a sync test
function, e.g. test_anomaly_source.py) - matching that here, rather than a
bare `async def test_...`, which would silently never execute and falsely
report as passed without it.
"""

from __future__ import annotations

import asyncio
import os
from pathlib import Path

import asyncpg
import pytest

from migrate import _split_statements

pytestmark = pytest.mark.skipif(
    not os.environ.get('DATABASE_URL'),
    reason='requires a live Postgres (set DATABASE_URL to run this test)',
)

MIGRATION_PATH = (
    Path(__file__).resolve().parent.parent / 'migrations' / '022_operations_audit_events.sql'
)


async def _in_migrated_transaction(body):
    """Connects, applies the migration inside one transaction, runs `body`
    against that connection, then always rolls back and closes - so this
    test suite never leaves anything behind in whatever database
    DATABASE_URL points at.
    """
    conn = await asyncpg.connect(os.environ['DATABASE_URL'])
    transaction = conn.transaction()
    await transaction.start()
    try:
        for statement in _split_statements(MIGRATION_PATH.read_text(encoding='utf-8')):
            if all(
                not line.strip() or line.strip().startswith('--')
                for line in statement.splitlines()
            ):
                continue
            await conn.execute(statement)
        await body(conn)
    finally:
        await transaction.rollback()
        await conn.close()


def test_table_has_the_documented_columns():
    async def body(conn):
        columns = await conn.fetch(
            '''
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'operations_audit_events'
            '''
        )
        names = {row['column_name'] for row in columns}
        assert names == {
            'id', 'occurred_at', 'actor_user_id', 'actor_email', 'actor_role',
            'action', 'resource_type', 'resource_id', 'outcome',
            'correlation_key', 'is_demo', 'metadata',
        }

    asyncio.run(_in_migrated_transaction(body))


def test_expected_indexes_exist():
    async def body(conn):
        indexes = await conn.fetch(
            '''
            SELECT indexname FROM pg_indexes
            WHERE tablename = 'operations_audit_events'
            '''
        )
        names = {row['indexname'] for row in indexes}
        assert 'idx_operations_audit_events_resource' in names
        assert 'idx_operations_audit_events_actor' in names

    asyncio.run(_in_migrated_transaction(body))


def test_ordinary_update_is_rejected():
    async def body(conn):
        await conn.execute(
            '''
            INSERT INTO operations_audit_events (action, resource_type, outcome)
            VALUES ('test.action', 'test_resource', 'created')
            '''
        )
        with pytest.raises(asyncpg.PostgresError, match='append-only'):
            await conn.execute(
                "UPDATE operations_audit_events SET outcome = 'tampered' "
                "WHERE action = 'test.action'"
            )

    asyncio.run(_in_migrated_transaction(body))


def test_ordinary_delete_is_rejected():
    async def body(conn):
        await conn.execute(
            '''
            INSERT INTO operations_audit_events (action, resource_type, outcome)
            VALUES ('test.action', 'test_resource', 'created')
            '''
        )
        with pytest.raises(asyncpg.PostgresError, match='append-only'):
            await conn.execute(
                "DELETE FROM operations_audit_events WHERE action = 'test.action'"
            )

    asyncio.run(_in_migrated_transaction(body))


def test_a_database_admin_can_still_disable_the_trigger_to_intervene():
    """Not cryptographic/legal immutability - documented administrative
    override, per docs/41's acceptance boundary."""

    async def body(conn):
        await conn.execute(
            'ALTER TABLE operations_audit_events '
            'DISABLE TRIGGER trg_operations_audit_events_append_only'
        )
        await conn.execute(
            '''
            INSERT INTO operations_audit_events (action, resource_type, outcome)
            VALUES ('test.action', 'test_resource', 'created')
            '''
        )
        await conn.execute(
            "UPDATE operations_audit_events SET outcome = 'corrected' "
            "WHERE action = 'test.action'"
        )
        row = await conn.fetchrow(
            "SELECT outcome FROM operations_audit_events WHERE action = 'test.action'"
        )
        assert row['outcome'] == 'corrected'

    asyncio.run(_in_migrated_transaction(body))
