from __future__ import annotations

import asyncio
import json
import os

import asyncpg

from app.ai.drift import (
    ObjectClass,
    _synthetic_wind_series,
    contour_contains,
    max_radius_m,
    predict_drift,
)
from app.ai.eval_store import write_section


def _incident_class(abnormal_reason: str) -> ObjectClass:
    if abnormal_reason in {'capsize', 'adverse_weather'}:
        return ObjectClass.swamped_banca
    return ObjectClass.intact_hull_adrift


async def _load_incidents(database_url: str) -> list[asyncpg.Record]:
    conn = await asyncpg.connect(database_url)
    try:
        rows = await conn.fetch(
            '''
            SELECT id, vessel_id, last_contact_at, last_contact_lat, last_contact_lon,
                   abnormal_reason, true_track
            FROM incidents
            WHERE is_synthetic = TRUE
            ORDER BY id
            '''
        )
    finally:
        await conn.close()
    return list(rows)


async def main() -> None:
    database_url = os.environ.get('DATABASE_URL')
    if not database_url:
        raise RuntimeError('DATABASE_URL is required')

    incidents = await _load_incidents(database_url)
    if not incidents:
        print('containment_rate: 0.000%')
        print('search_area_reduction_factor: 0.00x')
        print('prediction_runtime_ms: 0.000')
        return

    contained = 0
    area_factors: list[float] = []
    runtimes: list[float] = []
    for row in incidents:
        track = row['true_track']
        if isinstance(track, str):
            track = json.loads(track)
        if len(track) < 2:
            continue

        # Forecast exactly as far as the ground-truth track actually ran.
        #
        # Tracks terminate early when a drifting object beaches, so a fixed
        # 24-hour horizon was comparing a full-day contour against a truth
        # position recorded after, say, three hours. That mismatch - not the
        # model - is what produced a 0% containment rate.
        #
        # Track samples are TRACK_STEP (30 min) apart, so n samples span
        # (n - 1) / 2 hours.
        forecast_hours = (len(track) - 1) * 0.5

        prediction = predict_drift(
            last_lat=float(row['last_contact_lat']),
            last_lon=float(row['last_contact_lon']),
            observed_at=row['last_contact_at'],
            object_class=_incident_class(str(row['abnormal_reason'])),
            forecast_hours=forecast_hours,
            wind_provider=_synthetic_wind_series,
        )
        runtimes.append(prediction.runtime_ms)
        true_point = track[-1]
        if contour_contains(prediction.contours[-1], float(true_point['lat']), float(true_point['lon'])):
            contained += 1
        area_factors.append(
            _area_reduction_factor(
                prediction,
                float(row['last_contact_lat']),
                float(row['last_contact_lon']),
            )
        )

    containment_rate = contained / len(incidents)
    reduction_factor = sum(area_factors) / len(area_factors)
    runtime_ms = sum(runtimes) / len(runtimes)
    print(f'containment_rate: {containment_rate:.3%}')
    print(f'search_area_reduction_factor: {reduction_factor:.2f}x')
    print(f'prediction_runtime_ms: {runtime_ms:.3f}')
    write_section(
        'drift',
        {
            'containment_rate': containment_rate,
            'search_area_reduction_factor': reduction_factor,
            'prediction_runtime_ms': runtime_ms,
            'incidents_evaluated': len(incidents),
        },
    )


def _area_reduction_factor(prediction, last_lat: float, last_lon: float) -> float:
    final_radius = max_radius_m(prediction, last_lat, last_lon)
    baseline_area = 3.141592653589793 * final_radius * final_radius
    contour = prediction.contours[-1]['geometry']['coordinates'][0]
    area = abs(_polygon_area_m2(contour))
    if area <= 1e-9:
        return 1.0
    return baseline_area / area


def _polygon_area_m2(ring: list[list[float]]) -> float:
    if len(ring) < 4:
        return 0.0
    lon0, lat0 = ring[0]
    x = []
    y = []
    for lon, lat in ring:
        x.append((lon - lon0) * 111_320.0)
        y.append((lat - lat0) * 110_574.0)
    area = 0.0
    for i in range(len(ring) - 1):
        area += x[i] * y[i + 1] - x[i + 1] * y[i]
    return abs(area) / 2.0


if __name__ == '__main__':
    asyncio.run(main())
