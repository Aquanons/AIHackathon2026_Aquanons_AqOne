#include <WiFi.h>
#include <ESPAsyncWebServer.h>
#include <AsyncWebSocket.h>
#include <LittleFS.h>
#include <Wire.h>
#include "HT_SSD1306Wire.h"
#include <map>

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
const int MAX_MSG_BYTES = 256;

int channel = 1;
AsyncWebServer server(80);
AsyncWebSocket ws("/ws");

String ring[RING_SIZE];
int head = 0;
int count = 0;

std::map<uint32_t, String> clientNames;

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

String clientsJson() {
  String out = "{\"type\":\"clients\",\"clients\":[";
  bool first = true;
  for (auto& c : ws.getClients()) {
    if (!first) out += ",";
    first = false;
    out += "\"" + escapeJson(getClientName(c.id())) + "\"";
  }
  out += "]}";
  return out;
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

void onWsEvent(AsyncWebSocket* server, AsyncWebSocketClient* client, AwsEventType type, void* arg, uint8_t* data, size_t len) {
  if (type == WS_EVT_CONNECT) {
    broadcastClients();
  } else if (type == WS_EVT_DISCONNECT) {
    clientNames.erase(client->id());
    broadcastClients();
  } else if (type == WS_EVT_DATA) {
    AwsFrameInfo* info = (AwsFrameInfo*)arg;
    if (info->final && info->index == 0 && info->opcode == WS_TEXT) {
      String msg((char*)data, len);
      msg.trim();
      if (msg.isEmpty() || msg.length() > MAX_MSG_BYTES) return;

      String from = getClientName(client->id());

      // Handshake: {"type":"hello","name":"..."}
      if (msg.startsWith("{\"type\":\"hello\"")) {
        int nameStart = msg.indexOf("\"name\":\"");
        if (nameStart >= 0) {
          nameStart += 8;
          int nameEnd = msg.indexOf("\"", nameStart);
          if (nameEnd > nameStart) {
            String name = msg.substring(nameStart, nameEnd);
            if (!name.isEmpty()) {
              clientNames[client->id()] = name;
              from = name;
            }
          }
        }
        ws.textAll(clientsJson());
        return;
      }

      String payload = "{\"type\":\"msg\",\"from\":\"" + escapeJson(from) + "\",\"text\":\"" + escapeJson(msg) + "\"}";
      ringAdd(payload);
      ws.textAll(payload);
    }
  }
}

const char HTML[] PROGMEM = R"rawliteral(
<!DOCTYPE html><html><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<title>MeshChat</title><style>
body{font-family:sans-serif;background:#0a0f1e;color:#eee;margin:0;padding:0;oled:flex;flex-direction:column;height:100vh}
#hdr{background:#0f3460;padding:12px 16px;border-bottom:1px solid #1e4a8a}
#hdr h1{margin:0;font-size:1.2em}
.note{font-size:.75em;color:#9fc2e8;margin-top:2px}
#msgs{flex:1;overflow-y:auto;padding:12px;list-style:none;margin:0}
#msgs li{background:#12213a;border-radius:10px;padding:8px 12px;margin-bottom:6px;word-wrap:break-word}
#msgs li b{color:#38bdf8}
#row{oled:flex;gap:8px;padding:10px;background:#0f3460}
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

  // Power ON the OLED oled rail (Vext control pin on V3)
  pinMode(Vext, OUTPUT);
  digitalWrite(Vext, LOW);
  delay(100);
  oled.init();
  oled.clear();
  oledPrint(0, "Scanning channels...");
  oled.display();

  WiFi.mode(WIFI_AP_STA);
  WiFi.disconnect(true, true);
  channel = pickChannel();
  WiFi.mode(WIFI_AP);
  Serial.print("Selected channel: "); Serial.println(channel);

  WiFi.softAP(AP_SSID, NULL, channel, 0, MAX_CLIENTS);
  IPAddress ip = WiFi.softAPIP();
  Serial.print("AP IP: "); Serial.println(ip);

  oled.clear();
  oledPrint(0, "SSID: " + String(AP_SSID));
  oledPrint(1, "Open network - no password");
  oledPrint(2, "IP: " + ip.toString());
  oledPrint(3, "Ch: " + String(channel) + " Max: " + String(MAX_CLIENTS));
  oled.display();

  ws.onEvent(onWsEvent);
  server.addHandler(&ws);

  server.on("/history", HTTP_GET, [](AsyncWebServerRequest* r) {
    String out = "{\"type\":\"history\",\"messages\":[";
    int start = count < RING_SIZE ? 0 : head;
    int n = min(count, RING_SIZE);
    for (int i = 0; i < n; i++) {
      int idx = (start + i) % RING_SIZE;
      if (i > 0) out += ",";
      out += ring[idx];
    }
    out += "]}";
    r->send(200, "application/json", out);
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
}
