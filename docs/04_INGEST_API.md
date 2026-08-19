# 04 — Ingest API (gateway → backend)

The HTTPS contract between the gateway node (Arnold) and the FastAPI backend
(Lenard). The gateway is the only mesh edge with internet and the only caller
of this API.

## Scope

- Authenticated submission of mesh frames.
- Device / vessel registration (external id → UUID mapping).
- Dedupe semantics.

Out of scope: the LoRa wire format (`docs/02_LOAM_PACKET_SPEC.md`) and the
public read surface (`docs/05_PUBLIC_API.md`).

## Transport

- `HTTPS` only. Plain HTTP is refused by the backend.
- Base URL is a platform env var on the gateway, e.g.
  `https://incredible-liberation-production-aad7.up.railway.app`.
- Auth: header `X-Api-Key: <gateway api key>` on every request. Keys are
  issued per gateway and revoked in the backend admin console.

## Endpoints

### `POST /api/v1/ingest` — submit a decoded frame

The gateway verifies the LoRa signature first (`docs/02_LOAM_PACKET_SPEC.md`)
and converts external ids to UUIDs (`/api/v1/devices/lookup` below). Then it
posts the decoded, normalized event.

Request body (JSON):

```json
{
  "v": 1,
  "type": "sos",
  "src_ext_id": 1001,
  "relay_ext_id": 1001,
  "src_id": "8f7b2c41-...",
  "relay_id": "a1b2c3d4-...",
  "seq": 42,
  "ts": 1722700000,
  "ttl": 5,
  "hops": 3,
  "payload": {
    "kind": "sos",
    "boat": "BG-123",
    "lat": 11.6050,
    "lon": 122.3125,
    "note": "engine down"
  },
  "gateway_id": "gw-01",
  "recv_ts": 1722700005
}
```

| Field | Required | Notes |
|---|---|---|
| `v` | yes | `1` |
| `type` | yes | `sos` \| `ack` \| `ping` \| `status` |
| `src_ext_id` | yes | External id from the frame. |
| `relay_ext_id` | yes | External id of the last relay. |
| `src_id` | no | UUID for `src_ext_id` if already resolved. |
| `relay_id` | no | UUID for `relay_ext_id` if already resolved. |
| `seq` | yes | Origin sequence number (dedupe key). |
| `ts` | yes | Origin epoch seconds. |
| `ttl` | yes | As received. |
| `hops` | yes | As received. |
| `payload` | yes | Type-specific payload (frame payload JSON). |
| `gateway_id` | yes | Gateway external id. |
| `recv_ts` | yes | Gateway epoch seconds. |

Success `200`:

```json
{
  "accepted": true,
  "event_id": "evt_1234",
  "deduped": false,
  "vessel_id": "8f7b2c41-..."
}
```

`deduped: true` means the backend already had `(src_ext_id, seq)` and this
submission was dropped (still `accepted: true`, with the original `event_id`).

Errors: `401` bad/missing API key; `400` malformed body; `429` rate limit.

### `GET /api/v1/devices/lookup?ext_id=<n>` — resolve an external id

Returns `200` with `{"id": "<uuid>", "kind": "buoy"|"vessel", "known": true}`
or `{"known": false}`. The gateway caches lookups; on `known: false` it may
call `POST /api/v1/devices/register`.

### `POST /api/v1/devices/register` — first sighting

```json
{
  "v": 1,
  "ext_id": 1001,
  "kind": "buoy",
  "label": "AqOne-BUOY01"
}
```

Returns `200` with the assigned UUID. The backend owns this mapping and never
reassigns an external id.

## Dedupe and ordering

- Dedupe key: `(src_ext_id, seq)`. The first accepted submission wins; later
  duplicates return `deduped: true` and do not re-enter the event log.
- `ts` is advisory (origin clock); `recv_ts` is the trustworthy ingest order.
- The backend appends every accepted frame to the append-only event log before
  updating projections (`docs/01_ARCHITECTURE.md`).

## Backend pipeline for `type: sos`

```
verify api key → resolve ids → dedupe (src_ext_id, seq)
→ append event log → upsert sos_events projection → SSE push (05_PUBLIC_API.md)
```

## Versioning

Bump `v` on breaking changes. Update this doc first, then tell Arnold and
Lenard.
