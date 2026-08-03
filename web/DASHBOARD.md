# Dashboard — implementation note

> The canonical dashboard spec is **`docs/06_DASHBOARD.md`**. Read that, plus
> `docs/01_CONTRACTS.md` (API contract) and `docs/design.md` (visual system),
> before touching anything in `web/`.
>
> An earlier copy of the spec was kept here; it duplicated `docs/06_DASHBOARD.md`
> and referenced a now-deleted `docs/05_PUBLIC_API.md`, so it has been replaced
> by this pointer. Do not recreate it.

## What is implemented (built to the canonical contract)

| File | Purpose |
|---|---|
| `index.html` | Login (`POST /api/login`), head-blocking auth guard |
| `dashboard.html` | Live SOS feed, acknowledge, connection status, disclosure banner |
| `css/style.css` | Tokens from `docs/design.md`, projector-safe, ≤300 lines |
| `js/api.js` | **Only** file with `fetch()`; envelope-checking requests to `/api/*` |
| `js/session.js` | `aqoneToken` / `aqonePermissions` / `aqoneUser`, `requireAuth`/`can` |
| `js/feed.js` | Render `data.sos`, active-first sort, ack (409 → refresh) |
| `js/stream.js` | SSE `GET /api/sos/stream` (`sos.created`/`sos.acknowledged`), polling fallback |
| `js/escape.js` | `esc()` — required on every server-supplied string before `innerHTML` |

## Rules this code lives by

- `fetch()` only in `js/api.js`. No exceptions.
- No `role ===` anywhere — gate UI on `can('sos.acknowledge')`.
- Every server-supplied string passes through `esc()` before `innerHTML`.
- No file over ~300 lines.
- Status is always visible: `Live` / `Reconnecting…` / `Polling`, plus
  `Last updated HH:MM:SS`.
- Disclosure banner stays visible at all widths.
