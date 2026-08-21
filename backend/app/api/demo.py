from __future__ import annotations

import hmac
import os

from fastapi import APIRouter, Depends, Header, HTTPException, Query

from app.db import get_pool
from app.demo.scenarios import advance, fire_beat, get_state, reset, start_scenario
from app.demo.weather import coordinates, forecast, marine

router = APIRouter(prefix='/api/demo', tags=['demo'])


def _demo_enabled() -> bool:
    return os.environ.get('DEMO_MODE', '').strip().lower() in {'1', 'true', 'yes', 'on'}


async def require_demo_key(
    demo_key: str | None = Header(default=None, alias='X-Demo-Key'),
) -> None:
    configured_key = os.environ.get('DEMO_CONTROL_KEY', '')
    if not configured_key or demo_key is None or not hmac.compare_digest(demo_key, configured_key):
        raise HTTPException(status_code=403, detail='invalid demo key')


@router.get('/state', dependencies=[Depends(require_demo_key)])
async def state() -> dict[str, object]:
    return get_state().response()


@router.post('/scenario/{name}/start', dependencies=[Depends(require_demo_key)])
async def start(name: str) -> dict[str, object]:
    try:
        return await start_scenario(name)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post('/beat/{index}', dependencies=[Depends(require_demo_key)])
async def beat(index: int) -> dict[str, object]:
    try:
        return await fire_beat(index)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.post('/advance', dependencies=[Depends(require_demo_key)])
async def advance_demo() -> dict[str, object]:
    try:
        return await advance()
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.post('/reset', dependencies=[Depends(require_demo_key)])
async def reset_demo() -> dict[str, object]:
    state = get_state()
    if state.run_id is None:
        return {'status': 'reset', 'deleted': {}, **state.response()}
    deleted = await reset(get_pool(), state.run_id)
    return {'status': 'reset', 'deleted': deleted, **get_state().response()}


def _weather_cells(latitude: str | None, longitude: str | None) -> list[tuple[float, float]]:
    try:
        return coordinates(latitude, longitude)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


def _active_beat() -> int:
    state = get_state()
    if state.run_id is None:
        raise HTTPException(status_code=409, detail='no demo scenario is active')
    return state.beat


@router.get('/weather/forecast')
async def weather_forecast(
    latitude: str | None = Query(default=None),
    longitude: str | None = Query(default=None),
) -> list[dict[str, dict[str, float | int | str]]]:
    return forecast(_active_beat(), _weather_cells(latitude, longitude))


@router.get('/weather/marine')
async def weather_marine(
    latitude: str | None = Query(default=None),
    longitude: str | None = Query(default=None),
) -> list[dict[str, dict[str, float | int | str]]]:
    return marine(_active_beat(), _weather_cells(latitude, longitude))
