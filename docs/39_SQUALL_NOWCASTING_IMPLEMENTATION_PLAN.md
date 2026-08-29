# Squall Nowcasting — Implementation Plan

## Purpose and delivery rule

Turn the existing synthetic squall demonstration into a truthful,
software-ready nowcasting path: trusted buoy pressure telemetry, explicit data
quality/freshness checks, source-aware warnings, and evidence before a live
`RETURN NOW` claim.

This plan does **not** build or modify buoy firmware, barometer hardware, LoRa
transport, or a new weather vendor integration.  It defines the backend
adapter those owners will send to and makes the product safe while that live
source is absent.  It also does not retune the classifier merely to make a
demo fire.  The current model is trained and evaluated on simulated events;
its published recall is weak, so a synthetic prediction must not masquerade
as a live emergency.

The plan complements the stale-safe squall work in
`docs/37_SHORT_MESSAGING_WEATHER_ADVISORIES_IMPLEMENTATION_PLAN.md`.  If that
plan's Phase 3 has already landed, reuse its implementation and tests instead
of overwriting or recommitting them.  This plan owns the live-telemetry and
operational-readiness steps that remain.

### Mandatory workflow

Before each phase, inspect the branch and preserve unrelated work.  Update the
contract before implementing a changed interface.  Stage only the phase's
named files, inspect the staged diff, run its checks, then create the stated
focused commit.  Never use `git add -A`, amend someone else's commit, commit
generated caches/model artefacts, or stage unrelated mobile work.

Do not start the next phase until the previous phase demonstrably works.  If a
required safety policy or field-data decision is missing, record the blocker
and stop at that gate rather than inventing emergency behaviour.

## Current findings that the implementation must correct

- `backend/app/api/squall.py` and `backend/app/api/public.py` load only rows
  marked `is_synthetic = TRUE`; the current public result therefore cannot be
  current field weather.
- Its `as_of` is the newest synthetic row.  If that data is old, the handset
  can receive a stale synthetic `RETURN NOW` result.
- `extract_pressure_features()` fills an absent series with a nominal
  `1013.25 hPa` value and carries forward arbitrarily old readings.  Missing
  observations must result in an unavailable/insufficient-data result, not a
  fabricated calm baseline or a confident forecast.
- The dashboard and handset already consume distinct protected and public
  routes.  The handset deliberately maps a failed/unknown response to
  `unknown`, not clear; retain that truthful rule.
- The repository's demo verification found the scripted pressure series can
  produce baseline false positives and wall-clock-dependent behaviour.  Keep
  demo data behind an explicit demo path and label it as simulated.

## Safety and acceptance boundary

The finished software must satisfy all of these conditions:

- A live squall computation uses only trusted, recent, valid pressure readings
  from the configured fixed buoy array; it never silently mixes synthetic and
  live rows.
- A missing, stale, malformed, or insufficiently distributed array yields
  `unknown`/`insufficient_data` with the last observation time.  It never
  yields `clear`, `watch`, or `RETURN NOW` by inventing values.
- Synthetic/demo results are available only through an explicitly labelled
  demo workflow and cannot alarm a production handset.
- Official PAGASA notices remain separately attributed official advisories.
  An AqOne model output is never styled or worded as a PAGASA warning.
- `RETURN NOW` is gated by documented field validation and MDRRMO operational
  approval.  Before that gate passes, a live model candidate can be visible as
  `watch` to authenticated responders, but cannot trigger a handset alarm.
- The existing public and dashboard responses report source, observed time,
  generated time, data age, model version/calibration, and an explicit reason
  when the model cannot safely evaluate.

## Phase 1 — Define the trusted pressure-ingest contract

### Work

1. Read `AGENTS.md`, `docs/04_INGEST_API.md`, `docs/05_PUBLIC_API.md`,
   `docs/23_INTEGRATED_SYSTEM_DESIGN.md`, the current auth guards, squall API,
   migrations, and every current pressure-reading caller.  Reuse the existing
   trusted gateway credential mechanism.  If none exists, add only a dedicated
   gateway API-key guard from an environment variable; do not add an auth
   framework or use an operator token for a buoy.
2. Update `docs/04_INGEST_API.md` first with one gateway-only pressure event:
   immutable upstream event ID, configured buoy ID, observed-at timestamp,
   pressure in hPa, and source (`live` or `synthetic`).  Specify acceptable
   timestamp skew, pressure sanity limits, idempotent retry behaviour, and
   that an untrusted/public client cannot write telemetry.
3. Add the smallest additive migration for pressure-event provenance and a
   database uniqueness constraint on the upstream event ID.  Retain existing
   `barometric_readings` and synthetic demo rows; do not rewrite history or
   change buoy firmware protocols in this repository.
4. Add a gateway-authenticated ingest endpoint that validates, stores, and
   deduplicates the event.  Reuse the table and current `is_synthetic` flag;
   do not create a second telemetry service, broker, or queue.
5. Make synthetic writes demo-only: they require the existing demo mode and
   demo key, while normal gateway ingest rejects synthetic input in production.
   Do not make the public squall route a way to seed test data.

### Tests

- Migration/disposable-database test proves legacy readings remain, the event
  ID is unique, and a duplicate delivery creates one logical reading.
- API tests cover bad/missing gateway credentials, an unknown buoy, invalid
  pressure/timestamp, a valid live insert, retry idempotency, and rejection of
  synthetic data outside demo mode.
- Run `python -m pytest -q tests/test_squall.py` plus the new ingest tests and
  `ruff check .` from `backend`.

### Commit

`feat(telemetry): ingest trusted buoy pressure readings`

## Phase 2 — Make the pressure array quality-aware

### Work

1. Before coding, obtain and record one MDRRMO/technical-owner decision for:
   the intended sample interval, maximum acceptable age, minimum number of
   independent fixed buoys, minimum spatial geometry, and operational pressure
   sanity range.  The model needs at least three suitably distributed buoys to
   estimate propagation; do not guess a more permissive rule because a demo
   has fewer readings.
2. Add a small data-quality result to the existing squall service.  It must
   identify per-buoy freshness, valid recent history, array coverage, source,
   and an explicit insufficiency reason before feature extraction runs.
3. Stop `_latest_before()`/feature extraction from inventing a nominal pressure
   for an empty series or carrying forward data beyond the agreed freshness
   window.  A short, documented interpolation/hold may be used only when all
   quality rules still pass; otherwise return insufficient data.
4. Load one source at a time.  Production dashboard/public reads select live
   rows only; the demo control path selects synthetic rows only.  Use the
   server clock to compute data age, not the newest row as a surrogate for the
   current time.
5. Preserve the present deterministic feature/model code for a quality-passing
   array.  This phase is a gate before it, not a classifier rewrite or a new
   configuration system.

### Tests

- Unit tests cover a complete fresh array, one empty series, one stale buoy,
  out-of-order readings, a pressure outside the agreed sanity range, and
  collinear/insufficient geometry.
- Assert that no feature bundle is produced from an empty/stale series and
  that the result exposes `insufficient_data` with its newest real timestamp.
- Assert that synthetic rows are invisible to the live loader and vice versa.
- Run targeted squall/ingest tests and `ruff check .` from `backend`.

### Commit

`fix(squall): reject stale and incomplete pressure arrays`

## Phase 3 — Publish source-aware, alarm-safe nowcast status

### Work

1. Stabilize one shared response shape for the protected dashboard route and
   `GET /api/public/squall`: `source`, `calibration`, `observed_at`,
   `generated_at`, `data_age_seconds`, `status_reason`, `level`, and the
   existing detection details only when quality passes.  Update
   `docs/05_PUBLIC_API.md` before changing the response.
2. Use the smallest truthful states:

   - `unknown` — unavailable, stale, invalid, or incomplete telemetry;
   - `clear` — a fresh, quality-passing live array with no detection;
   - `watch` — an eligible model candidate, visible to responders;
   - `return_now` — only after the operational validation gate below is
     enabled.

   Do not downgrade unavailable data to clear.  Do not let a classifier score
   alone override the validation gate.
3. Keep the existing synthetic scenario usable through a demo-only API/control
   surface that carries `source: synthetic` and a visible simulation label.
   Remove any production route path where old synthetic rows can create a
   dashboard banner or handset alarm.
4. Apply the stale/unknown contract from Plan 37 to `SquallWatch`, the banner,
   and alert page.  Show the most recent observation time/reason where space
   permits, preserve an already displayed warning during a transient fetch
   failure, and never create a new alarm for stale/synthetic data.
5. Update the dashboard squall panel to show freshness/source/calibration and
   a neutral insufficient-data state.  Reuse its existing polling and map
   layers; do not add WebSockets or a second weather panel.

### Tests

- Route tests prove no current telemetry is `unknown`, fresh valid non-event
  data is `clear`, a fresh qualified model candidate is `watch` before the
  validation gate, and stale/synthetic data cannot be public `RETURN NOW`.
- Test public-route access remains unauthenticated while the dashboard route
  remains protected; telemetry ingest remains gateway-only.
- Add/extend mobile tests for parsing `status_reason`, no new stale alarm, and
  server-side level precedence.  Run the smallest dashboard rendering check
  for clear, watch, and insufficient data.
- Run `python -m pytest -q`, `ruff check .`, `flutter analyze`, and the
  targeted squall/mobile tests.

### Commit

`feat(squall): publish source-aware nowcast status`

## Phase 4 — Establish evidence before enabling RETURN NOW

### Work

1. Repair the evaluation protocol before changing any threshold: separate
   events in time and, where possible, location; report precision, recall,
   lead time, calibration/Brier score, false-alert rate, and the count of
   excluded low-quality windows.  Retain the existing simulated evaluation as
   explicitly labelled demo evidence, not field validation.
2. Add a transparent pressure-tendency baseline to the *evaluation only*.
   Compare it with the current logistic model.  Keep the simpler baseline if
   the model does not improve time-separated validation; do not add another ML
   library, ensemble, or live retraining.
3. Create a compact field-validation log template in `docs/08_DEMO_AND_STATUS.md`:
   fixed buoy locations, clock sync, sampling continuity, calibration checks,
   official-event/observer ground truth, false alerts, misses, lead time, and
   outage periods.  Field collection and weather-event labelling require the
   responsible hardware/operations owners; this plan does not fabricate them.
4. Set an explicit release gate in documentation and code: a named MDRRMO
   approver must review a recorded field-validation set and enable an existing
   deployment environment flag before `return_now` is allowed.  Default off.
   No hidden threshold override and no production training endpoint.

### Tests

- Regression test proves the evaluator does not train and score the same event
  group on both sides of its split, and emits each required metric.
- Regression test covers a quality-failing event window and verifies it is
  counted as excluded rather than scored as calm.
- Tests prove the release flag defaults to watch-only and can enable
  `return_now` only for fresh, quality-passing live input.
- Run the evaluator against the committed synthetic fixture, targeted tests,
  `python -m pytest -q`, and `ruff check .`.

### Commit

`test(squall): add time-split nowcast evaluation`

## Phase 5 — Deploy and rehearse without overstating readiness

### Work

1. Configure the gateway credential and any approved validation gate only as
   Railway environment variables.  Do not commit values or print them in logs.
   Keep the validation gate disabled until Phase 4's field evidence is signed
   off.
2. In a non-production or explicitly approved demo environment, ingest a
   complete fresh pressure fixture, verify a clear/watch transition, then age
   or remove a buoy reading and verify the state becomes insufficient/unknown.
   Separately run the synthetic demo route and verify that it is labelled and
   cannot alarm a production handset.
3. Verify the current Railway health endpoint, ingest authorization, public
   stale/unknown response, dashboard status rendering, handset no-new-alarm
   behaviour, and the absence of synthetic rows from production output.
4. Update `docs/08_DEMO_AND_STATUS.md` and the README only with exact observed
   environment, timestamps, source type, checks, results, and the remaining
   hardware/field-validation dependency.  Keep the existing disclosure that
   synthetic calibration is not a PAGASA warning or a field-proven alert.

### Tests

- `python -m pytest -q` and `ruff check .` pass in `backend`.
- `flutter analyze` and the targeted squall tests pass in `mobile`.
- Manual acceptance: a responder can distinguish live quality-passing status,
  insufficient telemetry, a demo simulation, and an official advisory; a
  fisherman never receives a new alarm from stale or synthetic data.

### Commit

`docs(squall): record staged nowcast verification`

## Handoff checklist for Claude Code

- Read the PRD's squall section, `docs/23_INTEGRATED_SYSTEM_DESIGN.md`,
  `docs/31_DEMO_VERIFICATION_01.md`, and Plan 37 before touching code.
- Preserve the existing Manual SOS, messaging/advisories, and anomaly-plan
  work in the dirty workspace.  Do not reformat, stage, or commit it.
- Do not run `POST /api/ai/squall/train` in deployment and do not replace the
  committed model artefact as part of telemetry plumbing.
- Report the exact test commands and commit hash at the end of every phase.
  Stop before the next phase if a test, policy gate, or field-data prerequisite
  has not passed.
