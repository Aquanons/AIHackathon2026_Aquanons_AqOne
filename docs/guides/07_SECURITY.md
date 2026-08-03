# 07 — SECURITY

Cybersecurity is an explicitly judged criterion, the repository must be public,
and this system dispatches emergency response. A false SOS wastes rescue
resources; a suppressed one is worse.

This document is also your Q&A ammunition — every mitigation here is a sentence
you can say to a judge.

---

## Threat model

| # | Threat | Impact | Mitigated? |
|---|---|---|---|
| T1 | Forged SOS over LoRa | Wasted rescue dispatch | **Yes** — per-device HMAC |
| T2 | Replay of a captured frame | Duplicate/ghost alerts | **Yes** — `msg_id` dedupe + timestamp window |
| T3 | Compromised/stolen buoy | Attacker holds a valid key | **Partly** — per-device keys + revocation |
| T4 | Direct forged POST to ingest | Bypasses the radio entirely | **Yes** — gateway secret + device HMAC re-verified |
| T5 | Stolen JWT | Impersonation | **Partly** — short expiry, HTTPS only |
| T6 | XSS via server-supplied strings | Session theft from a responder | **Yes** — escape on render |
| T7 | SQL injection | Full data compromise | **Yes** — parameterised queries only |
| T8 | Secrets committed to a public repo | Total compromise | **Yes** — env only + scan before publishing |
| T9 | RF jamming | Denial of service | **No — accepted, disclosed** |
| T10 | Catch-location privacy leak | Livelihood harm, adoption loss | **Partly** — out of scope this build |

Naming T9 as unmitigable is a strength, not a weakness. Claiming to solve
jamming at this budget would be untrue.

---

## Mesh layer

**Per-device keys.** Each device gets a unique 32-byte HMAC-SHA256 key at
provisioning, stored in ESP32 NVS and in `devices.shared_key`. No global key —
one compromised buoy must not forge for the whole fleet.

**Every frame is signed.** 8-byte truncated HMAC over bytes 0–37
(`01_CONTRACTS.md` §2.3). An unsigned or invalid frame **is not a message**:
drop it, log it, never let it reach domain logic.

*Why 8 bytes:* LoRaWAN — the industry standard for exactly this constrained
link — uses a 4-byte MIC. Ours is twice that. Forgery needs ~2^64 work against
a message that expires in minutes.

**Replay protection, two layers:**
1. `ingest_log.msg_id` is a primary key. A replayed frame conflicts and creates
   no second SOS.
2. `ts` outside ±15 min is rejected, bounding the replay window.

**Revocation.** Set `devices.revoked_at`; ingest rejects with `UNKNOWN_DEVICE`.

**Constant-time comparison** for signatures — `secrets.compare_digest` on the
backend, the XOR-accumulate loop in firmware. Never `==` on a MAC.

**Rate limiting** per `src`. A device emitting SOS faster than a human could
press a button is broken or hostile.

---

## Backend

- **Bearer JWT**, 12 h expiry, HS256. Never in a URL except the SSE endpoint
  (EventSource can't set headers) — and that endpoint is read-only.
- **Server-side authorisation on every mutating route**, via
  `require("permission")`. Clients rendering a hidden button is UX, not security.
- **Parameterised queries only.** No f-string SQL, ever.
- **`user_id` always from the token, never from the request body.**
- **Ownership checks** on anything referencing another entity — v1 let any
  fisherman attach a catch log to another fisherman's vessel because the
  `vessel_id` was trusted from the body.
- **Generic error bodies.** `INTERNAL` + a log line. v1 returned raw driver
  exception text to clients in four places.
- **CORS** locked to the dashboard origin, `allow_credentials=False`.
- **Gateway secret** compared with `compare_digest`, and the device HMAC
  re-verified independently — never trust the gateway's `sig_valid` flag alone.

## Dashboard

- Escape every server-supplied string before `innerHTML` (`06_DASHBOARD.md`).
- Auth guard in a blocking `<head>` script on every authenticated page — v1's
  profile page had none and direct navigation bypassed login entirely.
- Token in `sessionStorage`, cleared on logout.

## Mobile

- HTTPS to the backend. Cleartext exception **scoped to `192.168.4.1` only**,
  never global.
- In-flight request coalescing keyed on token + URL, so two sessions can't
  share a response.
- No secrets compiled into the APK. The device key is provisioned at runtime,
  not baked in.

---

## Secrets policy — the repo is public

**Non-negotiable checklist before `git push` on a public repo:**

- [ ] No `.env` committed. `.env` in `.gitignore` from commit one.
- [ ] `.env.example` lists **every** variable, values as placeholders.
- [ ] No connection string, password, or key anywhere in markdown. Use
      `<your_password>`. *v1 committed a live Postgres password inside a
      documentation file.*
- [ ] No device keys in firmware source — NVS only.
- [ ] `__pycache__`, `.venv`, build artefacts gitignored.
- [ ] Secret scan run and clean.

```bash
# Fast scan before going public
git grep -nEi "(password|secret|api[_-]?key|token)\s*[:=]\s*['\"][^'\"]{6,}" || echo "clean"
git grep -nE "postgres(ql)?://[^ ]+:[^ ]+@" || echo "clean"
# Better, if available:
gitleaks detect --source . --no-banner
```

**If a secret was ever committed, rotating it is the fix.** Rewriting history
is optional; rotation is not. An old credential in history is harmless once it
no longer works.

---

## Required environment variables

```bash
# .env.example — every variable the app reads, with a comment.

# Required
DATABASE_URL=postgresql://user:<your_password>@host:5432/aqone
JWT_SECRET=<64+ random chars: python -c "import secrets;print(secrets.token_urlsafe(48))">
AQONE_GATEWAY_SECRET=<random; gateway sends this as X-AqOne-Gateway-Secret>

# Optional
JWT_EXPIRY_HOURS=12
MESH_TS_SKEW_SECONDS=900     # replay window for device timestamps
DASHBOARD_ORIGIN=https://<your-app>.up.railway.app
PORT=8000

# Demo provisioning (scripts/create_demo_accounts.py) — never commit real values
DEMO_FISHERMAN_USERNAME=
DEMO_FISHERMAN_PASSWORD=
DEMO_MDRRMO_USERNAME=
DEMO_MDRRMO_PASSWORD=
```

An undocumented variable makes a correctly-behaving endpoint look broken. v1
read nine and documented three.

---

## Device provisioning — `scripts/provision_device.py`

```
1. Generate a random 32-byte key.
2. INSERT INTO devices (external_id, kind, shared_key, user_id, vessel_id, label).
3. Print the key ONCE, as hex, for flashing into NVS.
4. Never log or store it anywhere else.
```

Keep a paper list of which physical buoy holds which ID during the event. You
will need it when a board stops responding.

---

## What we do not claim

Say these plainly if asked. Honest limits read as competence.

- **Jamming is not mitigated.** Any RF system at this budget is jammable.
- **A physically stolen buoy holds a valid key** until it is revoked.
- **No end-to-end confidentiality** on the mesh — frames are authenticated, not
  encrypted. Contents are position and alert type, so integrity matters far
  more than secrecy here. AES-CCM is a straightforward addition post-MVP.
- **No formal audit or pen test** has been performed.
- **Catch-location privacy** work (coordinate coarsening, anonymisation) is
  designed but out of scope for this build.
