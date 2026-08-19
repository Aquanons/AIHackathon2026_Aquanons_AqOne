# 22 — Localization Plan (English / Tagalog / Aklanon)

Scope: the Flutter handset app (`mobile/`) only. Backend and the MDRRMO
dashboard stay English — responders work in English, and the backend's
user-facing text is a separate contract change (see "Deferred" below).

Owner: Jade + Doreen Kay (mobile), with Lenard reviewing the `main.dart`
and enum refactors. Translation review is a whole-team job — everyone on
this project speaks the target languages better than any tooling does.

---

## 1. Why this matters for this product

AqOne is a safety app for fishermen in New Washington, Aklan. The four
delivery states are the product language (`docs/06_DELIVERY_STATES.md`) —
if a skipper cannot read the difference between **Relayed** and
**Delivered**, the app's core honesty guarantee is worthless to him. This
is not polish. It is the difference between an app that is understood on
the water and one that is not.

## 2. Locale codes — read this before writing any code

| Language | Code we use | Why |
|---|---|---|
| English | `en` | Fallback and source of truth. |
| Tagalog / Filipino | `fil` | **Not `tl`.** `flutter_localizations` ships `GlobalMaterialLocalizations` for `fil`, not `tl`. Using `tl` throws `No MaterialLocalizations found` at runtime for every Material widget (date pickers, dialogs, tooltips). |
| Aklanon | `akl` | Valid ISO 639-3. **Not** supported by `flutter_localizations` — needs a fallback delegate, see §4. |

Aklanon is the actual first language of New Washington. Tagalog is widely
understood as a second language. Shipping both means the demo users read
their own language and the national audience still gets a language they
know. This ordering is deliberate: **`akl` is the differentiator, `fil`
is the reach.**

## 3. Approach: `flutter gen-l10n` + ARB

Chosen over a hand-rolled `Map<String, String>` because:

- Codegen makes every key a typed getter — a missing or misspelled key is
  a compile error, not a blank label discovered on stage during the demo.
- `untranslated_messages_file` gives a machine-readable list of what each
  translator still owes, which is what makes the review process in §7 work.
- Plurals and placeholders (`{count} buoys`, `{minutes} min ago`) are ICU
  and correct in all three languages without bespoke logic.

Cost: one `flutter pub get` and one codegen step. Accepted.

## 4. The two architectural wrinkles

### 4.1 Strings baked into enums

`DeliveryState` and `SeaStatus` carry their own `title` / `description` /
`headline` as const enum fields. Const fields cannot depend on a
`BuildContext`, so they cannot be localized in place.

**Pattern:** strip the display strings out of the enum, keep the wire
value and the ordering/colour logic there, and add an extension that
resolves display text from `AppLocalizations`:

```dart
extension DeliveryStateL10n on DeliveryState {
  String title(AppLocalizations t) => switch (this) {
        DeliveryState.saved => t.deliveryStateSavedTitle,
        ...
      };
}
```

Call sites change from `record.state.title` to
`record.state.title(AppLocalizations.of(context)!)`. This is the pattern
to copy for every enum in `lib/models/`. Affected:
`delivery_state.dart`, `sea_condition.dart`, `trust_tier.dart`,
`license_type.dart`, `hazard_alert.dart`.

### 4.2 Aklanon has no Material localizations

`supportedLocales: [en, fil, akl]` will crash on `akl` because
`GlobalMaterialLocalizations.delegate.isSupported(akl)` is `false`. Fixed
by appending fallback delegates that claim every locale and load the `en`
implementations — our own `AppLocalizations` still resolves `akl`
correctly, only Flutter's built-in widget chrome falls back to English.
See `lib/core/l10n_fallback.dart`.

Consequence: date pickers and the "Paste"/"Select all" context menu will
read English in Aklanon mode. Acceptable — those are rare surfaces, and
the alternative is contributing a full CLDR locale to Flutter.

## 5. String inventory

352 user-facing string literals across `mobile/lib`. Not evenly spread —
this is the migration order, biggest first:

| File | Strings | Phase |
|---|---|---|
| `ui/venture_page.dart` | 69 | 3 |
| `ui/info_page.dart` | 34 | 4 (long-form, see §6) |
| `ui/profile_page.dart` | 33 | 2 |
| `ui/onboarding_page.dart` | 25 | 2 |
| `core/validators.dart` | 15 | 2 |
| `ui/home_page.dart` | 10 | 1 |
| `ui/widgets/squall_banner.dart` | 10 | 3 |
| `ui/widgets/weather_card.dart` | 9 | 3 |
| `models/sea_condition.dart` | 8 | 1 |
| `ui/checklist_page.dart` | 8 | 3 |
| `ui/chathubb.dart` | 7 | 3 |
| `services/buoy_client.dart` | 7 | 2 |
| `ui/advisories_page.dart` | 6 | 3 |
| `ui/catch_history_page.dart` | 6 | 3 |
| `ui/widgets/responder_eta_dialog.dart` | 6 | 1 |
| `models/delivery_state.dart` | 4 | 1 |
| `ui/app_shell.dart` | 3 | 1 |
| remaining models/services/widgets | ~82 | 2–3 |

`data/app_database.dart` (9) and parts of `services/backend_client.dart`
are SQL and log strings — **do not translate those.** The inventory
number is a ceiling, not a target.

## 6. Phases

**Phase 0 — scaffold (done, this commit).** `l10n.yaml`, three ARB files
seeded with the Phase 1 keys, `LocaleController`, fallback delegates,
`main.dart` wiring, language picker in onboarding + Profile.

**Phase 1 — the safety path.** Delivery states, sea status, SOS button
and confirmation, nav labels, responder ETA dialog. This is what appears
in the screencast. If localization stops here it still demos.

**Phase 2 — identity and setup.** Onboarding, profile, validators, buoy
connection errors. Everything a first-time user reads before their first
trip.

**Phase 3 — Venture and the rest.** Weather, compass, checklist, catch
log, advisories, chathub. Highest string count, lowest safety stakes.

**Phase 4 — long-form copy.** About / Help / Privacy / Terms in
`info_page.dart`. These are four ~500-word blocks. Do **not** put them in
ARB as single giant strings — split into per-section keys, or move them
to `assets/copy/{locale}/about.md` and load at runtime. Legal text also
needs a human sign-off per language, so it is last on purpose.

## 7. Translation review process

Machine-drafted translations ship as drafts, not as truth. Every ARB
entry lands with a `@key` description explaining the context, because a
translator seeing `"Saved"` with no context will guess wrong.

1. Run `flutter gen-l10n`; read `untranslated.json` for the gaps.
2. A native speaker on the team reviews `app_fil.arb` and `app_akl.arb`
   **against the running app**, not against a spreadsheet. Screen context
   changes word choice.
3. Safety-critical strings (delivery states, sea status, SOS) get a
   second reviewer. Getting "Not Advised to Go Out" subtly wrong in
   Aklanon is a real-world hazard, not a typo.
4. Prefer the word a fisherman uses over the dictionary-correct word.
   `Alon` beats a formal register nobody says out loud.

Known drafting risks to check first: nautical vocabulary (buoy, mesh,
relay, drift), MDRRMO/agency names (**do not translate** — keep the
official acronym), and imperative safety phrasing, which is grammatically
different in Aklanon from Tagalog.

## 8. Preventing regressions

Add to `mobile/analysis_options.yaml`:

```yaml
linter:
  rules:
    - prefer_const_constructors
```

Dart has no reliable built-in "no hardcoded UI string" lint. Instead, the
review checklist for any mobile PR after Phase 1 is: **does this PR add a
`Text('...')` with a literal?** If yes, it needs an ARB key. Cheap to
check, and CI-able later with a grep step if it starts slipping.

## 9. Testing

- `flutter test` with `AppLocalizations.delegate` in the widget-test
  harness, asserting a Phase 1 screen renders in all three locales.
- Manual: switch to `akl`, confirm no `MaterialLocalizations` exception —
  this is the failure mode §4.2 exists to prevent, so it must be checked
  by hand at least once.
- Layout: Tagalog runs roughly 15–25% longer than English. Check the SOS
  button, nav labels, and the delivery-state tile for overflow. The
  bottom nav is the most likely to break.

## 10. Deferred (not in this scope)

- **Backend-generated text.** `sea_condition.py` status labels,
  advisory categories, and the AI risk reasons in `ai/trip_profile.py`
  are English strings sent over the wire. Localizing them means either
  the backend returns a key instead of prose (a change to
  `docs/05_PUBLIC_API.md`) or the app maps known English strings back to
  keys. Prefer the former. MDRRMO free-text `reason` fields stay as typed
  — a human wrote them and we must not mangle them.
- **Dashboard** (`web/`) — responder-facing, English.
- **RTL** — not applicable to any target language.
