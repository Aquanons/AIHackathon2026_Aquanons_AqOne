# AGENTS.md

Instructions for AI coding agents working in this repository. Read this before
changing anything. The canonical project brief is `docs/00_START_HERE.md`.

## One-line project

Offline SOS mesh for small-scale fishermen in New Washington, Aklan (no mobile
signal at sea): phones hand an SOS to anchored LoRa buoys over WiFi, buoys
relay over LoRa to a gateway with internet, the gateway forwards to a FastAPI
backend, and the backend pushes the SOS to an MDRRMO dashboard over SSE.

## Build order — strictly sequential

Do NOT start a step until the previous one demonstrably works. Do NOT skip
steps. If you are unsure whether a step is done, ask.

1. Deployed skeleton — FastAPI on Railway, green `/healthz`, migrations run.
2. Two radios talk — raw LoRa packet between two ESP32s, no protocol.
3. Buoy → gateway → backend — button press on a buoy creates a real SOS row.
4. Phone → buoy → backend — phone in airplane mode, SOS lands.
5. Dashboard live feed + acknowledge — full path visible, ack persists.
6. Range test outdoors — record actual metres in `docs/08_DEMO_AND_STATUS.md`.
7. Freeze, rehearse x3, record screencast.

## Ownership

| Person | Owns |
|---|---|
| Lenard | Lead dev — backend, architecture, deployment |
| Arnold | Full stack — ingest pipeline, gateway |
| Daniel | Hardware/firmware — buoy. Critical path. |
| Jade | Dashboard |
| Doreen Kay | UI/UX, pitch deck |

## Deliberately NOT building (do not implement)

These are scoped-out decisions, not gaps. See `docs/07_SCOPE_OUT.md` for the
full list and for the items that have since been amended into scope.

Still out: no photos, no fisheries-enforcement or surveillance features, no
LoRa downlink to the handset. Catch logging was cut for the original build but
is back in scope - see `docs/07_SCOPE_OUT.md`'s "Amended — now in scope".

**Do not treat this file as the scope of record.** The canonical scope is
`Aqone_PRD (2).md` (v3.0); unbuilt sections there are tagged
`[Roadmap — not implemented]`. Advisories, accounts, "did not return" detection
and three AI models were once listed here as out of scope and now exist — an
outside audit read the stale version and reported the project as having built
neither AI nor a backend.

## Shared contracts (do not diverge from these)

All workstreams interoperate through these documents. If a contract needs to
change, update the doc first and tell the affected owners.

| Contract | Doc | Who consumes |
|---|---|---|
| LoRa binary frame | `docs/02_LOAM_PACKET_SPEC.md` | firmware (Daniel), gateway (Arnold) |
| Phone ↔ buoy WiFi HTTP | `docs/03_PHONE_BUOY_WIFI.md` | firmware (Daniel), mobile (Jade/Doreen) |
| Gateway → backend HTTPS | `docs/04_INGEST_API.md` | gateway (Arnold), backend (Lenard) |
| Public REST + SSE | `docs/05_PUBLIC_API.md` | backend (Lenard), dashboard (Jade) |
| Delivery states | `docs/06_DELIVERY_STATES.md` | all — the four states are the product language |
| Mobile UI strings | `docs/22_LOCALIZATION_PLAN.md` | mobile (Jade/Doreen Kay) |

## Repository layout

```
backend/     FastAPI + PostgreSQL (Lenard)
  app/       application code
  migrations/  database migrations
  tests/
gateway/     LoRa gateway node code (Arnold)
firmware/
  buoy/      ESP32-S3 + SX1262 firmware, PlatformIO (Daniel)
mobile/      Flutter app (Jade, Doreen Kay)
  lib/l10n/  ARB translation files, en/fil/akl. Read its README first.
docs/        numbered specs; 00 is the brief, 08 is the status table
```

## Definition of done (whole build)

- [ ] Phone in airplane mode sends an SOS that reaches the dashboard
- [ ] Dashboard acknowledge persists across a reload
- [ ] The four delivery states are visible and honest in the app
- [ ] Deployed, healthcheck green, demo URL reachable from outside the venue
- [ ] Repo public, no secrets, README with setup instructions
- [ ] Screencast recorded
- [ ] `docs/08_DEMO_AND_STATUS.md` status table reflects reality

## Mobile UI strings are localized (en / fil / akl)

The handset app ships English, Tagalog and Aklanon. Full plan and phase order
in `docs/22_LOCALIZATION_PLAN.md`. Three rules that will cost you a debugging
session if you miss them:

- **New user-facing text goes in `mobile/lib/l10n/app_en.arb`** with an
  `@key` description, then is read via
  `AppLocalizations.of(context).yourKey`. Do not add bare `Text('...')`
  literals to `mobile/lib/`. Log messages, SQL, and wire values stay as
  literals — those are not UI.
- **Never put display text on an enum.** Const enum fields cannot see a
  `BuildContext`, so they can never be translated. `DeliveryState` and
  `SeaStatus` keep only wire values, ordering and colours; their text lives in
  a `…L10n` extension that takes an `AppLocalizations`. Copy that pattern.
- **The Tagalog locale code is `fil`, not `tl`,** and Aklanon (`akl`) has no
  Flutter localizations at all — `mobile/lib/core/l10n_fallback.dart` handles
  the second problem and its delegates must stay last in the list.

Translations in `app_fil.arb` and `app_akl.arb` are unreviewed drafts. Do not
treat them as correct; see `mobile/lib/l10n/README.md`.

## Conventions

- Do not add code comments unless asked. Prefer self-documenting names.
- No secrets in the repo. Use `.env` locally (gitignored) and platform
  env vars in deployment. `*.env.example` files are allowed.
- Follow the build order above. Do not build ahead of the current step.
- If a task is ambiguous, ask before doing surprising or large work.
- Verification before completion: run the project's lint/tests for whatever
  you changed. The backend uses pytest + ruff once scaffolded; firmware uses
  PlatformIO build; mobile uses `flutter analyze` + `flutter test`.

## Time budget (Aug 3–5)

Day 1 afternoon 2.5 h, Night 1 7.0 h (main integration push), Day 2 4.0 h,
Day 3 hard stop ~10:30 am 2.0 h. Deliverables may be due 5:00 pm Aug 4.
Prioritize the sequential build order over polish.
