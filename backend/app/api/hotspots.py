from __future__ import annotations

import math
from collections import defaultdict
from collections.abc import Iterable, Mapping
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter

from app.db import get_pool

router = APIRouter(prefix='/api/public/hotspots', tags=['public'])

CELL_SIZE_DEGREES = 0.02
MIN_REPORTERS = 3
WINDOW_DAYS = 30
MAX_CELLS = 40


def aggregate_hotspots(
    rows: Iterable[Mapping[str, Any]],
) -> list[dict[str, object]]:
    vessel_counts: dict[tuple[int, int], dict[str, int]] = defaultdict(
        lambda: defaultdict(int)
    )
    for row in rows:
        lat = float(row['latitude'])
        lon = float(row['longitude'])
        if not (-90 <= lat <= 90 and -180 <= lon <= 180):
            continue
        cell = (
            math.floor(lat / CELL_SIZE_DEGREES),
            math.floor(lon / CELL_SIZE_DEGREES),
        )
        vessel_counts[cell][str(row['vessel_id'])] += 1

    eligible = [
        (cell, counts)
        for cell, counts in vessel_counts.items()
        if len(counts) >= MIN_REPORTERS
    ]
    if not eligible:
        return []

    max_reporters = max(len(counts) for _, counts in eligible)
    max_capped_observations = max(
        sum(min(count, 3) for count in counts.values())
        for _, counts in eligible
    )
    cells: list[dict[str, object]] = []
    for (lat_bin, lon_bin), counts in eligible:
        reporters = len(counts)
        observations = sum(counts.values())
        capped_observations = sum(min(count, 3) for count in counts.values())
        score = (
            0.7 * reporters / max_reporters
            + 0.3 * capped_observations / max_capped_observations
        )
        cells.append(
            {
                'center_lat': round((lat_bin + 0.5) * CELL_SIZE_DEGREES, 5),
                'center_lon': round((lon_bin + 0.5) * CELL_SIZE_DEGREES, 5),
                'cell_size_degrees': CELL_SIZE_DEGREES,
                'score': round(score, 3),
                'observations': observations,
            }
        )
    cells.sort(key=lambda cell: (-float(cell['score']), -int(cell['observations'])))
    return cells[:MAX_CELLS]


@router.get('')
async def public_hotspots() -> dict[str, object]:
    pool = get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            '''
            SELECT vessel_id, latitude, longitude
            FROM catch_logs
            WHERE share_for_hotspots = TRUE
              AND latitude IS NOT NULL
              AND longitude IS NOT NULL
              AND catch_date >= CURRENT_DATE - $1::integer
            ORDER BY catch_date DESC, created_at DESC
            LIMIT 20000
            ''',
            WINDOW_DAYS,
        )
    return {
        'generated_at': datetime.now(UTC).isoformat(),
        'model_version': 'catch-density-v1',
        'min_reporters': MIN_REPORTERS,
        'window_days': WINDOW_DAYS,
        'cells': aggregate_hotspots(rows),
    }
