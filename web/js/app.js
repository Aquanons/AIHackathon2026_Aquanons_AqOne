'use strict';

/* ==========================================================================
   AqOne v4 — app.js
   Builds on v3 (all bugs fixed) and adds: accounts & roles, map layer
   switcher, geofence zones, vessel trails + tracking, analytics charts,
   catch reports with CSV export, theme toggle, settings and profile.
   ========================================================================== */

// ---------------------------------------------------------------------------
// SESSION & ROLE
// ---------------------------------------------------------------------------
var session = AqSession.read(); // null for guests
var role = session ? session.role : 'Viewer';
var isGuest = !session;

// ---------------------------------------------------------------------------
// CONFIG & HELPERS
// ---------------------------------------------------------------------------
var CENTER = [11.75, 122.25];
var ZOOM = 10;

function $(id) { return document.getElementById(id); }
function pad(n) { return n < 10 ? '0' + n : '' + n; }

function fmtTime(ms) {
  var d = new Date(ms);
  var h = d.getHours();
  var m = d.getMinutes();
  var ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return h + ':' + pad(m) + ' ' + ap;
}

function timeAgo(ms) {
  var s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (s < 60) return s + 's ago';
  var m = Math.floor(s / 60);
  if (m < 60) return m + 'm ago';
  var h = Math.floor(m / 60);
  if (h < 24) return h + 'h ago';
  return Math.floor(h / 24) + 'd ago';
}

function prand(n) {
  var x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

function nextId(list, prefix) {
  var max = 0;
  list.forEach(function (x) {
    var m = new RegExp(prefix + '(\\d+)').exec(x.id || '');
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  return prefix + pad(max + 1);
}

// ---------------------------------------------------------------------------
// SETTINGS & THEME
// ---------------------------------------------------------------------------
var SETTINGS_KEY = 'aqone_v4_settings';

var state = {
  settings: { theme: 'dark', refresh: 2000, trails: true, zones: true },
  vessels: [],
  buoys: [],
  alerts: [],
  alertHistory: [],
  advisories: [],
  forecast: null,
  activity: [],
  reports: [],
  lastTick: Date.now(),
  windDir: 90,
  feedPaused: false,
  feedTimer: null,
  trackId: null,
  selectedVessel: null,
  searchQuery: '',
  statusFilter: 'all',
  alertSev: 'all'
};

function loadSettings() {
  try {
    var raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      var saved = JSON.parse(raw);
      for (var k in state.settings) {
        if (typeof saved[k] !== 'undefined') state.settings[k] = saved[k];
      }
    }
  } catch (err) { /* defaults */ }
}

function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings)); } catch (err) { /* ignore */ }
}

function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  var icon = $('theme-icon');
  if (icon) {
    icon.innerHTML = t === 'dark'
      ? '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>'
      : '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z"/></svg>';
  }
  document.querySelectorAll('.seg-btn[data-theme-val]').forEach(function (b) {
    b.classList.toggle('active', b.getAttribute('data-theme-val') === t);
  });
}

// ---------------------------------------------------------------------------
// PERSISTENCE
// ---------------------------------------------------------------------------
var STATE_KEY = 'aqone_v4_state';

function toPlainVessel(v) {
  var plain = {};
  for (var k in v) {
    if (k.charAt(0) !== '_' && v.hasOwnProperty(k)) plain[k] = v[k];
  }
  return plain;
}

function saveState() {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify({
      vessels: state.vessels.map(toPlainVessel),
      activity: state.activity.slice(0, 60),
      alertHistory: state.alertHistory.slice(-60),
      reports: state.reports
    }));
  } catch (err) { /* unavailable */ }
}

function loadState() {
  try {
    var raw = localStorage.getItem(STATE_KEY);
    if (!raw) return;
    var saved = JSON.parse(raw);
    if (saved) {
      if (Array.isArray(saved.vessels) && saved.vessels.length) state.vessels = saved.vessels.map(hydrateVessel);
      if (Array.isArray(saved.activity)) state.activity = saved.activity;
      if (Array.isArray(saved.alertHistory)) state.alertHistory = saved.alertHistory;
      if (Array.isArray(saved.reports)) state.reports = saved.reports;
    }
  } catch (err) { /* fall back to defaults */ }
}

// ---------------------------------------------------------------------------
// DATA
// ---------------------------------------------------------------------------
var HOME_PORTS = {
  'Kalibo':             { lat: 11.7059, lng: 122.3693 },
  'New Washington':     { lat: 11.6516, lng: 122.4328 },
  'Batan':              { lat: 11.5857, lng: 122.4863 },
  'Caticlan / Boracay': { lat: 11.9271, lng: 121.9476 },
  'Ibajay':             { lat: 11.8216, lng: 122.1674 }
};

function patrolFor(home, spread) {
  var p = HOME_PORTS[home] || HOME_PORTS['Kalibo'];
  spread = spread || 0.035;
  return { latMin: p.lat - spread, latMax: p.lat + spread, lngMin: p.lng - spread, lngMax: p.lng + spread };
}

function hydrateVessel(v) {
  v.heading = (typeof v.heading === 'number') ? v.heading : (Math.random() * 360);
  v.speed = (typeof v.speed === 'number') ? v.speed : 6;
  v._patrol = patrolFor(v.home);
  v._lastStatus = v.status;
  v._trail = Array.isArray(v._trail) ? v._trail : [];
  return v;
}

var DEFAULT_VESSELS = [
  { id: 'V-001', name: 'Bangka ni Mang Juan', owner: 'Eddie Magbanua', type: 'Bangka',    home: 'Kalibo',             lat: 11.7180, lng: 122.3550, status: 'active',  heading: 40,  speed: 6 },
  { id: 'V-002', name: 'Bangka ni Kapitan',   owner: 'Ramon Flores',   type: 'Bangka',    home: 'New Washington',     lat: 11.6480, lng: 122.4410, status: 'overdue', heading: 120, speed: 3 },
  { id: 'V-003', name: 'Saging Express',      owner: 'Felix Tambong',  type: 'Cargo',     home: 'Caticlan / Boracay', lat: 11.9350, lng: 121.9400, status: 'active',  heading: 200, speed: 12 },
  { id: 'V-004', name: 'Dagat Boys',          owner: 'Jun Antinero',   type: 'Bangka',    home: 'Batan',              lat: 11.5900, lng: 122.4780, status: 'idle',    heading: 0,   speed: 0 },
  { id: 'V-005', name: 'Winged Galleon',      owner: 'Rosa Dela Cruz', type: 'Trawler',   home: 'New Washington',     lat: 11.7700, lng: 122.2500, status: 'active',  heading: 90,  speed: 8 },
  { id: 'V-006', name: 'Hulugan ni Maria',    owner: 'Maria Yap',      type: 'Speedboat', home: 'Kalibo',             lat: 11.6980, lng: 122.3300, status: 'active',  heading: 260, speed: 15 },
  { id: 'V-007', name: 'Sardine Runner',      owner: 'Berto Salazar',  type: 'Trawler',   home: 'Ibajay',             lat: 11.7900, lng: 122.1400, status: 'idle',    heading: 0,   speed: 0 },
  { id: 'V-008', name: 'Bangka ni Mang Romy', owner: 'Romy Gatchalian',type: 'Bangka',    home: 'New Washington',     lat: 11.6700, lng: 122.4000, status: 'overdue', heading: 330, speed: 3 }
];

var DEFAULT_BUOYS = [
  { id: 'BU-A', name: 'Buoy Alpha',   lat: 11.7500, lng: 122.3200, online: true,  battery: 87, wave: 0.8, temp: 28.4 },
  { id: 'BU-B', name: 'Buoy Bravo',   lat: 11.9400, lng: 121.9300, online: true,  battery: 64, wave: 1.1, temp: 28.9 },
  { id: 'BU-C', name: 'Buoy Charlie', lat: 11.6600, lng: 122.4400, online: true,  battery: 91, wave: 0.6, temp: 28.1 },
  { id: 'BU-D', name: 'Buoy Delta',   lat: 11.6000, lng: 122.5000, online: false, battery: 6,  wave: 0.9, temp: 28.6 },
  { id: 'BU-E', name: 'Buoy Echo',    lat: 11.8000, lng: 122.1300, online: true,  battery: 14, wave: 0.7, temp: 28.3 },
  { id: 'BU-F', name: 'Buoy Foxtrot', lat: 11.8200, lng: 122.3500, online: true,  battery: 72, wave: 1.0, temp: 28.5 }
];

state.advisories = [
  { id: 1, title: 'Small craft advisory — Boracay approaches', date: 'Aug 3, 2026', status: 'published', body: 'Waves up to 2.1 m off Boracay approaches. Pump boats advised to stay within 5 km of shore.' },
  { id: 2, title: 'Municipal catch-reporting drive',            date: 'Aug 2, 2026', status: 'published', body: 'All operators must submit catch reports every Friday before 5 PM.' },
  { id: 3, title: 'New Washington Port — berth maintenance',    date: 'Aug 1, 2026', status: 'draft',     body: 'Slipway C closed 10–14 Aug for concrete works.' }
];

// ---------------------------------------------------------------------------
// FORECAST
// ---------------------------------------------------------------------------
function weatherIcon(cond) {
  var s = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">';
  if (cond === 'sun') s += '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>';
  else if (cond === 'cloud') s += '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>';
  else if (cond === 'rain') s += '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/><path d="M16 13v3"/><path d="M9 14v3"/><path d="M12 15v4"/>';
  else if (cond === 'wind') s += '<path d="M17.7 7.7a2.5 2.5 0 1 1-1.8 4.3H2"/><path d="M9.6 4.6A2 2 0 1 1 11 8H2"/><path d="M12.6 19.4A2 2 0 1 0 14 16H2"/>';
  else s += '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/><path d="m13 11-3 4h4l-3 4"/>';
  return s + '</svg>';
}

function forecastCond(wind, hour, seed) {
  if (wind > 45) return 'storm';
  if (wind > 30) return 'wind';
  if (prand(seed) > 0.55) return 'cloud';
  if (hour >= 13 && hour <= 17 && prand(seed + 1) > 0.6) return 'rain';
  return 'sun';
}

function genForecast() {
  var now = new Date();
  var hours = [];
  for (var i = 0; i < 24; i++) {
    var d = new Date(now.getTime() + i * 3600000);
    var h = d.getHours();
    var seed = i + Math.floor(Date.now() / 86400000) * 24;
    var temp = Math.round((27.5 + 3.6 * Math.sin((h - 7) / 24 * 2 * Math.PI) + (prand(seed) - 0.5)) * 10) / 10;
    var wind = Math.round((13 + 7 * Math.sin((h + 5) / 24 * 2 * Math.PI) + (prand(seed + 2) - 0.5) * 8) * 10) / 10;
    var wave = Math.round((0.6 + wind / 42 + (prand(seed + 3) - 0.5) * 0.3) * 10) / 10;
    hours.push({ time: pad(h) + ':00', temp: temp, wind: wind, wave: wave, cond: forecastCond(wind, h, seed) });
  }
  var days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var week = [];
  for (var j = 1; j <= 7; j++) {
    var wd = new Date(now.getTime() + j * 86400000);
    var s = j + Math.floor(Date.now() / 86400000) * 7;
    var wWind = Math.round(14 + prand(s) * 16);
    week.push({ name: (j === 1 ? 'Today' : days[wd.getDay()]), tempMin: Math.round(24 + prand(s + 1) * 2), tempMax: Math.round(29 + prand(s + 2) * 3), wind: wWind, wave: Math.round((0.5 + wWind / 38) * 10) / 10, cond: forecastCond(wWind, 12, s) });
  }
  state.forecast = {
    now: { temp: hours[0].temp, wind: hours[0].wind, wave: hours[0].wave, cond: hours[0].cond, desc: 'Sea conditions for Aklan coastal waters', gust: Math.round(hours[0].wind * 1.6), humidity: 80 },
    hours: hours,
    week: week
  };
}

// ---------------------------------------------------------------------------
// MAP
// ---------------------------------------------------------------------------
var map = L.map('map', { zoomControl: false }).setView(CENTER, ZOOM);
L.control.zoom({ position: 'topleft' }).addTo(map);

var tileStreets = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors' });
var tileSat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: '&copy; Esri World Imagery' });
var tileMarine = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { attribution: '&copy; OpenStreetMap &copy; CARTO' });

var activeTile = null;
function setBaseLayer(name) {
  if (activeTile) map.removeLayer(activeTile);
  if (name === 'sat') { activeTile = tileSat; }
  else if (name === 'marine') { activeTile = tileMarine; }
  else { activeTile = tileStreets; }
  activeTile.addTo(map);
  document.querySelectorAll('.ls-btn').forEach(function (b) { b.classList.toggle('active', b.id === 'layer-' + name); });
}

var vesselLayer = L.layerGroup().addTo(map);
var buoyLayer = L.layerGroup().addTo(map);
var alertLayer = L.layerGroup().addTo(map);
var trailLayer = L.layerGroup().addTo(map);
var zoneLayer = L.layerGroup();

// municipal water zones (approximate circles for the prototype)
var ZONES = [
  { name: 'Kalibo municipal waters',      lat: 11.7059, lng: 122.3693, r: 4600 },
  { name: 'New Washington municipal waters', lat: 11.6516, lng: 122.4328, r: 4600 },
  { name: 'Batan municipal waters',       lat: 11.5857, lng: 122.4863, r: 4200 },
  { name: 'Malay / Caticlan waters',      lat: 11.9271, lng: 121.9476, r: 5200 },
  { name: 'Ibajay municipal waters',      lat: 11.8216, lng: 122.1674, r: 4200 }
];
function rebuildZones() {
  zoneLayer.clearLayers();
  ZONES.forEach(function (z) {
    L.circle([z.lat, z.lng], {
      radius: z.r,
      color: '#22c55e',
      weight: 1.5,
      fillColor: '#22c55e',
      fillOpacity: 0.04,
      dashArray: '6 6',
      interactive: false
    }).bindTooltip(z.name, { direction: 'center', sticky: false }).addTo(zoneLayer);
  });
}

// Aklan fishing-zone boundary
var AKLAN_BOUNDARY = [
  [11.9674, 121.9248], [11.9200, 122.1200], [11.8700, 122.3000],
  [11.8000, 122.4600], [11.7000, 122.5400], [11.6000, 122.5600],
  [11.5450, 122.4400], [11.5450, 122.2200], [11.5900, 122.0200],
  [11.6600, 121.9000], [11.7800, 121.8800], [11.8900, 121.9050]
];
L.polygon(AKLAN_BOUNDARY, {
  color: '#22c55e', weight: 2.5, fillColor: '#22c55e', fillOpacity: 0.05, dashArray: '8 6'
}).bindTooltip('Aklan fishing zone boundary', { direction: 'center' }).addTo(map);

function toggleZones(show) {
  if (show) { if (!map.hasLayer(zoneLayer)) zoneLayer.addTo(map); }
  else if (map.hasLayer(zoneLayer)) map.removeLayer(zoneLayer);
}

map.on('mousemove', function (e) {
  $('coords').textContent = e.latlng.lat.toFixed(4) + '° N, ' + Math.abs(e.latlng.lng).toFixed(4) + '° E';
});
map.on('zoomend', function () { $('map-zoom').textContent = 'z' + map.getZoom(); });

// ---------------------------------------------------------------------------
// MARKERS & POPUPS
// ---------------------------------------------------------------------------
function vesselIcon(v) {
  var n = v.id.replace(/\D/g, '');
  return L.divIcon({ className: 'lmi', html: '<div class="vessel-marker m-' + v.status + '"><span>' + n + '</span></div>', iconSize: [22, 22], iconAnchor: [11, 22] });
}
function buoyIcon(b) {
  return L.divIcon({ className: 'lmi', html: '<div class="buoy-marker ' + (b.online ? 'b-online' : 'b-offline') + '"></div>', iconSize: [18, 18], iconAnchor: [9, 9] });
}
function alertIcon() {
  return L.divIcon({ className: 'lmi', html: '<div class="alert-marker"></div>', iconSize: [22, 22], iconAnchor: [11, 22] });
}

function vesselPopup(v) {
  return (
    '<div class="popup-title">' + v.name + '</div>' +
    '<div class="popup-sub">' + v.id + ' &middot; ' + v.type + '</div>' +
    '<div class="popup-rows">' +
      '<div>Status: <b>' + v.status.toUpperCase() + '</b></div>' +
      '<div>Speed: <b>' + v.speed + ' km/h</b></div>' +
      '<div>Home: <b>' + v.home + '</b></div>' +
    '</div>' +
    '<div class="popup-actions">' +
      '<button class="btn btn-primary btn-sm" onclick="AqApp.openVesselDetail(\'' + v.id + '\')">Details</button>' +
      '<button class="btn btn-ghost btn-sm" onclick="AqApp.centerVessel(\'' + v.id + '\')">Center</button>' +
    '</div>'
  );
}
function buoyPopup(b) {
  return (
    '<div class="popup-title">' + b.name + '</div>' +
    '<div class="popup-sub">' + b.id + ' &middot; ' + (b.online ? 'ONLINE' : 'OFFLINE') + '</div>' +
    '<div class="popup-rows">' +
      '<div>Battery: <b>' + b.battery + '%</b></div>' +
      '<div>Wave height: <b>' + b.wave.toFixed(1) + ' m</b></div>' +
      '<div>Sea temp: <b>' + b.temp.toFixed(1) + ' &deg;C</b></div>' +
    '</div>'
  );
}
function alertPopup(a) {
  return (
    '<div class="popup-title">' + a.type + '</div>' +
    '<div class="popup-sub">' + a.sev.toUpperCase() + ' alert</div>' +
    '<div class="popup-rows">' +
      '<div>Vessel: <b>' + a.vesselId + ' &middot; ' + a.vesselName + '</b></div>' +
      '<div>Reported: <b>' + fmtTime(a.time) + '</b></div>' +
    '</div>' +
    '<div class="popup-actions">' +
      '<button class="btn btn-danger btn-sm" onclick="AqApp.dismissAlert(' + a.id + ')">Dismiss alert</button>' +
    '</div>'
  );
}

function rebuildVesselMarkers() {
  vesselLayer.clearLayers();
  state.vessels.forEach(function (v) {
    var m = L.marker([v.lat, v.lng], { icon: vesselIcon(v), title: v.name });
    m.bindPopup(function () { return vesselPopup(v); });
    m.on('click', function () { openVesselDetail(v.id); });
    v._marker = m;
    v._lastStatus = v.status;
    vesselLayer.addLayer(m);
  });
}

function refreshVesselMarker(v) {
  if (!v._marker) return;
  if (v._lastStatus !== v.status) {
    vesselLayer.removeLayer(v._marker);
    var m = L.marker([v.lat, v.lng], { icon: vesselIcon(v), title: v.name });
    m.bindPopup(function () { return vesselPopup(v); });
    m.on('click', function () { openVesselDetail(v.id); });
    v._marker = m;
    v._lastStatus = v.status;
    vesselLayer.addLayer(m);
    if (state.selectedVessel === v.id) highlightMarker(v._marker);
  } else {
    v._marker.setLatLng([v.lat, v.lng]);
  }
}

function rebuildBuoyMarkers() {
  buoyLayer.clearLayers();
  state.buoys.forEach(function (b) {
    var m = L.marker([b.lat, b.lng], { icon: buoyIcon(b), title: b.name });
    m.bindPopup(function () { return buoyPopup(b); });
    buoyLayer.addLayer(m);
  });
}

function rebuildAlertMarkers() {
  alertLayer.clearLayers();
  state.alerts.forEach(function (a) {
    var m = L.marker([a.lat, a.lng], { icon: alertIcon(), title: a.type });
    m.bindPopup(function () { return alertPopup(a); });
    alertLayer.addLayer(m);
  });
}

function highlightMarker(marker) {
  if (!marker) return;
  var el = marker.getElement();
  if (el) { el.classList.add('marker-hi'); el.style.zIndex = 2000; }
}
function clearHighlight(marker) {
  if (!marker) return;
  var el = marker.getElement();
  if (el) { el.classList.remove('marker-hi'); el.style.zIndex = ''; }
}

// trails
function drawTrails() {
  trailLayer.clearLayers();
  if (!state.settings.trails) return;
  state.vessels.forEach(function (v) {
    if (!v._trail || v._trail.length < 2) return;
    var color = v.status === 'overdue' ? '#ef4444' : v.status === 'active' ? '#38bdf8' : '#64748b';
    L.polyline(v._trail, { color: color, weight: 2, opacity: 0.55 }).addTo(trailLayer);
  });
}

// ---------------------------------------------------------------------------
// SIMULATION
// ---------------------------------------------------------------------------
function moveVessel(v) {
  if (v.status === 'idle') return;
  v.heading = (v.heading + (Math.random() - 0.5) * 26 + 360) % 360;
  var rad = v.heading * Math.PI / 180;
  var dx = Math.cos(rad) * v.speed * 0.00009;
  var dy = Math.sin(rad) * v.speed * 0.00009;
  var p = v._patrol;
  var nLat = v.lat + dy;
  var nLng = v.lng + dx / Math.cos(v.lat * Math.PI / 180);
  if (nLat < p.latMin || nLat > p.latMax) v.heading = (180 - v.heading + 360) % 360;
  if (nLng < p.lngMin || nLng > p.lngMax) v.heading = (360 - v.heading) % 360;
  v.lat = clamp(nLat, p.latMin, p.latMax);
  v.lng = clamp(nLng, p.lngMin, p.lngMax);
}

function vesselHasAlert(v) {
  return state.alerts.some(function (a) { return a.vesselId === v.id; });
}

function makeOverdue(v) {
  v.status = 'overdue';
  if (!vesselHasAlert(v) && state.alerts.length < 5) {
    var alert = { id: 200 + state.alerts.length + state.alertHistory.length, code: 'OVERDUE', type: 'Overdue vessel', msg: v.name + ' has exceeded its expected return window.', sev: 'warning', vesselId: v.id, vesselName: v.name, lat: v.lat, lng: v.lng, time: Date.now() };
    state.alerts.push(alert);
    rebuildAlertMarkers();
    log(v.id + ' flagged overdue', 'warning');
    toast('warning', 'Overdue vessel', alert.msg);
  }
}

function recoverVessel(v) {
  v.status = 'active';
  for (var i = state.alerts.length - 1; i >= 0; i--) {
    var a = state.alerts[i];
    if (a.vesselId === v.id && (a.code === 'OVERDUE' || a.code === 'EQUIP')) {
      state.alerts.splice(i, 1);
      log(v.id + ' alert resolved — vessel returned', 'ok');
    }
  }
  rebuildAlertMarkers();
  log(v.id + ' ' + v.name + ' is back online', 'ok');
  toast('ok', 'Vessel returned', v.name + ' has returned to active status.');
}

function tick() {
  state.lastTick = Date.now();

  state.vessels.forEach(function (v) {
    if (v.status === 'idle') {
      if (Math.random() < 0.02) {
        v.status = 'active';
        v.speed = 5 + Math.random() * 6;
        log(v.id + ' ' + v.name + ' departed ' + v.home, 'info');
        toast('info', 'Vessel departed', v.name + ' has left ' + v.home + '.');
      }
      refreshVesselMarker(v);
      return;
    }

    if (v.status === 'overdue') {
      if (Math.random() < 0.012) { recoverVessel(v); }
    } else if (Math.random() < 0.0035) {
      makeOverdue(v);
    }
    moveVessel(v);

    // trail history
    v._trail.push([v.lat, v.lng]);
    if (v._trail.length > 40) v._trail.shift();

    refreshVesselMarker(v);
  });

  state.buoys.forEach(function (b) {
    if (!b.online) return;
    b.battery = Math.max(0, Math.round((b.battery - 0.02 - Math.random() * 0.04) * 100) / 100);
    b.wave = clamp(Math.round((b.wave + (Math.random() - 0.5) * 0.06) * 10) / 10, 0.2, 3.5);
    b.temp = clamp(Math.round((b.temp + (Math.random() - 0.5) * 0.1) * 10) / 10, 24, 32);
    if (b.battery <= 12) {
      b.online = false;
      log(b.id + ' ' + b.name + ' went offline (low battery)', 'warning');
      toast('warning', 'Buoy offline', b.name + ' battery depleted.');
      rebuildBuoyMarkers();
    }
  });

  if (state.forecast) {
    var f = state.forecast.now;
    f.wind = Math.round(clamp(f.wind + (Math.random() - 0.5) * 2.4, 4, 55) * 10) / 10;
    f.gust = Math.round(f.wind * 1.6);
    f.wave = clamp(Math.round((0.5 + f.wind / 40) * 10) / 10, 0.3, 4);
    f.humidity = clamp(Math.round(f.humidity + (Math.random() - 0.5) * 2), 60, 96);
    state.windDir = (state.windDir + (Math.random() - 0.5) * 20 + 360) % 360;
  }

  // tracking camera
  if (state.trackId) {
    var tracked = null;
    state.vessels.forEach(function (v) { if (v.id === state.trackId) tracked = v; });
    if (tracked) map.panTo([tracked.lat, tracked.lng], { animate: false });
  }

  drawTrails();
  renderStats();
  renderVessels();
  renderAlerts();
  renderForecast();
  renderCharts();
  updateSystem();
  saveState();
}

// ---------------------------------------------------------------------------
// TOASTS & LOG
// ---------------------------------------------------------------------------
function toast(kind, title, body) {
  var wrap = $('toast-wrap');
  if (!wrap) return;
  var el = document.createElement('div');
  el.className = 'toast t-' + kind;
  el.innerHTML = '<div><span class="toast-title"></span><span class="toast-body"></span></div>';
  el.querySelector('.toast-title').textContent = title;
  el.querySelector('.toast-body').textContent = body || '';
  wrap.appendChild(el);
  setTimeout(function () {
    el.classList.add('hide');
    setTimeout(function () { el.remove(); }, 300);
  }, 4200);
}

function log(text, kind) {
  kind = kind || 'info';
  state.activity.unshift({ time: Date.now(), text: text, kind: kind });
  if (state.activity.length > 60) state.activity.pop();
}

// ---------------------------------------------------------------------------
// RENDER
// ---------------------------------------------------------------------------
function renderStats() {
  $('vessel-count').textContent = state.vessels.length;
  var online = state.vessels.filter(function (v) { return v.status === 'active'; }).length;
  $('vessel-online').textContent = online + ' active · ' + state.vessels.filter(function (v) { return v.status === 'idle'; }).length + ' idle';

  $('alert-count').textContent = state.alerts.length;
  $('tab-alert-badge').textContent = state.alerts.length;
  $('tab-alert-badge').classList.toggle('zero', state.alerts.length === 0);
  var worst = 'none';
  if (state.alerts.some(function (a) { return a.sev === 'danger'; })) worst = 'danger';
  else if (state.alerts.some(function (a) { return a.sev === 'warning'; })) worst = 'warning';
  else if (state.alerts.some(function (a) { return a.sev === 'info'; })) worst = 'info';
  $('alert-highest').textContent = 'highest: ' + worst;

  var buoysOnline = state.buoys.filter(function (b) { return b.online; }).length;
  $('buoy-count').textContent = buoysOnline;
  $('buoy-total').textContent = 'of ' + state.buoys.length + ' total';

  if (state.forecast) {
    $('wind-kpi').textContent = Math.round(state.forecast.now.wind) + ' km/h';
    var dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    $('wind-trend').textContent = dirs[Math.round(state.windDir / 45) % 8] + ' → ' + state.forecast.now.gust + ' gust';
  }
}

function renderVessels() {
  var list = $('vessel-list');
  list.innerHTML = '';
  var q = state.searchQuery.trim().toLowerCase();
  var shown = 0;

  state.vessels.forEach(function (v) {
    var matchesSearch = !q ||
      (v.id + ' ' + v.name + ' ' + v.owner + ' ' + v.type + ' ' + v.home).toLowerCase().indexOf(q) !== -1;
    var matchesStatus = state.statusFilter === 'all' || v.status === state.statusFilter;

    if (v._marker && v._marker.getElement()) {
      var el = v._marker.getElement();
      el.classList.toggle('marker-dim', !!q && !matchesSearch);
      if (q && matchesSearch) highlightMarker(v._marker);
      else if (!q) clearHighlight(v._marker);
    }
    if (!matchesSearch || !matchesStatus) return;

    shown++;
    var li = document.createElement('li');
    li.className = 'vessel-item';
    if (state.selectedVessel === v.id) li.classList.add('selected');
    li.innerHTML =
      '<span class="v-id-badge">' + v.id + '</span>' +
      '<div class="vessel-main">' +
        '<div class="vessel-name"></div>' +
        '<div class="v-owner"></div>' +
        '<div class="v-meta"><span></span><span></span></div>' +
      '</div>' +
      '<span class="v-status status-' + v.status + '">' + v.status + '</span>';
    li.querySelector('.vessel-name').textContent = v.name;
    li.querySelector('.v-owner').textContent = v.owner;
    li.querySelector('.v-meta span:first-child').textContent = v.type + ' · ' + v.home;
    li.querySelector('.v-meta span:last-child').textContent = v.speed + ' km/h';
    li.addEventListener('click', function () { openVesselDetail(v.id); });
    list.appendChild(li);
  });

  $('vessel-empty').hidden = shown > 0;
}

function findVessel(id) {
  for (var i = 0; i < state.vessels.length; i++) if (state.vessels[i].id === id) return state.vessels[i];
  return null;
}

function openVesselDetail(id) {
  var v = findVessel(id);
  if (!v) return;
  state.selectedVessel = id;
  var card = $('vessel-detail');
  card.hidden = false;
  $('vd-name').textContent = v.name;
  $('vd-id').textContent = v.id + ' · ' + v.type + ' · ' + v.home;
  var st = $('vd-status');
  st.className = 'v-status status-' + v.status;
  st.textContent = v.status;
  $('vd-rows').innerHTML =
    '<div>Owner: <b>' + v.owner + '</b></div>' +
    '<div>Speed: <b>' + v.speed + ' km/h</b></div>' +
    '<div>Position: <b>' + v.lat.toFixed(4) + '°N, ' + v.lng.toFixed(4) + '°E</b></div>';
  $('vd-track').textContent = state.trackId === v.id ? 'Stop tracking' : 'Track vessel';
  if (v._marker) highlightMarker(v._marker);
  renderVessels();
}

function closeVesselDetail() {
  $('vessel-detail').hidden = true;
  state.selectedVessel = null;
  state.trackId = null;
  $('vd-track').textContent = 'Track vessel';
  state.vessels.forEach(clearHighlight);
  renderVessels();
}

function renderAlerts() {
  var box = $('alert-list');
  box.innerHTML = '';
  var sev = state.alertSev;
  var shown = 0;

  state.alerts.forEach(function (a) {
    if (sev !== 'all' && a.sev !== sev) return;
    shown++;
    var div = document.createElement('div');
    div.className = 'alert-item sev-' + a.sev;
    div.innerHTML =
      '<span class="sev-dot"></span>' +
      '<div class="alert-main">' +
        '<div class="alert-type"><span></span><span class="sev-tag"></span></div>' +
        '<div class="alert-sub"></div>' +
      '</div>' +
      '<button class="icon-btn dismiss" title="Dismiss alert">&times;</button>';
    div.querySelector('.alert-type span').textContent = a.type;
    div.querySelector('.sev-tag').textContent = a.sev;
    div.querySelector('.alert-sub').textContent = a.vesselId + ' · ' + a.vesselName + ' · ' + timeAgo(a.time);
    div.querySelector('.dismiss').addEventListener('click', function (e) {
      e.stopPropagation();
      AqApp.dismissAlert(a.id);
    });
    div.addEventListener('click', function () { focusAlert(a); });
    box.appendChild(div);
  });

  $('alert-empty').hidden = shown > 0;
  renderStats();
}

function focusAlert(a) {
  var target = null;
  state.alerts.forEach(function (x) { if (x.id === a.id) target = x; });
  if (!target) return;
  map.flyTo([target.lat, target.lng], Math.max(map.getZoom(), 12), { duration: 0.6 });
  alertLayer.eachLayer(function (lyr) {
    if (lyr.getLatLng().lat === target.lat && lyr.getLatLng().lng === target.lng) lyr.openPopup();
  });
}

function renderForecast() {
  if (!state.forecast) return;
  var f = state.forecast.now;
  var condText = f.cond === 'sun' ? 'clear skies' : f.cond === 'rain' ? 'scattered rain' : f.cond === 'storm' ? 'squally' : f.cond === 'wind' ? 'windy' : 'partly cloudy';
  $('fc-temp').textContent = f.temp.toFixed(1) + '\u00b0C';
  $('fc-desc').textContent = f.desc + ' · ' + condText;
  $('fc-meta').innerHTML =
    '<div>Wind: <b>' + Math.round(f.wind) + ' km/h</b></div>' +
    '<div>Gusts: <b>' + f.gust + ' km/h</b></div>' +
    '<div>Waves: <b>' + f.wave.toFixed(1) + ' m</b></div>' +
    '<div>Humidity: <b>' + f.humidity + '%</b></div>';

  var hwrap = $('forecast-hours');
  hwrap.innerHTML = '';
  f.hours.forEach(function (h) {
    var d = document.createElement('div');
    d.className = 'fc-hour';
    d.innerHTML =
      '<div class="fc-time">' + h.time + '</div>' +
      '<div class="fc-icon">' + weatherIcon(h.cond) + '</div>' +
      '<div class="fc-temp">' + h.temp.toFixed(0) + '\u00b0</div>' +
      '<div class="fc-wind">' + Math.round(h.wind) + ' km/h</div>';
    hwrap.appendChild(d);
  });

  var wwrap = $('forecast-week');
  wwrap.innerHTML = '';
  f.week.forEach(function (d) {
    var row = document.createElement('div');
    row.className = 'fc-day';
    row.innerHTML =
      '<span class="fc-name">' + d.name + '</span>' +
      '<span class="fc-icon">' + weatherIcon(d.cond) + '</span>' +
      '<span class="fc-wind">wind ' + d.wind + ' · waves ' + d.wave.toFixed(1) + ' m</span>' +
      '<span class="fc-temp">' + d.tempMin + '\u00b0 / ' + d.tempMax + '\u00b0</span>';
    wwrap.appendChild(row);
  });
}

function renderAdvisories() {
  var box = $('advisory-list');
  box.innerHTML = '';
  state.advisories.forEach(function (adv) {
    var div = document.createElement('div');
    div.className = 'advisory-item';
    div.innerHTML =
      '<div class="adv-title">' + adv.title + '</div>' +
      '<div class="adv-meta"><span class="adv-status"></span>' + adv.date + ' · ' + adv.body + '</div>';
    var st = div.querySelector('.adv-status');
    st.textContent = adv.status;
    st.classList.add(adv.status === 'published' ? 's-published' : 's-draft');
    box.appendChild(div);
  });
}

function renderActivity() {
  var box = $('activity-list');
  box.innerHTML = '';
  if (!state.activity.length) {
    box.innerHTML = '<p class="empty-state">No activity yet.</p>';
    return;
  }
  state.activity.forEach(function (e) {
    var div = document.createElement('div');
    div.className = 'activity-item a-' + e.kind;
    div.innerHTML = '<span class="activity-text"></span><span class="activity-time"></span>';
    div.querySelector('.activity-text').textContent = e.text;
    div.querySelector('.activity-time').textContent = fmtTime(e.time);
    box.appendChild(div);
  });
}

function updateSystem() {
  if (!state.feedPaused) $('live-text').textContent = 'LIVE · ' + timeAgo(state.lastTick);
}

// ---------------------------------------------------------------------------
// CHARTS
// ---------------------------------------------------------------------------
function renderCharts() {
  // donut — vessels by status
  var counts = { active: 0, overdue: 0, idle: 0 };
  state.vessels.forEach(function (v) { if (counts[v.status] !== undefined) counts[v.status]++; });
  var total = state.vessels.length || 1;
  var colors = { active: '#22c55e', overdue: '#ef4444', idle: '#64748b' };
  var order = ['active', 'overdue', 'idle'];
  var start = 0;
  var stops = [];
  order.forEach(function (k) {
    var pct = counts[k] / total * 100;
    stops.push(colors[k] + ' ' + start + 'deg ' + (start + pct) + 'deg');
    start += pct;
  });
  var donut = $('chart-status-donut');
  if (state.vessels.length === 0) stops = ['#64748b 0deg 100deg'];
  donut.style.background = 'conic-gradient(' + stops.join(', ') + ')';
  donut.innerHTML = '<div class="donut-center"><strong>' + state.vessels.length + '</strong><span>vessels</span></div>';
  var legend = $('chart-status-legend');
  legend.innerHTML = '';
  order.forEach(function (k) {
    var li = document.createElement('li');
    li.innerHTML = '<span class="swatch" style="background:' + colors[k] + '"></span>' + k.charAt(0).toUpperCase() + k.slice(1) + ' <b>' + counts[k] + '</b>';
    legend.appendChild(li);
  });

  // fleet composition
  var types = {};
  state.vessels.forEach(function (v) { types[v.type] = (types[v.type] || 0) + 1; });
  var typeKeys = Object.keys(types).sort(function (a, b) { return types[b] - types[a]; });
  var typeColors = { 'Bangka': '#38bdf8', 'Trawler': '#a78bfa', 'Cargo': '#f59e0b', 'Speedboat': '#22c55e' };
  var tmax = Math.max.apply(null, typeKeys.map(function (k) { return types[k]; })) || 1;
  $('chart-types').innerHTML = typeKeys.map(function (k) {
    return '<div class="hbar"><span class="hb-label">' + k + '</span><div class="hb-track"><div class="hb-fill" style="width:' + (types[k] / tmax * 100) + '%;background:' + (typeColors[k] || '#38bdf8') + '"></div></div><span class="hb-val">' + types[k] + '</span></div>';
  }).join('') || '<p class="empty-state">No vessels.</p>';

  // activity — last 24h in 8 buckets of 3h
  var buckets = [0, 0, 0, 0, 0, 0, 0, 0];
  var now = Date.now();
  var day = 24 * 3600000, bh = 3 * 3600000;
  var entries = state.activity.concat(state.alertHistory.map(function (h) { return { time: h.time }; }));
  entries.forEach(function (e) {
    var age = now - e.time;
    if (age >= 0 && age < day) buckets[7 - Math.floor(age / bh)]++;
  });
  var bmax = Math.max.apply(null, buckets) || 1;
  var bw = 320 / 8;
  var bars = '';
  buckets.forEach(function (n, i) {
    var h = 14 + (96 * n / bmax);
    var x = i * bw + bw * 0.15;
    bars += '<rect class="bar" x="' + x.toFixed(1) + '" y="' + (116 - h).toFixed(1) + '" width="' + (bw * 0.7).toFixed(1) + '" height="' + h.toFixed(1) + '" rx="2"><title>' + n + ' event(s)</title></rect>';
  });
  $('chart-activity').innerHTML = bars + '<line class="grid-line" x1="0" y1="116" x2="320" y2="116"/>';

  // buoy battery
  var bcols = function (val) { return val > 55 ? '#22c55e' : val > 25 ? '#f59e0b' : '#ef4444'; };
  $('chart-buoys').innerHTML = state.buoys.map(function (b) {
    return '<div class="hbar"><span class="hb-label">' + b.id + '</span><div class="hb-track"><div class="hb-fill" style="width:' + b.battery + '%;background:' + bcols(b.battery) + '"></div></div><span class="hb-val">' + Math.round(b.battery) + '%</span></div>';
  }).join('');

  // wind line chart
  var hours = state.forecast ? state.forecast.hours : [];
  if (hours.length) {
    var pts = [];
    var area = [];
    hours.forEach(function (h, i) {
      var x = 8 + i * (304 / 23);
      var y = 110 - clamp(h.wind, 0, 60) / 60 * 92;
      pts.push(x.toFixed(1) + ',' + y.toFixed(1));
      area.push(x.toFixed(1) + ',' + y.toFixed(1));
    });
    var areaPath = 'M' + area.join(' L') + ' L' + (8 + 23 * (304 / 23)).toFixed(1) + ',116 L8,116 Z';
    $('chart-wind').innerHTML =
      '<line class="grid-line" x1="8" y1="116" x2="312" y2="116"/>' +
      '<line class="grid-line" x1="8" y1="46" x2="312" y2="46"/>' +
      '<path class="area" d="' + areaPath + '"/>' +
      '<polyline class="line" points="' + pts.join(' ') + '"/>' +
      '<g>' + hours.map(function (h, i) {
        var x = 8 + i * (304 / 23);
        var y = 110 - clamp(h.wind, 0, 60) / 60 * 92;
        return '<circle class="dot" cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="1.8"><title>' + h.time + ' · ' + Math.round(h.wind) + ' km/h</title></circle>';
      }).join('') + '</g>';
  }
}

// ---------------------------------------------------------------------------
// REPORTS
// ---------------------------------------------------------------------------
function renderReports() {
  var sel = $('r-vessel');
  sel.innerHTML = '';
  state.vessels.forEach(function (v) {
    var o = document.createElement('option');
    o.value = v.id;
    o.textContent = v.id + ' — ' + v.name;
    sel.appendChild(o);
  });

  var tb = document.querySelector('#report-table tbody');
  tb.innerHTML = '';
  var total = 0;
  var species = {};
  state.reports.forEach(function (r) {
    total += r.weight;
    species[r.species] = true;
    var tr = document.createElement('tr');
    tr.innerHTML =
      '<td>' + r.date + '</td>' +
      '<td>' + r.vesselId + '</td>' +
      '<td>' + r.species + '</td>' +
      '<td>' + r.weight.toFixed(1) + ' kg</td>' +
      '<td>' + r.area + '</td>' +
      '<td><button class="rm-btn" title="Delete" data-id="' + r.id + '">&times;</button></td>';
    tb.appendChild(tr);
  });
  tb.querySelectorAll('.rm-btn').forEach(function (btn) {
    btn.addEventListener('click', function () { deleteReport(parseInt(btn.getAttribute('data-id'), 10)); });
  });

  $('report-count').textContent = state.reports.length;
  $('report-empty').hidden = state.reports.length > 0;
  $('report-stats').innerHTML =
    '<div class="rs-card"><strong>' + state.reports.length + '</strong><span>Reports</span></div>' +
    '<div class="rs-card"><strong>' + total.toFixed(1) + ' kg</strong><span>Total catch</span></div>' +
    '<div class="rs-card"><strong>' + Object.keys(species).length + '</strong><span>Species</span></div>';
}

function addReport(data) {
  var r = { id: Date.now(), date: data.date, vesselId: data.vesselId, species: data.species, weight: data.weight, area: data.area, time: Date.now() };
  state.reports.unshift(r);
  log('Logged catch report: ' + r.species + ' (' + r.weight + ' kg) from ' + r.vesselId, 'info');
  renderReports();
  saveState();
  toast('ok', 'Report logged', r.species + ', ' + r.weight.toFixed(1) + ' kg · ' + r.vesselId);
}

function deleteReport(id) {
  for (var i = 0; i < state.reports.length; i++) {
    if (state.reports[i].id === id) {
      state.reports.splice(i, 1);
      break;
    }
  }
  log('Deleted catch report', 'info');
  renderReports();
  saveState();
}

function csvCell(v) {
  return '"' + String(v).replace(/"/g, '""') + '"';
}

function downloadCSV(filename, content) {
  var blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
}

function exportReportsCSV() {
  var lines = ['Date,Vessel,Species,Weight (kg),Area'];
  state.reports.forEach(function (r) {
    lines.push([r.date, r.vesselId, r.species, r.weight, r.area].map(csvCell).join(','));
  });
  downloadCSV('aqone_reports.csv', lines.join('\n'));
}

function exportAllData() {
  var out = [];
  out.push('AqOne v4 data export — ' + new Date().toISOString());
  out.push('');
  out.push('=== VESSELS ===');
  out.push('ID,Name,Type,Owner,Home,Status,Speed (km/h),Lat,Lng');
  state.vessels.forEach(function (v) {
    out.push([v.id, v.name, v.type, v.owner, v.home, v.status, v.speed, v.lat.toFixed(5), v.lng.toFixed(5)].map(csvCell).join(','));
  });
  out.push('');
  out.push('=== CATCH REPORTS ===');
  out.push('Date,Vessel,Species,Weight (kg),Area');
  state.reports.forEach(function (r) {
    out.push([r.date, r.vesselId, r.species, r.weight, r.area].map(csvCell).join(','));
  });
  out.push('');
  out.push('=== ACTIVITY LOG ===');
  out.push('Time,Entry');
  state.activity.forEach(function (e) {
    out.push([new Date(e.time).toISOString(), e.text].map(csvCell).join(','));
  });
  downloadCSV('aqone_export.csv', out.join('\n'));
  log('Exported all data to CSV', 'info');
}

// ---------------------------------------------------------------------------
// CONTROLS
// ---------------------------------------------------------------------------
function activateTab(name) {
  document.querySelectorAll('.tab').forEach(function (t) { t.classList.remove('active'); });
  document.querySelectorAll('.tab-pane').forEach(function (p) { p.classList.remove('active'); });
  document.querySelector('.tab[data-tab="' + name + '"]').classList.add('active');
  $('pane-' + name).classList.add('active');
  if (name === 'charts') renderCharts();
  if (name === 'reports') renderReports();
  if (name === 'activity') renderActivity();
  if (name === 'forecast') renderForecast();
  if (name === 'alerts') renderAlerts();
  if (name === 'live') renderVessels();
}

function startFeed() {
  if (state.feedTimer) clearInterval(state.feedTimer);
  state.feedTimer = setInterval(tick, state.settings.refresh);
  state.feedPaused = false;
  $('live-badge').classList.remove('off');
  $('live-text').textContent = 'LIVE';
}

function pauseFeed() {
  if (state.feedTimer) clearInterval(state.feedTimer);
  state.feedTimer = null;
  state.feedPaused = true;
  $('live-badge').classList.add('off');
  $('live-text').textContent = 'PAUSED';
}

function bindControls() {
  var searchInput = $('search');
  searchInput.addEventListener('input', function () {
    state.searchQuery = searchInput.value;
    $('search-clear').classList.toggle('visible', state.searchQuery.length > 0);
    renderVessels();
  });
  searchInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && state.searchQuery.trim()) {
      var q = state.searchQuery.trim().toLowerCase();
      var first = state.vessels.filter(function (v) {
        return (v.id + ' ' + v.name + ' ' + v.owner + ' ' + v.home + ' ' + v.type).toLowerCase().indexOf(q) !== -1;
      })[0];
      if (first) openVesselDetail(first.id);
    }
  });
  $('search-clear').addEventListener('click', function () {
    searchInput.value = '';
    state.searchQuery = '';
    $('search-clear').classList.remove('visible');
    renderVessels();
  });

  $('status-filter').addEventListener('change', function (e) {
    state.statusFilter = e.target.value;
    renderVessels();
  });

  $('severity-chips').addEventListener('click', function (e) {
    var chip = e.target.closest('.chip');
    if (!chip) return;
    document.querySelectorAll('#severity-chips .chip').forEach(function (c) { c.classList.remove('active'); });
    chip.classList.add('active');
    state.alertSev = chip.getAttribute('data-sev');
    renderAlerts();
  });

  document.querySelectorAll('.tab').forEach(function (tab) {
    tab.addEventListener('click', function () { activateTab(tab.getAttribute('data-tab')); });
  });
  $('kpi-vessels').addEventListener('click', function () { activateTab('live'); });
  $('kpi-alerts').addEventListener('click', function () { activateTab('alerts'); });
  $('kpi-buoys').addEventListener('click', function () { activateTab('charts'); });
  $('kpi-wind').addEventListener('click', function () { activateTab('forecast'); });

  // live pause / resume
  $('live-badge').addEventListener('click', function () {
    if (state.feedPaused) startFeed();
    else pauseFeed();
  });

  // base layers
  $('layer-streets').addEventListener('click', function () { setBaseLayer('streets'); });
  $('layer-sat').addEventListener('click', function () { setBaseLayer('sat'); });
  $('layer-marine').addEventListener('click', function () { setBaseLayer('marine'); });

  // zones overlay
  $('zones-toggle').addEventListener('change', function (e) {
    state.settings.zones = e.target.checked;
    $('set-zones').checked = e.target.checked;
    toggleZones(state.settings.zones);
    saveSettings();
  });

  // theme
  $('theme-toggle').addEventListener('click', function () {
    state.settings.theme = state.settings.theme === 'dark' ? 'light' : 'dark';
    applyTheme(state.settings.theme);
    saveSettings();
  });

  // user menu
  var menu = $('user-menu');
  $('user-chip').addEventListener('click', function (e) {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
    $('user-chip').setAttribute('aria-expanded', String(!menu.hidden));
  });
  document.addEventListener('click', function (e) {
    if (!menu.hidden && !e.target.closest('.user-wrap')) {
      menu.hidden = true;
      $('user-chip').setAttribute('aria-expanded', 'false');
    }
  });
  $('menu-profile').addEventListener('click', function () { menu.hidden = true; openProfile(); });
  $('menu-settings').addEventListener('click', function () { menu.hidden = true; openSettings(); });
  $('menu-signout').addEventListener('click', function () {
    if (session) {
      AqSession.clear();
      log('Signed out', 'info');
      window.location.href = 'login.html';
    } else {
      window.location.href = 'login.html';
    }
  });

  // add-vessel modal
  var backdrop = $('modal-backdrop');
  function openVesselModal() { backdrop.hidden = false; $('v-name').focus(); }
  function closeVesselModal() { backdrop.hidden = true; }
  $('add-vessel-btn').addEventListener('click', openVesselModal);
  $('modal-close').addEventListener('click', closeVesselModal);
  $('modal-cancel').addEventListener('click', closeVesselModal);
  backdrop.addEventListener('click', function (e) { if (e.target === backdrop) closeVesselModal(); });

  $('vessel-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var name = $('v-name').value.trim();
    if (!name) { $('v-name').classList.add('invalid'); setTimeout(function () { $('v-name').classList.remove('invalid'); }, 1200); return; }
    var type = $('v-type').value;
    var home = $('v-home').value;
    var owner = $('v-owner').value.trim() || 'Unregistered';
    var port = HOME_PORTS[home];
    var vessel = hydrateVessel({
      id: nextId(state.vessels, 'V-'),
      name: name, owner: owner, type: type, home: home,
      lat: port.lat + (Math.random() - 0.5) * 0.02,
      lng: port.lng + (Math.random() - 0.5) * 0.02,
      status: 'idle', heading: Math.random() * 360, speed: 0
    });
    state.vessels.push(vessel);
    rebuildVesselMarkers();
    drawTrails();
    renderVessels();
    renderStats();
    renderReports();
    renderCharts();
    log('Registered vessel ' + vessel.id + ' ' + name, 'info');
    toast('ok', 'Vessel registered', name + ' (' + vessel.id + ') added at ' + home + '.');
    saveState();
    closeVesselModal();
    $('vessel-form').reset();
  });

  // vessel detail card
  $('vd-close').addEventListener('click', closeVesselDetail);
  $('vd-center').addEventListener('click', function () {
    var v = findVessel(state.selectedVessel);
    if (v) map.flyTo([v.lat, v.lng], Math.max(map.getZoom(), 12), { duration: 0.6 });
  });
  $('vd-track').addEventListener('click', function () {
    if (!state.selectedVessel) return;
    if (state.trackId === state.selectedVessel) {
      state.trackId = null;
      $('vd-track').textContent = 'Track vessel';
      toast('info', 'Tracking stopped', 'Camera no longer follows the vessel.');
    } else {
      state.trackId = state.selectedVessel;
      $('vd-track').textContent = 'Stop tracking';
      var v = findVessel(state.selectedVessel);
      if (v) map.setView([v.lat, v.lng], Math.max(map.getZoom(), 12));
      toast('info', 'Tracking enabled', 'Camera now follows ' + v.name + '.');
    }
  });

  // reports
  $('report-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var species = $('r-species').value.trim();
    var weight = parseFloat($('r-weight').value);
    var date = $('r-date').value || new Date().toISOString().slice(0, 10);
    var vesselId = $('r-vessel').value;
    var area = $('r-area').value;
    var invalid = false;
    if (!species) { $('r-species').classList.add('invalid'); invalid = true; } else $('r-species').classList.remove('invalid');
    if (!(weight > 0)) { $('r-weight').classList.add('invalid'); invalid = true; } else $('r-weight').classList.remove('invalid');
    if (invalid) return;
    addReport({ date: date, vesselId: vesselId, species: species, weight: weight, area: area });
    $('report-form').reset();
    $('r-date').value = new Date().toISOString().slice(0, 10);
  });
  $('export-csv').addEventListener('click', exportReportsCSV);
}

// ---------------------------------------------------------------------------
// SETTINGS & PROFILE MODALS
// ---------------------------------------------------------------------------
function openSettings() {
  $('settings-backdrop').hidden = false;
  $('set-refresh').value = String(state.settings.refresh);
  $('set-trails').checked = state.settings.trails;
  $('set-zones').checked = state.settings.zones;
}

function bindModals() {
  // settings
  $('settings-btn').addEventListener('click', openSettings);
  $('settings-close').addEventListener('click', function () { $('settings-backdrop').hidden = true; });
  $('settings-backdrop').addEventListener('click', function (e) { if (e.target === $('settings-backdrop')) $('settings-backdrop').hidden = true; });
  document.querySelectorAll('#theme-seg .seg-btn').forEach(function (b) {
    b.addEventListener('click', function () {
      state.settings.theme = b.getAttribute('data-theme-val');
      applyTheme(state.settings.theme);
      saveSettings();
    });
  });
  $('set-refresh').addEventListener('change', function (e) {
    state.settings.refresh = parseInt(e.target.value, 10);
    saveSettings();
    if (!state.feedPaused) startFeed();
    toast('info', 'Feed updated', 'Refresh interval set to ' + (state.settings.refresh / 1000) + ' s.');
  });
  $('set-trails').addEventListener('change', function (e) {
    state.settings.trails = e.target.checked;
    saveSettings();
    drawTrails();
  });
  $('set-zones').addEventListener('change', function (e) {
    state.settings.zones = e.target.checked;
    $('zones-toggle').checked = e.target.checked;
    toggleZones(state.settings.zones);
    saveSettings();
  });
  $('export-data').addEventListener('click', exportAllData);
  $('reset-data').addEventListener('click', function () {
    if (!confirm('Reset all demo data? This clears vessels, reports, activity, settings and accounts on this browser.')) return;
    try {
      localStorage.removeItem(STATE_KEY);
      localStorage.removeItem(SETTINGS_KEY);
      localStorage.removeItem('aqone_v4_accounts');
      localStorage.removeItem('aqone_session');
      sessionStorage.removeItem('aqone_session');
    } catch (err) { /* ignore */ }
    window.location.reload();
  });

  // profile
  $('profile-close').addEventListener('click', function () { $('profile-backdrop').hidden = true; });
  $('profile-cancel').addEventListener('click', function () { $('profile-backdrop').hidden = true; });
  $('profile-backdrop').addEventListener('click', function (e) { if (e.target === $('profile-backdrop')) $('profile-backdrop').hidden = true; });

  $('profile-form').addEventListener('submit', function (e) {
    e.preventDefault();
    if (isGuest) { $('profile-error').textContent = 'Guest sessions cannot edit a profile. Sign in first.'; return; }
    var name = $('p-name').value.trim();
    var current = $('p-current').value;
    var next = $('p-new').value;
    var confirmPw = $('p-confirm').value;

    var account = AqAccounts.find(session.user);
    if (!account) { $('profile-error').textContent = 'Account not found.'; return; }

    if (current && !AqAccounts.verify(session.user, current)) {
      $('profile-error').textContent = 'Current password is incorrect.';
      return;
    }
    if (next && next.length < 6) {
      $('profile-error').textContent = 'New password must be at least 6 characters.';
      return;
    }
    if (next && next !== confirmPw) {
      $('profile-error').textContent = 'New passwords do not match.';
      return;
    }

    account.name = name || account.name;
    if (next) account.hash = hashPassword(next);
    AqAccounts.update(account);
    session.name = account.name;
    AqSession.write(session, true);
    $('user-name').textContent = account.name;
    $('user-avatar').textContent = account.name.charAt(0).toUpperCase();

    log('Profile updated' + (next ? ' and password changed' : ''), 'ok');
    toast('ok', 'Profile saved', 'Your changes were saved.');
    $('profile-error').textContent = '';
    $('p-current').value = '';
    $('p-new').value = '';
    $('p-confirm').value = '';
    $('profile-backdrop').hidden = true;
    saveState();
  });

  // Escape closes modals / menus
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    ['modal-backdrop', 'profile-backdrop', 'settings-backdrop'].forEach(function (id) { $(id).hidden = true; });
    $('user-menu').hidden = true;
  });
}

function openProfile() {
  $('profile-backdrop').hidden = false;
  $('profile-error').textContent = '';
  if (isGuest) {
    $('p-username').value = 'guest';
    $('p-role').value = 'Viewer (not signed in)';
    $('p-name').value = 'Guest';
    $('p-name').disabled = true;
    $('p-current').disabled = true;
    $('p-new').disabled = true;
    $('p-confirm').disabled = true;
  } else {
    $('p-username').value = session.user;
    $('p-role').value = session.role;
    $('p-name').value = session.name;
    $('p-name').disabled = false;
    $('p-current').disabled = false;
    $('p-new').disabled = false;
    $('p-confirm').disabled = false;
  }
}

// ---------------------------------------------------------------------------
// HEADER
// ---------------------------------------------------------------------------
function initHeader() {
  var name = session ? session.name : 'Guest';
  var r = role;
  $('user-name').textContent = name;
  $('user-role').textContent = r;
  $('user-avatar').textContent = name.charAt(0).toUpperCase();

  // role-gating: Viewers cannot register vessels
  if (role === 'Viewer') {
    $('add-vessel-btn').title = 'Only Administrators and Operators can register vessels';
    $('add-vessel-btn').disabled = true;
    $('add-vessel-btn').style.opacity = '0.5';
  }

  if (session) {
    log('Signed in as ' + session.user + ' (' + role + ')', 'ok');
  }
}

// ---------------------------------------------------------------------------
// PUBLIC API
// ---------------------------------------------------------------------------
var AqApp = {
  openVesselDetail: openVesselDetail,
  centerVessel: function (id) {
    var v = findVessel(id);
    if (v) map.flyTo([v.lat, v.lng], Math.max(map.getZoom(), 12), { duration: 0.6 });
  },
  dismissAlert: function (id) {
    var removed = null;
    for (var i = 0; i < state.alerts.length; i++) {
      if (state.alerts[i].id === id) { removed = state.alerts[i]; state.alerts.splice(i, 1); break; }
    }
    if (!removed) return;
    removed.resolvedAt = Date.now();
    state.alertHistory.push(removed);
    rebuildAlertMarkers();
    renderAlerts();
    log('Dismissed alert ' + removed.type + ' (' + removed.vesselId + ')', 'info');
    toast('info', 'Alert dismissed', removed.type + ' for ' + removed.vesselId + ' cleared.');
    saveState();
  }
};

// ---------------------------------------------------------------------------
// INIT
// ---------------------------------------------------------------------------
loadSettings();
loadState();
state.vessels = state.vessels.length ? state.vessels : DEFAULT_VESSELS.map(hydrateVessel);
state.buoys = DEFAULT_BUOYS;
if (!state.forecast) genForecast();

state.alerts = [
  { id: 101, code: 'OVERDUE', type: 'Overdue vessel', msg: 'V-002 has exceeded its expected return window.', sev: 'warning', vesselId: 'V-002', vesselName: 'Bangka ni Kapitan',   lat: 11.6480, lng: 122.4410, time: Date.now() - 2 * 3600000 },
  { id: 102, code: 'EQUIP',   type: 'Equipment failure', msg: 'Radio and position beacon reporting faults.', sev: 'warning', vesselId: 'V-008', vesselName: 'Bangka ni Mang Romy', lat: 11.6700, lng: 122.4000, time: Date.now() - 5 * 3600000 },
  { id: 103, code: 'BREACH',  type: 'Zone breach', msg: 'Vessel detected outside its licensed fishing zone.', sev: 'danger', vesselId: 'V-004', vesselName: 'Dagat Boys', lat: 11.5900, lng: 122.4780, time: Date.now() - 1 * 3600000 }
];

applyTheme(state.settings.theme);
initHeader();
bindControls();
bindModals();
rebuildVesselMarkers();
rebuildBuoyMarkers();
rebuildAlertMarkers();
rebuildZones();
toggleZones(state.settings.zones);
$('zones-toggle').checked = state.settings.zones;
setBaseLayer('streets');
renderStats();
renderVessels();
renderAlerts();
renderForecast();
renderAdvisories();
renderActivity();
renderCharts();
renderReports();
updateSystem();

$('r-date').value = new Date().toISOString().slice(0, 10);

startFeed();
setInterval(updateSystem, 1000);
setInterval(renderAlerts, 15000);
setInterval(renderActivity, 10000);
