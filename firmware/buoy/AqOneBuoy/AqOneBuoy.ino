// AqOneBuoy.ino — Heltec WiFi LoRa 32 V3 (ESP32-S3)
//
// One buoy node doing three jobs:
//   1. WiFi access point for fishers' phones      (the "Aquan" network)
//   2. Chat hub between phones in range            (your existing chathub)
//   3. SOS gateway: phone -> buoy -> backend -> dashboard, and the
//      dispatcher's ETA back down to the phone
//
// The chat protocol is unchanged from the sketch mobile/lib/ui/chathubb.dart
// already speaks, so the existing Flutter chat page keeps working as-is.
//
// ---------------------------------------------------------------------------
// THE ONE THING THAT WILL BITE YOU
//
// The ESP32-S3 has a single WiFi radio. Access-point and station mode can run
// together, but they MUST share a channel. When this board joins the upstream
// hotspot, its own AP is forced onto that hotspot's channel — any phone already
// connected gets kicked and must rejoin.
//
// So: bring up the station link FIRST, read the channel it landed on, then
// start the AP on that same channel. That is what setupWiFi() below does, and
// it is why the order of those two calls is not arbitrary.
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
#include <time.h>

// ===== CONFIGURE ME ========================================================

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
static const char* AP_SSID      = "Aquan";
static const char* AP_PASSWORD  = nullptr;   // nullptr => open network
static const char* BUOY_ID      = "BUOY01";

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

// Upstream internet. On a real buoy this is the shore gateway link; for a demo
// a phone hotspot is fine.
static const char* UPLINK_SSID  = "Sams21_Hotel";
static const char* UPLINK_PASS  = "#Sams212024";

static const char* BACKEND_HOST =
    "https://incredible-liberation-production-aad7.up.railway.app";

// ===========================================================================

static const uint16_t HTTP_PORT = 80;
static const uint16_t WS_PORT   = 81;

WebServer        http(HTTP_PORT);
WebSocketsServer ws(WS_PORT);
Preferences      prefs;
DNSServer        dns;

// ---------------------------------------------------------------------------
// Store-and-forward queue
//
// An SOS accepted from a phone must survive a brown-out. Solar plus an 18650
// means this board WILL lose power mid-delivery, and an SOS held only in RAM
// dies silently. Queue entries live in NVS until the backend returns 200.
// ---------------------------------------------------------------------------

static const int MAX_QUEUE = 12;

struct SosItem {
  char     vesselId[33];
  char     boat[33];
  char     note[65];
  double   lat;
  double   lon;
  uint32_t clientTs;
  uint32_t seq;
  bool     hasFix;
  bool     used;
};

SosItem  queueBuf[MAX_QUEUE];
uint32_t nextSeq = 1;

void queueSave() {
  prefs.begin("aqone", false);
  prefs.putBytes("queue", queueBuf, sizeof(queueBuf));
  prefs.putUInt("seq", nextSeq);
  prefs.end();
}

void queueLoad() {
  prefs.begin("aqone", true);
  size_t n = prefs.getBytesLength("queue");
  if (n == sizeof(queueBuf)) prefs.getBytes("queue", queueBuf, sizeof(queueBuf));
  else memset(queueBuf, 0, sizeof(queueBuf));
  nextSeq = prefs.getUInt("seq", 1);
  prefs.end();
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
// WiFi — station first, then AP on the same channel. See the note at the top.
// ---------------------------------------------------------------------------

bool uplinkUp = false;

void setupWiFi() {
  WiFi.mode(WIFI_AP_STA);

  WiFi.begin(UPLINK_SSID, UPLINK_PASS);
  Serial.print("[wifi] uplink");
  for (int i = 0; i < 30 && WiFi.status() != WL_CONNECTED; i++) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();

  int channel = 1;
  if (WiFi.status() == WL_CONNECTED) {
    uplinkUp = true;
    channel  = WiFi.channel();
    Serial.printf("[wifi] uplink ok  ip=%s  ch=%d\n",
                  WiFi.localIP().toString().c_str(), channel);

    // UTC, no offset: the only consumer is the chat history timestamp, and
    // the app renders in the phone's own zone. Non-blocking - lines said
    // before this lands are stored with no time rather than a wrong one.
    configTime(0, 0, "pool.ntp.org", "time.nist.gov");
  } else {
    // No internet is not fatal. Chat still works, and SOS still queues — the
    // fisher is not told "failed", because the buoy genuinely still has it.
    Serial.println("[wifi] no uplink - running offline, SOS will queue");
  }

  // Open AP: passing nullptr as the password is what makes it open. The extra
  // args are (channel, hidden=0, maxConnections).
  WiFi.softAP(AP_SSID, AP_PASSWORD, channel, 0, MAX_AP_CLIENTS);
  Serial.printf("[wifi] OPEN AP '%s' up on %s ch=%d max=%d\n",
                AP_SSID, WiFi.softAPIP().toString().c_str(),
                channel, MAX_AP_CLIENTS);

  // Captive-portal DNS: every hostname resolves to the buoy. Without this,
  // phones that try to reach a name before we answer their connectivity probe
  // will fail and may drop the network.
  dns.start(53, "*", WiFi.softAPIP());
}

// ---------------------------------------------------------------------------
// Backend calls
// ---------------------------------------------------------------------------

// POST /api/sos — deliberately unauthenticated. A buoy relaying a distress
// call has no bearer token and no way to obtain one.
//
// client_ts is forwarded EXACTLY as the phone sent it. It is half of the
// de-duplication key (vessel_id, client_ts). If we substituted our own clock,
// the same emergency arriving here AND over the fisher's own mobile data would
// create two separate incidents on the dispatcher's screen.
bool postSos(const SosItem& item) {
  if (!uplinkUp || WiFi.status() != WL_CONNECTED) return false;

  WiFiClientSecure client;
  client.setInsecure();   // no cert store on the buoy; see the note below

  HTTPClient https;
  String url = String(BACKEND_HOST) + "/api/sos";
  if (!https.begin(client, url)) return false;
  https.addHeader("Content-Type", "application/json");
  https.setTimeout(12000);

  JsonDocument doc;
  doc["vessel_id"]  = item.vesselId;
  doc["client_ts"]  = item.clientTs;
  doc["boat"]       = item.boat;
  doc["trust_tier"] = "self_declared";
  doc["source"]     = "buoy";
  doc["buoy_id"]    = BUOY_ID;
  doc["seq"]        = item.seq;
  if (item.note[0]) doc["note"] = item.note;
  // Omit lat/lon entirely when there is no fix. Never send 0,0 — that is a
  // real location in the Gulf of Guinea and it would be plotted as one.
  if (item.hasFix) {
    doc["lat"] = item.lat;
    doc["lon"] = item.lon;
  }

  String body;
  serializeJson(doc, body);

  int code = https.POST(body);
  https.end();

  Serial.printf("[sos] POST %s -> %d\n", item.vesselId, code);
  // 200 covers both "created" and "already recorded". Either way the backend
  // has it and this buoy can stop retrying.
  return code == 200;
}

void flushQueue() {
  for (int i = 0; i < MAX_QUEUE; i++) {
    if (!queueBuf[i].used) continue;
    if (postSos(queueBuf[i])) {
      queueBuf[i].used = false;
      queueSave();
    } else {
      return;   // keep order; retry on the next tick
    }
  }
}

// ---------------------------------------------------------------------------
// ETA cache — the return path
//
// The dispatcher acknowledges on the dashboard with an ETA. The backend turns
// that into an absolute eta_at. The phone cannot reach the internet itself, so
// this buoy polls on its behalf and serves the answer over the local AP.
//
// We poll only for vessels that have actually sent an SOS through this buoy.
// ---------------------------------------------------------------------------

static const int MAX_TRACKED = 8;

struct Tracked {
  char vesselId[33];
  char payload[320];   // last JSON answer from the backend
  bool used;
};

Tracked tracked[MAX_TRACKED];

void trackVessel(const char* vesselId) {
  for (int i = 0; i < MAX_TRACKED; i++)
    if (tracked[i].used && strcmp(tracked[i].vesselId, vesselId) == 0) return;
  for (int i = 0; i < MAX_TRACKED; i++) {
    if (!tracked[i].used) {
      strncpy(tracked[i].vesselId, vesselId, 32);
      tracked[i].vesselId[32] = 0;
      tracked[i].payload[0]   = 0;
      tracked[i].used         = true;
      return;
    }
  }
}

void pollEta() {
  if (!uplinkUp || WiFi.status() != WL_CONNECTED) return;

  for (int i = 0; i < MAX_TRACKED; i++) {
    if (!tracked[i].used) continue;

    WiFiClientSecure client;
    client.setInsecure();
    HTTPClient https;
    String url = String(BACKEND_HOST) + "/api/sos/vessel/" + tracked[i].vesselId;
    if (!https.begin(client, url)) continue;
    https.setTimeout(8000);

    if (https.GET() == 200) {
      String body = https.getString();
      strncpy(tracked[i].payload, body.c_str(), sizeof(tracked[i].payload) - 1);
      tracked[i].payload[sizeof(tracked[i].payload) - 1] = 0;

      // Push it straight to connected phones too, so an acknowledgement lands
      // without the app having to poll us. A fisher waiting on a rescue should
      // not depend on a refresh interval.
      JsonDocument ev;
      ev["type"]      = "sos_update";
      ev["vessel_id"] = tracked[i].vesselId;
      ev["data"]      = body;
      String out;
      serializeJson(ev, out);
      ws.broadcastTXT(out);
    }
    https.end();
  }
}

// ---------------------------------------------------------------------------
// HTTP routes served to phones on the AP
// ---------------------------------------------------------------------------

// POST /v1/sos — what the Flutter app calls over the buoy's WiFi.
// We answer immediately. Delivery to the backend happens on the next tick.
// Blocking the reply on an HTTPS round trip would leave a person in distress
// staring at a spinner.
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

  int slot = queueFreeSlot();
  if (slot < 0) {
    http.send(503, "application/json", "{\"error\":\"queue full\"}");
    return;
  }

  SosItem& it = queueBuf[slot];
  memset(&it, 0, sizeof(it));
  strncpy(it.vesselId, vesselId,               32);
  strncpy(it.boat,     in["boat"] | "",        32);
  strncpy(it.note,     in["note"] | "",        64);
  it.clientTs = clientTs;
  it.seq      = nextSeq++;
  it.hasFix   = in["lat"].is<double>() && in["lon"].is<double>();
  if (it.hasFix) { it.lat = in["lat"]; it.lon = in["lon"]; }
  it.used = true;
  queueSave();

  trackVessel(vesselId);

  JsonDocument out;
  out["accepted"]  = true;
  out["buoy_id"]   = BUOY_ID;
  out["seq"]       = it.seq;
  out["server_ts"] = (uint32_t)(millis() / 1000);
  String body;
  serializeJson(out, body);
  http.send(200, "application/json", body);

  Serial.printf("[sos] queued %s seq=%u depth=%d\n",
                vesselId, it.seq, queueDepth());
}

// GET /v1/sos/status?vessel_id=... — the ETA the dispatcher sent back.
void handleGetSosStatus() {
  String vid = http.arg("vessel_id");
  for (int i = 0; i < MAX_TRACKED; i++) {
    if (tracked[i].used && vid == tracked[i].vesselId && tracked[i].payload[0]) {
      http.send(200, "application/json", tracked[i].payload);
      return;
    }
  }
  http.send(200, "application/json", "{\"events\":[]}");
}

// GET /v1/status — buoy health, so the app can show "connected to BUOY01".
// Reports the uplink honestly: a fisher should be able to tell the difference
// between "the buoy has my SOS" and "the SOS has reached shore".
void handleStatus() {
  JsonDocument doc;
  doc["buoy_id"]       = BUOY_ID;
  doc["uplink"]        = uplinkUp && WiFi.status() == WL_CONNECTED;
  doc["queue_depth"]   = queueDepth();
  doc["clients"]       = WiFi.softAPgetStationNum();
  doc["uptime_s"]      = millis() / 1000;
  String body;
  serializeJson(doc, body);
  http.send(200, "application/json", body);
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

// Whether NTP has actually given us wall-clock time. Before that, millis() is
// all we have, and an uptime is not a timestamp. Any epoch after 2023 means
// the clock was really set.
bool clockValid() { return time(nullptr) > 1700000000; }

String isoUtc(time_t at) {
  struct tm tm;
  gmtime_r(&at, &tm);
  char buf[24];
  strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", &tm);
  return String(buf);
}

void historyAdd(const char* from, const char* text) {
  ChatLine& line = history[historyHead];
  memset(&line, 0, sizeof(line));
  strncpy(line.from, from, sizeof(line.from) - 1);
  strncpy(line.text, text, sizeof(line.text) - 1);
  line.at   = clockValid() ? time(nullptr) : 0;
  line.used = true;
  historyHead = (historyHead + 1) % MAX_HISTORY;
}

// GET /history — the Flutter chat page backfills from here on connect.
//
// The shape is {"messages":[...]}, which is what the app parses. It used to
// answer with a bare "[]" that was never written to, so the app - which drops
// anything that is not a JSON object - silently backfilled nothing.
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
// When our uplink is alive we answer "internet is fine" (204 / Microsoft's
// exact NCSI string). When it is not, we answer with a redirect so the phone
// pops the captive-portal page instead of silently leaving.
// ---------------------------------------------------------------------------

bool haveInternet() { return uplinkUp && WiFi.status() == WL_CONNECTED; }

void handleGenerate204() {
  if (haveInternet()) {
    http.send(204, "text/plain", "");
  } else {
    http.sendHeader("Location", "http://192.168.4.1/portal", true);
    http.send(302, "text/plain", "");
  }
}

void handleNcsi() {
  if (haveInternet()) {
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

  page += haveInternet()
    ? "<div class=s><b>Link to shore is up.</b><br>An SOS sent from the AqOne "
      "app will reach the rescue centre now.</div>"
    : "<div class=w><b>Link to shore is down.</b><br>You can still send an SOS "
      "&mdash; this buoy will hold it and deliver it automatically once the "
      "link returns.</div>";

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
  }
}

// ---------------------------------------------------------------------------

unsigned long lastFlush = 0;
unsigned long lastPoll  = 0;

void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println("\n=== AqOne buoy " + String(BUOY_ID) + " ===");

  queueLoad();
  memset(tracked, 0, sizeof(tracked));
  setupWiFi();

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

  Serial.printf("[boot] ready. %d SOS recovered from flash\n", queueDepth());
}

void loop() {
  dns.processNextRequest();   // captive portal
  http.handleClient();
  ws.loop();

  unsigned long now = millis();

  if (now - lastFlush > 5000) {     // deliver queued SOS
    lastFlush = now;
    if (queueDepth()) flushQueue();
  }

  if (now - lastPoll > 15000) {     // check for dispatcher ETAs
    lastPoll = now;
    pollEta();
  }

  // Reconnect the uplink if it drops. Never blocks the AP or the chat.
  if (WiFi.status() != WL_CONNECTED && now % 30000 < 50) {
    WiFi.begin(UPLINK_SSID, UPLINK_PASS);
  }
}
