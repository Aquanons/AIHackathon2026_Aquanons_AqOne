"""One-shot trip-anomaly evaluation, safe to run twice (docs/38 Phase 2 item 5).

Invoked as `python -m app.ai.run_anomaly_evaluation` by a Railway cron
service pointed at this repo (see README "Scheduled anomaly evaluation").
Connects directly rather than through the app's connection pool, the same
pattern app/ai/trip_profile_eval.py already uses for its own one-shot DB
access - this process is not the FastAPI app and never starts one.

Idempotent: evaluate_and_persist only ever UPSERTs, so running this twice in
a row (a Railway cron overlap, a manual re-run) reproduces the same result
for the same database state, modulo the small amount of real time that
passed between runs.
"""

from __future__ import annotations

import asyncio
import os
from datetime import UTC, datetime

import asyncpg

from app.ai.anomaly_service import demo_evaluation_enabled, evaluate_and_persist


async def main() -> None:
    database_url = os.environ.get('DATABASE_URL')
    if not database_url:
        raise RuntimeError('DATABASE_URL is required')

    as_of = datetime.now(UTC)
    include_synthetic = demo_evaluation_enabled()
    conn = await asyncpg.connect(database_url)
    try:
        rows = await evaluate_and_persist(conn, as_of=as_of, include_synthetic=include_synthetic)
    finally:
        await conn.close()

    print(f'evaluated_at: {as_of.isoformat()}')
    print(f'include_synthetic: {include_synthetic}')
    print(f'scored_trips: {len(rows)}')
    print(f'statuses: {sorted({row["status"] for row in rows})}')


if __name__ == '__main__':
    asyncio.run(main())
