# 05 — Public API (REST + SSE)

The read/ack surface for the MDRRMO dashboard (Jade) and the mobile app's
status view (Jade, Doreen Kay). Implemented by the FastAPI backend (Lenard).

## Scope

- Live SOS feed over SSE.
- SOS list and acknowledge over REST.
- Delivery-state reporting.

Out of scope: ingest (`docs/04_INGEST_API.md`) and the radio hops.

## Transport

- HTTPS. Base URL is `https://aihackathon2026aquanonsaqone-production.up.railway.app`.
- Dashboard requests are authenticated by API key (`X-Api-Key`); the mobile
  app's safety feeds remain unauthenticated, but per-vessel normal-operation
  reads and writes now require a vessel-device bearer token issued by the
  backend. SOS ingest itself stays unauthenticated.
- JSON bodies; `charset=utf-8`.

## Vessel-device credential flow (Option A)

Routine per-vessel reads and writes are no longer authorized by a client-
supplied `vessel_id` alone. The backend now issues a revocable handset
credential that is bound to one vessel.

### `POST /api/vessel-auth/pairing-codes`

Operator-authenticated (`mdrrmo` / `lgu` / `admin`). Issues a short-lived
pairing code for one vessel. Body:

```json
{
  "vessel_id": "NW-001",
  "boat": "NW-001"
}
```

Response `200`:

```json
{
  "vessel_id": "NW-001",
  "pairing_code": "K7Q4M9PX",
  "expires_at": "2026-08-16T05:15:00Z"
}
```

Rules:

- The code is one-time use.
- The code expires after 15 minutes.
- A lost/replaced handset gets a new code; old devices are revoked.

### `POST /api/vessel-auth/enroll`

Consumes the one-time code and returns a vessel-device bearer token. Body:

```json
{
  "vessel_id": "NW-001",
  "pairing_code": "K7Q4M9PX",
  "device_label": "Jade's Android"
}
```

Response `200`:

```json
{
  "token": "eyJ...",
  "expires_at": "2026-08-17T05:00:00Z",
  "device": {
    "id": 12,
    "vessel_id": "NW-001",
    "label": "Jade's Android",
    "paired_at": "2026-08-16T05:00:00Z"
  }
}
```

Rules:

- Token lifetime is 24 hours.
- The token binds one device record to one vessel.
- The backend treats the token's vessel as authoritative. A body/path
  `vessel_id` may be checked for consistency, but never trusted as ownership.

### `POST /api/vessel-auth/refresh`

Requires the current vessel-device bearer token. Returns a fresh token for the
same device/vessel pair and the new expiry time.

### `POST /api/vessel-auth/devices/{device_id}/revoke`

Operator-authenticated. Revokes a lost or replaced handset. Body:

```json
{
  "reason": "lost device"
}
```

Once revoked, the device token must no longer authorize any per-vessel read or
write. SOS ingest remains available without it.

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

### `GET /api/sos/active` — dashboard poll (what the dashboard actually uses)

Operator-authenticated (bearer token, `require_user`). The dashboard polls
this rather than the SSE feed below (`web/js/dashboard/dashboard-live-sos.js`).

Returns **every unresolved SOS event**, newest first — including one a
dispatcher has already acknowledged. An acknowledged event stays in this feed
until a dispatcher calls `POST /api/sos/{id}/resolve` or the fisher replies
`SAFE_NOW` (`POST /api/sos/{id}/reply`, `docs/13_RESPONDER_LOOP.md`); dropping
it as soon as it is acknowledged — the previous behaviour — hid the fisher's
subsequent reply from the dispatcher. Each row carries `acknowledged_at`,
`acked_by`, `eta_at`, `responder_status`, `responder_status_label`,
`responder_note`, `fisher_reply`, `fisher_replied_at` and `resolved_at`
(always `null` here, since a resolved row has left the feed) alongside the
fields `GET /api/v1/sos` documents above.

### `POST /api/sos/{id}/acknowledge` and `POST /api/sos/{id}/resolve`

Operator-authenticated. `acknowledge` accepts `eta_minutes` (converted
server-side to an absolute `eta_at`, never trusting the browser's clock),
`responder_status` (the code table in `docs/13_RESPONDER_LOOP.md`) and an
optional `responder_note`. `resolve` marks the incident resolved, removing it
from `GET /api/sos/active` on the next poll. Both are idempotent — re-calling
either after it already applied returns the same result rather than erroring.

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

### `GET /api/sos/vessel/{vessel_id}`

Returns that vessel's SOS rows, newest first. The app matches by
`(local_id, seq)` to mark a message `acknowledged` when an MDRRMO responder
has acked it.

Requires a vessel-device bearer token. The token's vessel must match the path
vessel id; the backend queries by the verified token vessel, not by trusting
the path as ownership.

### `POST /api/sos/{event_id}/reply`

The fisher's reply to a responder acknowledgement.

```json
{
  "reply": 1
}
```

- `1` = still in danger
- `2` = safe now

Requires a vessel-device bearer token. The backend updates the event only when
it belongs to that token's vessel.

### `POST /api/catch-logs`

Creates or deduplicates one catch log upload from the handset.

Requires a vessel-device bearer token. The backend derives the owning vessel
from the token and rejects a mismatched body `vessel_id`.

### `POST /api/catch-logs/{catch_log_id}/confirm-weight`

Confirms the real reweighed catch figure.

Requires a vessel-device bearer token. The backend updates the row only when it
belongs to that token's vessel.

## Nearby-boat group chat — **implemented**

### `POST /api/mesh/chat`

Relays one chat line from a handset (via the Heltec WiFi hub, or straight
from the phone when it has internet) into the durable store the MDRRMO
dashboard and other handsets read from. Unauthenticated — fishermen have no
account, and neither does the hub.

This is **nearby-boat group messaging**, not private or family messaging.
`sender`, `text`, and `origin` are public group-chat metadata delivered to
every listener of this endpoint; there is no recipient field, no consent
model, and no private downlink. Do not build or document a "message to
family" feature on top of this contract — that needs a new one.

Body:

```json
{ "sender": "Maria Gracia", "text": "heading back, engine trouble", "origin": "app" }
```

| Field | Limit | Notes |
|---|---|---|
| `sender` | 1–64 chars | Self-declared boat/skipper name, not verified. |
| `text` | 1–256 chars | Backend/hub-origin ceiling. The handset's own compose box enforces a tighter 50-character limit before a line is ever sent — see `ChatService.maxMessageLength` in `mobile/lib/ui/chathubb.dart`. |
| `origin` | ≤16 chars, default `app` | Which leg the message arrived on (`app` or `hub`); lets the hub avoid rebroadcasting its own uplink back to the boats that just sent it. |

Returns **`201` only once the row is committed** — this is the one fact a
handset may treat as "cloud relay stored". A timeout, a non-`201` status, or
no internet at all means the backend's state is simply unknown; the handset
must not infer cloud delivery from network reachability alone, and must keep
the line queued for retry rather than drop it.

### `GET /api/mesh/chat?since_id=`

Returns ordered nearby-group messages, unauthenticated. `since_id` (default
`0`) returns messages with `id > since_id` in ascending order — "the next N
after since_id" — so a hub or handset that was offline catches up in order
instead of skipping a gap. Omitting `since_id` returns the most recent
`limit` messages (default 50, max 200), oldest first.

```json
{
  "messages": [
    {
      "id": 42,
      "sender": "Maria Gracia",
      "text": "heading back, engine trouble",
      "origin": "app",
      "created_at": "2026-08-16T04:00:00Z"
    }
  ]
}
```

No cross-hop de-duplication is applied server-side or on the handset. The
buoy firmware does not forward a stable message ID, so at-least-once
delivery (a line possibly appearing twice across hub broadcast and cloud
relay) is a known, accepted limitation, not a bug to mask with a text/time
heuristic that could hide a real repeated distress call.

## Official advisories — **implemented**

### `GET /api/public/advisories`

Published, currently-active advisories only, unauthenticated. "Active" means
`status = Published` **and** the advisory has started (`publish_date <=
today`) **and** has not expired (`expiration_date` is null or `>= today`) —
filtered server-side, not left to the handset's own client-side check.

```json
{
  "advisories": [
    {
      "id": 42,
      "title": "Not advised to go out",
      "category": "Weather Advisory",
      "description": "Habagat surge expected through Thursday.",
      "municipality": "New Washington",
      "priority": "Warning",
      "publish_date": "2026-08-14",
      "expiration_date": "2026-08-16",
      "image_url": "https://.../pier.jpg",
      "status": "Published",
      "source": "LGU",
      "created_at": "2026-08-14T04:00:00Z",
      "updated_at": "2026-08-14T04:00:00Z"
    }
  ]
}
```

Field notes:

- `image_url` is the one public field name for the advisory's photo. The
  operator-facing create/update body still accepts `cover_image` (see
  below) — the backend stores it under that column and always serialises it
  back out as `image_url`. A handset must not need to read both names.
- `publish_date`/`expiration_date` are ISO `YYYY-MM-DD`; `expiration_date` is
  `""` when the advisory does not expire.
- `priority` is one of `Emergency` \| `Warning` \| `Information` \| `Community`.
- `source` identifies the issuer (`LGU` by default). This is a human-authored
  official notice — it is never AqOne's own copy; compare
  `data/welcome_advisory.dart` on the handset, which is marked unofficial and
  never comes from this endpoint.

### `GET /api/advisories`, `POST /api/advisories`, `PUT /api/advisories/{id}`, `DELETE /api/advisories/{id}`

Operator-authenticated (`mdrrmo` / `lgu` / `admin`, via `require_user`). The
list read here is **not** filtered by active/expired — an operator managing
notices needs to see and edit drafts and past advisories too; only the
public route above filters. Create/update accept `cover_image` as the
write-side field name; the response echoes it back as `image_url` like every
other advisory read.

## Squall nowcast — **implemented**

### `GET /api/public/squall`

Squall alarm state for the handset, unauthenticated. `level` is one of
`clear` \| `watch` \| `return_now` \| `unknown`; `return_now` is the
RETURN NOW alarm condition, decided by the model's own threshold rather than
any client-side re-derivation.

A synthetic reading older than a max-data-age guard (3 hours) is treated as
too stale to evaluate: `level` and `return_now` come back exactly as if the
model had never run (`unknown` / `false`), alongside the last known `as_of`
and a `stale`/`stale_reason` pair so the handset can say *why* nothing is
being claimed, rather than going silent. This guard runs before the model is
even loaded — a stale reading can never reach the threshold logic, so it can
never raise a fresh RETURN NOW warning.

```json
{
  "calibration": "synthetic",
  "as_of": "2026-08-16T02:00:00Z",
  "return_now": false,
  "level": "unknown",
  "stale": true,
  "stale_reason": "latest synthetic reading is 6:00:00 old, past the 3:00:00 freshness window for this nowcast",
  "source": "AqOne squall nowcast — calibrated on synthetic data"
}
```

`calibration: "synthetic"` is carried on every response while the model is
trained on simulated pressure fields rather than observed squalls — this is
not a PAGASA warning, and the handset must keep saying so.

## Daily outlook for the app — **implemented as a transparent proxy**

### `GET /api/public/forecast`

The seven-day outlook behind Home's forecast strip.

**No server-side fusion model exists yet.** What is implemented today is a
transparent Open-Meteo/marine proxy: the backend fetches the same two
providers the handset's own fallback would, applies a short upstream
timeout, and returns them in this shape. `source` is `"open-meteo"`, not
`"aqone-fusion"`, and the `risk` block below is always omitted — a fisher
must never be told a verdict was fused from buoy telemetry when none was
used. The shape leaves room for a real fusion model to fill in `risk`
later without a contract change; until then the handset scores every day
itself, exactly as if this endpoint had 404'd
(`mobile/lib/services/forecast_provider.dart`'s `AqOneForecastProvider`
already implements this precedence and its Open-Meteo fallback).

| Query | Default | Meaning |
|---|---|---|
| `lat` | — | Position to forecast for. Required, `-90..90`. |
| `lon` | — | Position to forecast for. Required, `-180..180`. |
| `days` | 7 | Days requested, `1..7`. |

An out-of-range `lat`/`lon`/`days`, or an upstream provider timeout/error,
returns `422`/`502` respectively — never a `200` with an empty or invented
forecast. A `502` here is what lets the handset's own fallback take over on
its next attempt.

Response `200`:

```json
{
  "source": "open-meteo",
  "generated_at": "2026-08-16T04:00:00Z",
  "days": [
    {
      "date": "2026-08-16",
      "weather_code": 95,
      "temp_max": 31.2,
      "temp_min": 25.8,
      "wind_kph": 24,
      "gust_kph": 41,
      "precip_mm": 18.4,
      "wave_m": 2.1
    }
  ]
}
```

A future fusion model would additionally attach a `risk` block per day:

```json
      "risk": {
        "level": "danger",
        "score": 0.81,
        "reason": "Gusts 41 km/h, 2.1 m swell at Buoy B",
        "inputs": ["buoy:buoy-b", "open-meteo"]
      }
```

Field notes, all of them load-bearing:

- `weather_code` is **WMO 4677**, the same vocabulary Open-Meteo uses, so one
  icon mapping on the handset serves every provider.
- `wave_m` is significant wave height in metres, and is **nullable**. Null
  means unknown. It must never be sent as `0.0` to mean "we didn't measure" —
  that reads as flat calm and paints a dangerous day green.
- `risk` is **optional**. Omit it (or send `null`) and the handset scores the
  day itself and labels the verdict as device-derived. This is what lets the
  backend serve weather before the fusion model is ready.
- `risk.level` is one of `safe` \| `caution` \| `danger` \| `unknown`.
- `risk.inputs` is how the app knows whether sea state was considered. An
  entry starting `buoy:` or the literal `wave` counts as sea state; without
  one, the card tells the user the verdict came from wind and rain only.
- `risk.score` is 0–1, most dangerous at 1. Advisory, for future tuning — the
  UI buckets on `level`.

Parsing and every one of these rules is pinned by
`mobile/test/daily_outlook_test.dart`.

## Catch-activity heatmap — **implemented**

### `GET /api/public/hotspots`

The server-side recent catch-activity surface (§6.2), built only from catch
logs whose owner explicitly opted in. This first operational version scores
coarse cells from recent independent reporters and observation density. It is
not an environmental prediction or a guarantee of catching fish.

Response `200`:

```json
{
  "generated_at": "2026-08-16T02:00:00Z",
  "model_version": "catch-density-v1",
  "min_reporters": 3,
  "cells": [
    {
      "center_lat": 11.72,
      "center_lon": 122.36,
      "cell_size_degrees": 0.05,
      "score": 0.82,
      "observations": 34
    }
  ]
}
```

Rules the shape enforces, all of them deliberate:

- **Cells, never points.** §6.2 requires binning that protects an
  individual's exact productive location. There is no field in which a
  precise coordinate could be expressed, so the privacy property belongs to
  the contract rather than to whatever renders it.
- `score` is relative recent activity 0–1, **not** a probability of catching
  anything. §6.2 forbids implying guaranteed catch, and the client renders it
  as opacity of a single hue — never a red-to-green ramp, which reads as a
  safety verdict.
- `observations` and `min_reporters` are shown in the map legend. §6.3's
  minimum-reporter rule stops one prolific fisher becoming "the model", and a
  cell resting on two reports must not look like one resting on two hundred.
- `generated_at` drives a visible staleness label, per §3.4.
- Cells should be withheld server-side when they fall below the reporter
  threshold. The client cannot tell a withheld cell from an empty sea, which
  is the intended asymmetry.

Parsing is pinned by `mobile/test/hotspot_cell_test.dart`.

### `POST /api/spots` — **deprecated, no callers**

Manual pin-drop fishing spots. Removed from the handset. It published exact
coordinates, attributed to a vessel, to every other handset, with no consent
gate — the direct opposite of §6.2's binning requirement and §6.1's separate
opt-in. The dashboard's `fetchHotspots()` that once read it no longer exists
either.

Endpoint and tables are left in place so anything a handset had already
queued still uploads. Nothing writes new spots. Delete both once the
outstanding queues are known to be drained.

### PAGASA

When a data-sharing agreement exists, PAGASA replaces the **atmospheric half
only**. Their TenDay API is keyed by municipality rather than coordinates and
carries no sea state, so wave height keeps coming from the marine model or
from our own buoys. The call should live behind this endpoint rather than in
the handset, so attribution and rate terms are honoured in one place and no
credential ships on a phone.

## Trip-anomaly review queue — **implemented**

The responder-facing side of `docs/38_AUTOMATIC_DISTRESS_DETECTION_IMPLEMENTATION_PLAN.md`.
A case here is a review candidate produced by confidence-scored trip
evaluation (`docs/04_INGEST_API.md` "Contact events" is its only trustworthy
input) — **never an SOS, and never an automatic dispatch.** All routes are
operator-authenticated (`require_user`); a public or handset caller cannot
read or mutate this queue.

### `GET /api/ai/anomaly/active`

Read-only. Never triggers evaluation or writes — dashboard polling cannot
rebuild the underlying tables. Each row carries `source` (`live` \|
`synthetic`), `evaluated_at`, and `data_age_seconds` alongside the score, so
the dashboard can say plainly how current a result is.

### `GET /api/ai/anomaly/cases/open`

The persistent "Trip checks" queue: every unresolved case, newest first.
Read-only, same guarantee as `GET /active`. Response `200`:

```json
[
  {
    "id": 42,
    "vessel_id": "NW-001",
    "trip_id": "trip-2026-08-29-01",
    "case_type": "responder_attention",
    "score": 0.82,
    "status": "alert",
    "reasons": [{"code": "overdue", "weight": 0.85, "contribution": 0.78, "description": "Late beyond the expected-contact window."}],
    "source": "live",
    "score_evaluated_at": "2026-08-29T05:10:00Z",
    "last_contact_at": "2026-08-29T02:00:00Z",
    "data_age_seconds": 11400,
    "is_synthetic": false,
    "created_at": "2026-08-29T05:10:00Z",
    "updated_at": "2026-08-29T09:10:00Z",
    "acknowledged_at": null,
    "acknowledged_by": null,
    "dismissed_at": null,
    "dismissed_by": null,
    "dismissed_reason": null,
    "escalated_at": null,
    "escalated_by": null,
    "escalated_reason": null,
    "resolved_at": null,
    "resolved_by": null
  }
]
```

`case_type` is `verification` for a low-confidence (cold-start) vessel
profile, or `responder_attention` for a high-confidence one — never a
severity label. A case is created or refreshed only while its underlying
trip still scores non-`normal`; a periodic re-evaluation updates `score`,
`status`, `reasons` and the two timestamps but never touches the
acknowledged/dismissed/escalated/resolved columns, so a responder's decision
survives every later refresh.

### `POST /api/ai/anomaly/cases/{id}/acknowledge`

Marks the case seen. Idempotent — a retry keeps the first `acknowledged_by`
and `acknowledged_at`. No body required.

### `POST /api/ai/anomaly/cases/{id}/dismiss`

Marks the case a false or expected positive. Requires a short reason:

```json
{ "reason": "known route deviation, confirmed safe by radio" }
```

Idempotent — a retry keeps the original `dismissed_reason` rather than
overwriting it.

### `POST /api/ai/anomaly/cases/{id}/escalate`

Hands the case to real-world handling — a human decision; this call never
dispatches anything itself. Same `{ "reason": "..." }` body and idempotency
as dismiss.

### `POST /api/ai/anomaly/cases/{id}/resolve`

Closes the case; it drops out of `GET /cases/open` on the next poll.
Idempotent, no body required. Because evaluation never writes `resolved_at`,
a later score refresh can never reopen a case a responder closed.

## Drift prediction and search re-tasking — **implemented (Phases 1-2: case lifecycle, quality-gated runs)**

The responder-facing side of
`docs/40_DRIFT_PREDICTION_SEARCH_RETASKING_IMPLEMENTATION_PLAN.md`. A case
here is a drift/search effort opened for one specific vessel, reusing the
existing `incidents` table (prior/posterior grid, `search_sectors`) rather
than a second incident system.

**Non-goals — this API never does any of the following:** open a case on its
own initiative, dispatch or assign an asset, plot a navigation route, declare
a person found, or replace SAR command judgement. Every write here is a
human responder's action; every read is decision *support*.

**Protected source only.** A case can be opened only from a source the
responder has already confirmed:

- a Manual SOS event (`docs/36_MANUAL_SOS_RESPONDER_LOOP_IMPLEMENTATION_PLAN.md`)
  that a dispatcher has **acknowledged** (`POST /api/sos/{id}/acknowledge`)
  and that is not yet resolved; or
- an automatic-distress anomaly case (`docs/38_AUTOMATIC_DISTRESS_DETECTION_IMPLEMENTATION_PLAN.md`)
  that a responder has **escalated** (`POST /api/ai/anomaly/cases/{id}/escalate`)
  and that is not yet resolved.

A new anomaly score, an arbitrary client-supplied position, or a public
caller can never open a case. All routes below require a bearer token
(`require_user`); there is no unauthenticated drift endpoint.

### Production environmental-input quality policy (Phase 2)

A real case's drift run may only use observed currents and a non-degraded
wind source — never the synthetic current equation or the simulator's
`true_*` columns. When the inputs don't clear the bar below, the run is
persisted as `insufficient_environmental_data` (with the diagnostic snapshot
that follows) instead of a contour.

Approved by the project owner (Lenard — see `AGENTS.md` Ownership) on
2026-08-30. These are safety thresholds: do not change them to make a demo
or a specific case work — that changes which real cases get a search field.
Re-approval is required before adjusting any of them.

| Policy | Value | Rationale |
|---|---|---|
| Minimum field geometry | ≥ 2 distinct buoys with a fresh reading within range of the last-known position | One buoy gives a point value, not a spatial gradient — two is the minimum to interpolate a direction. |
| Maximum current-observation age | 60 minutes | Matches the pre-existing interpolation cutoff (`current_field.MAX_AGE_SECONDS`) rather than adding a second, looser number. |
| Maximum wind-forecast age | 60 minutes | Structurally enforced tighter already: the wind cache TTL is 20 minutes, so a non-degraded fetch is always well under this. A *degraded* fetch (Open-Meteo unreachable, synthetic wind substituted) is rejected outright regardless of age. |
| Minimum observed-current coverage | ≥ 50% of the particle field driven by real observations, not the synthetic fallback | A zero (or near-zero) observation fraction is not sufficient evidence for a production search map (docs/40 "Current findings"). |

With no buoys deployed yet, every real case today is `insufficient_field_geometry`
until the buoy/current hardware is in the water — this is the honest, intended
state, not a bug (docs/40 "Purpose and delivery rule").

### `POST /api/ai/drift/cases` — open a case

```json
{ "source_type": "sos", "source_id": 42, "object_class": "person_in_water", "forecast_hours": 24 }
```

`source_type` is `"sos"` or `"anomaly"`; `object_class` is one of
`person_in_water`, `swamped_banca`, `intact_hull_adrift` and is always an
explicit responder choice — it is never inferred from the source's own
reason text. `forecast_hours` defaults to 24 (max 72). The last-known
position and time come from the source itself (the SOS's own lat/lon, or the
vessel's most recent position fix for an escalated anomaly) — the caller
cannot supply an arbitrary position.

Fails with `404` if the source doesn't exist, `409` if the source is not yet
confirmed (not acknowledged / not escalated), already resolved, or already
has a case open (one case per source — a retry does not fork a second search
effort), and `422` if the source has no recorded position yet.

Opening a case immediately computes and persists **run 1** against the
quality policy above — this is the only time a real case's prediction is
computed except for an explicit rerun (below). Response `200`:

```json
{ "id": 101, "vessel_id": "NW-001", "object_class": "person_in_water", "case_state": "confirmed", "source_type": "sos", "run_number": 1, "environmental_status": "ok", "insufficiency_reason": null }
```

### `GET /api/ai/drift/incidents`

Every case, newest last-contact first — real and demo/synthetic alike, each
labelled. `case_state` is `confirmed`, `resolved`, or `cancelled`.

### `GET /api/ai/drift/incident/{id}`

Reads the **stored** current run — it never recomputes on a `GET`, so a
displayed prediction and its posterior always belong to the same
environmental inputs. Response shape for a real case:

```json
{
  "incident": { "id": 101, "vessel_id": "NW-001", "case_state": "confirmed", "source_type": "sos", "is_synthetic": false, "...": "..." },
  "run_number": 1,
  "model_version": "aqone-drift-v1",
  "computed_at": "2026-08-30T05:10:00Z",
  "environmental_status": "ok",
  "insufficiency_reason": null,
  "nearby_buoy_count": 3,
  "observation_fraction": 0.71,
  "prediction": { "object_class": "person_in_water", "wind_source": "open-meteo", "degraded": false },
  "posterior_grid": { "...": "DensityGrid" },
  "contours": [ "...": "50/75/95% GeoJSON polygons" ],
  "search_sectors": [ "..." ]
}
```

When `environmental_status` is `insufficient_environmental_data`,
`prediction`/`posterior_grid` are `null` and `contours` is `[]` — never a
contour inferred from the synthetic fallback. **`ground_truth_track` is
present only when the incident is synthetic** — a real case's response never
contains a ground-truth field at all (not even `null`). A synthetic replay's
ground truth is otherwise only available from the demo-gated route below.

A legacy/demo-fixture incident (created by the simulator or the demo
scenario engine, never by `POST /cases`) has no stored run and keeps the
pre-Phase-2 behaviour: `prediction` is a live-recomputed `DriftResult`, not a
stored run snapshot.

### `POST /api/ai/drift/cases/{id}/rerun` — explicit new drift run (Phase 2)

The only way a case's prediction is ever recomputed after it opens — always
a deliberate responder action, never automatic. Appends **run *N*+1**; the
previous run and every search sector already recorded against the case are
left untouched, so a crew already acting on the current contours is never
silently redirected mid-search. Fails `409` if the case is resolved/
cancelled, or has no run yet (a demo/synthetic case has none — `rerun` only
applies to a real case). Response shape matches `POST /cases`' tail:

```json
{ "id": 101, "run_number": 2, "environmental_status": "ok", "insufficiency_reason": null }
```

### `POST /api/ai/drift/incident/{id}/searched`

Records a searched sector against the case's *current* run and returns the
updated posterior. Rejects with `409` once the case is `resolved` or
`cancelled`, or if the current run is `insufficient_environmental_data`
(there is no field to search). (Phase 3 replaces the raw metre-offset body
and adds an idempotency key; this phase only adds the case-state and
run-status gates.)

### `POST /api/ai/drift/cases/{id}/resolve`

Closes the case (the search effort itself, independent of the source SOS/
anomaly's own state). Idempotent, no body required.

### `POST /api/ai/drift/cases/{id}/cancel`

```json
{ "reason": "false alarm, vessel found at dock" }
```

Idempotent — a retry keeps the original `cancelled_reason`.

### `GET /api/demo/drift/incident/{id}` — demo-only, ground truth

Returns `{ "ground_truth_track": [...] }` for a synthetic replay incident.
Gated by `DEMO_MODE` (the route is only mounted when it is set) plus
`X-Demo-Key`, and additionally `404`s on any incident that isn't synthetic —
a demo key alone can never unlock a real case's data.

## Roles

- `mdrrmo` and `admin` may list and ack. `admin` may also register devices and
  revoke API keys (back-office, not in this doc).
- `fisherman` reads safety feeds without auth, but per-vessel status / reply /
  catch routes now require a paired vessel-device credential.

## Conventions

- Timestamps are RFC 3339 UTC.
- All list/stream shapes are stable once `v` (where present) is fixed; bump
  the payload version before changing a field.
- Update this doc first, then tell Jade.
