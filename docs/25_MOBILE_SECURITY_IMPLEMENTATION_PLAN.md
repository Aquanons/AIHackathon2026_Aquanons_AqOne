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
| 3. Device-identity decision gate | NOT STARTED | — | `docs: approve or defer device identity design` |
| 4. Authenticated normal-operation API path | NOT STARTED | — | `security: add scoped vessel device authorization` |
| 5. Encrypted local credential and data storage | NOT STARTED | — | `security(mobile): protect local vessel data` |
| 6. Release hardening and end-to-end verification | NOT STARTED | — | `security: verify mobile release controls` |
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
