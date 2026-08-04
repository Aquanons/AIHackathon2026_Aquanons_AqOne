from fastapi import FastAPI, HTTPException

from app.api.anomaly import router as anomaly_router
from app.api.drift import router as drift_router
from app.api.squall import router as squall_router
from app.db import get_pool, shutdown_db, startup_db

app = FastAPI()
app.include_router(anomaly_router)
app.include_router(drift_router)
app.include_router(squall_router)


@app.on_event('startup')
async def _startup() -> None:
    await startup_db()


@app.on_event('shutdown')
async def _shutdown() -> None:
    await shutdown_db()


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
