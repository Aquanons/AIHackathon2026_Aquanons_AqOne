# 07 — Scope Out

Deliberate decisions **not** to build. These are scoped-out choices, not gaps,
and are presented that way in Q&A. Do not implement any of these unless this
doc is amended first.

> **Amended.** Several items below were scoped out during the original 15-hour
> build and have since been built. They are moved to "Amended — now in scope"
> at the end of this document rather than deleted, so the decision trail stays
> readable.
>
> This matters: an outside audit read the stale version of this file and the
> matching line in `AGENTS.md`, and concluded the project had built no AI and no
> backend. Both existed at the time. **A scope document that lies about the
> product is worse than no scope document.** The canonical scope is
> `Aqone_PRD (2).md` (v3.0), where unimplemented sections carry an explicit
> `[Roadmap — not implemented]` tag.

## Hardware / mesh

- No mesh routing protocol. Relay is TTL flooding with a per-buoy seen-set
  (`docs/02_LOAM_PACKET_SPEC.md`). Good enough for a bay.
- No end-to-end encryption of SOS content in MVP. Frames are channel-signed
  (HMAC) for authenticity; content is plaintext JSON.
- No duplex return channel for ack delivery to the phone **over the mesh**.
  Still true for LoRa: `docs/13_RESPONDER_LOOP.md` specs frame type `0x04` for
  it, and nobody has implemented it. The phone does now learn
  `delivered`/`acknowledged` **and the responder's ETA** over the internet.
- MPU6050 tilt detection is optional and is not a deliverable.

## Product scope (existed in v1, cut for this build)

- **No catch logging.** Fish catch / sales records are a separate product.
  Still true, and now doubly so: the product is life-safety only.
- **No photos.** SOS is text + optional GPS only; the LoRa channel is narrow.
  Still true.

## Why (for Q&A)

We had ~15.5 build hours and a strict sequential path
(`docs/00_START_HERE.md`). Every item above is a separable product that would
consume the integration budget. The demo story is: airplane-mode SOS → buoy →
LoRa → gateway → dashboard → ack. Everything else is future work.

## How to amend

If a scope-out item becomes essential, edit this doc to move it to
"in scope", then update `AGENTS.md` and `docs/00_START_HERE.md`, and re-check
the build order. Tell the owning workstream.

---

## Amended — now in scope

These were scoped out for the original build and have since been built. Each is
listed with where it now lives, so the claim can be checked against code rather
than taken on trust.

- **Advisories and weather.** Open-Meteo conditions in the app
  (`mobile/lib/services/venture_feeds.dart`), MDRRMO-declared sea condition
  (`backend/app/api/sea_condition.py`), and squall nowcasting with RETURN NOW
  alerts (`backend/app/ai/squall.py`).
  *Honesty note:* the app's wind indicator is a single 30 km/h threshold, shown
  with its source and an explicit "not a PAGASA warning" disclaimer. It is not a
  model and must never be presented as one.

- **Float-plan / "did not return" logic.** This is now a core AI component -
  learned per-vessel trip profiles, expected-next-contact prediction and a
  four-stage escalation ladder (`backend/app/ai/trip_profile.py`, PRD §5.2).

- **Accounts and passwords.** Dashboard operators have real accounts: bcrypt
  hashes, JWT sessions, and account creation gated behind a server-side setup
  key (`backend/app/auth.py`, `backend/app/api/auth.py`, migration `005_auth`).
  Fisherman identity is still a device-local id with no password, by design -
  a person in distress cannot be asked to log in.

- **LGU role.** `VALID_ROLES` is `mdrrmo`, `lgu`, `admin`. There is still no
  separate regulator dashboard, and fisheries-enforcement features remain out
  of scope deliberately: positioning a safety network as a surveillance network
  would undermine adoption by the people it protects.

- **AI models.** Three are built and measured - squall nowcasting, trip anomaly
  detection and Monte Carlo drift prediction - plus a gradient-boosted
  danger-zone model in `web/ml/`. All are calibrated on synthetic data except
  the danger-zone model, which is trained on real Open-Meteo history. See
  `docs/14_PRD_AUDIT.md` for what is genuinely built versus claimed.
