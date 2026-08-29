"""Production environmental-input quality gate (docs/40 Phase 2).

A *production* drift run - one backing a real responder-opened case - may
only use observed currents and a non-degraded wind source, and only when
those inputs clear an owner-approved minimum bar. Falling short does not
fall back to the synthetic current equation; it produces
``insufficient_environmental_data`` instead (docs/40 "Safety and acceptance
boundary"). The synthetic/demo path is unaffected - it never calls this
module.

Policy values approved by the project owner (Lenard, backend/architecture -
see AGENTS.md Ownership) on 2026-08-30, recorded in
``docs/05_PUBLIC_API.md`` "Drift prediction and search re-tasking". These are
safety thresholds, not implementation details: changing them changes which
real cases get a search field instead of an honest insufficiency notice.
Do not adjust without a fresh owner sign-off.

- Minimum field geometry: MIN_NEARBY_BUOYS buoys with a fresh reading within
  current_field.MAX_RADIUS_M of the last-known position. One buoy gives a
  point value, not a direction. Checked first, before running the particle
  simulation - there is nothing to gain from a 2000-particle Monte Carlo run
  when there is obviously no array nearby.
- Minimum observed-current coverage: MIN_OBSERVED_COVERAGE of the resulting
  particle field driven by real observations rather than the synthetic
  fallback (current_field.py's ``observation_fraction``). Only meaningful
  once the simulation has actually run, so it is checked after.
- Maximum current-observation age: current_field.MAX_AGE_SECONDS (60
  minutes) - already the interpolation cutoff; this policy adopts the same
  number rather than a second, looser one.
- Maximum wind-forecast age: MAX_WIND_AGE_SECONDS (60 minutes). No separate
  timestamp check is needed to enforce it: WIND_CACHE_TTL_SECONDS in
  app/ai/drift.py (20 minutes) already refreshes more often than this ceiling
  requires, so every non-degraded fetch is inherently within it. A
  *degraded* result (Open-Meteo unreachable, synthetic wind substituted) is
  rejected outright regardless of age.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.ai.current_field import MAX_AGE_SECONDS
from app.ai.drift import DriftResult

MIN_NEARBY_BUOYS = 2
MIN_OBSERVED_COVERAGE = 0.5
MAX_WIND_AGE_SECONDS = 3600.0

INSUFFICIENT_GEOMETRY = 'insufficient_field_geometry'
INSUFFICIENT_COVERAGE = 'insufficient_current_coverage'
DEGRADED_WIND = 'degraded_wind_source'


@dataclass(frozen=True)
class EnvironmentAssessment:
    sufficient: bool
    reason: str | None
    nearby_buoy_count: int
    # observed_coverage/wind_source/wind_degraded are None when the run
    # failed the field-geometry pre-check: the particle simulation, which is
    # what would compute them, never ran.
    observed_coverage: float | None
    current_max_age_seconds: float
    wind_source: str | None
    wind_degraded: bool | None
    max_wind_age_seconds: float

    def to_dict(self) -> dict[str, object]:
        return {
            'sufficient': self.sufficient,
            'reason': self.reason,
            'nearby_buoy_count': self.nearby_buoy_count,
            'observed_coverage': round(self.observed_coverage, 4) if self.observed_coverage is not None else None,
            'current_max_age_seconds': self.current_max_age_seconds,
            'wind_source': self.wind_source,
            'wind_degraded': self.wind_degraded,
            'max_wind_age_seconds': self.max_wind_age_seconds,
        }


def assess_geometry(nearby_buoy_count: int) -> EnvironmentAssessment | None:
    """Returns a failing assessment if the geometry pre-check fails, else
    None (meaning: proceed to run the simulation and call assess_result)."""
    if nearby_buoy_count >= MIN_NEARBY_BUOYS:
        return None
    return EnvironmentAssessment(
        sufficient=False,
        reason=INSUFFICIENT_GEOMETRY,
        nearby_buoy_count=nearby_buoy_count,
        observed_coverage=None,
        current_max_age_seconds=MAX_AGE_SECONDS,
        wind_source=None,
        wind_degraded=None,
        max_wind_age_seconds=MAX_WIND_AGE_SECONDS,
    )


def assess_result(nearby_buoy_count: int, observed_coverage: float, result: DriftResult) -> EnvironmentAssessment:
    """Post-run coverage/wind check against a completed DriftResult. Only
    called once assess_geometry has already returned None (passed)."""
    reason = None
    if observed_coverage < MIN_OBSERVED_COVERAGE:
        reason = INSUFFICIENT_COVERAGE
    elif result.degraded:
        reason = DEGRADED_WIND

    return EnvironmentAssessment(
        sufficient=reason is None,
        reason=reason,
        nearby_buoy_count=nearby_buoy_count,
        observed_coverage=observed_coverage,
        current_max_age_seconds=MAX_AGE_SECONDS,
        wind_source=result.wind_source,
        wind_degraded=result.degraded,
        max_wind_age_seconds=MAX_WIND_AGE_SECONDS,
    )
