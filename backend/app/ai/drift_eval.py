from __future__ import annotations

import asyncio
import json
import os

import asyncpg

from app.ai.current_field import create_current_field_factory
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

    try:
        pool = await asyncpg.create_pool(database_url)
    except Exception:
        pool = None

    current_fn = None
    if pool is not None:
        try:
            current_fn = await create_current_field_factory(pool)
        except Exception:
            current_fn = None

    contained = 0
    excluded_low_quality = 0
    area_factors: list[float] = []
    runtimes: list[float] = []
    observation_fractions: list[float] = []
    for row in incidents:
        track = row['true_track']
        if isinstance(track, str):
            track = json.loads(track)
        if len(track) < 2:
            # A single-point track carries no drift distance to evaluate
            # containment or area reduction against - not evidence either
            # way, so it is excluded rather than silently dropped from the
            # denominator (docs/40 Phase 5 item 1 "excluded low-quality
            # runs").
            excluded_low_quality += 1
            continue

        forecast_hours = (len(track) - 1) * 0.5

        predict_kwargs: dict[str, object] = dict(
            last_lat=float(row['last_contact_lat']),
            last_lon=float(row['last_contact_lon']),
            observed_at=row['last_contact_at'],
            object_class=_incident_class(str(row['abnormal_reason'])),
            forecast_hours=forecast_hours,
            wind_provider=_synthetic_wind_series,
        )
        if current_fn is not None:
            predict_kwargs['current_vector_fn'] = current_fn

        prediction = predict_drift(**predict_kwargs)  # type: ignore[arg-type]
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
        if current_fn is not None:
            observation_fractions.append(getattr(current_fn, 'observation_fraction', 0.0))

    if pool is not None:
        await pool.close()

    evaluated = len(incidents) - excluded_low_quality
    if evaluated == 0:
        print('containment_rate: n/a (0 incidents cleared the minimum track length)')
        print(f'excluded_low_quality_runs: {excluded_low_quality}')
        return

    containment_rate = contained / evaluated
    reduction_factor = sum(area_factors) / len(area_factors)
    runtime_ms = sum(runtimes) / len(runtimes)
    avg_obs_fraction = sum(observation_fractions) / len(observation_fractions) if observation_fractions else 0.0
    print(f'containment_rate: {containment_rate:.3%}')
    print(f'search_area_reduction_factor: {reduction_factor:.2f}x')
    print(f'prediction_runtime_ms: {runtime_ms:.3f}')
    print(f'observation_fraction: {avg_obs_fraction:.3%}')
    print(f'excluded_low_quality_runs: {excluded_low_quality}')
    write_section(
        'drift',
        {
            'containment_rate': containment_rate,
            'search_area_reduction_factor': reduction_factor,
            'prediction_runtime_ms': runtime_ms,
            'incidents_evaluated': evaluated,
            'excluded_low_quality_runs': excluded_low_quality,
            'observation_fraction': avg_obs_fraction,
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
