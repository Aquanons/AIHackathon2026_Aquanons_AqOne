# 37 — Short Messaging and Weather/Advisories Implementation Plan

**Handoff target:** Claude Code  
**Scope:** make the existing short-message, weather, squall, and official
advisory surfaces truthful, deployable, and testable without changing LoRa,
buoy firmware, gateway code, or hardware.

## Outcome

The app offers a short nearby-boat message that is durable on the handset,
uses the correct cloud endpoint when available, and never overstates where the
message has reached. It also provides current weather, a seven-day forecast,
official advisories, and squall warnings with source and freshness made clear.

This handoff implements **nearby-boat group messaging**, not private or family
messaging. The current `mesh_chat` contract has no recipient, consent model,
or private downlink, and its messages are intentionally public to the local
hub. Do not label it “message to family” or add pseudo-private routing. That
is a separate product and hardware contract.

## Starting point: reuse the pieces already present

The repository already has these components:

- `mobile/lib/ui/chathubb.dart` provides WiFi-hub chat, a local queue, history
  retention, and a cloud relay attempt.
- `backend/app/api/mesh.py` persists and serves short messages at
  `/api/mesh/chat`.
- `backend/app/api/advisories.py` provides authenticated advisory publishing
  and public reads; `VentureFeeds` caches the last successful advisory list.
- `mobile/lib/services/forecast_provider.dart` already tries
  `/api/public/forecast` before falling back to Open-Meteo.
- `backend/app/api/public.py` provides unauthenticated sea condition and
  squall reads; the phone already treats a failed squall read as `unknown`,
  not clear.

The known gaps are smaller and more important than a rewrite:

1. `ChatService` defaults to an obsolete Railway host and bypasses the shared
   endpoint guard when relaying to the backend.
2. A chat line can be shown locally, queued for the buoy, and posted to the
   cloud, but the UI does not state which of those facts is known. It must not
   imply shore or recipient delivery.
3. The public forecast endpoint is documented but not implemented, so every
   handset falls back to Open-Meteo directly.
4. The public advisory API serializes `cover_image`, while the app parses
   `image_url`; expired advisories are filtered only by the handset; and a
   failed fetch is currently turned into an app welcome notice instead of a
   detectable failure.
5. The current squall data is synthetic and can be stale. A stale detection
   must never raise a fresh **RETURN NOW** warning.

## Non-negotiable truth rules

- **Local message queued** means the handset retained it; it does not mean a
  buoy, shore, or another boat received it.
- **Handed to the local WebSocket** means this handset wrote the line to its
  active connection. The current protocol has no hub receipt, so it does not
  prove a buoy stored it, another boat saw it, or it reached shore.
- **Cloud relay stored** is known only after `POST /api/mesh/chat` returns
  `201`. Do not attempt to infer it from network availability.
- No cross-hop de-duplication is added in this handoff. The buoy firmware does
  not yet forward a stable message ID, so a heuristic based on text/time would
  risk hiding a real repeated call. Document the at-least-once limitation.
- A weather/advisory read that failed or is stale is never rendered as an
  all-clear. Show its source and last known timestamp where available.
- A squall result calibrated on synthetic data stays visibly labelled as such;
  it is not a PAGASA warning.

## Commit rule — required after every implementation phase

Claude Code must make a focused commit after every green implementation phase.
Do not use `git add -A`, `git commit --amend`, `--no-verify`, or include
unrelated work.

At every checkpoint:

```powershell
git diff --check
git status --short
git add <only the paths named for this phase>
git diff --cached --check
git diff --cached
git commit -m "<the phase message below>"
```

If another task has modified a file in the phase, inspect the diff and stage
only the intended hunks. Do not overwrite or commit that other work. A failed
required check blocks the commit and the next phase.

## Phase 0 — Baseline and contract lock (no commit)

1. Read `AGENTS.md`, `docs/Aqone_PRD (2).md` §4.4 and §5.1,
   `docs/05_PUBLIC_API.md`, `docs/21_WEEK1_CONTRACT_FIXTURES.md`, and
   `docs/22_LOCALIZATION_PLAN.md`.
2. Create a dedicated branch, for example
   `codex/short-messaging-weather-advisories`, without discarding existing
   changes.
3. Record baseline outcomes on a Python 3.11+ environment with Flutter
   installed. Do not loosen version pins just to satisfy a local machine.

```powershell
cd backend; python -m pytest -q; ruff check .
cd ..\mobile; flutter pub get; flutter analyze; flutter test
cd ..\web; node --test test/dashboard-utils.test.js
```

4. Make only read-only checks against the corrected deployment URL:
   `https://aihackathon2026aquanonsaqone-production.up.railway.app/healthz`.
   Do not create messages or advisories in production.

**Exit condition:** the branch, runner, and existing failures are known. No
product code or contract is changed yet.

## Phase 1 — Repair the short-message software path

### Contract first

Update `docs/05_PUBLIC_API.md` before code to document the existing public
short-message API:

- `POST /api/mesh/chat` returns `201` only after cloud persistence;
- `GET /api/mesh/chat?since_id=` returns ordered nearby-group messages;
- `sender`, `text`, and `origin` are public group-chat metadata, not a private
  family-message API;
- the client maximum and backend/hub maximum are explicit; and
- the actual Railway base URL is
  `https://aihackathon2026aquanonsaqone-production.up.railway.app`.

Do not alter the WiFi WebSocket or firmware contract in this phase.

### Changes

1. Replace the stale `ChatService` cloud default with
   `AqOneConfig.backendBaseUrl`. Build the relay URI through
   `EndpointGuard.backend()` rather than `Uri.parse()`.
2. Keep the existing local queue in `SharedPreferences`; it is sufficient for
   a short nearby-message queue. Extend the stored line only as needed to
   preserve the honest client state (`queued locally`, `handed to local
   WebSocket`, or
   `cloud relay stored`). Do not create another database or a generic message
   framework.
3. Make the cloud relay result explicit: a `201` advances a line to
   `cloud relay stored`; timeout, non-201, and no internet leave its honest
   local/hub state unchanged. Reuse the existing start/reconnect queue flow to
   retry a pending cloud relay; do not add a second networking subsystem.
   Never silently drop the line because the relay failed.
4. Enforce the app's existing short-message limit before sending. Reject with
   a clear local message or prevent entry; do not silently truncate an
   emergency-relevant sentence. Keep the backend's longer limit for hub-origin
   messages unchanged unless the verified firmware contract requires otherwise.
5. Add focused mobile tests, using existing fake HTTP/retention patterns, for:

   - canonical Railway relay URI and `201` success;
   - failed cloud relay preserves the queued/local message;
   - over-limit text is not sent or truncated;
   - history merge and self-echo protections still hold.
6. Extend `backend/tests/test_mesh_chat.py` only enough to pin validation,
   ordered `since_id` behaviour, and the unauthenticated hub-facing boundary.
   Do not expose a private-message read route by accident.

### Required checks

```powershell
cd backend
python -m pytest -q tests/test_mesh_chat.py
ruff check .
cd ..\mobile
flutter analyze
flutter test test/chat_service_retention_test.dart test/endpoint_guard_test.dart
```

### Auto-commit

Stage only the changed chat/config/test files and `docs/05_PUBLIC_API.md`, then
commit:

```text
fix(chat): use the canonical relay and honest delivery states
```

**Exit condition:** local chat is durable, uses the real cloud base URL when
available, and exposes only facts the handset can actually know.

## Phase 2 — Make official advisories accurate and failure-aware

### Changes

1. Define the public advisory response in `docs/05_PUBLIC_API.md` before
   changing code: published, currently active advisories only; ISO dates;
   `image_url` as the public field; source/issuer; and priority.
2. In `backend/app/api/advisories.py`, filter expired items at the server as
   well as on the phone, and serialize the declared public field consistently.
   Preserve the authenticated create/update/delete routes and their existing
   operator boundary.
3. In `Advisory.tryParse`, accept the documented public field. If backwards
   compatibility is needed, accept `cover_image` as an input alias only; emit
   one canonical field from the backend.
4. Change `VentureFeeds.advisories()` to return `null` on a failed fetch rather
   than turning an outage into a welcome notice. On a successful fetch, append
   the clearly labelled `WelcomeAdvisory` as it does today. This lets
   `AdvisoriesPage` distinguish “no active advisories” from “could not load.”
5. Retain the existing snapshot store and stale-list UI. Add the cached data's
   age/source beside the list if the existing snapshot-age API supplies it;
   do not create a parallel advisory cache.
6. Add tests for public expiry filtering, response-field compatibility,
   unauthorized publishing, a failed fetch, and the official/app-notice visual
   distinction.

### Required checks

```powershell
cd backend
python -m pytest -q tests/test_public_feeds.py tests/test_advisories.py
python -m pytest -q
ruff check .
cd ..\mobile
flutter analyze
flutter test test/welcome_advisory_test.dart
```

If `tests/test_advisories.py` does not exist, create this one focused test file
rather than broadening unrelated test infrastructure.

### Auto-commit

Stage only the advisory API/mobile/model/test files and contract documentation,
then commit:

```text
fix(advisories): keep official notices current and honest
```

**Exit condition:** expired notices cannot reappear from the public API, an
outage is visibly an outage, and app-generated copy cannot pass as an MDRRMO
instruction.

## Phase 3 — Deliver a bounded public forecast and stale-safe squall feed

### Forecast changes

1. Implement the already documented `GET /api/public/forecast` in the backend.
   Use the installed HTTP client; do not add a weather SDK. Validate latitude,
   longitude, and `days` (maximum seven), apply a short upstream timeout, and
   return the shape already documented in `docs/05_PUBLIC_API.md`.
2. In this phase the backend is a transparent Open-Meteo/marine proxy with
   `source`, `generated_at`, weather fields, and nullable `wave_m`. Omit the
   `risk` block unless a real server-side risk input exists. Do not label this
   response `aqone-fusion`, infer calm water from missing waves, or claim PAGASA
   integration.
3. Keep `AqOneForecastProvider`'s current Open-Meteo fallback: an unavailable
   backend forecast must leave a usable handset fallback, not a blank card.

### Squall changes

4. Add a maximum-data-age guard to `/api/public/squall`. A stale synthetic
   reading must return `level: "unknown"`, `return_now: false`, its last
   `as_of`, and a machine-readable/readable stale reason. It must never create
   a new RETURN NOW alarm.
5. Update `SquallWatch`/the banner only as needed to show the timestamp and
   stale/unavailable state. Preserve the existing rule that a transient fetch
   failure does not rewrite a previously shown warning to **clear**.
6. Add focused backend tests with mocked upstream weather responses and squall
   readings for:

   - valid forecast, invalid coordinates/days, upstream timeout, and `wave_m`
     null preservation;
   - public forecast/squall routes require no handset token while dashboard
     twins remain protected;
   - fresh qualifying squall can signal RETURN NOW;
   - stale synthetic squall is `unknown` and never RETURN NOW.
7. Add mobile parser/widget tests for backend forecast precedence, fallback,
   and the stale squall wording/no-new-alarm rule.

### Required checks

```powershell
cd backend
python -m pytest -q tests/test_public_feeds.py tests/test_public_forecast.py tests/test_squall.py
python -m pytest -q
ruff check .
cd ..\mobile
flutter analyze
flutter test test/daily_outlook_test.dart test/weather_card_test.dart test/squall_alert_test.dart
```

### Auto-commit

Stage only forecast/squall API, mobile parser/UI, and related test files, then
commit:

```text
feat(weather): add public forecast and stale-safe squall status
```

**Exit condition:** weather remains useful when one provider fails, missing
sea state stays unknown, and old synthetic data cannot impersonate a live
emergency warning.

## Phase 4 — Finish the fisherman-facing language and state display

### Changes

1. Move any new user-facing chat, weather, squall, and advisory text into
   `mobile/lib/l10n/app_en.arb`, with descriptions and draft `fil`/`akl`
   counterparts. Use `AppLocalizations`; do not add bare `Text('...')` strings
   or put display text on an enum.
2. Localize `AdvisoryPriority` through an extension if its displayed labels
   are touched. Do not translate operator-entered advisory title/description,
   place names, or MDRRMO/LGU names.
3. In the chat UI, make the local/hub/cloud status visible without inventing a
   recipient receipt. Show the character limit before sending and a retriable
   queue state after a failed relay.
4. In weather/advisory screens, visibly distinguish live, cached, stale, and
   unavailable data. Keep forecast cache use to the existing 12-hour ceiling;
   do not treat cached weather as live.
5. Add widget tests in all three locales for the most safety-relevant new
   labels, overflow on longer Filipino copy, and stale vs unavailable state.

### Required checks

```powershell
cd mobile
flutter gen-l10n
flutter analyze
flutter test
```

### Auto-commit

Stage only the changed mobile UI, ARB source files, tracked generated files
(if this repository tracks them), and widget tests, then commit:

```text
feat(mobile): clarify messaging and safety-feed status
```

**Exit condition:** a fisher can tell queued from locally sent, official from
app-generated, and stale/unavailable from clear in English, Filipino, and
Aklanon.

## Phase 5 — Verification, staging proof, and factual status (documentation commit)

Use local or staging fixtures/data. Do not post test chat lines, create
advisories, train models, or deploy migrations in production without the
owner's explicit approval.

### Automated release gate

```powershell
cd backend; python -m pytest -q; ruff check .
cd ..\mobile; flutter analyze; flutter test
cd ..\web; node --test test/dashboard-utils.test.js
```

### Manual acceptance script

1. In a staging build with internet, send a short message and verify the
   correct Railway host receives one `201` row. Disconnect internet and verify
   the message remains visibly queued rather than claimed delivered.
2. If a local hub is available, verify only phone ↔ hub group-message behavior:
   send, reconnect, history backfill, and no self-echo duplicate. Record this
   separately from shore delivery. If the hub is not available, record the
   mobile mock/fixture result only—do not claim an end-to-end mesh test.
3. Create one future-dated and one expired advisory in staging as an operator.
   Verify only the active official advisory reaches the public handset screen;
   verify an unauthenticated publish is rejected.
4. Verify the backend forecast response shows source, generated time, nullable
   wave data, and the handset falls back when the endpoint is unavailable.
5. Exercise a fresh RETURN NOW fixture and a stale synthetic fixture. Confirm
   only the fresh one can open the alarm screen; both disclose calibration and
   timestamp as applicable.
6. Reopen the app offline and verify cached forecast/advisory labeling is
   honest, then switch to `fil` and `akl` to check safety text and layout.

Update `docs/08_DEMO_AND_STATUS.md`, `docs/05_PUBLIC_API.md`, and this plan
with the date, commands, environment, and results actually observed. Do not
claim a mesh downlink, private family messaging, PAGASA integration, live buoy
sensor telemetry, or a field weather validation that was not run.

### Auto-commit

Stage only the factual documentation/status changes, then commit:

```text
docs(feeds): record messaging and safety-feed verification
```

**Exit condition:** all automated gates pass, staging evidence distinguishes
what was directly verified from mocked/fixture behavior, and the branch has
four focused implementation commits plus this verification commit.

## Explicitly out of scope for this handoff

- LoRa frame changes, buoy/gateway firmware, a new WebSocket protocol, or
  hardware/range testing.
- Private/family messages, end-to-end message encryption, recipients, read
  receipts, or cross-hop message deduplication; each needs a new contract.
- PAGASA integration, real buoy-fusion risk scoring, production model training,
  or claiming the synthetic squall model is operationally validated.
- Posting test data or deploying to the production Railway environment.
