# 08 — DEMO, CONTINGENCY & STATUS

> **This file predates the current build** (it was written for the original
> Day 1–3 hackathon push; the status table below still shows placeholder ⬜
> rows for capabilities the README now reports as built). It has not been
> retrofitted as part of the Week 1 dashboard/Flutter sprint - that would be
> a larger rewrite than this sprint's scope. For status that has actually
> been verified this week, see the root [`README.md`](../README.md) "Week 1
> dashboard/Flutter contract sprint" section and
> [`20_WEEK_1_DASHBOARD_FLUTTER_IMPLEMENTATION_PLAN.md`](20_WEEK_1_DASHBOARD_FLUTTER_IMPLEMENTATION_PLAN.md).

## 2026-08-29 — manual SOS / responder-loop verification

Recorded per `docs/36_MANUAL_SOS_RESPONDER_LOOP_IMPLEMENTATION_PLAN.md` Phase
5, in the spirit of this file's own status table rather than as a rewrite of
it. Environment: Windows 11 sandbox, Python 3.11.9, Flutter 3.44.7, Node
v22.22.3, no attached Android/iOS device.

**Automated release gate — all green except pre-existing, unrelated failures
already present at Phase 0 baseline:**

- `cd backend && python -m pytest -q && ruff check .` — 108 passed, 1 xfailed.
  `test_demo.py::test_firing_same_beat_is_idempotent` and two
  `test_dashboard_coords.py` errors (missing `web/js/dashboard.js`, a stale
  path from before it moved under `web/js/dashboard/`) are pre-existing and
  unrelated to the SOS/responder-loop work; `ruff check .` has 8 pre-existing
  issues confined to `calibrate_demo_squall.py`, also unrelated.
- `cd mobile && flutter analyze && flutter test` — 0 analyzer issues, 151/151
  tests passed, including the new `sos_service_test.dart` and
  `responder_eta_dialog_test.dart`.
- `cd web && node --test test/dashboard-utils.test.js` — 32/32 passed,
  including the new `formatEta`/`responderStatusHtml` cases.
- `flutter build web` — succeeded cleanly (`Built build\web`), proving the
  handset app actually compiles and runs as a live instance, not just under
  `flutter test`'s widget harness.

**Manual, device-level acceptance script (pairing a real handset, pressing
Manual SOS, watching a live dashboard acknowledge and receive a reply) could
not be completed in this environment.** Recording the blockers rather than
skipping this silently, per the Hard Reset convention already used in
`docs/21_WEEK1_CONTRACT_FIXTURES.md`:

- The backend requires a real PostgreSQL database (`asyncpg`). A PostgreSQL 18
  server is installed locally, but its credentials are unknown and do not
  match `backend/.env.example`'s `postgres:postgres` default, so no local
  backend could be started against it.
- Docker Desktop is installed (would have given an isolated, disposable
  Postgres instead of touching the existing server) but its engine did not
  finish starting after roughly ten minutes of waiting, so that path was
  abandoned rather than pursued indefinitely.
- No Android or iOS device or emulator is attached, and Visual Studio (the
  "Desktop development with C++" workload) is not installed, so neither a
  real handset nor a Windows desktop build of the app was available.
  `flutter devices` offers only Windows (blocked on the above) and Edge; only
  Edge, not Chrome, is present.

What this means concretely: the SOS → backend → dispatcher-acknowledge →
fisher-reply loop is proven by the automated suite (including a real,
compiled, running build of the handset app), and its buoy-fallback half is
proven by `mobile/test/buoy_client_test.dart`'s fixture-based parsing of a
real ETA response and its 320-byte firmware truncation — but nobody has yet
watched an actual phone, buoy, and dispatcher screen agree with each other in
real time for this phase. That remains open work for whoever has a real
Postgres credential or a working Docker install in this environment (or is
running this on a machine already set up per `backend/.env.example`).

## 2026-08-29 — short messaging / weather / advisories verification

Recorded per `docs/37_SHORT_MESSAGING_WEATHER_ADVISORIES_IMPLEMENTATION_PLAN.md`
Phase 5, same environment as the responder-loop entry above: Windows 11
sandbox, Python 3.11.9, Flutter (via `C:\Users\User\flutter`), Node, no
attached Android/iOS device, on branch
`codex/short-messaging-weather-advisories`.

**Automated release gate — all green except the same pre-existing, unrelated
failures already present at the Phase 0 baseline of this handoff:**

- `cd backend && python -m pytest -q` — 125 passed, 1 xfailed, 1 pre-existing
  failure (`test_demo.py::test_firing_same_beat_is_idempotent`) and 2
  pre-existing errors (`test_dashboard_coords.py`, still missing
  `web/js/dashboard.js` at its old pre-modularisation path) — identical to
  the Phase 0 baseline, unrelated to this work. `ruff check .` — same 8
  pre-existing issues confined to `calibrate_demo_squall.py`, also
  unrelated and untouched.
- `cd mobile && flutter analyze` — 0 issues. `flutter test` — 180/180
  passed (baseline 151, +29 across the four phases: chat relay/status,
  advisory expiry/field-compat, forecast precedence/fallback, stale squall
  parsing and banner, and the new chat/squall ARB keys in all three
  locales).
- `cd web && node --test test/dashboard-utils.test.js` — 32/32 passed
  (unchanged; this handoff did not touch `web/`).

**What was directly verified, and how:**

- The live Railway base URL. `GET /healthz` against
  `https://aihackathon2026aquanonsaqone-production.up.railway.app` returned
  `200 {"status":"ok"}` before any code changes. The URL `ChatService` and
  `AqOneConfig.backendBaseUrl` previously defaulted to,
  `incredible-liberation-production-aad7.up.railway.app`, answered
  Railway's own `404 Application not found` — that deployment does not
  exist. This was an unannounced regression beyond the plan's own framing
  of the bug (which assumed `AqOneConfig.backendBaseUrl` was already
  correct); both defaults are now the verified live host. No write request
  was made against the live deployment — this was a read-only `/healthz`
  check only, per the plan's Phase 0 instruction.
- Every backend route change (mesh chat ordering/persistence, advisory
  expiry filtering and field naming, `/api/public/forecast`, the squall
  staleness guard) is exercised by `TestClient` against the real FastAPI
  routes and real SQL query text, with only the database connection faked
  (in-memory fake pools modelled on the existing `test_vessel_auth.py`
  pattern) — not mocked at the HTTP boundary. This is real route-level
  verification, not a unit test of isolated functions.
- Local Postgres was checked again for this handoff (same blocker as the
  responder-loop entry above): a server is running on `localhost:5432`, but
  connecting as `postgres:postgres` (the `.env.example` default) fails with
  `InvalidPasswordError`, and no other credential is known in this
  environment. Docker Desktop's engine is still not reachable
  (`npipe:////./pipe/dockerDesktopLinuxEngine`). No password was guessed or
  brute-forced.

**What was not verified, and is not claimed as done:**

- **No live device or staging acceptance script was run.** The manual
  script in the implementation plan (send a chat line and watch a `201`
  land in a real database with internet on/off; join a real Heltec hub over
  WiFi and check history backfill/no self-echo; create a future-dated and
  an expired advisory as a staging operator; watch the backend forecast and
  a fresh vs. stale squall fixture on a running app; switch locales on a
  live screen) needs a real Postgres connection, a Heltec buoy on WiFi, and
  a device/emulator, none of which were available here. Nothing above
  should be read as claiming that script ran.
- **None of this handoff's code changes are deployed.** Everything above
  is on the local branch only, not pushed, not merged, and not built onto
  the Railway deployment checked for `/healthz`. The live backend still
  runs whatever was deployed before this handoff.
- **No chat message, advisory, or squall reading was created against any
  real database** — local, staging, or production — consistent with the
  plan's instruction not to post test data anywhere without the owner's
  explicit approval.
- The Aklanon and Tagalog strings added in Phase 4
  (`chatStatus*`, `chatCharacterLimitLabel`, `squallStale*` in
  `mobile/lib/l10n/app_fil.arb` / `app_akl.arb`) are machine/AI-drafted,
  exactly like every other string in those two files per
  `mobile/lib/l10n/README.md` — untranslated by a human, not reviewed by a
  native speaker, and not verified against a running app in either
  language. `flutter test` confirms they render without a
  `MaterialLocalizations` exception and without a build-time overflow
  exception in all three locales; it does not confirm the words are
  correct.

## 2026-08-29 — automatic distress detection: open-trip freshness window decided

Per `docs/38_AUTOMATIC_DISTRESS_DETECTION_IMPLEMENTATION_PLAN.md` Phase 2 item
2, a stop-and-ask condition: "If the team has not selected a safe cadence,
stop this phase for that decision; guessing it changes emergency behaviour."

**Decision: `OPEN_TRIP_FRESHNESS_WINDOW = 12 hours`**
(`backend/app/ai/anomaly_service.py`). Made by the project lead, not guessed.

How long after a vessel's last buoy contact its most recent trip still counts
as "possibly still open" for scoring, versus excluded as stale/completed.
Rationale considered:

- Too short would exclude a vessel that is *already* hours overdue — the
  exact case this feature exists to catch, since an overdue vessel's defining
  characteristic is a growing gap since its last contact.
- Too long lets a trip from days or weeks ago re-alert just because the wall
  clock advanced — the design flaw `docs/31_DEMO_VERIFICATION_01.md` found in
  the previous dataset-max-timestamp approach, where the whole synthetic
  fleet scored ≈0.85 and alerted because their contacts were days behind the
  demo's freshly-written ones.
- The synthetic generator (`backend/app/simulation/generator.py`) models full
  trips — departure to return — of roughly 6–13 hours (departure ~04:20–06:35,
  fishing 1.8–6.5h, return same day ~16:10–19:15). 12 hours covers a complete
  trip cycle with headroom, while still excluding anything from a prior day.

There is currently no explicit "trip completed" signal other than a new
`trip_id` starting later, so this window is the only mechanism that
distinguishes "still out, buoy just hasn't seen them for a while" from "went
home a long time ago, nothing to worry about." It is a single named constant,
not tuned per vessel or scenario, and Phase 2's own instruction was explicit
that this work must not extend to retuning `trip_profile.py`'s model weights
or thresholds — only this eligibility guard.

## 2026-08-29 — automatic distress detection: offline evaluator fixed, false-alarm figure retracted

Per `docs/38_AUTOMATIC_DISTRESS_DETECTION_IMPLEMENTATION_PLAN.md` Phase 4.

**The bug.** `backend/app/ai/trip_profile_eval.py`'s normal-trip path
previously re-scored each trip only at its own historical contact
timestamps (`as_of = contacts[idx - 1].observed_at`), never past its own
final contact. `status == 'alert'` was therefore checked only at moments
the vessel was, by construction, still actively checking in — the
published **0% false-alarm rate across 496 normal trips was true by
construction, not by measurement** (`docs/30_DEMO_DECISION_01_ANOMALY.md`
§1.1 predicted exactly this).

**The fix.** Normal trips now sweep `as_of` forward from their own last
contact in 5-minute steps over the same 12-hour horizon the incident path
already used (matching `OPEN_TRIP_FRESHNESS_WINDOW`, the Phase 2 decision
above — the live pipeline never scores a trip past that age either, so this
measures exactly the window production can reach). Core logic extracted
into a pure `evaluate(rows, incidents)` function
(`backend/app/ai/trip_profile_eval.py`) so it can be regression-tested
without a database.

**What was verified here, without a database** (`backend/tests/test_trip_profile_eval.py`,
3/3 passing): with a controlled fixture — four historical trips on a fixed
three-buoy route, then a fifth trip that completes the same route and then
legitimately goes quiet — the corrected evaluator reaches `status: 'alert'`
about **two hours** after the vessel's last real contact, purely because no
further contact ever arrives. The pre-fix code could never reach this
outcome for any trip, by construction, regardless of the underlying model.
This reproduces exactly the mechanism `docs/31_DEMO_VERIFICATION_01.md`
found separately (a model with no "trip complete" concept eventually reads
silence as overdue) and confirms the fix actually exercises time the vessel
was never observed at.

**What was not run.** `python -m app.ai.trip_profile_eval` against the real
496-normal-trip synthetic dataset — same blocker recorded throughout this
file: no working local Postgres credential, Docker Desktop's engine
unreachable. The real false-alarm rate is therefore **unmeasured**, not
republished as a guess. `backend/app/ai/models/eval_results.json`'s
`trip_anomaly.false_alarm_rate` has been set to `null` with a
`retracted_reason` field explaining why, and the README's measured-performance
table and status row were updated to match (say "retracted" / "demo,
simulation-verified only" rather than the stale 0%) — per decision 30 §4:
"Publish whatever it gives... The real number may be considerably worse than
0%. That is the point." `median_detection_latency_minutes` (55 minutes) and
`incidents_detected` (8) are unaffected; decision 30 already verified that
sweep. Whoever next has a working local Postgres or a working Docker install
should run `python -m app.simulation.generator --days 14 --seed 42` then
`python -m app.ai.trip_profile_eval` and record the real number here.

## 2026-08-29 — automatic distress detection Phase 5: release gate green, deployment/device verification not performed

Per `docs/38_AUTOMATIC_DISTRESS_DETECTION_IMPLEMENTATION_PLAN.md` Phase 5,
same environment as every entry above: Windows 11 sandbox, Python 3.11.9,
Node, on branch `codex/short-messaging-weather-advisories`, continuing
directly from the Phase 1-4 work recorded above.

**Automated release gate — green, same pre-existing failures as every other
entry in this file:**

- `cd backend && python -m pytest -q` — 164 passed, 1 xfailed,
  1 pre-existing failure (`test_demo.py::test_firing_same_beat_is_idempotent`)
  — identical to every earlier baseline in this file, unrelated to this work.
  `ruff check .` — same 8 pre-existing issues confined to
  `calibrate_demo_squall.py`, untouched.
- `cd web && node --test test/dashboard-utils.test.js` — 51/51 passed
  (baseline 32, +19 for the Trip Checks queue's pure render helpers added
  in Phase 3).

**What was directly verified, read-only, against the live deployment.**
The current Railway URL from the README (not the dead
`incredible-liberation-production-aad7` host retired in an earlier
handoff):

- `GET https://aihackathon2026aquanonsaqone-production.up.railway.app/healthz`
  → `200 {"status":"ok"}`.
- `GET .../api/ai/anomaly/active` (no token) → `401 {"detail":"authentication
  required"}` — the pre-existing route's auth boundary is intact in
  production.
- `GET .../api/ai/anomaly/cases/open` (no token) → `404 {"detail":"Not
  Found"}` — confirms, honestly, that **none of this handoff's Phase 1-4
  code is deployed**. The new contact-ingest endpoint, the cases API, and
  the three new migrations exist only on the local branch.

No write request of any kind was made against the live deployment - these
were plain unauthenticated `GET`s, per the same read-only discipline every
earlier entry in this file used.

**What was not done, and why, rather than skipped silently:**

- **`GATEWAY_API_KEY` was not configured anywhere.** Doing so on the real
  Railway service requires Railway account/project access this environment
  does not have, and setting a production secret is exactly the kind of
  infrastructure change that needs the project owner's own credentials, not
  an agent guessing at deployment console access.
- **No fixture contact stream was submitted anywhere**, staging or
  production. Phase 5 item 2 requires a *non-production or explicitly
  approved demo environment* for this - none was available, and this
  handoff's own Phase 1-4 code is not deployed to try it against even if
  one existed.
- **The manual, device-level acceptance script (submit a fixture stream,
  watch a verification case and a responder-attention case appear, act on
  one, reload, confirm persistence, confirm a stale/normal fixture raises
  nothing) could not be completed** - same root blocker as every earlier
  entry in this file: no working local Postgres credential, Docker
  Desktop's engine unreachable, so no local backend could be started to
  drive even a local version of this script. The backend-level equivalent
  of every piece of this script - low/high confidence routing, one case per
  repeated evaluation, each responder action surviving a re-evaluation,
  auth boundaries, a stale trip producing no case - is covered by
  `backend/tests/test_anomaly_cases.py` (7/7 passing) and
  `backend/tests/test_anomaly_source.py`/`test_anomaly_active_readonly.py`
  against fake connection pools, not a real database or a real dispatcher's
  screen.
- **Nothing from this handoff has been pushed, merged, or deployed.**
  Everything above is on the local branch only.

**What this means concretely.** The five phases of docs/38 are implemented,
unit- and route-level tested without a database, and the live deployment's
existing surface was confirmed reachable and correctly protected - but
distress-detection-over-a-real-gateway-connection remains exactly what
`docs/38`'s own purpose section already says it is: unproven until a real
gateway submits real contact events and a real Postgres instance is
available to run migrations, the scheduled evaluator, and the manual
acceptance script against. Whoever next has Railway project access and/or a
working local Postgres/Docker should: set `GATEWAY_API_KEY` and confirm the
Railway cron service for `python -m app.ai.run_anomaly_evaluation`
(README "Scheduled anomaly evaluation"), run `migrate.py` to apply
`016_contact_events.sql` and `017_anomaly_cases.sql`, then run this
phase's manual acceptance script for real.

---

## 2026-08-30 — drift/search re-tasking Phases 1-5: release gate green, live/local acceptance not performed

Per `docs/40_DRIFT_PREDICTION_SEARCH_RETASKING_IMPLEMENTATION_PLAN.md`,
Windows 11 sandbox, Python 3.11.9, Node v24.14.0, on a dedicated branch
(`codex/drift-prediction-search-retasking`, branched from `master` rather
than continuing the prior entries' branch, which belongs to an unrelated,
already-merged plan). Commits: `feat(drift): open responder-confirmed search
cases` (Phase 1), `fix(drift): make prediction inputs and snapshots honest`
(Phase 2), `feat(search): persist negative-search re-tasking` (Phase 3),
`feat(dashboard): support search-sector re-tasking` (Phase 4).

**Two policy decisions were escalated to the project owner (Lenard) rather
than guessed**, per the plan's own instruction not to choose a safety
threshold that changes a real search decision:

- Phase 2 production environmental-input quality policy: ≥2 fresh (≤60min)
  buoys near the last-known position, ≥50% observed-current coverage, wind
  non-degraded (60min ceiling structurally enforced by the existing 20min
  wind-cache TTL). Recorded in `docs/05_PUBLIC_API.md`.
- Phase 3 detection-probability presets: poor 0.3 / moderate 0.6 / good 0.9,
  named by search method/visibility, none reaching 1.0. Same doc.

**Automated release gate — green, same pre-existing failures as every other
entry in this file:**

- `cd backend && python -m pytest -q` — 218 passed, 1 xfailed, 1
  pre-existing failure (`test_demo.py::test_firing_same_beat_is_idempotent`,
  confirmed by stashing this work and re-running against a clean `master` -
  identical failure, unrelated to this handoff). `ruff check .` — same 8
  pre-existing issues confined to `calibrate_demo_squall.py`, untouched.
- `node --test web/test/dashboard-utils.test.js` — 57/57 passed (+5 for
  `eligibleForSearchReport`, the pure eligibility check the dashboard's
  "Mark a searched area" button is gated on).
- `node --check` on both changed dashboard JS files - no syntax errors.

**What was directly verified, read-only, against the live deployment**
(`https://aihackathon2026aquanonsaqone-production.up.railway.app`, per the
README):

- `GET /healthz` → `200 {"status":"ok"}`.
- `GET /api/ai/anomaly/active` and `GET /api/ai/drift/incidents` (no token)
  → `401 {"detail":"authentication required"}` - pre-existing auth
  boundaries intact.
- `GET /api/demo/drift/incident/1` (this handoff's new demo-gated route) →
  `404` - not deployed.
- `POST /api/ai/drift/cases` (this handoff's new case-open route, empty
  body, no token) → `405 Method Not Allowed` from the static-file catch-all
  mount, not from the drift router - the path isn't registered on the
  deployed app at all. Confirms, honestly, **none of this handoff's Phase
  1-4 code is deployed**; it exists only on the local branch.

No write request of any kind was made against the live deployment - plain
unauthenticated `GET`s and one deliberately-empty `POST` that never reached
a handler, per the same read-only discipline every earlier entry in this
file used.

**What was not done, and why, rather than skipped silently:**

- **The manual acceptance script (open a synthetic case, inspect the prior
  contour, submit a negative sector, reload, verify the posterior and
  next-area recommendation change, then confirm a production-mode case with
  no buoy data stops at the honest insufficiency state) could not be run.**
  A local PostgreSQL 18 service is running on this machine (`pg_isready`
  confirms it), but its password does not match the `.env.example`
  convention and is not otherwise known to this session; Docker Desktop's
  engine is also not running, closing that alternate path. Guessing at or
  brute-forcing the password was not attempted. The project owner was
  offered the choice to supply it, run the script themselves, or accept
  this documented gap, and chose the latter (this entry).
- **`python -m app.ai.drift_eval` was not run** - it requires `DATABASE_URL`
  and exits immediately without one (same blocker as above). The evaluator
  was still improved this phase: it now reports `excluded_low_quality_runs`
  (tracks too short to score) instead of silently dropping them from an
  inconsistent denominator, and `containment_rate`'s denominator was
  corrected to match `search_area_reduction_factor`/`prediction_runtime_ms`
  (all three now divide by the same evaluated count). No new numbers are
  published because none were measured.
- **The Phase 4 dashboard interaction (two-click rectangle, preset picker,
  confirm panel, submit) was not exercised in a browser.** It has no DOM
  dependency it could be unit-tested without a browser except the
  eligibility gate above, which is tested; the rendering and Leaflet-event
  wiring were reviewed by hand, not run.
- `README.md`'s status table previously read "✅ Built, measured, live" for
  drift prediction and Bayesian search re-tasking. That claim is corrected
  in this commit: the two rows now say what is actually true - built and
  tested, not yet deployed, and gated on zero-buoy reality even once it is.

**What this means concretely.** All five phases of docs/40 are implemented
and covered by fast, database-free unit/API tests (fake connection pools,
not a real Postgres instance or a real dispatcher's screen), and the live
deployment's existing surface was confirmed reachable, correctly protected,
and does not yet run any of this code. Whoever next has the local Postgres
password, Docker access, or Railway project access should: create a scratch
database, run `migrate.py` (through `021_search_sector_reports.sql`), seed
or acknowledge a real SOS, open a case via `POST /api/ai/drift/cases`, and
run the manual acceptance script above for real before this ships. Until
then, treat drift prediction and search re-tasking as demo/simulation- and
unit-verified only - exactly the caveat `docs/40`'s own "Purpose and
delivery rule" already anticipated: this plan makes the buoy/current
hardware's absence visible rather than fabricating a live search field.

---

## Judging weights — build toward these

| Criterion | Weight | Where it's won |
|---|---|---|
| **Technical Soundness** | **50%** | **The mentor's report — mentoring sessions, not the pitch** |
| Impact & Feasibility | 25% | Field research, deployment cost, who pays |
| Presentation | 15% | Storytelling, **live demo success**, Q&A defence |
| Innovation & Scalability | 10% | Creative impression, deployment path |

**Half the score comes from a mentor's judgement of your technical depth in
conversation.** Show them working hardware early. Bring a design question, not
a status update. Be explicit about what's simulated — mentors are technical and
will spot a fake instantly; labelling it yourself reads as competence.

---

## Demo script (5 minutes)

**1. Hook — 30s.**
> "We interviewed fishermen in New Washington. When they fish, *all of them* are
> in a cellular dead zone. Every safety app on the market stops working exactly
> where fishermen need it most."

**2. Stakes — 30s.**
MDRRMO currently learns about a capsizing hours later, by word of mouth.

**3. The demo — 2 min.**
- Hold up the phone. **Put it in airplane mode in front of the judges.**
- Press SOS.
- Narrate the delivery states as they advance: saved on phone → received by
  buoy → received by AqOne → MDRRMO responded.
- The dashboard across the room lights up.
- **Hand a judge the phone and let them press it.**

**4. How it works — 1 min.** One slide: phone → buoy WiFi → LoRa hop → gateway
→ backend → dashboard. Name the signed envelope and replay protection here,
unprompted — that's your cybersecurity answer delivered before anyone asks.

**5. What's real, what's next — 45s.** Read the status table below out loud.
Then:
> "Safety drives adoption, adoption generates catch data, catch data enables the
> model — in that order."

That single sentence pre-empts the AI question and reframes it as sequencing
rather than absence.

**6. Close — 15s.** Cost per buoy, buoys needed for coverage, who pays
(LGU/BFAR). Have real numbers.

### Rehearse the airplane-mode moment specifically

It is the entire pitch. If the room's WiFi could plausibly explain the result,
the demo proves nothing. Make the isolation visible and undeniable — hold the
phone up, show the airplane icon, let a judge verify it.

---

## Contingency ladder

Work down. Each rung is still a credible demo. **Decide the rung before you
walk on stage, not during.**

| Rung | Situation | What you do | What you say |
|---|---|---|---|
| **1** | Everything works | Full live demo, judge presses the button | Nothing extra |
| **2** | IMU dead | Sensor-bypass mode, button-triggered frame | "Sensing is bypassed; the mesh path is real" |
| **3** | Mesh unreliable in the room | Move nodes closer, lower spreading factor, retry | "We're at close range because of RF conditions in this hall" |
| **4** | Radio dead | Play the screencast, show the hardware physically | "This ran last night; here's the recording and the hardware" |
| **5** | Backend/network down | Screencast + architecture walkthrough | "Our deployment is unreachable from this venue; here's the recorded run" |

**Rung 4 is why the screencast exists. Record it on Day 2, not Day 3.** Once it
exists, every hardware risk drops from fatal to embarrassing.

---

## Q&A — one prepared answer each, everyone answers the same way

**"Is the mesh actually working or simulated?"**
> Answer precisely. If one hop is real and multi-hop isn't, say exactly that.
> "One real LoRa hop, phone to buoy to gateway. Multi-hop relay is implemented
> in firmware but we've only bench-tested two nodes."

**"What's your model's accuracy?"**
> "We deliberately didn't ship a model. With the catch data available, the
> target would be circular — predicting catch volume from catch volume. In a
> system that can flag zones for regulatory review, that has a real livelihood
> cost, so we scoped it post-MVP and built the safety layer that generates the
> data first."

**"How do you stop someone spoofing an SOS?"**
> "Per-device HMAC keys, signed frames, replay protection by message ID, and a
> timestamp window. Jamming we can't mitigate at this budget, and we say so."

**"What's the range?"**
> Give the number **you measured**, not the datasheet number.

**"Battery life?"**
> Duty-cycled SoftAP, LoRa listening continuously, solar sizing. Be honest that
> the demo unit runs the AP always-on.

**"What if the gateway is down?"**
> "Store-and-forward at every buoy with backoff retry, and multiple
> gateway-capable nodes. An SOS is never dropped from the queue."

**"Why not a satellite beacon / PLB?"**
> Cost per vessel. Have the price comparison ready — this is a small-scale
> fisherman's budget.

**"How much per buoy? Who pays?"**
> Have a number. LGU/BFAR procurement is the realistic path.

**"What happens when a buoy is stolen or lost?"**
> "The key is revoked in the device registry; frames from it are rejected."

---

## Status table — keep this true, update it live

This is the honesty artifact. It goes in the README, in the deck, and you read
it out loud. In v1 this had to be retrofitted across many files after claims had
drifted from reality; here it's maintained as you build.

| Capability | Status | Notes |
|---|---|---|
| SOS over LoRa mesh, phone offline | ⬜ | The core claim. Update the moment it works. |
| Signed frames + replay protection | ⬜ | |
| Store-and-forward at buoy | ⬜ | |
| Multi-hop relay (3+ nodes) | ⬜ | Likely bench-only — say so |
| Buoy hazard sensing (MPU6050) | ⬜ | Bypass mode if the IMU is dead |
| Dashboard live feed + acknowledge | ⬜ | |
| Deployed backend, healthcheck green | ⬜ | |
| Range measured on water | ⬜ | Record the metres |
| AI hotspot model | ❌ **Not built** | Deliberate — circular target, no data |
| Catch-decline detection | ❌ **Not built** | Deliberate — out of scope |
| Catch logging / photos | ❌ **Not built** | Deliberate |
| Push notifications | ❌ **Not built** | Roadmap |
| Aklanon localisation | ❌ **Not built** | Roadmap |

Legend: ✅ working & demonstrated · 🟡 partial (explain) · ⬜ not yet · ❌ deliberately out of scope

**Never mark something ✅ that hasn't been run end to end.** A judge finding one
false claim invalidates every true one.

---

## Submission checklist — treat as due 5:00 pm Aug 4

- [ ] Deadline confirmed **in writing** with organisers (the two documents disagree)
- [ ] GitHub repo **public** — private links are stated grounds for immediate disqualification
- [ ] Secret scan clean (`07_SECURITY.md`)
- [ ] README: setup instructions + this status table
- [ ] Demo URL live and reachable **from outside the venue network** — test on mobile data
- [ ] Pitch deck: problem-solution fit, AI architecture, data strategy & ethics
- [ ] **Hardware declared** in the deck, and how its data is used (explicitly required)
- [ ] External models/libraries cited (RadioLib, FastAPI, etc.)
- [ ] Screencast recorded and uploaded
- [ ] Status table matches reality

---

## Day 3 logistics

Closing Ceremony is **1:00–4:00 pm at Iloilo Convention Center** — a different
venue from Sam's 21 Hotel.

- Hard stop on code ~10:30 am.
- Pack hardware in something padded. Bring spares and the antennas.
- Confirm whether you pitch at Sam's 21 before moving venues.
- Bring: laptop chargers, phone chargers, a power strip, USB cables, the
  hotspot, and a printed copy of the status table.
