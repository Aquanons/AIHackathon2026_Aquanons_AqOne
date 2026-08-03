# 08 — Demo & Status

Single source of truth for build status. Keep it honest — this table is a
definition of done (`docs/00_START_HERE.md`). Update it when a step demonstrably
works, and record the range test result here.

## Build status

Legend: `⛔ not started` · `🟡 in progress` · `🟢 done`

| Step | Build-order item | Status | Notes |
|---|---|---|---|
| 1 | Deployed skeleton — FastAPI on Railway, green `/healthz`, migrations run | ⛔ not started | |
| 2 | Two radios talk — raw LoRa between two ESP32s | ⛔ not started | |
| 3 | Buoy → gateway → backend — button press creates a real SOS row | ⛔ not started | |
| 4 | Phone → buoy → backend — airplane-mode SOS lands | ⛔ not started | |
| 5 | Dashboard live feed + acknowledge — ack persists | ⛔ not started | |
| 6 | Range test outdoors — actual metres | ⛔ not started | |
| 7 | Freeze, rehearse ×3, record screencast | ⛔ not started | |

## Whole-build definition of done

- [ ] Phone in airplane mode sends an SOS that reaches the dashboard
- [ ] Dashboard acknowledge persists across a reload
- [ ] The four delivery states are visible and honest in the app
- [ ] Deployed, healthcheck green, demo URL reachable from outside the venue
- [ ] Repo public, no secrets, README with setup instructions
- [ ] Screencast recorded
- [ ] This status table reflects reality

## Range test log

| Date | Conditions | Distance (m) | Result | Notes |
|---|---|---|---|---|
| — | | | | record the real figure here (step 6) |

## Demo checklist

- [ ] Airplane mode on the demo phone
- [ ] SOS from the app reaches the dashboard live
- [ ] MDRRMO acknowledge persists after reload
- [ ] Healthcheck green at the public URL
- [ ] Spare batteries + cables on stage

## Rehearsal log

| # | Time | Result | Fix applied |
|---|---|---|---|
| 1 | | | |
| 2 | | | |
| 3 | | | |
