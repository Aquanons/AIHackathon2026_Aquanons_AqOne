# Buoy sketch

`AqOneBuoy/AqOneBuoy.ino` — the board that floats.

WiFi access point for phones, plus LoRa. **No internet of its own**: an SOS goes
onto the radio and sits in flash until the shore acknowledges it. Also relays
other buoys' frames.

Its partner is [`../shore/AqOneShore`](../shore/AqOneShore).

Three files, all part of the sketch:

| File | |
|---|---|
| `AqOneBuoy.ino` | Everything buoy-specific. Set `AQONE_NODE_ID` / `AQONE_NODE_NAME` at the top, one per board. |
| `AqOneLoam.h` | The shared radio layer. **Must stay byte-identical to the shore's copy** — `diff` them after any edit. |
| `build_opt.h` | One compiler flag. Deleting it silently caps chat at 5 boats instead of 10. |

Board setup, libraries, the radio protocol, what this exposes to phones, the
bring-up order and the honest limitations are all in
[`../README.md`](../README.md).
