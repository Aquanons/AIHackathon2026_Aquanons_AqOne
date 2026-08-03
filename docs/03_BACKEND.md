# 03 — BACKEND (FastAPI)

Read `01_CONTRACTS.md` and `02_DATA_MODEL.md` first.

## Project layout

No file over ~400 lines. v1's 2,454-line `main.py` is where every hard bug hid.

```
backend/
  main.py              # app creation, middleware, router registration ONLY
  config.py            # env vars, fail fast on missing required ones
  db.py                # asyncpg pool
  envelope.py          # ok()/err() response helpers  <- use everywhere
  auth.py              # JWT, password hashing, dependencies
  permissions.py       # role -> permission matrix (single source of truth)
  routers/
    health.py
    auth.py
    sos.py
    ingest.py
  services/
    sos_service.py
    mesh_service.py    # signature verification, frame -> domain
  tests/
    test_health.py
    test_contracts.py  # canonical vector, envelope shape
    test_sos.py
    test_ingest.py
migrations/
scripts/
  create_demo_accounts.py
  provision_device.py
```

## `envelope.py` — copy verbatim, use everywhere

```python
"""The one response shape. See docs/01_CONTRACTS.md section 3.1."""
from typing import Any

from fastapi.responses import JSONResponse


def ok(data: dict[str, Any] | None = None, status: int = 200) -> JSONResponse:
    return JSONResponse({"ok": True, "data": data or {}}, status_code=status)


def err(code: str, message: str, status: int) -> JSONResponse:
    return JSONResponse(
        {"ok": False, "error": {"code": code, "message": message}},
        status_code=status,
    )
```

**Never return a bare dict or a bare list from a route.** A list always goes in
a named field inside `data`.

## `config.py`

```python
import os

from dotenv import load_dotenv

load_dotenv()


def _required(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"{name} is not set. See .env.example.")
    return value


DATABASE_URL         = _required("DATABASE_URL")
JWT_SECRET           = _required("JWT_SECRET")
GATEWAY_SECRET       = _required("AQONE_GATEWAY_SECRET")
JWT_EXPIRY_HOURS     = int(os.getenv("JWT_EXPIRY_HOURS", "12"))
MESH_TS_SKEW_SECONDS = int(os.getenv("MESH_TS_SKEW_SECONDS", "900"))
PORT                 = int(os.getenv("PORT", "8000"))
```

Every variable used anywhere must appear in `.env.example` with a comment.
v1 read nine variables and documented three; an unset one made a
correctly-behaving endpoint look broken.

## `permissions.py` — clients never duplicate this

```python
"""Single source of truth for authorisation. See docs/01_CONTRACTS.md 1.6."""

ROLE_PERMISSIONS: dict[str, set[str]] = {
    "fisherman": {"sos.create"},
    "mdrrmo":    {"sos.list", "sos.acknowledge"},
    "admin":     {"sos.create", "sos.list", "sos.acknowledge"},
}


def permissions_for(role: str) -> list[str]:
    return sorted(ROLE_PERMISSIONS.get(role, set()))


def has(role: str, permission: str) -> bool:
    return permission in ROLE_PERMISSIONS.get(role, set())
```

## `auth.py` — dependency

```python
from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from config import JWT_SECRET
from permissions import has

bearer = HTTPBearer(auto_error=False)


async def current_user(
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
) -> dict:
    if creds is None:
        raise HTTPException(401, "UNAUTHENTICATED")
    try:
        claims = jwt.decode(creds.credentials, JWT_SECRET, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(401, "UNAUTHENTICATED")
    return {"id": claims["sub"], "username": claims["username"], "role": claims["role"]}


def require(permission: str):
    async def _dep(user: Annotated[dict, Depends(current_user)]) -> dict:
        if not has(user["role"], permission):
            raise HTTPException(403, "FORBIDDEN")
        return user
    return _dep


CurrentUser = Annotated[dict, Depends(current_user)]
```

Usage: `async def list_sos(user: Annotated[dict, Depends(require("sos.list"))]):`

## Endpoints

### `GET /health/live`
No database access. Returns `{"ok": true, "data": {"status": "live"}}`.

### `GET /health/ready`
Verifies pool + required relations exist. **Verify names against
`02_DATA_MODEL.md`.**

```python
REQUIRED_RELATIONS = ["app_users", "vessels", "devices", "ingest_log", "sos"]

@router.get("/health/ready", include_in_schema=False)
async def health_ready():
    if db.pool is None:
        return err("NOT_READY", "database pool not initialised", 503)
    try:
        async with db.pool.acquire() as conn:
            await conn.fetchval("SELECT 1")
            missing = [
                r for r in REQUIRED_RELATIONS
                if await conn.fetchval("SELECT to_regclass($1)", f"public.{r}") is None
            ]
        if missing:
            return err("NOT_READY", f"missing relations: {missing}", 503)
    except Exception as exc:
        return err("NOT_READY", str(exc), 503)
    return ok({"status": "ready"})
```

Wire `healthcheckPath: "/health/ready"` in `railway.json`.

### `POST /api/login`

Request: `{"username": "demo_fisher", "password": "..."}`

Response `200`:
```json
{"ok": true, "data": {
  "token": "eyJ...",
  "user": {"id": "uuid", "username": "demo_fisher",
           "display_name": "Demo Fisher", "role": "fisherman",
           "permissions": ["sos.create"]}
}}
```
Failure: `401 UNAUTHENTICATED`. Same message for unknown user and bad password.

### `GET /api/me`
Returns the same `user` object. **Clients build their UI from `permissions`.**

### `POST /api/sos` — online path
Request:
```json
{"msg_id": "01J8Z...", "lat": 11.65159, "lon": 122.43286,
 "vessel_id": "uuid-or-null", "battery": 87,
 "submitted_at": "2026-08-04T09:15:30Z"}
```
- `msg_id` is client-generated so the online path is idempotent too.
- `user_id` comes from the token, **never** from the body.
- If `vessel_id` is supplied, verify the caller owns it, else `403`.
- `path` = `"online"`.

Response `201`: `{"ok": true, "data": {"sos": {...}}}`.
Replay of a known `msg_id` → `200` with the existing SOS.

### `GET /api/sos?limit=50`
Permission `sos.list`. Returns `{"ok": true, "data": {"sos": [...]}}` using the
feed query in `02_DATA_MODEL.md`.

### `POST /api/sos/{id}/acknowledge`
Permission `sos.acknowledge`. Uses the atomic conditional `UPDATE`. Zero rows →
`409 ALREADY_ACKNOWLEDGED`. Writes a `sos_events` row. Returns the updated SOS.

### `GET /api/sos/{id}/status`
Owner only. Minimal shape for the mobile app — no responder identity leaked
beyond a display name once acknowledged:
```json
{"ok": true, "data": {"status": "acknowledged",
 "submitted_at": "...", "acknowledged_at": "...",
 "responder_label": "MDRRMO New Washington"}}
```

### `GET /api/sos/stream` — SSE
Permission `sos.list`. Pushes `sos.created` / `sos.acknowledged` events.
Dashboard uses this instead of polling; v1 polled every 10s, which is latency a
distress feed shouldn't have. Send a comment heartbeat every 15s to keep the
connection alive through proxies.

### `POST /api/ingest/mesh` — the critical path

Header: `X-AqOne-Gateway-Secret`. Body: §4 of `01_CONTRACTS.md`.

Order of operations — do not reorder:

1. Compare gateway secret with `secrets.compare_digest`. Fail → `403`.
2. Look up `src` in `devices` where `revoked_at IS NULL`. Miss → `403 UNKNOWN_DEVICE`.
3. **Re-verify the HMAC independently.** Never trust the gateway's `sig_valid`.
   Fail → `403 BAD_SIGNATURE`.
4. Reject `ts` outside ±`MESH_TS_SKEW_SECONDS`. Fail → `422 VALIDATION_FAILED`.
5. `INSERT ... ON CONFLICT (msg_id) DO NOTHING` into `ingest_log`.
   No row → already processed → return `200` with the existing SOS.
6. Resolve `devices.user_id` / `devices.vessel_id` → internal UUIDs.
7. Insert `sos` (`path = 'mesh'`) + a `sos_events` `created` row, one transaction.
8. Publish to the SSE bus.
9. Return `201`.

Steps 2 and 6 are the **device adapter**. Its absence in v1 is why the gateway
rejected its own canonical example with `422: user_id must be a UUID`.

## Error handling

Never return exception text. v1 leaked driver internals in four places.

```python
@app.exception_handler(Exception)
async def unhandled(request, exc):
    logger.exception("unhandled error on %s", request.url.path)
    return err("INTERNAL", "An internal error occurred.", 500)
```

## CORS

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=[DASHBOARD_ORIGIN],   # exact origin, not "*"
    allow_credentials=False,            # bearer tokens, not cookies
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type"],
)
```

## Tests that must exist

```python
def test_response_envelope_shape():
    """Every 2xx body has ok=True and a dict under data."""

def test_canonical_mesh_vector_ingests():
    """The vector in 01_CONTRACTS.md 2.4 produces exactly one SOS."""

def test_replayed_msg_id_creates_no_second_sos():
    """Same msg_id twice -> 200, one row."""

def test_bad_signature_rejected():
    """Tampered frame -> 403 BAD_SIGNATURE, no ingest_log row."""

def test_unknown_device_rejected():
    """src not in devices -> 403 UNKNOWN_DEVICE."""

def test_acknowledge_twice_conflicts():
    """Second acknowledge -> 409 ALREADY_ACKNOWLEDGED."""

def test_fisherman_cannot_list_sos():
    """Role without sos.list -> 403 FORBIDDEN."""

def test_health_ready_relations_exist_in_migrations():
    """Cross-check REQUIRED_RELATIONS against migrations/*.sql.
    v1 shipped a health check naming a table that never existed and it
    failed the deploy of a healthy app."""
```

Fake-DB unit tests cannot verify SQL. Run at least the ingest and acknowledge
tests against a **real Postgres** (docker-compose service). v1 had 38 green
tests against fake connections while real behaviour was broken.

## Deployment (Railway)

`Dockerfile` at repo root — one Dockerfile only. v1 had two that disagreed.

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ ./
COPY migrations/ ./migrations/
COPY web/ ./web/
CMD ["sh", "-c", "python migrate.py && uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
```

`railway.json`:
```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": { "builder": "DOCKERFILE", "dockerfilePath": "Dockerfile" },
  "deploy": {
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 3,
    "healthcheckPath": "/health/ready",
    "healthcheckTimeout": 30
  }
}
```

Static paths must work in **both** the container and local dev — check the
container path first, then a repo-relative fallback, and log a warning if
neither exists. v1 hardcoded only the container path, so `/admin/...` 404'd
locally, which is what pushed people into opening HTML over `file://`.

Deploy in hour one and keep it green.
