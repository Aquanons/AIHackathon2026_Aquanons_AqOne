'use strict';

/* ==========================================================================
   AqOne v3 — app.js
   v3 fixes every documented v1/v2 bug:
     - search now filters live (v2: no listener)
     - status filter actually filters (v2: no listener)
     - dismissing an alert re-renders immediately (v2: array only)
     - session read/write is consistent across pages (v2: storage mismatch)
     - "Remember me" is honored (v2: ignored)
     - password is validated (v2: any password accepted)
     - last-updated timer uses the correct element id (v2: typo)
   v3 additions: live movement simulation, buoy telemetry, weather forecast,
   activity log, vessel registration, toast notifications, map legend/boundary.
   ========================================================================== */

// ---------------------------------------------------------------------------
// SESSION
// ---------------------------------------------------------------------------
var session = AqSession.read(); // null for guests

// ---------------------------------------------------------------------------
// CONFIG
// ---------------------------------------------------------------------------
var CENTER = [11.75, 122.25];
var ZOOM = 10;
var TICK_MS = 2000;

var STORAGE_KEY = 'aqone_v3_state';
var LS_LAST_KEY = 'aqone_v3_last';

function $(id) { return document.getElementById(id); }

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------
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

function nextVesselId() {
  var max = 0;
  state.vessels.forEach(function (v) {
    var m = /V-(\d+)/.exec(v.id);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  return 'V-' + pad(max + 1);
}

function nextAlertId() {
  var max = 100;
  state.alerts.forEach(function (a) {
    if (a.id > max) max = a.id;
  });
  return max + 1;
}

// ---------------------------------------------------------------------------
// STATE
// ---------------------------------------------------------------------------
var HOME_PORTS = {
  'Kalibo':              { lat: 11.7059, lng: 122.3693 },
  'New Washington':      { lat: 11.6516, lng: 122.4328 },
  'Batan':               { lat: 11.5857, lng: 122.4863 },
  'Caticlan / Boracay':  { lat: 11.9271, lng: 121.9476 },
  'Ibajay':              { lat: 11.8216, lng: 122.1674 }
};

function patrolFor(home, spread) {
  var p = HOME_PORTS[home] || HOME_PORTS['Kalibo'];
  spread = spread || 0.035;
  return { latMin: p.lat - spread, latMax: p.lat + spread, lngMin: p.lng - spread, lngMax: p.lng + spread };
}

var DEFAULT_VESSELS = [
  { id: 'V-001', name: 'Bangka ni Mang Juan', owner: 'Eddie Magbanua', type: 'Bangka',   home: 'Kalibo',             lat: 11.7180, lng: 122.3550, status: 'active',  heading: 40,  speed: 6 },
  { id: 'V-002', name: 'Bangka ni Kapitan',   owner: 'Ramon Flores',   type: 'Bangka',   home: 'New Washington',     lat: 11.6480, lng: 122.4410, status: 'overdue', heading: 120, speed: 3 },
  { id: 'V-003', name: 'Saging Express',      owner: 'Felix Tambong',  type: 'Cargo',    home: 'Caticlan / Boracay', lat: 11.9350, lng: 121.9400, status: 'active',  heading: 200, speed: 12 },
  { id: 'V-004', name: 'Dagat Boys',          owner: 'Jun Antinero',   type: 'Bangka',   home: 'Batan',              lat: 11.5900, lng: 122.4780, status: 'idle',    heading: 0,   speed: 0 },
  { id: 'V-005', name: 'Winged Galleon',      owner: 'Rosa Dela Cruz', type: 'Trawler',  home: 'New Washington',     lat: 11.7700, lng: 122.2500, status: 'active',  heading: 90,  speed: 8 },
  { id: 'V-006', name: 'Hulugan ni Maria',    owner: 'Maria Yap',      type: 'Speedboat',home: 'Kalibo',             lat: 11.6980, lng: 122.3300, status: 'active',  heading: 260, speed: 15 },
  { id: 'V-007', name: 'Sardine Runner',      owner: 'Berto Salazar',  type: 'Trawler',  home: 'Ibajay',             lat: 11.7900, lng: 122.1400, status: 'idle',    heading: 0,   speed: 0 },
  { id: 'V-008', name: 'Bangka ni Mang Romy', owner: 'Romy Gatchalian',type: 'Bangka',   home: 'New Washington',     lat: 11.6700, lng: 122.4000, status: 'overdue', heading: 330, speed: 3 }
];

var DEFAULT_BUOYS = [
  { id: 'BU-A', name: 'Buoy Alpha',   lat: 11.7500, lng: 122.3200, online: true,  battery: 87, wave: 0.8,  temp: 28.4 },
  { id: 'BU-B', name: 'Buoy Bravo',   lat: 11.9400, lng: 121.9300, online: true,  battery: 64, wave: 1.1,  temp: 28.9 },
  { id: 'BU-C', name: 'Buoy Charlie', lat: 11.6600, lng: 122.4400, online: true,  battery: 91, wave: 0.6,  temp: 28.1 },
  { id: 'BU-D', name: 'Buoy Delta',   lat: 11.6000, lng: 122.5000, online: false, battery: 6,  wave: 0.9,  temp: 28.6 },
  { id: 'BU-E', name: 'Buoy Echo',    lat: 11.8000, lng: 122.1300, online: true,  battery: 14, wave: 0.7,  temp: 28.3 },
  { id: 'BU-F', name: 'Buoy Foxtrot', lat: 11.8200, lng: 122.3500, online: true,  battery: 72, wave: 1.0,  temp: 28.5 }
];

function hydrateVessel(v) {
  v.heading = (typeof v.heading === 'number') ? v.heading : (Math.random() * 360);
  v.speed = (typeof v.speed === 'number') ? v.speed : 6;
  v._patrol = patrolFor(v.home);
  v._lastStatus = v.status;
  return v;
}

var state = {
  vessels: [],
  buoys: [],
  alerts: [],
  advisories: [
    { id: 1, title: 'Small craft advisory — Boracay approaches', date: 'Aug 3, 2026', status: 'published', body: 'Waves up to 2.1 m off Boracay approaches. Pump boats advised to stay within 5 km of shore.' },
    { id: 2, title: 'Municipal catch-reporting drive',            date: 'Aug 2, 2026', status: 'published', body: 'All operators must submit catch reports every Friday before 5 PM.' },
    { id: 3, title: 'New Washington Port — berth maintenance',    date: 'Aug 1, 2026', status: 'draft',     body: 'Slipway C closed 10–14 Aug for concrete works.' }
  ],
  forecast: null,
  activity: [],
  lastTick: Date.now(),
  windDir: 90
};

// ---- persistence ----
function toPlainVessel(v) {
  var plain = {};
  for (var k in v) {
    if (k.charAt(0) !== '_' && v.hasOwnProperty(k)) plain[k] = v[k];
  }
  return plain;
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      vessels: state.vessels.map(toPlainVessel),
      activity: state.activity.slice(0, 40)
    }));
  } catch (err) { /* storage unavailable */ }
}

function loadState() {
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    var saved = JSON.parse(raw);
    if (saved && Array.isArray(saved.vessels) && saved.vessels.length) {
      state.vessels = saved.vessels.map(hydrateVessel);
    }
    if (saved && Array.isArray(saved.activity)) {
      state.activity = saved.activity;
    }
  } catch (err) { /* fall back to defaults */ }
}

// ---- activity log ----
function log(text, kind) {
  kind = kind || 'info';
  state.activity.unshift({ time: Date.now(), text: text, kind: kind });
  if (state.activity.length > 40) state.activity.pop();
}

// ---------------------------------------------------------------------------
// FORECAST (deterministic, simulated)
// ---------------------------------------------------------------------------
function weatherIcon(cond) {
  var s = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">';
  if (cond === 'sun') {
    s += '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>';
  } else if (cond === 'cloud') {
    s += '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>';
  } else if (cond === 'rain') {
    s += '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/><path d="M16 13v3"/><path d="M9 14v3"/><path d="M12 15v4"/>';
  } else if (cond === 'wind') {
    s += '<path d="M17.7 7.7a2.5 2.5 0 1 1-1.8 4.3H2"/><path d="M9.6 4.6A2 2 0 1 1 11 8H2"/><path d="M12.6 19.4A2 2 0 1 0 14 16H2"/>';
  } else { // storm
    s += '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/><path d="m13 11-3 4h4l-3 4"/>';
  }
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
    hours.push({
      time: pad(h) + ':00',
      temp: temp,
      wind: wind,
      wave: wave,
      cond: forecastCond(wind, h, seed)
    });
  }

  var days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var week = [];
  for (var j = 1; j <= 7; j++) {
    var wd = new Date(now.getTime() + j * 86400000);
    var s = j + Math.floor(Date.now() / 86400000) * 7;
    var wWind = Math.round(14 + prand(s) * 16);
    week.push({
      name: (j === 1 ? 'Today' : days[wd.getDay()]),
      tempMin: Math.round(24 + prand(s + 1) * 2),
      tempMax: Math.round(29 + prand(s + 2) * 3),
      wind: wWind,
      wave: Math.round((0.5 + wWind / 38) * 10) / 10,
      cond: forecastCond(wWind, 12, s)
    });
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
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

var vesselLayer = L.layerGroup().addTo(map);
var buoyLayer = L.layerGroup().addTo(map);
var alertLayer = L.layerGroup().addTo(map);

// Aklan fishing-zone boundary (approximate polygon for the prototype)
var AKLAN_BOUNDARY = [
  [11.9674, 121.9248], [11.9200, 122.1200], [11.8700, 122.3000],
  [11.8000, 122.4600], [11.7000, 122.5400], [11.6000, 122.5600],
  [11.5450, 122.4400], [11.5450, 122.2200], [11.5900, 122.0200],
  [11.6600, 121.9000], [11.7800, 121.8800], [11.8900, 121.9050]
];
L.polygon(AKLAN_BOUNDARY, {
  color: '#22c55e',
  weight: 2.5,
  fillColor: '#22c55e',
  fillOpacity: 0.05,
  dashArray: '8 6'
}).bindTooltip('Aklan fishing zone boundary', { permanent: false, direction: 'center' }).addTo(map);

// coordinate + zoom readouts
map.on('mousemove', function (e) {
  $('coords').textContent =
    e.latlng.lat.toFixed(4) + '° N, ' + Math.abs(e.latlng.lng).toFixed(4) + '° E';
});
map.on('zoomend', function () {
  $('map-zoom').textContent = 'z' + map.getZoom();
});

// ---------------------------------------------------------------------------
// MARKERS
// ---------------------------------------------------------------------------
function vesselIcon(v) {
  var n = v.id.replace(/\D/g, '');
  return L.divIcon({
    className: 'lmi',
    html: '<div class="vessel-marker m-' + v.status + '"><span>' + n + '</span></div>',
    iconSize: [22, 22],
    iconAnchor: [11, 22]
  });
}

function buoyIcon(b) {
  return L.divIcon({
    className: 'lmi',
    html: '<div class="buoy-marker ' + (b.online ? 'b-online' : 'b-offline') + '"></div>',
    iconSize: [18, 18],
    iconAnchor: [9, 9]
  });
}

function alertIcon() {
  return L.divIcon({
    className: 'lmi',
    html: '<div class="alert-marker"></div>',
    iconSize: [22, 22],
    iconAnchor: [11, 22]
  });
}

function vesselPopup(v) {
  return (
    '<div class="popup-title">' + v.name + '</div>' +
    '<div class="popup-sub">' + v.id + ' &middot; ' + v.type + '</div>' +
    '<div class="popup-rows">' +
      '<div>Status: <b>' + v.status.toUpperCase() + '</b></div>' +
      '<div>Owner: <b>' + v.owner + '</b></div>' +
      '<div>Home: <b>' + v.home + '</b></div>' +
      '<div>Speed: <b>' + v.speed + ' km/h</b></div>' +
    '</div>' +
    '<div class="popup-actions">' +
      '<button class="btn btn-primary btn-sm" onclick="AqApp.centerVessel(\'' + v.id + '\')">Center map</button>' +
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
    m.on('click', function () { selectVessel(v.id); });
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
    m.on('click', function () { selectVessel(v.id); });
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
  if (el) {
    el.classList.add('marker-hi');
    el.style.zIndex = 2000;
  }
}

function clearHighlight(marker) {
  if (!marker) return;
  var el = marker.getElement();
  if (el) {
    el.classList.remove('marker-hi');
    el.style.zIndex = '';
  }
}

// ---------------------------------------------------------------------------
// SIMULATION
// ---------------------------------------------------------------------------
function moveVessel(v) {
  if (v.status === 'idle') return;

  // gentle heading wander
  v.heading = (v.heading + (Math.random() - 0.5) * 26 + 360) % 360;
  var rad = v.heading * Math.PI / 180;
  var dx = Math.cos(rad) * v.speed * 0.00009;
  var dy = Math.sin(rad) * v.speed * 0.00009;

  var p = v._patrol;
  var nLat = v.lat + dy;
  var nLng = v.lng + dx / Math.cos(v.lat * Math.PI / 180);

  // bounce off patrol-box edges
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
    var alert = {
      id: nextAlertId(),
      code: 'OVERDUE',
      type: 'Overdue vessel',
      msg: v.name + ' has exceeded its expected return window.',
      sev: 'warning',
      vesselId: v.id,
      vesselName: v.name,
      lat: v.lat,
      lng: v.lng,
      time: Date.now()
    };
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

  // vessels
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

    var wasOverdue = v.status === 'overdue';
    moveVessel(v);

    if (v.status === 'overdue') {
      if (Math.random() < 0.012) { recoverVessel(v); }
    } else if (Math.random() < 0.0035) {
      makeOverdue(v);
    }
    refreshVesselMarker(v);
  });

  // buoys
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

  // forecast now drifts
  if (state.forecast) {
    var f = state.forecast.now;
    f.wind = Math.round(clamp(f.wind + (Math.random() - 0.5) * 2.4, 4, 55) * 10) / 10;
    f.gust = Math.round(f.wind * 1.6);
    f.wave = clamp(Math.round((0.5 + f.wind / 40) * 10) / 10, 0.3, 4);
    f.humidity = clamp(Math.round(f.humidity + (Math.random() - 0.5) * 2), 60, 96);
    state.windDir = (state.windDir + (Math.random() - 0.5) * 20 + 360) % 360;
  }

  renderStats();
  renderVessels();
  renderAlerts();
  renderForecast();
  updateSystem();
  saveState();
}

// ---------------------------------------------------------------------------
// TOASTS
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
    $('wind-trend').textContent = dirs[Math.round(state.windDir / 45) % 8] + ' \u2192 ' + state.forecast.now.gust + ' gust';
  }
}

var searchQuery = '';
var statusFilter = 'all';

function renderVessels() {
  var list = $('vessel-list');
  list.innerHTML = '';
  var q = searchQuery.trim().toLowerCase();
  var shown = 0;

  state.vessels.forEach(function (v) {
    var matchesSearch = !q ||
      v.id.toLowerCase().indexOf(q) !== -1 ||
      v.name.toLowerCase().indexOf(q) !== -1 ||
      v.owner.toLowerCase().indexOf(q) !== -1 ||
      v.type.toLowerCase().indexOf(q) !== -1 ||
      v.home.toLowerCase().indexOf(q) !== -1;
    var matchesStatus = statusFilter === 'all' || v.status === statusFilter;

    // highlight / dim markers by search
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
    li.setAttribute('data-id', v.id);
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
    li.addEventListener('click', function () { selectVessel(v.id); });
    list.appendChild(li);
  });

  $('vessel-empty').hidden = shown > 0;
}

function selectVessel(id) {
  state.selectedVessel = id;
  var v = null;
  state.vessels.forEach(function (x) { if (x.id === id) v = x; });
  if (!v) return;
  if (v._marker) {
    map.flyTo([v.lat, v.lng], Math.max(map.getZoom(), 12), { duration: 0.6 });
    v._marker.openPopup();
    highlightMarker(v._marker);
  }
  renderVessels();
}

function renderAlerts() {
  var box = $('alert-list');
  box.innerHTML = '';
  var sev = state.alertSev || 'all';
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
  // open the matching alert marker's popup
  alertLayer.eachLayer(function (lyr) {
    if (lyr.getLatLng().lat === target.lat && lyr.getLatLng().lng === target.lng) {
      lyr.openPopup();
      var el = lyr.getElement();
      if (el) { el.style.zIndex = 2000; }
    }
  });
}

function renderAdvisories() {
  var box = $('advisory-list');
  box.innerHTML = '';
  state.advisories.forEach(function (adv) {
    var div = document.createElement('div');
    div.className = 'advisory-item';
    div.innerHTML =
      '<div class="adv-title"></div>' +
      '<div class="adv-meta"><span></span><span class="adv-status"></span></div>';
    div.querySelector('.adv-title').textContent = adv.title;
    div.querySelector('.adv-meta span').textContent = adv.date + ' · ' + adv.body;
    var st = div.querySelector('.adv-status');
    st.textContent = adv.status;
    st.classList.add(adv.status === 'published' ? 's-published' : 's-draft');
    box.appendChild(div);
  });
}

function renderForecast() {
  if (!state.forecast) return;
  var f = state.forecast.now;

  $('fc-temp').textContent = f.temp.toFixed(1) + '\u00b0C';
  $('fc-desc').textContent = f.desc + ' · ' + (f.cond === 'sun' ? 'clear skies' : f.cond === 'rain' ? 'scattered rain' : f.cond === 'storm' ? 'squally' : f.cond === 'wind' ? 'windy' : 'partly cloudy');
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
  $('last-updated').textContent = timeAgo(state.lastTick);
  $('session-chip').textContent = session ? (session.user + ' (' + session.role + ')') : 'Guest';
}

// ---------------------------------------------------------------------------
// SEARCH + FILTERS + TABS
// ---------------------------------------------------------------------------
function bindControls() {
  var searchInput = $('search');
  var clearBtn = $('search-clear');

  searchInput.addEventListener('input', function () {
    searchQuery = searchInput.value;
    clearBtn.classList.toggle('visible', searchQuery.length > 0);
    renderVessels();
  });
  searchInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && searchQuery.trim()) {
      var first = state.vessels.filter(function (v) {
        return (v.id + ' ' + v.name + ' ' + v.owner + ' ' + v.home + ' ' + v.type).toLowerCase().indexOf(searchQuery.trim().toLowerCase()) !== -1;
      })[0];
      if (first) selectVessel(first.id);
    }
  });
  clearBtn.addEventListener('click', function () {
    searchInput.value = '';
    searchQuery = '';
    clearBtn.classList.remove('visible');
    renderVessels();
  });

  var filterSelect = $('status-filter');
  filterSelect.addEventListener('change', function () {
    statusFilter = filterSelect.value;
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
    tab.addEventListener('click', function () {
      document.querySelectorAll('.tab').forEach(function (t) { t.classList.remove('active'); });
      document.querySelectorAll('.tab-pane').forEach(function (p) { p.classList.remove('active'); });
      tab.classList.add('active');
      $('pane-' + tab.getAttribute('data-tab')).classList.add('active');
    });
  });

  $('kpi-alerts').addEventListener('click', function () {
    document.querySelectorAll('.tab').forEach(function (t) { t.classList.remove('active'); });
    document.querySelectorAll('.tab-pane').forEach(function (p) { p.classList.remove('active'); });
    document.querySelector('.tab[data-tab="alerts"]').classList.add('active');
    $('pane-alerts').classList.add('active');
  });
}

// ---------------------------------------------------------------------------
// HEADER (session)
// ---------------------------------------------------------------------------
function initHeader() {
  var name, role, initial;
  if (session) {
    name = session.name;
    role = session.role;
    initial = name ? name.charAt(0).toUpperCase() : 'U';
    $('logout-btn').textContent = 'Sign out';
    log('Signed in as ' + session.user + ' (' + role + ')', 'ok');
  } else {
    name = 'Guest';
    role = 'Viewer';
    initial = 'G';
    $('logout-btn').textContent = 'Sign in';
  }
  $('user-name').textContent = name;
  $('user-role').textContent = role;
  $('user-avatar').textContent = initial;

  $('logout-btn').addEventListener('click', function () {
    if (session) {
      AqSession.clear();
      log('Signed out', 'info');
      toast('info', 'Signed out', 'Your session has ended.');
      setTimeout(function () { window.location.href = 'login.html'; }, 600);
    } else {
      window.location.href = 'login.html';
    }
  });
}

// ---------------------------------------------------------------------------
// ADD VESSEL MODAL
// ---------------------------------------------------------------------------
function bindModal() {
  var backdrop = $('modal-backdrop');

  function open() { backdrop.hidden = false; $('v-name').focus(); }
  function close() { backdrop.hidden = true; }

  $('add-vessel-btn').addEventListener('click', open);
  $('modal-close').addEventListener('click', close);
  $('modal-cancel').addEventListener('click', close);
  backdrop.addEventListener('click', function (e) { if (e.target === backdrop) close(); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !backdrop.hidden) close();
  });

  $('vessel-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var name = $('v-name').value.trim();
    var type = $('v-type').value;
    var home = $('v-home').value;
    var owner = $('v-owner').value.trim() || 'Unregistered';

    if (!name) {
      $('v-name').classList.add('invalid');
      setTimeout(function () { $('v-name').classList.remove('invalid'); }, 1200);
      return;
    }

    var port = HOME_PORTS[home];
    var vessel = hydrateVessel({
      id: nextVesselId(),
      name: name,
      owner: owner,
      type: type,
      home: home,
      lat: port.lat + (Math.random() - 0.5) * 0.02,
      lng: port.lng + (Math.random() - 0.5) * 0.02,
      status: 'idle',
      heading: Math.random() * 360,
      speed: 0
    });
    state.vessels.push(vessel);
    rebuildVesselMarkers();
    renderVessels();
    renderStats();

    log('Registered vessel ' + vessel.id + ' ' + name, 'info');
    toast('ok', 'Vessel registered', name + ' (' + vessel.id + ') added at ' + home + '.');
    saveState();

    close();
    $('vessel-form').reset();
  });
}

// ---------------------------------------------------------------------------
// PUBLIC API (used by inline onclick handlers)
// ---------------------------------------------------------------------------
var AqApp = {
  centerVessel: function (id) { selectVessel(id); },
  dismissAlert: function (id) {
    var removed = null;
    for (var i = 0; i < state.alerts.length; i++) {
      if (state.alerts[i].id === id) { removed = state.alerts[i]; state.alerts.splice(i, 1); break; }
    }
    if (!removed) return;
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
loadState();
state.vessels = state.vessels.length ? state.vessels : DEFAULT_VESSELS.map(hydrateVessel);
state.buoys = DEFAULT_BUOYS;
if (!state.forecast) genForecast();

state.alerts = [
  { id: 101, code: 'OVERDUE', type: 'Overdue vessel',     msg: 'V-002 has exceeded its expected return window.', sev: 'warning', vesselId: 'V-002', vesselName: 'Bangka ni Kapitan',   lat: 11.6480, lng: 122.4410, time: Date.now() - 2 * 3600000 },
  { id: 102, code: 'EQUIP',   type: 'Equipment failure',  msg: 'Radio and position beacon reporting faults.',      sev: 'warning', vesselId: 'V-008', vesselName: 'Bangka ni Mang Romy', lat: 11.6700, lng: 122.4000, time: Date.now() - 5 * 3600000 },
  { id: 103, code: 'BREACH',  type: 'Zone breach',        msg: 'Vessel detected outside its licensed fishing zone.', sev: 'danger', vesselId: 'V-004', vesselName: 'Dagat Boys',        lat: 11.5900, lng: 122.4780, time: Date.now() - 1 * 3600000 }
];

initHeader();
bindControls();
bindModal();
rebuildVesselMarkers();
rebuildBuoyMarkers();
rebuildAlertMarkers();
renderStats();
renderVessels();
renderAlerts();
renderAdvisories();
renderForecast();
renderActivity();
updateSystem();

// live feed tick
setInterval(tick, TICK_MS);

// last-updated clock (v2 bug fixed: correct element id + runs every second)
setInterval(updateSystem, 1000);

// periodic alert aging refresh
setInterval(renderAlerts, 15000);
