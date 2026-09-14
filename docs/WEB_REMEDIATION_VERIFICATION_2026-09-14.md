# Remediation verification - 2026-09-14

## Latest recheck: 136 passing tests

**The four findings V1-V4 below are fixed in the current working tree at the level of the focused reproductions.**
Two medium-priority issues remain in the new freshness/timeout implementation.
The earlier findings and results are preserved under the historical section below.

| Previous finding | Latest evidence |
|---|---|
| V1: stale marine data | Actual weather renderer now shows CONDITIONS UNKNOWN and LAST KNOWN for fresh weather with old marine observations |
| V2: pending requests prevent aging | Scheduled trip-check freshness callback now changes an empty queue to badge `--` and FEED OFFLINE without waiting for the request |
| V3: offline active squall still says LIVE | Actual AI module and shared status renderer now show LAST KNOWN, FEED OFFLINE, age, and the offline reason while retaining the detection |
| V4: sample SOS says UNKNOWN | Sample records explicitly carry synthetic provenance; the new rendered test confirms DEMO and its tooltip |

Independently rerun: `node --test web/test/*.test.js` passed 136 tests with 0 failures; syntax checks across `web/js` and `git diff --check` passed.
The prior optional cleanup of externally writable drawer/timestamp properties and the unused applied-filter getter is also complete.
Backend checks and an authenticated end-to-end browser flow were not rerun in this pass.
The implementation remains uncommitted on top of `68da372`.

### C1 - P2: Freshness updates repeatedly recenter the map

**Locations:** `web/js/dashboard/dashboard-ai-ops.js:819,928,1035`.

The new 15-second freshness timer calls `updateAIFreshness`, which calls `renderSquallWatch` for the retained active detection.
That renderer clears and rebuilds the squall layer, then calls `map.fitBounds` when there is a valid squall polygon and no drift contour.
Consequently an outage makes a time-label update repeatedly move the operator's map back to the squall.
This also bypasses the drawing guard later in `pollAIOperations`.

**Reproduction:** Load an active detection with a polygon, advance the fake clock beyond the offline threshold, then invoke the actual registered 15-second callback twice without fetching new data.
The actual module calls `map.fitBounds` twice.
The added active-squall regression uses a null polygon, so it does not catch this interaction.

**Smallest fix:** Update the status/badge/age presentation without rebuilding geometry or changing the viewport on a freshness-only tick.
Keep map movement tied to an appropriate new-data or explicit operator action.
Add one check that freshness ticks preserve the viewport with a populated polygon, including while the operator is drawing.

### C2 - P2: The new deadlines do not cancel timed-out requests

**Locations:** `web/js/dashboard/dashboard-ai-ops.js:44-59`; `web/js/dashboard/dashboard-trip-checks.js:49-82`.

Both implementations race a fetch promise against a timer rejection.
The timeout settles the wrapper but does not abort the underlying request, while scheduled polling continues starting additional requests.
This leaves outstanding network work able to accumulate during a stalled connection and does not fulfill the intended bound on pending requests.
Timers also remain scheduled after successful responses.

**Evidence:** The module calls `authFetch` without a signal in both paths.
In the controlled stalled-request probe, all three AI initialization fetches remained uncancelled after their deadline callbacks ran; none had received an abort signal.
The visible freshness fix works independently, so this does not reopen the old V2 display failure.

**Smallest fix:** Pass a real cancellation signal to the existing authenticated fetch and abort at the deadline.
Use the native timeout signal where supported, or follow the existing AbortController and timer cleanup pattern in `dashboard-shortcuts-weather.js:396`.
Keep response/body parsing within the deadline and check actual cancellation, not only wrapper rejection.

### Current Ponytail finding

`native:` Remove the two hand-built Promise.race timeout wrappers; use native abort signals through the existing fetch API, preserving the deadline and error handling. [`dashboard-ai-ops.js`](../web/js/dashboard/dashboard-ai-ops.js), [`dashboard-trip-checks.js`](../web/js/dashboard/dashboard-trip-checks.js).

Estimated savings with the native timeout signal; excludes the required map-behavior fix.

net: -12 lines, -0 deps possible.

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

`delete:` About 16 lines of test-oriented namespace exposure remain: writable drawer/timestamp properties and the applied-filter getter; keep state private and assert rendered or requested behavior through existing actions. [`dashboard-incidents.js`](../web/js/dashboard/dashboard-incidents.js), [`dashboard-live-sos.js`](../web/js/dashboard/dashboard-live-sos.js), [`dashboard-operations-audit.js`](../web/js/dashboard/dashboard-operations-audit.js).

net: -16 lines, -0 deps possible.
