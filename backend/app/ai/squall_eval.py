from __future__ import annotations

import asyncio
import os

import asyncpg

from app.ai.eval_store import write_section
from app.ai.squall import build_buoys, save_bundle, train_from_rows


async def _load_rows(
    database_url: str,
) -> tuple[list[dict[str, object]], list[dict[str, object]], list[dict[str, object]]]:
    conn = await asyncpg.connect(database_url)
    try:
        readings = await conn.fetch(
            '''
            SELECT buoy_id, observed_at, pressure_hpa
            FROM barometric_readings
            WHERE is_synthetic = TRUE
            ORDER BY observed_at, buoy_id
            '''
        )
        squalls = await conn.fetch(
            '''
            SELECT id, started_at, peak_at, ended_at, center_lat, center_lon,
                   front_origin_lat, front_origin_lon, bearing_deg, speed_kph,
                   pressure_drop_hpa, rise_minutes, hold_minutes, observed_buoy_ids
            FROM squall_events
            WHERE is_synthetic = TRUE
            ORDER BY started_at
            '''
        )
        buoys = await conn.fetch(
            '''
            SELECT id, lat, lon, contact_radius_m
            FROM buoys
            WHERE is_synthetic = TRUE
            ORDER BY id
            '''
        )
    finally:
        await conn.close()
    return [dict(row) for row in readings], [dict(row) for row in squalls], [dict(row) for row in buoys]


async def main() -> None:
    database_url = os.environ.get('DATABASE_URL')
    if not database_url:
        raise RuntimeError('DATABASE_URL is required')

    readings, squalls, buoy_rows = await _load_rows(database_url)
    if not readings or not squalls:
        print('precision: 0.000')
        print('recall: 0.000')
        print('mean_lead_time: 0.000')
        print('top_features: []')
        return

    bundle, metrics = train_from_rows(readings, squalls, build_buoys(buoy_rows))
    save_bundle(bundle)
    print(f"precision: {metrics['precision']:.3f}")
    print(f"recall: {metrics['recall']:.3f}")
    print(f"mean_lead_time: {metrics['mean_lead_time']:.3f}")
    print(f'top_features: {bundle.top_features}')
    write_section(
        'squall',
        {
            'precision': metrics['precision'],
            'recall': metrics['recall'],
            'mean_lead_time_minutes': metrics['mean_lead_time'],
            'top_features': bundle.top_features,
        },
    )


if __name__ == '__main__':
    asyncio.run(main())
