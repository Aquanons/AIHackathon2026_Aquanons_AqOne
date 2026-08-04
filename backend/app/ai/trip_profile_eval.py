from __future__ import annotations

import asyncio
import json
import os
from collections import defaultdict
from datetime import timedelta

import asyncpg

from app.ai.trip_profile import ContactPoint, build_profiles_from_contacts, score_trip


async def _load_rows(database_url: str) -> tuple[list[dict[str, object]], list[dict[str, object]]]:
    conn = await asyncpg.connect(database_url)
    try:
        rows = await conn.fetch(
            '''
            SELECT bc.vessel_id, bc.trip_id, bc.buoy_id, bc.observed_at, bc.latitude, bc.longitude
            FROM buoy_contacts bc
            JOIN buoys b ON b.id = bc.buoy_id
            WHERE bc.is_synthetic = TRUE
            ORDER BY bc.vessel_id, bc.trip_id, bc.observed_at
            '''
        )
        incidents = await conn.fetch(
            'SELECT vessel_id, last_contact_at FROM incidents WHERE is_synthetic = TRUE ORDER BY id'
        )
    finally:
        await conn.close()
    return [dict(row) for row in rows], [dict(row) for row in incidents]


def _group(rows: list[dict[str, object]]) -> dict[tuple[str, str], list[ContactPoint]]:
    grouped: dict[tuple[str, str], list[ContactPoint]] = defaultdict(list)
    for row in rows:
        grouped[(str(row['vessel_id']), str(row['trip_id']))].append(
            ContactPoint(
                buoy_id=str(row['buoy_id']),
                observed_at=row['observed_at'],
                latitude=float(row['latitude']),
                longitude=float(row['longitude']),
            )
        )
    for contacts in grouped.values():
        contacts.sort(key=lambda item: item.observed_at)
    return grouped


async def main() -> None:
    database_url = os.environ.get('DATABASE_URL')
    if not database_url:
        raise RuntimeError('DATABASE_URL is required')

    rows, incidents = await _load_rows(database_url)
    profiles = build_profiles_from_contacts(rows)
    grouped = _group(rows)
    incident_index = {(row['vessel_id'], row['last_contact_at']) for row in incidents}

    latencies: list[float] = []
    false_alarms = 0
    normal_trips = 0
    factor_example = None

    for (vessel_id, _), contacts in grouped.items():
        profile = profiles[vessel_id]
        is_incident = (vessel_id, contacts[-1].observed_at) in incident_index
        if is_incident:
            last = contacts[-1]
            for minutes in range(0, 12 * 60 + 1, 5):
                as_of = last.observed_at + timedelta(minutes=minutes)
                score = score_trip(profile, contacts, as_of=as_of)
                if score.status == 'alert':
                    latencies.append(float(minutes))
                    if factor_example is None:
                        factor_example = score
                    break
        else:
            normal_trips += 1
            alert = False
            for idx in range(1, len(contacts) + 1):
                as_of = contacts[idx - 1].observed_at
                score = score_trip(profile, contacts[:idx], as_of=as_of)
                if score.status == 'alert':
                    alert = True
                    break
            if alert:
                false_alarms += 1

    median_latency = 0.0 if not latencies else sorted(latencies)[len(latencies) // 2]
    false_alarm_rate = 0.0 if normal_trips == 0 else false_alarms / normal_trips
    print(f'median_detection_latency_minutes: {median_latency:.1f}')
    print(f'false_alarm_rate: {false_alarm_rate:.3%}')
    if factor_example is not None:
        print('factor_breakdown_example:')
        print(json.dumps(factor_example.to_response()['factors'], indent=2))


if __name__ == '__main__':
    asyncio.run(main())
