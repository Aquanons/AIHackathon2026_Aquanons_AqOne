# AqOne Week 1: Dashboard and Flutter Implementation Plan

**Sprint window:** 17-23 August 2026
**Primary outcome:** a phone can save an SOS locally, hand it to the buoy over Wi-Fi, display an honest delivery state, and make the same SOS visible and actionable on the dashboard.

This file is the execution contract for the coding agent. It is not a statement that the described behavior already works.

## Scope

### In scope

- Flutter-to-buoy HTTP and WebSocket contract repair.
- Flutter outbox, delivery-state, buoy-status, and responder-ETA behavior.
- Dashboard live-feed honesty, incident handling, stale/error states, and safe rendering.
- Small backend/API changes required to support these two clients safely.
- Automated contract, unit, widget, and browser-JavaScript tests.
- Documentation and commit discipline.

### Explicitly out of scope

- LoRa relay, gateway implementation, radio firmware, TinyML, new AI models, PostGIS migration, full visual redesign, family portal, and secure OTA.
- Treating mock, generated, or hardcoded records as live telemetry.
- Editing the user-supplied `AqOne_Technical_Profile_Aquanons-1.docx`.

## Hard reset: rules that override every task

1. **Inspect before changing.** At the start of every phase, read `AGENTS.md`, run `git status --short`, inspect the relevant source files, and compare the plan against the actual code. Do not assume a route, model field, endpoint, or test already exists.
2. **Do not guess.** If code, firmware, README, or API behavior conflicts with this plan, stop the phase. Mark it `BLOCKED` in the status table with exact file/line evidence and continue only with work that is independent of the conflict.
3. **One source of truth.** Canonical Wi-Fi endpoint, WebSocket endpoint, JSON field names/types, delivery states, and error messages must be documented and covered by fixtures/tests. Do not maintain parallel incompatible contracts.
4. **No fake operational state.** Demo and synthetic data must be visibly labelled. A failed refresh must show a stale/degraded state; it must never keep a permanent `LIVE` label.
5. **No invented test result.** Run every listed check. If a tool, dependency, hardware, or environment is unavailable, record the exact command and blocker; never report it as passing.
6. **No secret handling shortcuts.** Do not add credentials, API keys, Wi-Fi passwords, tokens, or personal data to source, fixtures, screenshots, commits, or documentation. Report existing exposed secrets rather than copying them.
7. **Preserve user work.** Never use `git reset --hard`, `git checkout --`, force-push, or `git add -A`. Do not stage the untracked technical-profile DOCX or any unrelated change.
8. **Keep scope small.** Do not refactor unrelated dashboard UI, introduce a framework, or start LoRa/ML work during this sprint without written user approval.
9. **Update this plan after every phase.** Set the phase status, record exact tests/evidence, blockers, and the commit hash in the status table before committing the phase.
10. **Commit meaningful checkpoints.** Each completed phase is one focused commit. Stage only the files belonging to that phase, review `git diff --staged`, run its required tests, then commit with the format `feat(week1): <phase outcome>` or `fix(week1): <phase outcome>`.

## Canonical contract decision for this sprint

The checked-in firmware currently serves its Wi-Fi access point at `http://192.168.4.1`, and its WebSocket service listens on port `81`. Flutter currently disagrees. The intended Week 1 contract is:

| Concern | Canonical value |
|---|---|
| Buoy HTTP base URL | `http://192.168.4.1` |
| Buoy WebSocket URL | `ws://192.168.4.1:81` |
| SOS handoff | `POST /v1/sos` |
| Buoy status | `GET /v1/status` |
| Offline responder status | `GET /v1/sos/status?vessel_id=<id>` |

Before applying this decision, verify the firmware still uses these values. If it does not, document the discrepancy and stop rather than silently changing both clients.

## Phase 0 - Baseline and contract fixtures

### Work

1. Inspect `mobile/lib/core/config.dart`, `mobile/lib/services/buoy_client.dart`, `mobile/lib/models/buoy_contact.dart`, `mobile/lib/ui/chathubb.dart`, `firmware/buoy/AqOneBuoy/AqOneBuoy.ino`, `web/js/dashboard.js`, and the SOS API routes.
2. Create one concise contract document or fixture set covering the real JSON returned by:
   - `POST /v1/sos`
   - `GET /v1/status`
   - `GET /v1/sos/status`
   - dashboard `GET /api/sos/active`
3. Add non-sensitive JSON fixtures for accepted SOS, full queue, buoy offline, no ETA, and acknowledged ETA.
4. Establish the baseline commands and write their actual result below.

### Required checks

```text
cd backend && pytest -q
cd backend && ruff check .
cd mobile && flutter analyze
cd mobile && flutter test
node --check web/js/dashboard.js
```

### Commit

`docs(week1): add dashboard and Flutter contract fixtures`

## Phase 1 - Flutter buoy contract and delivery states

### Work

1. Set one configurable buoy HTTP/WebSocket endpoint using the verified canonical contract.
2. Update Android cleartext configuration only for the chosen local buoy endpoint; do not weaken transport settings globally.
3. Make `BuoyStatus` and `BuoyAck` parse the actual firmware response types, including the string buoy identifier and queue/uplink fields.
4. Repair chat WebSocket host/port/path only after verifying the firmware endpoint.
5. Add graceful buoy errors: unreachable, queue full, invalid response, and no shore link.
6. Preserve the outbox before any network attempt. Delivery state must advance only on confirmed evidence.
7. Add unit/widget tests using Phase 0 fixtures.

### Required checks

```text
cd mobile && flutter analyze
cd mobile && flutter test
```

### Commit

`fix(week1): align Flutter with buoy contract`

## Phase 2 - Offline acknowledgement and ETA

### Work

1. Add a `BuoyClient` method for `GET /v1/sos/status?vessel_id=<id>`.
2. When the cloud is unreachable, reconcile pending SOS records through the buoy endpoint instead of giving up.
3. Parse responder acknowledgement, ETA, responder status, and notes without reducing an already confirmed delivery state.
4. Clearly distinguish these messages in the UI:
   - "Saved on this phone"
   - "Held by buoy"
   - "Reached shore"
   - "MDRRMO has responded"
5. Add tests for cloud unavailable + buoy ETA, no events, malformed buoy response, and delayed ETA.

### Required checks

```text
cd mobile && flutter analyze
cd mobile && flutter test
```

### Commit

`feat(week1): return responder ETA through buoy`

## Phase 3 - Dashboard operational honesty and safety

### Work

1. Replace the unconditional `LIVE` presentation with one driven by the most recent successful SOS refresh.
2. Display `Live`, `Stale`, `Offline`, or `Demo data` only when supported by actual state.
3. Show the last successful refresh time and a visible failure state.
4. Ensure sample buoy/vessel/incidents cannot be mistaken for live records. Keep them in a clearly labelled demo mode or remove them from the operational view.
5. Escape all server-provided text before rendering it into HTML, tooltips, or popups.
6. Keep the current polling approach unless a tested backend streaming endpoint exists; do not claim SSE.
7. Extract pure JavaScript helpers for escaping text and classifying feed freshness into a testable module.
8. Add Node tests for escaping, fresh/stale/offline transitions, and synthetic/demo badges.

### Required checks

```text
node --check web/js/dashboard.js
node --test web/test/dashboard-utils.test.js
cd backend && pytest -q
cd backend && ruff check .
```

### Commit

`fix(week1): make dashboard incident state honest and safe`

## Phase 4 - Minimal API safety and release evidence

### Work

1. Validate public SOS text lengths and reject invalid payloads safely.
2. Ensure only authorized roles can acknowledge, resolve, or publish advisories; do not change the unauthenticated SOS intake without a documented emergency-access design.
3. Add backend tests for authorization, length validation, and escaped dashboard input fixtures.
4. Update the root README and demo/status document only for behavior actually verified this week.
5. Build a fresh APK only after all Flutter tests pass. Record version, checksum, build command, and installation test result in this plan.

### Required checks

```text
cd backend && pytest -q
cd backend && ruff check .
cd mobile && flutter analyze
cd mobile && flutter test
node --check web/js/dashboard.js
node --test web/test/dashboard-utils.test.js
```

### Commit

`feat(week1): verify dashboard and Flutter release slice`

## Definition of done

Week 1 is complete only when all statements below are demonstrated and recorded:

- [ ] Flutter and firmware use one verified Wi-Fi/JSON contract.
- [ ] A local SOS is persisted before network calls.
- [ ] Flutter correctly handles buoy accepted, full, unreachable, and no-uplink cases.
- [ ] An offline handset can receive a responder ETA through the buoy endpoint.
- [ ] Dashboard incident state shows freshness/error truthfully and escapes user-provided text.
- [ ] Demo/synthetic data is visibly identified.
- [ ] Authorization and input-validation tests pass.
- [ ] Flutter, backend, and dashboard checks have recorded results.
- [ ] A fresh APK is built and installed on a physical Android device.
- [ ] This plan, README, and status documentation match the demonstrated behavior.

## Phase status and evidence log

The coding agent must update this table after completing or blocking every phase, then include this file in that phase's commit.

| Phase | Status | Evidence / exact test result | Commit |
|---|---|---|---|
| Phase 0 - Baseline and contract fixtures | DONE (checks partially blocked by sandbox environment) | Contract doc `docs/21_WEEK1_CONTRACT_FIXTURES.md` + fixtures in `fixtures/week1_contract/` added, ground-truthed against firmware/backend source, not docs. Canonical contract (192.168.4.1, ws port 81, /v1/sos, /v1/status, /v1/sos/status) confirmed correct against firmware. Found: config.dart buoyBaseUrl wrong (10.0.0.1 vs 192.168.4.1), chathubb.dart WS URL wrong (missing :81, wrong path), BuoyStatus/BuoyAck field mismatches (buoy_id is a string not int; status uses queue_depth not queued; no batt/mesh fields exist), docs/03 stale, dashboard LIVE badge is static markup with no stale/offline state, XSS gap in alert `desc` rendering, hardcoded WiFi password in firmware source (`Sams21_Hotel` / reported not reproduced further). Checks: `node --check web/js/dashboard.js` PASS. `cd backend && ruff check .` PASS except 1 finding (`app/api/metrics.py:31` W292 missing trailing newline, not fixed this phase - out of Phase 0 work list). `cd backend && pytest -q` BLOCKED - sandbox Python is 3.10.12, `requirements.txt` numpy==2.4.6 needs >=3.11; minimal install collects but fails on `datetime.UTC` (3.11+) in `app/api/advisories.py` and `tests/test_trip_profile.py`, 15 collection errors, 0 tests run. `cd mobile && flutter analyze` / `flutter test` BLOCKED - no Flutter SDK present in this sandbox. | `8133add3888824d17581ba4a0ece22b5aa91a574` |
| Phase 1 - Flutter buoy contract and delivery states | DONE (checks BLOCKED - no Dart/Flutter toolchain in this sandbox, code reviewed manually instead) | Set `AqOneConfig.buoyBaseUrl` to `http://192.168.4.1` (was `10.0.0.1`) and added `AqOneConfig.buoyWsUrl(host)` as the one source of truth for the buoy WS URL; `network_security_config.xml` cleartext exception moved from `10.0.0.1` to `192.168.4.1` (was permitting cleartext for a host the app never talks to while blocking the real one). `chathubb.dart` now connects to `ws://192.168.4.1:81` via `AqOneConfig.buoyWsUrl` instead of `ws://192.168.4.1/ws` (wrong port, wrong path - firmware's chat WS has no path routing). `BuoyStatus`/`BuoyAck.buoyId` changed `int`→`String` to match the firmware's string `BUOY_ID`; `BuoyStatus` now parses `uplink`/`queue_depth`/`clients` (the fields the firmware actually sends) instead of the fictional `batt`/`mesh`/`queued`; `BuoyAck.srcId` removed (firmware's `POST /v1/sos` response has no such field). Propagated the `buoyId` type change through `SosRecord`, `OutboxStore.advance()`, `app_database.dart` (schema v5→v6, `buoy_id` column `INTEGER`→`TEXT`, no data migration needed since SQLite already stores TEXT fine in that column) and the two UI widgets that render it. `BuoyStatusCard` rewritten to show the firmware's real `uplink` state with the buoy's own captive-portal wording, and to never show a battery percentage (the firmware sends none). Added `BuoyInvalidResponse` to `buoy_client.dart`, distinct from `BuoyUnreachable`, for a buoy that answers with malformed/truncated JSON (the firmware's 320-byte response cache can truncate an ETA reply mid-JSON) instead of misreporting it as "no buoy nearby." Outbox-before-network-attempt and forward-only delivery-state merge were already correct in `sos_service.dart`/`outbox_store.dart` - verified, not changed. New `mobile/test/buoy_client_test.dart` exercises `handoff()`/`status()` against `fixtures/week1_contract/accepted_sos.json` and `queue_full.json` plus a simulated unreachable buoy and a simulated truncated response. Updated `mobile/test/widget_test.dart` and `mobile/test/sos_record_test.dart` for the new field shapes. Checks: `cd mobile && flutter analyze` / `flutter test` BLOCKED - no Flutter or Dart SDK installed in this sandbox (confirmed via `which flutter`/`which dart`, both empty). All edited/created `.dart` files were instead read back in full and manually checked for syntax/type consistency (matching constructor params, consistent `buoyId` typing end-to-end, no remaining references to the removed `MeshHealth`/`srcId`/`battery` symbols - verified by grep). This is not a substitute for `flutter analyze`/`flutter test` and both must be run on a machine with the Flutter SDK before this phase is trusted. | `pending` |
| Phase 2 - Offline acknowledgement and ETA | DONE (checks BLOCKED - no Dart/Flutter toolchain in this sandbox, code reviewed manually instead) | Added `BuoyClient.sosStatus(vesselId)` for `GET /v1/sos/status?vessel_id=<id>`, reusing `RemoteSos.fromJson` from `backend_client.dart` rather than a second parser, since the firmware proxies `GET /api/sos/vessel/{id}` verbatim (docs/21). `SosService.reconcile()` now checks `_backend.isReachable()` once per tick and, when the cloud is down, calls `_buoy.sosStatus(vesselId)` per pending vessel instead of returning immediately as it did before; matching/merge logic was extracted into `_applyRemote()` and is shared by both sources so behavior cannot drift between them. A buoy failure (unreachable/rejected/invalid JSON) for one vessel is caught and skipped per-vessel so it cannot block reconciliation for other vessels in the same tick. Delivery-state advancement continues to go through `OutboxStore.advance()`'s forward-only merge, so neither source can regress an already-confirmed state. Verified the plan's four required distinct UI messages ("saved on this phone" / "held by buoy" / "reached shore" / "MDRRMO has responded") are already satisfied by `DeliveryState`'s existing `title`/`description` pairs, which are the docs/06_DELIVERY_STATES.md canonical copy - deliberately did not add a second, possibly-conflicting set of labels elsewhere (rule 3, one source of truth). New tests in `mobile/test/buoy_client_test.dart` (`BuoyClient.sosStatus` group) cover the plan's four required scenarios: buoy ETA (`eta_acknowledged.json`), no events (`no_eta.json`), a body truncated by the firmware's real 320-byte cache limit, and a delayed responder status (5) carried through intact for the countdown UI. Manual review caught and fixed a real bug before commit: `reconcile()` initially called `_applyRemote()` without `await` (a `Future<bool>` used directly in an `if`), which `flutter analyze` would have caught instantly - recorded here precisely because the toolchain that should have caught it is unavailable in this sandbox. Checks: `cd mobile && flutter analyze` / `flutter test` BLOCKED - no Flutter/Dart SDK in this sandbox (same blocker as Phase 1). Every touched file was read back in full after editing and checked by hand for type/control-flow consistency; this is not a substitute for the real checks. | `418651aba1e954044fe25f32c76541af9364826e` |
| Phase 3 - Dashboard operational honesty and safety | NOT STARTED |  |  |
| Phase 4 - Minimal API safety and release evidence | NOT STARTED |  |  |

## Required final handoff

At the end of Week 1, report:

1. Completed phases and commit hashes.
2. Commands run and their complete pass/fail summaries.
3. Exact unresolved blockers, especially hardware or dependency blockers.
4. What is real, mocked, simulated, and untested.
5. The next recommended task for Week 2.
