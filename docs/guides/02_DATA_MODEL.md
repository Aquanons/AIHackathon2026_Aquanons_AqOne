# 02 — DATA MODEL

**Schema lives here and in `migrations/` only.** Never write `CREATE TABLE` in
application code. In the previous build the schema existed in three places, and
a fix applied to one was a bug preserved in another for weeks.

Every table below has a writer. If you find yourself creating a table nothing
inserts into, stop — v1 had three orphan tables and one of them silently broke
the vessel panel because a view inner-joined it.

---

## Migration rules

- Files are `migrations/NNN_name.sql`, applied in filename order, once.
- Migrations are **append-only**. Never edit an applied migration; add a new one.
- Every migration must be safe to run against a database that already has data.
- Any `CREATE UNIQUE INDEX` must be preceded by a reconciliation statement that
  removes existing duplicates. (v1's migration 006 didn't, which could abort the
  migration transaction and prevent the container from starting.)

---

## `migrations/001_initial.sql`

```sql
-- AqOne v2 — initial schema
-- Requires PostGIS for geography types.

CREATE EXTENSION IF NOT EXISTS postgis;

-- ---------------------------------------------------------------------------
-- Roles and users
-- ---------------------------------------------------------------------------

CREATE TABLE roles (
    name        TEXT PRIMARY KEY          -- 'fisherman' | 'mdrrmo' | 'admin'
);

INSERT INTO roles (name) VALUES ('fisherman'), ('mdrrmo'), ('admin');

CREATE TABLE app_users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username      TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,          -- bcrypt
    role          TEXT NOT NULL REFERENCES roles(name),
    display_name  TEXT NOT NULL,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_username_lower ON app_users (LOWER(username));

-- ---------------------------------------------------------------------------
-- Vessels
-- ---------------------------------------------------------------------------

CREATE TABLE vessels (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id   UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    is_active  BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_vessels_owner ON vessels (owner_id);

-- ---------------------------------------------------------------------------
-- Device registry — the external-ID -> internal-UUID adapter.
-- This is the layer whose absence caused the gateway to reject its own
-- canonical example with "422: user_id must be a UUID".
-- ---------------------------------------------------------------------------

CREATE TABLE devices (
    external_id  TEXT PRIMARY KEY,        -- 12-char lowercase hex, e.g. '7f3a2b1c9d40'
    kind         TEXT NOT NULL,           -- 'buoy' | 'vessel_phone' | 'gateway'
    shared_key   BYTEA NOT NULL,          -- 32 bytes, HMAC-SHA256 key
    user_id      UUID REFERENCES app_users(id) ON DELETE SET NULL,
    vessel_id    UUID REFERENCES vessels(id) ON DELETE SET NULL,
    label        TEXT,
    lat          DOUBLE PRECISION,        -- fixed position, buoys only
    lon          DOUBLE PRECISION,
    revoked_at   TIMESTAMPTZ,             -- non-null = key revoked, reject all
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT devices_kind_valid CHECK (kind IN ('buoy','vessel_phone','gateway'))
);

CREATE INDEX idx_devices_active ON devices (external_id) WHERE revoked_at IS NULL;

-- ---------------------------------------------------------------------------
-- Ingest log — idempotency + audit. Written before any domain effect.
-- ---------------------------------------------------------------------------

CREATE TABLE ingest_log (
    msg_id       TEXT PRIMARY KEY,        -- ULID from the device. Idempotency key.
    src          TEXT NOT NULL,
    msg_type     TEXT NOT NULL,
    received_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    device_ts    TIMESTAMPTZ NOT NULL,
    hops         SMALLINT,
    raw          JSONB NOT NULL
);

CREATE INDEX idx_ingest_received ON ingest_log (received_at DESC);

-- ---------------------------------------------------------------------------
-- SOS — append-only event log plus a current-state projection.
-- The log is the audit trail: "prove the alert was delivered" must be
-- answerable for a system that dispatches emergency response.
-- ---------------------------------------------------------------------------

CREATE TABLE sos_events (
    id           BIGSERIAL PRIMARY KEY,
    sos_id       UUID NOT NULL,
    event_type   TEXT NOT NULL,           -- 'created' | 'acknowledged'
    actor_id     UUID REFERENCES app_users(id) ON DELETE SET NULL,
    payload      JSONB NOT NULL DEFAULT '{}'::jsonb,
    occurred_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT sos_events_type_valid CHECK (event_type IN ('created','acknowledged'))
);

CREATE INDEX idx_sos_events_sos ON sos_events (sos_id, occurred_at);

CREATE TABLE sos (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    msg_id             TEXT UNIQUE REFERENCES ingest_log(msg_id),
                       -- NULL for SOS created over the online path
    user_id            UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    vessel_id          UUID REFERENCES vessels(id) ON DELETE SET NULL,
    device_external_id TEXT REFERENCES devices(external_id),
    lat                DOUBLE PRECISION NOT NULL,
    lon                DOUBLE PRECISION NOT NULL,
    geom               GEOGRAPHY(POINT, 4326),
    battery            SMALLINT,
    path               TEXT NOT NULL,     -- 'mesh' | 'online'
    status             TEXT NOT NULL DEFAULT 'active',
    submitted_at       TIMESTAMPTZ NOT NULL,
    committed_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    acknowledged_at    TIMESTAMPTZ,
    acknowledged_by    UUID REFERENCES app_users(id) ON DELETE SET NULL,

    CONSTRAINT sos_status_valid CHECK (status IN ('active','acknowledged')),
    CONSTRAINT sos_path_valid   CHECK (path IN ('mesh','online')),
    CONSTRAINT sos_ack_coherent CHECK (
        (status = 'active'       AND acknowledged_at IS NULL AND acknowledged_by IS NULL)
     OR (status = 'acknowledged' AND acknowledged_at IS NOT NULL)
    )
);

CREATE INDEX idx_sos_active   ON sos (submitted_at DESC) WHERE status = 'active';
CREATE INDEX idx_sos_user     ON sos (user_id, submitted_at DESC);
CREATE INDEX idx_sos_geom     ON sos USING GIST (geom);

-- Keep geom in sync with lat/lon automatically.
CREATE OR REPLACE FUNCTION sync_sos_geom() RETURNS trigger AS $$
BEGIN
    NEW.geom := ST_SetSRID(ST_MakePoint(NEW.lon, NEW.lat), 4326)::geography;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_sos_geom
    BEFORE INSERT OR UPDATE OF lat, lon ON sos
    FOR EACH ROW EXECUTE FUNCTION sync_sos_geom();
```

---

## `migrations/002_demo_seed.sql`

Demo accounts are **environment-driven**, not hardcoded here. This migration
seeds only reference data that is safe to commit.

```sql
-- Nothing user-facing is seeded. Demo accounts are provisioned by
-- scripts/create_demo_accounts.py from environment variables so that no
-- credential ever enters the repository.
SELECT 1;
```

---

## Table-by-table: who writes it

Required reading before adding any table.

| Table | Written by |
|---|---|
| `roles` | Migration 001 only |
| `app_users` | `scripts/create_demo_accounts.py`, `POST /api/register` (not in scope) |
| `vessels` | `scripts/create_demo_accounts.py` |
| `devices` | `scripts/provision_device.py` (see `07_SECURITY.md`) |
| `ingest_log` | `POST /api/ingest/mesh` |
| `sos` | `POST /api/ingest/mesh`, `POST /api/sos` |
| `sos_events` | Same two endpoints, plus acknowledge |

**If you add a table, add its writer to this list in the same commit.** A table
with no writer is a design error.

---

## Query patterns

Never `SELECT *`. Name columns explicitly — v1 shipped `SELECT *` on ten
endpoints, which returns any future sensitive column straight to the client.

**Active SOS feed (dashboard):**

```sql
SELECT s.id, s.lat, s.lon, s.battery, s.path, s.status,
       s.submitted_at, s.committed_at, s.acknowledged_at,
       u.display_name AS reporter_name,
       v.name         AS vessel_name,
       a.display_name AS acknowledged_by_name
FROM sos s
JOIN app_users u ON u.id = s.user_id
LEFT JOIN vessels v ON v.id = s.vessel_id
LEFT JOIN app_users a ON a.id = s.acknowledged_by
ORDER BY (s.status = 'active') DESC, s.submitted_at DESC
LIMIT $1;
```

**Acknowledge (atomic, conflict-safe):**

```sql
UPDATE sos
SET status = 'acknowledged',
    acknowledged_at = now(),
    acknowledged_by = $2::uuid
WHERE id = $1::uuid
  AND status = 'active'
RETURNING id, acknowledged_at;
```

Zero rows returned → the SOS was already acknowledged → respond
`409 ALREADY_ACKNOWLEDGED`. Do not read-then-write; the single statement is the
concurrency control.

**Idempotent ingest:**

```sql
INSERT INTO ingest_log (msg_id, src, msg_type, device_ts, hops, raw)
VALUES ($1, $2, $3, $4, $5, $6)
ON CONFLICT (msg_id) DO NOTHING
RETURNING msg_id;
```

Zero rows returned → already seen → return `200` with the existing SOS, and do
**not** create a second one. Duplicate delivery over multiple mesh paths is
normal.

---

## Health check relations

`GET /health/ready` must verify these exist. **Verify the names against this
file before writing them** — v1's health check referenced a table that never
existed and failed the deploy of a completely healthy application.

```python
REQUIRED_RELATIONS = ["app_users", "vessels", "devices", "ingest_log", "sos"]
```

There is a test in `03_BACKEND.md` that cross-checks this list against the
migration files. Keep it.
