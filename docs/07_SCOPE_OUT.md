# 07 — Scope Out

Deliberate decisions **not** to build. These are scoped-out choices, not gaps,
and are presented that way in Q&A. Do not implement any of these unless this
doc is amended first.

## Hardware / mesh

- No mesh routing protocol. Relay is TTL flooding with a per-buoy seen-set
  (`docs/02_LOAM_PACKET_SPEC.md`). Good enough for a bay.
- No end-to-end encryption of SOS content in MVP. Frames are channel-signed
  (HMAC) for authenticity; content is plaintext JSON.
- No duplex return channel for ack delivery to the phone over the mesh. The
  phone learns `delivered`/`acknowledged` only if it has internet later
  (`docs/05_PUBLIC_API.md`). The four states stay honest
  (`docs/06_DELIVERY_STATES.md`).
- MPU6050 tilt detection is optional and is not a deliverable.

## Product scope (existed in v1, cut for this build)

- **No AI model.** No prediction, no anomaly detection, no "smart" anything.
  The product is a reliable pipe, not an ML wrapper.
- **No catch logging.** Fish catch / sales records are a separate product.
- **No advisories.** No weather, forecast, or hazard push to fishermen.
- **No photos.** SOS is text + optional GPS only; the LoRa channel is narrow.
- **No float-plan.** No trip scheduling, ETA, or "did not return" logic.
- **No BFAR/LGU regulator roles.** Only `fisherman`, `mdrrmo`, `admin`
  (`docs/01_ARCHITECTURE.md`). There is no regulator dashboard.
- **No accounts/passwords.** Fisherman identity is a device-local id; MDRRMO
  is API-key based. No user database.

## Why (for Q&A)

We had ~15.5 build hours and a strict sequential path
(`docs/00_START_HERE.md`). Every item above is a separable product that would
consume the integration budget. The demo story is: airplane-mode SOS → buoy →
LoRa → gateway → dashboard → ack. Everything else is future work.

## How to amend

If a scope-out item becomes essential, edit this doc to move it to
"in scope", then update `AGENTS.md` and `docs/00_START_HERE.md`, and re-check
the build order. Tell the owning workstream.
