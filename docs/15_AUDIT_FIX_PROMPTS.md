# 15 — Audit Fix Prompts

Prompts for the priority list in `docs/14_PRD_AUDIT.md`. Run in order — Prompt 1
changes the drift numbers that Prompt 3 then operates on.

**Deferred by decision (buoy/hardware work, revisit later):**

- §4.4 phone↔buoy opportunistic messaging
- §5.1 buoy-side physical alert (light / audible)
- §5.3 survivability weighting and residual learning — describe as roadmap, do
  not build

Prompt 2 is kept despite the name "buoy coverage": it is a geometry calculation
over data already in the repo and touches no hardware.

---

## Prompt 1 — Feed the learned current field into drift prediction

> **Context:** Repo `AIHackathon2026_Aquanons_AqOne`, branch `master`. The PRD
> (`§5.3(a)`) sets one claim apart in a blockquote as *"the core insight of the
> entire product"*: the buoy array measures the local current field, which
> corrects a coarse global model and is the reason nobody can replicate the
> product without building the network.
>
> **That claim currently has no code behind it.** `backend/app/ai/drift.py`
> advects particles through `_synthetic_current_vector`, a closed-form function.
> It never reads the `current_observations` table, even though the simulator
> populates it and the migration creates it.
>
> **Task:** make drift prediction use the buoy-measured current field.
>
> **1. Build the estimator.** Add `backend/app/ai/current_field.py` exposing a
> factory that returns a function matching the existing contract exactly:
>
> ```python
> Callable[[np.ndarray, np.ndarray, datetime], tuple[np.ndarray, np.ndarray]]
> ```
>
> It receives arrays of particle latitudes and longitudes plus a timestamp, and
> returns `(u, v)` arrays in m/s. It is called once per 10-minute step with
> ~2000 particles, so it must be vectorised — no Python loop over particles.
>
> **2. Use the observed columns, never the true ones.**
>
> `current_observations` has both:
>
> ```
> true_u_mps,     true_v_mps        <- the simulator's ground truth
> observed_u_mps, observed_v_mps    <- what a buoy would actually measure
> ```
>
> **You must read `observed_*`.** The `true_*` columns are the exact field the
> generator used to move the drifting object. Reading them would hand the model
> the answer and produce a containment rate that means nothing. If you find
> yourself selecting `true_u_mps`, stop — that is the one mistake this task can
> make that would invalidate the result.
>
> **3. Interpolate.** For each particle position and time, combine the nearby
> buoys' most recent observations. Inverse-distance weighting over the buoys
> within a sensible radius is sufficient and is easy to defend; do not reach for
> kriging. Interpolate in time to the requested timestamp rather than using the
> newest reading regardless of age.
>
> **4. Fall back honestly.** Where no buoy is within range, or no observation is
> recent enough, fall back to `_synthetic_current_vector` for those particles.
> The array does not cover the whole ocean, and pretending otherwise reintroduces
> exactly the overconfidence the drift calibration just fixed. Report the
> fraction of particle-steps that used real observations versus fallback, and
> surface it in the API response so the dashboard can say how much of the
> prediction was array-driven.
>
> **5. Wire it in.** `predict_drift` already accepts `current_vector_fn`. Pass
> the new estimator from `backend/app/api/drift.py` and from
> `backend/app/ai/drift_eval.py`. Keep the synthetic function as the default
> argument so unit tests that call `predict_drift` directly keep working.
>
> **Constraints:**
> - Do not change the particle model, the leeway coefficients, or the calibrated
>   `current_bias_sigma_ms` / `leeway_scale_sigma` values.
> - Do not add a geospatial dependency. numpy only.
> - Load observations once per prediction, not per step.
>
> **Acceptance:** `pytest` passes, `ruff check` clean, and a test asserts the
> estimator returns the synthetic value where there are no observations.
>
> **Report — this is the important part:** run `python -m app.ai.drift_eval`
> before and after, and give me both sets of numbers. Containment rate and
> search-area reduction **will move**, and I want to see in which direction.
> If containment gets worse, say so plainly — that is a real result about how
> much the array actually helps, and it is more useful than a flattering number.

---

## Prompt 2 — Compute buoy coverage of municipal waters

> **Context:** `docs/Aqone_PRD.md §6` lists "buoy coverage of municipal water
> area" as a success metric. Nothing computes it, so the SAR Metrics tab cannot
> show it. Everything needed is already in the repo: the water polygon in
> `backend/app/geo.py`, and each buoy's `contact_radius_m` (WiFi) and
> `lora_radius_m` in the `buoys` table.
>
> **Task:** compute and expose the metric.
>
> Add a function to `backend/app/ai/` (or `app/geo.py` if it fits better) that
> takes the buoy rows and returns:
>
> - **WiFi coverage** — the fraction of the water polygon's area within any
>   buoy's `contact_radius_m`. This is where a phone can hand over an SOS.
> - **LoRa coverage** — the same for `lora_radius_m`. This is the relay fabric.
> - The polygon's total area in km².
>
> Sample the polygon on a grid or by Monte Carlo — the polygon is small and
> accuracy to a percentage point is plenty. Use `geo.point_in_water` so land is
> excluded; coverage over land is meaningless.
>
> Expose it on the existing metrics endpoint, and write it into
> `eval_results.json` alongside the other figures so it appears in the SAR
> Metrics tab like everything else.
>
> **Expect the WiFi number to be low** — buoys are 6–8 km apart with ~1 km WiFi
> bubbles, so most of the water has no phone contact. That is the honest answer
> and it is exactly what makes trip-anomaly detection necessary. Do not tune the
> calculation to make it look better.
>
> **Acceptance:** `pytest` passes with a test asserting WiFi coverage is lower
> than LoRa coverage and both are between 0 and 1. `ruff check` clean.
>
> **Report:** both percentages and the polygon area.

---

## Prompt 3 — Bayesian search re-tasking

> **Context:** PRD `§5.3(c)` promises: *"As assets search sectors and report
> negative findings, the posterior updates and re-tasks them toward the highest
> remaining probability mass."* Not implemented — `predict_drift` computes a
> probability grid once and the contours never change.
>
> This is the claim a SAR-literate judge is most likely to probe, because
> Bayesian search allocation is the standard of the field and the PRD names it.
>
> **Task:** let a dispatcher mark a sector searched and have the probability
> field update.
>
> `predict_drift` already returns a `DensityGrid` (`x_edges_m`, `y_edges_m`,
> `values` — a normalised 2D histogram) and contours at 0.50 / 0.75 / 0.95.
> Build on that rather than recomputing the particle simulation.
>
> **1. Store searched sectors.** New migration and table: incident id, sector
> polygon or bounding box, searched-at timestamp, and a **detection probability**
> — the chance the search would have found the target if it were there. It is
> never 1.0: a boat crew sweeping at night in swell misses things, and modelling
> a search as perfect is how real searches lose people.
>
> **2. Update the posterior.** For each searched sector, multiply the affected
> grid cells by `(1 - detection_probability)` and renormalise the whole grid.
> That is the standard Bayesian update: a negative search reduces but does not
> eliminate the probability that the target is there.
>
> **3. Recompute contours** from the updated grid so the map redraws toward the
> remaining mass.
>
> **4. Endpoints:**
> - `POST /api/ai/drift/incident/{id}/searched` — record a sector, return the
>   updated grid and contours. Protected.
> - The existing incident endpoint should return any recorded sectors so the
>   dashboard can draw what has already been covered.
>
> **Constraints:**
> - Do not re-run the particle simulation on each update. The grid is the state.
> - Keep the original prior available so the sequence can be replayed or reset.
> - numpy only.
>
> **Acceptance:** `pytest` covers (a) an unsearched grid is unchanged, (b) a
> searched sector reduces mass there and the grid still sums to 1.0, (c) with
> detection probability 1.0 the searched cells reach zero. `ruff check` clean.
>
> **Report:** for one synthetic incident, the 95% contour area before and after
> searching the highest-probability sector.

---

## Prompt 4 — One canonical PRD, and honest safety labels

> **Context:** Two problems, both documentation, both of which have already
> caused an outside auditor to report the project inaccurately.
>
> **1. There are two PRDs.** `Aqone_PRD.md` exists as v2.0 and v3.0. v3.0 adds
> §5.4 mass-casualty dispersion, §5.5 live roster and §5.6 nearest-responder
> broadcast — **none of which are built**. Meanwhile `AGENTS.md` and
> `docs/07_SCOPE_OUT.md` still say the project builds no AI model, which was true
> two days ago and is now badly wrong.
>
> **Task:** make one document canonical.
>
> - Keep v3.0 as the single PRD, but mark §5.4, §5.5 and §5.6 explicitly as
>   **Roadmap — not implemented**. Do not delete them; they are good ideas and
>   §5.6 is the one the Basilan evidence supports most strongly.
> - Same treatment for §5.3 survivability weighting and residual learning.
> - Update `AGENTS.md` and `docs/07_SCOPE_OUT.md` so they no longer contradict
>   the PRD. The "Deliberately NOT building" list must not still say "no AI
>   model".
> - Delete or clearly supersede the v2.0 copy so nobody audits the wrong file.
>
> **2. The sail-safety label is a single hardcoded number.**
> `mobile/lib/core/config.dart` has `unsafeWindKph = 30`, and
> `lib/models/weather_snapshot.dart` turns it into a safety verdict shown to a
> fisherman deciding whether to go to sea.
>
> It is not a model, not validated, and not an official warning. Presenting it
> as a verdict is the most serious honesty problem in the product, because
> somebody could act on it.
>
> **Task:** demote it from verdict to indicator.
> - Change the wording from an instruction ("SAFE TO SAIL" / "DO NOT SAIL") to a
>   described condition plus its basis — e.g. "Wind 34 km/h — above our 30 km/h
>   caution threshold".
> - Show the observation time and the source (Open-Meteo).
> - State plainly that it is not a PAGASA warning and does not replace one.
> - Keep the threshold where it is; the number is fine as a rule of thumb. It is
>   the framing that is wrong.
>
> **Constraints:** do not touch model code, endpoints or the SOS path. This is
> copy, presentation, and documentation only.
>
> **Acceptance:** `flutter analyze` clean, `flutter test` passes. `grep -ri "no
> AI model" docs/ AGENTS.md` returns nothing. Only one PRD file remains, and
> every unimplemented section in it is labelled.
>
> **Report:** the new label wording, and the list of documents you changed.
