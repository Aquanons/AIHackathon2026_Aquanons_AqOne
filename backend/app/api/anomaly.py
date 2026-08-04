from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException

from app.ai.trip_profile import ContactPoint, build_profiles_from_contacts, score_trip
from app.db import get_pool

router = APIRouter(prefix='/api/ai/anomaly', tags=['anomaly'])


async def _load_trip_rows(conn) -> list[dict[str, object]]:
    rows = await conn.fetch(
        '''
        SELECT bc.vessel_id, bc.trip_id, bc.buoy_id, bc.observed_at, bc.latitude, bc.longitude
        FROM buoy_contacts bc
        JOIN buoys b ON b.id = bc.buoy_id
        WHERE bc.is_synthetic = TRUE
        ORDER BY bc.vessel_id, bc.trip_id, bc.observed_at
        '''
    )
    return [dict(row) for row in rows]


def _group_latest_trips(rows: list[dict[str, object]]) -> list[tuple[str, str, list[ContactPoint]]]:
    grouped: dict[tuple[str, str], list[ContactPoint]] = {}
    for row in rows:
        key = (str(row['vessel_id']), str(row['trip_id']))
        grouped.setdefault(key, []).append(
            ContactPoint(
                buoy_id=str(row['buoy_id']),
                observed_at=row['observed_at'],
                latitude=float(row['latitude']),
                longitude=float(row['longitude']),
            )
        )
    latest: dict[str, tuple[str, list[ContactPoint]]] = {}
    for (vessel_id, trip_id), contacts in grouped.items():
        contacts.sort(key=lambda item: item.observed_at)
        if vessel_id not in latest or contacts[-1].observed_at > latest[vessel_id][1][-1].observed_at:
            latest[vessel_id] = (trip_id, contacts)
    return [(vessel_id, trip_id, contacts) for vessel_id, (trip_id, contacts) in latest.items()]


async def _rebuild_and_score() -> list[dict[str, object]]:
    pool = get_pool()
    async with pool.acquire() as conn:
        rows = await _load_trip_rows(conn)
        profiles = build_profiles_from_contacts(rows)
        latest_rows = _group_latest_trips(rows)

        await conn.execute('TRUNCATE TABLE vessel_profiles, vessel_anomaly_scores')
        score_rows: list[dict[str, object]] = []
        for vessel_id, trip_id, contacts in latest_rows:
            profile = profiles[vessel_id]
            as_of = contacts[-1].observed_at
            score = score_trip(profile, contacts, as_of=as_of)
            score_rows.append(score.to_response())
            await conn.execute(
                '''
                INSERT INTO vessel_profiles (
                  vessel_id, profile_json, trip_count, low_confidence, rebuilt_at, is_synthetic
                ) VALUES ($1, $2::jsonb, $3, $4, $5, TRUE)
                ON CONFLICT (vessel_id) DO UPDATE SET
                  profile_json = EXCLUDED.profile_json,
                  trip_count = EXCLUDED.trip_count,
                  low_confidence = EXCLUDED.low_confidence,
                  rebuilt_at = EXCLUDED.rebuilt_at,
                  is_synthetic = TRUE
                ''',
                vessel_id,
                profile.to_json(),
                profile.trip_count,
                profile.low_confidence,
                datetime.now(UTC),
            )
            await conn.execute(
                '''
                INSERT INTO vessel_anomaly_scores (
                  vessel_id, trip_id, observed_at, last_contact_at, score, status,
                  factors, expected_next_buoy_id, expected_window_start,
                  expected_window_end, is_active, low_confidence, updated_at,
                  is_synthetic
                ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12, $13, TRUE)
                ON CONFLICT (vessel_id, trip_id) DO UPDATE SET
                  observed_at = EXCLUDED.observed_at,
                  last_contact_at = EXCLUDED.last_contact_at,
                  score = EXCLUDED.score,
                  status = EXCLUDED.status,
                  factors = EXCLUDED.factors,
                  expected_next_buoy_id = EXCLUDED.expected_next_buoy_id,
                  expected_window_start = EXCLUDED.expected_window_start,
                  expected_window_end = EXCLUDED.expected_window_end,
                  is_active = EXCLUDED.is_active,
                  low_confidence = EXCLUDED.low_confidence,
                  updated_at = EXCLUDED.updated_at,
                  is_synthetic = TRUE
                ''',
                vessel_id,
                trip_id,
                as_of,
                contacts[-1].observed_at,
                score.score,
                score.status,
                [factor.__dict__ for factor in score.factors],
                score.expected_contact.buoy_id,
                score.expected_contact.window_start,
                score.expected_contact.window_end,
                score.status in {'watch', 'overdue', 'alert'},
                profile.low_confidence,
                datetime.now(UTC),
            )
    return score_rows


@router.get('/active')
async def active() -> list[dict[str, object]]:
    await _rebuild_and_score()
    pool = get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            '''
            SELECT vessel_id, trip_id, observed_at, last_contact_at, score, status,
                   factors, expected_next_buoy_id, expected_window_start,
                   expected_window_end, is_active, low_confidence, updated_at
            FROM vessel_anomaly_scores
            WHERE is_active = TRUE
            ORDER BY score DESC, last_contact_at DESC
            '''
        )
    return [dict(row) for row in rows]


@router.get('/vessel/{vessel_id}')
async def vessel_detail(vessel_id: str) -> dict[str, object]:
    await _rebuild_and_score()
    pool = get_pool()
    async with pool.acquire() as conn:
        profile_row = await conn.fetchrow(
            'SELECT profile_json, trip_count, low_confidence, rebuilt_at FROM vessel_profiles WHERE vessel_id = $1',
            vessel_id,
        )
        score_row = await conn.fetchrow(
            '''
            SELECT vessel_id, trip_id, observed_at, last_contact_at, score, status,
                   factors, expected_next_buoy_id, expected_window_start,
                   expected_window_end, is_active, low_confidence, updated_at
            FROM vessel_anomaly_scores
            WHERE vessel_id = $1
            ORDER BY updated_at DESC
            LIMIT 1
            ''',
            vessel_id,
        )
    if profile_row is None or score_row is None:
        raise HTTPException(status_code=404, detail='vessel not found')
    return {'profile': dict(profile_row), 'score': dict(score_row)}


@router.post('/evaluate')
async def evaluate() -> dict[str, object]:
    rows = await _rebuild_and_score()
    return {'recomputed': len(rows), 'statuses': sorted({row['status'] for row in rows})}
