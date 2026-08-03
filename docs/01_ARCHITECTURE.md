# 01 — Architecture

End-to-end topology, identities, and data flow for the AqOne mesh. This doc is
the map; the numbered contracts define each edge in detail.

## Topology

```
┌───────────────┐  WiFi SoftAP   ┌──────────────────────┐
│ Vessel phone  │ ─────────────► │ Buoy (ESP32-S3)      │
│ Flutter       │                │ • SX1262 LoRa        │
│ • SQLite      │ ◄───────────── │ • MPU6050 (optional) │
│   outbox      │   buoy ack     │ • store & forward    │
│ • airplane    │                │ • signs packets      │
│   mode OK     │                └──────────┬───────────┘
└───────────────┘                           │ LoRa
                                            ▼
                                 ┌──────────────────────┐
                                 │ Buoy N (relay, TTL--)│
                                 └──────────┬───────────┘
                                            │ LoRa
                                            ▼
                                 ┌──────────────────────┐
                                 │ GATEWAY (has internet)│
                                 │ • verify signature   │
                                 │ • external ID → UUID │
                                 │ • HTTPS to backend   │
                                 └──────────┬───────────┘
                                            │ HTTPS
                                            ▼
                        ┌───────────────────────────────────┐
                        │ BACKEND — FastAPI + PostgreSQL    │
                        │ ingest → dedupe → event log →     │
                        │ projection → SSE push             │
                        └──────────┬────────────────────────┘
                                   │ SSE / REST
                                   ▼
                        ┌───────────────────────────────────┐
                        │ DASHBOARD — MDRRMO live SOS feed  │
                        └───────────────────────────────────┘
```

## Edges and their contracts

| Edge | Medium | Contract |
|---|---|---|
| Phone → buoy | WiFi SoftAP HTTP | `docs/03_PHONE_BUOY_WIFI.md` |
| Buoy → buoy / buoy → gateway | LoRa | `docs/02_LOAM_PACKET_SPEC.md` |
| Gateway → backend | HTTPS | `docs/04_INGEST_API.md` |
| Backend → dashboard / mobile | REST + SSE | `docs/05_PUBLIC_API.md` |

## Identities

Two identity worlds exist; the gateway and backend reconcile them.

- **External ID (mesh side).** A 32-bit opaque id assigned to every radio
  endpoint (each buoy) and every phone session a buoy sees. Lives inside LoRa
  frames. Short because the radio channel is narrow.
- **Internal ID (backend side).** A UUID for each vessel (a fisherman's phone,
  tracked across trips) and each buoy/device. Assigned on first sight.

The gateway maps external → internal for the backend (`docs/04_INGEST_API.md`);
the backend also keeps the mapping so it can own the truth.

## End-to-end flow (phone-originated SOS)

1. Phone in airplane mode joins the nearest buoy's WiFi AP.
2. Phone `POST`s the SOS to the buoy (`03_PHONE_BUOY_WIFI.md`); the buoy
   replies with an ack carrying its id and a sequence number.
3. Phone records the delivery state `relayed` locally (SQLite outbox).
4. Buoy wraps the SOS in a signed LoRa frame (`02_LOAM_PACKET_SPEC.md`),
   stores it, and starts forwarding: TTL hops over LoRa, decrementing TTL at
   each relay until a gateway hears it.
5. Gateway verifies the signature, resolves external → internal ids, and
   `POST`s to the backend (`04_INGEST_API.md`).
6. Backend dedupes on `(src_ext_id, seq)`, appends to the event log, updates
   the projection, and pushes the event over SSE to the dashboard.
7. MDRRMO acknowledges; the ack persists and is pushed back to subscribers.
   If the mesh supports return traffic, the phone eventually learns its SOS
   was acknowledged — otherwise its state stays honest at `delivered`.

## Backend processing pipeline

```
ingest → verify → dedupe → event log → projection → SSE push
```

- **Ingest:** accepts gateway HTTPS pushes only (authenticated by API key).
- **Dedupe:** `(src_ext_id, seq)` seen before → drop, return `deduped: true`.
- **Event log:** append-only `events` table; every accepted packet is one row.
- **Projection:** current-state table (`sos_events`) rebuilt from the log; the
  dashboard reads the projection, the SSE feed carries the same events.
- **Push:** SSE fan-out to dashboard subscribers, plus persistence of acks.

## Roles

| Role | Enum value | Sees |
|---|---|---|
| Fisherman | `fisherman` | Mobile app only. Sends SOS, sees own status. |
| MDRRMO responder | `mdrrmo` | Dashboard. Live SOS feed, acknowledge. |
| Admin | `admin` | Everything MDRRMO sees. |

BFAR/LGU regulator roles existed in v1 and are **out of scope** for this build
(`docs/07_SCOPE_OUT.md`).

## Delivery states

The four states are the shared product language — see
`docs/06_DELIVERY_STATES.md`. Every surface (mobile outbox, dashboard feed,
backend API) must show a message's real state and never fake a later one.

```
saved ──► relayed ──► delivered ──► acknowledged
```

## Key non-goals restated

- No mesh routing algorithm — TTL flooding is enough for a bay.
- No end-to-end encryption of content (channel signatures only, MVP).
- No catch logging, advisories, photos, or float-plan (see
  `docs/07_SCOPE_OUT.md`).
