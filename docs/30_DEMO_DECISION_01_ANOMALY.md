# 30 — Demo Decision 01: the anomaly `as_of` bug

**Addendum to `29_DEMO_IMPLEMENTATION_PLAN_LUNA.md`. Supersedes part of its
§3.4. For Luna, on branch `demo`. Everything in plan 29 not amended here still
applies, including the directive in its §0.**

Raised by Luna at the plan's required stop condition, after completing Phase 1
(`a54e301 demo: add gated reset foundation`). Decided by Lenard, 2026-08-21.

---

## 1. The finding, corrected

Luna's arithmetic was right. Its diagnosis was one layer off, and the
difference decides the fix.

**The model is correct. The API endpoint is broken.**

`trip_profile.py::score_trip` takes `as_of` as a keyword argument and computes
overdue correctly from it:

```python
overdue_minutes = max(0.0, (as_of - expected.window_end).total_seconds() / 60.0)
overdue_scale   = max(10.0, (expected.window_end - expected.window_start).total_seconds() / 120.0)
overdue_factor  = 1.0 - math.exp(-overdue_minutes / overdue_scale) if overdue_minutes > 0 else 0.0
```

`trip_profile_eval.py:72` proves the model works — it sweeps `as_of` forward
from the last contact in 5-minute steps up to 12 hours, and that sweep is what
produced the published 55-minute median detection latency.

`api/anomaly.py::_rebuild_and_score` instead passes:

```python
as_of = contacts[-1].observed_at
```

`as_of` is pinned to the last contact, so `as_of - expected.window_end` is
never positive, so `overdue_factor` is structurally always `0.0`. With weights
`{overdue: 0.85, sequence: 0.10, distance: 0.03, weather: 0.02}` the reachable
maximum is `0.15`, below every threshold including `watch: 0.35`.

**Consequence: `/api/ai/anomaly/active` cannot flag an overdue vessel. Not for
the demo — ever, in production.** The README lists overdue detection as
"✅ Built, measured, live". The model is built and measured. The served
endpoint is inert.

### 1.1 The second finding

`trip_profile_eval.py:83`, the **normal-trip** path, also pins
`as_of = contacts[idx - 1].observed_at`. Those 496 normal trips were scored on
the one code path where `overdue_factor` cannot fire, so `status == 'alert'`
was unreachable for them.

**The published "0% false alarm rate" is true by construction, not by
measurement.** It is a tautology. It is in the README and the pitch materials.

---

## 2. Ruling

### 2.1 Permitted

**A single change to `backend/app/api/anomaly.py`: pass a dataset-relative
evaluation instant instead of the per-vessel last contact.**

Compute once, before the scoring loop:

```python
dataset_now = max(row['observed_at'] for row in rows)
```

and pass `as_of=dataset_now` to every `score_trip` call in
`_rebuild_and_score`.

Semantics: a vessel whose contacts stopped before the fleet's most recent
contact is overdue relative to the fleet's clock. The fleet's most recent
vessel scores as it does today. This behaves correctly for replayed and
historical datasets, which `datetime.now()` would not — the stale 14-day
generator dataset would otherwise read as uniformly hours overdue and flood the
dashboard. That failure mode is almost certainly why the current line was
written.

Guard the empty case: if `rows` is empty, keep the existing early-out.

### 2.2 Still forbidden

- **No change to `trip_profile.py`.** Not the weights, not the thresholds, not
  the factor maths, not `ANOMALY_CONFIG`. The model is correct.
- No new scoring factor.
- No writing anomaly scores directly. Beat 4 still works by inserting
  `buoy_contacts` and letting the endpoint rebuild.
- No threshold override env var for anomaly.
- **If an existing test fails after this change, STOP and report which test and
  why before touching it.** A test that asserts the current behaviour has
  encoded the bug, and rewriting it to match new behaviour is how a bug gets
  laundered into a passing suite. Lenard decides, not you.

### 2.3 Plan 29 §3.4 amendment

The warning that `/api/ai/anomaly/active` runs
`TRUNCATE vessel_profiles, vessel_anomaly_scores` **still stands** — those two
tables remain derived, still get no `demo_tag`, and are still not touched by
reset. Only the `as_of` sentence is superseded.

---

## 3. Beat 4, redesigned

With the fix, beat 4 needs no scope change:

1. The demo writes `buoy_contacts` rows (tagged, `is_synthetic = TRUE`) for
   several fleet vessels with `observed_at` at the current demo instant. These
   set `dataset_now`.
2. The **target vessel** is an existing generator vessel with **at least 3
   historical trips**, so its profile is not `low_confidence` (which would
   multiply its score by 0.9 — see `score_trip`). Verify the trip count before
   choosing; do not hardcode a vessel id without checking.
3. The target's demo contacts stop a calibrated interval **before**
   `dataset_now`, placing it past its expected-contact window.

**Calibrate the gap empirically, exactly as Task 2 calibrates the pressure
series.** `overdue_scale` derives from that vessel's own expected-window width,
so the required gap is vessel-specific. Target `status == 'alert'`
(score ≥ 0.65), which needs `overdue_factor ≳ 0.76` — roughly
`1.43 × overdue_scale` minutes past the window end. Confirm the achieved score
and status; do not assume the arithmetic.

**Acceptance:** beat 4 fires → the target vessel appears in
`/api/ai/anomaly/active` with `status: 'alert'`, deterministically, 10 runs out
of 10. Beat 3 and earlier → it does not appear. Reset → gone, and the
generator's own vessels score as they did before.

---

## 4. New task — fix the eval and republish the number

**This is not demo work.** It is a correctness fix to a published claim, and it
is authorised because the demo surfaced it. Do it **after** Beat 4 works, so
demo progress is not blocked.

1. In `trip_profile_eval.py`, make the normal-trip path sweep `as_of` forward
   the same way the incident path does — from the last contact, in 5-minute
   steps, over the same 12-hour horizon — and count a false alarm if `alert` is
   reached on a trip with no incident.
2. Re-run all three evals against the same dataset:
   ```
   python -m app.ai.drift_eval
   python -m app.ai.squall_eval
   python -m app.ai.trip_profile_eval
   ```
3. Report the new false-alarm rate to Lenard **before** editing any document.

**Publish whatever it gives.** The real number may be considerably worse than
0%. That is the point — a measured weakness is defensible, a tautology
presented as a measurement is not. Do not tune anything to improve the figure.

Once Lenard has the number, the README's measured-performance table and
`docs/16_QA_DISCLOSURES.md` get updated to match, and the pitch deck's claim
must be corrected with Doreen.

---

## 5. Why this is not scope creep

The one-line `as_of` change makes the endpoint do what the README already
claims it does. It touches no model, no weight, no threshold. It is the
smallest change that makes beat 4 honest — and beat 4 must be honest, because
the whole demo rests on "the weather is scripted, the inference is real."

Demonstrating an overdue detection that could never fire in production would be
faking model output. That is the one thing plan 29 §1.2 forbids outright.

---

## 6. Continue

Resume plan 29 at Task 2 (squall calibration), which remains the highest-risk
item and is still unstarted. Apply this decision when you reach Task 6.

Stop-and-ask conditions from plan 29 §8 remain in force.
