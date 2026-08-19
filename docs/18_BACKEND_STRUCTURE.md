# 18 — The Backend Folder, Explained

For the team. Companion to `17_AI_EXPLAINED_SIMPLY.md`, which covers what the AI
*does*. This one covers where everything *lives*.

---

## The one idea that makes the whole folder make sense

There are two files called `drift.py`. Two called `squall.py`. This is not a
mistake — it's the core organising rule:

> **`app/ai/` thinks. `app/api/` answers the phone.**

- `app/ai/drift.py` — the actual drift model. Knows about physics and
  probability. Knows **nothing** about the web.
- `app/api/drift.py` — the doorway. Knows about URLs and JSON. Knows **nothing**
  about physics. It just fetches data, calls the model, and hands back the answer.

Once you see that split, the rest is obvious. The brain is separate from the
mouth.

**Why we did it that way:** you can test the drift model without starting a web
server or a database. That's why the test suite runs in 14 seconds.

---

## The three layers

```
app/ai/          ← the thinking          (the models)
app/api/         ← the doors             (the URLs the app + dashboard call)
everything else  ← the plumbing          (database, startup, auth, geography)
```

---

## `app/ai/` — the thinking

The models and the scripts that score them.

| File | What it is |
|---|---|
| `drift.py` | Drift prediction. Where does someone in the water end up? **Biggest single model file (500 lines).** |
| `squall.py` | Storm nowcasting from buoy pressure. The trained classifier lives here. |
| `trip_profile.py` | Learns each boat's habits, flags overdue vessels. |
| `search.py` | Bayesian re-tasking — "we searched here and found nothing," update the map. |
| `current_field.py` | Turns real buoy current readings into a current map the drift model can use. Falls back to simulated data when there are no readings. |
| `coverage.py` | Works out how much water the buoy array actually covers. **Built but not yet connected to any URL.** |
| `eval_store.py` | Saves and loads the measured performance numbers. |
| `models/squall.pkl` | The saved, trained squall model. The only trained-model file in the backend. |

**The `*_eval.py` files** (`drift_eval`, `squall_eval`, `trip_profile_eval`,
`coverage_eval`) are **not** part of the running system. They're the report
cards — you run them manually to measure how well each model performs, and they
write the results to `models/eval_results.json`.

> **Right now that file doesn't exist**, which is why the dashboard's SAR tab is
> empty. Someone needs to run those three scripts against the deployed database.

---

## `app/api/` — the doors

Every URL the mobile app or dashboard can call. These files are thin on purpose.

| File | What it handles |
|---|---|
| `sos.py` | **The most important file in the backend.** Receiving SOS, de-duplicating, the live feed, acknowledging with an ETA, the fisherman's reply. 358 lines. |
| `drift.py` | Search maps, incident list, recording a searched sector. |
| `squall.py` | Current storm status, per-buoy status, retraining. |
| `anomaly.py` | Overdue vessels, per-vessel status. |
| `auth.py` | Login, and admin account creation. |
| `sea_condition.py` | The MDRRMO's human "Safe to Go Out / Not Advised" declaration. **Not AI** — a person sets this. |
| `metrics.py` | Serves the eval numbers. Returns 404 rather than fake numbers when they don't exist. |

---

## The plumbing

| File | Purpose |
|---|---|
| `app/main.py` | **Start here if you're lost.** Wires every door onto the app and sets which ones need a login. |
| `app/db.py` | Opens the database connection pool at startup, closes it at shutdown. |
| `app/auth.py` | Password hashing and login tokens. The security guts. |
| `app/geo.py` | **The single source of truth for "where is New Washington."** The water polygon, shore stations, and the "is this point at sea?" check. If a boat ever appears on land, the bug is here. |
| `app/simulation/generator.py` | Makes all the fake data — buoys, weather, boats, trips. **The biggest file in the backend at 1,254 lines.** |
| `migrate.py` | Runs the database migrations in order on every deploy. |

---

## `migrations/` — the database, in order

Each file adds to the database. They run in numerical order and only once. **Never
edit an old one** — always add a new numbered file.

| File | What it added |
|---|---|
| `001_init.sql` | Core tables: vessels, buoys, SOS events |
| `002_simulation.sql` | Tables for the synthetic data |
| `003_anomaly.sql` | Trip profiles and incidents |
| `004_dashboard.sql` | Dashboard support |
| `005_auth.sql` | Operator accounts |
| `006_mesh_radii.sql` | LoRa range per buoy |
| `007_sos_ingest.sql` | The de-duplication keys |
| `008_responder_loop.sql` | ETA, responder status, fisherman's reply |
| `009_search_sectors.sql` | Searched sectors, for the Bayesian update |

---

## `tests/` — 70 tests, all passing

Run with `pytest` from inside `backend/`. Takes about 14 seconds.

The useful thing to know: `test_geo.py` and `test_mesh.py` are the ones that stop
boats appearing on land and buoys drifting out of radio range of each other.
Those two catch the embarrassing bugs.

---

## Config files

| File | Purpose |
|---|---|
| `requirements.txt` | What gets installed in production |
| `requirements-dev.txt` | Test tools only — not shipped |
| `pyproject.toml` | Linter settings |
| `.env.example` | Which environment variables you need. **No real secrets** — those live in Railway. |

---

## "I want to change X — where do I go?"

| I want to… | Go to |
|---|---|
| Change how the drift model behaves | `app/ai/drift.py` |
| Add a new URL | `app/api/` + register it in `app/main.py` |
| Fix a boat showing up on land | `app/geo.py` |
| Change the fake demo data | `app/simulation/generator.py` |
| Add a database column | New file in `migrations/` — never edit an old one |
| See why the SAR tab is empty | Run the `*_eval.py` scripts |
| Understand the SOS flow | `app/api/sos.py` |

---

## Two known gaps

**`coverage.py` is orphaned.** It works and has tests, but nothing calls it —
no URL, nothing on the dashboard. It's a library waiting to be plugged in.

**`eval_results.json` doesn't exist.** Until someone runs the eval scripts, the
dashboard has no performance numbers to show.
