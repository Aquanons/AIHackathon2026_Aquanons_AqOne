# Dashboard layout redesign — integration plan for Luna

## Context

Lenard commissioned a Claude Design mockup of a new layout for `dashboard.html` (attached alongside this plan: `aqone-dashboard-redesign-reference.png`, rendered from the file he uploaded). **This is a layout-only redesign — the current light theme, colors, and branding stay exactly as they are.** The mockup file itself (`AqOne_Dashboard.html`, if Lenard also hands you that) is a Claude Design canvas export — a self-contained React/Tailwind bundle, not reusable markup. Do not try to copy/paste anything out of it or load its JS runtime into the site. Treat it purely as a visual reference (the PNG is the easiest way to look at it — open the raw HTML file in an actual browser if you need to check something at pixel level, since it won't render as plain text). The real implementation goes into the existing vanilla-JS + plain-CSS site, same as every other file in `web/`.

**Scope, explicitly:** this changes structure, spacing, card boundaries, and how existing data is presented — not colors, not the theme, not the map pin/marker styling (leave those alone), and not any backend/data logic beyond re-pointing existing values at new markup.

## Ground rules (same as the modularization and login-bypass plans — read those in `docs/` if you haven't)

1. Work on its own branch: `git checkout -b feature/dashboard-layout-refresh`, branched from whatever the current integration branch is (ask Lenard which, if the earlier Leaflet-vendoring and modularization branches haven't been merged to main yet — don't guess).
2. Commit incrementally, one section of the layout per commit, not one giant commit at the end. Working tree must load cleanly in a browser after every commit.
3. No bundler, no React, no `type="module"` — plain HTML/CSS/JS, matching the rest of the site.
4. **Before restyling any section, grep `dashboard.js` (or the split `web/js/dashboard/*.js` files, whichever exists on this branch) for every element ID and class name that section's JS reads via `getElementById`/`querySelector`.** This redesign moves things into new card containers — if you rename or restructure an ID that JS depends on, the feature silently breaks. Keep IDs identical wherever possible; if a rename is genuinely needed, update every JS reference to it in the same commit and confirm no console errors afterward. This is the single most important rule for this task — a section that looks right but is dead because its data never arrives is worse than not touching it.
5. If a card in the mockup shows a metric or label you can't find a real data source for anywhere in the current code, don't invent one — flag it to Lenard by name and either leave that spot showing the current real value/placeholder or skip that specific piece, rather than guessing at fake data.
6. Ask before doing anything ambiguous or surprising, per `AGENTS.md`. No code comments unless asked; self-documenting names.
7. Verify after each commit: reload the dashboard (through the demo bypass if the backend's still down), confirm the section you just touched still renders its live/dynamic content correctly, not just that it looks like the mockup.

## Design tokens (measured directly off the mockup — use these, don't eyeball the screenshot)

Reuse the site's existing CSS custom properties (`web/css/dashboard.css` already has `--bg`, `--accent`, etc. — check what's already defined) and update their *values* to match these rather than inventing a second set of variables:

- Font: `Inter, system-ui, sans-serif` (site likely already uses something close — check before adding a new font import; if Inter isn't already loaded, this needs a font addition, flag that to Lenard since it's a scope question, not a pure layout question)
- Page background: `#eef1f5`
- Primary text: `#1f2a37`
- Muted/secondary text (section labels, captions): `#7b8797`
- Section micro-labels ("LIVE SOS", "TOOLBOX", etc.): `11.5px`, weight `600`, uppercase, letter-spacing slightly open
- Brand accent blue: `#1a73c8` — used for the wordmark, the active EN/AKL segment, active map-style tab
- Card surface: white `#ffffff`, `1px solid #e2e8f0` border, `12px` border-radius
- Card padding: `16–18px`; gap between stacked cards: `10–12px`
- Status pills (pill-shaped badges like "OFFLINE", "All clear", "MONITORING", "IDLE"): `20px` border-radius, `1px` border, tinted background matching the text color family (e.g. OFFLINE: bg `#fdeced`, border `#f6cdcf`, text `#c8383d`, weight 700, 12px; "All clear": bg `#eefbf2`, border `#d4f0de`, text `#16a34a`, weight 600, 11px)
- Segmented toggle (EN/AKL, map-style tabs): active segment filled `#1a73c8` bg / white text, `6px` radius, `5px 11px` padding; inactive segment transparent bg, `#6b7787` text
- Brand wordmark "AqOne": `25px`, weight `700`, accent blue

## Section-by-section mapping (mockup → current dashboard.html/dashboard.js)

Go in this order — top of page to bottom, each its own commit:

**1. Top bar.** Current top bar already has the right functional pieces (logo, map-style nav, search, EN/AKL, OFFLINE-style status indicator, theme toggle, fullscreen, user pill) — this is a restyle of existing elements into pill/segmented-control shapes per the tokens above, not new functionality. Map-style nav becomes a 3-segment pill control (Streets/Satellite/Hybrid) instead of whatever the current tab styling is — find wherever `switchLayer(name)` (in the LAYER SWITCHER section) reads the active tab and keep its click targets/IDs intact.

**2. Demonstration-data banner.** Currently a bold full-width colored bar. In the mockup it's a slim, low-contrast single-line strip with a small info icon. Pure CSS change, no JS involved — safe, low-risk, good first commit.

**3. Stats row.** This is the biggest structural change. Currently a single thin strip: "Live SOS: N · RETURN NOW: N · Last updated: T". The mockup turns this into three separate cards (LIVE SOS / RETURN NOW / LAST UPDATED), each with a big numeral, a status pill, a small trend/sparkline, and a caption line. Find where the current strip's values get written (`updateStats()` in the STATS PANEL section, plus wherever sync status and live SOS/return-now counts are computed — likely `updateSyncStatus()` and the LIVE SOS FEED / ALERT DATA sections) and re-point that same logic at the three new card elements instead of the old strip. The sparklines in the mockup are decorative trend lines — if there's no real time-series data backing them yet, use a flat/neutral placeholder rather than fabricating a trend, and flag this to Lenard as a possible future real-data hookup.

**4. "Live near-shore danger scan" panel.** Currently a floating dark card that overlaps the map. In the mockup it becomes a full-width white card sitting directly above the map, same content (danger/watch/scanned-cell counts, "EXPERIMENTAL — NOT FOR NAVIGATION" badge, location label, refresh button). Find whatever currently populates this panel (danger-zone rendering — `renderDangerZones`, `readCachedDangerZoneResult`, `cacheDangerZoneResult` in the current code) and move its target markup into the new card position without changing the underlying compute/cache logic.

**5. Map card.** Functionally unchanged — just gets a white card wrapper with rounded corners matching the rest of the system. Coordinate readout, zoom controls, home button all stay exactly where they are functionally, just restyled to sit inside the card border. Leave every pin/marker/icon exactly as-is — out of scope.

**6. Right column — Toolbox.** The mockup shows a fixed 5-button grid (Layers, Pin, Measure, Buoys, Contacts). The current site has a horizontally-scrolling icon rail with an overflow arrow, and from the current screenshot it looks like there may be more than 5 tools in that rail (check the RAIL PANEL SYSTEM / TOOLBOX SCROLL OVERFLOW sections for the full current list before touching this). **Confirm every current tool has a home in the new 5-button layout before implementing it** — if the current rail has 6+ tools and the mockup only shows 5, that's a real discrepancy to flag to Lenard, not something to silently resolve by dropping a tool.

**7. Right column — Tool Panel.** Tabs (Live Overview / Vessels / Alerts / SAR) are the same as today, just restyled — find the TAB SWITCHING section and keep its click wiring intact. The "Live Overview" tab content in the mockup (near-shore cells scanned, cells in watch/danger state, strongest-cell progress bar, last-scan time, a "scan intensity — last 6 cycles" sparkline) is more structured than whatever currently occupies that tab — check whether these exact metrics already exist somewhere in the danger-zone/scan logic before building new markup for them. If some of these numbers don't have a real source yet, say so rather than inventing values.

**8. Right column — Squall Nowcasting card.** Same content as today (monitoring status, empty-state message, pressure trace), restyled into the card system. Find this in the AI OPERATIONS code (`renderSquallWatch`, `updateSquallBanner`, or wherever squall rendering landed after the modularization split) and re-point its target elements.

**9. Right column — Drift & Search Allocation card.** Same idea — same content, restyled, find wherever drift-related AI ops rendering currently lives and re-point it at the new markup.

## Definition of done

- Every stat, count, and status shown anywhere in the redesigned dashboard is still driven by the same real JS logic as before — nothing is hardcoded or fabricated to match the mockup's placeholder numbers.
- No console errors after a full reload.
- Theme is still light, using the token values above layered onto the existing CSS variables (not a parallel new stylesheet).
- Map pins/markers are untouched.
- Every current toolbox tool is present and working in the new layout — confirmed against the pre-redesign tool list, not assumed.
- `git log` on the branch is a clean, section-by-section sequence, reviewable independently of the other in-flight branches (Leaflet vendoring, modularization, login bypass).
