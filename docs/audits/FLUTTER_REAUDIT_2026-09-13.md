# AqOne Flutter re-audit
Date: 13 September 2026.
Reviewed HEAD: `c2dd8021153cf58e3fc1a285c65c39ce26b67f88`.
Gemini's fix commit: `ddc9f72`; the Flutter tree is unchanged between that commit and this HEAD.

**Result: further fixes are needed.**
There are ten actionable findings below: seven reproduced with focused checks and three found by tracing the code.
Four are high priority (P1); six are medium priority (P2).
This audit includes existing defects outside the fishing-window feature, so it does not attribute all findings to Gemini.

## Verification and scope

- `flutter analyze --no-pub`: no issues.
- `flutter test --no-pub --reporter expanded`: all 235 existing tests passed.
- Seven additional audit regression checks: all seven failed on the expected behavior, reproducing findings R1 through R7.
- Database checks use the real SQLite schema in memory; two deliberately hold a save to reproduce a possible overlapping-write order.
- Startup uses the real root widget with a stalled secure-storage platform response.
- Source review covered startup, identity and credentials, SOS delivery and responder replies, catch persistence, weather parsing/calculation/cache/UI, chat, map feeds and tile storage, alarms, compass, checklist, localization, and dependency usage.
- No production code changed.
The temporary test file was removed from the repository, and a runnable copy is attached separately.
- No release APK, physical-phone, radio, or live deployment test was performed.
Passing desktop tests does not establish the end-to-end rescue path.

## Correctness findings

### R1. [P1] A stalled keystore blocks access to the app and SOS

Location: [main.dart:183](C:/Users/User/Desktop/PersonalProjects/00-HACKATHONS-COMPETITIONS/00-HACKATHONS/00-2026-FIRST-YEAR/2026-Aquanons/AIHackathon2026_Aquanons_AqOne/mobile/lib/main.dart:183) and [secure restore](C:/Users/User/Desktop/PersonalProjects/00-HACKATHONS-COMPETITIONS/00-HACKATHONS/00-2026-FIRST-YEAR/2026-Aquanons/AIHackathon2026_Aquanons_AqOne/mobile/lib/main.dart:212).

Startup chains `_restore()` behind `_restoreSecureState().whenComplete(...)`.
The secure-storage reads and writes have no time limit, so a platform call that never answers leaves `_loading` true indefinitely.
The identity restore and outbox retry timers never start.
This contradicts the intended availability behavior described beside the code.

**Reproduced:** inject an unresolved keystore response, pump the actual app, and advance simulated time by 30 seconds.
The launch spinner remains.

**Smallest repair:** bound the secure-state restore and reach the identity/SOS path in degraded mode when it times out.
Prevent late completion from silently changing the encryption key used by in-progress writes.

### R2. [P1] Acknowledged SOS records stop receiving updates and retrying replies

Location: [outbox_store.dart:53](C:/Users/User/Desktop/PersonalProjects/00-HACKATHONS-COMPETITIONS/00-HACKATHONS/00-2026-FIRST-YEAR/2026-Aquanons/AIHackathon2026_Aquanons_AqOne/mobile/lib/data/outbox_store.dart:53) and [replyToSos](C:/Users/User/Desktop/PersonalProjects/00-HACKATHONS-COMPETITIONS/00-HACKATHONS/00-2026-FIRST-YEAR/2026-Aquanons/AIHackathon2026_Aquanons_AqOne/mobile/lib/services/sos_service.dart:224).

`awaitingReconcile()` selects only relayed and delivered records.
Once an SOS becomes acknowledged, later responder ETA/status changes are never fetched for it.
A fisher's failed “still in danger” or “safe now” reply is saved locally, but the retry promised by the dialog never runs for the normal acknowledged case.

**Reproduced:** acknowledge an SOS with a remote ID, make its first reply return 503, then restore connectivity and reconcile twice.
There is still only one reply attempt.

**Smallest repair:** continue reconciling active acknowledged incidents and track pending replies independently from delivery state.
Stop only when closure or successful reply synchronization has actually been established.

### R3. [P1] Overlapping outbox saves can move a delivered SOS backwards

Location: [outbox_store.dart:87](C:/Users/User/Desktop/PersonalProjects/00-HACKATHONS-COMPETITIONS/00-HACKATHONS/00-2026-FIRST-YEAR/2026-Aquanons/AIHackathon2026_Aquanons_AqOne/mobile/lib/data/outbox_store.dart:87) and [save](C:/Users/User/Desktop/PersonalProjects/00-HACKATHONS-COMPETITIONS/00-HACKATHONS/00-2026-FIRST-YEAR/2026-Aquanons/AIHackathon2026_Aquanons_AqOne/mobile/lib/data/outbox_store.dart:68).

`advance()` reads a row, merges its state in Dart, then saves the entire earlier snapshot.
Another writer can update the row between those operations.
Immediate handoff, scheduled retry, reconciliation, failure recording, and note editing do not share one atomic write boundary.
Sequential writes inside one handoff do not prevent overlap with another operation.

**Reproduced:** pause a relayed-state save after its read, complete a delivered-state update, then release the earlier save.
The final database state is relayed.

**Smallest repair:** make state advancement atomic in the shared store, using a transaction or conditional update.
Patch only the fields each operation owns so stale failures or delivery updates cannot overwrite newer notes.

### R4. [P1] A later hourly hazard hides an earlier daily rain warning

Location: [fishing_window.dart:482](C:/Users/User/Desktop/PersonalProjects/00-HACKATHONS-COMPETITIONS/00-HACKATHONS/00-2026-FIRST-YEAR/2026-Aquanons/AIHackathon2026_Aquanons_AqOne/mobile/lib/services/fishing_window.dart:482).

The calculator returns as soon as it finds an hourly deterioration.
The future daily-rain restriction is checked only after that return.
A dangerous rain total for tomorrow can therefore be ignored when hourly gusts first cross a threshold the following day.

**Reproduced:** tomorrow has 60 mm of rain; hourly conditions remain low risk until caution gusts 48 hours from now.
The result offers a 48-hour countdown through tomorrow's rain warning.

**Smallest repair:** compare date-level restrictions before certifying the hourly window.
When the earlier adverse evidence has only a date, display that date and suppress the precise countdown.

### R5. [P2] Upload completion can erase a confirmed catch weight

Location: [catch_store.dart:108](C:/Users/User/Desktop/PersonalProjects/00-HACKATHONS-COMPETITIONS/00-HACKATHONS/00-2026-FIRST-YEAR/2026-Aquanons/AIHackathon2026_Aquanons_AqOne/mobile/lib/data/catch_store.dart:108) and [confirmWeight](C:/Users/User/Desktop/PersonalProjects/00-HACKATHONS-COMPETITIONS/00-HACKATHONS/00-2026-FIRST-YEAR/2026-Aquanons/AIHackathon2026_Aquanons_AqOne/mobile/lib/data/catch_store.dart:139).

`markSynced()` reads the catch and later writes the entire row.
The user can confirm its actual weight while that save is pending.
The upload completion then overwrites the newer weight and confirmation timestamp with the old null values.
The confirmation disappears from the queue as well as the stored record.

**Reproduced:** pause an upload-completion save, confirm 7 kg, then release the save.
The final quantity is null.

**Smallest repair:** update upload status/server ID separately from weight fields.
Apply the same atomic-write discipline to rejection and failure updates.

### R6. [P2] A temporary secure-storage read error destroys the existing encryption key

Location: [secure_credential_store.dart:124](C:/Users/User/Desktop/PersonalProjects/00-HACKATHONS-COMPETITIONS/00-HACKATHONS/00-2026-FIRST-YEAR/2026-Aquanons/AIHackathon2026_Aquanons_AqOne/mobile/lib/data/secure_credential_store.dart:124) and [new key write](C:/Users/User/Desktop/PersonalProjects/00-HACKATHONS-COMPETITIONS/00-HACKATHONS/00-2026-FIRST-YEAR/2026-Aquanons/AIHackathon2026_Aquanons_AqOne/mobile/lib/data/secure_credential_store.dart:142).

`_read()` converts both “missing key” and “read failed” into null.
`readOrCreateFieldKey()` then generates and writes a replacement in either case.
If the read fails transiently but the subsequent write succeeds, the still-valid old key is overwritten and existing encrypted profile fields become unrecoverable.

**Reproduced:** encrypt a skipper name, fail one platform read, allow the new key write, and decrypt with the stored key.
The name becomes an empty string.

**Smallest repair:** distinguish absence from read failure when handling the encryption key.
Create a key only after a successful read confirms that none exists.

### R7. [P2] An exact hour boundary can show green for an already hazardous interval

Location: [fishing_window.dart:344](C:/Users/User/Desktop/PersonalProjects/00-HACKATHONS-COMPETITIONS/00-HACKATHONS/00-2026-FIRST-YEAR/2026-Aquanons/AIHackathon2026_Aquanons_AqOne/mobile/lib/services/fishing_window.dart:344).

The current-hour search accepts the preceding interval ending exactly at `now` and breaks before inspecting the next interval starting at `now`.
With calm preceding gusts and hazardous gusts in the newly started interval, current risk remains safe and the hazard is classified as upcoming.
This is an exact-boundary defect, rather than a persistent all-hour failure.

**Reproduced:** calm sample at 08:00 and 60 km/h gust maximum for the interval 08:00 to 09:00, evaluated at 08:00.
Expected current danger; actual current risk is safe.

**Smallest repair:** define the atmospheric boundary consistently and include the interval that has just started.
Keep instantaneous wave timing separate.

### R8. [P2] A chat disconnect during queue flushing can discard unsent messages

Location: [chathubb.dart:517](C:/Users/User/Desktop/PersonalProjects/00-HACKATHONS-COMPETITIONS/00-HACKATHONS/00-2026-FIRST-YEAR/2026-Aquanons/AIHackathon2026_Aquanons_AqOne/mobile/lib/ui/chathubb.dart:517) and [_safeSend](C:/Users/User/Desktop/PersonalProjects/00-HACKATHONS-COMPETITIONS/00-HACKATHONS/00-2026-FIRST-YEAR/2026-Aquanons/AIHackathon2026_Aquanons_AqOne/mobile/lib/ui/chathubb.dart:594).

The flush copies the entire queue and clears it before sending.
It waits 80 ms between messages but never rechecks the connection.
If the socket closes during that interval, `_safeSend()` swallows the write failure, the remaining messages are marked handed to the hub, and an empty queue is persisted.
They are no longer retried on the hub path.

**Evidence:** source-traced control flow; not reproduced against a physical hub.
The independent cloud relay does not repair delivery to nearby boats when internet is unavailable.

**Smallest repair:** remove each queued message only after its socket write succeeds locally.
Stop the batch on disconnect or write failure and retain the remainder.
This does not require inventing a hub receipt that the protocol lacks.

### R9. [P2] Opening chat repeatedly leaks a periodic timer

Location: [chathubb.dart:723](C:/Users/User/Desktop/PersonalProjects/00-HACKATHONS-COMPETITIONS/00-HACKATHONS/00-2026-FIRST-YEAR/2026-Aquanons/AIHackathon2026_Aquanons_AqOne/mobile/lib/ui/chathubb.dart:723).

The chat page creates a five-second periodic timer without retaining it.
`dispose()` cannot cancel it.
The mounted check prevents further WiFi queries after the page closes, but the timer and its captured page state remain alive.
Every reopening adds another retained timer.

**Evidence:** source-traced lifecycle; no device memory measurement claimed.

**Smallest repair:** retain the timer and cancel it in the page's existing dispose method.
Add a widget lifecycle check that opens and closes chat without leaving pending timers.

### R10. [P2] Emergency and catch text bypasses the selected language

Locations: [SOS cancellation message](C:/Users/User/Desktop/PersonalProjects/00-HACKATHONS-COMPETITIONS/00-HACKATHONS/00-2026-FIRST-YEAR/2026-Aquanons/AIHackathon2026_Aquanons_AqOne/mobile/lib/ui/venture_page.dart:398), [responder delay message](C:/Users/User/Desktop/PersonalProjects/00-HACKATHONS-COMPETITIONS/00-HACKATHONS/00-2026-FIRST-YEAR/2026-Aquanons/AIHackathon2026_Aquanons_AqOne/mobile/lib/ui/widgets/responder_eta_dialog.dart:59), [catch confirmation](C:/Users/User/Desktop/PersonalProjects/00-HACKATHONS-COMPETITIONS/00-HACKATHONS/00-2026-FIRST-YEAR/2026-Aquanons/AIHackathon2026_Aquanons_AqOne/mobile/lib/ui/catch_history_page.dart:65), and [SyncState display labels](C:/Users/User/Desktop/PersonalProjects/00-HACKATHONS-COMPETITIONS/00-HACKATHONS/00-2026-FIRST-YEAR/2026-Aquanons/AIHackathon2026_Aquanons_AqOne/mobile/lib/models/catch_record.dart:10).

These user-facing strings are English literals or English enum fields.
Selecting Filipino or Aklanon cannot translate them.
This is a separate issue from intentionally untranslated ARB keys or translations awaiting native-speaker review.

**Evidence:** direct string-to-widget tracing.
Examples include SOS cancellation/setup feedback, the overdue-responder message, weight confirmation buttons, and catch upload state.

**Smallest repair:** use English ARB keys with descriptions and the existing localization access pattern.
Move SyncState display labels into a localization extension.
Keep the documented review process for safety-critical translations.

## Gemini fixes rechecked

The code and passing existing regression tests show improvements to official-warning precedence, missing-gust handling, negative-value validation, forecast timezone conversion, duplicate-hour severity merging, the wave sample exactly at now, forecast-coordinate display, and upcoming-risk display.
The no-hourly-crossing daily-rain case no longer invents a midnight onset.
R4 shows why that daily-rain repair remains incomplete when a later hourly crossing exists.
R7 adds coverage for the atmospheric boundary case.

The unused CommunitySpot model, legacy forecast-writing adapter, duplicate provider wrappers, and redundant result metadata from the previous complexity audit were removed.
The legacy fishing-spot queue is still actively drained by startup code, so deleting it wholesale would risk abandoning previously queued records.
Enrollment UI is explicitly deferred in the security plan; its absence is not counted here as a newly discovered regression.

## Handoff and regression checks

Start with R1 to R4, then fix R5 to R10 in their shared functions.
Preserve the existing offline behavior and localized delivery-state vocabulary.
No new dependency is needed for these repairs.

Runnable checks: [flutter_reaudit_probe_test.dart](C:/Users/User/.codex/visualizations/2026/09/13/01a0998f-bf1d-7e80-ad61-32af2ddaee15/flutter_reaudit_probe_test.dart).

Copy that file into `mobile/test/`, run `flutter test --no-pub test/flutter_reaudit_probe_test.dart`, and require all seven to pass after the fixes.
The probes test behavior, not a proposed implementation.
Then run the complete existing Flutter suite and analyzer.
Add a disconnect-during-flush check, a chat-page disposal check, and language checks for the affected UI strings.
Physical-phone and buoy verification remains a separate requirement.

## Ponytail complexity pass

Estimates below are approximate source-line reductions, separate from the correctness findings.
No dependency removal is justified by this review.

- shrink: Cut duplicated audio/vibration implementation in SquallAlarm, about 40 lines. Delegate output to the existing SosAlarm while retaining squall identity and acknowledgement state. [squall_alarm.dart](C:/Users/User/Desktop/PersonalProjects/00-HACKATHONS-COMPETITIONS/00-HACKATHONS/00-2026-FIRST-YEAR/2026-Aquanons/AIHackathon2026_Aquanons_AqOne/mobile/lib/services/squall_alarm.dart:58)
- delete: Cut unused TileCache.sizeInBytes and TileCache.clear, about 24 lines. Nothing replaces them; no production or test callers were found. [tile_cache.dart](C:/Users/User/Desktop/PersonalProjects/00-HACKATHONS-COMPETITIONS/00-HACKATHONS/00-2026-FIRST-YEAR/2026-Aquanons/AIHackathon2026_Aquanons_AqOne/mobile/lib/services/tile_cache.dart:142)
- shrink: Cut the second conservative hourly-merge implementation, about 20 lines. Reuse one existing model merge routine at both parser and calculator boundaries, preserving validation and duplicate-severity handling. [fishing_window.dart](C:/Users/User/Desktop/PersonalProjects/00-HACKATHONS-COMPETITIONS/00-HACKATHONS/00-2026-FIRST-YEAR/2026-Aquanons/AIHackathon2026_Aquanons_AqOne/mobile/lib/services/fishing_window.dart:260)
- shrink: Cut the duplicated wave-only onset predicate, about 12 lines. Calculate onset in one shared function used by both future-hazard branches. [fishing_window.dart](C:/Users/User/Desktop/PersonalProjects/00-HACKATHONS-COMPETITIONS/00-HACKATHONS/00-2026-FIRST-YEAR/2026-Aquanons/AIHackathon2026_Aquanons_AqOne/mobile/lib/services/fishing_window.dart:402)

net: -96 lines, -0 deps possible.

