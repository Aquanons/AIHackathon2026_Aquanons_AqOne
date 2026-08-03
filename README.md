# AqOne — Offline SOS mesh for New Washington fishermen

Small-scale fishermen in New Washington, Aklan fish in a cellular dead zone.
AqOne gives them an offline distress channel: a phone hands an SOS to an
anchored LoRa buoy over WiFi, buoys relay it radio-to-radio to a gateway with
internet, and the MDRRMO dashboard receives it in real time.

## Why this exists

- No cellular signal at sea means no way to call for help.
- MDRRMO learns about a capsizing hours later, by word of mouth.
- Every consumer safety app stops working exactly where it is needed.

AqOne's phone never needs cellular signal.

## Architecture

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

## Repository layout

```
backend/     FastAPI + PostgreSQL
gateway/     LoRa gateway node code
firmware/
  buoy/      ESP32-S3 + SX1262 buoy firmware (PlatformIO)
mobile/      Flutter app
docs/        numbered specs — read 00_START_HERE.md first
```

## Build order

Strictly sequential — do not jump ahead. Details in `docs/00_START_HERE.md`.

1. Deployed skeleton — FastAPI on Railway, green `/healthz`, migrations run.
2. Two radios talk — raw LoRa packet between two ESP32s.
3. Buoy → gateway → backend — a real SOS row from a button press.
4. Phone → buoy → backend — phone in airplane mode, SOS lands.
5. Dashboard live feed + acknowledge — ack persists across a reload.
6. Range test outdoors — record actual metres.
7. Freeze, rehearse ×3, record screencast.

## Setup

### Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate        # Windows
pip install -r requirements.txt
```

Copy `backend/.env.example` to `.env` and set `DATABASE_URL` (local Postgres)
or point it at a hosted instance. Run migrations and start the API:

```bash
alembic upgrade head
uvicorn app.main:app --reload
```

Healthcheck: `GET /healthz` returns `{"status": "ok"}`.

### Firmware (PlatformIO)

```bash
cd firmware/buoy
pio run -e esp32s3
```

### Mobile (Flutter)

```bash
cd mobile
flutter pub get
flutter analyze
flutter test
```

### Gateway

See `gateway/README.md` once it exists (Arnold).

## Shared contracts

| Contract | Doc |
|---|---|
| LoRa binary frame | `docs/02_LOAM_PACKET_SPEC.md` |
| Phone ↔ buoy WiFi HTTP | `docs/03_PHONE_BUOY_WIFI.md` |
| Gateway → backend HTTPS | `docs/04_INGEST_API.md` |
| Public REST + SSE | `docs/05_PUBLIC_API.md` |
| Delivery states | `docs/06_DELIVERY_STATES.md` |
| Scoped-out decisions | `docs/07_SCOPE_OUT.md` |
| Build status | `docs/08_DEMO_AND_STATUS.md` |

If a contract changes, update the doc first and tell the people who consume it.

## Out of scope (do not implement)

No AI model, no catch logging, no advisories, no photos, no float-plan, no
BFAR/LGU regulator roles. Full rationale: `docs/07_SCOPE_OUT.md`.

## Team

| Person | Owns |
|---|---|
| Lenard | Lead dev — backend, architecture, deployment |
| Arnold | Full stack — ingest pipeline, gateway |
| Daniel | Hardware/firmware — buoy. Critical path. |
| Jade | Dashboard |
| Doreen Kay | UI/UX, pitch deck |
