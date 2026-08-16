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
`REJECTED`.

| Phase | Status | Evidence / changed files / verification | Commit subject |
|---|---|---|---|
| 0. Baseline and scope lock | NOT STARTED | — | `docs: record mobile security baseline` |
| 1. Transport and endpoint guardrails | NOT STARTED | — | `security(mobile): constrain app network destinations` |
| 2. Sensitive-data handling and safe diagnostics | NOT STARTED | — | `security(mobile): reduce local data and redact diagnostics` |
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
