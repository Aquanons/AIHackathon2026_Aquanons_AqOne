# mobile — AqOne fisherman app

Flutter app that hands an SOS to a nearby buoy over WiFi while the phone has no
cellular signal.

Contracts this app implements:

| Concern | Doc |
|---|---|
| Phone → buoy HTTP | `docs/03_PHONE_BUOY_WIFI.md` |
| Delivery states | `docs/06_DELIVERY_STATES.md` |
| Backend reconciliation | `docs/05_PUBLIC_API.md` |
| Visual system | `docs/design.md` |
| What is not built | `docs/07_SCOPE_OUT.md` |

`docs/guides/05_FLUTTER.md` describes a superseded design in which the phone
built and signed binary LoRa frames. Do not follow it — see
`docs/guides/README.md`.

## Setup

The platform folders are not committed. Generate them once, then fetch
packages:

```bash
cd mobile
flutter create --platforms=android --project-name aqone --org ph.aqone .
flutter pub get
```

`flutter create` may overwrite `lib/main.dart`. If it does:

```bash
git checkout -- lib/main.dart
```

## Run

```bash
# against a real buoy on its SoftAP
flutter run

# against a laptop mock of the buoy
flutter run --dart-define=BUOY_BASE_URL=http://192.168.1.50:8080

# release build for the demo
flutter build apk --release
```

Overridable at build time:

| Define | Default |
|---|---|
| `BUOY_BASE_URL` | `http://10.0.0.1` |
| `BACKEND_BASE_URL` | `https://incredible-liberation-production-aad7.up.railway.app` |

## Verify

```bash
flutter analyze
flutter test
```

## Android configuration

`flutter create` does not add these. Apply them after generating the platform
folders.

`android/app/src/main/AndroidManifest.xml`, inside `<manifest>`:

```xml
<uses-permission android:name="android.permission.INTERNET"/>
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION"/>
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION"/>
<uses-permission android:name="android.permission.ACCESS_WIFI_STATE"/>
<uses-permission android:name="android.permission.CHANGE_WIFI_STATE"/>
```

On the `<application>` tag:

```xml
android:networkSecurityConfig="@xml/network_security_config"
```

`android/app/src/main/res/xml/network_security_config.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <domain-config cleartextTrafficPermitted="true">
    <domain includeSubdomains="false">10.0.0.1</domain>
  </domain-config>
</network-security-config>
```

The cleartext exception is scoped to the buoy address only. The buoy hop is
plain HTTP by design (`docs/03_PHONE_BUOY_WIFI.md`); the backend hop stays
HTTPS.

## How it behaves

1. First launch asks for a boat name. A 32-character device-local `vessel_id`
   is generated and stored. There is no account and no password
   (`docs/07_SCOPE_OUT.md`).
2. Pressing SOS takes a GPS fix if one is available, writes the message to a
   SQLite outbox as `saved`, then tries to hand it to the buoy.
3. A `200` with `accepted: true` moves it to `relayed` and records
   `buoy_id`, `src_id` and `seq` from the ack.
4. A retry worker re-attempts anything still `saved` every 20 seconds.
5. When the phone has internet, a reconcile pass reads
   `GET /api/v1/vessels/{vessel_id}/sos` and matches rows by `seq` to advance
   to `delivered` or `acknowledged`.

State only ever moves forward. The app never displays a state it has not
observed — an SOS sitting at `relayed` in a dead zone is shown as exactly that.

## Known contract gap

`docs/03` defines the phone's `vessel_id` as a device-local id of up to 32
characters. `docs/05` describes the backend path parameter as a UUID. This app
generates a 32-character hex string, which fits both descriptions but is not
dash-formatted.

Reconciliation therefore depends on the backend accepting that id, or on the
gateway mapping it. Until that is confirmed with the backend and gateway
owners, reconciliation fails closed: a non-200 or unmatched row leaves the
local state untouched rather than guessing. `saved` and `relayed` are observed
locally and are unaffected.
