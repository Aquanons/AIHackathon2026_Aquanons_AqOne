from __future__ import annotations

import hmac
import os

from fastapi import APIRouter, Depends, Header, HTTPException

from app.db import get_pool
from app.demo.scenarios import get_state, reset

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


@router.post('/reset', dependencies=[Depends(require_demo_key)])
async def reset_demo() -> dict[str, object]:
    state = get_state()
    if state.run_id is None:
        return {'status': 'reset', 'run_id': None, 'deleted': {}}
    deleted = await reset(get_pool(), state.run_id)
    return {'status': 'reset', **deleted}
