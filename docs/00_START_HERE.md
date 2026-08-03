# 00 — START HERE

## The problem

Small-scale fishermen in New Washington, Aklan, Philippines work in an
environment with no mobile signal. Team field interviews established this is
not an edge case — **when fishermen go out to fish, all of them are in a
cellular dead zone.**

Consequences today:
- No way to call for help from the water.
- MDRRMO (the local disaster-response office) typically learns about a
  capsizing hours later, by word of mouth.
- Every consumer safety app stops working exactly where it is needed.

## The solution

Anchored buoys carrying an ESP32-S3, an SX1262 LoRa radio, and a WiFi access
point. A fisherman's phone joins the nearest buoy's WiFi and hands off a
message. Buoys relay it over LoRa toward a gateway node with internet, which
forwards it to the backend, which pushes it to the regulator dashboard.

The phone never needs cellular signal.

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

## Users and roles

| Role | Enum value | Sees |
|---|---|---|
| Fisherman | `fisherman` | Mobile app only. Sends SOS, sees own status. |
| MDRRMO responder | `mdrrmo` | Dashboard. Live SOS feed, acknowledge. |
| Admin | `admin` | Everything MDRRMO sees. |

BFAR/LGU regulator roles existed in v1 and are **out of scope** for this build.

## Team and ownership

| Person | Owns |
|---|---|
| Lenard | Lead dev — backend, architecture, deployment |
| Arnold | Full stack — ingest pipeline, gateway |
| Daniel | **Hardware/firmware — buoy. Critical path.** |
| Jade | Dashboard |
| Doreen Kay | UI/UX, pitch deck |

Daniel is on the critical path. The buoy is the product; if firmware slips,
everything else is decoration.

## Build order

Strictly sequential. Do not start a step before the previous one demonstrably
works.

1. **Deployed skeleton** — FastAPI on Railway, green healthcheck, migrations
   run. (~1 hr)
2. **Two radios talk** — raw LoRa packet between two ESP32s, no protocol yet.
   (~1 hr, parallel with 1)
3. **Buoy → gateway → backend** — button press on a buoy creates a real SOS
   row via radio. (~1.5 hr)
4. **Phone → buoy → backend** — phone in airplane mode, SOS lands. (~2 hr)
5. **Dashboard live feed + acknowledge** — full path visible. (~1 hr)
6. **Range test outdoors** — record the actual metres achieved. (~1 hr)
7. **Freeze, rehearse ×3, record screencast.**

## Definition of done for the whole build

- [ ] Phone in airplane mode sends an SOS that reaches the dashboard
- [ ] Dashboard acknowledge persists across a reload
- [ ] The four delivery states are visible and honest in the app
- [ ] Deployed, healthcheck green, demo URL reachable from outside the venue
- [ ] Repo public, no secrets, README with setup instructions
- [ ] Screencast recorded
- [ ] `docs/08_DEMO_AND_STATUS.md` status table reflects reality

## What we are deliberately not building

See `docs/07_SCOPE_OUT.md` for the full list. Short version: no AI model, no
catch logging, no advisories, no photos, no float-plan, no BFAR/LGU regulator
roles. These are documented as scoped-out decisions, not gaps — and are
presented that way in Q&A.

## Time budget

| Block | Hours |
|---|---|
| Day 1 afternoon (Aug 3, post-orientation) | 2.5 |
| **Night 1 (Aug 3→4) — main integration push** | **7.0** |
| Day 2 build (Aug 4, 1–5 pm) | 4.0 |
| Day 3 (Aug 5, hard stop ~10:30 am) | 2.0 |
| **Total** | **~15.5** |

Deliverables may be due 5:00 pm Aug 4. Plan for that.
