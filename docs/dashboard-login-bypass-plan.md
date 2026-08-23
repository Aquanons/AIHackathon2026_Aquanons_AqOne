# Dashboard login bypass — implementation plan for Luna

## Context

Railway is turned off right now to save credits, so the backend (`/api/login`, `/api/...`) is unreachable. Lenard needs to open `dashboard.html` locally to look at the map/UI without a working backend behind it. This is a **demo/dev convenience, not a real auth feature** — it must be obviously a bypass, not something that quietly weakens the real login gate.

Two facts from the repo that simplify this:

1. There is no public sign-up to bypass. `web/index.html` says so directly: *"Dashboard accounts are created by an administrator via html/admin-signup.html, which is intentionally not linked here. There is no public registration."* So the only gate that exists is the login screen — that's the only thing this plan needs to get around.
2. The gate is exactly one `if` block. In `web/js/dashboard.js`, right after the `// ===== API + AUTH =====` section:
   ```js
   // Guard: no token means never logged in, so do not even start the panels.
   if (!getToken()) {
     redirectToLogin();
     return;
   }
   ```
   `getToken()` just reads `sessionStorage.getItem('aqoneToken')`. `CURRENT_USER` (right below the guard) reads `sessionStorage.getItem('aqoneUser')` and already falls back cleanly to `{ id: 'unknown', name: 'Operator' }` if that key is missing or unparseable — so nothing needs to change there.

   **If Luna is doing this after the `dashboard.js` → `web/js/dashboard/*.js` modularization plan has already landed**, this exact code now lives in `dashboard-core.js` instead — make the equivalent edit there. Confirm which is true by checking whether `web/js/dashboard.js` still exists before starting.

## What to build

A "Continue without logging in" affordance on the login page that sets the same two `sessionStorage` keys the real login flow sets (`aqoneToken`, `aqoneUser`), skips the network call to `/api/login` entirely, and sends the browser straight to `dashboard.html`. Plus one small hardening change so that if Railway comes back online later in the same browser tab, a stray `401` from a real backend doesn't bounce the demo session back to the login screen mid-demo.

Do not build a general "offline mode" that fakes SOS/weather/SAR/advisory data — that's out of scope here. With the backend down, every live-data fetch in the dashboard already fails safely into whatever empty/error/cached state its section renders (weather has a `readWeatherCache`/`writeWeatherCache` fallback, SAR has `renderSarEmpty`, etc. — verify this is still true for whatever you touch, but do not add new fake-data plumbing). The map, buoys, incidents, and vessels sections use hardcoded sample arrays already and will render fine with the backend off, same as today. This plan only removes the login requirement.

## Ground rules (from `AGENTS.md` — read the full file before starting)

- Do not add code comments unless asked. Use self-documenting names instead — and for this change specifically, prefix every new identifier with `DEMO_BYPASS` or `demoBypass` (e.g. `DEMO_BYPASS_TOKEN`, `handleDemoBypass`) so the whole feature is one `grep -ri demobypass` away from being found and removed later.
- If anything below is ambiguous or you find the repo state doesn't match what's described here (e.g. the modularization plan changed structure you weren't expecting), stop and ask rather than guessing.
- Work on a branch: `git checkout -b feature/dashboard-demo-bypass`.
- Commit each step separately as you go (see below) — do not squash into one commit at the end.
- No secrets involved here, but double check you haven't hardcoded anything that looks like a real credential — the demo token should read as obviously fake (e.g. `'DEMO-OFFLINE-NO-AUTH'`), not a plausible-looking JWT.

## Steps

### 1. Add the bypass handler

Add this to `web/js/script.js` (it's already the file `login.html` loads for auth forms, and already owns `sessionStorage` auth-key writes for the real login path — keep the bypass logic next to it rather than in a new file):

```js
function handleDemoBypass(event) {
  event.preventDefault();
  sessionStorage.setItem('aqoneToken', 'DEMO-OFFLINE-NO-AUTH');
  sessionStorage.setItem('aqoneUser', JSON.stringify({ id: 'demo-bypass', name: 'Demo Operator' }));
  sessionStorage.setItem('aqoneDemoBypassActive', '1');
  window.location.href = 'dashboard.html';
}
```

Wire it up in `initAuthForms()`:

```js
function initAuthForms() {
  fillSavedEmail();

  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', handleLogin);
  }

  const demoBypassBtn = document.getElementById('demo-bypass-btn');
  if (demoBypassBtn) {
    demoBypassBtn.addEventListener('click', handleDemoBypass);
  }
}
```

### 2. Add the button to the login page

In `web/html/login.html`, inside `.button-row` (next to Clear/Log In), add a clearly-labeled third button that is visually secondary (not styled like the primary Log In action — reuse whatever "clear"/ghost button class the page's CSS already has, e.g. `button-clear`, rather than inventing new CSS):

```html
<div class="button-row">
  <button class="button-clear" type="reset" form="loginForm">Clear</button>
  <button class="button-next" type="submit" form="loginForm">Log In</button>
</div>
<button class="button-clear" type="button" id="demo-bypass-btn">Continue without logging in (offline demo)</button>
```

Place it below the existing `.button-row`, not inside it, so it reads as a separate, secondary path rather than a third equal option next to Log In. If the page's CSS makes that look cramped or wrong, use your judgment on spacing but keep the button visibly de-emphasized compared to "Log In."

### 3. Harden `authFetch` so a later real `401` doesn't bounce the demo session

In `web/js/dashboard.js` (or `dashboard-core.js` if already split), find:

```js
function authFetch(path, options) {
  const opts = options || {};
  const headers = Object.assign({ Accept: 'application/json' }, opts.headers || {});
  const token = getToken();
  if (token) headers.Authorization = 'Bearer ' + token;

  return fetch(API_BASE + path, Object.assign({}, opts, { headers: headers }))
    .then(function (res) {
      if (res.status === 401) {
        redirectToLogin();
        throw new Error('Session expired');
      }
      return res;
    });
}
```

Change the `401` branch so it skips the redirect when the demo bypass is active:

```js
    .then(function (res) {
      if (res.status === 401 && sessionStorage.getItem('aqoneDemoBypassActive') !== '1') {
        redirectToLogin();
        throw new Error('Session expired');
      }
      return res;
    });
```

Leave everything else in `authFetch` untouched. Note this means a `401` during an active demo bypass now falls through to `return res;` with `res.ok === false` — confirm the callers of `authFetch` already handle a non-ok response without assuming it's always 200 (skim a couple of call sites; if any assume success without checking `res.ok`, that's a pre-existing issue, not something to fix here — just note it for Lenard rather than expanding this change's scope).

### 4. Verify

You can't test against the real deployed site while Railway is off, but you don't need it — the whole point is this path never calls the backend. Serve the `web/` folder with any static file server (e.g. `python -m http.server` from inside `web/`) and:

- Open `html/login.html`, click "Continue without logging in (offline demo)", confirm you land on `dashboard.html` with no redirect back to login.
- Open devtools → Application → Session Storage, confirm `aqoneToken`, `aqoneUser`, and `aqoneDemoBypassActive` are set.
- Confirm the map, buoys, and incidents render (they're sample data, should work regardless of backend state).
- Confirm no new console errors beyond the expected failed network calls to backend endpoints (those are expected with Railway off, not something this change should fix).
- Reload `dashboard.html` directly (not via the login page) to confirm the session persists within the tab, same as a real login would.

### 5. Commit

Two commits:

- `feat(auth): add offline demo bypass button to login page` — steps 1 and 2.
- `fix(dashboard): don't redirect demo bypass sessions on 401` — step 3.

## One thing to flag to Lenard when done

This bypass is live in the shipped frontend the moment this branch merges — anyone who opens `login.html` can click straight into the dashboard with no credentials. That's fine for a local/offline demo, but call it out explicitly when you report back so Lenard can decide whether to gate it behind something (env flag, remove before the public demo, etc.) rather than it just being an unremarked permanent feature of the login page.
