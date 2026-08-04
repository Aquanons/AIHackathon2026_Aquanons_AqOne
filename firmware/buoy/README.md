# Buoy firmware — Heltec WiFi LoRa 32 V3

`AqOneBuoy.ino` — one board doing phone WiFi, chat hub, and SOS gateway.

## Configure before flashing

Edit the block at the top of the sketch:

```cpp
AP_SSID      = "Aquan"            // OPEN network, no password
AP_PASSWORD  = nullptr            // nullptr = open
BUOY_ID      = "BUOY01"           // change per board: BUOY01, BUOY02, ...
UPLINK_SSID  = "CHANGE_ME"        // your hotspot / shore link
UPLINK_PASS  = "CHANGE_ME"
```

**Every buoy uses the same SSID `Aquan`.** Only `BUOY_ID` changes. A shared SSID
lets a phone roam between buoys automatically as the boat moves; `GET /v1/status`
reports which buoy you are actually on. Putting the buoy id in the SSID would
break roaming.

## Why the network is open

A person in distress cannot be asked for a WiFi password. This matches the
existing decision that fisherman identity is a device-local id with no login.

The trade-off is real and worth stating plainly if asked: anyone in range can
join and could send a spurious SOS. A dispatcher resolves that in seconds. The
opposite failure — a genuine SOS that never sends because someone did not know
the password — is not recoverable.

`BACKEND_HOST` is already set to the live Railway deployment.

## Arduino IDE setup

**Board:** Heltec WiFi LoRa 32(V3) — install "Heltec ESP32 Series Dev-boards"
via Boards Manager.

**Libraries** (Library Manager):

| Library | Author |
|---|---|
| `ArduinoJson` (v7+) | Benoit Blanchon |
| `WebSockets` | Markus Sattler |

`WiFi`, `WebServer`, `HTTPClient` and `Preferences` ship with the ESP32 core.

## What it exposes

**To phones on the AP (`192.168.4.1`):**

| Route | Purpose |
|---|---|
| `POST /v1/sos` | Accept an SOS. Replies immediately, delivers in the background. |
| `GET /v1/sos/status?vessel_id=` | The dispatcher's ETA once acknowledged. |
| `GET /v1/status` | Buoy health, queue depth, whether the uplink is alive. |
| `GET /history` | Chat backfill (unchanged). |
| `ws://192.168.4.1:81` | Chat WebSocket (unchanged protocol). |
| `GET /portal` | Captive-portal page showing whether the shore link is up. |
| `/generate_204`, `/ncsi.txt`, `/hotspot-detect.html` | OS connectivity probes. |

### The connectivity probes are not optional

Android, iOS and Windows all fetch a known URL right after joining a network to
decide whether it has real internet. If that probe fails, Android marks the
network "no internet" and will keep routing over mobile data — or leave the
network entirely for something better.

At sea that is fatal: the phone abandons the only network that can carry its
SOS. The sketch answers these probes with 204 / `Microsoft NCSI` when the uplink
is alive, and redirects to `/portal` when it is not, so the phone shows a sign-in
page instead of silently disconnecting.

A captive-portal DNS server also runs on port 53, resolving every hostname to
the buoy.

**To the backend:**

| Call | When |
|---|---|
| `POST /api/sos` | Every 5 s while the queue is non-empty |
| `GET /api/sos/vessel/{id}` | Every 15 s per tracked vessel |

## Test it in this order

**1. Backend path, no hardware.** Confirms the cloud half is alive:

```bash
curl -X POST https://incredible-liberation-production-aad7.up.railway.app/api/sos \
  -H "Content-Type: application/json" \
  -d '{"vessel_id":"TEST-01","client_ts":1754300000,"boat":"Test Banca",
       "source":"buoy","buoy_id":"BUOY01","seq":1}'
```

Should appear on the dashboard within 10 seconds.

**2. Flash the board.** Watch Serial at 115200. You want:

```
[wifi] uplink ok  ip=192.168.x.x  ch=6
[wifi] OPEN AP 'Aquan' up on 192.168.4.1 ch=6 max=10
[boot] ready. 0 SOS recovered from flash
```

Both must report the **same channel**. If they differ, the AP+STA setup failed.

**3. Join `Aquan` from a phone.** It should connect without a password and
*stay* connected — no "no internet" warning, no silent drop. Open a browser and
you should land on the AqOne portal page. If the phone keeps disconnecting, the
connectivity probes are not being answered; check Serial for requests to
`/generate_204`.

**4. Post an SOS from a laptop** joined to the AP — no phone app needed:

```bash
curl -X POST http://192.168.4.1/v1/sos \
  -H "Content-Type: application/json" \
  -d '{"vessel_id":"BANCA-7","client_ts":1754300500,"boat":"Maria Gracia",
       "lat":11.6839,"lon":122.4471,"note":"engine dead"}'
```

Expect `{"accepted":true,...}` instantly, then within ~5 s on Serial:

```
[sos] queued BANCA-7 seq=1 depth=1
[sos] POST BANCA-7 -> 200
```

And a pulsing red marker on the dashboard.

**5. Acknowledge on the dashboard** with an ETA. Within ~15 s the buoy picks it
up and pushes it to connected phones.

**6. Pull the uplink** (turn the hotspot off), post an SOS, power-cycle the
board, restore the hotspot. The SOS should still be delivered — that's the
store-and-forward queue surviving a brown-out, which is the whole point.

## Known limitations — do not overstate these

**TLS certificates are not verified.** `client.setInsecure()` skips validation.
Acceptable for a hackathon demo; a production buoy needs a pinned CA. Say so if
asked rather than letting it be discovered.

**No LoRa yet.** This sketch is the single-buoy gateway path: phone → buoy →
internet → backend. Multi-hop LoRa relay per `docs/02_LOAM_PACKET_SPEC.md` is
the next step and is not implemented here. A buoy with no internet uplink cannot
currently forward to a neighbour — it queues until its own uplink returns.

**One WiFi radio.** AP and station share a channel. Joining the uplink can
briefly drop connected phones. Bring the uplink up before fishers connect.

**Queue holds 12 SOS.** Beyond that `POST /v1/sos` returns 503. Raise `MAX_QUEUE`
if you expect more, watching NVS size.
