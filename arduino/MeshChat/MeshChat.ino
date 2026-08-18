// MeshChat - Heltec WiFi LoRa 32 V3 chat hub + WiFi relay
//
// Two jobs on one ESP32 radio:
//
//   * SoftAP "Aquan" (open, no password) is what the boats join. Their phones
//     talk to the WebSocket at ws://192.168.4.1/ws, exactly as before.
//   * The station interface simultaneously joins a shore/hotspot network and
//     relays chat both ways against the AqOne backend, so a message typed at
//     sea reaches the dashboard and a message typed ashore reaches the boats.
//
// The relay is deliberately store-and-forward. Uplink POSTs are queued from
// the WebSocket callback and drained in loop(): AsyncWebServer callbacks run
// on the AsyncTCP task, and a blocking TLS handshake there stalls every other
// client on the AP - the failure looks like "chat froze for everyone" and is
// miserable to trace back to an HTTP call.
//
// If the uplink is down the hub still works as a local-only chat. That is the
// normal case out at sea, not an error state.

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ESPAsyncWebServer.h>
#include <AsyncWebSocket.h>
#include <LittleFS.h>
#include <Wire.h>
#include <time.h>
#include <ctype.h>
#include <freertos/FreeRTOS.h>
#include <freertos/semphr.h>
#include "HT_SSD1306Wire.h"
#include <map>

#include "MeshChatTypes.h"

// --- OLED (Heltec V3) ---
SSD1306Wire oled(0x3c, 500000, SDA_OLED, SCL_OLED, GEOMETRY_128_64, RST_OLED);

void oledPrint(int line, const String& text) {
  oled.setFont(ArialMT_Plain_10);
  oled.drawString(0, line * 14, text);
}

// --- SETTINGS ---
const char* AP_SSID = "Aquan";
const int MAX_CLIENTS = 10;
const int RING_SIZE = 50;

// Uplink: the shore router or a phone hotspot. Leave UPLINK_SSID empty to run
// the hub purely local - everything except the backend relay still works.
const char* UPLINK_SSID = "";
const char* UPLINK_PASS = "";

// AqOne backend. Must match the deployment the dashboard reads from.
const char* BACKEND_URL = "https://aqone-backend.up.railway.app";

const uint32_t UPLINK_RETRY_MS = 15000;   // between station reconnect attempts
const uint32_t DOWNLINK_POLL_MS = 4000;   // between backend history polls
const uint32_t HTTP_TIMEOUT_MS = 6000;
const int OUT_QUEUE_SIZE = 12;

int channel = 1;
AsyncWebServer server(80);
AsyncWebSocket ws("/ws");

String ring[RING_SIZE];
int head = 0;
int count = 0;

std::map<uint32_t, String> clientNames;

// --- Relay state --------------------------------------------------------

// Outbound queue; OutMsg and its sizes come from MeshChatTypes.h.
OutMsg outQueue[OUT_QUEUE_SIZE];
int outHead = 0;
int outCount = 0;
uint32_t outDropped = 0;

SemaphoreHandle_t stateMutex = nullptr;

bool uplinkUp = false;
uint32_t lastUplinkAttempt = 0;
uint32_t lastDownlinkPoll = 0;
long lastSeenId = 0;          // highest backend message id already handled
uint32_t relayedUp = 0;
uint32_t relayedDown = 0;
volatile bool displayDirty = true;

void lockState() {
  if (stateMutex) xSemaphoreTake(stateMutex, portMAX_DELAY);
}

void unlockState() {
  if (stateMutex) xSemaphoreGive(stateMutex);
}

void ringAdd(const String& msg) {
  ring[head] = msg;
  head = (head + 1) % RING_SIZE;
  if (count < RING_SIZE) count++;
}

String escapeJson(String s) {
  s.replace("\\", "\\\\");
  s.replace("\"", "\\\"");
  s.replace("\n", "\\n");
  s.replace("\r", "\\r");
  return s;
}

String getClientName(uint32_t id) {
  auto it = clientNames.find(id);
  return it != clientNames.end() ? it->second : "Peer-" + String(id);
}

// The app renders this as its "who else is out here" wheel and reads the
// "list" key; the older embedded page read "clients". Both are emitted so
// neither client has to be redeployed in lockstep with the firmware.
String clientsJson() {
  String names = "";
  bool first = true;
  for (auto& c : ws.getClients()) {
    if (!first) names += ",";
    first = false;
    names += "\"" + escapeJson(getClientName(c.id())) + "\"";
  }
  return "{\"type\":\"clients\",\"list\":[" + names + "],\"clients\":[" + names + "]}";
}

void broadcastClients() {
  ws.textAll(clientsJson());
}

int pickChannel() {
  int n = WiFi.scanNetworks();
  if (n == 0) return 6;
  int chCount[12] = {0};
  for (int i = 0; i < n; i++) {
    int c = WiFi.channel(i);
    if (c >= 1 && c <= 11) chCount[c]++;
  }
  int best = 1;
  for (int c = 2; c <= 11; c++) {
    if (chCount[c] < chCount[best]) best = c;
  }
  return best;
}

// --- Minimal JSON field reader ------------------------------------------
//
// The payloads here are a handful of flat fields from our own app and our own
// backend, so a full parser would cost more flash and heap than it earns.
// Anything unrecognised falls through to being treated as plain text.

String jsonString(const String& src, const String& key, int from = 0) {
  String needle = "\"" + key + "\":\"";
  int start = src.indexOf(needle, from);
  if (start < 0) return "";
  start += needle.length();

  String out;
  for (int i = start; i < (int)src.length(); i++) {
    char c = src[i];
    if (c == '\\' && i + 1 < (int)src.length()) {
      char esc = src[++i];
      switch (esc) {
        case 'n': out += '\n'; break;
        case 'r': out += '\r'; break;
        case 't': out += '\t'; break;
        default: out += esc; break;
      }
      continue;
    }
    if (c == '"') break;
    out += c;
  }
  return out;
}

long jsonNumber(const String& src, const String& key, int from = 0) {
  String needle = "\"" + key + "\":";
  int start = src.indexOf(needle, from);
  if (start < 0) return -1;
  start += needle.length();
  while (start < (int)src.length() && src[start] == ' ') start++;
  int end = start;
  while (end < (int)src.length() && (isdigit((unsigned char)src[end]) || src[end] == '-')) end++;
  if (end == start) return -1;
  return src.substring(start, end).toInt();
}

// Index of the brace closing the flat object that starts at [start], or -1.
//
// Quote- and escape-aware, because "find the next }" is wrong the moment a
// fisherman types one: the entry gets cut short, the origin field falls off
// the end, and the hub stops recognising its own uplink coming back - so it
// rebroadcasts every message it just sent. The rows here have no nested
// objects, which is what lets this stay a single pass.
int objectEnd(const String& src, int start) {
  bool inString = false;
  for (int i = start; i < (int)src.length(); i++) {
    char c = src[i];
    if (inString) {
      if (c == '\\') { i++; continue; }
      if (c == '"') inString = false;
      continue;
    }
    if (c == '"') { inString = true; continue; }
    if (c == '}') return i;
  }
  return -1;
}

// ISO8601 UTC once NTP has landed over the uplink, empty before that. The app
// falls back to the receive time when it is missing, which is the right answer
// for a hub that has never seen a clock.
String nowIso() {
  time_t now = time(nullptr);
  if (now < 1700000000) return "";
  struct tm t;
  gmtime_r(&now, &t);
  char buf[25];
  strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", &t);
  return String(buf);
}

String buildMsgJson(const String& from, const String& text) {
  String stamp = nowIso();
  String out = "{\"type\":\"msg\",\"from\":\"" + escapeJson(from) +
               "\",\"text\":\"" + escapeJson(text) + "\"";
  if (stamp.length()) out += ",\"time\":\"" + stamp + "\"";
  out += "}";
  return out;
}

// Queue a message for the backend. Called from the AsyncTCP task - keep it
// short and free of heap churn.
void queueUplink(const String& sender, const String& text) {
  lockState();
  if (outCount >= OUT_QUEUE_SIZE) {
    // Drop the oldest: fresher chatter is worth more than a backlog, and an
    // unbounded queue on a device with this little RAM is a reboot waiting
    // to happen.
    outHead = (outHead + 1) % OUT_QUEUE_SIZE;
    outCount--;
    outDropped++;
  }
  int slot = (outHead + outCount) % OUT_QUEUE_SIZE;
  strlcpy(outQueue[slot].sender, sender.c_str(), sizeof(outQueue[slot].sender));
  strlcpy(outQueue[slot].text, text.c_str(), sizeof(outQueue[slot].text));
  outCount++;
  unlockState();
}

bool popUplink(OutMsg& out) {
  bool got = false;
  lockState();
  if (outCount > 0) {
    out = outQueue[outHead];
    outHead = (outHead + 1) % OUT_QUEUE_SIZE;
    outCount--;
    got = true;
  }
  unlockState();
  return got;
}

// Accept a message from any source, store it, show it to everyone on the AP.
void publishLocal(const String& from, const String& text) {
  String payload = buildMsgJson(from, text);
  lockState();
  ringAdd(payload);
  unlockState();
  ws.textAll(payload);
  displayDirty = true;
}

// --- WebSocket ----------------------------------------------------------

void onWsEvent(AsyncWebSocket* server, AsyncWebSocketClient* client, AwsEventType type, void* arg, uint8_t* data, size_t len) {
  if (type == WS_EVT_CONNECT) {
    broadcastClients();
    displayDirty = true;
  } else if (type == WS_EVT_DISCONNECT) {
    clientNames.erase(client->id());
    broadcastClients();
    displayDirty = true;
  } else if (type == WS_EVT_DATA) {
    AwsFrameInfo* info = (AwsFrameInfo*)arg;
    if (info->final && info->index == 0 && info->opcode == WS_TEXT) {
      String msg((char*)data, len);
      msg.trim();
      // The envelope is bigger than the message it carries, so the cap here
      // is on the frame; the text itself is clamped further down.
      if (msg.isEmpty() || msg.length() > MAX_MSG_BYTES * 2) return;

      String from = getClientName(client->id());
      String text = msg;

      // The app speaks JSON envelopes; the built-in browser page sends bare
      // text. Both have to work, and previously the JSON envelope was
      // rebroadcast verbatim - every phone showed the raw {"type":"msg",...}
      // string as the body of the message.
      if (msg.startsWith("{")) {
        String kind = jsonString(msg, "type");

        if (kind == "hello") {
          String name = jsonString(msg, "name");
          if (!name.isEmpty()) {
            clientNames[client->id()] = name.substring(0, MAX_NAME_BYTES);
          }
          broadcastClients();
          displayDirty = true;
          return;
        }

        if (kind == "msg") {
          String declared = jsonString(msg, "from");
          if (!declared.isEmpty()) {
            from = declared.substring(0, MAX_NAME_BYTES);
            // Treat the name on a message as a handshake too, so a client
            // that reconnected mid-session reappears on the wheel without
            // waiting for another hello.
            if (clientNames[client->id()] != from) {
              clientNames[client->id()] = from;
              broadcastClients();
            }
          }
          text = jsonString(msg, "text");
        } else {
          // Unknown control frame - ignore rather than echo JSON at everyone.
          return;
        }
      }

      text.trim();
      if (text.isEmpty()) return;
      if (text.length() > MAX_MSG_BYTES) text = text.substring(0, MAX_MSG_BYTES);

      publishLocal(from, text);
      queueUplink(from, text);
    }
  }
}

// --- Uplink / relay -----------------------------------------------------

bool uplinkConfigured() {
  return UPLINK_SSID != nullptr && UPLINK_SSID[0] != '\0';
}

// One request factory for both legs. setInsecure() skips certificate
// validation: the device has no cert store and no reliable clock at boot, so
// pinning would fail closed on exactly the vessels that need the relay most.
// What crosses this link is public chat, never credentials.
bool beginRequest(HTTPClient& http, WiFiClientSecure& tls, WiFiClient& plain, const String& url) {
  http.setTimeout(HTTP_TIMEOUT_MS);
  http.setConnectTimeout(HTTP_TIMEOUT_MS);
  if (url.startsWith("https:")) {
    tls.setInsecure();
    tls.setTimeout(HTTP_TIMEOUT_MS / 1000);
    return http.begin(tls, url);
  }
  return http.begin(plain, url);
}

void pumpUplink() {
  if (!uplinkUp) return;

  OutMsg msg;
  if (!popUplink(msg)) return;

  WiFiClientSecure tls;
  WiFiClient plain;
  HTTPClient http;
  if (!beginRequest(http, tls, plain, String(BACKEND_URL) + "/api/mesh/chat")) return;

  http.addHeader("Content-Type", "application/json");
  String body = "{\"sender\":\"" + escapeJson(String(msg.sender)) +
                "\",\"text\":\"" + escapeJson(String(msg.text)) +
                "\",\"origin\":\"hub\"}";

  int code = http.POST(body);
  if (code == 200 || code == 201) {
    // Claim the id the backend assigned so the downlink poll does not hand
    // this same message straight back to the boats that just sent it.
    long id = jsonNumber(http.getString(), "id");
    if (id > lastSeenId) lastSeenId = id;
    relayedUp++;
  } else {
    // Requeue so a dropped connection is not a lost message. The queue is
    // bounded, so a permanently broken uplink degrades to local-only chat
    // rather than growing without limit.
    queueUplink(String(msg.sender), String(msg.text));
  }
  http.end();
  displayDirty = true;
}

void pumpDownlink() {
  if (!uplinkUp) return;
  if (millis() - lastDownlinkPoll < DOWNLINK_POLL_MS) return;
  lastDownlinkPoll = millis();

  WiFiClientSecure tls;
  WiFiClient plain;
  HTTPClient http;
  String url = String(BACKEND_URL) + "/api/mesh/chat?limit=20&since_id=" + String(lastSeenId);
  if (!beginRequest(http, tls, plain, url)) return;

  int code = http.GET();
  if (code != 200) {
    http.end();
    return;
  }

  String body = http.getString();
  http.end();

  // First poll of a session: adopt the newest id without replaying the
  // backlog to the boats. They already pulled /history when they connected.
  bool seeding = (lastSeenId == 0);

  int cursor = 0;
  while (true) {
    int entry = body.indexOf("{\"id\":", cursor);
    if (entry < 0) break;
    int entryEnd = objectEnd(body, entry);
    if (entryEnd < 0) break;
    String chunk = body.substring(entry, entryEnd + 1);
    cursor = entryEnd + 1;

    long id = jsonNumber(chunk, "id");
    if (id <= lastSeenId) continue;
    lastSeenId = id;

    if (seeding) continue;
    // Skip our own uplink coming back around.
    if (jsonString(chunk, "origin") == "hub") continue;

    String sender = jsonString(chunk, "sender");
    String text = jsonString(chunk, "text");
    if (text.isEmpty()) continue;
    if (sender.isEmpty()) sender = "Shore";

    publishLocal(sender, text);
    relayedDown++;
  }
  displayDirty = true;
}

void serviceUplink() {
  if (!uplinkConfigured()) return;

  bool connected = WiFi.status() == WL_CONNECTED;
  if (connected != uplinkUp) {
    uplinkUp = connected;
    displayDirty = true;
    if (connected) {
      Serial.print("Uplink IP: ");
      Serial.println(WiFi.localIP());
      // The clock is only needed for message timestamps, so NTP failing is
      // not fatal - nowIso() just keeps returning empty.
      configTime(0, 0, "pool.ntp.org", "time.nist.gov");
    } else {
      Serial.println("Uplink lost");
    }
  }

  if (!connected && millis() - lastUplinkAttempt > UPLINK_RETRY_MS) {
    lastUplinkAttempt = millis();
    Serial.println("Uplink retry...");
    WiFi.begin(UPLINK_SSID, UPLINK_PASS);
  }
}

// --- Display ------------------------------------------------------------

void drawStatus() {
  oled.clear();
  oledPrint(0, "SSID: " + String(AP_SSID) + " (" + String(ws.count()) + ")");
  oledPrint(1, "IP: " + WiFi.softAPIP().toString() + " Ch" + String(channel));
  if (!uplinkConfigured()) {
    oledPrint(2, "Relay: local only");
  } else if (uplinkUp) {
    oledPrint(2, "Relay: UP " + WiFi.localIP().toString());
  } else {
    oledPrint(2, "Relay: connecting...");
  }
  lockState();
  int queued = outCount;
  unlockState();
  oledPrint(3, "Up " + String(relayedUp) + " Dn " + String(relayedDown) +
                  " Q" + String(queued));
  oled.display();
}

const char HTML[] PROGMEM = R"rawliteral(
<!DOCTYPE html><html><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<title>MeshChat</title><style>
body{font-family:sans-serif;background:#0a0f1e;color:#eee;margin:0;padding:0;display:flex;flex-direction:column;height:100vh}
#hdr{background:#0f3460;padding:12px 16px;border-bottom:1px solid #1e4a8a}
#hdr h1{margin:0;font-size:1.2em}
.note{font-size:.75em;color:#9fc2e8;margin-top:2px}
#msgs{flex:1;overflow-y:auto;padding:12px;list-style:none;margin:0}
#msgs li{background:#12213a;border-radius:10px;padding:8px 12px;margin-bottom:6px;word-wrap:break-word}
#msgs li b{color:#38bdf8}
#row{display:flex;gap:8px;padding:10px;background:#0f3460}
#row input{flex:1;padding:10px;border:none;border-radius:6px;font-size:1em}
#row button{padding:10px 20px;background:#0f3460;color:#eee;border:1px solid #38bdf8;border-radius:6px;cursor:pointer}
</style></head><body>
<div id=hdr><h1>MeshChat</h1><div class=note>Open network - no password | IP: 192.168.4.1</div></div>
<ul id=msgs></ul>
<div id=row><input id=inp placeholder="Type a message..." autofocus><button id=btn>Send</button></div>
<script>
function render(u,l){u.appendChild(l);u.scrollTop=u.scrollHeight}
function addMsg(j){var u=document.getElementById('msgs'),l=document.createElement('li');var s=j.from?('<b>'+j.from+'</b>: '):'';s+=(j.text||'');l.innerHTML=s;render(u,l)}
var ws=new WebSocket('ws://'+location.host+'/ws');
ws.onmessage=function(e){var d=e.data;if(d[0]==='{'){try{var j=JSON.parse(d);if(j.type==='msg'){addMsg(j)}return}catch(_){}}var u=document.getElementById('msgs'),l=document.createElement('li');l.textContent=d;render(u,l)};
fetch('/history').then(function(r){return r.json()}).then(function(d){var msgs=d.messages||[];msgs.forEach(function(m){addMsg(m)})}).catch(function(){});
document.getElementById('btn').onclick=function(){var i=document.getElementById('inp');if(i.value){ws.send(i.value);i.value=''}};
document.getElementById('inp').onkeydown=function(e){if(e.key==='Enter')document.getElementById('btn').click()};
</script></body></html>
)rawliteral";

void setup() {
  Serial.begin(115200);
  stateMutex = xSemaphoreCreateMutex();

  // Power ON the OLED rail (Vext control pin on V3)
  pinMode(Vext, OUTPUT);
  digitalWrite(Vext, LOW);
  delay(100);
  oled.init();
  oled.clear();
  oledPrint(0, "Starting...");
  oled.display();

  WiFi.mode(WIFI_AP_STA);
  WiFi.disconnect(true, true);
  WiFi.setSleep(false);

  // The ESP32 has one radio: AP and STA must share a channel. Bringing the
  // station up first lets the AP inherit the router's channel, instead of the
  // AP starting on a scanned channel and then hopping - which silently kicks
  // every phone off "Aquan" the moment the uplink connects.
  if (uplinkConfigured()) {
    oled.clear();
    oledPrint(0, "Joining uplink...");
    oledPrint(1, String(UPLINK_SSID));
    oled.display();

    WiFi.begin(UPLINK_SSID, UPLINK_PASS);
    lastUplinkAttempt = millis();
    uint32_t deadline = millis() + 12000;
    while (WiFi.status() != WL_CONNECTED && millis() < deadline) delay(250);

    if (WiFi.status() == WL_CONNECTED) {
      uplinkUp = true;
      channel = WiFi.channel();
      configTime(0, 0, "pool.ntp.org", "time.nist.gov");
      Serial.print("Uplink IP: ");
      Serial.println(WiFi.localIP());
    } else {
      // Keep going: local chat matters more than the relay, and
      // serviceUplink() retries in the background.
      Serial.println("Uplink not up yet - starting local-only");
      channel = pickChannel();
    }
  } else {
    oled.clear();
    oledPrint(0, "Scanning channels...");
    oled.display();
    channel = pickChannel();
  }

  WiFi.softAP(AP_SSID, NULL, channel, 0, MAX_CLIENTS);
  IPAddress ip = WiFi.softAPIP();
  Serial.print("Selected channel: "); Serial.println(channel);
  Serial.print("AP IP: "); Serial.println(ip);

  drawStatus();

  ws.onEvent(onWsEvent);
  server.addHandler(&ws);

  server.on("/history", HTTP_GET, [](AsyncWebServerRequest* r) {
    String out = "{\"type\":\"history\",\"messages\":[";
    lockState();
    int start = count < RING_SIZE ? 0 : head;
    int n = min(count, RING_SIZE);
    for (int i = 0; i < n; i++) {
      int idx = (start + i) % RING_SIZE;
      if (i > 0) out += ",";
      out += ring[idx];
    }
    unlockState();
    out += "]}";
    r->send(200, "application/json", out);
  });

  // Relay health, for the app's connection badge and for anyone debugging on
  // the pier with a browser.
  server.on("/status", HTTP_GET, [](AsyncWebServerRequest* r) {
    lockState();
    int queued = outCount;
    uint32_t dropped = outDropped;
    unlockState();
    String out = "{\"ap\":\"" + String(AP_SSID) +
                 "\",\"clients\":" + String(ws.count()) +
                 ",\"channel\":" + String(channel) +
                 ",\"uplink\":" + String(uplinkUp ? "true" : "false") +
                 ",\"uplink_ip\":\"" + (uplinkUp ? WiFi.localIP().toString() : String("")) +
                 "\",\"relayed_up\":" + String(relayedUp) +
                 ",\"relayed_down\":" + String(relayedDown) +
                 ",\"queued\":" + String(queued) +
                 ",\"dropped\":" + String(dropped) + "}";
    r->send(200, "application/json", out);
  });

  // Lets a shore operator on the same LAN inject a message straight into the
  // mesh without a round trip through the backend.
  server.on("/say", HTTP_POST, [](AsyncWebServerRequest* r) {
    String from = r->hasParam("from", true) ? r->getParam("from", true)->value() : String("Shore");
    String text = r->hasParam("text", true) ? r->getParam("text", true)->value() : String("");
    text.trim();
    if (text.isEmpty()) {
      r->send(400, "application/json", "{\"error\":\"text required\"}");
      return;
    }
    if (text.length() > MAX_MSG_BYTES) text = text.substring(0, MAX_MSG_BYTES);
    if (from.length() > MAX_NAME_BYTES) from = from.substring(0, MAX_NAME_BYTES);
    publishLocal(from, text);
    queueUplink(from, text);
    r->send(201, "application/json", "{\"status\":\"ok\"}");
  });

  // Serve the dashboard (and its CSS/JS/assets) from LittleFS so the rescue
  // team can open http://192.168.4.1 and see the live console on the same
  // Aquan WiFi the SOS is relayed over.
  if (!LittleFS.begin(true)) {
    Serial.println("LittleFS mount failed");
  } else {
    Serial.println("LittleFS mounted - serving dashboard");
  }

  // If the dashboard files are present, redirect "/" to it; otherwise fall
  // back to the embedded chat page so the hub still works out of the box.
  if (LittleFS.exists("/html/dashboard.html")) {
    server.on("/", HTTP_GET, [](AsyncWebServerRequest* r) {
      r->redirect("/html/dashboard.html");
    });
  } else {
    server.on("/", HTTP_GET, [](AsyncWebServerRequest* r) { r->send_P(200, "text/html", HTML); });
  }

  // The embedded browser chat page stays reachable at /chat even when the
  // dashboard owns "/".
  server.on("/chat", HTTP_GET, [](AsyncWebServerRequest* r) { r->send_P(200, "text/html", HTML); });

  // Static file mounts for the dashboard's HTML, CSS, JS and asset folders.
  server.serveStatic("/html", LittleFS, "/html");
  server.serveStatic("/css", LittleFS, "/css");
  server.serveStatic("/js", LittleFS, "/js");
  server.serveStatic("/assets", LittleFS, "/assets");

  server.begin();
}

void loop() {
  ws.cleanupClients();
  serviceUplink();
  pumpUplink();
  pumpDownlink();

  static uint32_t lastDraw = 0;
  if (displayDirty && millis() - lastDraw > 500) {
    lastDraw = millis();
    displayDirty = false;
    drawStatus();
  }

  delay(10);
}
