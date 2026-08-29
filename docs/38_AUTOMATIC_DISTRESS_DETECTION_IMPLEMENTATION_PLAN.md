# Automatic Distress Detection — Implementation Plan

## Purpose and delivery rule

Build the software-only version of automatic distress detection described in
the PRD: confidence-scored **trip anomalies and overdue trips** created from
routine, trusted phone-to-buoy contact events.  A result is a responder review
candidate, not an SOS and not an automatic dispatch.

This is deliberately not a capsize detector.  Do not add vessel sensors,
firmware changes, LoRa downlink, a silent handset check-in, an automatic SOS,
or an automatic responder dispatch.  Those require hardware and operational
validation outside this handoff.  Do not tune model weights or thresholds in
this work either; make the current scoring honest and reviewable first.

`docs/31_ANOMALY_DETECTION_DECISION.md` records the current false-alert
defect and supersedes the earlier direct-to-responder conclusion in
`docs/30_DECISION_LOG.md`.  Follow the later evidence.

### Mandatory workflow

Before every phase, inspect the current branch and preserve unrelated work.
Implement only the files named by that phase, run its checks, inspect the
staged diff, and create the stated focused commit.  Never use `git add -A`,
never amend another person's commit, and never commit generated caches,
secrets, or unrelated mobile work.

If a phase's checks fail, fix or report that phase before beginning the next
one.  Do not silently skip a commit.  If the working tree already contains
unrelated edits, stage only the named paths.

## Acceptance boundary

The completed feature must meet all of these conditions:

- A contact event is accepted only from the existing trusted gateway path and
  is idempotent; the handset and public dashboard cannot manufacture one.
- Live contacts and demo/synthetic contacts are visibly distinct.  Production
  candidates must never be derived only from `is_synthetic = TRUE` data.
- An old historical trip, or a vessel last heard outside measured buoy
  coverage, cannot create an emergency candidate merely because the current
  date has advanced.
- Low-confidence results enter a verification queue.  High-confidence results
  request responder attention.  Neither result creates an SOS or dispatches
  responders automatically.
- The responder's acknowledgement, dismissal, escalation, and resolution are
  persistent audit actions; a later scoring refresh cannot erase them.
- The active read endpoint is read-only.  It must not truncate or rebuild
  database tables during dashboard polling.

## Phase 1 — Define and ingest trustworthy contact events

### Work

1. Read `docs/04_INGEST_API.md`, `docs/05_PUBLIC_API.md`, the current
   authentication guard, `backend/app/api/anomaly.py`, the contact migrations,
   and all callers before editing.  Reuse the existing gateway credential
   pattern.  If none exists, add only a dedicated gateway API-key guard from
   an environment variable; do not reuse a dashboard user token or add a new
   auth framework.
2. Update `docs/04_INGEST_API.md` first.  Define one versioned, gateway-only
   contact-event request with: upstream event ID, vessel ID, trip ID, buoy ID,
   observed-at time, optional location, and an explicit source
   (`live` or `synthetic`).  State its idempotency rule and error responses.
   Update `docs/05_PUBLIC_API.md` only for the responder-facing candidate
   contract introduced later; do not document a fictional handset endpoint.
3. Add the smallest migration needed to store the event ID and source with a
   database uniqueness constraint for deduplication.  Preserve existing
   `buoy_contacts` data and migrations; do not replace the table or rewrite
   historical rows.
4. Add the corresponding authenticated backend endpoint and request
   validation.  Return the pre-existing stored contact on an idempotent retry
   rather than creating a duplicate.  Keep this endpoint as the adapter for a
   future gateway integration; this phase does not modify LoRa or firmware.
5. Make the anomaly reader select its source explicitly.  Synthetic data may
   be used only in a clearly labelled demo/test evaluation.  Live evaluation
   must read live events, even if that initially produces an empty queue until
   the gateway owner connects the source.

### Tests

- Migration test or disposable-database check proves legacy contacts survive,
  source/event fields are present, and a duplicate event ID is rejected by the
  database.
- API tests cover: missing or bad gateway credential, invalid timestamps or
  IDs, first insert, and a retry returning one logical contact.
- Repository/service test proves production evaluation never falls back to
  synthetic contacts.
- Run `ruff check backend` and the targeted backend tests.

### Commit

`feat(contacts): ingest trusted vessel contact events`

## Phase 2 — Make scoring time-aware and non-destructive

### Work

1. Extract the current rebuild-and-score code into a small service with an
   injected evaluation time.  Use the server clock for live runs and an
   explicit replay clock for fixtures.  Do not use the latest row in the
   entire database as the definition of "now" for live detection.
2. Define one documented open-trip freshness window from the project's
   expected contact cadence, then keep it as one named application constant.
   Record the chosen value and rationale in the decision/status docs.  If the
   team has not selected a safe cadence, stop this phase for that decision;
   guessing it changes emergency behaviour.
3. Score only an eligible, recent trip whose last known location is at a
   measured buoy contact.  Exclude completed/historical data and do not infer
   an emergency from a gap outside known coverage.  Preserve the existing
   model calculation for eligible trips; this is a correctness guard, not
   model retuning.
4. Replace the current `TRUNCATE`-and-recompute-on-`GET /active` pattern.
   Evaluation may write derived scores through an explicit internal operation;
   the active endpoint only reads persisted results.  Keep the existing route
   compatible where practical, but include source, evaluated-at time, and
   data-age metadata so the dashboard can be honest.
5. Add a single scheduled invocation suitable for the existing Railway
   deployment (for example, the same backend process's documented one-shot
   command run by a Railway cron).  It must be idempotent and safe if it runs
   twice.  Do not add a queue, a second application, or a new dependency.

### Tests

- Unit tests cover a fresh overdue trip, a recent normal trip, a stale
  historical trip, and a vessel with no in-coverage recent contact.
- A request test proves `GET /active` does not invoke evaluation or issue a
  destructive database statement.
- Replay tests show the same fixture is deterministic when supplied the same
  evaluation time, and changes only when the supplied clock advances.
- Run the targeted tests plus `ruff check backend`.

### Commit

`fix(anomaly): score only current open trips`

## Phase 3 — Add a persistent responder-review loop

### Work

1. Add a minimal, separate persistent anomaly-case record keyed to the scored
   vessel/trip.  Keep derived score snapshots separate from human decisions so
   a periodic score refresh cannot erase a review outcome.
2. On evaluation, create or refresh an open case only for an eligible
   non-normal score.  Map low confidence to `verification`; map a
   high-confidence eligible score to `responder_attention`.  Store the source,
   score reason(s), score time, and contact/data age.  Do not label either
   case as an SOS.
3. Add authenticated responder actions: acknowledge verification, dismiss as
   false/expected, escalate for real-world handling, and resolve.  Require a
   short reason for dismissal/escalation where the current UI can provide one,
   record the user and time, and make repeated action requests idempotent.
4. Extend the dashboard's existing polling/rendering path to show a clearly
   separate “Trip checks” queue.  Display confidence, why it was raised,
   last trusted contact/data age, source, and state.  Reuse the current fetch
   helpers and action pattern; do not build WebSockets or a second dashboard.
   A responder must be able to act and see the action persist after reload.

### Tests

- Backend tests cover low versus high confidence routing, case creation once
  across repeated evaluation, and persistence of each responder action after
  re-evaluation.
- Authorization tests prove a public/handset caller cannot read or mutate the
  responder queue.
- Add the smallest existing dashboard test/check for rendering an empty queue,
  a verification item, and a responder-attention item; manually verify the
  action/reload path if the dashboard has no runnable UI harness.
- Run the targeted backend and dashboard checks, then `ruff check backend`.

### Commit

`feat(anomaly): add responder review cases`

## Phase 4 — Repair the offline evaluation before claiming detection quality

### Work

1. Fix `backend/ml/trip_profile_eval.py` so its normal-trip evaluation moves
   forward through future evaluation times rather than pinning every normal
   sample to its final observed contact.  Keep the test data and current
   thresholds fixed in this phase.
2. Have the evaluator report, at minimum: number of eligible normal trips,
   number of candidates raised, false-candidate rate, and the cases excluded
   for stale/out-of-coverage data.  A result from synthetic/demo data must be
   labelled as such, not presented as field accuracy.
3. Run the evaluator against its fixture and capture the output in
   `docs/08_DEMO_AND_STATUS.md`.  Update the PRD/status wording to say
   “demo/simulation verified” until a real, consented contact dataset and
   outdoor workflow are available.  Do not manufacture accuracy claims.

### Tests

- Add a regression test showing a normal trip is evaluated at a later clock
  and does not silently use its final-contact timestamp.
- Add an assertion for the evaluator's aggregate counts on the fixture.
- Run the evaluator, its regression tests, all anomaly/contact tests, and
  `ruff check backend`.

### Commit

`fix(eval): measure anomaly false alarms honestly`

## Phase 5 — Deploy safely and record an end-to-end proof

### Work

1. Configure the contact-ingest credential and scheduled evaluation only in
   the deployment environment.  Do not place values in Git, README examples,
   logs, or screenshots.
2. In a non-production or explicitly approved demo environment, submit one
   trusted fixture contact stream that produces a verification case and one
   that produces responder attention.  Confirm the dashboard actions persist
   across a reload and that a normal/stale fixture produces no active case.
3. Verify the deployed health endpoint, contact endpoint authorization, the
   read-only active queue, and the scheduled job's most recent successful run.
   Use the current Railway URL from the README; do not restore the old URL.
4. Update `docs/08_DEMO_AND_STATUS.md` with exact date, environment, source
   type, commands/checks run, observed outcomes, remaining hardware
   dependency, and any known limitation.  Update the README only if its
   feature-status wording would otherwise overstate the result.

### Tests

- `pytest backend/tests` (or the repository's complete backend test command)
  and `ruff check backend` pass.
- Run the dashboard checks used in Phase 3.
- Manual acceptance: responder can distinguish an anomaly candidate from an
  SOS, take an action, reload, and see the persisted history; no candidate is
  generated from stale or synthetic-only production data.

### Commit

`docs(anomaly): record automatic-distress verification`

## Handoff checklist for Claude Code

- Read `AGENTS.md`, `docs/00_START_HERE.md`, the PRD section on trip-anomaly
  detection, and `docs/23_INTEGRATED_SYSTEM_DESIGN.md` before coding.
- Treat the present anomaly endpoint as demo-only until Phase 1 makes a live
  trusted contact path real.  Do not claim this feature is field-ready first.
- Preserve the Manual SOS/responder and messaging/advisory work already in the
  working tree; this plan must not reformat, stage, or commit it.
- At each phase, show the exact tests run and commit hash.  Stop before the
  next phase if the previous phase has not demonstrably passed.
- Escalation remains human: the system identifies a candidate; MDRRMO decides
  what to do next.
