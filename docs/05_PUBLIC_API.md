# 05 — Public API (REST + SSE)

The read/ack surface for the MDRRMO dashboard (Jade) and the mobile app's
status view (Jade, Doreen Kay). Implemented by the FastAPI backend (Lenard).

## Scope

- Live SOS feed over SSE.
- SOS list and acknowledge over REST.
- Delivery-state reporting.

Out of scope: ingest (`docs/04_INGEST_API.md`) and the radio hops.

## Transport

- HTTPS. Base URL is `https://incredible-liberation-production-aad7.up.railway.app`.
- Dashboard requests are authenticated by API key (`X-Api-Key`); the mobile
  app may use unauthenticated read endpoints while the app has no login (role
  `fisherman` only sees its own vessel status client-side).
- JSON bodies; `charset=utf-8`.

## Endpoints

### `GET /healthz`

Liveness used by the platform and by demos. Returns `200`:

```json
{ "status": "ok" }
```

### `GET /api/v1/sos`

List SOS events, newest first.

| Query | Default | Meaning |
|---|---|---|
| `status` | `open` | `open` \| `acknowledged` \| `all` |
| `limit` | 50 | Max rows (≤ 200). |
| `vessel_id` | — | Filter to one vessel UUID. |

Response `200`:

```json
{
  "sos": [
    {
      "id": "evt_1234",
      "vessel_id": "8f7b2c41-...",
      "boat": "BG-123",
      "status": "open",
      "delivery_state": "delivered",
      "lat": 11.6050,
      "lon": 122.3125,
      "note": "engine down",
      "created_at": "2026-08-03T22:15:00Z",
      "acknowledged_at": null,
      "acked_by": null
    }
  ]
}
```

`delivery_state` is one of the four states (`docs/06_DELIVERY_STATES.md`); on
the dashboard it is always `delivered` or `acknowledged` — the radio hops
before the backend are out of its view.

### `POST /api/v1/sos/{id}/ack`

Acknowledge an SOS (MDRRMO action). Body:

```json
{
  "v": 1,
  "responder": "ranger-01"
}
```

`responder` is the operator id (free text, ≤ 32 chars). Returns `200`:

```json
{
  "id": "evt_1234",
  "status": "acknowledged",
  "acknowledged_at": "2026-08-03T22:20:00Z",
  "acked_by": "ranger-01"
}
```

The ack is persisted and idempotent — re-acking the same id returns the same
result (`acked_by` unchanged). A reload must show the ack (`docs/00_START_HERE.md`
definition of done).

### `GET /api/v1/sos/stream` — SSE live feed

Server-Sent Events, `text/event-stream`. On connect the server sends the
current open SOS list as one snapshot event, then pushes every new event.

```
event: snapshot
data: {"sos": [ ...open SOS events... ]}

event: sos
data: {"event": "created", "sos": { ... }}

event: sos
data: {"event": "acknowledged", "sos": { ... }}
```

- Reconnect after network drop: client reconnects and receives a fresh
  snapshot; the snapshot is the source of truth, events are deltas.
- Event types: `created`, `acknowledged`. (`delivery_state` changes from the
  mesh are not pushed to the dashboard; see `docs/06_DELIVERY_STATES.md`.)

## Delivery-state reporting for the app

The phone learns nothing beyond its buoy (`docs/03_PHONE_BUOY_WIFI.md`) unless
it has internet. If it does, it can reconcile its outbox:

### `GET /api/v1/vessels/{vessel_id}/sos`

Returns that vessel's SOS rows, newest first. The app matches by
`(vessel_id, seq)` to mark a message `acknowledged` when an MDRRMO responder
has acked it. No auth for MVP; the id is an unguessable UUID.

## Roles

- `mdrrmo` and `admin` may list and ack. `admin` may also register devices and
  revoke API keys (back-office, not in this doc).
- `fisherman` reads only through the app; no auth required for MVP.

## Conventions

- Timestamps are RFC 3339 UTC.
- All list/stream shapes are stable once `v` (where present) is fixed; bump
  the payload version before changing a field.
- Update this doc first, then tell Jade.
