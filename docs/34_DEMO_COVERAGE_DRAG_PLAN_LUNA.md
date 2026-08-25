# 34 — Demo Coverage Radius + Draggable Buoys (for Luna)

**Audience: GPT Luna, executing on branch `demo-coverage-drag`, cut from `dj`.**
**Scope: demo presentation only. Frontend only. No backend, no firmware.**

Written 2026-08-26. Every file path, line number, constant and branch fact
below was verified by reading this repository on that date.

---

## 0. DIRECTIVE — READ BEFORE ANYTHING ELSE

**Follow this plan exactly. Do not deviate, improvise, redesign, or "improve"
it.** The investigation is already done. Do not re-derive it.

- **Do not touch any file not named in this plan.** Nothing under `backend/`,
  `mobile/`, `firmware/`, `gateway/`. No CSS file except the one named in §4.
- **Do not run `git` write commands.** Not `commit`, not `checkout -b`, not
  `merge`, not `reset`. See §1 — Lenard runs those. You prepare the changes
  and tell him the exact commit message.
- **Do not change production rendering.** Every radius change in this plan is
  gated behind a demo flag. With the flag off, the map must render
  byte-identically to today.
- **Do not add persistence.** Dragged positions reset on reload. That is the
  decision, not an oversight. No `localStorage`, no API call, no migration.
- **Do not "fix" the numbers to match physics.** `docs/33_LORA_RF_BUDGET.md`
  is the physics. This plan deliberately overrides it *for the demo view only*
  and labels it as such. Do not propagate demo radii into real config.
- **STOP conditions are real.** Where this plan says STOP, stop and report to
  Lenard. Do not proceed on your own judgement.
- **You do not need a working browser to start.** Phase 0 is closed (§2) and
  STOP 2 is lifted. Steps 1, 3 and 4 (§3, §5, §6) are pure code and unit
  tests that run under `node` with no DOM. If your browser cannot open the
  local dashboard, do those first and report the visual checks in §4 and §7
  as "unverified — no browser" rather than stopping.

**If a line number is off or the code does not match what is described here:
STOP and report it.** Do not silently adapt.

---

## 1. BRANCH SITUATION — READ BEFORE CHECKING ANYTHING OUT

Lenard asked for this work to go on the `demo` branch. **Do not check out
`demo` as it stands.** Verified 2026-08-26:

```
git rev-list --left-right --count demo...dj   →   0    69
git merge-base --is-ancestor demo dj          →   true
```

Meaning: **`demo` contains zero commits that `dj` does not.** `dj` is 69
commits ahead. `demo`'s tip is `4989a59` ("docs for demo", 2026-08-21).

The practical consequence — and the reason this matters:

| | `demo` (69 commits behind) | `dj` (current) |
|---|---|---|
| Dashboard JS | one monolith, `web/js/dashboard.js` | modular, `web/js/dashboard/*.js` |
| Coverage circles live at | `dashboard.js` lines 368–389 | `dashboard-markers.js` lines 122–146 |
| Buoy data live at | `dashboard.js` lines 173–177 | `dashboard-core.js` lines 180–185 |

If you work on `demo` as-is, you write this feature into a monolith that was
already replaced, and the work has to be redone by hand when it merges.

The branch is cut from `dj`:

```
git checkout dj
git checkout -b demo-coverage-drag
```

> **The branch name cannot contain `demo/`.** Git stores refs as files, so
> `refs/heads/demo` being a file makes `refs/heads/demo/coverage-drag`
> impossible to create while a branch named `demo` exists — it fails with
> `cannot lock ref ... 'refs/heads/demo' exists`. Use the hyphenated name.

Branching from `dj` gives the same tree a fast-forward of `demo` would.
Updating `demo` itself is optional and independent of this work; because it is
a strict ancestor, it is a clean fast-forward at any time:

```
git checkout demo && git merge --ff-only dj && git checkout demo-coverage-drag
```

**STOP 1 — Do not start until Lenard confirms `demo-coverage-drag` exists and
`git log -1` on it shows a `dj` commit, not `4989a59`.**

> **Git through the desktop bridge is unreliable on this repo** — it reports
> phantom staged changes because it cannot refresh `.git/index`. Verify any
> suspicious git state with `git show HEAD:<path>` against the file content
> before raising an alarm, and never run git writes through it.

---

## 2. THE "2 KM" FINDING — WHAT IS ACTUALLY ON SCREEN

**There is no 2 km radius anywhere in this codebase.** Verified in
`web/js/dashboard/dashboard-core.js` lines 180–185:

| Buoy | `wifiRadius` | `loraRadius` |
|---|---|---|
| Alpha | 1340 m | 7023 m |
| Bravo | 1330 m | 6524 m |
| Charlie | 1090 m | 7282 m |
| Delta | 1350 m | 6146 m |
| Echo | 930 m | 6752 m |

The backend agrees: `backend/app/simulation/generator.py` lines 277–278 set
`LORA_RADIUS_MIN_M = 6000.0`, `LORA_RADIUS_MAX_M = 8000.0`.

**Working hypothesis for the "2 km" report** — the "Buoy Coverage Zones"
toggle (`#toggle-coverage`, `web/html/dashboard.html` line 311) controls
`coverageLayer`, which holds **both** circles per buoy. The WiFi bubble is
drawn solid-ish (`fillOpacity 0.14`, `opacity 0.55`) at 930–1350 m radius —
i.e. **1.9–2.7 km across**. The LoRa ring is drawn at `fillOpacity 0.05`,
`opacity 0.35`, `dashArray '2 6'` — nearly invisible against the basemap.
So the only clearly visible coverage zone reads as "about 2 km" **because
that is its diameter, not its radius**.

### Phase 0 — RESOLVED 2026-08-26. DO NOT RE-RUN. STOP 2 IS LIFTED.

Phase 0 originally required measuring both circles on screen. **It has been
resolved analytically and is closed.** Do not attempt it, and do not treat the
in-app browser's inability to open the local dashboard as a blocker.

The hypothesis is confirmed by arithmetic, no browser needed:

- WiFi bubble: 1340 m radius → **2.68 km across** ≈ the reported "2 km".
- LoRa ring: 7023 m radius → **14 km across**, nowhere near "2 km".

Only one circle is a candidate, so the circle Lenard means is the **WiFi
bubble**, and he was reading its **diameter**. Proceed with §3.

**Consequence — the target is a DIAMETER, confirmed by Lenard 2026-08-26.**
"5 km" means the circle should be **5 km across**, i.e.
**`DEMO_COVERAGE_RADIUS_M = 2500`**, not 5000. §3 and §4 below already carry
the corrected value. Do not "fix" it back to 5000.

---

## 3. Step 1 — Demo coverage radius, behind a flag

**File:** `web/js/dashboard/dashboard-core.js`

The honesty rules in this repo (`docs/16_QA_DISCLOSURES.md`, and Rule 4 of
`docs/20_WEEK_1_DASHBOARD_FLUTTER_IMPLEMENTATION_PLAN.md`) forbid presenting
a simulated figure as if it were real capability. An enlarged WiFi bubble
would claim a phone reaches a buoy from 2.5 km out, which is false and
contradicts `docs/33_LORA_RF_BUDGET.md`. So the radius is overridden **only in demo mode**
and **relabelled**, rather than the real number being edited.

**3a.** Immediately after the `initialBuoys` array (after line 185), add:

```js
  // ===== DEMO COVERAGE OVERRIDE =====
  // Demo-only. Enlarges the drawn coverage zone so vessels visibly fall
  // inside coverage during a presentation on a zoomed-out map. This is a
  // PRESENTATION radius, not a capability claim: real phone-contact range is
  // wifiRadius (~1.2 km) and real LoRa relay range is loraRadius (~7 km),
  // per docs/33_LORA_RF_BUDGET.md. Off by default; production is unchanged.
  //
  // 2500 m = a 5 km-WIDE circle, which is what was asked for. The default
  // wifiRadius of ~1340 m draws a 2.68 km-wide circle; this roughly doubles
  // it. Do not change this to 5000 - that would be a 10 km-wide circle.
  const DEMO_COVERAGE_RADIUS_M = 2500;

  function isDemoCoverage() {
    try {
      return new URLSearchParams(window.location.search).get('demo') === '1';
    } catch (e) {
      return false;
    }
  }

  // Returns { radius, label } for the buoy's drawn coverage zone.
  function coverageZoneFor(buoy, demoMode) {
    if (demoMode) {
      return { radius: DEMO_COVERAGE_RADIUS_M, label: 'demo coverage zone' };
    }
    return { radius: buoy.wifiRadius || 1200, label: 'phone contact range' };
  }
```

**3b.** Export all three at the bottom of the file, alongside the existing
`ns.initialBuoys = initialBuoys;` (line 322) and `ns.meshLinks` (line 324):

```js
  ns.DEMO_COVERAGE_RADIUS_M = DEMO_COVERAGE_RADIUS_M;
  ns.isDemoCoverage = isDemoCoverage;
  ns.coverageZoneFor = coverageZoneFor;
```

**Flag is `?demo=1` in the URL, deliberately.** Not `localStorage` — a demo
browser that stores a flag keeps rendering demo radii against production
forever. That exact failure was already recorded for the weather override in
`docs/31_DEMO_VERIFICATION_01.md`; do not repeat it.

> **COMMIT 1** — `demo: add flagged 5 km-wide coverage-zone override (no UI change yet)`
> Nothing renders differently yet. This commit is pure, testable, additive.

---

## 4. Step 2 — Draw the demo radius

**File:** `web/js/dashboard/dashboard-markers.js`, the `COVERAGE CIRCLES`
block at lines 112–146.

**4a.** At the top of the block, before the `initialBuoys.forEach`, add:

```js
  var demoCoverage = ns.isDemoCoverage();
```

**4b.** Replace the WiFi circle construction (lines 134–145) so radius and
tooltip come from `coverageZoneFor`. Keep the existing style object exactly
as-is; only `radius` and the tooltip text change:

```js
    var zone = ns.coverageZoneFor(b, demoCoverage);
    var wifi = L.circle([b.lat, b.lng], {
      radius: zone.radius,
      color: '#60a5fa',
      fillColor: '#60a5fa',
      fillOpacity: 0.14,
      weight: 1.5,
      dashArray: '6 4',
      opacity: 0.55
    }).bindTooltip(
      b.name + ' — ' + zone.label + ' ' + (zone.radius / 1000).toFixed(1) + ' km',
      { sticky: true }
    );
```

**4c.** The LoRa ring (lines 122–132) is **unchanged**. Do not touch it.

**4d.** The LoRa ring is currently drawn nearly invisibly (`opacity: 0.35`,
`dashArray: '2 6'`), which is why only one circle was ever noticed. Now that a
second circle shares the space, make it distinguishable. In the `lora` style
object only, change `opacity: 0.35` → `opacity: 0.6` and `dashArray: '2 6'` →
`dashArray: '8 6'`. Leave `fillOpacity: 0.05` alone. At 2500 m the demo zone
sits well inside the 6.1–7.3 km ring, so the two read as clearly nested.

**Verify:** open with `?demo=1` → inner circle is 5 km across, tooltip reads
"demo coverage zone 2.5 km". Open without it → inner circle is 2.68 km across,
tooltip reads "phone contact range 1.3 km", and the map is otherwise identical
to before.

**STOP 3 — If the map without `?demo=1` differs in any way from before this
step, revert and report.**

> **COMMIT 2** — `demo: render 5 km-wide coverage zone under ?demo=1`

---

## 5. Step 3 — Make mesh links recomputable

This step adds no visible behaviour. It exists because Step 4 cannot work
without it, and mixing the two makes the drag bug impossible to isolate.

**File:** `web/js/dashboard/dashboard-core.js`, lines 198–218.

`meshLinks` is currently a `const` assigned from an IIFE — computed once at
load, so a dragged buoy would keep its old links forever.

**5a.** Convert the IIFE body into a named pure function. It must take its
inputs as arguments and read no outer state:

```js
  // Pure: same inputs → same output. No closure over initialBuoys/shoreStations,
  // so it is unit-testable and safe to re-run on every drag.
  function computeMeshLinks(buoys, stations) {
    var links = [];
    for (var i = 0; i < buoys.length; i++) {
      for (var j = i + 1; j < buoys.length; j++) {
        var a = buoys[i], b = buoys[j];
        if (_metresBetween(a.lat, a.lng, b.lat, b.lng) <= Math.min(a.loraRadius, b.loraRadius)) {
          links.push([a.name, b.name]);
        }
      }
    }
    buoys.forEach(function (buoy) {
      stations.forEach(function (station) {
        if (_metresBetween(buoy.lat, buoy.lng, station.lat, station.lng) <= buoy.loraRadius) {
          links.push([buoy.name, station.name]);
        }
      });
    });
    return links;
  }

  var meshLinks = computeMeshLinks(initialBuoys, shoreStations);
```

Note `const meshLinks` becomes `var meshLinks` — it is reassigned on drag.

**5b.** Export it: `ns.computeMeshLinks = computeMeshLinks;`

**5c.** `_metresBetween` is already exported (line 323). Leave it.

**Verify:** `node --check web/js/dashboard/dashboard-core.js` passes, and the
map renders exactly as before — same links, same lines.

> **COMMIT 3** — `refactor: extract computeMeshLinks as a pure function`

---

## 6. Step 4 — Tests for the extracted logic

**File (new):** `web/test/dashboard-coverage.test.js`

Follow the existing harness exactly — see `web/test/dashboard-utils.test.js`,
which requires the real source file rather than reimplementing it. Run with
`node --test web/test/dashboard-coverage.test.js`.

The two functions under test are pure, so they need no DOM and no Leaflet.
**If `dashboard-core.js` cannot be required under Node** (it is not currently
UMD-wrapped like `dashboard-utils.js` is), do **not** restructure the module —
instead copy the two functions' source into the test via a small loader that
reads the file and evals just those declarations, or ask Lenard. **STOP 4 —
report which approach you had to take.**

Required cases:

**`coverageZoneFor`**
1. Demo mode off → returns the buoy's own `wifiRadius` and label
   `'phone contact range'`.
2. Demo mode on → returns exactly `2500` and label `'demo coverage zone'`.
3. Demo mode on for *every* buoy in `initialBuoys` → all return 2500
   (the override is not per-buoy).
3b. The returned radius is strictly less than every buoy's `loraRadius`
   (2500 < 6146). The demo zone must never escape the LoRa ring.
4. Buoy with no `wifiRadius`, demo off → falls back to 1200.

**`computeMeshLinks`**
5. Two buoys 3 km apart, both `loraRadius` 7000 → linked.
6. Two buoys 9 km apart, both `loraRadius` 7000 → not linked.
7. Asymmetric: 6.5 km apart, radii 7000 and 6146 → **not** linked
   (the rule is `Math.min` of the two, and 6146 < 6500).
8. A buoy within `loraRadius` of a shore station → a buoy↔station link exists.
9. Called twice with the same inputs → deep-equal output (purity).
10. Called with a buoy's `lat`/`lng` mutated between calls → output differs.
    This is the property the drag feature depends on; if it does not hold,
    Step 5 cannot work.
11. Empty buoy array → returns `[]`, does not throw.

**STOP 5 — All 11 must pass before starting Step 5.** If case 7 or case 10
fails, the bug is in Step 3, not in your test. Fix Step 3.

> **COMMIT 4** — `test: cover coverageZoneFor and computeMeshLinks`

---

## 7. Step 5 — Draggable buoys

**File:** `web/js/dashboard/dashboard-markers.js`

**7a.** In the `BUOY MARKERS` block (line 103), add `draggable: demoCoverage`
to the marker options. **Buoys are draggable only under `?demo=1`** — these
are anchored physical buoys, and an operator dragging one on the real
dashboard would be a data-integrity bug, not a feature.

```js
    const marker = L.marker([b.lat, b.lng], {
      icon: createMarkerIcon('buoy'),
      draggable: demoCoverage
    })
```

**7b.** Keep a handle on each buoy's three map objects. The existing
`coverageCircles` map (declared line 119, assigned line 146) holds only the
WiFi circle — extend it to hold all of them. Add a shared registry populated in
both loops, keyed by `b.name`:

```js
  var buoyGraphics = {};   // name -> { marker, lora, wifi, data }
```

Populate `.marker` in the buoy loop, `.lora` and `.wifi` in the coverage loop,
and `.data` with the buoy record itself.

**STOP 6 — `coverageCircles` has four references in `dashboard-markers.js`:
declared 119, assigned 146, read by `pulseCoverageCircle` at 150, and exported
as `ns.coverageCircles` at 449. `pulseCoverageCircle` is consumed by
`dashboard-incidents.js` (imported line 9, called line 107). Keep both exports
working — repoint them at `buoyGraphics[name].wifi` rather than deleting them,
and confirm the incident pulse still fires before committing.**

**7c.** After both loops, attach the drag handler:

```js
  function redrawMesh() {
    ns.meshLinks = ns.computeMeshLinks(initialBuoys, ns.shoreStations);
    meshLayer.clearLayers();
    // rebuild polylines from ns.meshLinks using the SAME construction as the
    // MESH NETWORK block above — extract that block into a drawMeshLinks()
    // function and call it from both places. Do not duplicate the code.
  }

  Object.keys(buoyGraphics).forEach(function (name) {
    var g = buoyGraphics[name];
    if (!g.marker.dragging) return;
    g.marker.on('drag', function (e) {
      var ll = e.target.getLatLng();
      g.lora.setLatLng(ll);
      g.wifi.setLatLng(ll);
    });
    g.marker.on('dragend', function (e) {
      var ll = e.target.getLatLng();
      g.data.lat = ll.lat;
      g.data.lng = ll.lng;
      redrawMesh();
    });
  });
```

Circles follow continuously on `drag` (cheap); mesh recomputes once on
`dragend` (O(n²) plus a layer rebuild — do not put it on `drag`).

**7d.** Panels that count buoys read `initialBuoys` directly and will pick up
the mutated coordinates on their next refresh:
`dashboard-buoy-health.js` lines 198–202 (`stat-buoys`, in-view count) and
line 262, and `dashboard-profile-pill.js` line 29. **Do not wire drag events
into those files.** If a stale count is visible after a drag, report it — do
not fix it here.

**Verify, with `?demo=1`:**
- Dragging Buoy Delta toward Alpha makes a new mesh line appear when the gap
  drops below 6146 m.
- Dragging Echo away from the array makes its links disappear.
- Both circles stay centred on the marker throughout the drag.
- The buoy popup still opens on click after a drag.
- Without `?demo=1`, buoys do not move at all.

> **COMMIT 5** — `demo: draggable buoys with live mesh recompute under ?demo=1`

---

## 8. Step 6 — Documentation

**File:** `docs/33_LORA_RF_BUDGET.md`

That document already carries a short note under "Recommended configuration"
recording that the dashboard draws a 5 km presentation radius which is not a
modelled range. Confirm it still matches what you built — in particular the
flag name and the radius — and correct it only if you diverged. Do not edit
any range number in that document.

> **COMMIT 6** — `docs: reconcile the demo coverage note in the RF budget doc`
> Skip this commit if nothing needed changing. This is the one optional commit.

---

## 9. Commit policy

Commit at each of the six numbered points above and **nowhere else**. Each one
must leave the tree in a working state — `node --check` clean on every file
touched, and the existing suite green:

```
node --test web/test/dashboard-utils.test.js     # must stay 21/21
node --test web/test/dashboard-coverage.test.js  # from Step 4
node --check web/js/dashboard/dashboard-core.js
node --check web/js/dashboard/dashboard-markers.js
```

Do not commit: work-in-progress, a step that fails its own verify, formatting
churn, or anything under `_merge_resolved/`.

**You do not run `git commit` yourself** (§1). At each commit point, tell
Lenard the exact message and the exact file list.

---

## 10. Out of scope — do not do these

- Persisting dragged positions anywhere.
- Making shore stations, incidents, or vessels draggable.
- Changing `loraRadius` or `wifiRadius` values in the data.
- Changing anything in `backend/app/simulation/generator.py`.
- Touching `docs/02_LOAM_PACKET_SPEC.md`.
- A UI control for the demo flag. The URL parameter is the control.

---

## 11. Known blocker you may hit — not yours to fix

If you try to exercise the demo backend end-to-end, `fire_beat()` raises
`NameError`. In `backend/app/demo/scenarios.py` line 462, `_beat(index)`
discards its return value, and line 464 then references an undefined `beat`.
Verified still present on both `demo` and `dj` on 2026-08-26; it was first
reported on 2026-08-21 in `docs/31_DEMO_VERIFICATION_01.md`.

**This plan is frontend-only and does not need the demo backend.** If you hit
this, note it and continue — do not fix it as a side quest.
