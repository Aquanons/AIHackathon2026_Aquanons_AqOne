# 01 — CONTRACTS

**This is the most important document in the repository.**

Both of the previous build's worst bugs were the client and server disagreeing
about a shape. Everything in this file is shared between firmware, backend,
mobile app, and dashboard. **Nothing here may be changed by one side alone.**

If you need a value that isn't in this file, add it here first, then implement.

---

## 1. Enums — the single source of truth

Copy these verbatim into each codebase. Do not invent variants.

### 1.1 Message type

| Wire value (uint8) | Name | Meaning |
|---|---|---|
| `1` | `sos.manual` | Fisherman pressed SOS |
| `2` | `hazard.wave` | Buoy detected dangerous wave conditions |
| `3` | `hazard.capsize` | Buoy detected capsizing-risk conditions |
| `4` | `checkin.ping` | Vessel presence check-in |
| `5` | `telemetry.buoy` | Buoy health/battery |

**In scope for this build: `1` only.** Types 2–5 are reserved in the wire
format so the protocol doesn't need a version bump later, but no handler is
implemented for them. Reject unknown types with a logged warning, never a crash.

### 1.2 Priority class

| Value | Class | Policy |
|---|---|---|
| `0` | SOS | Retry until acked. Never dropped. Preempts everything. |
| `1` | Hazard | Hop-limited broadcast. |
| `2` | Check-in | Batched. First to be dropped under congestion. |
| `3` | Telemetry | Best effort. |

### 1.3 Delivery state — shown to the fisherman

**Never conflate these. For an SOS this is a safety property, not UX polish.**

| Value | Label shown to user | Set by | Means |
|---|---|---|---|
| `queued_local` | "Saved on your phone" | Phone | Written to outbox, not yet handed off |
| `received_by_buoy` | "Received by buoy" | Buoy ack over WiFi | A buoy has it |
| `committed` | "Received by AqOne" | Backend | Server has it durably |
| `acknowledged` | "MDRRMO has responded" | MDRRMO action | A human has seen it |

**"Received by AqOne" must never imply MDRRMO is coming.** Only
`acknowledged` means a responder has acted.

### 1.4 SOS status (server-side)

| Value | Meaning |
|---|---|
| `active` | Open, not yet acknowledged |
| `acknowledged` | A responder has acknowledged it |

### 1.5 Roles

| Value | Notes |
|---|---|
| `fisherman` | Mobile app |
| `mdrrmo` | Dashboard, can acknowledge |
| `admin` | Dashboard, can acknowledge |

### 1.6 Permissions (returned by the server, never hardcoded in clients)

| Permission | Granted to |
|---|---|
| `sos.create` | `fisherman`, `admin` |
| `sos.list` | `mdrrmo`, `admin` |
| `sos.acknowledge` | `mdrrmo`, `admin` |

Clients render UI from the permission list in `GET /api/me`. **A client must
never contain a role name in an `if` statement.**

---

## 2. LoRa wire format (binary)

A JSON envelope is far too large for LoRa. The radio carries a compact binary
frame; the **gateway** expands it into the JSON envelope for HTTP.

### 2.1 Frame layout — 46 bytes for an SOS

All multi-byte integers are **little-endian**.

| Offset | Size | Field | Type | Notes |
|---|---|---|---|---|
| 0 | 1 | `ver` | uint8 | Protocol version. Currently `1`. |
| 1 | 1 | `type` | uint8 | §1.1 |
| 2 | 1 | `flags` | uint8 | bits 0–1 priority, bits 2–4 TTL, bits 5–7 reserved (0) |
| 3 | 6 | `src` | bytes | Device ID, 6 bytes (see §2.2) |
| 9 | 16 | `msg_id` | bytes | ULID, binary. **The idempotency key end to end.** |
| 25 | 4 | `ts` | uint32 | Unix seconds, device clock |
| 29 | 4 | `lat` | int32 | degrees × 1e7 |
| 33 | 4 | `lon` | int32 | degrees × 1e7 |
| 37 | 1 | `battery` | uint8 | percent, 0–100, `255` = unknown |
| 38 | 8 | `sig` | bytes | HMAC-SHA256 over bytes 0..37, truncated to 8 |

**Total: 46 bytes.** Comfortably inside the LoRa payload budget at any
spreading factor.

TTL is 3 bits → max 7 hops. Decrement on each relay; drop at 0.

### 2.2 Device IDs

`src` is a **6-byte external device ID**, not a database UUID.

Rationale: a UUID is 36 bytes of a ~50-byte budget, and an ESP32 has no
business knowing the backend's primary keys. In the previous build the gateway
demanded UUIDs while the published contract used external IDs, and the
canonical example was rejected by its own gateway with
`422: user_id must be a UUID`. **The `devices` table (see `02_DATA_MODEL.md`)
is the adapter that maps external ID → internal UUID.**

Human-readable form for logs and config: lowercase hex, no separators, e.g.
`7f3a2b1c9d40`.

### 2.3 Signature

```
sig = HMAC-SHA256(device_shared_key, frame_bytes[0..37])[0..7]
```

An 8-byte (64-bit) authentication tag. This is a deliberate tradeoff for a
constrained radio link — LoRaWAN itself uses a 4-byte MIC, so this is twice as
conservative as the industry standard for exactly this use case. Forgery
requires ~2^64 work for a message that expires in minutes.

**A frame with an invalid signature is not a message. Drop it and log it.**

### 2.4 Canonical test vector — this MUST parse end to end

Any change that breaks this is a regression. Put it in a test.

```
Device ID : 7f3a2b1c9d40
Shared key: 000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f
msg_id    : 01J8Z3K5N7Q9R1S3T5V7W9X1Y3   (ULID, canonical form)
type      : 1   (sos.manual)
priority  : 0
ttl       : 5
ts        : 1754200000
lat       : 11.6515900  -> 116515900
lon       : 122.4328600 -> 1224328600
battery   : 87
```

Expected: gateway accepts, backend returns `201`, one SOS row exists.
Replaying the identical frame returns `200` and creates **no** second row.

---

## 3. HTTP API contract

### 3.1 Response envelope — used by EVERY endpoint, no exceptions

**Success:**
```json
{ "ok": true, "data": { } }
```

**Error:**
```json
{ "ok": false, "error": { "code": "SOS_NOT_FOUND", "message": "Human readable." } }
```

Rules:
- The payload is **always** under `data`. Never at the top level.
- `data` is an object, never a bare array. A list goes in a named field:
  `{"ok": true, "data": {"sos": [...]}}`.
- Clients read `body.data.<field>`. **Never** assume a bare array — that exact
  mistake made pins silently never render in v1, while a fake "saved" marker
  appeared after the real save had succeeded.
- `error.code` is a stable machine-readable string. `error.message` is for
  humans and may change.

### 3.2 Error codes

| Code | HTTP | Meaning |
|---|---|---|
| `UNAUTHENTICATED` | 401 | Missing/invalid/expired token |
| `FORBIDDEN` | 403 | Authenticated but lacks permission |
| `VALIDATION_FAILED` | 422 | Bad request body |
| `SOS_NOT_FOUND` | 404 | No such SOS |
| `ALREADY_ACKNOWLEDGED` | 409 | Acknowledge attempted on a handled SOS |
| `UNKNOWN_DEVICE` | 403 | `src` not in `devices`, or revoked |
| `BAD_SIGNATURE` | 403 | HMAC verification failed |
| `INTERNAL` | 500 | Generic. **Never** include exception text. |

### 3.3 Endpoints in scope

Full request/response bodies are in `03_BACKEND.md`. This is the index:

| Method | Path | Auth | Permission |
|---|---|---|---|
| `GET` | `/health/live` | none | — |
| `GET` | `/health/ready` | none | — |
| `POST` | `/api/login` | none | — |
| `GET` | `/api/me` | bearer | — |
| `POST` | `/api/sos` | bearer | `sos.create` |
| `GET` | `/api/sos` | bearer | `sos.list` |
| `POST` | `/api/sos/{id}/acknowledge` | bearer | `sos.acknowledge` |
| `GET` | `/api/sos/{id}/status` | bearer | owner only |
| `GET` | `/api/sos/stream` | bearer | `sos.list` (SSE) |
| `POST` | `/api/ingest/mesh` | gateway secret | — |

### 3.4 Timestamps

All API timestamps are **ISO 8601 UTC with a `Z` suffix**:
`2026-08-04T09:15:30Z`. The LoRa frame uses unix seconds; the gateway converts.

### 3.5 IDs in the API

- `msg_id` — ULID canonical string, e.g. `01J8Z3K5N7Q9R1S3T5V7W9X1Y3`
- SOS `id` — UUID string
- Device IDs — 12-char lowercase hex

---

## 4. Gateway → backend JSON envelope

The gateway expands the binary frame into this and POSTs it to
`/api/ingest/mesh` with header `X-AqOne-Gateway-Secret: <secret>`.

```json
{
  "ver": 1,
  "msg_id": "01J8Z3K5N7Q9R1S3T5V7W9X1Y3",
  "type": "sos.manual",
  "priority": 0,
  "src": "7f3a2b1c9d40",
  "ts": "2026-08-04T09:15:30Z",
  "lat": 11.65159,
  "lon": 122.43286,
  "battery": 87,
  "hops": 2,
  "sig_valid": true
}
```

- The gateway verifies the signature and reports `sig_valid`. The backend
  **also** re-verifies independently — never trust the gateway alone.
- `hops` is `initial_ttl - remaining_ttl`, for diagnostics only.
- Backend dedupes on `msg_id`. Duplicate delivery over multiple mesh paths is
  normal, not exceptional.

---

## 5. Changing this document

1. Propose the change here first.
2. Update every affected side in the same commit.
3. Update the canonical test vector if the wire format changed.

A contract change that lands on one side only is the single most expensive
class of bug this project has experienced. Do not do it.
