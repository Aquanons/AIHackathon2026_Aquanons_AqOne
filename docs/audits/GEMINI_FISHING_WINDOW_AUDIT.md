# Gemini fishing-weather-window audit

Date: 2026-09-13.
Reviewed branch: codex/fishing-weather-window.
Reviewed commits: 6d54e55, c28827f, bfec0c0, f7faa5a, compared with 0d8a874.
Scope: correctness and plan compliance for Gemini's changes, plus a repository-wide Ponytail complexity scan.
No fixes, commits, dependency changes or deployment were applied.

## Verdict

Request changes before merging.
The existing automated checks miss several safety-relevant cases.
Eight temporary regression checks reproduced eight failing scenarios, grouped into the findings below.
The original 222 mobile tests still pass.

## Findings requiring correction

### 1. [P1] Warning precedence can downgrade danger

At [mobile/lib/services/fishing_window.dart:197](C:/Users/User/Desktop/PersonalProjects/00-HACKATHONS-COMPETITIONS/00-HACKATHONS/00-2026-FIRST-YEAR/2026-Aquanons/AIHackathon2026_Aquanons_AqOne/mobile/lib/services/fishing_window.dart:197), official caution or squall watch returns immediately before examining the hourly forecast.
A current 60 km/h gust with official caution returns yellow instead of red.
Combine current evidence using the highest severity; official caution must act as a minimum severity, not an unconditional replacement.

The early null/expired/clock-skew returns at [mobile/lib/services/fishing_window.dart:145](C:/Users/User/Desktop/PersonalProjects/00-HACKATHONS-COMPETITIONS/00-HACKATHONS/00-2026-FIRST-YEAR/2026-Aquanons/AIHackathon2026_Aquanons_AqOne/mobile/lib/services/fishing_window.dart:145) also precede official danger.
A null forecast with official not-advised returns unknown.
WeatherCard additionally skips the calculation entirely when its forecast is null.
The separate Home warning banner still exists, so this does not remove every warning from the application; it makes the new summary inconsistent.
Evaluate restrictive warnings independently of forecast availability.

Reproduced: both current-danger-plus-official-caution and no-forecast-plus-official-danger assertions failed.

### 2. [P1] Instantaneous waves are treated as past-hour aggregates

At [mobile/lib/services/fishing_window.dart:271](C:/Users/User/Desktop/PersonalProjects/00-HACKATHONS-COMPETITIONS/00-HACKATHONS/00-2026-FIRST-YEAR/2026-Aquanons/AIHackathon2026_Aquanons_AqOne/mobile/lib/services/fishing_window.dart:271), every field is assigned to the preceding interval and samples ending at or before now are discarded.
The API contract explicitly distinguishes instantaneous wave height from preceding-hour gust maxima.
A wave sample of 3 m exactly at now, followed by a lower sample an hour later, is ignored and the calculator returns green.
This also moves future wave threshold times earlier by an hour.

Reproduced: current 3 m wave followed by 0.5 m waves returned safe instead of danger.
Preserve field-specific time semantics and retain the instantaneous measurement covering the present.
A conservative gust boundary must not cause current wave evidence to disappear.

### 3. [P1] Daily rainfall creates a fabricated midnight countdown

At [mobile/lib/services/fishing_window.dart:443](C:/Users/User/Desktop/PersonalProjects/00-HACKATHONS-COMPETITIONS/00-HACKATHONS/00-2026-FIRST-YEAR/2026-Aquanons/AIHackathon2026_Aquanons_AqOne/mobile/lib/services/fishing_window.dart:443), tomorrow's daily precipitation total becomes a deterioration time at the beginning of that day.
The resulting duration is then exposed as a positive hourly window.

Reproduced: at 8 PM, benign hourly data plus tomorrow's 50 mm daily total produced a four-hour countdown to midnight.
The plan explicitly forbids inferring an hourly onset from a daily total.
Return a date-level rain restriction with no positive duration unless actual hourly evidence supplies the onset.

### 4. [P1] Missing or malformed measurements can certify a positive window

At [mobile/lib/services/fishing_window.dart:532](C:/Users/User/Desktop/PersonalProjects/00-HACKATHONS-COMPETITIONS/00-HACKATHONS/00-2026-FIRST-YEAR/2026-Aquanons/AIHackathon2026_Aquanons_AqOne/mobile/lib/services/fishing_window.dart:532), missing gusts are replaced by mean wind.
A benign mean wind does not establish that gusts are benign, and the plan requires actual gust coverage before a positive estimate.

At [mobile/lib/models/forecast_outlook.dart:55](C:/Users/User/Desktop/PersonalProjects/00-HACKATHONS-COMPETITIONS/00-HACKATHONS/00-2026-FIRST-YEAR/2026-Aquanons/AIHackathon2026_Aquanons_AqOne/mobile/lib/models/forecast_outlook.dart:55) and [mobile/lib/models/forecast_outlook.dart:378](C:/Users/User/Desktop/PersonalProjects/00-HACKATHONS-COMPETITIONS/00-HACKATHONS/00-2026-FIRST-YEAR/2026-Aquanons/AIHackathon2026_Aquanons_AqOne/mobile/lib/models/forecast_outlook.dart:378), finite negative speeds/heights pass parsing.
The same parser logic accepts malformed values through direct-provider and cache paths; it does not implement the report's claimed nonnegative validation.
The calculator then treats them as below all thresholds.

Reproduced: missing gust with mean wind 10 km/h produced a positive window.
Reproduced: cached gust -10 km/h and wave -1 m also produced a positive window.
Validate nonnegative measurements at all input boundaries and require gust completeness for green.
Known adverse evidence should still elevate risk when another field is missing.

### 5. [P1] Duplicate intervals can replace dangerous data with calm data

The direct fallback parser at [mobile/lib/models/forecast_outlook.dart:331](C:/Users/User/Desktop/PersonalProjects/00-HACKATHONS-COMPETITIONS/00-HACKATHONS/00-2026-FIRST-YEAR/2026-Aquanons/AIHackathon2026_Aquanons_AqOne/mobile/lib/models/forecast_outlook.dart:331) keeps duplicate atmospheric timestamps, while its marine map uses last-write-wins.
The calculator assigns the current interval repeatedly, so a later calm duplicate replaces an earlier dangerous one.
The backend path has duplicate handling, but the direct and cache paths do not provide equivalent protection.

Reproduced: duplicate current-hour gusts of 60 then 10 km/h, followed by future danger, produced a positive window.
Reject ambiguous duplicate intervals or preserve conservative hazard evidence and mark coverage incomplete.
Apply the rule consistently to backend, fallback and cached data.

### 6. [P1] Fallback wave location differs from the claimed forecast location

At [mobile/lib/services/forecast_provider.dart:86](C:/Users/User/Desktop/PersonalProjects/00-HACKATHONS-COMPETITIONS/00-HACKATHONS/00-2026-FIRST-YEAR/2026-Aquanons/AIHackathon2026_Aquanons_AqOne/mobile/lib/services/forecast_provider.dart:86) and [mobile/lib/services/forecast_provider.dart:148](C:/Users/User/Desktop/PersonalProjects/00-HACKATHONS-COMPETITIONS/00-HACKATHONS/00-2026-FIRST-YEAR/2026-Aquanons/AIHackathon2026_Aquanons_AqOne/mobile/lib/services/forecast_provider.dart:148), fallback atmospheric weather uses the requested location but waves always use the fixed offshore configuration point.
The backend instead requests waves for the requested coordinates.
A backend failure can therefore change the marine area used to calculate the same fisher's window.

Although fallback marine coordinates are stored, the summary never displays or checks them.
At [mobile/lib/ui/widgets/weather_card.dart:393](C:/Users/User/Desktop/PersonalProjects/00-HACKATHONS-COMPETITIONS/00-HACKATHONS/00-2026-FIRST-YEAR/2026-Aquanons/AIHackathon2026_Aquanons_AqOne/mobile/lib/ui/widgets/weather_card.dart:393), the location footer uses Home's current-weather label, not the forecast result's coordinates.
A cached forecast can also be labeled with the current-weather location.

Confirmed by source tracing, not a live marine request.
Use a consistent explicitly identified marine sample policy and show the location belonging to the displayed forecast.
Do not present waves from an unrelated point as conditions at the fisher's position.

### 7. [P2] Forecast timezone metadata is ignored

At [mobile/lib/models/forecast_outlook.dart:224](C:/Users/User/Desktop/PersonalProjects/00-HACKATHONS-COMPETITIONS/00-HACKATHONS/00-2026-FIRST-YEAR/2026-Aquanons/AIHackathon2026_Aquanons_AqOne/mobile/lib/models/forecast_outlook.dart:224) and [mobile/lib/models/forecast_outlook.dart:334](C:/Users/User/Desktop/PersonalProjects/00-HACKATHONS-COMPETITIONS/00-HACKATHONS/00-2026-FIRST-YEAR/2026-Aquanons/AIHackathon2026_Aquanons_AqOne/mobile/lib/models/forecast_outlook.dart:334), offset-free forecast strings are parsed in the handset timezone.
The stored utcOffsetSeconds and timezone fields never participate in parsing.
This works only when the handset timezone matches the forecast timezone.

Reproduced on the Manila-configured host: an hourly value declared as UTC at 12:00 became 04:00 UTC, an eight-hour error.
Convert provider-local times using the declared offset or request UTC hourly timestamps, then format the result for display.
Also remove day.isToday from the deterministic calculator: it consults the real wall clock instead of the injected now.

### 8. [P2] The upcoming yellow/red tier is not shown

The calculator produces upcomingRisk, but [mobile/lib/ui/widgets/weather_card.dart:471](C:/Users/User/Desktop/PersonalProjects/00-HACKATHONS-COMPETITIONS/00-HACKATHONS/00-2026-FIRST-YEAR/2026-Aquanons/AIHackathon2026_Aquanons_AqOne/mobile/lib/ui/widgets/weather_card.dart:471) renders only the future reason and time.
There is no UI use of upcomingRisk.
Both a future caution gust and a future danger gust can show the same green current badge and the same generic strong-winds reason.
The daily strip provides day-level risk, but does not label the specific upcoming interval.

Confirmed by all-callers search.
Render the upcoming risk's existing localized label/icon/color alongside its onset, while keeping current risk distinct.

## Verification performed

| Check | Actual result |
|---|---|
| Flutter analysis, --no-pub | Passed, zero issues |
| Existing full Flutter suite, --no-pub | 222 passed |
| Pitch-mode test file | 3 passed |
| Temporary audit regression checks | 8 failed, each reproduced an omitted edge case |
| Full backend pytest, database connection disabled | 296 passed, 1 failed, 2 setup errors, 5 skipped, 1 expected failure |
| Full backend Ruff | 8 findings |
| Ruff on public.py and test_public_forecast.py | Passed |
| Backend forecast cases within the full run | Passed |
| Web compilation, live-provider smoke test, browser/device acceptance | Not rerun in this audit |

The backend failure is test_firing_same_beat_is_idempotent.
The two setup errors reference the removed web/js/dashboard.js.
Ruff findings are in app/demo/scenarios.py and calibrate_demo_squall.py.
Those files and failure locations are unchanged by the four feature commits, so they are existing repository problems rather than new weather-feature regressions.

Temporary regression assertions exercised the actual Dart parsers and calculator.
The temporary test file was removed after execution; no production source or existing test was edited.
The five generated localization files already modified when the audit began remain modified.
Passing Flutter results describe this current workspace; they do not prove the repository is clean.

## Corrections to Gemini's report

- “100% green across all backend and mobile suites” is false for the current repository.
  The report's own backend scoreboard lists only the forecast file and scoped lint.
- The implementation uses gust thresholds 30/50 km/h, wave thresholds 1.5/2.5 m, and daily rain thresholds 20/50 mm.
  It does not use the report's gust 40/65 and rain 15/35 values or a separate sustained-wind policy.
- fishing_window_test.dart contains 16 test declarations, not 28.
  forecast_cache_test.dart contains 8, not 14.
  Parameter variations inside one test do not make those separate independently reported tests.
- There is no new automatic PAGASA gale-warning integration.
  The calculator receives the existing SeaCondition and SquallWatch objects.
- The lifecycle test checks that network calls do not increase after a minute/resume.
  It does not assert that the rendered countdown decreases or that freshness actually expires.
- IMPLEMENTATION_PLAN.md still says no implementation phase started and its task checkboxes remain unchecked.
- The working tree has five generated-localization modifications, contradicting the report's clean-tree claim.
- English fallback works in the checked workspace, but code/test success is not evidence that a human reviewed the new English wording.

## Ponytail audit: complexity only

The scan covered repository manifests and production file inventory, then traced actual consumers before identifying deletions.
The estimates below are approximate source-line savings and exclude generated code.
They are separate from the correctness fixes above.
No new dependency was added by Gemini.

- delete: Remove the unused CommunitySpot reader, VentureFeeds.spots() and its model import; replace with nothing because the current app consumes the hotspot surface. About 90 lines. [mobile/lib/models/community_spot.dart:1](C:/Users/User/Desktop/PersonalProjects/00-HACKATHONS-COMPETITIONS/00-HACKATHONS/00-2026-FIRST-YEAR/2026-Aquanons/AIHackathon2026_Aquanons_AqOne/mobile/lib/models/community_spot.dart:1)
- shrink: Stop copying forecast time/source/coordinates into every FishingWindowResult branch; let the UI read provenance from the existing ForecastOutlook and keep the calculation result focused on risk/time. About 80 lines. [mobile/lib/services/fishing_window.dart:78](C:/Users/User/Desktop/PersonalProjects/00-HACKATHONS-COMPETITIONS/00-HACKATHONS/00-2026-FIRST-YEAR/2026-Aquanons/AIHackathon2026_Aquanons_AqOne/mobile/lib/services/fishing_window.dart:78)
- delete: Remove unused production daily()/forecast() compatibility wrappers and update tests to the actual outlook() API. Both provider implementations and the VentureFeeds wrapper retain adapters without production callers. About 60 lines. [mobile/lib/services/forecast_provider.dart:25](C:/Users/User/Desktop/PersonalProjects/00-HACKATHONS-COMPETITIONS/00-HACKATHONS/00-2026-FIRST-YEAR/2026-Aquanons/AIHackathon2026_Aquanons_AqOne/mobile/lib/services/forecast_provider.dart:25)
- delete: Stop writing legacy forecast keys on every v2 save and remove unused save()/test-only loadOutlook() adapters; retain the legacy reader for migration. About 25 lines. [mobile/lib/data/forecast_cache.dart:26](C:/Users/User/Desktop/PersonalProjects/00-HACKATHONS-COMPETITIONS/00-HACKATHONS/00-2026-FIRST-YEAR/2026-Aquanons/AIHackathon2026_Aquanons_AqOne/mobile/lib/data/forecast_cache.dart:26)

net: -255 lines, -0 deps possible.

## Recommended correction order

1. Fix severity precedence, time semantics and invented daily-rain deadlines.
2. Normalize parser validation and duplicates across all sources; correct marine provenance and timezone handling.
3. Display upcoming severity and add regression coverage for the actual failing cases.
4. Update the report/plan to measured results, then simplify unused adapters.
5. Rerun the gates and complete the missing compiled-app acceptance before claiming release readiness.

