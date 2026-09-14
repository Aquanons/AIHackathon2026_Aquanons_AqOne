# Remediation verification - 2026-09-14

## Latest recheck: 141 passing tests

**The latest C1/C2 fixes pass independent focused verification; no new blocking regression was found in the reviewed changes.**
The existing regression suite continues to pass for the earlier fixes.
The earlier findings and results are preserved under the historical section below.

| Previous finding | Latest evidence |
|---|---|
| V1: stale marine data | Actual weather renderer now shows CONDITIONS UNKNOWN and LAST KNOWN for fresh weather with old marine observations |
| V2: pending requests prevent aging | Scheduled trip-check freshness callback now changes an empty queue to badge `--` and FEED OFFLINE without waiting for the request |
| V3: offline active squall still says LIVE | Actual AI module and shared status renderer now show LAST KNOWN, FEED OFFLINE, age, and the offline reason while retaining the detection |
| V4: sample SOS says UNKNOWN | Sample records explicitly carry synthetic provenance; the new rendered test confirms DEMO and its tooltip |
| C1: map recentering on freshness ticks | Freshness ticks use `freshnessOnly: true` to update status/badge/age without clearing geometry or invoking `map.fitBounds`; drawing guard prevents recentering |
| C2: uncancelled timed-out requests | Hand-built `Promise.race` wrappers replaced with native `AbortSignal.timeout` passed to `authFetch`, canceling stalled network requests at deadline |

Independently rerun: `node --test web/test/*.test.js` passed 141 tests with 0 failures; syntax checks across `web/js` and `git diff --check` passed.
The prior optional cleanup of externally writable drawer/timestamp properties and the unused applied-filter getter is also complete.
Backend checks and an authenticated end-to-end browser flow were not rerun in this pass.

### Independent final recheck of C1/C2

Reviewed the latest uncommitted changes on top of `5ae5390`; the earlier web remediation is committed as `ebb3476`.
The unrelated mobile APK commit was outside this review.

- **C1:** Executed the actual AI module with a populated squall polygon and invoked its registered freshness timer twice after expiry, without setting the drawing flag.
  Initial load centered once; the subsequent two ticks caused zero viewport changes and zero layer clears.
  The committed-style regression in the working tree additionally covers drawing mode.
- **C2:** Executed both application modules against a temporary localhost HTTP server using actual native fetch and the production 25-second timeout values.
  Four requests started, all four signals became aborted, and the server observed all four requests close.
  One response sent headers and an incomplete JSON body, verifying that the deadline also cancels stalled body parsing.
  The local server was closed after verification.
- **Checks:** Independently confirmed 141 passing tests, JavaScript syntax checks across `web/js`, and a clean `git diff --check`.

The repository's two new C2 tests verify signal presence but do not themselves wait for cancellation; the real-network probe above supplies that additional evidence.
Browser compatibility remains conditional: when `AbortSignal.timeout` is absent, the feature-detection fallback currently supplies no deadline.
If such browsers are supported, use the existing AbortController/timer-cleanup pattern for that fallback.
The native timeout path is the one verified here.

### Optional Ponytail cleanup from the final recheck

`delete:` Remove the newly exposed test-only `ns.sectorDraw` and unconsumed `ns.aiFreshnessTimer` properties; retain the private state/timer and exercise drawing through its existing controls in tests. [`dashboard-ai-ops.js:1071,1091`](../../web/js/dashboard/dashboard-ai-ops.js).

This is optional cleanup, not a release blocker; estimated production-code savings only.

net: -2 lines, -0 deps possible.

### C1 - P2: Freshness updates repeatedly recenter the map — RESOLVED

**Locations:** `web/js/dashboard/dashboard-ai-ops.js:763-832,920-932`.

- Updated `renderSquallWatch` to accept `options.freshnessOnly`, skipping squall layer clearing, geometry rebuilding, and `map.fitBounds`.
- Added drawing guard check (`!sectorDraw.active && !sectorDraw.bounds`) before invoking `map.fitBounds`.
- `updateAIFreshness` passes `{ freshnessOnly: true }` when refreshing status, badge, and age presentation.
- Added regression test confirming 15-second freshness ticks preserve viewport without calling `fitBounds`, including while the operator is drawing.

### C2 - P2: The new deadlines do not cancel timed-out requests — RESOLVED

**Locations:** `web/js/dashboard/dashboard-ai-ops.js:44-59`; `web/js/dashboard/dashboard-trip-checks.js:67-85`.

- Replaced hand-built `Promise.race` timeout wrappers with native `AbortSignal.timeout(...)`.
- `authFetch` receives `{ signal: signal }` and forwards it to `fetch`, enabling native request aborting upon deadline.
- Added regression tests verifying that `authFetch` receives active native `AbortSignal` instances for both AI operations and trip checks.

### Current Ponytail finding — RESOLVED

`native:` Removed the two hand-built Promise.race timeout wrappers; use native abort signals through the existing fetch API, preserving the deadline and error handling. [`dashboard-ai-ops.js`](../../web/js/dashboard/dashboard-ai-ops.js), [`dashboard-trip-checks.js`](../../web/js/dashboard/dashboard-trip-checks.js).

net: -12 lines, -0 deps achieved.

## Historical check: 132 passing tests

Reviewed the uncommitted remediation changes on top of `68da372` following the reported R1-R5 completion summary.
This report supplements the earlier re-audit; it does not alter the implementation or its completion claims.

**Verdict: the original reproductions are substantially addressed, but R1/R4 freshness handling remains incomplete and a sample-label regression remains in R2.**

## Independently verified

- `node --test web/test/*.test.js`: 132 passed, 0 failed.
- JavaScript syntax checks across `web/js`: passed.
- `git diff --check`: passed.
- R1 raw null/blank/boolean parsing, R2 backend SOS actionability, R3 modal exports and obsolete Buoy call removal, and R5 accepted audit-filter snapshots are addressed in the reviewed code and passing focused tests.
- Native Leaflet distance, shared escaping/confidence helpers, and removal of four unused sequence getters are present.
- The backend `beat = _beat(index)` repair and use of a scenario supporting multiple beats in the idempotency test are consistent with the surrounding code.

The reported backend result of 300 passed, 5 skipped, and 1 xfailed was not independently reproduced.
The available Python runtime still lacks pytest and Ruff; neither is available through the shell's Python commands.
No authenticated backend/browser persistence flow was rerun in this pass.
The new implementation remains uncommitted.

## Remaining findings

### V1 - P1: Marine observation age is ignored by the weather verdict

**Location:** `web/js/dashboard/dashboard-shortcuts-weather.js:234-278`.

The renderer checks `data.current.time` and the combined fetch time but never checks `marineData.current.time`.
A recent successful fetch does not make the marine observation recent.

**Reproduced with the actual module:** Current weather at `2026-09-14T05:00:00Z`, calm marine readings timestamped `2026-01-01T00:00:00Z`, and a current fetch timestamp still produce `MODEL: LOWER RISK` and `LIVE MODEL`.

**Fix:** Validate the age of each source used for the verdict, including absent/invalid marine timestamps.
Preserve known adverse evidence, but do not use expired calm marine data to certify current lower risk.
Add the mixed-freshness case to the renderer tests.

### V2 - P2: Freshness does not advance while requests remain pending

**Locations:** `web/js/dashboard/dashboard-trip-checks.js:49-76`; `web/js/dashboard/dashboard-ai-ops.js:880-936`.

The new freshness calculations run inside rejection handlers.
The poll timer starts requests but does not independently update freshness, and the shared authenticated fetch has no request deadline.
Requests stalled beyond the freshness threshold therefore do not trigger those rejection handlers or update the stale display.

**Reproduced with the actual trip-check module:** Load an empty queue successfully, advance the clock by ten minutes, invoke its scheduled polling callback with a promise that remains pending, and drain the event loop.
The queue still displays the empty result and badge `0`, without a stale or unavailable notice.
The AI polling code has the same dependency on rejection for its age transition.

**Fix:** Recompute freshness from the last accepted success on a timer independently of promise settlement, reusing the existing helper.
Prevent indefinitely outstanding requests through a bounded timeout or equivalent existing request handling.
Test unresolved requests as well as rejected ones.

### V3 - P2: An offline active squall still displays LIVE without the new warning

**Locations:** `web/js/dashboard/dashboard-ai-ops.js:920-928`; `web/js/dashboard-utils.js:361-386`.

The failure handler adds an offline message to `status_reason`, but `squallStatusHtml` renders that field only when `level === 'unknown'`.
An active detection retains its original level and `source: 'live'`, so its warning is hidden and its badge remains LIVE.
Increasing `data_age_seconds` alone does not supply the reported LAST KNOWN status.

**Reproduced with the actual AI module and actual status helper:** Accept an active live squall, advance time by ten minutes, then reject its next poll.
The rendered status is `LIVE 10m old calibrated model`, with no offline or last-known notice.
The tests cover expired calm detections but do not cover this active-detection path with the real status renderer.

**Fix:** Render feed freshness separately from provenance and hazard level.
Keep the active warning visible while clearly labeling it LAST KNOWN and STALE/OFFLINE.
Test the visible active-squall status using the shared production helper.

### V4 - P2: The hardcoded sample SOS is now labeled UNKNOWN

**Location:** `web/js/dashboard/dashboard-vessels-alerts.js:129-134,200-209`.

The sample `Manual SOS` row in `alertData` has no provenance fields.
The new fallback treats every SOS without provenance as unknown, including this known scripted sample.
It consequently loses its DEMO badge and sample-data tooltip.

**Fix:** Explicitly mark the existing sample rows as synthetic/demo at their source.
Reserve unknown provenance for backend records whose provenance is unavailable.
Add a rendered assertion for the existing hardcoded SOS alongside the backend synthetic/unknown tests.

## Completion and next checks

Keep R1 and R4 open, and retain V4 as the remaining R2 provenance-label issue.
R3 and R5 pass this focused recheck.
After the changes above, rerun the focused tests with unresolved requests, mixed weather/marine timestamps, and active squalls rendered through the real helper.
Record backend and authenticated browser evidence separately from these module checks.

The new suite contains 18 tests including its five parent tests, rather than 18 separately added leaf scenarios.
Its pressure-validation test name also overstates coverage: the fixture does not supply an out-of-range pressure value or assert that pressure is rejected.
Match test names and completion statements to their actual assertions.

## Ponytail follow-up

`delete:` About 16 lines of test-oriented namespace exposure remain: writable drawer/timestamp properties and the applied-filter getter; keep state private and assert rendered or requested behavior through existing actions. [`dashboard-incidents.js`](../../web/js/dashboard/dashboard-incidents.js), [`dashboard-live-sos.js`](../../web/js/dashboard/dashboard-live-sos.js), [`dashboard-operations-audit.js`](../../web/js/dashboard/dashboard-operations-audit.js).

net: -16 lines, -0 deps possible.
