# 10 — Dashboard Integration Plan

Merging Jade's dashboard work with the AI backend, and serving both from a
single Railway service.

---

## Step 0 — Merge (run these yourself, do not give to an AI)

You are on `jade2`, which has **no backend and no AI dashboard panels**. Those
live on `mobile-improvements`. A coding assistant cannot wire up endpoints it
cannot see, so bring them across first.

Both branches rewrote `web/js/dashboard.js`, `web/html/dashboard.html`, and
`web/css/dashboard.css` from the same merge-base. Jade's genuinely new work is
in *separate* files that conflict with nothing:

```
web/js/profile.js            (new)
web/css/profile2.css         (new)
web/html/Systemprofile.html  (new)
web/html/dashboardprof.html  (deleted)
```

So resolve conflicts by taking **`mobile-improvements`' dashboard files** —
they contain the AI panels and the correct endpoints — and keeping Jade's
profile files, which merge cleanly.

```bash
# make sure .git/index.lock is gone and the tree is clean first
git status

git checkout jade2
git merge mobile-improvements
```

When it stops on the three dashboard files:

```bash
git checkout --theirs web/js/dashboard.js
git checkout --theirs web/html/dashboard.html
git checkout --theirs web/css/dashboard.css
git add web/js/dashboard.js web/html/dashboard.html web/css/dashboard.css

# verify Jade's new profile files survived
git status
ls web/js/profile.js web/css/profile2.css web/html/Systemprofile.html

git commit
```

**Before continuing, confirm all of these:**

- `backend/app/ai/` and `backend/app/api/` exist
- `web/js/dashboard.js` contains `ai-drift-select` and `/api/ai/drift/`
- `web/js/profile.js`, `web/css/profile2.css`, `web/html/Systemprofile.html` exist

If any is missing, stop and fix the merge before running the prompts below.

Anything visual Jade changed in `dashboard.html` is now discarded — have him
re-apply it on top, or port it by hand. That is deliberate: a 489-line
three-way conflict under deadline is not worth it.

---

## Endpoint reality

**What the backend actually serves after the merge:**

```
GET  /healthz
GET  /health/ready
POST /api/ai/drift/predict
GET  /api/ai/drift/incidents
GET  /api/ai/drift/incident/{incident_id}
GET  /api/ai/anomaly/active
GET  /api/ai/anomaly/vessel/{vessel_id}
POST /api/ai/anomaly/evaluate
GET  /api/ai/squall/current
GET  /api/ai/squall/buoy/{buoy_id}
POST /api/ai/squall/train
```

**What Jade's dashboard calls that does not exist:**

| Call | Verdict |
|---|---|
| `GET /api/spots` | **Delete.** Fish hotspot — removed from the product. |
| `GET /api/buoys` | **Implement.** Trivial; the `buoys` table already exists. |
| `GET/POST /api/sea-condition` | **Implement minimally.** MDRRMO-set condition. |
| `GET/POST/DELETE /api/pins` | **Implement minimally.** MDRRMO map annotations. |

---

## Prompt 1 — Reconcile the dashboard with the real API

> **Context:** Repo `AIHackathon2026_Aquanons_AqOne`, branch `jade2` after
> merging `mobile-improvements`. The dashboard in `web/` was written against an
> older backend that no longer exists. The current FastAPI backend in
> `backend/` serves only the endpoints listed below. The dashboard currently
> 404s on several calls, and still contains fish-hotspot code that was
> supposedly removed.
>
> **Backend endpoints that exist:**
> ```
> GET  /healthz
> GET  /health/ready
> POST /api/ai/drift/predict
> GET  /api/ai/drift/incidents
> GET  /api/ai/drift/incident/{incident_id}
> GET  /api/ai/anomaly/active
> GET  /api/ai/anomaly/vessel/{vessel_id}
> POST /api/ai/anomaly/evaluate
> GET  /api/ai/squall/current
> GET  /api/ai/squall/buoy/{buoy_id}
> POST /api/ai/squall/train
> ```
>
> **Task A — remove the fish hotspot remnants from the dashboard.**
>
> A previous commit removed the hotspot *panel* from `dashboard.html` but left
> all the JavaScript intact. In `web/js/dashboard.js` remove: the
> `hotspotLayer` layer group, the `hotspots` array, `hotspotCircles`, the
> hotspot tooltip builder, the loop that renders hotspot circles, and the
> `fetchHotspots()` function together with every call site and any timer that
> drives it. Remove the matching `.hotspot-*` rules from `web/css/dashboard.css`
> and any leftover markup or legend entries in `web/html/dashboard.html`.
>
> Verify with `grep -ri "hotspot\|api/spots" web/` — it must return nothing.
>
> **Task B — implement the three missing endpoints in the backend.**
>
> The dashboard needs these and they are legitimate features. Add them as new
> routers, following the existing style in `backend/app/api/`:
>
> - `GET /api/buoys` — returns id, lat, lon, contact radius and last-seen
>   timestamp for every row in the `buoys` table. Read-only.
> - `GET /api/sea-condition` and `POST /api/sea-condition` — the current
>   MDRRMO-declared sea condition. Add a migration for a small
>   `sea_conditions` table (id, condition text, note, set_by, created_at).
>   GET returns the most recent row; POST inserts a new one. Never update in
>   place — the history is the audit trail.
> - `GET /api/pins`, `POST /api/pins`, `DELETE /api/pins/{pin_id}` — MDRRMO map
>   annotations. Add a migration for a `map_pins` table (id, lat, lon, kind,
>   label, note, created_at).
>
> Add these as migration `004_dashboard.sql`. **Do not modify existing
> migrations** — they may already have been applied on Railway.
>
> Match the JSON shape the dashboard already expects. Read
> `web/js/dashboard.js` to determine it; do not guess and do not change the
> frontend to fit a shape you invented.
>
> **Task C — make every panel degrade gracefully.**
>
> Any panel whose endpoint fails must render an empty state with a short
> message, never a broken layout or an uncaught exception. Wrap every `fetch`
> accordingly. A judge reloading the page while the backend restarts must not
> see a stack trace.
>
> **Constraints:**
> - `API_BASE = ''` in `dashboard.js` is **correct** — the dashboard will be
>   served same-origin with the API. Do not change it to an absolute URL and do
>   not add CORS middleware.
> - Do not touch the AI panels (`ai-drift-*`, `ai-squall-*`, `ai-anomaly-*`) —
>   they already work.
> - Do not touch `web/js/profile.js`, `web/css/profile2.css`, or
>   `web/html/Systemprofile.html`.
> - No new frontend framework. Plain JS, matching the existing style.
>
> **Acceptance:** `grep -ri "hotspot\|api/spots" web/` returns nothing;
> `pytest` passes with tests for the three new endpoint groups; `ruff check`
> clean; every dashboard panel either renders data or an empty state with the
> backend stopped.
>
> **Report:** `git diff --stat`, the JSON shape of each new endpoint, and
> confirmation that no AI panel was modified.

---

## Prompt 2 — Serve the dashboard from FastAPI (one Railway service)

> **Context:** Repo `AIHackathon2026_Aquanons_AqOne`. The FastAPI backend in
> `backend/` is deployed to Railway from the root `Dockerfile`. The dashboard
> is static HTML/CSS/JS in `web/`. Right now only the backend is deployed —
> the dashboard is not served at all.
>
> **Task:** Serve `web/` from the same FastAPI app, so one Railway service
> hosts both the API and the dashboard on one origin.
>
> **1. Mount static files in `backend/app/main.py`.**
>
> Use `fastapi.staticfiles.StaticFiles`. Critical ordering requirement:
> **register all API routers first, then mount the static files last.**
> Starlette matches routes in registration order, so a mount at `/` registered
> early would shadow every API route and `/health/ready`, which would silently
> break the Railway healthcheck.
>
> Serve `web/index.html` at `/`, and the rest of the tree beneath it so that
> `web/html/dashboard.html` is reachable at `/html/dashboard.html` and the
> existing relative asset paths in the HTML continue to resolve unchanged. Do
> not rewrite asset paths in the HTML.
>
> **2. Resolve the web directory for both container and local dev.**
>
> This is a known trap from the previous version of this project: the path
> differs between the Docker image and a local checkout, and if the directory
> is missing at import time the mount is skipped and every dashboard URL 404s
> with no obvious cause.
>
> Resolve the path from `__file__`, check both candidate locations, and if
> neither exists **log a clear warning naming the paths tried** rather than
> crashing or failing silently.
>
> **3. Update the root `Dockerfile`.**
>
> It currently copies only `backend/`. It must also copy `web/` to the
> location the resolver expects.
>
> While you are in there, fix the layer ordering: copy `requirements.txt` and
> run `pip install` **before** copying application code, so that editing a
> Python file does not invalidate the pip cache and reinstall scikit-learn on
> every deploy.
>
> **4. Confirm the healthcheck still works.**
>
> `railway.json` uses `healthcheckPath: /health/ready`. After mounting static
> files, verify that path still returns JSON and has not been captured by the
> static handler. **Add a test asserting this** — it is the single most likely
> way this change breaks production.
>
> **Constraints:**
> - Do not add nginx, a second service, or a separate frontend deployment.
> - Do not add CORS middleware — same origin makes it unnecessary.
> - Do not change `API_BASE` in the dashboard JS.
> - Do not move or rename anything inside `web/`.
>
> **Acceptance:**
> - `pytest` passes, including a new test that `/health/ready` returns JSON and
>   not HTML, and a test that `/` returns the dashboard HTML.
> - `ruff check` clean.
> - The Docker image builds and, run locally with a Postgres URL, serves the
>   dashboard at `/` and the API at `/api/ai/...` on the same port.
> - Editing a `.py` file and rebuilding does not reinstall pip packages.
>
> **Report:** the final `Dockerfile`, the mount code, and the output of
> `curl -s localhost:8000/health/ready` proving it returns JSON.

---

## After both prompts

1. Push and let Railway rebuild.
2. Seed the synthetic data once:
   `railway run python -m app.simulation.generator --days 14 --seed 42`
3. Run the three eval scripts and **record the printed numbers** — containment
   rate, search-area reduction, detection latency, false alarm rate, squall
   lead time. These are your slide figures. Do not present a number you have
   not personally seen printed.
4. Open the deployed dashboard and click through every panel with the backend
   healthy, then again immediately after a redeploy to confirm the empty
   states behave.
