# 05 — FLUTTER (fisherman app)

Native Android. **Not** a PWA — a browser cannot join a WiFi AP, cannot speak
to an ESP32 SoftAP from an HTTPS page (mixed content), has no background
geolocation, and can have its offline storage evicted. Offline is this app's
primary operating state, which is native's home turf.

Read `01_CONTRACTS.md` first.

---

## Scope

**In:** login, SOS button, delivery-state display, offline outbox, buoy handoff.

**Out:** photos. Do not build it.

Catch logging was originally out-of-scope here too, but is back in scope -
see `docs/07_SCOPE_OUT.md`. (Weather, maps, advisories, settings and profile
are also listed as "out" above from this doc's original build-order phase and
are, in fact, built; this line was left stale by the same drift the scope-out
doc's amendment note warns about. Not corrected further here since it is
outside what was asked.)

---

## Layout

No file over ~400 lines. v1's `venture.dart` was 2,885 lines doing four jobs.

```
lib/
  main.dart
  config.dart
  models/       sos_message.dart, delivery_state.dart, session.dart
  api/          api_client.dart, auth_api.dart, sos_api.dart
  transport/    transport.dart, buoy_transport.dart, fake_transport.dart, online_transport.dart
  outbox/       outbox.dart, outbox_worker.dart
  screens/      login_screen.dart, sos_screen.dart
  widgets/      delivery_state_chip.dart, sos_button.dart
```

## Dependencies

```yaml
dependencies:
  flutter: { sdk: flutter }
  http: ^1.6.0
  sqflite: ^2.3.0          # durable outbox; NOT shared_preferences
  path: ^1.9.0
  geolocator: ^14.0.3
  ulid: ^2.0.0             # or generate manually, see below
  wifi_iot: ^0.3.19        # optional: programmatic SoftAP join
```

`sqflite` matters: the outbox must survive process death. An unsent SOS sitting
in memory is an unsent SOS.

---

## Delivery state — `models/delivery_state.dart`

```dart
/// See docs/01_CONTRACTS.md 1.3. Never conflate these.
enum DeliveryState {
  queuedLocal('queued_local', 'Saved on your phone'),
  receivedByBuoy('received_by_buoy', 'Received by buoy'),
  committed('committed', 'Received by AqOne'),
  acknowledged('acknowledged', 'MDRRMO has responded');

  const DeliveryState(this.wire, this.label);
  final String wire;
  final String label;

  static DeliveryState fromWire(String v) =>
      DeliveryState.values.firstWhere((e) => e.wire == v,
          orElse: () => DeliveryState.queuedLocal);
}
```

**`committed` must never be presented as "help is coming."** Only
`acknowledged` means a human responded. This is a safety property.

---

## Transport interface — `transport/transport.dart`

The one pattern from v1 that never produced a bug. Keep it.

```dart
enum HandoffResult { acceptedByBuoy, notInRange, failed }

abstract class MeshTransport {
  /// True when a buoy is reachable right now.
  Future<bool> isAvailable();

  /// Hand a signed 46-byte frame to a buoy.
  /// Returns acceptedByBuoy ONLY after the buoy confirms it queued the frame.
  Future<HandoffResult> send(Uint8List frame);

  String get name;
}
```

Implementations:
- `BuoyTransport` — real: joins/uses buoy WiFi, POSTs to
  `http://192.168.4.1:8080/tx`.
- `OnlineTransport` — internet available: `POST /api/sos`.
- `FakeTransport` — scripted, for testing and as a demo fallback. **Must be
  visibly labelled in the UI when active.** Never let a fake silently stand in
  for a real transport.

The app selects a transport; it never branches on "am I online" in UI code.

---

## Frame building — must match `01_CONTRACTS.md` §2 byte for byte

```dart
Uint8List buildSosFrame({
  required Uint8List deviceId,   // 6 bytes
  required Uint8List msgId,      // 16 bytes, ULID binary
  required DateTime ts,
  required double lat,
  required double lon,
  required int battery,          // 0-100, 255 unknown
  required Uint8List key,        // 32 bytes
  int ttl = 5,
}) {
  final b = ByteData(46);
  b.setUint8(0, 1);                                    // ver
  b.setUint8(1, 1);                                    // type = sos.manual
  b.setUint8(2, (0 & 0x03) | ((ttl & 0x07) << 2));     // priority 0
  final out = b.buffer.asUint8List();
  out.setRange(3, 9, deviceId);
  out.setRange(9, 25, msgId);
  b.setUint32(25, ts.toUtc().millisecondsSinceEpoch ~/ 1000, Endian.little);
  b.setInt32(29, (lat * 1e7).round(), Endian.little);
  b.setInt32(33, (lon * 1e7).round(), Endian.little);
  b.setUint8(37, battery);
  final mac = Hmac(sha256, key).convert(out.sublist(0, 38)).bytes;
  out.setRange(38, 46, mac.sublist(0, 8));
  return out;
}
```

Little-endian throughout. If the gateway rejects your signature, check
endianness first — it is almost always endianness.

---

## Outbox — `outbox/outbox.dart`

```sql
CREATE TABLE IF NOT EXISTS outbox (
  msg_id      TEXT PRIMARY KEY,
  frame       BLOB NOT NULL,
  state       TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  attempts    INTEGER NOT NULL DEFAULT 0,
  last_error  TEXT
);
```

Rules:
- Write to the outbox **before** attempting any send. Survive a crash mid-send.
- `msg_id` is generated once, at creation, and never regenerated on retry —
  that is what makes retries idempotent end to end.
- SOS rows are never deleted, only advanced in state.
- Worker retries with backoff: 2s, 4s, 8s, 16s, 32s, then every 60s.

---

## Screens

### Login
Username + password → `POST /api/login`. Store token and the **permissions
list** from the response. Never hardcode a role check — v1's client-side role
logic drifted from the server and hid a control from the only role allowed to
use it.

### SOS
- Large button, reachable one-handed, works with wet hands. Confirm dialog to
  prevent accidental sends.
- Fetch fresh GPS at press time (do not reuse a cached fix).
- On press: build frame → write to outbox (`queued_local`) → attempt handoff.
- Show a chip per state with the label from `DeliveryState`.
- Show which transport is active. If `FakeTransport`, say so on screen.

---

## Status polling — avoid v1's race

Once `committed`, poll `GET /api/sos/{id}/status`. **Capture the id before the
await and re-check it after** — v1 only checked for null, so an in-flight
response for SOS A could paint SOS B's status.

```dart
Future<void> refreshStatus() async {
  final requested = _activeSosId;
  if (requested == null || _inFlight) return;
  _inFlight = true;
  try {
    final res = await SosApi.status(requested);
    if (!mounted || _activeSosId != requested) return;   // stale, discard
    _apply(res);
  } finally {
    _inFlight = false;
  }
}
```

Stop polling when the screen is not visible, and when state reaches
`acknowledged`.

---

## API client

Coalescing key **must** include the token — v1 keyed only on the URL, so two
sessions could share one in-flight response across an auth boundary.

```dart
final key = '${token.hashCode}:${uri.toString()}';
```

Every response is `{ok, data}` (`01_CONTRACTS.md` §3.1). Read `body['data']`.
On `ok == false`, switch on `error.code`, never on `error.message`.

---

## Config

```dart
const kApiBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'https://<your-railway-app>.up.railway.app',
);
const kUseFakeTransport = bool.fromEnvironment('FAKE_TRANSPORT', defaultValue: false);
```

Build: `flutter build apk --release --dart-define=API_BASE_URL=https://...`

---

## Tests

```dart
test('frame is 46 bytes and matches the canonical vector', () { });
test('msg_id is stable across retries', () { });
test('outbox survives restart', () { });
test('stale status response for a previous SOS is discarded', () { });
```

Delete the `flutter create` counter template test. v1 left it in place, it
failed permanently, and it masked every real regression behind a red suite.

---

## Android

```xml
<uses-permission android:name="android.permission.INTERNET"/>
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION"/>
<uses-permission android:name="android.permission.ACCESS_WIFI_STATE"/>
<uses-permission android:name="android.permission.CHANGE_WIFI_STATE"/>
```

Talking to the buoy over plain HTTP on `192.168.4.1` needs a cleartext
exception **scoped to that address only** — never `cleartextTrafficPermitted`
globally.

```xml
<!-- res/xml/network_security_config.xml -->
<network-security-config>
  <domain-config cleartextTrafficPermitted="true">
    <domain includeSubdomains="false">192.168.4.1</domain>
  </domain-config>
</network-security-config>
```

**Network binding gotcha:** when joined to the buoy's AP there is no internet,
and Android may route sockets over cellular instead. Bind the socket to the
WiFi network explicitly (`bindProcessToNetwork`) or the handoff will silently
fail while appearing connected.
