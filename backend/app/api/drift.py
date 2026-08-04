from __future__ import annotations

import json
from datetime import datetime

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.ai.drift import ObjectClass, predict_drift
from app.db import get_pool

router = APIRouter(prefix='/api/ai/drift', tags=['drift'])


class DriftPredictRequest(BaseModel):
    last_lat: float = Field(..., ge=-90, le=90)
    last_lon: float = Field(..., ge=-180, le=180)
    observed_at: datetime
    object_class: ObjectClass
    forecast_hours: float = Field(24.0, gt=0, le=72)
    particle_count: int = Field(2000, ge=100, le=10000)
    step_minutes: int = Field(10, ge=1, le=60)


def _incident_class(abnormal_reason: str) -> ObjectClass:
    if abnormal_reason in {'capsize', 'adverse_weather'}:
        return ObjectClass.swamped_banca
    return ObjectClass.intact_hull_adrift


@router.post('/predict')
async def predict(body: DriftPredictRequest) -> dict[str, object]:
    result = predict_drift(
        last_lat=body.last_lat,
        last_lon=body.last_lon,
        observed_at=body.observed_at,
        object_class=body.object_class,
        forecast_hours=body.forecast_hours,
        particle_count=body.particle_count,
        step_minutes=body.step_minutes,
    )
    return result.to_dict()


@router.get('/incidents')
async def incidents() -> list[dict[str, object]]:
    pool = get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            '''
            SELECT id, vessel_id, last_contact_at, last_contact_lat, last_contact_lon,
                   abnormal_reason, is_synthetic
            FROM incidents
            ORDER BY last_contact_at DESC, id DESC
            '''
        )
    return [
        {
            'id': row['id'],
            'vessel_id': row['vessel_id'],
            'last_contact_at': row['last_contact_at'].isoformat(),
            'last_contact_lat': float(row['last_contact_lat']),
            'last_contact_lon': float(row['last_contact_lon']),
            'abnormal_reason': row['abnormal_reason'],
            'is_synthetic': row['is_synthetic'],
        }
        for row in rows
    ]


@router.get('/incident/{incident_id}')
async def incident_prediction(incident_id: int, forecast_hours: float = 24.0) -> dict[str, object]:
    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            '''
            SELECT id, vessel_id, last_contact_at, last_contact_lat, last_contact_lon,
                   abnormal_reason, true_track, is_synthetic
            FROM incidents
            WHERE id = $1
            ''',
            incident_id,
        )
    if row is None:
        raise HTTPException(status_code=404, detail='incident not found')

    true_track = row['true_track']
    if isinstance(true_track, str):
        true_track = json.loads(true_track)

    result = predict_drift(
        last_lat=float(row['last_contact_lat']),
        last_lon=float(row['last_contact_lon']),
        observed_at=row['last_contact_at'],
        object_class=_incident_class(str(row['abnormal_reason'])),
        forecast_hours=forecast_hours,
    )
    return {
        'incident': {
            'id': row['id'],
            'vessel_id': row['vessel_id'],
            'last_contact_at': row['last_contact_at'].isoformat(),
            'last_contact_lat': float(row['last_contact_lat']),
            'last_contact_lon': float(row['last_contact_lon']),
            'abnormal_reason': row['abnormal_reason'],
            'is_synthetic': row['is_synthetic'],
        },
        'prediction': result.to_dict(),
        'ground_truth_track': true_track,
    }
