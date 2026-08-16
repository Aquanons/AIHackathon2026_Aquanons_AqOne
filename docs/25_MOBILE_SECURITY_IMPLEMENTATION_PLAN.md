# 25 — Mobile Security Implementation Plan

**Audience:** GPT-5.4 or another implementation agent working in this
repository.

**Objective:** Improve the security and privacy of the Flutter-facing product
without preventing a fisherman from raising an SOS when offline or unauthenticated.

**Scope:** `mobile/` and the FastAPI routes that the mobile app calls. This is
not a plan to give Flutter direct database access, nor a plan to add PostgreSQL
row-level security yet.

## Non-negotiable product constraints

1. A fisherman must be able to queue and hand off an SOS in airplane mode.
   Do not make an SOS depend on login, an internet connection, a cloud token
   refresh, or a third-party service.
2. The buoy's local Wi-Fi hop is the one transport exception: HTTP and WebSocket
   may be used only with the documented buoy address. Every internet-facing
   request must use HTTPS.
3. The Flutter client is not a trust boundary. Values from the app, including
   `vessel_id`, location, delivery state, and any future device token, must be
   validated and authorized by the backend.
4. Do not add a secret to Dart source, build arguments committed to Git,
   `SharedPreferences`, SQLite plaintext, URLs, logs, or test fixtures.
5. Do not alter the LoRa frame, buoy HTTP contract, delivery-state language, or
   public API contract without updating the applicable numbered contract document
   first and identifying every affected owner.
6. Do not claim a control is implemented until its specified automated check has
   run successfully on an environment that can actually run it.

## Agent operating contract — mandatory for every phase

Before touching code in a phase:

1. Read `AGENTS.md`, this document, `docs/guides/07_SECURITY.md`, and the
   relevant API/Flutter contract documents.
2. Run `git status --short` and record pre-existing changes in the phase log.
   They belong to another contributor unless the user explicitly says otherwise.
3. Identify the exact files expected to change. If an expected target is already
   dirty with someone else's work, **STOP**. Do not overwrite, reset, stash,
   reformat, or commit it. Report the conflict and wait for direction.
4. Mark the phase `IN PROGRESS` in the status table below before implementation.

At the end of every attempted phase — complete, blocked, or rejected:

1. Update this file in the same change set. Set the real status, list changed
   files, record commands run and their outcomes, state remaining risk, and
   name the next hard stop. Never write “verified” when the command was not run.
2. Run the phase verification commands plus `git diff --check`.
3. Re-read the diff for secrets, accidental data collection, broad network
   permission changes, and changes outside the declared files.
4. If verification passes, create one path-scoped commit for that major phase.
   Stage only the files named in the phase log; never use `git add -A` or commit
   an unrelated staged change. Use the prescribed commit subject when provided.
5. If verification is blocked, do not mark the phase complete. Commit only the
   documentation update if it contains useful, truthful evidence and does not
   include anyone else's changes.

**Commit rule:** A major phase is not finished until its implementation and this
file's updated status are committed together. A later agent must begin from the
last committed status, not from assumptions in chat history.

## Current repository facts — treat these as verified starting context

- Flutter calls FastAPI over HTTP(S); it does **not** connect to PostgreSQL.
  `backend/app/db.py` uses one server-side connection pool.
- The default cloud backend URL is HTTPS. The local buoy default is
  `http://192.168.4.1`; Android allows cleartext only for that address in
  `mobile/android/app/src/main/res/xml/network_security_config.xml`.
- Fisherman identity is a locally generated, self-declared `vessel_id` in
  `mobile/lib/data/identity_store.dart`. It is not a credential.
- SOS submission, SOS status lookup, and catch submission currently include
  unauthenticated mobile-facing routes. This is a deliberate emergency-flow
  trade-off, but it means privacy and ownership cannot be fixed in Flutter alone.
- The app stores identity and outbox data in SQLite. It has no secure-storage
  dependency today. `SharedPreferences` is used for non-secret settings and a
  chat queue; it must never become credential storage.

## Out of scope unless the user explicitly approves it

- Requiring a fisherman password, account creation, or online login before SOS.
- Flutter-to-PostgreSQL access, Supabase migration, or row-level security.
- Certificate pinning. Do not add it until a certificate-rotation owner and
  tested outage recovery runbook exist; a stale pin can block an emergency call.
- Root/jailbreak detection that blocks the app or SOS. It is not reliable enough
  to be an availability gate.
- Collecting background location, contacts, microphone data, photos, or new
  identifiers merely for security telemetry.

## Status table — update on every attempted phase

Allowed status values: `NOT STARTED`, `IN PROGRESS`, `BLOCKED`, `COMPLETE`,
`DEFERRED`, `REJECTED`.

| Phase | Status | Evidence / changed files / verification | Commit subject |
|---|---|---|---|
| 0. Baseline and scope lock | COMPLETE | 2026-08-16 baseline recorded below. Secret scan found no live secret; only placeholders in `backend/.env.example` and `docs/guides/07_SECURITY.md`. Local data inventory, route reconciliation, host/protocol list, dependency inventory, and real Flutter verification results are now recorded. `flutter test` passed; `flutter analyze` ran successfully enough to report two pre-existing `info` diagnostics in unrelated dirty files. Changed files: `docs/25_MOBILE_SECURITY_IMPLEMENTATION_PLAN.md` only. | `docs: record mobile security baseline` |
| 1. Transport and endpoint guardrails | COMPLETE | 2026-08-16 transport guardrails implemented in `docs/03_PHONE_BUOY_WIFI.md`, `mobile/lib/core/config.dart`, `mobile/lib/core/endpoint_guard.dart`, `mobile/lib/main.dart`, `mobile/lib/services/backend_client.dart`, `mobile/lib/services/buoy_client.dart`, `mobile/lib/services/forecast_provider.dart`, `mobile/lib/services/tile_cache.dart`, `mobile/lib/ui/chathubb.dart`, and `mobile/test/endpoint_guard_test.dart`. `flutter test` passed. `flutter analyze` reported only two pre-existing `info` diagnostics in unrelated dirty files: `mobile/lib/data/demo_hotspots.dart` and `mobile/lib/services/squall_alarm.dart`. | `security(mobile): constrain app network destinations` |
| 2. Sensitive-data handling and safe diagnostics | COMPLETE | 2026-08-16 safe diagnostics and local-data hardening completed in `docs/25_MOBILE_SECURITY_IMPLEMENTATION_PLAN.md`, `mobile/android/app/src/main/AndroidManifest.xml`, `mobile/lib/core/app_diagnostics.dart`, `mobile/lib/core/locale_controller.dart`, `mobile/lib/main.dart`, `mobile/lib/ui/chathubb.dart`, `mobile/test/app_diagnostics_test.dart`, and `mobile/test/chat_service_retention_test.dart`. `flutter test` passed. `flutter analyze` reported only the same two pre-existing `info` diagnostics in unrelated dirty files: `mobile/lib/data/demo_hotspots.dart` and `mobile/lib/services/squall_alarm.dart`. | `security(mobile): reduce local data and redact diagnostics` |
| 3. Device-identity decision gate | COMPLETE | 2026-08-16 Option A approved by the user/technical owner in chat. Phase log added below with the explicit decision, allowed follow-on work, and hard-stop carry-forward. Changed files: `docs/25_MOBILE_SECURITY_IMPLEMENTATION_PLAN.md` only. | `docs: approve or defer device identity design` |
| 4. Authenticated normal-operation API path | COMPLETE | 2026-08-16 backend vessel-device authorization, contract updates, migration, tests, and mobile auth-aware service changes completed. Verified with bundled-Python `pytest` (`89 passed, 1 xfailed`) and `ruff check .` after dependency install, plus `flutter test` (passed) and `flutter analyze` (only the same two pre-existing `info` diagnostics in unrelated dirty files). Repo-wide `git diff --check` remains blocked by unrelated dirty mobile files; path-scoped diff check for this phase passed. Changed files are recorded in the Phase 4 log below. | `security: add scoped vessel device authorization` |
| 5. Encrypted local credential and data storage | COMPLETE | 2026-08-17 verified by the owner: `flutter pub get`, `flutter analyze` and `flutter test` all pass, and the emulator extraction test confirmed `skipper_name`, `license_number` and `phone` are `enc:v1:` ciphertext in the pulled database while `boat` and `vessel_id` stay readable, with no `+63` match anywhere in the file. Full evidence, limits and carry-forwards in the Phase 5 log below. Changed files listed there. | `security(mobile): protect local vessel data` |
| 6. Release hardening and end-to-end verification | IN PROGRESS | 2026-08-17 signing config and application ID work started. The release build and the seven device scenarios cannot be run by the implementing agent, and backend `pytest`/`ruff` cannot run in its environment either (Python 3.10 vs the project's `numpy==2.4.6`, which needs 3.11+). Status stays IN PROGRESS until the owner records real results. | `security: verify mobile release controls` |
| 7. Deferred RLS decision | NOT STARTED | — | `docs: record rls readiness decision` |

## Phase 0 — Baseline and scope lock

**Goal:** Establish an evidence-backed security baseline before changing behavior.

### Required work

1. Reconcile the actual mobile routes with `docs/03_PHONE_BUOY_WIFI.md`,
   `docs/05_PUBLIC_API.md`, `backend/app/main.py`, and the mobile clients.
2. Inventory, by exact field, data stored locally and data sent to each host:
   SOS, identity, phone/licence fields, catch logs, fishing spots, photos,
   weather cache, and chat data.
3. Classify each item as: emergency-critical, personal data, sensitive location,
   or non-sensitive. State a retention/deletion owner for each sensitive item.
4. List all permitted hosts and protocols. The initial expected list is the
   Railway backend over HTTPS, `192.168.4.1` over local HTTP/WS, and the named
   weather/map providers already in `AqOneConfig`.
5. Run a secret scan and dependency inventory. Do not upgrade packages in this
   phase.

### Required verification

```powershell
git grep -nEi "(password|secret|api[_-]?key|token)\s*[:=]\s*['\"][^'\"]{6,}" 
git grep -nE "postgres(ql)?://[^ ]+:[^ ]+@"
cd mobile; flutter analyze
cd mobile; flutter test
```

If Flutter is unavailable, record the exact missing tool and mark this phase
`BLOCKED`; do not substitute visual inspection for passing checks.

### Hard stop

Do not proceed to Phase 1 until the host/protocol list and sensitive-data
inventory are recorded in this document, and no live secret is found. If a
secret is found, stop feature work, revoke/rotate it first, then document the
response without writing the secret into Git.

### Phase 0 log — 2026-08-16

**Pre-existing dirty paths recorded before work**

`A  AqOne_Integrated_System_Design.md`

`MM docs/16_QA_DISCLOSURES.md`

`D  mobile/lib/data/demo_hotspots.dart`

`MM mobile/lib/models/hotspot_cell.dart`

`MM mobile/lib/services/squall_alarm.dart`

`MM mobile/lib/services/venture_feeds.dart`

`MM mobile/lib/ui/app_shell.dart`

`MM mobile/lib/ui/home_page.dart`

`D  mobile/lib/ui/squall_alert_page.dart`

`MM mobile/lib/ui/venture_page.dart`

`MM mobile/pubspec.yaml`

`D  mobile/test/demo_hotspots_test.dart`

`D  mobile/test/squall_alert_test.dart`

`?? mobile/lib/data/demo_hotspots.dart`

`?? mobile/lib/ui/squall_alert_page.dart`

`?? mobile/test/demo_hotspots_test.dart`

`?? mobile/test/squall_alert_test.dart`

These files were treated as other contributors' work and were not edited in
this phase.

**Route reconciliation**

- `docs/03_PHONE_BUOY_WIFI.md` still documents buoy IP `10.0.0.1`, but the
  checked-in Flutter config and Android network security file both use
  `192.168.4.1`, and comments in `mobile/lib/core/config.dart` say this was
  verified against firmware. This contract doc is stale and must be corrected
  before transport changes.
- Mobile → buoy HTTP:
  - `POST /v1/sos`
  - `GET /v1/status`
  - `GET /v1/sos/status?vessel_id=<id>`
- Mobile → buoy local chat:
  - `ws://<buoy-host>:81`
  - `GET /history`
- Mobile → backend handset routes in code today:
  - `POST /api/sos`
  - `GET /api/sos/vessel/{vessel_id}`
  - `POST /api/sos/{event_id}/reply`
  - `POST /api/catch-logs`
  - `POST /api/catch-logs/{catch_log_id}/confirm-weight`
  - `GET /api/public/buoys`
  - `GET /api/public/alerts/waves`
  - `GET /api/public/alerts/capsizing`
  - `GET /api/sea-condition`
  - `GET /api/public/sea-condition`
  - `GET /api/advisories?status=Published`
  - `GET /api/public/advisories`
  - `GET /api/public/squall`
  - `GET /api/public/forecast`
  - `GET /api/public/hotspots`
  - legacy `POST /api/spots` / `GET /api/spots` still exist
- Backend auth reality today:
  - SOS ingest, SOS vessel status, SOS reply, catch ingest, catch confirm, spot
    ingest/read, and the `api/public/*` safety feeds are all unauthenticated by
    design.
  - Protected dashboard/reporting routes live on separate routers.
- iOS target check: `mobile/ios/Runner/Info.plist` was not present in this
  checkout, so there is no iOS ATS file to inspect in this phase.

**Local data inventory and classification**

| Local store | Exact fields / data | Classification | Current retention / deletion owner |
|---|---|---|---|
| SQLite `identity` | `vessel_id`, `boat`, `skipper_name`, `license_type`, `license_number`, `phone`, `trust_tier`, `avatar_path`, `remember_me` | `vessel_id` and `boat` are emergency-critical; `skipper_name`, `license_number`, `phone`, and `avatar_path` are personal data; `trust_tier` is non-sensitive corroboration metadata | Fisherman on the device for edits/deletion; mobile owner must define defaults in Phase 2 |
| SQLite `outbox` | `local_id`, `vessel_id`, `boat`, `client_ts`, `state`, `trust_tier`, optional `lat`/`lon`, `note`, `buoy_id`, `src_id`, `seq`, `server_ts`, retry counters, `last_error`, relay/delivery/ack timestamps, `acked_by`, `remote_id`, `eta_at`, `responder_status`, `responder_note`, `fisher_reply` | Emergency-critical; `lat`/`lon` are sensitive location; `note` may contain personal data; responder fields are incident data | Fisherman cannot safely lose queued SOS; mobile owner must keep until delivery-state contract says otherwise |
| SQLite `catch_outbox` | `local_id`, `vessel_id`, `species_name`, `estimated_quantity_kg`, `quantity_kg`, `quantity_confirmed_at`, `quantity_synced_at`, `catch_date`, `client_ts`, optional `lat`/`lon`, `method`, `notes`, retry/status fields | Not emergency-critical; `lat`/`lon` are sensitive location; notes may contain personal data; catch history is livelihood-sensitive | Fisherman and product owner jointly; Phase 2 must set an explicit retention window |
| SQLite `fishing_spot_outbox` | `local_id`, `vessel_id`, `posted_by`, `latitude`, `longitude`, `species_name`, `notes`, retry/status fields | Sensitive location and livelihood-sensitive; not emergency-critical | Product owner and mobile owner; should be minimized because feature is legacy |
| SQLite `map_snapshot` | Raw JSON payload plus `fetched_at` for buoys, wave alerts, capsizing alerts, sea condition, advisories, hotspots | Buoys are non-sensitive/public; alerts/advisories are non-sensitive/public; hotspot payload is potentially livelihood-sensitive depending on backend output | Mobile owner; advisory cache may expire aggressively without harming SOS |
| SQLite `checklist_items` | Local packing-list titles, order, checkmarks | Non-sensitive | Fisherman on the device |
| SharedPreferences `forecast_days_v1`, `forecast_fetched_at_v1` | Cached daily weather outlook | Non-sensitive to low sensitivity | Mobile owner |
| SharedPreferences `chat_pending_queue`, `chat_cached_messages` | Outgoing unsent local chat text and cached chat history, including display names and message text | Personal data; possibly operationally sensitive | Fisherman on the device; mobile owner must define retention/backup in Phase 2 |
| SharedPreferences locale override | Language code only | Non-sensitive | Fisherman on the device |
| Filesystem avatar image | Local profile photo chosen by skipper; path stored in SQLite | Personal data | Fisherman on the device |
| Filesystem tile cache | Previously viewed OpenStreetMap tiles | Non-sensitive map cache | Mobile owner; already capped and purgeable |

**Data sent to each host / protocol**

| Host / protocol | Data sent | Notes |
|---|---|---|
| `http://192.168.4.1` | SOS payload: `v`, `vessel_id`, `boat`, optional `lat`/`lon`, optional `note`, `client_ts`; status lookup path/query with `vessel_id` | Only intended cleartext exception |
| `ws://192.168.4.1:81` | Chat `hello` name and chat messages | Local buoy chat; `GET http://192.168.4.1/history` fetches cached history |
| `https://incredible-liberation-production-aad7.up.railway.app` | Direct SOS payload plus `local_id` and `source`; vessel SOS lookup; fisher reply; catch logs and confirm-weight; public safety feed reads | Cloud traffic should remain HTTPS only |
| `https://api.open-meteo.com/v1/forecast` | Query-string latitude/longitude and daily/current weather parameters | Third-party weather provider sees coarse trip area |
| `https://marine-api.open-meteo.com/v1/marine` | Query-string marine sample latitude/longitude and forecast params | Third-party marine provider sees fixed offshore sample point |
| `https://tile.openstreetmap.org` | Map tile requests and `User-Agent` | No profile or SOS payload, but reveals viewed map tiles |

**Dependency inventory**

- Direct mobile dependencies from `mobile/pubspec.yaml`: `http`, `sqflite`,
  `sqflite_common_ffi_web`, `path`, `geolocator`, `flutter_map`, `latlong2`,
  `url_launcher`, `web_socket_channel`, `shared_preferences`,
  `network_info_plus`, `image_picker`, `path_provider`, `sensors_plus`,
  `vibration`, `audioplayers`, `intl`, `flutter_localizations`.
- `mobile/pubspec.lock` is present and resolves hosted packages from
  `https://pub.dev`.
- No secure-storage package is present yet.

**Commands run and outcomes**

- `git status --short`
  - Succeeded; recorded pre-existing dirty paths above.
- `git grep -nEi "(password|secret|api[_-]?key|token)\s*[:=]\s*['\"][^'\"]{6,}"`
  - No matches in tracked files.
- `git grep -nE "postgres(ql)?://[^ ]+:[^ ]+@"`
  - Matched placeholder/example strings only:
    - `backend/.env.example`
    - `docs/guides/07_SECURITY.md`
- `flutter analyze`
  - Initial sandboxed runs could not complete because the shell could not let
    Flutter write its telemetry/session and SDK lock files.
  - Unsandboxed rerun on 2026-08-16 completed and reported only two
    pre-existing `info` diagnostics in unrelated dirty files:
    - `mobile/lib/data/demo_hotspots.dart:28:41`
    - `mobile/lib/services/squall_alarm.dart:60:19`
- `flutter test`
  - Initial sandboxed run could not complete for the same Flutter SDK
    write-permission reason as `flutter analyze`.
  - Unsandboxed rerun on 2026-08-16 passed.
- `flutter --version`
  - Direct snapshot invocation exposed the root cause: sandbox access denied to
    Flutter telemetry/session files and the SDK lockfile.
- `Get-Content mobile/ios/Runner/Info.plist`
  - Failed because the file does not exist in this checkout.

**Remaining risk**

- Flutter verification is now understood: ordinary sandboxed runs were blocked
  by SDK/session file write permissions, while unsandboxed runs completed.
- Sensitive local data remains plaintext in SQLite / SharedPreferences today.
- `mobile/lib/services/venture_feeds.dart` is already dirty in the worktree,
  which is likely to block Phase 1 endpoint-guard work unless the owner
  confirms we may edit it.

**Next hard stop**

This hard stop was satisfied on 2026-08-16. Before later phases touch mobile
network code again:

1. `flutter analyze` and `flutter test` complete on a working Flutter shell,
   and
2. the exact Phase 1 target files are checked for ownership conflicts, with
   special attention to `mobile/lib/services/venture_feeds.dart`.

## Phase 1 — Transport and endpoint guardrails

**Goal:** Ensure a release build cannot accidentally send cloud traffic over
cleartext or send requests to an arbitrary endpoint.

### Required work

1. Centralize and test URL validation at the client boundary.
   - Cloud/API, map, and weather endpoints must be HTTPS.
   - Permit HTTP and `ws://` only for the exact local buoy host and documented
     port/path.
   - Reject malformed URLs, external HTTP URLs, and insecure redirects before
     transmitting sensitive payloads.
2. Preserve the Android cleartext policy's single-host exception. Do not add
   `android:usesCleartextTraffic="true"` or a broad wildcard.
3. Inspect the iOS target if it exists. Its App Transport Security policy must
   preserve the same cloud-HTTPS rule; do not assume Android configuration
   protects iOS.
4. Add focused tests for accepted backend/buoy URLs and rejected insecure URLs.

### Required verification

```powershell
cd mobile; flutter analyze
cd mobile; flutter test
git diff --check
```

### Hard stop

If a proposed guard would block `http://192.168.4.1` SOS handoff or changes the
buoy WebSocket contract, stop and update the contract first. Do not bypass the
guard by allowing all HTTP traffic.

### Phase 1 log — 2026-08-16

**Changed files**

- `docs/03_PHONE_BUOY_WIFI.md`
- `docs/25_MOBILE_SECURITY_IMPLEMENTATION_PLAN.md`
- `mobile/lib/core/config.dart`
- `mobile/lib/core/endpoint_guard.dart`
- `mobile/lib/main.dart`
- `mobile/lib/services/backend_client.dart`
- `mobile/lib/services/buoy_client.dart`
- `mobile/lib/services/forecast_provider.dart`
- `mobile/lib/services/tile_cache.dart`
- `mobile/lib/ui/chathubb.dart`
- `mobile/test/endpoint_guard_test.dart`

**Implementation summary**

- Added a centralized `EndpointGuard` that:
  - requires the cloud backend, weather endpoints, and tile endpoint to remain
    HTTPS;
  - requires the buoy HTTP base URL to stay exactly `http://192.168.4.1`;
  - requires local chat to stay on `ws://192.168.4.1:81`;
  - rejects absolute override paths that would escape the configured host.
- Added startup validation through `AqOneConfig.validateEndpoints()` so a bad
  release configuration fails immediately instead of drifting to runtime.
- Moved backend and buoy clients onto guarded URI construction and disabled
  redirect following in those clients' request objects.
- Guarded forecast and tile endpoint construction in clean files.
- Guarded local chat history/WS endpoint construction in `chathubb.dart`.
- Corrected the numbered buoy contract's host and SoftAP access details so the
  doc no longer points at `10.0.0.1`.
- Added focused tests for accepted backend/buoy URLs and rejected insecure
  backend, buoy, weather, and map URLs.

**Commands run and outcomes**

- `flutter analyze`
  - Completed on 2026-08-16 via unsandboxed run.
  - Reported only two pre-existing `info` diagnostics in unrelated dirty
    files:
    - `mobile/lib/data/demo_hotspots.dart:28:41`
    - `mobile/lib/services/squall_alarm.dart:60:19`
- `flutter test`
  - Passed on 2026-08-16 after the Phase 1 changes.
- `git diff --check`
  - Passed before commit `c38a9f7`.

**Remaining risk**

- `mobile/lib/services/venture_feeds.dart` remains dirty and was intentionally
  left untouched. Startup validation now protects the configured weather base
  URL it uses, but that file's request construction was not refactored in this
  phase because of the ownership rule.
- Flutter analyze is not globally clean because of the two pre-existing info
  diagnostics in unrelated dirty files.

**Next hard stop**

Do not start Phase 2 implementation until this phase's diff check passes and
the phase commit is created with this file updated in the same change set.

## Phase 2 — Sensitive-data handling and safe diagnostics

**Goal:** Limit data exposure from a lost handset, device backup, or release log.

### Required work

1. Replace release-visible raw error/stack logging with a small redacted
   diagnostic layer. It may report a category and status code, but never an SOS
   payload, exact location, profile data, response body, authorization header,
   token, or stack trace in release builds.
2. Add tests that pass representative sensitive values through the diagnostic
   layer and prove they do not appear in output.
3. Turn the Phase 0 data inventory into an explicit retention policy. Remove
   or expire non-essential local data only after confirming it cannot break SOS
   reconciliation, acknowledgement display, or an offline retry.
4. Decide whether Android cloud backup and iOS backup may include the outbox,
   profile, chat queue, and local images. Record the decision and implement the
   least-surprising safe setting. Explain the recovery trade-off in this file.
5. Ensure new sensitive values never enter `SharedPreferences`.

### Required verification

```powershell
cd mobile; flutter analyze
cd mobile; flutter test
git diff --check
```

### Hard stop

Do not delete queued SOS rows merely because an HTTP request returned 2xx. Keep
the delivery-state and reconciliation contract intact. Do not claim local data
is encrypted unless a device extraction test demonstrates it.

### Phase 2 log — 2026-08-16

**Changed files**

- `docs/25_MOBILE_SECURITY_IMPLEMENTATION_PLAN.md`
- `mobile/android/app/src/main/AndroidManifest.xml`
- `mobile/lib/core/app_diagnostics.dart`
- `mobile/lib/core/locale_controller.dart`
- `mobile/lib/main.dart`
- `mobile/lib/ui/chathubb.dart`
- `mobile/test/app_diagnostics_test.dart`
- `mobile/test/chat_service_retention_test.dart`

**Implementation summary**

- Added `AppDiagnostics` so release-visible logging now emits only category and
  optional status code, while debug builds still retain local troubleshooting
  detail.
- Replaced raw `debugPrint` error logging in `main.dart` and
  `locale_controller.dart` with the redacted diagnostics helper.
- Disabled Android app-data backup with `android:allowBackup="false"` so cloud
  backup/device-transfer does not silently copy the SOS outbox, identity,
  cached chat, or avatar data.
- Added a bounded retention rule for cached local chat history: keep only the
  newest 50 messages from the last 24 hours. Pending unsent chat queue entries
  are still retained until they flush, because dropping them would silently
  discard user-written data.

**Retention policy recorded from the current code after Phase 2**

| Local store | Retention after Phase 2 | Reason |
|---|---|---|
| SQLite `outbox` | No automatic expiry in this phase | Emergency-critical; dropping rows can break SOS retry, delivery-state reconciliation, acknowledgement display, and responder ETA history |
| SQLite `identity` | No automatic expiry in this phase | Needed to preserve vessel continuity; Android backup now disabled so it does not leave the device through backup |
| SQLite `catch_outbox` | No automatic expiry in this phase | Livelihood-sensitive; no verified deletion path yet that cannot disrupt sync state |
| SQLite `fishing_spot_outbox` | No automatic expiry in this phase | Legacy sensitive location data; protected from backup, but not auto-deleted without a verified queue-drain plan |
| SQLite `map_snapshot` | Existing code keeps general feeds up to 7 days; hazard-related feeds up to 6 hours | Advisory offline usability without pretending stale hazards are live |
| SharedPreferences forecast cache | Existing 12-hour expiry | Old forecasts are worse than no forecast |
| SharedPreferences cached chat history | New 24-hour / 50-message cap | Non-essential personal/operational data minimized without affecting SOS |
| SharedPreferences pending chat queue | Retained until flush or app-data clear | User-authored unsent messages should not disappear silently |
| SharedPreferences locale override | Retained until user changes/removes it | Preference, low sensitivity |
| Filesystem avatar image | Retained until user replaces/removes it | Personal data, now excluded from Android backup |
| Filesystem tile cache | Existing 7-day floor and 80 MB cap | Non-sensitive offline convenience cache |

**Backup decision**

- Android backup is now disabled.
- Trade-off: a phone replacement or device-transfer flow will not restore local
  identity, queued SOS/catch/spot data, cached chat, or avatar images from
  cloud backup.
- Reason: those stores contain personal, location, or operationally sensitive
  data, and Phase 5 encryption is not in place yet.
- iOS: no iOS target was present in this checkout, so no iOS backup change was
  made in this phase.

**Commands run and outcomes**

- `flutter analyze`
  - Completed on 2026-08-16 via unsandboxed run.
  - Reported only the same two pre-existing `info` diagnostics in unrelated
    dirty files:
    - `mobile/lib/data/demo_hotspots.dart:28:41`
    - `mobile/lib/services/squall_alarm.dart:60:19`
- `flutter test`
  - Passed on 2026-08-16 after the Phase 2 changes.
- `git diff --check`
  - Passed before commit for this phase.

**Remaining risk**

- Android backup is now safer, but local SQLite data is still plaintext at
  rest until a later phase adds protected local credential/data storage.
- The chat pending queue still lives in SharedPreferences by design; this phase
  minimized cached chat history and prevented backup, but did not redesign that
  store.
- `mobile/lib/services/venture_feeds.dart` remains dirty and untouched.

**Next hard stop**

Do not start Phase 3 implementation until the Phase 2 commit is created, then
present Option A vs. Option B to the user/technical owner and wait for an
explicit selection.

## Phase 3 — Device-identity decision gate

**Goal:** Make an explicit product decision before building authentication.

The agent must present the two options below to the user/technical owner and
wait for an explicit selection. Update this document with the decision, owner,
and date. This is a documentation phase; do not infer consent.

| Option | Normal operation | Emergency SOS | Privacy result |
|---|---|---|---|
| A. Server-issued device credential | A paired device receives a revocable credential for its own status and records. | Still queues/relays SOS even when the credential is absent or expired. | Enables meaningful per-vessel ownership checks. |
| B. No fisherman credential | The current self-declared `vessel_id` remains the only identity. | Unchanged. | Status/catch ownership remains weak and must be honestly disclosed. |

### Hard stop

Do not add `flutter_secure_storage`, a token header, device registration,
authorization policies, ownership checks, or RLS until Option A is approved.
If Option B is selected, mark Phases 4, 5, and 7 `REJECTED` or `DEFERRED` with
the accepted risk; continue only with release hardening.

### Phase 3 log — 2026-08-16

**Changed files**

- `docs/25_MOBILE_SECURITY_IMPLEMENTATION_PLAN.md`

**Decision**

- Selected option: `A. Server-issued device credential`
- Decision source: explicit user correction in chat on 2026-08-16
- Technical meaning:
  - SOS must remain available when the credential is absent, expired, revoked,
    or the handset is offline.
  - Normal-operation private reads and writes may now move behind a revocable
    vessel-bound device credential.
  - Later phases may add device enrollment, authorization checks, secure local
    credential storage, and an eventual RLS readiness review, but only under
    the hard stops already defined in this document.

**Commands run and outcomes**

- `git status --short`
  - Re-run before this documentation phase. The pre-existing unrelated mobile
    worktree changes from Phase 0 remained present; this phase touched only the
    clean plan document.
- `git diff --check`
  - Must pass before the phase commit is created.

**Remaining risk**

- Option A authorizes work on authenticated normal-operation flows, but no
  vessel-bound backend authorization exists yet.
- The current mobile-facing status, catch, and legacy spot flows still rely on
  self-declared `vessel_id` until Phases 4 and 5 are truthfully completed.

**Next hard stop**

Before Phase 4 code changes:

1. Write the API contract first and identify exactly which routes become
   credential-protected.
2. Stop if any expected target file is already dirty with someone else's work.
3. Do not make SOS depend on login, token refresh, or internet reachability.

## Phase 4 — Authenticated normal-operation API path (Option A only)

**Goal:** Protect routine per-vessel reads and edits without making the SOS
button depend on authentication.

### Required work

1. Write the API contract first. It must define enrollment/pairing, credential
   lifetime, refresh/revocation, status codes, lost-device handling, and exactly
   which routes use it.
2. Create a server-issued, revocable device record bound to one vessel. The
   backend derives vessel ownership from the verified credential, never from a
   body or path `vessel_id`.
3. Require the credential for normal-operation private reads and mutations:
   at minimum SOS status/replies and catch-log ownership operations. Keep a
   carefully documented unauthenticated emergency ingest fallback.
4. Add backend rate limits and abuse monitoring at the trusted boundary. Client
   throttling is only UX; it is not a security control.
5. Add cross-vessel negative tests: a credential for vessel A cannot read,
   reply to, or modify vessel B's data.
6. Update Flutter only after the backend contract and tests exist. The client
   must show a recoverable normal-operation state when its credential is absent
   or revoked, while SOS remains available.

### Required verification

```powershell
cd backend; pytest
cd backend; ruff check .
cd mobile; flutter analyze
cd mobile; flutter test
git diff --check
```

### Hard stop

Stop if any route authorizes data based solely on the client-provided
`vessel_id`. Stop if the only way to send SOS is an authenticated HTTP request.
Do not put a long-lived shared secret in the app to “authenticate” all phones.

### Phase 4 log — 2026-08-16

**Changed files**

- `backend/app/api/catch.py`
- `backend/app/api/metrics.py`
- `backend/app/api/sos.py`
- `backend/app/api/vessel_auth.py`
- `backend/app/auth.py`
- `backend/app/main.py`
- `backend/migrations/014_vessel_device_auth.sql`
- `backend/tests/test_sos_ingest.py`
- `backend/tests/test_vessel_auth.py`
- `docs/05_PUBLIC_API.md`
- `docs/25_MOBILE_SECURITY_IMPLEMENTATION_PLAN.md`
- `mobile/lib/services/backend_client.dart`
- `mobile/lib/services/catch_service.dart`
- `mobile/lib/services/sos_service.dart`
- `mobile/test/backend_client_vessel_auth_test.dart`

**Implementation summary**

- Wrote the Phase 4 API contract first in `docs/05_PUBLIC_API.md`, adding:
  - operator-issued one-time pairing codes;
  - public vessel-device enrollment;
  - vessel-device token refresh;
  - operator-side device revocation;
  - credential requirements for per-vessel SOS status/reply and catch-log
    writes.
- Added backend vessel-device auth primitives in `backend/app/auth.py`:
  - user tokens are now typed as `kind=user`;
  - new `kind=vessel_device` JWTs bind one device record to one vessel;
  - new dependencies enforce operator-only and vessel-device-only routes;
  - revoked or mismatched device tokens are rejected at the backend boundary.
- Added `backend/app/api/vessel_auth.py` plus migration
  `backend/migrations/014_vessel_device_auth.sql` to create:
  - one-time pairing-code rows;
  - revocable vessel-device records;
  - enrollment, refresh, revoke, and device-introspection routes.
- Hardened normal-operation handset routes:
  - `GET /api/sos/vessel/{vessel_id}` now requires a vessel-device token and
    cross-checks the path against the token vessel before querying by the
    token-derived vessel id;
  - `POST /api/sos/{event_id}/reply` now updates only when the event belongs
    to the token vessel;
  - `POST /api/catch-logs` now rejects a mismatched body `vessel_id` and
    writes only to the token vessel;
  - `POST /api/catch-logs/{catch_log_id}/confirm-weight` now updates only rows
    belonging to the token vessel.
- Added backend negative tests proving a vessel A credential cannot:
  - read vessel B's SOS status;
  - reply to vessel B's SOS;
  - upload a catch log under vessel B's id;
  - confirm weight on vessel B's catch row.
- Updated mobile service code without touching dirty UI/package files:
  - `BackendClient` can now enroll, refresh, hold, attach, and clear an
    in-memory vessel-device bearer token;
  - absent/revoked credentials no longer turn catch uploads into permanent
    rejections;
  - SOS cloud reconcile now skips credential-protected backend polling when no
    valid vessel token is present and keeps buoy/local fallback behavior
    intact;
  - saved fisher replies are retried when reconcile later learns the backend
    event id and a credential is present.
- Fixed one unrelated backend lint blocker in `backend/app/api/metrics.py`
  (missing final newline) so repo lint could truthfully run.

**Commands run and outcomes**

- `git status --short`
  - Re-run before Phase 4 work. The declared Phase 4 targets were clean.
  - Important blocker identified for later work: `mobile/pubspec.yaml` is
    still dirty from another contributor, so Phase 5 secure-storage dependency
    changes must not start until ownership is resolved.
- `git diff --check`
  - Repo-wide run was blocked by unrelated dirty mobile files with trailing
    whitespace in other contributors' work (`mobile/lib/services/venture_feeds.dart`,
    `mobile/lib/ui/app_shell.dart`, `mobile/lib/ui/venture_page.dart`, and
    `mobile/pubspec.yaml`).
  - Path-scoped rerun for the Phase 4 files passed. Git emitted only line-
    ending warnings for `backend/app/auth.py` and `backend/app/api/metrics.py`;
    no diff-check failures remained in this phase's files.
- Bundled Python dependency bootstrap:
  - Initial `pytest` / `ruff` attempts failed because the workspace runtime did
    not yet have those packages installed.
  - Installed `backend/requirements-dev.txt` into the bundled Python runtime,
    then re-ran verification successfully.
- Bundled Python syntax pass:
  - `python -m compileall app tests` passed before the full backend dependency
    set was available, confirming no Python parse errors in the changed backend
    code or tests.
- Backend verification:
  - `python -m pytest`
    - Passed with `89 passed, 1 xfailed, 1 warning in 33.88s`.
    - The remaining warning was a `StarletteDeprecationWarning` from
      `fastapi.testclient`, not a Phase 4 failure.
  - `python -m ruff check .`
    - Passed after removing one unused import in the new vessel-auth test and
      fixing the pre-existing missing final newline in `backend/app/api/metrics.py`.
- Flutter verification:
  - `flutter analyze`
    - Completed via unsandboxed run.
    - Reported only the same two pre-existing `info` diagnostics in unrelated
      dirty files:
      - `mobile/lib/data/demo_hotspots.dart:28:41`
      - `mobile/lib/services/squall_alarm.dart:60:19`
  - `flutter test`
    - Passed after the final Phase 4 mobile changes, including the new
      `backend_client_vessel_auth_test.dart`.

**Remaining risk**

- The backend now has a real vessel-device credential model, and the mobile
  service layer can enroll/refresh and honor that credential in memory, but
  Phase 5 at-rest protection is still outstanding.
- No persistent secure vessel credential storage has been added yet. A device
  restart loses the in-memory bearer token until later secure-storage work is
  completed.
- No new pairing UX was added in this phase because the dirty mobile UI/package
  files remained out of bounds. The backend contract and mobile service hooks
  now exist for later UI/storage work.

**Next hard stop**

Do not start Phase 5 until:

1. ownership of `mobile/pubspec.yaml` is resolved, because secure-storage
   dependency work must edit that file and it is currently dirty from another
   contributor;
2. the secure-storage package choice is reviewed for maintenance, platform
   support, licence, and release-build compatibility; and
3. the Phase 5 migration plan preserves queued SOS behavior across app updates.

## Phase 5 — Encrypted local credential and data storage (Option A only)

**Goal:** Protect a device credential and high-risk local records at rest.

### Required work

1. Store only the device credential and encryption key material in Android
   Keystore/iOS Keychain through a maintained secure-storage package.
2. Select a local-data design based on Phase 0's classification:
   encrypted database, field encryption for sensitive columns, or a recorded
   decision that minimized data plus platform storage is sufficient for the MVP.
   Do not introduce a new dependency without checking its maintenance, platform
   support, licence, and release-build compatibility.
3. Provide a safe migration from existing plaintext SQLite data. Failed migration
   must leave a usable SOS outbox; never corrupt or silently discard a queued
   emergency.
4. Define device-loss behavior: revocation server-side, local credential clear,
   and what historical data remains available.

### Required verification

```powershell
cd mobile; flutter analyze
cd mobile; flutter test
git diff --check
```

Also run a physical/emulator extraction test appropriate to the selected
platform and document the exact limitation. “The library was added” is not proof
of encrypted local data.

### Hard stop

If encryption causes SOS queue creation, offline startup, or recovery after an
app update to fail, roll back that phase's uncommitted implementation and report
the evidence. Do not ship unavailable emergency functionality for at-rest
encryption alone.

### Phase 5 log — 2026-08-16

**Status: IN PROGRESS. Implementation is complete; verification is not.**
The implementing agent has no Flutter SDK and no device, so none of this
phase's required commands were run by it. Per the operating contract, nothing
below is described as verified. The owner must run the commands in
"Verification still owed" before this phase may be marked COMPLETE.

**Pre-existing changes at start of phase**

`git status --short` was empty. No other contributor's work was in the tree,
so no ownership conflict applied.

**Decisions taken with the technical owner (chat, 2026-08-16)**

1. *Credential in platform keystore, plus field encryption for sensitive
   columns.* Whole-database encryption (SQLCipher) was considered and
   rejected. Reason: this phase's own hard stop forbids shipping if
   encryption can break SOS queue creation, offline startup, or recovery
   after an app update. A SQLCipher database keyed from the Keystore fails
   all three the moment the key is unavailable — device restore, keystore
   invalidation, or an OEM lock-screen change — because the SOS outbox lives
   in the same file. Field encryption confines that blast radius to personal
   data the fisherman can retype.
2. *No enrollment UI in this phase.* Recorded as a carry-forward below.

**Changed files**

- `mobile/pubspec.yaml` — added `flutter_secure_storage` (resolved 11.0.0),
  `cryptography: ^2.7.0` (resolved 2.9.0), and dev-only
  `sqflite_common_ffi: ^2.4.2`.
- `mobile/lib/data/secure_credential_store.dart` (new) — Keystore/Keychain
  storage for the vessel bearer token, device id, and the field-encryption
  key (DEK).
- `mobile/lib/core/field_cipher.dart` (new) — AES-GCM per-field encryption
  with an `enc:v1:` prefix.
- `mobile/lib/data/identity_store.dart` — encrypts `skipper_name`,
  `license_number`, `phone` on write; decrypts on read.
- `mobile/lib/services/backend_client.dart` — persists the bearer token on
  enrol and on refresh; clears it from the keystore on revocation.
- `mobile/lib/main.dart` — reads the keystore at startup, off the critical
  path, and injects the cipher and the restored token.
- `mobile/test/field_cipher_test.dart` (new).
- `mobile/test/identity_store_encryption_test.dart` (new) — asserts against
  the raw SQLite rows, not the store API.
- `docs/25_MOBILE_SECURITY_IMPLEMENTATION_PLAN.md` — this log.

**What is encrypted, and what deliberately is not**

| Field | At rest | Why |
|---|---|---|
| `skipper_name`, `license_number`, `phone` | AES-GCM | Personal data per the Phase 0 inventory |
| `vessel_id`, `boat` | Plaintext | Emergency-critical: these identify the vessel to responders. Putting a rescue behind a keystore read is not acceptable |
| `license_type`, `trust_tier` | Plaintext | Non-sensitive categories |
| `avatar_path` | Plaintext | App-private filename; the image itself is already excluded from backup (Phase 2) |
| `outbox` (SOS) | Plaintext | Constraint 1. A queued distress message must never depend on a key |
| `catch_outbox` lat/lon and notes | **Not yet encrypted** | Carry-forward; see below |

**Migration**

There is no migration step, by design. `FieldCipher.decrypt` returns any
value lacking the `enc:v1:` prefix unchanged, so rows written before this
phase keep working and are re-written encrypted the next time the profile is
saved. Nothing sweeps the database, so no interrupted sweep can corrupt it.
There was also no plaintext credential to migrate: Phase 4 held the bearer
token in memory only and never persisted it.

**Device-loss behaviour**

- Server-side revocation already exists from Phase 4:
  `POST /api/vessel-auth/devices/{device_id}/revoke`.
- `clearVesselCredential()` removes the token and device id but keeps the
  DEK, so the holder's own profile stays readable. Revocation is about
  stopping a device talking to the backend, not destroying the owner's data.
- `forgetEverything()` also drops the DEK. Fields encrypted with it are then
  unrecoverable by design. The SOS outbox is unaffected.
- If the keystore is unreadable at startup, the app runs exactly as it did
  before this phase: plaintext personal fields, unauthenticated calls,
  working SOS.

**Correction after the owner's first analyze run**

The first implementation set `AndroidOptions(encryptedSharedPreferences: true)`
and `IOSOptions(accessibility: ...)`. `flutter analyze` failed:
`The named parameter 'encryptedSharedPreferences' isn't defined`. The resolved
version is **11.0.0**, and version 10 removed that option after Google
deprecated the Jetpack Security library behind it; the plugin now encrypts
through the Keystore itself. `SecureCredentialStore` therefore uses platform
defaults. iOS Keychain accessibility was dropped in the same change rather
than guessed at — there is no iOS target in this checkout, so setting it
would have been an unverifiable claim.

Two `info` diagnostics introduced by earlier work were fixed in the same
pass: a missing `const` in `demo_hotspots.dart` and a needlessly nullable
local in `squall_alarm.dart` (`Vibration.hasVibrator()` returns a non-nullable
`bool` in the resolved version).

**Correction after the owner's first test run**

`flutter test` reported 127 passing, 2 failing, both in
`identity_store_encryption_test.dart` and both my test's fault rather than
the implementation's: `IdentityStore.ensure()` runs
`Validators.normalizePhone`, so `09171234567` is stored as `+639171234567`
and the assertions compared against what was typed. The decrypted value was
correct throughout — the failure output showed a correctly decrypted,
correctly normalised number.

Fixing that exposed a worse problem in the same file. The on-disk assertion
searched the raw rows for `09171234567`, which the store never writes in that
form, so it would have passed **even with encryption disabled** — a false
pass in the one test whose whole job is proving the data is unreadable. It
now searches for the normalised number, a substring of it, and the licence
number.

**Correction after the owner's first Android build**

`flutter run` failed at the Gradle stage. `flutter_secure_storage` 11.0.0,
published 2026-08-06, raised its `compileSdk` to 37; the Android SDK Platform
37 installed but Gradle still could not resolve it
(`Failed to find target with hash string 'android-37'`). This is the native
build risk this log flagged, arriving exactly where it was expected.

Resolved by holding the dependency at `^10.3.1`, which builds against SDK 36
- the version this project already compiles against. No Dart change was
needed: `SecureCredentialStore` uses default options, and version 10 is the
release that moved Android off the deprecated Jetpack Security library onto
Keystore-backed custom ciphers, so the protection is the same. Revisit when
SDK 37 is generally available and Flutter's default `compileSdk` catches up.

Raising the project's `compileSdk` to 37 was rejected as the fix: it would
put the whole app on a preview SDK days before a demo, to satisfy one
plugin.

**Residual risk**

- `flutter_secure_storage` is a platform plugin. `flutter pub get` and
  `flutter analyze` now pass, but no release build has been attempted, and
  this project has twice been broken by native plugin configuration at build
  time rather than analysis time.
- Android minSdk for `flutter_secure_storage` 11 has not been checked against
  the project's inherited `flutter.minSdkVersion`. A debug build succeeding
  would settle it.
- Field encryption protects data at rest against filesystem extraction. It
  does not protect a running, unlocked, rooted device, where the key is
  reachable.
- No extraction test has been performed. "The library was added" is not
  proof, and this phase says so explicitly.

**Line endings — read before reviewing the diff**

`identity_store.dart`, `backend_client.dart`, `main.dart` and `pubspec.yaml`
were committed with CRLF while the repo's `.gitattributes` requests
`eol=lf`. `git diff --check` therefore flagged every added line as trailing
whitespace. Those four files were normalised to LF as part of this change so
the check passes, which inflates the raw diff. The content change is 761
lines; `git diff --ignore-cr-at-eol` shows it. A repo-wide
`git add --renormalize .` in its own commit would stop this recurring.

**Extraction test — PASSED, 2026-08-16**

Run by the owner on an Android emulator against a debug build, with a test
profile saved through the Profile screen (boat `BG-123`, name
`Juan dela Cruz`, phone `09171234567`).

```
cmd /c "adb exec-out run-as com.example.aqone cat databases/aqone_outbox.db > out.db"
dir out.db      -> 86016 bytes

findstr /C:"enc:v1:" out.db
  phone         enc:v1:4SzvWFxKnx/dAjJza+fUMHoD7b5qzD2+rdIS+BaumibF4ziPGj9mfNU=
  skipper_name  enc:v1:1MW7qCN2QDVhTD4ojCHl...
  license_number ...BYRqNmdIzW+3IuYp5sbwROU
  remember_me / trust_tier / license_type -> plaintext, as designed

findstr /C:"BG-123" out.db
  boat BG-123 , vessel_id 5ef1fd562df8d870fe7cdeb787d47639

findstr /C:"+63" out.db
  (no match)
```

This is the evidence this phase demanded, and it is what "the library was
added is not proof" was pointing at. Three things are established:

1. Personal fields are ciphertext in the file an attacker would pull off a
   device: name, phone and licence number all carry the `enc:v1:` prefix.
2. The phone number does not appear in readable form anywhere in the file,
   in the normalised `+63...` form the app actually writes.
3. Emergency-critical fields are plaintext exactly as designed - `boat` and
   `vessel_id` are readable, so a responder can still identify the vessel
   with no keystore available.

**Limitations of this test, stated plainly**

- Android emulator only. No physical device, and no iOS (no iOS target
  exists in this checkout).
- Debug build. `run-as` does not work on a release build, so this proves the
  data is encrypted, not that the release build behaves identically.
- It proves encryption at rest against filesystem extraction. It says
  nothing about a rooted, running, unlocked device, where the key is
  reachable through the app process.

**Verification still owed (owner must run)**

**All verification is now complete.**

- `flutter pub get` — passed.
- `flutter analyze` — passed, no issues.
- `flutter test` — all tests passed, re-run by the owner on 2026-08-17 after
  the test-side fixes in `bc28400`.
- `git diff --check` — passed, path-scoped, for every commit in this phase.
- Device extraction test — passed; see the section above for the exact
  commands, output and limits.

Phase 5 is COMPLETE. The limits recorded above still stand and are not
weakened by that status: emulator only, debug build only, no protection
against a rooted running device, and the carry-forwards below remain open.

**Carry-forward — do not lose these**

1. **No enrollment UI exists.** Nothing in the app calls
   `enrollVesselDevice`, so no credential is ever created and the secure
   store is inert in practice. Phase 4 built the client and backend; the
   pairing-code screen was never built. Until it is, the authenticated path
   is unreachable from the app.
2. `catch_outbox` lat/lon and notes remain plaintext. They are
   livelihood-sensitive location data under the Phase 0 inventory and should
   be encrypted with the same cipher, but the change touches sync and upload
   paths and was kept out of this phase to keep the diff reviewable.
3. iOS: no iOS target is present in this checkout. Keychain accessibility is
   left at the plugin default; when an iOS target exists, decide explicitly
   between `first_unlock_this_device` (background outbox flushes keep
   working) and a stricter setting, and verify it.

**Next hard stop**

Do not mark Phase 5 COMPLETE, and do not start Phase 6, until the commands
above have been run and their real output is recorded here. If
`flutter pub get` fails on `flutter_secure_storage`, roll back this phase's
implementation rather than shipping a half-wired credential path.

## Phase 6 — Release hardening and end-to-end verification

**Goal:** Prove the controls work in the release artifact, not only in debug.

### Required work

1. Review direct and transitive Flutter dependencies. Upgrade only one justified
   security/compatibility change at a time, with tests and release notes.
2. Verify Android release signing uses CI/platform secrets, never repository
   files. Verify the final package has the intended application ID and no debug
   settings.
3. Build a release artifact and test these scenarios on a device or emulator:
   - airplane-mode SOS queues locally;
   - buoy handoff works over the permitted local HTTP path;
   - cloud requests use HTTPS;
   - rejected external HTTP URL sends no payload;
   - sensitive values do not appear in release diagnostics;
   - a revoked/missing normal-operation credential cannot access another vessel;
   - loss of backend access remains an honest delivery state.
4. Update `docs/16_QA_DISCLOSURES.md`, `README.md`, and this file with verified
   claims and known limits only when the corresponding scenario has run.

### Required verification

```powershell
cd mobile; flutter analyze
cd mobile; flutter test
cd mobile; flutter build apk --release
cd backend; pytest
cd backend; ruff check .
git diff --check
```

### Hard stop

No release is security-approved if the test record is absent, if an emergency
path was tested only in debug, or if any public repository secret scan is not
clean. Do not mark a manual test as automated.

### Phase 6 log — 2026-08-17

**Status: IN PROGRESS.** Configuration work is done. The release build and
the seven device scenarios have not been run, and the plan does not permit
calling this phase complete until they have.

**Pre-existing changes at start of phase**

`git status --short` was empty.

**What was found**

1. `signingConfig = signingConfigs.getByName("debug")` — the release build was
   signed with Android's debug key. That key is public and identical on every
   machine, so anyone could produce an APK that Android accepts as an update
   to this one. Requirement 2 of this phase forbids it.
2. `applicationId = "com.example.aqone"` — Flutter's placeholder. Google Play
   rejects `com.example.*` outright.
3. Already correct, and worth recording as evidence rather than assumption:
   no `.jks`, `.keystore` or `key.properties` anywhere in the repository; and
   `network_security_config.xml` permits cleartext **only** for the buoy at
   192.168.4.1, leaving TLS enforced for every other host.

**Changed files**

- `mobile/android/app/build.gradle.kts` — release signing reads a gitignored
  `key.properties`, falling back to debug signing when absent; `applicationId`
  and `namespace` are now `ph.aqone.app`; R8 shrinking and obfuscation
  enabled for release.
- `mobile/android/app/src/main/kotlin/ph/aqone/app/MainActivity.kt` — moved
  from `com/example/aqone/`, package declaration updated. **This move was
  mandatory, not cosmetic:** the manifest declares `android:name=".MainActivity"`,
  which resolves against the namespace, so changing the namespace without
  moving the class would have crashed the app at launch with
  ClassNotFoundException — and only in a built app, not in analysis or tests.
- `mobile/android/app/proguard-rules.pro` (new) — keep rules for the two
  plugins that resolve classes reflectively (`flutter_secure_storage`,
  `sqflite`), line numbers kept for crash reports, source file names hidden.
- `mobile/android/key.properties.example` (new) — how to generate and place
  the keystore, with the reasons a release key must never enter the repo.
- `.gitignore` — `mobile/android/key.properties`, `*.jks`, `*.keystore`.

**Application ID change — consequences**

`ph.aqone.app` was chosen because the app already sends it as its OSM tile
User-Agent, so the two now agree. The id determines the app's private data
directory, so this change orphans the local database on any handset that
already has the app installed: identity, queued SOS, catch logs, cached map
snapshots. Only development installs exist today, which is exactly why the
change was made now rather than after a pilot. Uninstall and reinstall on
any test handset. Note that `adb ... run-as com.example.aqone` in the Phase 5
log no longer works; use `ph.aqone.app`.

**R8 is newly enabled — treat the first release build as a real test**

Shrinking and obfuscation were off (Flutter's template default). They are on
now, because an unobfuscated release ships readable class and method names,
which is a labelled map of the SOS and credential paths. The risk is that R8
strips something a plugin reaches reflectively; the two known cases have keep
rules. If the release build fails or misbehaves, add a narrow keep rule for
the specific class and record it — do not add a blanket keep or
`-dontobfuscate`, which would disable the protection entirely.

**Dependency review (requirement 1)**

No dependency was changed in this phase. The two changes made during Phase 5
are recorded there: `sensors_plus` 6.x → 7.1.0 (Built-in Kotlin, required by
the toolchain) and `flutter_secure_storage` held at `^10.3.1` (11.0.0 needs
Android SDK 37, which this toolchain cannot resolve). `flutter pub outdated`
otherwise shows only patch-level drift plus `flutter_lints` 4 → 6, which is a
lint-rule change deliberately deferred until after the demo.

**Release scenario test record — TO BE FILLED BY THE OWNER**

Build first, and confirm which key signed it:

```powershell
cd mobile; flutter build apk --release
cd mobile/android; ./gradlew :app:signingReport
```

Then run each scenario on a device or emulator against that release artifact
and record the real result. An empty row is an untested control, not a
passing one.

| # | Scenario | Result | Evidence / notes |
|---|---|---|---|
| 1 | Airplane-mode SOS queues locally | | |
| 2 | Buoy handoff works over the permitted local HTTP path | | |
| 3 | Cloud requests use HTTPS | | |
| 4 | A rejected external HTTP URL sends no payload | | |
| 5 | Sensitive values absent from release diagnostics | | |
| 6 | A revoked or missing credential cannot reach another vessel | | |
| 7 | Loss of backend access still shows an honest delivery state | | |

**Verification still owed (owner must run)**

```powershell
cd mobile; flutter analyze
cd mobile; flutter test
cd mobile; flutter build apk --release
cd backend; pytest
cd backend; ruff check .
git diff --check
```

`pytest` and `ruff` could not be run by the implementing agent: its Python is
3.10 and the project pins `numpy==2.4.6`, which requires 3.11 or newer.
Nothing in this phase touched backend code, but the plan asks for the full
suite and the result must be recorded, not assumed.

**Carry-forward**

Scenario 6 cannot be tested end-to-end today, because no enrollment UI exists
and nothing in the app creates a credential — the same gap carried forward
from Phase 5. Record it as untestable rather than passing.

## Phase 7 — Deferred row-level security decision

**Goal:** Decide whether PostgreSQL RLS is useful after a trusted identity model
exists; it is not a Flutter control.

RLS may be evaluated only when all conditions hold:

1. Option A is implemented and cross-vessel backend authorization tests pass.
2. The runtime database role is non-owner and cannot bypass RLS.
3. Every request transaction has a trusted, transaction-local identity set by
   FastAPI, not by an unverified client header or body field.
4. Gateway ingest, responders, migrations, simulations, and background jobs
   have explicitly separate least-privilege roles.
5. Policies and negative tests cover all sensitive tables, including failure
   behavior when the identity context is missing.

### Hard stop

If any prerequisite is missing, record `DEFERRED` and do not write a permissive
policy, use a database owner role, or claim RLS protects Flutter data. RLS does
not replace API authentication or ownership checks.

## Completion standard

This plan is complete only when every implemented phase is marked `COMPLETE`
with commands and real results, every deferred/rejected phase explains its
accepted risk, all major changes have path-scoped commits, and the product still
demonstrates airplane-mode SOS → buoy → gateway → backend → dashboard.
