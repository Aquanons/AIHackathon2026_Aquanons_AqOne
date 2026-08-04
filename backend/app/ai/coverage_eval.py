"""Evaluate buoy coverage of the municipal water area.

Loads buoy positions and radii from the database, computes WiFi and LoRa
coverage fractions, and writes the results to eval_results.json so they
appear in the SAR Metrics tab.

Usage:
    python -m app.ai.coverage_eval
"""

from __future__ import annotations

import asyncio
import os

import asyncpg

from app.ai.coverage import compute_coverage
from app.ai.eval_store import write_section


async def main() -> None:
    database_url = os.environ.get('DATABASE_URL')
    if not database_url:
        raise RuntimeError('DATABASE_URL is required')

    conn = await asyncpg.connect(database_url)
    try:
        rows = await conn.fetch(
            '''
            SELECT lat, lon, contact_radius_m, lora_radius_m
            FROM buoys
            WHERE lat IS NOT NULL AND lon IS NOT NULL
            '''
        )
    finally:
        await conn.close()

    if not rows:
        print('wifi_coverage: 0.000%')
        print('lora_coverage: 0.000%')
        print('water_area_km2: 0.000')
        return

    buoys = [
        {
            'lat': float(row['lat']),
            'lon': float(row['lon']),
            'contact_radius_m': row['contact_radius_m'] or 0,
            'lora_radius_m': row['lora_radius_m'] or 0,
        }
        for row in rows
    ]

    result = compute_coverage(buoys)

    print(f'wifi_coverage: {result["wifi_coverage"]:.3%}')
    print(f'lora_coverage: {result["lora_coverage"]:.3%}')
    print(f'water_area_km2: {result["water_area_km2"]:.3f}')
    print(f'n_samples: {result["n_samples"]}')

    write_section(
        'coverage',
        {
            'wifi_coverage': result['wifi_coverage'],
            'lora_coverage': result['lora_coverage'],
            'water_area_km2': result['water_area_km2'],
            'n_samples': result['n_samples'],
        },
    )


if __name__ == '__main__':
    asyncio.run(main())
