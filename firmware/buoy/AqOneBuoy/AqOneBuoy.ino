// AqOneBuoy.ino — Heltec WiFi LoRa 32 V3 (ESP32-S3)
//
// ONE sketch, TWO roles. Flip NODE_ROLE below and flash the same file to both
// boards.
//
//   ROLE_BUOY   WiFi access point for phones + LoRa. NO internet of its own.
//               Accepts SOS and chat over WiFi, puts them on the radio, and
//               plays back whatever the mesh sends down.
//
//   ROLE_SHORE  LoRa + internet. NO access point. Hears the mesh, posts to the
//               backend, polls the backend, and sends the answers back down.
//
// The path the product actually claims:
//
//   phone --WiFi--> buoy --LoRa--> (relay buoys) --LoRa--> shore --HTTPS--> API
//   phone <--WiFi-- buoy <--LoRa-- (relay buoys) <--LoRa-- shore <--HTTPS-- API
//
// Every hop between the buoy and the shore is LoRa. A buoy has no WiFi station
// mode at all: if the radio is quiet, the SOS sits in flash until it is not.
//
// ---------------------------------------------------------------------------
// THE THREE THINGS THAT WILL BITE YOU
//
// 1. LORA_FREQ_MHZ must match the band your board and antenna were built for.
//    A 915 MHz whip fed 433 MHz radiates almost nothing and the link silently
//    does not exist. The repo docs disagree with each other here — 02_LOAM_
//    PACKET_SPEC.md says 433.0, 19_HELTEC_DATA_FLOW.md and the 16_QA BOM say
//    915 — so this is set to 915.0 to match the antennas that were actually
//    bought. Check the sticker on your board before you trust a range test.
//
// 2. Every node in one mesh must agree on frequency, SF, bandwidth, coding
//    rate, sync word AND the HMAC key. Any mismatch is indistinguishable from
//    "out of range" at the console. Change these in one place, for all boards.
//
// 3. The Heltec V3 needs setDio2AsRfSwitch(true) and a 1.8 V TCXO voltage
//    passed to begin(). Miss either and the radio initialises cleanly, reports
//    no error, and transmits nothing anyone can hear.
// ---------------------------------------------------------------------------

#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <WebSocketsServer.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <DNSServer.h>
#include <SPI.h>
#include <RadioLib.h>
#include <time.h>
#include <sys/time.h>
#include "mbedtls/md.h"

// Built-in 128x64 SSD1306 OLED on the Heltec WiFi LoRa 32 V3.
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

// ===== ROLE ================================================================

#define ROLE_BUOY  1
#define ROLE_SHORE 2

// >>> THE ONE LINE YOU CHANGE PER BOARD <<<
#ifndef NODE_ROLE
#define NODE_ROLE  ROLE_BUOY
#endif

#define IS_BUOY  (NODE_ROLE == ROLE_BUOY)
#define IS_SHORE (NODE_ROLE == ROLE_SHORE)

// ===== IDENTITY ============================================================

// NODE_ID is the on-air identity: SRC_ID in the LoAM frame, and `src_id` on the
// dashboard's mesh trail. It must be unique across the whole deployment — two
// nodes sharing an id make the seen-set drop one of them as a duplicate, which
// looks exactly like a dead radio.
#if IS_BUOY
static const char*    BUOY_ID = "BUOY01";       // BUOY01, BUOY02, ...
static const uint32_t NODE_ID = 0x00010001;     // 0x00010002 for BUOY02, ...
#else
static const char*    BUOY_ID = "SHORE01";
static const uint32_t NODE_ID = 0x000000FF;
#endif

// ===== RADIO — identical on every board ====================================

// 915.0 for the AS923/US915 Heltec V3 and the 915 MHz antennas in the BOM.
// 433.0 if you are on the 470-510 board with a 433 whip. See note 1 at the top.
static const float   LORA_FREQ_MHZ  = 915.0;

// SF10 per docs/33_LORA_RF_BUDGET.md, which supersedes the SF7 still written
// into docs/02_LOAM_PACKET_SPEC.md. SF7 reaches ~4.5 km over water, which
// forces buoy spacing tight enough that the deployment cost stops working;
// SF12 lands exactly on the 10.1 km horizon and costs 4x the airtime for it.
static const uint8_t LORA_SF        = 10;
static const float   LORA_BW_KHZ    = 125.0;
static const uint8_t LORA_CR        = 5;        // 4/5
static const uint8_t LORA_SYNC_WORD = 0x34;     // private network, not LoRaWAN
static const int8_t  LORA_TX_DBM    = 22;
static const uint16_t LORA_PREAMBLE = 8;
static const float   LORA_TCXO_V    = 1.8;      // Heltec V3. See note 3.

// Shared development key. docs/02_LOAM_PACKET_SPEC.md: development builds may
// share one key, production provisions per-device keys looked up by SRC_ID.
// Change it before anything leaves the bench — an unchanged key means anyone
// with this repo can inject a distress call into your mesh.
static const char* LOAM_KEY = "aqone-dev-key-change-me";

// Hop budget. 4 lets an edge buoy reach the shore through three relays, which
// is more than the 3-node build has. HOPS > 15 is dropped regardless.
static const uint8_t MESH_TTL = 4;

// ===== WIFI / BACKEND ======================================================

#if IS_BUOY
// OPEN network — no password, by design.
//
// A person in distress cannot be asked for a WiFi password. The same reasoning
// already governs fisherman identity in the app (device-local id, no login):
// anything standing between a drowning person and the SOS button is a
// liability, not a security feature.
//
// Every buoy advertises the SAME SSID, so a phone roams between them
// automatically as the boat moves — the way it would between office access
// points. Which buoy you are actually on comes from GET /v1/status. Do not
// encode the buoy id in the SSID or roaming breaks.
static const char* AP_SSID     = "Aquan";
static const char* AP_PASSWORD = nullptr;   // nullptr => open network

// A buoy no longer joins any upstream network, so nothing can push its AP onto
// a different channel mid-trip. Pick a channel and keep neighbouring buoys off
// it if you can; phones roam by SSID, not by channel.
static const int AP_CHANNEL = 6;

// An open AP is joinable by anyone in range, not just fishers. Accepted
// trade-off: the worst case is a spurious SOS, which a dispatcher can resolve
// in seconds. The alternative failure — a real SOS that never sends because
// someone forgot a password — is not recoverable.
static const int MAX_AP_CLIENTS = 10;

// The WebSockets library sizes its client table at compile time and defaults
// to 5 - half the AP's capacity. Boats 6 through 10 would associate, get the
// portal, and then silently never reach chat.
//
// It cannot be raised with a #define here: WebSocketsServer holds its client
// array by value in the header, so a value set only in this sketch would give
// the library's own .cpp a different object layout - corruption, not a bigger
// table. The flag has to reach every translation unit, which is what the
// build_opt.h beside this sketch does. If that file is not being picked up,
// this assert stops the build instead of letting a 5-boat cap ship quietly.
static_assert(
    WEBSOCKETS_SERVER_CLIENT_MAX >= MAX_AP_CLIENTS,
    "WEBSOCKETS_SERVER_CLIENT_MAX is below MAX_AP_CLIENTS. build_opt.h in this "
    "sketch folder sets it; see firmware/buoy/README.md if your IDE is not "
    "reading that file.");
#endif  // IS_BUOY

#if IS_SHORE
// The shore gateway's internet. On a real deployment this is the mast site's
// link; for a demo a phone hotspot is fine. No AP runs here — docs/19 option 1,
// "dedicate the gateway", which is also what sidesteps the one-radio channel
// collision entirely.
static const char* UPLINK_SSID = "Converge_2.4GHz_30D7";
static const char* UPLINK_PASS = "4eHfak6E";

static const char* BACKEND_HOST =
    "https://incredible-liberation-production-aad7.up.railway.app";

// Responder acknowledgements and ETAs come from GET /api/sos/active, which is
// behind require_user — unlike POST /api/sos, which is deliberately open.
// GET /api/sos/vessel/{id} is NOT usable here: it is behind
// require_vessel_device and derives ownership from the handset's own paired
// credential, which a gateway does not have and cannot obtain.
//
// Give the gateway either a long-lived token or an operator login. With
// neither, SOS still flows UP and chat still flows both ways — only the
// dispatcher's ETA cannot come back down, and GET /v1/status says so honestly
// rather than the app quietly waiting forever.
static const char* OPS_TOKEN    = "";   // paste a bearer token, or leave empty
static const char* OPS_EMAIL    = "";   // ...or log in with these instead
static const char* OPS_PASSWORD = "";
#endif  // IS_SHORE

// ===========================================================================

// ---------------------------------------------------------------------------
// Forward declarations — keep these
//
// Both the Arduino IDE and PlatformIO auto-generate a prototype for every
// function in a .ino and splice the whole block in ahead of the FIRST function
// definition in the file. That point is earlier than the structs those
// prototypes mention, so without these lines the generated block fails to
// compile with errors pointing at innocent lines ("'LoamFrame' does not name a
// type" against a comment). Reference and pointer parameters only need the name,
// which is why an incomplete type is enough here.
//
// Add a function that takes one of these and its type needs to be on this list.
// ---------------------------------------------------------------------------

struct LoamFrame;
struct SeenKey;
struct TxItem;
struct SosItem;
struct Tracked;
struct ChatLine;
struct VesselWatch;

Preferences prefs;

#if IS_BUOY
static const uint16_t HTTP_PORT = 80;
static const uint16_t WS_PORT   = 81;

WebServer        http(HTTP_PORT);
WebSocketsServer ws(WS_PORT);
DNSServer        dns;
#endif

// ---------------------------------------------------------------------------
// Clock
//
// A buoy has no internet and therefore no NTP. It learns the time from the
// shore instead: every frame the gateway sends carries `now`, and the first
// one that arrives sets this board's clock. Until then timestamps are omitted
// rather than invented — an uptime is not a timestamp.
// ---------------------------------------------------------------------------

// Any epoch after 2023 means a real clock reading, not a boot-time zero.
bool clockValid() { return time(nullptr) > 1700000000; }

void adoptClock(uint32_t epoch) {
  if (epoch < 1700000000UL || clockValid()) return;
  struct timeval tv = { .tv_sec = (time_t)epoch, .tv_usec = 0 };
  settimeofday(&tv, nullptr);
  Serial.printf("[time] clock adopted from mesh: %lu\n", (unsigned long)epoch);
}

String isoUtc(time_t at) {
  struct tm tm;
  gmtime_r(&at, &tm);
  char buf[24];
  strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", &tm);
  return String(buf);
}

// Days since the Unix epoch for a civil date. Howard Hinnant's algorithm.
// Needed because the ESP32's newlib has no timegm(), and mktime() would apply
// a local zone this board does not have.
static int32_t daysFromCivil(int32_t y, uint32_t m, uint32_t d) {
  y -= m <= 2;
  const int32_t  era = (y >= 0 ? y : y - 399) / 400;
  const uint32_t yoe = (uint32_t)(y - era * 400);
  const uint32_t doy = (153 * (m + (m > 2 ? -3 : 9)) + 2) / 5 + d - 1;
  const uint32_t doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
  return era * 146097 + (int32_t)doe - 719468;
}

// "2026-08-15T09:10:02+00:00" and "2026-08-15T09:12:44.120000+00:00" both
// parse; the scan stops at the seconds field either way. Returns 0 on garbage,
// which every caller treats as "absent" rather than 1970.
uint32_t iso8601ToEpoch(const char* s) {
  if (!s || !*s) return 0;
  int Y, M, D, h, mi, se;
  if (sscanf(s, "%d-%d-%dT%d:%d:%d", &Y, &M, &D, &h, &mi, &se) != 6) return 0;
  int32_t days = daysFromCivil(Y, (uint32_t)M, (uint32_t)D);
  if (days < 0) return 0;
  return (uint32_t)days * 86400UL + (uint32_t)h * 3600UL + (uint32_t)mi * 60UL + (uint32_t)se;
}

// ---------------------------------------------------------------------------
// LoAM frame — docs/02_LOAM_PACKET_SPEC.md
//
// | 0 |1| MAGIC 0xA5 | 1 |1| VERSION | 2 |1| TYPE | 3 |1| FLAGS |
// | 4 |4| SRC_ID | 8 |4| RELAY_ID | 12 |2| SEQ | 14 |4| TS |
// | 18 |1| TTL | 19 |1| HOPS | 20 |2| PAYLOAD_LEN | 22 |N| PAYLOAD |
// | 22+N |8| SIG |
//
// Big-endian throughout. Two deliberate deviations from the spec document,
// both recorded in firmware/buoy/README.md:
//
//   * PAYLOAD_LEN cap raised from 64 to 200 bytes. 64 cannot hold an SOS that
//     carries a 32-char vessel_id AND a boat name AND a note — and vessel_id
//     is half the backend's de-duplication key, so it cannot be dropped. The
//     field is already 2 bytes wide, so the wire layout is unchanged; only the
//     "drop if > 64" receive rule moves. Frames are still built smallest-first
//     and shed optional fields before they grow (see buildSosPayload).
//
//   * Two new TYPEs, 0x05 CHAT and 0x06 ETA. 0x05 for chat is what
//     docs/19_HELTEC_DATA_FLOW.md already reserves. 0x06 carries the
//     dispatcher's acknowledgement back down, which the original type list had
//     no frame for at all.
// ---------------------------------------------------------------------------

static const uint8_t LOAM_MAGIC   = 0xA5;
static const uint8_t LOAM_VERSION = 0x01;

static const uint8_t T_SOS    = 0x01;
static const uint8_t T_ACK    = 0x02;
static const uint8_t T_PING   = 0x03;
static const uint8_t T_STATUS = 0x04;
static const uint8_t T_CHAT   = 0x05;
static const uint8_t T_ETA    = 0x06;

static const uint8_t F_SIGNED    = 0x01;
static const uint8_t F_WANTS_ACK = 0x02;
static const uint8_t F_ACK       = 0x04;
static const uint8_t F_KNOWN     = 0x07;   // any other bit set => drop

static const size_t LOAM_HEADER      = 22;
static const size_t LOAM_SIG_LEN     = 8;
static const size_t LOAM_MAX_PAYLOAD = 200;
static const size_t LOAM_MAX_FRAME   = LOAM_HEADER + LOAM_MAX_PAYLOAD + LOAM_SIG_LEN;

struct LoamFrame {
  uint8_t  type;
  uint8_t  flags;
  uint32_t src;
  uint32_t relay;
  uint16_t seq;
  uint32_t ts;
  uint8_t  ttl;
  uint8_t  hops;
  char     payload[LOAM_MAX_PAYLOAD + 1];
  uint16_t len;
  float    rssi;
  float    snr;
};

static void put16(uint8_t* p, uint16_t v) { p[0] = v >> 8; p[1] = v; }
static void put32(uint8_t* p, uint32_t v) {
  p[0] = v >> 24; p[1] = v >> 16; p[2] = v >> 8; p[3] = v;
}
static uint16_t get16(const uint8_t* p) { return ((uint16_t)p[0] << 8) | p[1]; }
static uint32_t get32(const uint8_t* p) {
  return ((uint32_t)p[0] << 24) | ((uint32_t)p[1] << 16) |
         ((uint32_t)p[2] << 8)  | p[3];
}

// HMAC-SHA256 truncated to 8 bytes, over the frame with the two hop bytes
// zeroed so relays may mutate TTL/HOPS without invalidating the origin's
// signature: frame[0..17] ++ {0,0} ++ frame[20 .. 21+N].
// `out` is a plain pointer rather than uint8_t[LOAM_SIG_LEN] on purpose: the
// array bound decays anyway, and spelling a constant in the signature would put
// it inside the auto-generated prototype block that runs before the constant is
// declared. Callers pass a LOAM_SIG_LEN buffer.
static void loamSign(const uint8_t* frame, size_t payloadLen, uint8_t* out) {
  const mbedtls_md_info_t* info = mbedtls_md_info_from_type(MBEDTLS_MD_SHA256);
  mbedtls_md_context_t ctx;
  mbedtls_md_init(&ctx);
  mbedtls_md_setup(&ctx, info, 1);
  mbedtls_md_hmac_starts(&ctx, (const unsigned char*)LOAM_KEY, strlen(LOAM_KEY));

  static const uint8_t zeroHops[2] = { 0, 0 };
  mbedtls_md_hmac_update(&ctx, frame, 18);
  mbedtls_md_hmac_update(&ctx, zeroHops, 2);
  mbedtls_md_hmac_update(&ctx, frame + 20, 2 + payloadLen);

  uint8_t full[32];
  mbedtls_md_hmac_finish(&ctx, full);
  mbedtls_md_free(&ctx);
  memcpy(out, full, LOAM_SIG_LEN);
}

// Returns total byte count, or 0 if the payload does not fit.
static size_t loamEncode(uint8_t* buf, uint8_t type, uint8_t flags,
                         uint32_t src, uint32_t relay, uint16_t seq,
                         uint32_t ts, uint8_t ttl, uint8_t hops,
                         const char* payload, size_t payloadLen) {
  if (payloadLen > LOAM_MAX_PAYLOAD) return 0;

  buf[0] = LOAM_MAGIC;
  buf[1] = LOAM_VERSION;
  buf[2] = type;
  buf[3] = flags | F_SIGNED;
  put32(buf + 4, src);
  put32(buf + 8, relay);
  put16(buf + 12, seq);
  put32(buf + 14, ts);
  buf[18] = ttl;
  buf[19] = hops;
  put16(buf + 20, (uint16_t)payloadLen);
  if (payloadLen) memcpy(buf + LOAM_HEADER, payload, payloadLen);

  loamSign(buf, payloadLen, buf + LOAM_HEADER + payloadLen);
  return LOAM_HEADER + payloadLen + LOAM_SIG_LEN;
}

// Any frame that does not parse and verify is dropped. There is no negotiation
// and no partial acceptance: a malformed distress frame is worse than a missing
// one, because it would be shown to a dispatcher as fact.
static bool loamDecode(const uint8_t* buf, size_t total, LoamFrame& out) {
  if (total < LOAM_HEADER + LOAM_SIG_LEN) return false;
  if (buf[0] != LOAM_MAGIC || buf[1] != LOAM_VERSION) return false;
  if (buf[3] & ~F_KNOWN) return false;

  uint16_t n = get16(buf + 20);
  if (n > LOAM_MAX_PAYLOAD) return false;
  if (total != LOAM_HEADER + n + LOAM_SIG_LEN) return false;

  uint8_t expect[LOAM_SIG_LEN];
  loamSign(buf, n, expect);
  if (memcmp(expect, buf + LOAM_HEADER + n, LOAM_SIG_LEN) != 0) return false;

  out.type  = buf[2];
  out.flags = buf[3];
  out.src   = get32(buf + 4);
  out.relay = get32(buf + 8);
  out.seq   = get16(buf + 12);
  out.ts    = get32(buf + 14);
  out.ttl   = buf[18];
  out.hops  = buf[19];
  out.len   = n;
  memcpy(out.payload, buf + LOAM_HEADER, n);
  out.payload[n] = 0;

  if (out.hops > 15) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Seen-set — the entire flood-control mechanism
//
// A TTL flood without this is a broadcast storm: three buoys in earshot of each
// other rebroadcast the same SOS until the band is unusable. 64 entries covers
// far more traffic than a 3-node mesh generates in the relevant window.
// ---------------------------------------------------------------------------

struct SeenKey { uint32_t src; uint16_t seq; uint8_t type; bool used; };

static const int SEEN_MAX = 64;
SeenKey seenRing[SEEN_MAX];
int     seenHead = 0;

bool seenBefore(uint32_t src, uint16_t seq, uint8_t type) {
  for (int i = 0; i < SEEN_MAX; i++)
    if (seenRing[i].used && seenRing[i].src == src &&
        seenRing[i].seq == seq && seenRing[i].type == type) return true;
  return false;
}

void seenRemember(uint32_t src, uint16_t seq, uint8_t type) {
  seenRing[seenHead] = { src, seq, type, true };
  seenHead = (seenHead + 1) % SEEN_MAX;
}

// ---------------------------------------------------------------------------
// Radio
// ---------------------------------------------------------------------------

// Heltec WiFi LoRa 32 V3 SX1262 wiring. Board traces, not preferences.
static const int LORA_NSS  = 8;
static const int LORA_DIO1 = 14;
static const int LORA_RST  = 12;
static const int LORA_BUSY = 13;
static const int LORA_SCK  = 9;
static const int LORA_MISO = 11;
static const int LORA_MOSI = 10;

SPIClass loraSpi(HSPI);
SX1262   radio = new Module(LORA_NSS, LORA_DIO1, LORA_RST, LORA_BUSY, loraSpi);

volatile bool radioIrq   = false;
bool          radioReady = false;
bool          radioSending = false;

void IRAM_ATTR onRadioIrq() { radioIrq = true; }

// Outbound frames wait here rather than going straight out. Two reasons:
// transmitting is half-duplex (anything arriving mid-TX is simply not heard),
// and a flood mesh where every node answers instantly collides with itself.
// Each item carries a `dueAt` so senders can jitter their own backoff.
struct TxItem {
  uint8_t  bytes[LOAM_MAX_FRAME];
  size_t   len;
  uint32_t dueAt;
  bool     used;
};

static const int TX_MAX = 10;
TxItem   txRing[TX_MAX];
uint32_t txBusyUntil = 0;

// Mesh sequence counter. Two bytes on the wire, so it wraps — that is fine,
// the seen-set window is far shorter than 65536 frames. Bumped by 100 and
// persisted once per boot so a brown-out mid-flood cannot reuse a sequence
// number that neighbours still have in their seen-set (which would make the
// first frames after recovery look like duplicates and vanish).
uint16_t meshSeq = 1;

void meshSeqInit() {
  prefs.begin("aqone", false);
  meshSeq = prefs.getUShort("mseq", 1) + 100;
  prefs.putUShort("mseq", meshSeq);
  prefs.end();
}

void meshSeqCheckpoint() {
  // Once every 64 frames, not every frame: NVS has finite write endurance and
  // the +100 boot jump already covers whatever is lost in between.
  if ((meshSeq & 0x3F) != 0) return;
  prefs.begin("aqone", false);
  prefs.putUShort("mseq", meshSeq);
  prefs.end();
}

bool txEnqueue(const uint8_t* bytes, size_t len, uint32_t delayMs = 0) {
  for (int i = 0; i < TX_MAX; i++) {
    if (txRing[i].used) continue;
    memcpy(txRing[i].bytes, bytes, len);
    txRing[i].len   = len;
    txRing[i].dueAt = millis() + delayMs;
    txRing[i].used  = true;
    return true;
  }
  Serial.println("[lora] TX ring full - frame dropped");
  return false;
}

// Build, sign and enqueue an origin frame from this node.
bool meshSend(uint8_t type, uint8_t flags, const char* payload, size_t len,
              uint32_t delayMs = 0) {
  uint8_t buf[LOAM_MAX_FRAME];
  uint32_t ts = clockValid() ? (uint32_t)time(nullptr) : 0;
  uint16_t seq = meshSeq++;
  meshSeqCheckpoint();

  size_t total = loamEncode(buf, type, flags, NODE_ID, NODE_ID, seq, ts,
                            MESH_TTL, 0, payload, len);
  if (!total) {
    Serial.printf("[lora] payload too large for type 0x%02X (%u bytes)\n",
                  type, (unsigned)len);
    return false;
  }
  // Remember our own frames so an echo relayed back by a neighbour is dropped
  // instead of being processed as new traffic.
  seenRemember(NODE_ID, seq, type);
  return txEnqueue(buf, total, delayMs);
}

// Re-transmit someone else's frame with the hop bytes advanced. The signature
// is NOT recomputed: relays do not re-sign, which is exactly why the hop bytes
// are excluded from the signed region.
void meshRelay(const uint8_t* raw, size_t total, const LoamFrame& f) {
  if (f.ttl == 0) return;
  uint8_t buf[LOAM_MAX_FRAME];
  memcpy(buf, raw, total);
  buf[18] = f.ttl - 1;
  buf[19] = f.hops + 1;
  put32(buf + 8, NODE_ID);   // RELAY_ID, outside the signed region

  // Random backoff. Without it, two relays that heard the same frame answer in
  // the same millisecond and cancel each other at every listener.
  txEnqueue(buf, total, 200 + random(400));
}

bool radioSetup() {
  loraSpi.begin(LORA_SCK, LORA_MISO, LORA_MOSI, LORA_NSS);

  int st = radio.begin(LORA_FREQ_MHZ, LORA_BW_KHZ, LORA_SF, LORA_CR,
                       LORA_SYNC_WORD, LORA_TX_DBM, LORA_PREAMBLE,
                       LORA_TCXO_V, false);
  if (st != RADIOLIB_ERR_NONE) {
    Serial.printf("[lora] begin failed: %d\n", st);
    return false;
  }

  // Both of these are V3-specific and both fail silently if omitted. See the
  // third note at the top of this file.
  radio.setDio2AsRfSwitch(true);
  radio.setCRC(2);

  radio.setDio1Action(onRadioIrq);
  st = radio.startReceive();
  if (st != RADIOLIB_ERR_NONE) {
    Serial.printf("[lora] startReceive failed: %d\n", st);
    return false;
  }

  Serial.printf("[lora] up  %.1f MHz  SF%u  BW%.0f  CR4/%u  id=0x%08lX\n",
                LORA_FREQ_MHZ, LORA_SF, LORA_BW_KHZ, LORA_CR,
                (unsigned long)NODE_ID);
  return true;
}

void onMeshFrame(const uint8_t* raw, size_t total, const LoamFrame& f);  // fwd

void radioService() {
  if (!radioReady) return;

  if (radioIrq) {
    radioIrq = false;

    if (radioSending) {
      radio.finishTransmit();
      radioSending = false;
      radio.startReceive();
    } else {
      uint8_t buf[LOAM_MAX_FRAME];
      size_t  len = radio.getPacketLength();
      if (len > 0 && len <= sizeof(buf) && radio.readData(buf, len) == RADIOLIB_ERR_NONE) {
        LoamFrame f;
        if (loamDecode(buf, len, f)) {
          f.rssi = radio.getRSSI();
          f.snr  = radio.getSNR();
          onMeshFrame(buf, len, f);
        }
      }
      radio.startReceive();
    }
  }

  if (radioSending) return;

  uint32_t now = millis();
  if ((int32_t)(now - txBusyUntil) < 0) return;

  for (int i = 0; i < TX_MAX; i++) {
    if (!txRing[i].used) continue;
    if ((int32_t)(now - txRing[i].dueAt) < 0) continue;

    int st = radio.startTransmit(txRing[i].bytes, txRing[i].len);
    if (st == RADIOLIB_ERR_NONE) {
      radioSending = true;
      // Airtime at SF10/125 kHz is roughly 1 s for a full frame. Holding the
      // radio for a beat afterwards keeps a burst of queued frames from
      // stepping on each other and on anyone answering them.
      txBusyUntil = now + 400;
    } else {
      Serial.printf("[lora] startTransmit failed: %d\n", st);
    }
    txRing[i].used = false;
    return;   // one frame per pass; loop() stays responsive
  }
}

// ---------------------------------------------------------------------------
// Mesh liveness
//
// A buoy cannot see the internet, so "is the shore reachable" is inferred from
// whether the gateway has been heard lately. Anything the gateway sends counts:
// an ACK, an ETA, a downlinked chat line, or its periodic beacon.
// ---------------------------------------------------------------------------

static const uint32_t MESH_STALE_MS   = 150000;   // 2.5 beacon intervals
static const uint32_t BEACON_EVERY_MS = 60000;

uint32_t lastShoreHeard = 0;   // millis(), 0 = never
uint32_t lastMeshRx     = 0;
float    lastMeshRssi   = 0;
float    lastMeshSnr    = 0;

bool shoreSeen() { return lastShoreHeard != 0; }

bool meshUp() {
#if IS_SHORE
  return WiFi.status() == WL_CONNECTED;
#else
  return shoreSeen() && (millis() - lastShoreHeard) < MESH_STALE_MS;
#endif
}

// ---------------------------------------------------------------------------
// Store-and-forward queue
//
// An SOS accepted from a phone must survive a brown-out. Solar plus an 18650
// means this board WILL lose power mid-delivery, and an SOS held only in RAM
// dies silently. Queue entries live in NVS until the SHORE acknowledges them
// over LoRa — not until they are transmitted. A transmitted frame nobody heard
// is not a delivered frame, and the difference is the whole point of the queue.
// ---------------------------------------------------------------------------

static const int MAX_QUEUE = 12;

struct SosItem {
  char     vesselId[33];
  char     boat[33];
  char     note[65];
  char     trust[20];
  double   lat;
  double   lon;
  uint32_t clientTs;
  uint32_t seq;        // app-facing counter, shown to the fisher
  uint16_t meshSeq;    // frame SEQ of the last transmission, matched by ACK
  uint8_t  attempts;
  bool     hasFix;
  bool     used;
};

SosItem  queueBuf[MAX_QUEUE];
uint32_t nextSeq = 1;
uint32_t queueRetryAt[MAX_QUEUE];   // RAM only: a reboot retries immediately

void queueSave() {
  prefs.begin("aqone", false);
  prefs.putBytes("queue", queueBuf, sizeof(queueBuf));
  prefs.putUInt("seq", nextSeq);
  prefs.end();
}

void queueLoad() {
  prefs.begin("aqone", true);
  size_t n = prefs.getBytesLength("queue");
  // A size mismatch means the struct changed across a firmware update. Zeroing
  // is the only safe read — reinterpreting old bytes would produce a plausible
  // looking SOS with a corrupt vessel_id.
  if (n == sizeof(queueBuf)) prefs.getBytes("queue", queueBuf, sizeof(queueBuf));
  else memset(queueBuf, 0, sizeof(queueBuf));
  nextSeq = prefs.getUInt("seq", 1);
  prefs.end();
  memset(queueRetryAt, 0, sizeof(queueRetryAt));
}

int queueFreeSlot() {
  for (int i = 0; i < MAX_QUEUE; i++) if (!queueBuf[i].used) return i;
  return -1;
}

int queueDepth() {
  int n = 0;
  for (int i = 0; i < MAX_QUEUE; i++) if (queueBuf[i].used) n++;
  return n;
}

// ---------------------------------------------------------------------------
// Payload builders
//
// Every one of these degrades rather than fails. A frame that will not fit
// sheds its optional fields in order of how little the dispatcher needs them —
// note first, then the boat name — because a distress call with fields missing
// is still a rescue and a distress call that did not fit is not.
// ---------------------------------------------------------------------------

static const int RESPONDER_STATUS_MIN = 1;
static const int RESPONDER_STATUS_MAX = 5;

// Mirrors RESPONDER_STATUS_LABELS in backend/app/api/sos.py. Kept here rather
// than sent over the air: the label is up to 24 bytes of airtime per frame to
// carry a value that is fully determined by a single integer. If the backend
// table changes, change this one too.
const char* responderLabel(int status) {
  switch (status) {
    case 1: return "MDRRMO has your call";
    case 2: return "Rescue boat on the way";
    case 3: return "Coast Guard notified";
    case 4: return "Nearby boats alerted";
    case 5: return "Delayed - still coming";
    default: return nullptr;
  }
}

size_t buildSosPayload(const SosItem& it, char* out, size_t cap) {
  for (int attempt = 0; attempt < 3; attempt++) {
    JsonDocument doc;
    doc["v"]    = 1;
    doc["kind"] = "sos";
    doc["vid"]  = it.vesselId;
    doc["ts"]   = it.clientTs;
    doc["bid"]  = BUOY_ID;
    if (it.trust[0]) doc["tt"] = it.trust;
    // Omit lat/lon entirely when there is no fix. Never send 0,0 — that is a
    // real location in the Gulf of Guinea and it would be plotted as one.
    if (it.hasFix) { doc["lat"] = it.lat; doc["lon"] = it.lon; }
    if (attempt < 2 && it.boat[0]) doc["boat"] = it.boat;
    if (attempt < 1 && it.note[0]) doc["n"] = it.note;

    size_t n = serializeJson(doc, out, cap);
    if (n > 0 && n <= LOAM_MAX_PAYLOAD) {
      if (attempt > 0)
        Serial.printf("[sos] %s trimmed to fit a frame (pass %d)\n",
                      it.vesselId, attempt);
      return n;
    }
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Responder acknowledgement cache — the return path
//
// The dispatcher acknowledges on the dashboard with an ETA. The backend turns
// that into an absolute eta_at. The shore gateway reads it and pushes an ETA
// frame onto the mesh; every buoy that hears it caches it, whether or not the
// SOS came through that particular buoy — a boat drifts, and the phone that
// needs the answer may well have roamed onto a different buoy by then.
//
// Fields are stored structurally and the JSON is rendered on request. The
// previous version cached the backend's response body in a fixed 320-byte
// buffer and could truncate it mid-JSON; mobile/lib/services/buoy_client.dart
// still carries a BuoyInvalidResponse path for exactly that. Nothing here can
// produce a truncated body any more, but keep that client-side guard: a buoy
// running older firmware still can.
// ---------------------------------------------------------------------------

static const int MAX_TRACKED = 8;

struct Tracked {
  char     vesselId[33];
  bool     used;

  bool     hasEta;
  int32_t  eventId;
  char     state[16];      // relayed | delivered | acknowledged
  int32_t  eventSeq;
  uint32_t clientTs;
  uint32_t ackedAt;
  uint32_t etaAt;
  uint32_t resolvedAt;
  int8_t   responderStatus;
  char     ackedBy[24];
  char     note[49];
};

Tracked tracked[MAX_TRACKED];

Tracked* trackFind(const char* vesselId) {
  for (int i = 0; i < MAX_TRACKED; i++)
    if (tracked[i].used && strcmp(tracked[i].vesselId, vesselId) == 0)
      return &tracked[i];
  return nullptr;
}

Tracked* trackVessel(const char* vesselId) {
  Tracked* t = trackFind(vesselId);
  if (t) return t;
  for (int i = 0; i < MAX_TRACKED; i++) {
    if (tracked[i].used) continue;
    memset(&tracked[i], 0, sizeof(Tracked));
    strncpy(tracked[i].vesselId, vesselId, 32);
    tracked[i].responderStatus = -1;
    tracked[i].used = true;
    return &tracked[i];
  }
  return nullptr;
}

// ---------------------------------------------------------------------------
// Chat history
//
// A phone that joins mid-trip should see what was already said. The last
// MAX_HISTORY lines live in RAM only: chat is conversation, not distress
// traffic, and it is not worth the flash wear that the SOS queue earns. A
// reboot loses the backlog, and that is the right trade.
// ---------------------------------------------------------------------------

static const int MAX_HISTORY = 20;

struct ChatLine {
  char   from[33];
  char   text[65];
  time_t at;        // 0 when the buoy had no clock; see clockValid()
  bool   used;
};

ChatLine history[MAX_HISTORY];
int      historyHead = 0;   // next slot to write == oldest line once wrapped

void historyAdd(const char* from, const char* text) {
  ChatLine& line = history[historyHead];
  memset(&line, 0, sizeof(line));
  strncpy(line.from, from, sizeof(line.from) - 1);
  strncpy(line.text, text, sizeof(line.text) - 1);
  line.at   = clockValid() ? time(nullptr) : 0;
  line.used = true;
  historyHead = (historyHead + 1) % MAX_HISTORY;
}

size_t buildChatPayload(const char* from, const char* text, char* out, size_t cap) {
  JsonDocument doc;
  doc["v"]    = 1;
  doc["kind"] = "chat";
  doc["from"] = from;
  doc["text"] = text;
#if IS_SHORE
  if (clockValid()) doc["now"] = (uint32_t)time(nullptr);
#endif
  size_t n = serializeJson(doc, out, cap);
  return (n > 0 && n <= LOAM_MAX_PAYLOAD) ? n : 0;
}

// ===========================================================================
// BUOY ROLE
// ===========================================================================
#if IS_BUOY

// ---------------------------------------------------------------------------
// WiFi — access point only.
//
// The old build ran AP+STA and had to bring the station link up first so the AP
// would land on the same channel, kicking every connected phone when it did.
// With LoRa carrying the uplink there is no station link, so that entire
// failure mode is gone: the AP comes up on a fixed channel and stays there.
// ---------------------------------------------------------------------------

void setupWiFi() {
  WiFi.mode(WIFI_AP);

  // Open AP: passing nullptr as the password is what makes it open. The extra
  // args are (channel, hidden=0, maxConnections).
  WiFi.softAP(AP_SSID, AP_PASSWORD, AP_CHANNEL, 0, MAX_AP_CLIENTS);
  Serial.printf("[wifi] OPEN AP '%s' up on %s ch=%d max=%d\n",
                AP_SSID, WiFi.softAPIP().toString().c_str(),
                AP_CHANNEL, MAX_AP_CLIENTS);

  // Captive-portal DNS: every hostname resolves to the buoy. Without this,
  // phones that try to reach a name before we answer their connectivity probe
  // will fail and may drop the network.
  dns.start(53, "*", WiFi.softAPIP());
}

// ---------------------------------------------------------------------------
// SOS delivery over LoRa
//
// Retry until the shore acknowledges. Backoff widens so a buoy that is out of
// range of everything does not hold the channel, but it never gives up: docs/19
// is explicit that a queued distress frame retries until it is acknowledged or
// the board dies.
// ---------------------------------------------------------------------------

static const uint32_t SOS_RETRY_MS[] = { 8000, 15000, 30000, 60000, 120000 };
static const int      SOS_RETRY_STEPS = sizeof(SOS_RETRY_MS) / sizeof(SOS_RETRY_MS[0]);

void sosTransmit(int slot) {
  SosItem& it = queueBuf[slot];

  char payload[LOAM_MAX_PAYLOAD + 1];
  size_t n = buildSosPayload(it, payload, sizeof(payload));
  if (!n) {
    Serial.printf("[sos] %s cannot be encoded - dropping\n", it.vesselId);
    it.used = false;
    queueSave();
    return;
  }

  it.meshSeq = meshSeq;   // the SEQ meshSend is about to consume
  if (!meshSend(T_SOS, F_WANTS_ACK, payload, n)) {
    // The TX ring was full - transient, and not this SOS's fault. Come back
    // shortly without burning a retry step, or the backoff ladder would widen
    // for a reason that has nothing to do with whether anyone is listening.
    queueRetryAt[slot] = millis() + 2000;
    return;
  }

  if (it.attempts < 250) it.attempts++;
  int step = it.attempts - 1;
  if (step >= SOS_RETRY_STEPS) step = SOS_RETRY_STEPS - 1;
  if (step < 0) step = 0;
  queueRetryAt[slot] = millis() + SOS_RETRY_MS[step] + random(3000);

  Serial.printf("[sos] tx %s seq=%u frame=%u attempt=%u\n",
                it.vesselId, it.seq, it.meshSeq, it.attempts);
  queueSave();
}

void flushQueue() {
  uint32_t now = millis();
  for (int i = 0; i < MAX_QUEUE; i++) {
    if (!queueBuf[i].used) continue;
    if (queueRetryAt[i] && (int32_t)(now - queueRetryAt[i]) < 0) continue;
    sosTransmit(i);
    return;   // one distress frame per tick; the flood needs room to answer
  }
}

// ---------------------------------------------------------------------------
// HTTP routes served to phones on the AP
// ---------------------------------------------------------------------------

// POST /v1/sos — what the Flutter app calls over the buoy's WiFi.
// We answer immediately. Delivery to the mesh happens on the next tick.
// Blocking the reply on a LoRa round trip would leave a person in distress
// staring at a spinner for a second and a half.
void handlePostSos() {
  if (!http.hasArg("plain")) {
    http.send(400, "application/json", "{\"error\":\"empty body\"}");
    return;
  }

  JsonDocument in;
  if (deserializeJson(in, http.arg("plain"))) {
    http.send(400, "application/json", "{\"error\":\"bad json\"}");
    return;
  }

  const char* vesselId = in["vessel_id"] | "";
  uint32_t    clientTs = in["client_ts"] | 0;
  if (!vesselId[0] || clientTs == 0) {
    http.send(422, "application/json",
              "{\"error\":\"vessel_id and client_ts are required\"}");
    return;
  }

  // Same emergency handed to us twice - the app retrying, or the fisher
  // pressing again - is one queue entry, not two. (vessel_id, client_ts) is
  // the backend's de-duplication key; applying it here too saves the airtime.
  for (int i = 0; i < MAX_QUEUE; i++) {
    if (queueBuf[i].used && queueBuf[i].clientTs == clientTs &&
        strcmp(queueBuf[i].vesselId, vesselId) == 0) {
      JsonDocument dup;
      dup["accepted"]  = true;
      dup["buoy_id"]   = BUOY_ID;
      dup["src_id"]    = NODE_ID;
      dup["seq"]       = queueBuf[i].seq;
      dup["server_ts"] = clockValid() ? (uint32_t)time(nullptr)
                                      : (uint32_t)(millis() / 1000);
      String body;
      serializeJson(dup, body);
      http.send(200, "application/json", body);
      return;
    }
  }

  int slot = queueFreeSlot();
  if (slot < 0) {
    http.send(503, "application/json", "{\"error\":\"queue full\"}");
    return;
  }

  SosItem& it = queueBuf[slot];
  memset(&it, 0, sizeof(it));
  strncpy(it.vesselId, vesselId,                          32);
  strncpy(it.boat,     in["boat"] | "",                   32);
  strncpy(it.note,     in["note"] | "",                   64);
  strncpy(it.trust,    in["trust_tier"] | "self_declared", 19);
  it.clientTs = clientTs;
  it.seq      = nextSeq++;
  it.hasFix   = in["lat"].is<double>() && in["lon"].is<double>();
  if (it.hasFix) { it.lat = in["lat"]; it.lon = in["lon"]; }
  it.used = true;
  queueRetryAt[slot] = 0;
  queueSave();

  trackVessel(vesselId);

  JsonDocument out;
  out["accepted"]  = true;
  out["buoy_id"]   = BUOY_ID;
  out["src_id"]    = NODE_ID;
  out["seq"]       = it.seq;
  out["server_ts"] = clockValid() ? (uint32_t)time(nullptr)
                                  : (uint32_t)(millis() / 1000);
  String body;
  serializeJson(out, body);
  http.send(200, "application/json", body);

  Serial.printf("[sos] queued %s seq=%u depth=%d\n",
                vesselId, it.seq, queueDepth());

  // Straight onto the radio. The 5-second tick is the retry path, not the
  // first-attempt path — an SOS should not wait on a timer.
  sosTransmit(slot);
}

// GET /v1/sos/status?vessel_id=... — the ETA the dispatcher sent back.
//
// Shape matches GET /api/sos/vessel/{id} exactly, because the app parses both
// with the same RemoteSos.fromJson. Reconstructed from the ETA frame's fields
// rather than proxied, since the full backend body does not fit in a LoRa
// packet and never will.
void handleGetSosStatus() {
  String vid = http.arg("vessel_id");

  JsonDocument doc;
  doc["vessel_id"] = vid;
  if (clockValid()) doc["server_time"] = isoUtc(time(nullptr));
  JsonArray events = doc["events"].to<JsonArray>();

  Tracked* t = trackFind(vid.c_str());
  if (t && t->hasEta) {
    JsonObject e = events.add<JsonObject>();
    e["id"]        = t->eventId;
    e["local_id"]  = nullptr;   // a LoRa frame has no room for a UUID
    if (t->eventSeq >= 0) e["seq"] = t->eventSeq;
    if (t->clientTs)      e["client_ts"] = t->clientTs;
    e["delivery_state"]   = t->state;
    // Explicit nulls, not omissions: RemoteSos.fromJson reads every one of
    // these keys, and an absent key and a null key must look the same to it.
    if (t->ackedAt)    e["acknowledged_at"] = isoUtc(t->ackedAt);
    else               e["acknowledged_at"] = nullptr;
    if (t->ackedBy[0]) e["acked_by"] = t->ackedBy;
    else               e["acked_by"] = nullptr;
    if (t->etaAt)      e["eta_at"] = isoUtc(t->etaAt);
    else               e["eta_at"] = nullptr;
    if (t->responderStatus >= RESPONDER_STATUS_MIN &&
        t->responderStatus <= RESPONDER_STATUS_MAX) {
      e["responder_status"]       = t->responderStatus;
      e["responder_status_label"] = responderLabel(t->responderStatus);
    } else {
      e["responder_status"]       = nullptr;
      e["responder_status_label"] = nullptr;
    }
    if (t->note[0])    e["responder_note"] = t->note;
    else               e["responder_note"] = nullptr;
    e["fisher_reply"]  = nullptr;   // the reply path is not on the mesh yet
    if (t->resolvedAt) e["resolved_at"] = isoUtc(t->resolvedAt);
    else               e["resolved_at"] = nullptr;
  }

  String body;
  serializeJson(doc, body);
  http.send(200, "application/json", body);
}

// GET /v1/status — buoy health, so the app can show "connected to BUOY01".
//
// `uplink` reports the MESH, not an internet connection this board does not
// have: true means a frame handed to this buoy has a live path to shore right
// now. That is the question the app's copy actually asks ("an SOS sent now will
// reach the rescue centre"), and docs/06_DELIVERY_STATES.md requires the buoy
// to report mesh ok/degraded rather than claiming anything was "sent".
void handleStatus() {
  JsonDocument doc;
  doc["buoy_id"]     = BUOY_ID;
  doc["role"]        = "buoy";
  doc["src_id"]      = NODE_ID;
  doc["uplink"]      = meshUp();
  doc["mesh"]        = meshUp() ? "ok" : "degraded";
  doc["queue_depth"] = queueDepth();
  doc["clients"]     = WiFi.softAPgetStationNum();
  doc["uptime_s"]    = millis() / 1000;
  doc["lora"]        = radioReady;
  doc["shore_seen"]  = shoreSeen();
  if (lastMeshRx) {
    doc["last_rx_age_s"] = (millis() - lastMeshRx) / 1000;
    doc["rssi"]          = lastMeshRssi;
    doc["snr"]           = lastMeshSnr;
  }
  String body;
  serializeJson(doc, body);
  http.send(200, "application/json", body);
}

// GET /history — the Flutter chat page backfills from here on connect.
//
// The shape is {"messages":[...]}, which is what the app parses.
//
// `time` is omitted rather than faked when the buoy has no clock. The app
// falls back to arrival time for those, which is honest: we genuinely do not
// know when the line was said, and stamping 1970 on it would sort the whole
// backlog out of the app's 24-hour retention window.
void handleHistory() {
  JsonDocument doc;
  JsonArray arr = doc["messages"].to<JsonArray>();
  for (int i = 0; i < MAX_HISTORY; i++) {
    const ChatLine& line = history[(historyHead + i) % MAX_HISTORY];
    if (!line.used) continue;
    JsonObject entry = arr.add<JsonObject>();
    entry["from"] = line.from;
    entry["text"] = line.text;
    if (line.at > 0) entry["time"] = isoUtc(line.at);
  }
  String body;
  serializeJson(doc, body);
  http.send(200, "application/json", body);
}

// ---------------------------------------------------------------------------
// Connectivity probes — the thing that makes or breaks an open network
//
// Android, iOS and Windows all fetch a known URL right after joining a WiFi
// network to decide whether it has real internet. If that probe fails, Android
// shows "no internet" and will happily keep routing traffic over mobile data —
// or drop the network entirely to reconnect to something better.
//
// For a buoy at sea that is fatal: the phone leaves the only network that can
// carry its SOS. Answering the probes correctly is not cosmetic.
//
// The probe answer is tied to the MESH, not to an IP route. This board does not
// route packets to the internet and never will, but it does carry a message to
// shore and back, which is what the probe is standing in for here. When the
// mesh is degraded we answer with a redirect instead, so the phone pops the
// captive-portal page — which states plainly what is and is not working —
// rather than silently leaving the network.
// ---------------------------------------------------------------------------

void handleGenerate204() {
  if (meshUp()) {
    http.send(204, "text/plain", "");
  } else {
    http.sendHeader("Location", "http://192.168.4.1/portal", true);
    http.send(302, "text/plain", "");
  }
}

void handleNcsi() {
  if (meshUp()) {
    // Windows compares this string byte-for-byte.
    http.send(200, "text/plain", "Microsoft NCSI");
  } else {
    http.sendHeader("Location", "http://192.168.4.1/portal", true);
    http.send(302, "text/plain", "");
  }
}

// The page a fisher sees if they open a browser on the buoy's network.
void handlePortal() {
  String page =
    "<!doctype html><meta name=viewport content='width=device-width,initial-scale=1'>"
    "<style>body{font-family:system-ui;background:#0b1220;color:#e2e8f0;"
    "margin:0;padding:28px;line-height:1.55}"
    "h1{font-size:20px;margin:0 0 4px}.b{font-size:13px;color:#94a3b8}"
    "     .s{margin-top:18px;padding:12px;border-radius:8px;"
    "background:rgba(34,197,94,.12);border:1px solid #22c55e}"
    ".w{margin-top:18px;padding:12px;border-radius:8px;"
    "background:rgba(245,158,11,.12);border:1px solid #f59e0b}</style>"
    "<h1>AqOne &mdash; " + String(BUOY_ID) + "</h1>"
    "<div class=b>You are connected to an AqOne safety buoy.</div>";

  page += meshUp()
    ? "<div class=s><b>Radio link to shore is up.</b><br>An SOS sent from the "
      "AqOne app will reach the rescue centre now.</div>"
    : "<div class=w><b>Radio link to shore is down.</b><br>You can still send "
      "an SOS &mdash; this buoy will hold it and keep retrying automatically "
      "until the link returns.</div>";

  page += "<div class=b style='margin-top:18px'>Open the AqOne app to send an "
          "SOS or message nearby boats.</div>";
  http.send(200, "text/html", page);
}

// ---------------------------------------------------------------------------
// Chat WebSocket — same message shapes the Flutter client already sends
// ---------------------------------------------------------------------------

// Sized to match MAX_AP_CLIENTS. WebSocketsServer indexes clients by `num`,
// so an undersized array here silently drops names off the roster for the
// last phones to join - which on an open network is exactly the boats that
// arrived most recently.
String clientNames[MAX_AP_CLIENTS];

void broadcastClients() {
  JsonDocument doc;
  doc["type"] = "clients";
  JsonArray list = doc["list"].to<JsonArray>();
  for (int i = 0; i < MAX_AP_CLIENTS; i++)
    if (clientNames[i].length()) list.add(clientNames[i]);
  String out;
  serializeJson(doc, out);
  ws.broadcastTXT(out);
}

// A line that arrived over the radio, shown to every phone on this buoy.
void chatDeliverLocal(const char* from, const char* text) {
  historyAdd(from, text);
  JsonDocument out;
  out["type"] = "msg";
  out["from"] = from;
  out["text"] = text;
  String s;
  serializeJson(out, s);
  ws.broadcastTXT(s);
}

void onWsEvent(uint8_t num, WStype_t type, uint8_t* payload, size_t len) {
  if (type == WStype_DISCONNECTED) {
    if (num < MAX_AP_CLIENTS) clientNames[num] = "";
    broadcastClients();
    return;
  }
  if (type != WStype_TEXT) return;

  JsonDocument in;
  if (deserializeJson(in, payload, len)) return;
  const char* kind = in["type"] | "";

  if (strcmp(kind, "hello") == 0) {
    if (num < MAX_AP_CLIENTS) clientNames[num] = String((const char*)(in["name"] | "?"));
    broadcastClients();
  } else if (strcmp(kind, "msg") == 0) {
    const char* from = in["from"] | "?";
    const char* text = in["text"] | "";
    if (!text[0]) return;

    historyAdd(from, text);

    JsonDocument out;
    out["type"] = "msg";
    out["from"] = from;
    out["text"] = text;
    String s;
    serializeJson(out, s);

    // Relay to everyone EXCEPT the phone that sent it. The app draws its own
    // message the instant the fisher hits send - it cannot wait for a round
    // trip through a buoy that may have no uplink - so broadcasting back to
    // the sender put every message on their screen twice, which reads as
    // having sent it twice. sendTXT to a slot with no client is a no-op.
    for (uint8_t i = 0; i < WEBSOCKETS_SERVER_CLIENT_MAX; i++) {
      if (i != num) ws.sendTXT(i, s);
    }

    // ...and onto the radio, so boats on other buoys and the shore database
    // see it too. Chat waits behind distress traffic by design: the delay is
    // enqueued, so a queued SOS frame goes out first.
    char frame[LOAM_MAX_PAYLOAD + 1];
    size_t n = buildChatPayload(from, text, frame, sizeof(frame));
    if (n) meshSend(T_CHAT, 0, frame, n, 300 + random(500));
  }
}

#endif  // IS_BUOY

// ===========================================================================
// SHORE ROLE
// ===========================================================================
#if IS_SHORE

bool   uplinkUp = false;
String opsToken;            // bearer for the acknowledgement poll
bool   opsTokenTried = false;
int    lastChatId = 0;      // since_id cursor into GET /api/mesh/chat
// The first poll after a boot only moves the cursor. Without this, a gateway
// that restarts asks for since_id=0, gets the last 50 lines of history back,
// and spends the next minute reading the whole backlog onto the radio - while
// a queued SOS waits behind it.
bool   chatPrimed = false;

void setupWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(UPLINK_SSID, UPLINK_PASS);
  Serial.print("[wifi] uplink");
  for (int i = 0; i < 30 && WiFi.status() != WL_CONNECTED; i++) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    uplinkUp = true;
    Serial.printf("[wifi] uplink ok  ip=%s\n", WiFi.localIP().toString().c_str());
    // UTC, no offset. The gateway's clock is the whole mesh's clock: every
    // frame it sends carries `now`, and that is how buoys with no internet
    // learn what time it is.
    configTime(0, 0, "pool.ntp.org", "time.nist.gov");
  } else {
    // Not fatal. LoRa still runs, frames are still received and acknowledged
    // at the mesh level - they simply cannot be forwarded until this returns.
    Serial.println("[wifi] no uplink - mesh traffic will be held");
  }
}

bool online() { return uplinkUp && WiFi.status() == WL_CONNECTED; }

// TLS certificates are not verified. There is no cert store on this board and
// no way to rotate one on a mast. Acceptable for a prototype; a production
// gateway pins a CA. Say so if asked rather than letting it be discovered.
bool httpsBegin(WiFiClientSecure& client, HTTPClient& https, const String& url) {
  client.setInsecure();
  return https.begin(client, url);
}

// POST /api/sos — deliberately unauthenticated. A gateway relaying a distress
// call has no bearer token and no way to obtain one.
//
// client_ts is forwarded EXACTLY as the phone sent it, carried untouched
// through the LoRa frame. It is half of the de-duplication key
// (vessel_id, client_ts). If we substituted our own clock, the same emergency
// arriving here AND over the fisher's own mobile data would create two separate
// incidents on the dispatcher's screen.
bool postSos(const JsonDocument& in, uint32_t srcId, uint16_t seq) {
  if (!online()) return false;

  const char* vid = in["vid"] | "";
  uint32_t    ts  = in["ts"]  | 0;
  if (!vid[0] || ts == 0) return false;

  WiFiClientSecure client;
  HTTPClient https;
  if (!httpsBegin(client, https, String(BACKEND_HOST) + "/api/sos")) return false;
  https.addHeader("Content-Type", "application/json");
  https.setTimeout(12000);

  JsonDocument doc;
  doc["vessel_id"]  = vid;
  doc["client_ts"]  = ts;
  doc["boat"]       = in["boat"] | "";
  doc["trust_tier"] = in["tt"] | "self_declared";
  doc["source"]     = "buoy";
  doc["buoy_id"]    = in["bid"] | BUOY_ID;
  doc["src_id"]     = srcId;
  doc["seq"]        = seq;
  if (in["n"].is<const char*>()) doc["note"] = in["n"];
  if (in["lat"].is<double>() && in["lon"].is<double>()) {
    doc["lat"] = in["lat"];
    doc["lon"] = in["lon"];
  }

  String body;
  serializeJson(doc, body);
  int code = https.POST(body);
  https.end();

  Serial.printf("[sos] POST %s -> %d\n", vid, code);
  // 200 covers both "created" and "already recorded". Either way the backend
  // has it and the buoy can stop retrying.
  return code == 200;
}

// Chat off the mesh goes into the database tagged `mesh`, and downlink skips
// anything carrying that tag. Without it, a line a fisher sent from a boat
// would be stored, read back on the next poll, and rebroadcast to the boat it
// came from — the message would arrive on its own sender's screen a second
// time, minutes later.
bool postChat(const char* sender, const char* text) {
  if (!online()) return false;

  WiFiClientSecure client;
  HTTPClient https;
  if (!httpsBegin(client, https, String(BACKEND_HOST) + "/api/mesh/chat")) return false;
  https.addHeader("Content-Type", "application/json");
  https.setTimeout(10000);

  JsonDocument doc;
  doc["sender"] = sender;
  doc["text"]   = text;
  doc["origin"] = "mesh";

  String body;
  serializeJson(doc, body);
  int code = https.POST(body);
  https.end();

  Serial.printf("[chat] POST %s -> %d\n", sender, code);
  return code == 201 || code == 200;
}

// Everything below needs an operator bearer. See the OPS_* block at the top for
// why the handset's own endpoint is not an option here.
bool opsLogin() {
  if (!online()) return false;
  if (!OPS_EMAIL[0] || !OPS_PASSWORD[0]) return false;

  WiFiClientSecure client;
  HTTPClient https;
  if (!httpsBegin(client, https, String(BACKEND_HOST) + "/api/auth/login")) return false;
  https.addHeader("Content-Type", "application/json");
  https.setTimeout(12000);

  JsonDocument doc;
  doc["email"]    = OPS_EMAIL;
  doc["password"] = OPS_PASSWORD;
  String body;
  serializeJson(doc, body);

  int code = https.POST(body);
  bool ok = false;
  if (code == 200) {
    JsonDocument out;
    if (!deserializeJson(out, https.getString())) {
      const char* token = out["token"] | "";
      if (token[0]) { opsToken = token; ok = true; }
    }
  }
  https.end();
  Serial.printf("[auth] login -> %d %s\n", code, ok ? "ok" : "no token");
  return ok;
}

bool opsAuthReady() {
  if (opsToken.length()) return true;
  if (OPS_TOKEN[0]) { opsToken = OPS_TOKEN; return true; }
  if (!opsTokenTried) { opsTokenTried = true; return opsLogin(); }
  return false;
}

// ---------------------------------------------------------------------------
// Vessels this gateway has heard from, and what it last told them.
//
// The signature is how a re-poll becomes a downlink only when something the
// fisher would actually see has changed. Without it the gateway would burn a
// second of airtime every 45 s repeating an ETA nobody's screen needs again.
// ---------------------------------------------------------------------------

static const int MAX_VESSELS = 12;

struct VesselWatch {
  char     vesselId[33];
  bool     used;
  uint32_t signature;
};

VesselWatch watched[MAX_VESSELS];

// Persisted, unlike most of this gateway's state. A shore reboot between an SOS
// and the dispatcher acknowledging it would otherwise lose the only record of
// which vessels this mesh can answer - and nothing would rebuild it, because
// the buoy stops retransmitting the moment it is acked. The fisher would sit at
// `relayed` forever while the dashboard showed the rescue under way.
void watchSave() {
  prefs.begin("aqone", false);
  prefs.putBytes("watch", watched, sizeof(watched));
  prefs.end();
}

void watchLoad() {
  prefs.begin("aqone", true);
  size_t n = prefs.getBytesLength("watch");
  if (n == sizeof(watched)) prefs.getBytes("watch", watched, sizeof(watched));
  else memset(watched, 0, sizeof(watched));
  prefs.end();
  // Signatures are deliberately NOT trusted across a reboot: re-sending one ETA
  // per open incident on the first poll is cheap, and silence is not.
  for (int i = 0; i < MAX_VESSELS; i++) watched[i].signature = 0;
}

void watchVessel(const char* vesselId) {
  for (int i = 0; i < MAX_VESSELS; i++)
    if (watched[i].used && strcmp(watched[i].vesselId, vesselId) == 0) return;
  for (int i = 0; i < MAX_VESSELS; i++) {
    if (watched[i].used) continue;
    memset(&watched[i], 0, sizeof(VesselWatch));
    strncpy(watched[i].vesselId, vesselId, 32);
    watched[i].used = true;
    watchSave();
    return;
  }
  // Full. Evict rather than refuse: the vessel that just sent a distress call
  // is the one with a rescue still in progress, and it is the one that needs
  // the dispatcher's answer routed back to it.
  memset(&watched[0], 0, sizeof(VesselWatch));
  strncpy(watched[0].vesselId, vesselId, 32);
  watched[0].used = true;
  watchSave();
}

VesselWatch* watchFind(const char* vesselId) {
  for (int i = 0; i < MAX_VESSELS; i++)
    if (watched[i].used && strcmp(watched[i].vesselId, vesselId) == 0)
      return &watched[i];
  return nullptr;
}

static uint32_t fnv1a(uint32_t h, const char* s) {
  if (!s) return h;
  while (*s) { h ^= (uint8_t)*s++; h *= 16777619UL; }
  return h;
}

size_t buildEtaPayload(const JsonObject& ev, const char* state, char* out, size_t cap) {
  for (int attempt = 0; attempt < 3; attempt++) {
    JsonDocument doc;
    doc["v"]    = 1;
    doc["kind"] = "eta";
    doc["vid"]  = ev["vessel_id"];
    doc["id"]   = ev["id"];
    doc["ds"]   = state;
    if (clockValid()) doc["now"] = (uint32_t)time(nullptr);
    if (ev["seq"].is<int>())            doc["sq"]  = ev["seq"];
    if (ev["client_ts"].is<uint32_t>()) doc["cts"] = ev["client_ts"];

    uint32_t ackAt = iso8601ToEpoch(ev["acknowledged_at"] | "");
    uint32_t etaAt = iso8601ToEpoch(ev["eta_at"] | "");
    uint32_t resAt = iso8601ToEpoch(ev["resolved_at"] | "");
    if (ackAt) doc["ack"] = ackAt;
    if (etaAt) doc["eta"] = etaAt;
    if (resAt) doc["res"] = resAt;
    if (ev["responder_status"].is<int>()) doc["rs"] = ev["responder_status"];

    // The dispatcher's name and free-text note are the first things to go when
    // the frame will not fit. Both are context; the ETA and the status code are
    // the message.
    if (attempt < 2) {
      const char* by = ev["acked_by"] | "";
      if (by[0]) doc["by"] = String(by).substring(0, 23);
    }
    if (attempt < 1) {
      const char* note = ev["responder_note"] | "";
      if (note[0]) doc["n"] = String(note).substring(0, 48);
    }

    size_t n = serializeJson(doc, out, cap);
    if (n > 0 && n <= LOAM_MAX_PAYLOAD) return n;
  }
  return 0;
}

// GET /api/sos/active in one call rather than per vessel: one request covers
// every incident, and it is the only acknowledgement view a gateway credential
// can actually read.
void pollAcks() {
  if (!online()) return;
  if (!opsAuthReady()) return;

  WiFiClientSecure client;
  HTTPClient https;
  if (!httpsBegin(client, https, String(BACKEND_HOST) + "/api/sos/active")) return;
  https.addHeader("Authorization", "Bearer " + opsToken);
  https.setTimeout(12000);

  int code = https.GET();
  if (code == 401 || code == 403) {
    // Expired. Drop it and let the next tick log in again.
    opsToken = "";
    opsTokenTried = false;
    https.end();
    Serial.println("[ack] token rejected - will re-login");
    return;
  }
  if (code != 200) { https.end(); return; }

  // Filtered parse straight off the socket. The unfiltered feed is up to 100
  // events wide with fields this gateway never reads, and materialising all of
  // it as a String first is the allocation that kills the board.
  JsonDocument filter;
  JsonObject f = filter["events"].add<JsonObject>();
  f["id"] = true; f["vessel_id"] = true; f["seq"] = true; f["client_ts"] = true;
  f["acknowledged_at"] = true; f["acked_by"] = true; f["eta_at"] = true;
  f["responder_status"] = true; f["responder_note"] = true;
  f["resolved_at"] = true;
  f["delivered_direct"] = true; f["delivered_via_buoy"] = true;

  JsonDocument doc;
  DeserializationError err =
      deserializeJson(doc, https.getStream(), DeserializationOption::Filter(filter));
  https.end();
  if (err) { Serial.printf("[ack] parse failed: %s\n", err.c_str()); return; }

  for (JsonObject ev : doc["events"].as<JsonArray>()) {
    const char* vid = ev["vessel_id"] | "";
    if (!vid[0]) continue;
    VesselWatch* w = watchFind(vid);
    if (!w) continue;   // never came through this mesh; nothing to send it to

    // Mirrors _delivery_state() in backend/app/api/sos.py. Recomputed here
    // because /active does not return the collapsed field that /vessel does.
    const char* state = "relayed";
    if (ev["resolved_at"].is<const char*>() || ev["acknowledged_at"].is<const char*>())
      state = "acknowledged";
    else if ((ev["delivered_direct"] | false) || (ev["delivered_via_buoy"] | false))
      state = "delivered";

    uint32_t sig = 2166136261UL;
    sig = fnv1a(sig, state);
    sig = fnv1a(sig, ev["acknowledged_at"] | "");
    sig = fnv1a(sig, ev["eta_at"] | "");
    sig = fnv1a(sig, ev["resolved_at"] | "");
    sig = fnv1a(sig, ev["responder_note"] | "");
    sig = fnv1a(sig, String((int)(ev["responder_status"] | 0)).c_str());
    if (sig == w->signature) continue;

    char payload[LOAM_MAX_PAYLOAD + 1];
    size_t n = buildEtaPayload(ev, state, payload, sizeof(payload));
    if (!n) continue;
    if (!meshSend(T_ETA, 0, payload, n)) continue;

    w->signature = sig;
    Serial.printf("[ack] downlink %s -> %s\n", vid, state);
  }
}

// GET /api/mesh/chat?since_id= — everything said on the dashboard or by a boat
// on some other hub, pushed down to the boats on this mesh.
void pollChat() {
  if (!online()) return;

  WiFiClientSecure client;
  HTTPClient https;
  String url = String(BACKEND_HOST) + "/api/mesh/chat?limit=10&since_id=" + String(lastChatId);
  if (!httpsBegin(client, https, url)) return;
  https.setTimeout(10000);

  if (https.GET() != 200) { https.end(); return; }

  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, https.getStream());
  https.end();
  if (err) return;

  bool priming = !chatPrimed;
  chatPrimed = true;

  for (JsonObject m : doc["messages"].as<JsonArray>()) {
    int id = m["id"] | 0;
    if (id > lastChatId) lastChatId = id;
    if (priming) continue;

    // Anything tagged `mesh` came up off the radio and is already on the
    // boats' screens. Sending it back down is an echo, not a delivery.
    const char* origin = m["origin"] | "app";
    if (strcmp(origin, "mesh") == 0) continue;

    const char* sender = m["sender"] | "shore";
    const char* text   = m["text"] | "";
    if (!text[0]) continue;

    char payload[LOAM_MAX_PAYLOAD + 1];
    // The database field is 256 chars; a buoy's history line is 64. Truncating
    // here rather than at the buoy keeps the airtime down and makes what the
    // fisher sees identical on every board.
    String clipped = String(text).substring(0, 64);
    size_t n = buildChatPayload(sender, clipped.c_str(), payload, sizeof(payload));
    if (n) meshSend(T_CHAT, 0, payload, n, random(400));
  }
}

// A heartbeat so buoys can tell "the shore is quiet" from "the shore is gone",
// and so a buoy that booted with no clock gets one without waiting for someone
// to send an SOS.
void sendBeacon() {
  JsonDocument doc;
  doc["v"] = 1;
  if (clockValid()) doc["now"] = (uint32_t)time(nullptr);
  doc["net"] = online();
  char payload[LOAM_MAX_PAYLOAD + 1];
  size_t n = serializeJson(doc, payload, sizeof(payload));
  if (n) meshSend(T_PING, 0, payload, n);
}

#endif  // IS_SHORE

// ===========================================================================
// Mesh receive — the one place inbound frames are interpreted
// ===========================================================================

void onMeshFrame(const uint8_t* raw, size_t total, const LoamFrame& f) {
  if (f.src == NODE_ID) return;   // our own frame, echoed by a relay

  lastMeshRx   = millis();
  lastMeshRssi = f.rssi;
  lastMeshSnr  = f.snr;

  bool dup = seenBefore(f.src, f.seq, f.type);
  if (!dup) seenRemember(f.src, f.seq, f.type);

  JsonDocument p;
  bool parsed = f.len && !deserializeJson(p, f.payload, f.len);

  // Any frame from the gateway is proof the path to shore is alive, duplicate
  // or not — a duplicate still travelled the whole way here.
#if IS_BUOY
  // Keyed on frame type rather than on a hard-coded gateway id: only the shore
  // originates these three, and a buoy that has to be told the gateway's id is
  // a buoy that stops working when the gateway is replaced.
  if (f.type == T_ACK || f.type == T_ETA || f.type == T_PING) lastShoreHeard = millis();
#endif
  if (parsed && p["now"].is<uint32_t>()) adoptClock(p["now"]);

  if (dup) return;   // seen it; relay already happened the first time

  Serial.printf("[lora] rx type=0x%02X src=0x%08lX seq=%u hops=%u rssi=%.0f\n",
                f.type, (unsigned long)f.src, f.seq, f.hops, f.rssi);

  switch (f.type) {

    case T_SOS: {
#if IS_SHORE
      if (!parsed) break;
      const char* vid = p["vid"] | "";
      if (!vid[0]) break;
      watchVessel(vid);
      if (postSos(p, f.src, f.seq)) {
        // Mesh-level ACK, addressed by (src, seq) exactly as the spec defines.
        // It is sent only after the backend has the SOS, so the buoy's queue
        // clears on delivery rather than on transmission.
        JsonDocument a;
        a["v"]   = 1;
        a["ok"]  = true;
        a["src"] = f.src;
        a["seq"] = f.seq;
        if (clockValid()) a["now"] = (uint32_t)time(nullptr);
        char payload[LOAM_MAX_PAYLOAD + 1];
        size_t n = serializeJson(a, payload, sizeof(payload));
        if (n) meshSend(T_ACK, F_ACK, payload, n, random(300));
      } else {
        // No ack. The originating buoy keeps the SOS and keeps retrying, which
        // is the correct outcome when this gateway has lost its own uplink.
        Serial.println("[sos] not delivered - withholding ack");
      }
#else
      // A buoy relays distress traffic for its neighbours. This is the whole
      // reason the mesh exists: the boat that can reach shore is rarely the
      // boat in trouble.
      meshRelay(raw, total, f);
#endif
      break;
    }

    case T_ACK: {
#if IS_BUOY
      if (!parsed) break;
      uint32_t ackSrc = p["src"] | 0;
      uint16_t ackSeq = (uint16_t)(p["seq"] | 0);
      bool ok = p["ok"] | false;

      if (ackSrc == NODE_ID && ok) {
        for (int i = 0; i < MAX_QUEUE; i++) {
          if (!queueBuf[i].used || queueBuf[i].meshSeq != ackSeq) continue;
          Serial.printf("[sos] delivered %s seq=%u after %u attempt(s)\n",
                        queueBuf[i].vesselId, queueBuf[i].seq, queueBuf[i].attempts);
          queueBuf[i].used = false;
          queueRetryAt[i]  = 0;
          queueSave();
          break;
        }
      } else {
        // Someone else's ack. Pass it along — the buoy it belongs to may be a
        // hop further out than the gateway can reach.
        meshRelay(raw, total, f);
      }
#endif
      break;
    }

    case T_ETA: {
#if IS_BUOY
      if (!parsed) break;
      const char* vid = p["vid"] | "";
      if (!vid[0]) break;

      // Cached even when this buoy never saw the original SOS. The boat may
      // have drifted onto a different buoy since it sent the call, and the
      // phone asks whichever buoy it is on now.
      Tracked* t = trackVessel(vid);
      if (t) {
        t->hasEta   = true;
        t->eventId  = p["id"] | 0;
        strncpy(t->state, p["ds"] | "delivered", sizeof(t->state) - 1);
        t->state[sizeof(t->state) - 1] = 0;
        t->eventSeq        = p["sq"].is<int>() ? (int32_t)p["sq"] : -1;
        t->clientTs        = p["cts"] | 0;
        t->ackedAt         = p["ack"] | 0;
        t->etaAt           = p["eta"] | 0;
        t->resolvedAt      = p["res"] | 0;
        t->responderStatus = p["rs"].is<int>() ? (int8_t)(int)p["rs"] : -1;
        strncpy(t->ackedBy, p["by"] | "", sizeof(t->ackedBy) - 1);
        t->ackedBy[sizeof(t->ackedBy) - 1] = 0;
        strncpy(t->note, p["n"] | "", sizeof(t->note) - 1);
        t->note[sizeof(t->note) - 1] = 0;

        // Push it straight to connected phones too, so an acknowledgement lands
        // without the app having to poll us. A fisher waiting on a rescue
        // should not depend on a refresh interval.
        JsonDocument ev;
        ev["type"]      = "sos_update";
        ev["vessel_id"] = vid;
        JsonObject d = ev["data"].to<JsonObject>();
        d["delivery_state"] = t->state;
        if (t->etaAt)   d["eta_at"]          = isoUtc(t->etaAt);
        if (t->ackedAt) d["acknowledged_at"] = isoUtc(t->ackedAt);
        if (t->ackedBy[0]) d["acked_by"] = t->ackedBy;
        if (t->responderStatus >= RESPONDER_STATUS_MIN &&
            t->responderStatus <= RESPONDER_STATUS_MAX) {
          d["responder_status"]       = t->responderStatus;
          d["responder_status_label"] = responderLabel(t->responderStatus);
        }
        if (t->note[0]) d["responder_note"] = t->note;
        String out;
        serializeJson(ev, out);
        ws.broadcastTXT(out);
      }
      meshRelay(raw, total, f);   // other buoys need it too
#endif
      break;
    }

    case T_CHAT: {
      if (!parsed) break;
      const char* from = p["from"] | "?";
      const char* text = p["text"] | "";
      if (!text[0]) break;
#if IS_BUOY
      chatDeliverLocal(from, text);
      meshRelay(raw, total, f);
#else
      postChat(from, text);
#endif
      break;
    }

    case T_PING:
    case T_STATUS:
#if IS_BUOY
      // Nothing to act on, but neighbours further out still benefit from
      // knowing the gateway is alive.
      meshRelay(raw, total, f);
#endif
      break;

    default:
      break;   // unknown type: dropped, not forwarded
  }
}

// ---------------------------------------------------------------------------
// Onboard OLED
//
// Heltec WiFi LoRa 32 V3 pinout. These are board wiring, not preferences - the
// panel is soldered to these pins and will stay dark on any others.
// ---------------------------------------------------------------------------

static const int  OLED_SDA  = 17;
static const int  OLED_SCL  = 18;
static const int  OLED_RST  = 21;

// V3 routes the OLED through the Vext switch, which is ACTIVE LOW. Miss this
// and begin() fails with correct wiring, because the panel has no power yet.
static const int  VEXT_CTRL = 36;

static const uint8_t OLED_ADDR = 0x3C;
static const int  OLED_W = 128;
static const int  OLED_H = 64;

Adafruit_SSD1306 oled(OLED_W, OLED_H, &Wire, OLED_RST);

// Set only if begin() succeeded. Every draw checks it, so a dead or absent
// panel costs one boolean per frame and never blocks SOS handling.
bool oledReady = false;

void oledSetup() {
  pinMode(VEXT_CTRL, OUTPUT);
  digitalWrite(VEXT_CTRL, LOW);   // active low: power the panel
  delay(50);                      // let the rail settle before I2C

  Wire.begin(OLED_SDA, OLED_SCL);
  oledReady = oled.begin(SSD1306_SWITCHCAPVCC, OLED_ADDR);
  if (!oledReady) {
    Serial.println("[oled] not found at 0x3C - continuing without display");
    return;
  }
  oled.clearDisplay();
  oled.setTextSize(1);
  oled.setTextColor(SSD1306_WHITE);
  oled.setCursor(0, 0);
  oled.print(F("AqOne booting..."));
  oled.display();
}

#if IS_BUOY
// Phones joined to the AP. Not the same as chat clients: a handset can be on
// the WiFi without having opened the chat page, which is worth seeing.
int apClientCount() { return WiFi.softAPgetStationNum(); }

// Chat clients that sent a "hello" and are still connected.
int chatClientCount() {
  int n = 0;
  for (int i = 0; i < MAX_AP_CLIENTS; i++)
    if (clientNames[i].length()) n++;
  return n;
}
#endif

void oledDraw() {
  if (!oledReady) return;

  oled.clearDisplay();
  oled.setTextSize(1);
  oled.setTextColor(SSD1306_WHITE);

  oled.setCursor(0, 0);
  oled.print(F("AqOne "));
  oled.print(BUOY_ID);
  oled.drawFastHLine(0, 10, OLED_W, SSD1306_WHITE);

#if IS_BUOY
  oled.setCursor(0, 14);
  oled.print(F("Net  : "));
  oled.print(AP_SSID);

  oled.setCursor(0, 26);
  oled.print(F("Boats: "));
  oled.print(apClientCount());
  oled.print(F("  Chat:"));
  oled.print(chatClientCount());

  oled.setCursor(0, 38);
  oled.print(F("Queue: "));
  oled.print(queueDepth());
  if (lastMeshRx) {
    oled.print(F("  "));
    oled.print((int)lastMeshRssi);
    oled.print(F("dBm"));
  }

  oled.setCursor(0, 50);
  oled.print(F("Mesh : "));
  oled.print(radioReady ? (meshUp() ? F("to shore") : F("no shore")) : F("radio!"));
#else
  oled.setCursor(0, 14);
  oled.print(F("Role : shore gateway"));

  oled.setCursor(0, 26);
  oled.print(F("Net  : "));
  oled.print(online() ? F("online") : F("offline"));

  oled.setCursor(0, 38);
  oled.print(F("LoRa : "));
  if (lastMeshRx) {
    oled.print((int)lastMeshRssi);
    oled.print(F("dBm "));
    oled.print((millis() - lastMeshRx) / 1000);
    oled.print(F("s"));
  } else {
    oled.print(radioReady ? F("listening") : F("radio!"));
  }

  oled.setCursor(0, 50);
  oled.print(F("Ack  : "));
  oled.print(opsToken.length() ? F("armed") : F("no token"));
#endif

  // ":>" in the bottom-right corner. At text size 1 a glyph is 6x8, so two
  // characters start 12px in from the right edge and clear the text on that
  // line, which never reaches that far.
  oled.setCursor(OLED_W - 12, 50);
  oled.print(F(":>"));

  oled.display();
}

// ---------------------------------------------------------------------------

unsigned long lastDisplay = 0;
unsigned long lastFlush   = 0;
unsigned long lastPoll    = 0;
unsigned long lastChatPoll = 0;
unsigned long lastBeacon  = 0;

void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println("\n=== AqOne " + String(BUOY_ID) + " ===");

  oledSetup();
  queueLoad();
  meshSeqInit();
  memset(tracked, 0, sizeof(tracked));
  memset(seenRing, 0, sizeof(seenRing));
  memset(txRing, 0, sizeof(txRing));

  // Seeded off the MAC so two boards powered from the same switch do not pick
  // identical relay backoffs forever and collide on every single flood.
  randomSeed((uint32_t)ESP.getEfuseMac());

  setupWiFi();

  radioReady = radioSetup();
  if (!radioReady) {
    // Not fatal on a buoy: phones can still reach it, SOS still queues, and
    // the portal and /v1/status both report the mesh as down rather than
    // letting a fisher believe a dead radio is a working one.
    Serial.println("[lora] RADIO DOWN - mesh unavailable");
  }

#if IS_BUOY
  http.on("/v1/sos",        HTTP_POST, handlePostSos);
  http.on("/v1/sos/status", HTTP_GET,  handleGetSosStatus);
  http.on("/v1/status",     HTTP_GET,  handleStatus);
  http.on("/history",       HTTP_GET,  handleHistory);
  http.on("/portal",        HTTP_GET,  handlePortal);

  // Connectivity probes, per platform.
  http.on("/generate_204",             HTTP_GET, handleGenerate204);  // Android
  http.on("/gen_204",                  HTTP_GET, handleGenerate204);  // Android
  http.on("/hotspot-detect.html",      HTTP_GET, handlePortal);       // iOS/macOS
  http.on("/library/test/success.html",HTTP_GET, handlePortal);       // iOS
  http.on("/ncsi.txt",                 HTTP_GET, handleNcsi);         // Windows
  http.on("/connecttest.txt",          HTTP_GET, handleNcsi);         // Windows

  // Anything else on the AP lands on the portal rather than a bare 404.
  http.onNotFound(handlePortal);

  http.begin();

  ws.begin();
  ws.onEvent(onWsEvent);

  Serial.printf("[boot] buoy ready. %d SOS recovered from flash\n", queueDepth());
#else
  watchLoad();
  int open = 0;
  for (int i = 0; i < MAX_VESSELS; i++) if (watched[i].used) open++;
  Serial.printf("[boot] shore gateway ready. %d vessel(s) recovered from flash\n", open);
#endif
}

void loop() {
  radioService();

#if IS_BUOY
  dns.processNextRequest();   // captive portal
  http.handleClient();
  ws.loop();
#endif

  unsigned long now = millis();

  // 500ms is fast enough for a join to feel instant and slow enough that the
  // I2C write never competes with SOS handling or the chat socket.
  if (now - lastDisplay > 500) {
    lastDisplay = now;
    oledDraw();
  }

#if IS_BUOY
  // Retry sweep for anything still unacknowledged. First transmission already
  // happened inside handlePostSos(); this is only the retry ladder.
  if (now - lastFlush > 5000) {
    lastFlush = now;
    if (queueDepth() && radioReady) flushQueue();
  }
#endif

#if IS_SHORE
  if (now - lastBeacon > BEACON_EVERY_MS) {
    lastBeacon = now;
    if (radioReady) sendBeacon();
  }

  // 45 s: fast enough that a dispatcher's ETA reaches the boat while it still
  // means something, slow enough to stay well inside a sane request rate.
  if (now - lastPoll > 45000) {
    lastPoll = now;
    pollAcks();
  }

  if (now - lastChatPoll > 20000) {
    lastChatPoll = now;
    pollChat();
  }

  // Reconnect the uplink if it drops.
  if (WiFi.status() != WL_CONNECTED && now % 30000 < 50) {
    WiFi.begin(UPLINK_SSID, UPLINK_PASS);
  }
  if (WiFi.status() == WL_CONNECTED) uplinkUp = true;
#endif
}
