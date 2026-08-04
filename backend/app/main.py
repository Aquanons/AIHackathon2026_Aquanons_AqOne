from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles

from app.api.anomaly import router as anomaly_router
from app.api.auth import router as auth_router
from app.api.drift import router as drift_router
from app.api.metrics import router as metrics_router
from app.api.sea_condition import router as sea_condition_router
from app.api.sos import protected_router as sos_read_router
from app.api.sos import router as sos_ingest_router
from app.api.squall import router as squall_router
from app.auth import require_user
from app.db import get_pool, shutdown_db, startup_db

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):
    await startup_db()
    yield
    await shutdown_db()


app = FastAPI(lifespan=lifespan)

# Routers are registered BEFORE the static mount below. Starlette matches
# routes in registration order, so mounting the dashboard at "/" first would
# shadow every API path - including /health/ready, which would turn the
# Railway healthcheck red for reasons that look unrelated to this file.
# Auth is the only unauthenticated API surface: /api/login, /api/admin-signup
# (itself gated by ADMIN_SETUP_KEY) and /api/me, which authenticates itself.
app.include_router(auth_router)

# SOS ingest is intentionally unauthenticated - see app/api/sos.py. A handset in
# distress has no token, and the LoRa gateway relays frames it cannot
# authenticate. Reading and acknowledging SOS events stays protected.
app.include_router(sos_ingest_router)

# Everything else requires a valid bearer token. Declaring it here rather than
# on each route means a newly added endpoint is protected by default - the safe
# direction to fail.
_protected = [Depends(require_user)]
app.include_router(anomaly_router, dependencies=_protected)
app.include_router(drift_router, dependencies=_protected)
app.include_router(squall_router, dependencies=_protected)
app.include_router(sea_condition_router, dependencies=_protected)
app.include_router(metrics_router, dependencies=_protected)
app.include_router(sos_read_router, dependencies=_protected)


@app.get('/healthz')
async def healthz() -> dict[str, str]:
    return {'status': 'ok'}


@app.get('/health/ready')
async def ready() -> dict[str, str]:
    try:
        pool = get_pool()
        async with pool.acquire() as conn:
            await conn.fetchval('SELECT 1')
    except Exception as exc:
        raise HTTPException(status_code=503, detail='database not ready') from exc

    return {'status': 'ok'}


def _resolve_web_dir() -> Path | None:
    """Locate the dashboard directory in both the container and a local checkout.

    This file lives at <root>/backend/app/main.py, and the Dockerfile copies
    web/ to the matching place inside the image, so parents[2]/web covers both.
    The second candidate is a fallback for layouts that nest web/ under
    backend/. A missing directory silently skips the mount and produces 404s
    with no obvious cause, so the failure is logged loudly rather than passed
    over.
    """
    here = Path(__file__).resolve()
    candidates = [here.parents[2] / 'web', here.parents[1] / 'web']
    for candidate in candidates:
        if candidate.is_dir():
            return candidate
    logger.warning(
        'Dashboard not mounted: no web directory found. Tried: %s',
        ', '.join(str(c) for c in candidates),
    )
    return None


_web_dir = _resolve_web_dir()
if _web_dir is not None:
    # Mounted last, at the root, with html=True so "/" serves web/index.html
    # and the existing relative asset paths in the HTML keep resolving.
    app.mount('/', StaticFiles(directory=str(_web_dir), html=True), name='web')
