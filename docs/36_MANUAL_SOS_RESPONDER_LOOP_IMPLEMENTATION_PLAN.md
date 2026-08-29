# 36 — Manual SOS and Responder Loop Implementation Plan

**Handoff target:** Claude Code  
**Scope:** complete and prove the phone → backend → dispatcher → phone manual
SOS loop. This includes the existing WiFi buoy *client* fallback, but explicitly
excludes LoRa frames, buoy firmware, gateway code, and hardware testing.

## Outcome

A fisher can press Manual SOS and see an honest local delivery state. Once the
backend has it, an authenticated dispatcher can acknowledge it with an ETA and
status. The fisher then receives that answer over direct internet, or from the
already-implemented buoy status proxy when offline. The fisher can answer
**Still in danger** or **Safe now**; the dispatcher sees that reply and the SOS
is removed only when it is resolved.

The four state words in `docs/06_DELIVERY_STATES.md` remain authoritative:

```text
saved → relayed → delivered → acknowledged
```

Never claim a state that the relevant authority has not observed. In
particular, a successful direct backend post is `delivered` even if the buoy
also accepted the same SOS.

## Starting point: do not rebuild what exists

The repository already has most of this path:

- `backend/migrations/008_responder_loop.sql` and `backend/app/api/sos.py`
  persist ETA, responder status, replies, and resolution.
- `mobile/lib/services/sos_service.dart` persists the outbox, sends by buoy and
  direct HTTPS, reconciles by `local_id` before `seq`, and can submit a reply.
- `mobile/lib/services/buoy_client.dart` handles the real buoy status proxy and
  its truncated-response failure mode using the Week 1 fixtures.
- `web/js/dashboard/dashboard-incidents.js` has the acknowledgement modal and
  ETA inputs.

The work is therefore a small repair-and-proof pass, not a second SOS system.
The known gaps to close are:

1. `mobile/lib/ui/venture_page.dart` calls `Chathubb` with obsolete
   `displayName`; the constructor now requires `identity`, so the mobile app
   cannot currently pass analysis/build.
2. `SosService._attemptRelay()` waits for both transports and gives a buoy
   success priority over a simultaneous direct success. This can leave a
   backend-delivered SOS shown as only `relayed`.
3. `/api/sos/active` currently removes an SOS as soon as it is acknowledged.
   That prevents the dispatcher from seeing the fisher's subsequent reply.
4. The acknowledgement dialog only dismisses. It does not expose the already
   implemented fisher reply action.
5. The dashboard acknowledges optimistically and leaves a misleading local
   state if the request fails.

`docs/13_RESPONDER_LOOP.md` contains older Phase 1 wording. Follow the current
authenticated vessel-device contract in `docs/05_PUBLIC_API.md`: SOS ingest is
unauthenticated, while a vessel's status and reply use its paired device token.
Do not weaken that boundary.

## Commit rule — required after every implementation phase

Claude Code must make a focused commit after **each** green implementation
phase below. Do not use `git add -A`, `git commit --amend`, `--no-verify`, or
commit a pre-existing unrelated change.

At every checkpoint:

```powershell
git diff --check
git status --short
git add <only the paths named for this phase>
git diff --cached --check
git diff --cached
git commit -m "<the phase message below>"
```

If `git status` shows unrelated work, leave it untouched and stage only the
listed paths. If a required check fails, fix it before committing; do not move
on with a known-red phase.

## Phase 0 — Establish a reproducible baseline (no commit)

1. Read `AGENTS.md`, `docs/05_PUBLIC_API.md`, `docs/06_DELIVERY_STATES.md`,
   `docs/13_RESPONDER_LOOP.md`, and `docs/21_WEEK1_CONTRACT_FIXTURES.md`.
2. Start on a dedicated branch, for example
   `codex/manual-sos-responder-loop`, without discarding existing work.
3. Record the baseline failures and do not change dependency versions merely
   to make a local machine pass. The backend needs Python 3.11+; use an
   environment with Flutter installed for mobile checks.
4. Run the baseline suite:

```powershell
cd backend; python -m pytest -q; ruff check .
cd ..\mobile; flutter pub get; flutter analyze; flutter test
cd ..\web; node --test test/dashboard-utils.test.js
```

5. Use the corrected deployment URL only for read-only smoke checks:
   `https://aihackathon2026aquanonsaqone-production.up.railway.app/healthz`.
   Do not create test SOS records in production.

**Exit condition:** the implementation environment and its baseline results are
known. No product code is changed in this phase.

## Phase 1 — Make Manual SOS buildable and preserve truthful route state

### Changes

1. In `mobile/lib/ui/venture_page.dart`, construct `Chathubb` with the
   `VesselIdentity` it now requires. Remove `_chatDisplayName` only if it has
   no remaining caller; do not add an adapter or restore the old constructor.
2. Repair `SosService._attemptRelay()` with the smallest change that preserves
   both concurrent attempts while serialising outbox writes:

   - start buoy and direct sends together;
   - publish the first successful fact immediately (`relayed` for a buoy ack,
     `delivered` for direct HTTPS);
   - process the other result afterwards through `OutboxStore.advance()` so
     its monotonic merge cannot regress the state;
   - if both succeed, finish at `delivered` and retain the buoy ID/sequence;
   - record a failure only when both routes fail.

   Do not add a new transport abstraction. The existing `BuoyClient`,
   `BackendClient`, and monotonic `OutboxStore.advance()` are sufficient.
3. Add `mobile/test/sos_service_test.dart` using the existing in-memory SQLite
   test pattern and HTTP mock clients. It must cover:

   - direct-only success → `delivered`;
   - buoy-only success → `relayed` with buoy metadata;
   - both successes → `delivered` without losing buoy metadata;
   - both failures → remains `saved` with a useful recorded failure.

### Required checks

```powershell
cd mobile
flutter analyze
flutter test test/sos_service_test.dart test/sos_record_test.dart test/buoy_client_test.dart test/backend_client_vessel_auth_test.dart
flutter test
```

### Auto-commit

Stage only `mobile/lib/ui/venture_page.dart`,
`mobile/lib/services/sos_service.dart`, and `mobile/test/sos_service_test.dart`
(plus a test-only support file only if strictly necessary), then commit:

```text
fix(mobile): preserve truthful manual SOS delivery state
```

**Exit condition:** the app analyzes, and a direct success is visibly and
persistently `delivered` even when the buoy also accepted the same SOS.

## Phase 2 — Keep acknowledged incidents available for the responder loop

### Contract first

Before code, update the affected sections of `docs/05_PUBLIC_API.md` and
`docs/13_RESPONDER_LOOP.md` to state that the dashboard's active SOS feed
contains every **unresolved** event, including acknowledged ones, so it can
receive a fisher reply. Keep the path names and vessel-device authorization
unchanged. Correct the stale Railway base URL in `docs/05_PUBLIC_API.md` while
editing it.

### Changes

1. Change the backend active-SOS query from “unacknowledged” to “unresolved”.
   Return the acknowledgement, ETA, responder-status/note, fisher-reply, and
   relevant timestamps that the dashboard needs. An acknowledged SOS stays
   visible until a dispatcher resolves it or the fisher sends `SAFE_NOW`.
2. Preserve the existing safety boundaries:

   - Manual SOS ingest remains tokenless.
   - Dashboard acknowledgement/resolve still require an operator token.
   - Vessel status and reply still require the vessel-device token and must
     remain bound to that vessel.

3. Make reply handling monotonic: `SAFE_NOW` resolves the event; a later retry
   cannot reopen or replace an already resolved incident. Retrying the same
   request must be safe.
4. Extend the existing lightweight fake-pool tests, or add one focused backend
   responder-loop test file. Test the behaviour, not SQL text:

   - acknowledgement stores a server-derived absolute `eta_at` and status;
   - acknowledged-but-unresolved SOS remains in the active feed;
   - `STILL_IN_DANGER` appears in the active event;
   - `SAFE_NOW` resolves it and removes it from the active feed;
   - a different vessel's device cannot read or reply to the event.

### Required checks

```powershell
cd backend
python -m pytest -q tests/test_sos_ingest.py tests/test_vessel_auth.py
python -m pytest -q
ruff check .
```

### Auto-commit

Stage only the changed SOS API/test files and
`docs/05_PUBLIC_API.md`, `docs/13_RESPONDER_LOOP.md`, then commit:

```text
fix(backend): retain acknowledged SOS until resolved
```

**Exit condition:** an acknowledgement no longer makes the live incident
disappear before the responder can see the fisher's answer.

## Phase 3 — Make the dispatcher view authoritative, not optimistic

### Changes

1. In `web/js/dashboard/dashboard-live-sos.js`, map the Phase 2 responder
   fields into the live incident/drawer data. Keep an acknowledged unresolved
   SOS visible, clearly marked as acknowledged rather than as a new alert.
   Remove it only after the next successful poll confirms resolution.
2. In `web/js/dashboard/dashboard-incidents.js`:

   - show the responder status, ETA (or honest delayed wording), note, and
     fisher reply in the existing incident drawer;
   - wait for the acknowledge API result before presenting it as acknowledged,
     or restore the previous state on failure;
   - after acknowledge, resolve, or a fisher reply, refresh from
     `/api/sos/active` rather than trusting a guessed browser-only state;
   - do not alter the existing demo alerts except to keep their DEMO label
     distinct from real SOS events.

   Reuse the existing `authFetch`, `escapeHtml`, freshness status, and polling
   code. Do not add SSE or a new dashboard framework for this task.

3. Add a small Node test only for new pure formatting/mapping logic. At a
   minimum it must prove an expired ETA renders an honest delayed message and
   server-supplied note text is escaped. Keep DOM interaction in the manual
   acceptance test below.

### Required checks

```powershell
cd web
node --check js/dashboard/dashboard-live-sos.js
node --check js/dashboard/dashboard-incidents.js
node --test test/dashboard-utils.test.js
```

### Auto-commit

Stage only the edited dashboard files and the related Node test, then commit:

```text
fix(dashboard): keep the responder loop visible
```

**Exit condition:** a dispatcher sees the acknowledgement state and the
fisher's reply until resolution, with no false success if an API call fails.

## Phase 4 — Let the fisher answer the responder

### Changes

1. Update `ResponderEtaDialog` and its call site in `mobile/lib/ui/app_shell.dart`
   so the dialog can call the existing `SosService.replyToSos()` method.
   Provide:

   - **Still in danger** (`reply: 1`);
   - **Safe now** (`reply: 2`) behind a confirmation, because it resolves the
     incident;
   - a visible queued/failed-to-send explanation when the reply is stored
     locally and will retry after connectivity returns.

   Preserve the existing local-first persistence and retry in `SosService`;
   do not create a second reply queue.
2. Render responder status and the delayed ETA honestly. Move any newly added
   user-facing wording into `mobile/lib/l10n/app_en.arb`, with matching
   `fil`/`akl` entries and generated localization output. Do not put display
   text on an enum.
3. Add focused widget tests for:

   - acknowledged SOS shows status/ETA;
   - an expired ETA says delayed, never `00:00` or a negative countdown;
   - **Still in danger** invokes reply `1`;
   - **Safe now** requires confirmation and invokes reply `2` only after it.

### Required checks

```powershell
cd mobile
flutter gen-l10n
flutter analyze
flutter test
```

### Auto-commit

Stage only the edited responder UI, app-shell, localization files/generated
output, and widget tests, then commit:

```text
feat(mobile): let fishers reply to responder acknowledgements
```

**Exit condition:** an acknowledged fisher can make one of the two documented
replies, and the app remains honest if it cannot send that reply yet.

## Phase 5 — Prove the loop end to end and record only observed facts

Use local/staging data, not the production Railway database. Do not deploy or
run migrations against production without the owner's explicit approval.

### Automated release gate

```powershell
cd backend; python -m pytest -q; ruff check .
cd ..\mobile; flutter analyze; flutter test
cd ..\web; node --test test/dashboard-utils.test.js
```

### Manual acceptance script

1. Pair a test handset to a test vessel and sign into the dashboard as an
   operator.
2. Press Manual SOS with direct internet available. Confirm the outbox moves
   to `delivered`, exactly one dashboard event appears, and the event ID is
   stable after a retry.
3. Acknowledge it with a known ETA/status/note. Confirm the server response
   carries an absolute `eta_at`, the dashboard retains the unresolved event,
   and the handset receives the status within one reconcile interval.
4. Send **Still in danger**. Confirm the dashboard shows that reply and the
   event remains unresolved.
5. Send **Safe now** and confirm it. Confirm the dashboard marks the event
   resolved and removes it from the active feed only after the successful
   refresh.
6. Run the existing fixture-based offline fallback tests
   (`mobile/test/buoy_client_test.dart`) to prove parsing of an ETA via the
   buoy proxy, including a truncated response. This is the hardware-free
   evidence for this handoff's buoy portion.
7. Reopen the handset app at steps 3–5 to confirm ETA/reply state survived
   SQLite persistence.

Update `docs/08_DEMO_AND_STATUS.md` and `docs/13_RESPONDER_LOOP.md` with the
date, environment, commands, and outcomes actually observed. Do not claim a
LoRa downlink or real field range test.

### Auto-commit

Stage only those evidence/status documentation updates, then commit:

```text
docs(sos): record manual responder-loop verification
```

**Exit condition:** every automated gate is green, the manual script is
recorded with evidence, and the branch contains the four focused implementation
commits plus this verification commit.

## Explicitly out of scope for this handoff

- LoRa `RESPONDER_STATUS` downlink, frame changes, buoy queue changes, gateway
  changes, or a physical range test.
- New accounts/auth designs, an SSE rewrite, or a second SOS/reply store.
- Posting test emergencies to the live Railway environment.

Those items are separate work. This plan closes the manual SOS and responder
loop with the contracts and components already present.
