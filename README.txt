# AqOne

**Maritime distress alerting for small-scale fishermen working in cellular dead
zones — New Washington, Aklan, Philippines.**

Built for the 2026 AI Hackathon (Blue Economy track) by **Team Aquanons**.

> ⚠️ **Status: hackathon prototype.** See [Project status](#project-status)
> below for a precise, per-capability breakdown of what is working, what is
> simulated, and what is deliberately not built. We would rather be accurate
> than impressive.

---

## The problem

We interviewed small-scale fishermen in New Washington, Aklan. The finding that
shaped this entire project:

> **When they go out to fish, all of them lose cellular signal. The fishing
> ground is a dead zone.**

This makes the situation worse than "no safety app installed":

- There is no way to call for help from the water.
- The MDRRMO (municipal disaster-response office) typically learns about a
  capsizing **hours later, by word of mouth**.
- Every consumer safety app — and every phone-based SOS feature — stops working
  precisely where fishermen need it.

A system that only works when you have signal does not solve this problem.

## What AqOne does

Anchored buoys form a LoRa radio mesh across the fishing ground. A fisherman's
phone connects to the nearest buoy over WiFi and hands off a distress message.
Buoys relay it over LoRa to a gateway node with internet access, which forwards
it to the backend and onto the MDRRMO dashboard on shore.

**The phone never needs cellular signal.**

The claim this project is built to demonstrate:

> An SOS sent from a phone in **airplane mode**, carried over real radio,
> appearing on a regulator dashboard.

---

## Architecture

```
┌───────────────┐  WiFi SoftAP   ┌──────────────────────┐
│ Vessel phone  │ ─────────────► │ Buoy (ESP32-S3)      │
│ Flutter       │                │ • SX1262 LoRa        │
│ • SQLite      │ ◄───────────── │ • MPU6050 (optional) │
│   outbox      │   buoy ack     │ • store & forward    │
│ • works in    │                │ • signs every packet │
│   airplane    │                └──────────┬───────────┘
│   mode        │                           │ LoRa
└───────────────┘                           ▼
                                 ┌──────────────────────┐
                                 │ Buoy N (relay, TTL--)│
                                 └──────────┬───────────┘
                                            │ LoRa
                                            ▼
                                 ┌───────────────────────┐
                                 │ GATEWAY (has internet)│
                                 │ • verifies signature  │
                                 │ • external ID → UUID  │
                                 │ • HTTPS to backend    │
                                 └──────────┬────────────┘
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

**Design notes**

- **Store-and-forward at every hop.** If no path to a gateway exists right now,
  the message is queued and retried. An SOS is never dropped.
- **Every radio frame is authenticated** with a per-device HMAC key. An
  unsigned frame is not a message.
- **Idempotent end to end.** Each message carries a ULID generated on the
  originating device; duplicate delivery over multiple mesh paths is expected
  and deduplicated.
- **46-byte binary frames.** A LoRa payload is far too small for JSON, so the
  radio carries a packed binary frame and the gateway expands it to JSON for
  HTTP.

Full protocol specification: [`docs/01_CONTRACTS.md`](docs/01_CONTRACTS.md).

---

## Project status

Legend: ✅ working & demonstrated · 🟡 partial · ⬜ not yet · ❌ deliberately out of scope

<!-- TODO: update this table as capabilities land. Never mark ✅ until it has
     been run end to end. A judge finding one false claim invalidates every
     true one. -->

| Capability | Status | Notes |
|---|---|---|
| SOS over LoRa mesh, phone offline | ⬜ | The core claim |
| Signed frames + replay protection | ⬜ | Per-device HMAC, ULID dedupe |
| Store-and-forward at buoy | ⬜ | |
| Multi-hop relay (3+ nodes) | ⬜ | Expect bench-tested only — will state so |
| Buoy hazard sensing (MPU6050) | ⬜ | Sensor-bypass mode available |
| Dashboard live feed + acknowledge | ⬜ | |
| Deployed backend, healthcheck green | ⬜ | |
| Measured LoRa range on water | ⬜ | `TBD` metres at SF9 — will report measured, not datasheet |
| AI hotspot prediction model | ❌ | **Deliberately not built** — see [AI status](#ai-status) |
| Catch-decline detection | ❌ | Deliberately out of scope for this build |
| Catch logging / photo upload | ❌ | Deliberately out of scope |
| Push notifications | ❌ | Roadmap |
| Aklanon localisation | ❌ | Roadmap |

---

## AI status

**We did not ship a machine-learning model, and this is a deliberate decision.**

A hotspot-prediction model needs a non-circular target, independent
environmental features, and enough real catch data to learn from. At this stage
we have none of the three:

- The obvious target (*"is this zone productive?"*) is derived from catch
  volume, and the available features **are** catch volume — the model would be
  predicting a quantity from itself. In an earlier prototype this produced
  ~0.99 accuracy against a 0.50 baseline, which measured nothing.
- The environmental inputs that would provide genuine signal (sea-surface
  temperature, currents) are not yet ingested.
- Catch data comes from adoption, and adoption has not happened yet.

Because a flagged zone can affect real fishing livelihoods, we scoped the model
out rather than ship an unvalidated number with a confidence score attached.

Our sequencing is deliberate: **safety drives adoption → adoption generates
catch data → catch data enables the model.** The safety layer in this
repository is step one of that chain.

The training pipeline design, validation strategy (temporal + zone-grouped
splits, mandatory baseline reporting), and staged rollout are documented for
post-MVP work.

---

## Hardware declaration

*Required disclosure — hardware used and how its data is consumed.*

| Component | Role |
|---|---|
| **ESP32-S3** microcontroller | Buoy compute; runs firmware, WiFi SoftAP, LoRa driver, store-and-forward queue |
| **SX1262** LoRa transceiver | Buoy-to-buoy and buoy-to-gateway radio link. `TBD` MHz ISM band. |
| **MPU6050** 6-axis IMU | *Optional.* Samples buoy tilt/motion for wave-condition classification |
| Push button + status LED | Test-trigger and field debugging |
| Battery / power management | Buoy power. Solar sizing is roadmap. |

**How hardware data is used:** the buoy transmits a 46-byte signed frame
containing message type, device ID, message ULID, timestamp, latitude,
longitude, and battery level. Position and alert type are persisted server-side
and rendered on the MDRRMO dashboard. IMU sample data itself never leaves the
buoy — only a derived classification would be transmitted, which is what allows
alerts to fire with no cloud connectivity.

**Honest limitation:** distinguishing hazardous sea states from ordinary chop on
a *moored* buoy requires per-buoy baseline calibration against real on-water
data, because mooring tension, current, and tide dominate the motion signal.
This tuning has not been performed. Hazard classification should be treated as
unvalidated.

---

## Repository layout

```
├── AGENTS.md              # entry point for AI coding agents
├── docs/                  # specifications — read 01_CONTRACTS.md first
│   ├── 00_START_HERE.md
│   ├── 01_CONTRACTS.md    # wire format, enums, API envelope — SINGLE SOURCE OF TRUTH
│   ├── 02_DATA_MODEL.md
│   ├── 03_BACKEND.md
│   ├── 04_FIRMWARE.md
│   ├── 05_FLUTTER.md
│   ├── 06_DASHBOARD.md
│   ├── 07_SECURITY.md
│   └── 08_DEMO_AND_STATUS.md
├── backend/               # FastAPI service
├── migrations/            # SQL — the only place schema exists
├── firmware/              # ESP32-S3 Arduino sketches (buoy + gateway)
├── app/                   # Flutter mobile app
├── web/                   # regulator dashboard (plain HTML/CSS/JS)
├── scripts/               # provisioning utilities
└── Dockerfile
```

---

## Setup

### Prerequisites

| Tool | Version |
|---|---|
| Python | 3.11+ |
| PostgreSQL + PostGIS | 14+ |
| Flutter | 3.x |
| Arduino IDE | 2.x, with ESP32 board support |

### 1. Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env                # then fill in — see below
python migrate.py                   # applies migrations/*.sql in order
uvicorn main:app --reload --port 8000
```

Verify:

```bash
curl http://localhost:8000/health/live      # {"ok":true,"data":{"status":"live"}}
curl http://localhost:8000/health/ready     # 200 only if DB + tables exist
```

`/health/ready` returns **503** if the database is unreachable or a required
table is missing. That is intentional — process health is not database health.

### 2. Demo accounts

Credentials come from the environment, never from committed SQL.

```bash
export DEMO_FISHERMAN_USERNAME=... DEMO_FISHERMAN_PASSWORD=...
export DEMO_MDRRMO_USERNAME=...    DEMO_MDRRMO_PASSWORD=...
python scripts/create_demo_accounts.py
```

### 3. Dashboard

Served by the backend so everything is same-origin:

```
http://localhost:8000/web/index.html
```

> **Do not open the HTML files directly from disk.** Over `file://`, relative
> `fetch('/api/...')` calls fail with "Failed to fetch". Always serve over HTTP.

### 4. Mobile app

```bash
cd app
flutter pub get

# Android emulator (10.0.2.2 = host machine)
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:8000

# Physical device against production
flutter build apk --release --dart-define=API_BASE_URL=https://<your-app>.up.railway.app
```

### 5. Firmware

1. Arduino IDE → **Boards Manager** → install `esp32` by Espressif.
2. **Library Manager** → install `RadioLib`. Add `Adafruit MPU6050` +
   `Adafruit Unified Sensor` only if using the IMU.
3. Open `firmware/provision/provision.ino`, set the device ID and key, flash
   once per device. Keys live in NVS — **never** in source.
4. Register the device server-side:
   ```bash
   python scripts/provision_device.py --external-id 7f3a2b1c9d40 --kind buoy
   ```
5. Open `firmware/node/node.ino`, set `NODE_ROLE` to `ROLE_BUOY` or
   `ROLE_GATEWAY`, confirm `LORA_FREQ_MHZ` matches your physical module, flash.

> **Confirm your module's frequency band before flashing.** A 433 MHz module
> will not work at 915 MHz, and the failure is silent — no error, just nothing
> received. Every node must share identical radio parameters.

> **Attach the antenna before transmitting.** Transmitting without one can
> damage the SX1262.

### 6. Tests

```bash
cd backend && python -m unittest discover -s . -p "test_*.py"
cd app     && flutter test
node --check web/js/*.js
```

Integration tests run against a real PostgreSQL instance. Unit tests using fake
database connections cannot verify SQL behaviour and are not treated as
sufficient.

---

## Environment variables

Every variable the application reads is documented in `.env.example`.

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `JWT_SECRET` | ✅ | Signs login tokens. 64+ random chars. |
| `AQONE_GATEWAY_SECRET` | ✅ | Shared secret the gateway sends as `X-AqOne-Gateway-Secret` |
| `JWT_EXPIRY_HOURS` | | Token lifetime. Default `12`. |
| `MESH_TS_SKEW_SECONDS` | | Replay window for device timestamps. Default `900`. |
| `DASHBOARD_ORIGIN` | | CORS origin for the dashboard |
| `PORT` | | Server port. Default `8000`. |
| `DEMO_*` | | Demo account provisioning (see above) |

Generate secrets with:

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

---

## Deployment

Deployed on Railway from the root `Dockerfile`. Migrations run automatically at
container start, before Uvicorn.

`railway.json` sets `healthcheckPath: /health/ready`, so a deploy is only
promoted once the database is genuinely reachable and the schema is present.

---

## Security

Full threat model: [`docs/07_SECURITY.md`](docs/07_SECURITY.md).

**Implemented**

- Per-device HMAC-SHA256 keys; every LoRa frame authenticated (8-byte truncated
  tag — LoRaWAN itself uses a 4-byte MIC for this same constrained link)
- Replay protection: ULID primary key on the ingest log + timestamp window
- Device revocation via the device registry
- Constant-time signature comparison
- Bearer JWT with server-side authorisation on every mutating route
- Parameterised SQL exclusively
- HTML escaping of all server-supplied strings before render
- Generic error responses — no exception text returned to clients
- CORS restricted to the dashboard origin
- Secrets in environment only; no credentials in the repository

**Explicitly not mitigated** — stated plainly rather than glossed over:

- **RF jamming.** Any radio system at this budget is jammable.
- **A physically stolen buoy** holds a valid key until revoked.
- **No mesh confidentiality.** Frames are authenticated, not encrypted.
  Contents are position and alert type, so integrity matters more than secrecy
  here; AES-CCM is a straightforward post-MVP addition.
- **No formal security audit or penetration test** has been performed.

---

## Data sources & ethics

**First-party data** (this build): distress messages, GPS coordinates, and
device telemetry submitted by consenting users through the app. No scraped data,
no purchased data, no synthetic data.

**Planned secondary sources** (not yet ingested): Open-Meteo (weather/marine),
NASA ERDDAP / PO.DAAC (SST, currents), PAGASA (storm advisories), NAMRIA
(nautical charts), BFAR (municipal catch baselines). All open government or
public/scientific sources; terms will be confirmed before any production
deployment.

**Privacy considerations**

- A fisherman's productive fishing grounds are commercially sensitive. Any
  future catch-location storage will be coarsened to a ~1 km zone grid rather
  than exact coordinates.
- Precise coordinates are retained only where operationally necessary — a
  distress alert is useless without them.
- Retention and anonymisation policies are designed but **not yet implemented**.

**Bias considerations.** AqOne is decision-support only; it never restricts
fishing. Any future catch-decline flag will require a minimum number of
independent reporters before surfacing, so that sparsely-reported zones are not
systematically disadvantaged, and any restriction decision remains with BFAR or
the LGU.

---

## Third-party components

| Component | Use | Licence |
|---|---|---|
| [FastAPI](https://fastapi.tiangolo.com/) | Backend framework | MIT |
| [asyncpg](https://github.com/MagicStack/asyncpg) | PostgreSQL driver | Apache-2.0 |
| [PostgreSQL](https://www.postgresql.org/) + [PostGIS](https://postgis.net/) | Database, geospatial | PostgreSQL / GPL-2.0 |
| [PyJWT](https://pyjwt.readthedocs.io/) | Token signing | MIT |
| [bcrypt](https://github.com/pyca/bcrypt) | Password hashing | Apache-2.0 |
| [Flutter](https://flutter.dev/) | Mobile app | BSD-3-Clause |
| [sqflite](https://pub.dev/packages/sqflite) | Durable offline outbox | MIT |
| [geolocator](https://pub.dev/packages/geolocator) | GPS | MIT |
| [RadioLib](https://github.com/jgromes/RadioLib) | SX1262 LoRa driver | MIT |
| mbedtls (ESP32 core) | HMAC-SHA256 on-device | Apache-2.0 |

**No third-party AI models are used.** No OpenAI, HuggingFace, or other hosted
model is called anywhere in this codebase.

---

## Team — Aquanons

| Member | Role |
|---|---|
| Lenard | Lead developer — backend, architecture, deployment |
| Arnold | Full stack — ingest pipeline, gateway |
| Daniel | Hardware & firmware — buoy |
| Jade | Regulator dashboard |
| Doreen Kay | UI/UX, pitch |

---

## Roadmap

1. Field-calibrate hazard classification against real on-water data
2. Multi-hop mesh validation with 4+ buoys at operational spacing
3. Solar power budget and duty-cycled SoftAP for long deployment
4. Float-plan check-ins (declared return time) — works with zero buoy coverage
5. Environmental data ingestion → feature store
6. Catch-decline detection (statistical, interpretable, regulator-facing)
7. Hotspot model — only once sufficient real catch data exists
8. Aklanon localisation and accessibility work

---

## Licence

<!-- TODO: choose one. MIT is the usual default for hackathon work. -->
`TBD`
