# 06 — DASHBOARD (regulator web)

Plain HTML/CSS/JS, ES modules, no build step. Served by FastAPI from `web/` so
everything is same-origin and relative paths work.

Read `01_CONTRACTS.md` first. Visual design is the team's `DESIGN.md` — this
document covers behaviour and structure only.

---

## Scope

**In:** login, live SOS feed, acknowledge, connection status.

**Out:** map layers, advisories, sea condition, pins, buoy topology, catch
analytics, profile pages. Do not build them.

One page. One list. One button. v1's dashboard reached 3,731 lines in a single
file and grew duplicate DOM IDs, undefined function calls, and contradictory
labels. Do not repeat that.

---

## Layout

```
web/
  index.html          # login
  dashboard.html      # the feed
  css/  style.css     # from DESIGN.md
  js/
    api.js            # EVERY network call lives here. No fetch() elsewhere.
    session.js        # token + permissions storage, auth guard
    feed.js           # render + acknowledge
    stream.js         # SSE subscription
    escape.js         # HTML escaping
```

No file over ~300 lines.

---

## `js/escape.js` — use on every server-supplied string

v1 shipped two stored-XSS paths by interpolating server data into `innerHTML`.
The repo will be public and cybersecurity is judged.

```js
export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
```

**Rule: any value that came from the server is wrapped in `esc()` before it
touches `innerHTML`.** No exceptions.

---

## `js/api.js` — the only place `fetch` appears

```js
const BASE = '';   // same origin

function authHeaders() {
  const t = sessionStorage.getItem('aqoneToken');
  return t ? { Authorization: `Bearer ${t}` } : {};
}

async function request(path, options = {}) {
  const res = await fetch(BASE + path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...authHeaders(), ...(options.headers || {}) },
  });

  let body;
  try { body = await res.json(); } catch { body = null; }

  // Envelope per docs/01_CONTRACTS.md 3.1 — payload is ALWAYS under data.
  if (!res.ok || !body || body.ok !== true) {
    const code = body?.error?.code ?? 'INTERNAL';
    const message = body?.error?.message ?? `HTTP ${res.status}`;
    const e = new Error(message);
    e.code = code;
    e.status = res.status;
    throw e;
  }
  return body.data;
}

export const api = {
  login: (username, password) =>
    request('/api/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  me: () => request('/api/me'),
  listSos: (limit = 50) => request(`/api/sos?limit=${limit}`),
  acknowledge: (id) => request(`/api/sos/${encodeURIComponent(id)}/acknowledge`, { method: 'POST' }),
};
```

`request` returns `body.data`. Callers use `data.sos`. **Never assume a bare
array** — that exact mistake made pins invisible in v1 while a fake "saved"
marker appeared after a successful save.

---

## `js/session.js` — auth guard and permissions

```js
export function requireAuth() {
  if (!sessionStorage.getItem('aqoneToken')) {
    window.location.replace('index.html');
    return false;
  }
  return true;
}

export function can(permission) {
  const perms = JSON.parse(sessionStorage.getItem('aqonePermissions') || '[]');
  return perms.includes(permission);
}
```

**Never write `if (role === 'mdrrmo')` anywhere in this codebase.** Gate on
`can('sos.acknowledge')`. The server owns the matrix; v1 duplicated it in three
places, they drifted, and the only authorised role had the control hidden.

Put the guard in a blocking `<script>` in `<head>` so an unauthenticated direct
visit never paints content.

---

## `js/feed.js`

```js
import { api } from './api.js';
import { esc } from './escape.js';
import { can } from './session.js';

let items = [];

export function render() {
  const el = document.getElementById('sos-list');
  if (!items.length) {
    el.innerHTML = '<p class="empty">No SOS alerts.</p>';
    return;
  }
  el.innerHTML = items.map((s) => `
    <article class="sos-row ${s.status === 'active' ? 'is-active' : ''}" data-id="${esc(s.id)}">
      <div class="sos-main">
        <div class="sos-who">${esc(s.reporter_name)}${s.vessel_name ? ' — ' + esc(s.vessel_name) : ''}</div>
        <div class="sos-meta">
          ${esc(s.lat.toFixed(5))}, ${esc(s.lon.toFixed(5))}
          · ${esc(s.path)}
          · ${esc(formatTime(s.submitted_at))}
        </div>
        ${s.status === 'acknowledged'
          ? `<div class="sos-ack">Acknowledged by ${esc(s.acknowledged_by_name ?? '—')}</div>`
          : ''}
      </div>
      ${s.status === 'active' && can('sos.acknowledge')
        ? `<button class="btn-ack" data-id="${esc(s.id)}">Acknowledge</button>`
        : `<span class="pill">${esc(s.status)}</span>`}
    </article>`).join('');
}
```

Acknowledge handler:
- Disable the button immediately (prevents double-submit).
- On `409 ALREADY_ACKNOWLEDGED`, refresh the list rather than showing an error —
  someone else got there first, which is normal.
- **Do not mutate local state before the server confirms.** v1's optimistic
  update is why a failed save could still look successful.

---

## `js/stream.js` — SSE, not polling

```js
export function connect(onEvent, onStatus) {
  const token = sessionStorage.getItem('aqoneToken');
  const src = new EventSource(`/api/sos/stream?token=${encodeURIComponent(token)}`);

  src.onopen = () => onStatus('live');
  src.onerror = () => onStatus('reconnecting');   // EventSource auto-retries
  src.addEventListener('sos.created', (e) => onEvent('created', JSON.parse(e.data)));
  src.addEventListener('sos.acknowledged', (e) => onEvent('acknowledged', JSON.parse(e.data)));
  return src;
}
```

Fall back to `setInterval(refresh, 10000)` if SSE fails twice — but SSE is the
primary path. Polling latency on a distress feed is a product flaw.

**Always show connection state.** A stale feed that looks live is dangerous:
show `Live` / `Reconnecting…` / `Last updated HH:MM:SS` at all times.

---

## Demo-critical behaviour

The moment that wins the pitch is a new SOS appearing while judges watch.

- New rows animate in and are visually unmissable (colour + motion + count badge).
- Optional audio cue — test the venue's speakers first.
- Active SOS sorts to the top always.
- The feed must look correct on a projector: large type, high contrast, no
  dependence on hover.

Rehearse with the dashboard on the actual projector before Day 3.

---

## Honest labelling

If any panel shows simulated or placeholder data, it carries a visible
`Simulated` tag. A disclosure banner must stay visible at **all** widths — v1
hid its banner below 768 px, which meant the disclosure vanished on exactly the
devices most likely to be used to inspect it.
