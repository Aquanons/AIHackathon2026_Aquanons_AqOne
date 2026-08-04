(function () {
  'use strict';

  // Failsafe: never leave the operator staring at the loading spinner.
  //
  // The overlay is hidden near the end of this script, so any uncaught error
  // above that point froze the dashboard behind "Loading buoy network data..."
  // with no indication of what went wrong. Registered first, before anything
  // that can throw, so a future breakage degrades to a visible dashboard plus a
  // console error rather than a dead screen.
  window.addEventListener('error', function (event) {
    var overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.classList.add('hidden');
    console.error('[AqOne] Dashboard init failed:', event.message, 'at', event.filename + ':' + event.lineno);
  });

  // ===== CONFIG =====
  // New Washington, Aklan municipal centre (PhilAtlas: 11.6473 N, 122.4356 E).
  // Zoom 11 framed the whole province; 12 frames the municipality and its
  // waters, which is the actual service area.
  const OPS_CENTER = [11.6473, 122.4356];
  const OPS_ZOOM = 12;

  const TILES = {
    streets: {
      url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      attr: '&copy; OpenStreetMap contributors'
    },
    satellite: {
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      attr: '&copy; Esri, Maxar, Earthstar Geographics'
    },
    hybrid: {
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      attr: '&copy; Esri, Maxar, Earthstar Geographics',
      labels: 'https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png',
      labelsAttr: '&copy; CartoDB'
    }
  };

  const PIN_POLL_INTERVAL_MS = 15000;

  // ===== API + AUTH =====
  // API_BASE was previously referenced but never declared in this file - the
  // one in advisoryService.js is scoped inside its IIFE, so every fetch here
  // threw a ReferenceError. The dashboard is served from the same origin as
  // the API, so this is simply the current origin.
  const API_BASE = window.location.origin;

  const TOKEN_KEY = 'aqoneToken';
  const USER_KEY = 'aqoneUser';
  const LOGIN_URL = 'login.html';

  function getToken() {
    return sessionStorage.getItem(TOKEN_KEY) || '';
  }

  function clearSession() {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
  }

  function redirectToLogin() {
    clearSession();
    window.location.replace(LOGIN_URL);
  }

  // Every API route except the auth endpoints requires a bearer token. A 401
  // means the token is missing, expired or invalid - in all three cases the
  // operator needs to log in again, so bounce rather than rendering an empty
  // dashboard that looks like a backend outage.
  function authFetch(path, options) {
    const opts = options || {};
    const headers = Object.assign({ Accept: 'application/json' }, opts.headers || {});
    const token = getToken();
    if (token) headers.Authorization = 'Bearer ' + token;

    return fetch(API_BASE + path, Object.assign({}, opts, { headers: headers }))
      .then(function (res) {
        if (res.status === 401) {
          redirectToLogin();
          throw new Error('Session expired');
        }
        return res;
      });
  }

  // Guard: no token means never logged in, so do not even start the panels.
  if (!getToken()) {
    redirectToLogin();
    return;
  }

  // ===== CURRENT USER =====
  // Populated at login. Falls back to the token-less placeholder only if the
  // stored record is unreadable, so attribution on sea-condition entries is a
  // real account rather than a hardcoded name.
  const CURRENT_USER = (function () {
    try {
      const stored = JSON.parse(sessionStorage.getItem(USER_KEY) || 'null');
      if (stored && stored.id) return stored;
    } catch (err) {
      /* fall through */
    }
    return { id: 'unknown', name: 'Operator' };
  })();

  // ===== USER COLOR HASH =====
  const PIN_PALETTE = [
    '#00bcd4', '#e91e63', '#ff9800', '#8bc34a', '#673ab7',
    '#009688', '#ff5722', '#3f51b5', '#cddc39', '#f06292',
  ];

  function hashUserId(id) {
    let h = 5381;
    for (let i = 0; i < id.length; i++) {
      h = ((h << 5) + h) ^ id.charCodeAt(i);
      h = h >>> 0;
    }
    return PIN_PALETTE[h % PIN_PALETTE.length];
  }

  const CURRENT_USER_COLOR = hashUserId(CURRENT_USER.id);

  // ===== SAMPLE DATA =====
  // Shore gateways (coastal barangay / BFAR / PCG stations) — LoRa mesh exit to backend
  // Shore gateways are ON LAND - they are the mesh's exit to the internet.
  // Coordinates mirror SHORE_STATIONS in backend/app/geo.py, which is the
  // single source of truth for the service area.
  const shoreStations = [
    { name: 'New Washington Municipal Hall', lat: 11.6473, lng: 122.4200, type: 'MDRRMO Station', status: 'active', role: 'Shore gateway' },
    { name: 'Dumaguit Port', lat: 11.6700, lng: 122.4100, type: 'Port Facility', status: 'active', role: 'Shore gateway' },
    { name: 'BFAR Kalibo', lat: 11.7086, lng: 122.3653, type: 'BFAR Station', status: 'warning', role: 'Shore gateway' },
  ];

  // Buoy nodes — GPS, barometer, current sensing, solar + battery, LoRa mesh radio
  const initialBuoys = [
    // All positions are AT SEA inside New Washington's municipal waters,
    // ordered nearshore to offshore. Verified against WATER_POLYGON in
    // backend/app/geo.py - the previous set spanned 55 km of Aklan province
    // and several sat inland over Panay.
    // Two radios per buoy, matching docs/01_ARCHITECTURE.md:
    //   wifiRadius - phone to buoy, WiFi SoftAP. Short: where a phone can hand
    //                over an SOS.
    //   loraRadius - buoy to buoy and buoy to shore gateway. Long: what forms
    //                the relay mesh. These circles overlap; the WiFi ones do not.
    // Positions form a connected chain anchored at a shore station, generated by
    // the same algorithm as the backend (_build_mesh_chain in generator.py).
    { name: 'Buoy Alpha',   id: 'buoy-alpha',   lat: 11.6639, lng: 122.4602, status: 'active',  battery: 87, signal: 'Strong',   pressure: 1008.4, pressureTrend: -1.2, current: '0.6 m/s', currentDir: 'SW',  wifiRadius: 1340, loraRadius: 7023, isGateway: true },
    { name: 'Buoy Bravo',   id: 'buoy-bravo',   lat: 11.6742, lng: 122.4226, status: 'active',  battery: 72, signal: 'Moderate', pressure: 1007.1, pressureTrend: -2.8, current: '0.9 m/s', currentDir: 'S',   wifiRadius: 1330, loraRadius: 6524, isGateway: true },
    { name: 'Buoy Charlie', id: 'buoy-charlie', lat: 11.6346, lng: 122.4744, status: 'warning', battery: 31, signal: 'Weak',     pressure: 1006.3, pressureTrend: -3.4, current: '0.4 m/s', currentDir: 'W',   wifiRadius: 1090, loraRadius: 7282, isGateway: true },
    { name: 'Buoy Delta',   id: 'buoy-delta',   lat: 11.7178, lng: 122.4403, status: 'active',  battery: 94, signal: 'Strong',   pressure: 1008.9, pressureTrend: -0.5, current: '0.3 m/s', currentDir: 'SE',  wifiRadius: 1350, loraRadius: 6146 },
    { name: 'Buoy Echo',    id: 'buoy-echo',    lat: 11.7338, lng: 122.4845, status: 'danger',  battery: 12, signal: 'Lost',     pressure: null,   pressureTrend: null, current: null,     currentDir: null, wifiRadius: 930,  loraRadius: 6752 },
  ];

  // Mesh links are COMPUTED from LoRa range, not hardcoded. The previous list
  // asserted links between buoys that were nowhere near each other, and
  // referenced two shore stations that no longer exist.
  function _metresBetween(aLat, aLng, bLat, bLng) {
    var dLat = (bLat - aLat) * 110574;
    var dLng = (bLng - aLng) * 111320 * Math.cos((aLat + bLat) / 2 * Math.PI / 180);
    return Math.sqrt(dLat * dLat + dLng * dLng);
  }

  // A link exists where the gap is within the lower of the two LoRa ranges -
  // the same rule the backend connectivity tests use.
  const meshLinks = (function () {
    var links = [];
    for (var i = 0; i < initialBuoys.length; i++) {
      for (var j = i + 1; j < initialBuoys.length; j++) {
        var a = initialBuoys[i], b = initialBuoys[j];
        if (_metresBetween(a.lat, a.lng, b.lat, b.lng) <= Math.min(a.loraRadius, b.loraRadius)) {
          links.push([a.name, b.name]);
        }
      }
    }
    // Every buoy in LoRa range of a shore station gets a link to land: this is
    // the mesh's exit to the internet and the reason an SOS ever arrives.
    initialBuoys.forEach(function (buoy) {
      shoreStations.forEach(function (station) {
        if (_metresBetween(buoy.lat, buoy.lng, station.lat, station.lng) <= buoy.loraRadius) {
          links.push([buoy.name, station.name]);
        }
      });
    });
    return links;
  })();

  // Incidents occur at sea within the service area. The Boracay entry was
  // ~50 km outside New Washington and has been removed.
  const incidents = [
    { name: 'Overdue Vessel — San Pedro', lat: 11.766, lng: 122.53, severity: 'danger', date: '2026-08-04', type: 'Overdue Vessel' },
    { name: 'Squall Watch — Sibuyan Sea N', lat: 11.7213, lng: 122.5736, severity: 'warning', date: '2026-08-04', type: 'Squall Nowcast' },
    { name: 'Overdue Vessel — Maria Gracia', lat: 11.6152, lng: 122.5175, severity: 'warning', date: '2026-08-04', type: 'Overdue Vessel' },
  ];

  // Service area = New Washington municipal waters. Mirrors WATER_POLYGON in
  // backend/app/geo.py. The previous ring spanned the whole province, from
  // Boracay in the west to Batan in the east.
  const opsBoundary = [
    [11.6703, 122.4157], [11.6177, 122.4380], [11.5902, 122.4914],
    [11.5911, 122.6286], [11.6330, 122.6721], [11.6813, 122.6355],
    [11.7414, 122.5924], [11.7731, 122.5408], [11.7662, 122.4574],
    [11.7223, 122.4061], [11.6703, 122.4157]
  ];

  // ===== MAP INIT =====
  const map = L.map('map', {
    center: OPS_CENTER,
    zoom: OPS_ZOOM,
    zoomControl: true,
    attributionControl: true,
    maxBounds: [[5, 115], [25, 130]],
    minZoom: 5,
    maxZoom: 18
  });

  const tileLayers = {
    streets: L.tileLayer(TILES.streets.url, { attribution: TILES.streets.attr, maxZoom: 18 }),
    satellite: L.tileLayer(TILES.satellite.url, { attribution: TILES.satellite.attr, maxZoom: 18 }),
    hybrid: L.tileLayer(TILES.hybrid.url, { attribution: TILES.hybrid.attr, maxZoom: 18 }),
    hybridLabels: L.tileLayer(TILES.hybrid.labels, { attribution: TILES.hybrid.labelsAttr, maxZoom: 18, pane: 'shadowPane' })
  };

  let currentBase = 'streets';
  tileLayers.streets.addTo(map);

  // ===== LAYER GROUPS =====
  const gatewayLayer   = L.layerGroup();
  const incidentLayer  = L.layerGroup();
  const buoyLayer      = L.layerGroup();
  const boundaryLayer  = L.layerGroup();
  const pinLayer       = L.layerGroup();
  const vesselLayer    = L.layerGroup();
  const coverageLayer  = L.layerGroup();
  const meshLayer      = L.layerGroup();
  const squallLayer    = L.layerGroup();
  const driftLayer     = L.layerGroup();

  map.createPane('aiContoursPane');
  map.getPane('aiContoursPane').style.zIndex = 430;
  map.createPane('aiTrackPane');
  map.getPane('aiTrackPane').style.zIndex = 440;
  map.createPane('aiSquallPane');
  map.getPane('aiSquallPane').style.zIndex = 450;
  const dangerZoneLayer = L.layerGroup();

  // ===== MARKER CREATION =====
  function createMarkerIcon(type) {
    const colors = { facility: '#3498db', incident: '#e74c3c', buoy: '#9b59b6', vessel: '#22c55e' };
    const color = colors[type] || '#3498db';
    return L.divIcon({
      className: 'custom-marker',
      html: `<div class="marker-pin marker-${type}" style="background:${color}">
        <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5">
          ${type === 'facility'
            ? '<path d="M3 21h18M5 21V7l7-4 7 4v14"/><path d="M9 21v-6h6v6"/>'
            : type === 'incident'
            ? '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>'
            : type === 'vessel'
            ? '<path d="M2 20l2-1h16l2 1"/><path d="M4 20V14l8-6 8 6v6"/><path d="M12 8V4m-4 0h8"/>'
            : '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41m11.32-11.32l1.41-1.41"/>'
          }
        </svg>
      </div>`,
      iconSize: [32, 42],
      iconAnchor: [16, 42],
      popupAnchor: [0, -44]
    });
  }

  function createOverdueIcon() {
    return L.divIcon({
      className: '',
      html: '<div style="position:relative; width:32px; height:32px;">' +
        '<div class="overdue-pulse-ring"></div>' +
        '<div class="overdue-marker-dot"></div>' +
      '</div>',
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    });
  }

  function makePopup(title, rows, badge) {
    let html = `<div class="popup-title">${title}</div>`;
    rows.forEach(([label, val]) => {
      html += `<div class="popup-row"><span>${label}</span><span>${val}</span></div>`;
    });
    if (badge) {
      html += `<div style="margin-top:6px"><span class="popup-badge badge-${badge.cls}">${badge.text}</span></div>`;
    }
    return html;
  }

  // ===== GATEWAY MARKERS =====
  shoreStations.forEach(s => {
    const marker = L.marker([s.lat, s.lng], { icon: createMarkerIcon('facility') })
      .bindPopup(makePopup(s.name, [
        ['Type', s.type],
        ['Role', s.role],
        ['Status', s.status.charAt(0).toUpperCase() + s.status.slice(1)]
      ], { cls: s.status, text: s.status }));
    gatewayLayer.addLayer(marker);
  });

  // ===== BUOY MARKERS =====
  initialBuoys.forEach(b => {
    var extraRows = b.isGateway
      ? [['Role', 'LoRa gateway — mesh exit to shore']]
      : [];
    var pressureRow = b.pressure != null
      ? [['Pressure', b.pressure.toFixed(1) + ' hPa (' + (b.pressureTrend > 0 ? '+' : '') + b.pressureTrend + ')']]
      : [];
    const marker = L.marker([b.lat, b.lng], { icon: createMarkerIcon('buoy') })
      .bindPopup(makePopup(b.name, [
        ['Status', b.status.charAt(0).toUpperCase() + b.status.slice(1)],
        ['Battery', b.battery + '%'],
        ['Signal', b.signal]
      ].concat(pressureRow, extraRows), { cls: b.status, text: b.status }));
    buoyLayer.addLayer(marker);
  });

  // ===== COVERAGE CIRCLES =====
  // Two layers per buoy. The large LoRa rings overlap into a continuous relay
  // fabric; the small WiFi bubbles inside them show where a phone can actually
  // reach a buoy. Drawing only one radius was misleading either way: LoRa alone
  // implies phones connect from 7 km out, WiFi alone makes the mesh look
  // disconnected.
  var coverageCircles = {};
  initialBuoys.forEach(function (b) {
    // LoRa relay range - drawn first so it sits beneath the WiFi bubble.
    var lora = L.circle([b.lat, b.lng], {
      radius: b.loraRadius || 7000,
      color: '#22d3ee',
      fillColor: '#22d3ee',
      fillOpacity: 0.05,
      weight: 1,
      dashArray: '2 6',
      opacity: 0.35
    }).bindTooltip(b.name + ' — LoRa relay range ' + ((b.loraRadius || 7000) / 1000).toFixed(1) + ' km', { sticky: true });
    coverageLayer.addLayer(lora);

    // WiFi SoftAP bubble - where a phone can hand over an SOS.
    var wifi = L.circle([b.lat, b.lng], {
      radius: b.wifiRadius || 1200,
      color: '#60a5fa',
      fillColor: '#60a5fa',
      fillOpacity: 0.14,
      weight: 1.5,
      dashArray: '6 4',
      opacity: 0.55
    }).bindTooltip(b.name + ' — phone contact range ' + ((b.wifiRadius || 1200) / 1000).toFixed(1) + ' km', { sticky: true });
    coverageLayer.addLayer(wifi);

    // Pulse animation targets the WiFi bubble: it marks a phone check-in.
    coverageCircles[b.name] = wifi;
  });

  function pulseCoverageCircle(buoyName) {
    var c = coverageCircles[buoyName];
    if (!c) return;
    c.setStyle({ weight: 4, opacity: 0.9, fillOpacity: 0.2 });
    setTimeout(function () {
      c.setStyle({ weight: 1.5, opacity: 0.4, fillOpacity: 0.08, dashArray: '6 4' });
    }, 2500);
  }

  // ===== MESH NETWORK =====
  var meshPolylines = [];
  function findNode(name) {
    return initialBuoys.find(function (b) { return b.name === name; }) ||
           shoreStations.find(function (s) { return s.name === name; });
  }

  meshLinks.forEach(function (link) {
    var n1 = findNode(link[0]);
    var n2 = findNode(link[1]);
    if (!n1 || !n2) return;
    var line = L.polyline([[n1.lat, n1.lng], [n2.lat, n2.lng]], {
      color: '#22d3ee',
      weight: 1.5,
      opacity: 0.45,
      dashArray: '5 8',
      smoothFactor: 1
    });
    meshLayer.addLayer(line);
    meshPolylines.push(line);
  });

  var gatewayBuoy = initialBuoys.find(function (b) { return b.isGateway; });
  if (gatewayBuoy) {
    var ringIcon = L.divIcon({
      className: '',
      html: '<div class="gateway-ring"></div>',
      iconSize: [44, 44],
      iconAnchor: [22, 22]
    });
    var ringMarker = L.marker([gatewayBuoy.lat, gatewayBuoy.lng], { icon: ringIcon });
    meshLayer.addLayer(ringMarker);
  }

  var meshPath = [];
  meshLinks.forEach(function (link) {
    var n1 = findNode(link[0]);
    var n2 = findNode(link[1]);
    if (!n1 || !n2) return;
    var steps = 25;
    for (var i = 0; i <= steps; i++) {
      var t = i / steps;
      meshPath.push([
        n1.lat + (n2.lat - n1.lat) * t,
        n1.lng + (n2.lng - n1.lng) * t
      ]);
    }
  });

  var meshDot = L.circleMarker([0, 0], {
    radius: 3.5,
    color: '#99f6e4',
    fillColor: '#22d3ee',
    fillOpacity: 0.9,
    weight: 2,
    opacity: 1
  });
  meshLayer.addLayer(meshDot);
  var dotIdx = 0;
  var meshDotInterval = setInterval(function () {
    if (!map.hasLayer(meshLayer)) return;
    dotIdx = (dotIdx + 1) % meshPath.length;
    meshDot.setLatLng(meshPath[dotIdx]);
  }, 60);

  // ===== INCIDENT MARKERS =====
  const incidentDrawerData = [
    { alertType: 'overdue', headerText: 'OVERDUE VESSEL — MISSED EXPECTED CONTACT',
      vesselId: 'V-002', owner: 'Ramon Flores',
      position: '11.7141\u00B0 N, 122.4166\u00B0 E', lat: 11.7141, lng: 122.4166,
      buoy: 'Buoy-B', coverage: 'Last seen within Buoy-B coverage radius \u2014 flagged as overdue',
      confidence: 88, stage: 'Stage 3 \u2014 SCORED ALERT', nextContact: 'Buoy-C \u00b7 10:05 (missed \u2014 47 min)',
      timerBaseline: 47 * 60 },
    { alertType: 'squall', headerText: 'RETURN NOW — SQUALL NOWCAST',
      vesselId: 'ALL', owner: 'Broadcast \u2014 all vessels in contact range',
      position: 'Approach NE \u2014 arrival est. 14:20', lat: 11.7383, lng: 122.5324,
      buoy: 'Buoy-B / Buoy-C', coverage: 'Alert propagated across LoRa mesh \u2014 waiting at every buoy',
      confidence: 88, stage: 'Squall nowcast \u2014 45 min lead', nextContact: 'Delivered to phones on next contact',
      timerBaseline: 12 * 60 },
    { alertType: 'overdue', headerText: 'OVERDUE VESSEL — ESCALATING',
      vesselId: 'V-005', owner: 'Felix Tambong',
      position: '11.6768\u00B0 N, 122.4757\u00B0 E', lat: 11.6768, lng: 122.4757,
      buoy: 'Buoy-A', coverage: 'Last seen within Buoy-A coverage radius \u2014 check-in request outstanding',
      confidence: 64, stage: 'Stage 2 \u2014 check-in requested', nextContact: 'Buoy-A \u00b7 09:15 (missed)',
      timerBaseline: 72 * 60 },
  ];

  const incidentMarkers = [];

  incidents.forEach((inc, idx) => {
    const marker = L.marker([inc.lat, inc.lng], { icon: createMarkerIcon('incident') });
    const drawerData = incidentDrawerData[idx];
    if (drawerData) {
      marker.on('click', function () { openIncidentDrawer(drawerData, marker); });
    }
    incidentLayer.addLayer(marker);
    incidentMarkers.push(marker);
  });

  let apiBuoys = [];
  var dangerZoneRequestId = 0;
  var lastDangerZoneResult = null;
  var dangerZoneCacheKey = 'aqone-last-danger-zone-result-new-washington-grid-v2';

  function readCachedDangerZoneResult() {
    try {
      var cached = JSON.parse(localStorage.getItem(dangerZoneCacheKey));
      return cached && Array.isArray(cached.predictions) ? cached : null;
    } catch (error) {
      return null;
    }
  }

  function cacheDangerZoneResult(result) {
    try {
      localStorage.setItem(dangerZoneCacheKey, JSON.stringify(result));
    } catch (error) {
      console.warn('[AqOne] Could not cache the latest danger-zone scan');
    }
  }

  function escapeDangerZoneText(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderDangerZones(result) {
    var predictions = result.predictions;
    var alertPredictions = predictions.filter(function (prediction) {
      return prediction.level !== 'low';
    });

    dangerZoneLayer.clearLayers();
    var firstPredictionMarker = null;
    predictions.forEach(function (prediction) {
      var circle = L.circle([prediction.lat, prediction.lng], {
        radius: prediction.radius,
        color: prediction.color,
        fillColor: prediction.color,
        fillOpacity: prediction.level === 'danger' ? 0.2 : prediction.level === 'watch' ? 0.12 : 0.05,
        opacity: prediction.level === 'low' ? 0.55 : 0.95,
        weight: prediction.level === 'danger' ? 3 : prediction.level === 'watch' ? 2 : 1.5,
        dashArray: prediction.level === 'danger' ? null : prediction.level === 'watch' ? '7 5' : '4 7',
        className: 'danger-zone-circle danger-zone-circle-' + prediction.level
      });
      var icon = L.divIcon({
        className: '',
        html: '<div class="danger-zone-map-icon danger-zone-map-icon-' + prediction.level + '">' +
          '<span>' + (prediction.level === 'low' ? '&check;' : '!') + '</span><i></i></div>',
        iconSize: [36, 36],
        iconAnchor: [18, 18]
      });
      var marker = L.marker([prediction.lat, prediction.lng], {
        icon: icon,
        interactive: true,
        zIndexOffset: 700
      });
      var reasons = prediction.reasons.map(escapeDangerZoneText).join(' &middot; ');
      var popup = '<div class="popup-title" style="color:' + prediction.color + ';">' +
        escapeDangerZoneText(prediction.label) + ' Zone</div>' +
        '<div class="popup-row"><span>Area</span><span>' + escapeDangerZoneText(prediction.name) + '</span></div>' +
        '<div class="popup-row"><span>Coordinates</span><span>' + prediction.lat.toFixed(3) + '\u00b0, ' + prediction.lng.toFixed(3) + '\u00b0</span></div>' +
        '<div class="popup-row"><span>Hazard probability</span><span style="font-weight:800;color:' + prediction.color + ';">' + prediction.score + '%</span></div>' +
        '<div class="popup-row"><span>Model probability</span><span>' + prediction.modelProbability + '%</span></div>' +
        '<div class="popup-row"><span>Live wind / gust</span><span>' + Number(prediction.features.wind_speed_10m).toFixed(1) + ' / ' + Number(prediction.features.wind_gusts_10m).toFixed(1) + ' km/h</span></div>' +
        '<div class="popup-row"><span>Live wave / period</span><span>' + Number(prediction.features.wave_height).toFixed(2) + ' m / ' + Number(prediction.features.wave_period).toFixed(1) + ' s</span></div>' +
        '<div class="popup-row"><span>GEBCO depth</span><span>' + prediction.depthM.toFixed(0) + ' m</span></div>' +
        '<div class="popup-row"><span>Radius</span><span>' + (prediction.radius / 1000).toFixed(1) + ' km</span></div>' +
        '<div class="popup-row"><span>Warning trigger</span><span>' + escapeDangerZoneText(prediction.trigger) + '</span></div>' +
        '<div class="popup-divider"></div>' +
        '<div style="font-size:11px;line-height:1.45;color:#d1d5db;">' + reasons + '</div>' +
        '<div style="margin-top:7px;font-size:10px;color:#9ca3af;">' + escapeDangerZoneText(prediction.source) + '<br>' +
        escapeDangerZoneText(result.modelType) + ' · ' + escapeDangerZoneText(result.modelVersion) + '<br>' +
        '2025 holdout F1: ' + Number(result.metrics.f1).toFixed(3) + ' · ' + escapeDangerZoneText(result.buoySource) + '</div>' +
        '<div style="margin-top:7px"><span class="popup-badge badge-danger">EXPERIMENTAL · NOT FOR NAVIGATION</span></div>';

      circle.bindPopup(popup);
      marker.bindPopup(popup);
      circle.bindTooltip(prediction.name + ' · ' + prediction.score + '%', {
        direction: 'top',
        sticky: true
      });
      dangerZoneLayer.addLayer(circle);
      dangerZoneLayer.addLayer(marker);
      if (!firstPredictionMarker) firstPredictionMarker = marker;
    });

    if (firstPredictionMarker && new URLSearchParams(window.location.search).get('previewDangerZone') === '1') {
      firstPredictionMarker.openPopup();
    }

    var statusText = document.getElementById('danger-zone-status-text');
    if (statusText) {
      var dangerCount = alertPredictions.filter(function (prediction) {
        return prediction.level === 'danger';
      }).length;
      var watchCount = alertPredictions.length - dangerCount;
      var updatedAt = new Date(result.fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      statusText.textContent = dangerCount + ' danger · ' + watchCount + ' watch · ' + predictions.length + ' zones · Live ' + updatedAt;
    }
    if (statusText) {
      var scanUpdatedAt = new Date(result.fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      statusText.textContent = result.dangerCount + ' danger · ' + result.watchCount + ' watch · ' +
        result.scannedCount + ' near-shore cells scanned · strongest ' + result.strongestProbability + '% · Live ' + scanUpdatedAt;
    }
  }

  async function refreshDangerZones() {
    var statusText = document.getElementById('danger-zone-status-text');
    var statusCard = document.getElementById('danger-zone-status');
    var refreshButton = document.getElementById('danger-zone-refresh');
    var requestId = ++dangerZoneRequestId;
    if (!lastDangerZoneResult) lastDangerZoneResult = readCachedDangerZoneResult();
    if (lastDangerZoneResult) {
      renderDangerZones(lastDangerZoneResult);
    } else {
      dangerZoneLayer.clearLayers();
    }
    if (statusText) statusText.textContent = lastDangerZoneResult ?
      'Refreshing live data \u00b7 Existing real-data zones remain visible' :
      'Loading live weather and marine observations...';
    if (statusCard) statusCard.classList.remove('danger-zone-status-error');
    if (refreshButton) refreshButton.classList.add('is-refreshing');
    try {
      var result = await window.AqOneDangerZonePredictor.predictLive(apiBuoys);
      if (requestId !== dangerZoneRequestId) return;
      lastDangerZoneResult = result;
      cacheDangerZoneResult(result);
      renderDangerZones(result);
    } catch (error) {
      if (requestId !== dangerZoneRequestId) return;
      if (lastDangerZoneResult) {
        renderDangerZones(lastDangerZoneResult);
        if (statusText) statusText.textContent = 'Live refresh unavailable \u00b7 Showing last successful real-data scan';
        if (statusCard) statusCard.classList.add('danger-zone-status-error');
        console.warn('[AqOne] Danger-zone refresh unavailable:', error.message);
        return;
      }
      dangerZoneLayer.clearLayers();
      if (statusText) statusText.textContent = 'Live data unavailable · No hazard zones shown';
      if (statusCard) statusCard.classList.add('danger-zone-status-error');
      console.warn('[AqOne] Danger-zone model unavailable:', error.message);
    } finally {
      if (requestId === dangerZoneRequestId && refreshButton) {
        refreshButton.classList.remove('is-refreshing');
      }
    }
  }

  // ===== BOUNDARY =====
  const boundaryPoly = L.polygon(opsBoundary, {
    color: '#2ecc71',
    weight: 2.5,
    fillColor: '#2ecc71',
    fillOpacity: 0.06,
    dashArray: '8 6',
    className: 'ops-boundary'
  }).bindTooltip('Municipal Waters \u2014 Aqone Coverage Area', { permanent: true, direction: 'center', className: 'boundary-tooltip' });
  boundaryLayer.addLayer(boundaryPoly);

  // Add layers to map (checked toggles by default)
  gatewayLayer.addTo(map);
  incidentLayer.addTo(map);
  buoyLayer.addTo(map);
  pinLayer.addTo(map);
  vesselLayer.addTo(map);
  coverageLayer.addTo(map);
  squallLayer.addTo(map);
  driftLayer.addTo(map);
  boundaryLayer.addTo(map);
  dangerZoneLayer.addTo(map);
  refreshDangerZones();

  // ===== PIN TOOL (local-only, no backend dependency) =====
  let pinModeActive = false;
  let panModeActive = true;
  const pinBtn = document.getElementById('rail-btn-pin');
  const panBtn  = document.getElementById('rail-btn-pan');
  const mapEl  = document.getElementById('map');

  const pinMarkers = {};

  function relativeTime(date) {
    const secs = Math.floor((Date.now() - date) / 1000);
    if (secs < 10)  return 'just now';
    if (secs < 60)  return secs + ' secs ago';
    const mins = Math.floor(secs / 60);
    if (mins < 60)  return mins + ' min' + (mins === 1 ? '' : 's') + ' ago';
    const hrs = Math.floor(mins / 60);
    if (hrs  < 24)  return hrs  + ' hr'  + (hrs  === 1 ? '' : 's') + ' ago';
    const days = Math.floor(hrs / 24);
    return days + ' day' + (days === 1 ? '' : 's') + ' ago';
  }

  function createPinIcon(color) {
    return L.divIcon({
      className: 'user-pin-marker',
      html: `<div class="user-pin-dot" style="background:${color}"></div>`,
      iconSize: [18, 18],
      iconAnchor: [9, 9],
      popupAnchor: [0, -12]
    });
  }

  function dropLocalPin(latlng) {
    const id = 'local-' + Date.now();
    const color = CURRENT_USER_COLOR;
    const createdAt = Date.now();
    const popupHtml =
      `<div class="popup-title">
        <span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:${color};vertical-align:middle;margin-right:6px;border:2px solid rgba(255,255,255,0.7);"></span>${CURRENT_USER.name}
      </div>
      <div class="popup-row"><span>Pinned</span><span>just now</span></div>
      <div class="popup-row"><span>Lat</span><span>${latlng.lat.toFixed(5)}</span></div>
      <div class="popup-row"><span>Lng</span><span>${latlng.lng.toFixed(5)}</span></div>
      <div class="pin-popup-footer" id="pin-footer-${id}">
        <button class="pin-delete-btn" data-pin-id="${id}" data-action="delete-init">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14H6L5 6"/>
            <path d="M10 11v6"/><path d="M14 11v6"/>
            <path d="M9 6V4h6v2"/>
          </svg>
          Delete
        </button>
      </div>`;

    const marker = L.marker([latlng.lat, latlng.lng], { icon: createPinIcon(color) });
    marker.bindPopup(popupHtml);

    marker.on('popupopen', function () {
      const container = marker.getPopup().getElement();
      if (!container) return;
      container.addEventListener('click', function handleLocalDelete(e) {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const footer = container.querySelector(`#pin-footer-${id}`);
        if (btn.dataset.action === 'delete-init') {
          footer.innerHTML =
            `<div class="pin-confirm-row">
               <span class="pin-confirm-label">Delete this pin?</span>
               <button class="pin-confirm-yes" data-action="delete-confirm">Yes</button>
               <button class="pin-confirm-no"  data-action="delete-cancel">No</button>
             </div>`;
          marker.getPopup().update();
        }
        if (btn.dataset.action === 'delete-confirm') {
          pinLayer.removeLayer(marker);
          delete pinMarkers[id];
        }
        if (btn.dataset.action === 'delete-cancel') {
          footer.innerHTML =
            `<button class="pin-delete-btn" data-pin-id="${id}" data-action="delete-init">Delete</button>`;
          marker.getPopup().update();
        }
      });
    });

    pinLayer.addLayer(marker);
    pinMarkers[id] = marker;
    marker.openPopup();
    void createdAt;
    return marker;
  }

  function activatePinMode() {
    pinModeActive = true;
    pinBtn.classList.add('pin-mode-active');
    mapEl.classList.add('pin-mode');
    deactivatePanMode();
    if (activePanel) closePanel();
  }

  function deactivatePinMode() {
    pinModeActive = false;
    pinBtn.classList.remove('pin-mode-active');
    mapEl.classList.remove('pin-mode');
  }

  function activatePanMode() {
    panModeActive = true;
    panBtn.classList.add('active');
  }

  function deactivatePanMode() {
    panModeActive = false;
    panBtn.classList.remove('active');
  }

  // ===== MEASURE TOOL =====
  const MEASURE_COLOR   = '#2ecc71';
  const MEASURE_PREVIEW = 'rgba(46,204,113,0.55)';

  function haversineKm(a, b) {
    const R = 6371;
    const dLat = (b.lat - a.lat) * Math.PI / 180;
    const dLng = (b.lng - a.lng) * Math.PI / 180;
    const sinDLat = Math.sin(dLat / 2);
    const sinDLng = Math.sin(dLng / 2);
    const c = sinDLat * sinDLat +
              Math.cos(a.lat * Math.PI / 180) *
              Math.cos(b.lat * Math.PI / 180) *
              sinDLng * sinDLng;
    return R * 2 * Math.atan2(Math.sqrt(c), Math.sqrt(1 - c));
  }

  function fmtKm(km) { return km.toFixed(3) + ' km'; }

  let measureActive   = false;
  let measureFinished = false;
  const measurePts    = [];
  const measureLayer  = L.layerGroup().addTo(map);

  let mPolyline   = null;
  let mPreview    = null;
  let mTooltips   = [];
  let mVertices   = [];

  const measureBtn  = document.getElementById('rail-btn-measure');
  const measureHud  = document.getElementById('measure-hud');
  const hudTotal    = document.getElementById('measure-hud-total');
  const panelTotal  = document.getElementById('measure-total');
  const panelCount  = document.getElementById('measure-point-count');
  const btnFinish   = document.getElementById('btn-measure-finish');
  const btnClear    = document.getElementById('btn-measure-clear');

  let mDblClickGuard = false;

  function measureUpdateUI() {
    const n   = measurePts.length;
    let total = 0;
    for (let i = 1; i < n; i++) total += haversineKm(measurePts[i - 1], measurePts[i]);
    const fmt = fmtKm(total);

    panelTotal.textContent = fmt;
    hudTotal.textContent   = fmt;
    panelCount.textContent = n + (n === 1 ? ' pt' : ' pts');

    btnFinish.disabled = n < 2 || measureFinished;
    btnClear.disabled  = n === 0;
  }

  function measureAddVertexMarker(latlng, isFirst) {
    const icon = L.divIcon({
      className: '',
      html: `<div class="measure-vertex${isFirst ? ' measure-vertex-first' : ''}"></div>`,
      iconSize: [10, 10],
      iconAnchor: [5, 5]
    });
    const m = L.marker(latlng, { icon, interactive: false, zIndexOffset: 500 });
    measureLayer.addLayer(m);
    mVertices.push(m);
  }

  function measureAddSegmentLabel(a, b, distKm) {
    const mid = L.latLng((a.lat + b.lat) / 2, (a.lng + b.lng) / 2);
    const tt  = L.tooltip({
      permanent: true,
      direction: 'center',
      offset: [0, 0],
      className: 'measure-label',
      interactive: false
    })
      .setLatLng(mid)
      .setContent(fmtKm(distKm))
      .addTo(map);
    mTooltips.push(tt);
  }

  function measureRedrawPolyline() {
    if (mPolyline) { measureLayer.removeLayer(mPolyline); mPolyline = null; }
    if (measurePts.length < 2) return;
    mPolyline = L.polyline(measurePts, {
      color: MEASURE_COLOR,
      weight: 3,
      opacity: 0.9,
      dashArray: measureFinished ? null : '8 5',
      lineCap: 'round',
      lineJoin: 'round'
    });
    measureLayer.addLayer(mPolyline);
  }

  function measureClearLabels() {
    mTooltips.forEach(t => map.removeLayer(t));
    mTooltips = [];
  }

  function measureClearVertices() {
    mVertices.forEach(m => measureLayer.removeLayer(m));
    mVertices = [];
  }

  function measureRebuildLabels() {
    measureClearLabels();
    for (let i = 1; i < measurePts.length; i++) {
      measureAddSegmentLabel(measurePts[i - 1], measurePts[i], haversineKm(measurePts[i - 1], measurePts[i]));
    }
  }

  function measureAddPoint(latlng) {
    if (measureFinished) return;
    const isFirst = measurePts.length === 0;
    measurePts.push(latlng);
    measureAddVertexMarker(latlng, isFirst);
    if (measurePts.length >= 2) {
      measureRebuildLabels();
    }
    measureRedrawPolyline();
    measureUpdateUI();
  }

  function measureClearPreview() {
    if (mPreview) { measureLayer.removeLayer(mPreview); mPreview = null; }
  }

  function measureUpdatePreview(latlng) {
    if (!measureActive || measureFinished || measurePts.length === 0) { measureClearPreview(); return; }
    const last = measurePts[measurePts.length - 1];
    measureClearPreview();
    mPreview = L.polyline([last, latlng], {
      color: MEASURE_PREVIEW,
      weight: 2,
      dashArray: '5 6',
      interactive: false
    });
    measureLayer.addLayer(mPreview);
  }

  function measureClearAll() {
    measurePts.length = 0;
    measureFinished   = false;
    measureClearPreview();
    measureClearLabels();
    measureClearVertices();
    if (mPolyline) { measureLayer.removeLayer(mPolyline); mPolyline = null; }
    measureUpdateUI();
  }

  function measureFinish() {
    if (measurePts.length < 2 || measureFinished) return;
    measureFinished = true;
    measureClearPreview();
    measureRedrawPolyline();
    measureUpdateUI();
    map.off('mousemove', onMeasureMouseMove);
  }

  function activateMeasureMode() {
    measureActive = true;
    measureFinished = false;
    measureBtn.classList.add('measure-mode-active');
    mapEl.classList.add('measure-mode');
    measureHud.classList.add('visible');
    deactivatePanMode();
    map.on('mousemove', onMeasureMouseMove);
    measureUpdateUI();
  }

  function deactivateMeasureMode() {
    measureActive = false;
    measureBtn.classList.remove('measure-mode-active');
    mapEl.classList.remove('measure-mode');
    measureHud.classList.remove('visible');
    measureClearPreview();
    map.off('mousemove', onMeasureMouseMove);
  }

  function onMeasureMouseMove(e) {
    measureUpdatePreview(e.latlng);
  }

  btnFinish.addEventListener('click', measureFinish);
  btnClear.addEventListener('click', () => {
    measureClearAll();
    if (measureActive) {
      map.on('mousemove', onMeasureMouseMove);
    }
  });

  // ===== LAYER SWITCHER =====
  function switchLayer(name) {
    if (currentBase === name) return;
    map.removeLayer(tileLayers[currentBase]);
    if (currentBase === 'hybrid') map.removeLayer(tileLayers.hybridLabels);
    tileLayers[name].addTo(map);
    if (name === 'hybrid') tileLayers.hybridLabels.addTo(map);
    currentBase = name;
    document.querySelectorAll('.layer-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.layer === name);
    });
  }

  document.querySelectorAll('.layer-btn').forEach(btn => {
    btn.addEventListener('click', () => switchLayer(btn.dataset.layer));
  });

  // ===== RAIL PANEL SYSTEM =====
  const toolPanelCard  = document.getElementById('tool-panel-card');
  const toolPanelTitle = document.getElementById('tool-panel-title');
  const railBtns       = document.querySelectorAll('.rail-btn');
  const panelContents  = document.querySelectorAll('.rail-panel-content');
  const panelCloseBtns = document.querySelectorAll('.rail-panel-close');

  let activePanel = null;

  // ===== TOOLBOX SCROLL OVERFLOW =====
  (function initToolboxScroll() {
    var toolboxBody = document.querySelector('.toolbox-body');
    var toolboxCard = document.querySelector('.toolbox-card');
    if (!toolboxBody || !toolboxCard) return;

    function checkOverflow() {
      var hasOverflow = toolboxBody.scrollWidth > toolboxBody.clientWidth + 2;
      toolboxCard.classList.toggle('has-overflow', hasOverflow);
    }

    function updateFade() {
      var atEnd = toolboxBody.scrollLeft + toolboxBody.clientWidth >= toolboxBody.scrollWidth - 4;
      toolboxCard.classList.toggle('has-overflow', !atEnd && toolboxBody.scrollWidth > toolboxBody.clientWidth + 2);
    }

    toolboxBody.addEventListener('scroll', updateFade, { passive: true });
    toolboxBody.addEventListener('wheel', function (e) {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault();
        toolboxBody.scrollLeft += e.deltaY;
      }
    }, { passive: false });
    window.addEventListener('resize', checkOverflow);
    checkOverflow();
  })();

  const PANEL_TITLES = { layers: 'Operational Layers', measure: 'Measure Distance', buoys: 'Buoy Network Health', advisories: 'Maritime Advisories' };

  function openPanel(panelId) {
    panelContents.forEach(el => el.classList.toggle('active', el.id === 'panel-' + panelId));
    railBtns.forEach(btn => {
      if (btn.dataset.panel === 'layers' || btn.dataset.panel === 'buoys' || btn.dataset.panel === 'advisories') {
        btn.classList.toggle('active', btn.dataset.panel === panelId);
      }
    });
    toolPanelTitle.textContent = PANEL_TITLES[panelId] || 'Tool Panel';
    toolPanelCard.classList.remove('collapsed');
    activePanel = panelId;
    if (panelId === 'advisories') renderAdvisoryList();
    if (panelId === 'buoys') updateBuoySync();
  }

  function closePanel() {
    toolPanelCard.classList.add('collapsed');
    railBtns.forEach(btn => {
      if (btn.dataset.panel === 'layers' || btn.dataset.panel === 'buoys' || btn.dataset.panel === 'advisories') btn.classList.remove('active');
    });
    if (panModeActive) panBtn.classList.add('active');
    panelContents.forEach(el => el.classList.remove('active'));
    activePanel = null;
  }

  railBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const panelId = btn.dataset.panel;

      if (panelId === 'pan') {
        if (!panModeActive) {
          if (pinModeActive) { deactivatePinMode(); }
          if (measureActive) {
            deactivateMeasureMode();
            measureClearAll();
            if (activePanel === 'measure') closePanel();
          }
          activatePanMode();
        }
        return;
      }

      if (panelId === 'pin') {
        if (pinModeActive) {
          deactivatePinMode();
          activatePanMode();
        } else {
          if (measureActive) {
            deactivateMeasureMode();
            measureClearAll();
            if (activePanel === 'measure') closePanel();
          }
          activatePinMode();
        }
        return;
      }

      if (panelId === 'measure') {
        if (activePanel === 'measure') {
          closePanel();
          deactivateMeasureMode();
          measureClearAll();
          activatePanMode();
        } else {
          if (pinModeActive) { deactivatePinMode(); }
          openPanel('measure');
          activateMeasureMode();
        }
        return;
      }

      if (!panelId) return;

      if (activePanel === panelId) {
        closePanel();
      } else {
        openPanel(panelId);
      }
    });
  });

  panelCloseBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      if (activePanel === 'measure') { deactivateMeasureMode(); activatePanMode(); }
      closePanel();
    });
  });

  // Map click
  map.on('click', function (e) {
    if (mDblClickGuard) return;
    if (pinModeActive) {
      dropLocalPin(e.latlng);
      deactivatePinMode();
      activatePanMode();
    } else if (measureActive && !measureFinished) {
      measureAddPoint(e.latlng);
    } else if (activePanel && !measureActive) {
      closePanel();
    }
  });

  map.on('dblclick', function (e) {
    if (!measureActive || measureFinished) return;
    mDblClickGuard = true;
    setTimeout(() => { mDblClickGuard = false; }, 300);
    measureFinish();
    L.DomEvent.stopPropagation(e);
  });

  // ===== TOGGLE LAYERS =====
  function toggleLayer(checkboxId, layer) {
    const el = document.getElementById(checkboxId);
    if (!el) return;
    el.addEventListener('change', function () {
      if (this.checked) { layer.addTo(map); } else { map.removeLayer(layer); }
    });
  }

  toggleLayer('toggle-gateways',  gatewayLayer);
  toggleLayer('toggle-vessels',   vesselLayer);
  toggleLayer('toggle-incidents', incidentLayer);
  toggleLayer('toggle-danger-zones', dangerZoneLayer);
  toggleLayer('toggle-buoys',     buoyLayer);
  toggleLayer('toggle-coverage',  coverageLayer);
  toggleLayer('toggle-mesh',      meshLayer);
  toggleLayer('toggle-squall',    squallLayer);
  toggleLayer('toggle-drift',     driftLayer);
  toggleLayer('toggle-boundary',  boundaryLayer);
  toggleLayer('toggle-pins',      pinLayer);

  var dangerZoneRefresh = document.getElementById('danger-zone-refresh');
  if (dangerZoneRefresh) {
    dangerZoneRefresh.addEventListener('click', function () {
      refreshDangerZones();
    });
  }

  // ===== STATS PANEL =====
  const statsWidget = document.getElementById('stats-widget');
  const statsMinimizeBtn = document.getElementById('stats-minimize');
  const statsBody = document.getElementById('stats-body');
  let statsMinimized = false;

  if (statsMinimizeBtn) {
    statsMinimizeBtn.addEventListener('click', () => {
      statsMinimized = !statsMinimized;
      if (statsWidget) statsWidget.classList.toggle('minimized', statsMinimized);
      statsMinimizeBtn.innerHTML = statsMinimized ? '+' : '&minus;';
    });
  }

  // Active alerts card click
  const statAlertsCard = document.querySelector('.stat-card.stat-alerts');
  if (statAlertsCard) {
    statAlertsCard.style.cursor = 'pointer';
    statAlertsCard.addEventListener('click', function() {
      statsTabs.forEach(t => t.classList.remove('active'));
      tabContents.forEach(tc => tc.classList.remove('active'));
      const alertsTab = document.querySelector('.stats-tab[data-tab="alerts"]');
      const alertsTabContent = document.getElementById('tab-alerts');
      if (alertsTab) alertsTab.classList.add('active');
      if (alertsTabContent) alertsTabContent.classList.add('active');
      if (statsMinimized && statsWidget) { statsMinimized = false; statsWidget.classList.remove('minimized'); if (statsMinimizeBtn) statsMinimizeBtn.innerHTML = '&minus;'; }
    });
  }

  // ===== LEGEND =====
  const legendCard = document.querySelector('.map-legend');
  const legendToggle = document.getElementById('legend-toggle');
  let legendCollapsed = false;

  if (legendToggle) {
    legendToggle.addEventListener('click', () => {
      legendCollapsed = !legendCollapsed;
      if (legendCard) legendCard.classList.toggle('collapsed', legendCollapsed);
      legendToggle.innerHTML = legendCollapsed ? '+' : '&minus;';
    });
  }

  // ===== TAB SWITCHING =====
  const statsTabs = document.querySelectorAll('.stats-tab');
  const tabContents = document.querySelectorAll('.tab-content');

  statsTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      statsTabs.forEach(t => t.classList.remove('active'));
      tabContents.forEach(tc => tc.classList.remove('active'));
      tab.classList.add('active');
      const targetContent = document.getElementById('tab-' + tab.dataset.tab);
      if (targetContent) targetContent.classList.add('active');
    });
  });

  // ===== VESSEL DATA (phone–buoy contact events) =====
  const vessels = [
    { name: 'Sta. Maria',      id: 'V-001', owner: 'Juan dela Cruz', status: 'in-coverage',     checkin: '2 minutes ago',     lat: 11.6615, lng: 122.4499, buoy: 'Buoy-A', next: 'Buoy-D \u00b7 10:15' },
    { name: 'San Pedro',       id: 'V-002', owner: 'Ramon Flores',   status: 'overdue',         checkin: '47 minutes ago',    lat: 11.7141, lng: 122.4166, buoy: 'Buoy-B', next: 'Buoy-C \u00b7 10:05 (MISSED)' },
    { name: 'Birhen sa Regla', id: 'V-003', owner: 'Eddie Magbanua', status: 'out-of-coverage', checkin: '1 hour ago',        lat: 11.7191, lng: 122.4619, buoy: null,    next: 'No expected contact' },
    { name: 'Sto. Nino',       id: 'V-004', owner: 'Rodel Javines',  status: 'in-coverage',     checkin: '5 minutes ago',     lat: 11.6975, lng: 122.4698, buoy: 'Buoy-C', next: 'Buoy-A \u00b7 10:40' },
    { name: 'Maria Gracia',    id: 'V-005', owner: 'Felix Tambong',  status: 'overdue',         checkin: '1 hour 12 minutes ago', lat: 11.6768, lng: 122.4757, buoy: 'Buoy-A', next: 'Buoy-A \u00b7 09:15 (MISSED)' },
  ];

  function vesselStatusBadge(status) {
    const map = { 'in-coverage': ['In Coverage', 'status-green'], 'out-of-coverage': ['Out of Coverage', 'status-gray'], 'overdue': ['Overdue', 'status-red'] };
    const [label, cls] = map[status] || ['', ''];
    return `<span class="status-badge ${cls}">${label}</span>`;
  }

  const overdueVessels = vessels.filter(function (v) { return v.status === 'overdue'; });
  const overdueDrawerData = {
    'V-002': {
      alertType: 'overdue', headerText: 'OVERDUE VESSEL — MISSED EXPECTED CONTACT',
      vesselId: 'V-002', owner: 'Ramon Flores',
      position: '11.7141\u00B0 N, 122.4166\u00B0 E',
      timerBaseline: 47 * 60,
      buoy: 'Buoy-B', coverage: 'Last seen within Buoy-B coverage radius \u2014 flagged as overdue',
      confidence: 88, stage: 'Stage 3 \u2014 SCORED ALERT', nextContact: 'Buoy-C \u00b7 10:05 (missed \u2014 47 min)'
    },
    'V-005': {
      alertType: 'overdue', headerText: 'OVERDUE VESSEL — ESCALATING',
      vesselId: 'V-005', owner: 'Felix Tambong',
      position: '11.6768\u00B0 N, 122.4757\u00B0 E',
      timerBaseline: 72 * 60,
      buoy: 'Buoy-A', coverage: 'Last seen within Buoy-A coverage radius \u2014 check-in request outstanding',
      confidence: 64, stage: 'Stage 2 \u2014 check-in requested', nextContact: 'Buoy-A \u00b7 09:15 (missed)'
    }
  };

  const vesselMarkers = {};

  overdueVessels.forEach(function (v) {
    var marker = L.marker([v.lat, v.lng], { icon: createOverdueIcon() });
    marker.on('click', function () {
      var data = overdueDrawerData[v.id];
      if (data) openIncidentDrawer(data, marker);
    });
    vesselLayer.addLayer(marker);
    vesselMarkers[v.id] = marker;
  });

  var activeVessels = vessels.filter(function (v) { return v.status === 'in-coverage' || v.status === 'out-of-coverage'; });
  activeVessels.forEach(function (v) {
    var statusInfo = vesselStatusBadge(v.status);
    var marker = L.marker([v.lat, v.lng], { icon: createMarkerIcon('vessel') });
    marker.bindPopup(makePopup(v.name, [
      ['ID', v.id],
      ['Owner', v.owner],
      ['Status', statusInfo],
      ['Last Contact', v.checkin],
      ['Last Buoy', v.buoy || 'N/A'],
      ['Expected Next', v.next]
    ]));
    vesselLayer.addLayer(marker);
    vesselMarkers[v.id] = marker;
  });

  function renderVessels(filter) {
    const list = document.getElementById('vessel-list');
    const filtered = filter === 'all' ? vessels : vessels.filter(v => v.status === filter);
    var statusPriority = { 'overdue': 0, 'in-coverage': 1, 'out-of-coverage': 2 };
    var sorted = filtered.slice().sort(function (a, b) {
      return (statusPriority[a.status] || 9) - (statusPriority[b.status] || 9);
    });
    list.innerHTML = sorted.map(v => `
      <div class="vessel-row${v.status === 'overdue' ? ' vessel-overdue' : ''}" data-vessel-id="${v.id}">
        <div class="vessel-info">
          <div class="vessel-name">${v.name} (${v.id})</div>
          <div class="vessel-owner">${v.owner}</div>
          <div class="vessel-checkin">Last contact: ${v.checkin}</div>
          <div class="vessel-next">Expected next: ${v.next}</div>
        </div>
        <div class="vessel-status">
          ${vesselStatusBadge(v.status)}
        </div>
      </div>
    `).join('');

    list.querySelectorAll('.vessel-row').forEach(row => {
      row.addEventListener('click', () => {
        var v = vessels.find(x => x.id === row.dataset.vesselId);
        if (!v) return;
        if (v.status === 'overdue') {
          var data = overdueDrawerData[v.id];
          if (data) openIncidentDrawer(data, null);
        } else {
          map.setView([v.lat, v.lng], 14, { animate: true, duration: 1 });
          var vm = vesselMarkers[v.id];
          if (vm) vm.openPopup();
        }
      });
    });
  }

  const vesselFilters = document.getElementById('vessel-filters');
  vesselFilters.addEventListener('click', (e) => {
    const btn = e.target.closest('.vessel-filter');
    if (!btn) return;
    vesselFilters.querySelectorAll('.vessel-filter').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderVessels(btn.dataset.filter);
  });

  renderVessels('all');

  const overdueCount = vessels.filter(v => v.status === 'overdue').length;
  document.getElementById('badge-vessels').textContent = overdueCount;

  // ===== ALERT DATA (confidence-scored, escalation ladder) =====
  const alertData = [
    { type: 'overdue-vessel', desc: 'Overdue \u2014 "San Pedro" (V-002) missed expected contact at Buoy-C', time: '14 minutes ago',  lat: 11.7141, lng: 122.4166, status: 'active', vesselId: 'V-002', confidence: 88, stage: 'STAGE 3 \u2014 SCORED ALERT' },
    { type: 'sos',             desc: 'Manual SOS \u2014 Vessel "San Pedro" (V-002)',                       time: '14 minutes ago',  lat: 11.7141, lng: 122.4166, status: 'active', vesselId: 'V-002', confidence: 92, stage: 'STAGE 3 \u2014 SCORED ALERT' },
    { type: 'wave-zone',       desc: 'Squall Nowcast \u2014 RETURN NOW on Buoy-B / Buoy-C',                time: '12 minutes ago',  lat: 11.7029, lng: 122.5107, status: 'active', vesselId: null, confidence: 88, stage: 'SQUALL \u2014 45 MIN LEAD' },
    { type: 'overdue-vessel',  desc: 'Overdue \u2014 "Maria Gracia" (V-005) check-in request outstanding', time: '1 hour 12 minutes ago', lat: 11.6768, lng: 122.4757, status: 'acknowledged', vesselId: 'V-005', confidence: 64, stage: 'STAGE 2 \u2014 CHECK-IN' },
    { type: 'capsizing-risk',  desc: 'Resolved \u2014 false alarm from single-vessel deviation',            time: '2 hours ago',     lat: 11.6563, lng: 122.5327, status: 'resolved', vesselId: null, confidence: 41, stage: 'STAGE 1 \u2014 SILENT CHECK-IN' },
  ];

  function alertIcon(type) {
    const icons = {
      'sos': `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
      'wave-zone': `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12c1.5-2 3.5-3 5.5-3s4 1 5.5 3 3.5 3 5.5 3 4-1 5.5-3"/><path d="M2 7c1.5-2 3.5-3 5.5-3s4 1 5.5 3 3.5 3 5.5 3 4-1 5.5-3"/></svg>`,
      'overdue-vessel': `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>`,
      'capsizing-risk': `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
      'forecast-storm': `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.5 19H9a7 7 0 1 1 6.7-9H17.5a4.5 4.5 0 1 1 0 9z"/><path d="M13 11l-2 4h3l-2 4"/></svg>`,
      'storm-surge': `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 9c2-3 5-3 7 0s5 3 7 0 5-3 7 0"/><path d="M2 15c2-3 5-3 7 0s5 3 7 0 5-3 7 0"/><path d="M12 2v4"/><path d="M9.5 4.5L12 2l2.5 2.5"/></svg>`,
    };
    const colors = { 'sos': 'icon-red', 'wave-zone': 'icon-yellow', 'overdue-vessel': 'icon-orange', 'capsizing-risk': 'icon-yellow', 'forecast-storm': 'icon-red', 'storm-surge': 'icon-red' };
    return `<div class="alert-icon ${colors[type] || 'icon-yellow'}">${icons[type] || ''}</div>`;
  }

  function alertStatusPill(status) {
    const map = { active: 'status-active', acknowledged: 'status-acknowledged', resolved: 'status-resolved' };
    return `<span class="alert-status ${map[status] || ''}">${status.charAt(0).toUpperCase() + status.slice(1)}</span>`;
  }

  function confidenceColor(conf) {
    if (conf >= 80) return '#e74c3c';
    if (conf >= 60) return '#f39c12';
    return '#f1c40f';
  }

  function renderAlerts() {
    const list = document.getElementById('alert-list');
    list.innerHTML = alertData.map((a, i) => `
      <div class="alert-row" data-alert-index="${i}">
        ${alertIcon(a.type)}
        <div class="alert-info">
          <div class="alert-desc">${a.desc}</div>
          <div class="alert-meta">${a.time} &middot; ${a.lat}&deg; N, ${a.lng}&deg; E</div>
          <div class="aq-alert-conf">
            <span class="aq-conf-mini" style="color:${confidenceColor(a.confidence)};">${a.confidence}% conf</span>
            <span class="aq-conf-bar"><span class="aq-conf-fill" style="width:${a.confidence}%;background:${confidenceColor(a.confidence)};"></span></span>
            <span class="aq-stage-mini">${a.stage}</span>
          </div>
        </div>
        ${alertStatusPill(a.status)}
      </div>
    `).join('');

    list.querySelectorAll('.alert-row').forEach(row => {
      row.addEventListener('click', () => {
        var a = alertData[row.dataset.alertIndex];
        if (!a) return;
        map.setView([a.lat, a.lng], 14, { animate: true, duration: 1 });
        if (a.vesselId) {
          var vm = vesselMarkers[a.vesselId];
          if (vm) vm.openPopup();
        }
      });
    });
  }

  renderAlerts();

  const activeAlertCount = alertData.filter(a => a.status === 'active').length;
  document.getElementById('badge-alerts').textContent = activeAlertCount;

  const liveBanner = document.getElementById('live-alert-banner');
  const bannerCountEl = document.getElementById('banner-alert-count');
  if (bannerCountEl) bannerCountEl.textContent = activeAlertCount;
  if (liveBanner) liveBanner.classList.toggle('has-alerts', activeAlertCount > 0);

  const squallCountEl = document.getElementById('banner-squall-count');
  if (squallCountEl) squallCountEl.textContent = 0;

  // Recomputes the alert badge and banner after alertData changes.
  //
  // Restored during the DangerzoneFeature merge: the weather-forecast code
  // calls this, but the branch's definition sat in the same block as the
  // removed fish-hotspot system, so taking our side dropped it and left a
  // ReferenceError on that path. This is the branch's logic minus the hotspot
  // parts, reusing the elements resolved just above.
  function syncAlertIndicators() {
    const activeCount = alertData.filter(function (alert) {
      return alert.status === 'active';
    }).length;
    const alertBadge = document.getElementById('badge-alerts');
    if (alertBadge) alertBadge.textContent = activeCount;
    if (bannerCountEl) bannerCountEl.textContent = activeCount;
    if (liveBanner) liveBanner.classList.toggle('has-alerts', activeCount > 0);
    renderAlerts();
  }

  // ===== SAR METRICS TAB =====
  // SAR metrics come from the evaluation scripts via /api/ai/metrics. There is
  // deliberately no hardcoded fallback: if the evals have not been run, the tab
  // says so rather than showing numbers nobody has verified.
  function sarRowsFromResults(results) {
    const rows = [];
    const pct = v => (typeof v === 'number' ? (v * 100).toFixed(1) + '%' : '--');
    const num = (v, digits, unit) =>
      typeof v === 'number' ? v.toFixed(digits) + (unit || '') : '--';

    const drift = results.drift;
    if (drift) {
      rows.push({
        label: 'Drift containment rate (95% contour)',
        value: pct(drift.containment_rate),
        target: 'Share of incidents whose true position fell inside the predicted search area'
      });
      rows.push({
        label: 'Search area reduction vs naive baseline',
        value: num(drift.search_area_reduction_factor, 2, 'x'),
        target: 'Against a circle expanding at maximum drift speed'
      });
      rows.push({
        label: 'Drift prediction runtime',
        value: num(drift.prediction_runtime_ms, 0, ' ms'),
        target: '24-hour forecast, Monte Carlo particle model'
      });
      rows.push({
        label: 'Incidents evaluated',
        value: drift.incidents_evaluated != null ? String(drift.incidents_evaluated) : '--',
        target: ''
      });
    }

    const anomaly = results.trip_anomaly;
    if (anomaly) {
      rows.push({
        label: 'Median detection latency',
        value: num(anomaly.median_detection_latency_minutes, 1, ' min'),
        target: 'From last buoy contact to reaching alert status'
      });
      rows.push({
        label: 'False alarm rate',
        value: pct(anomaly.false_alarm_rate),
        target: 'Measured on normal trips \u2014 responder trust is non-negotiable'
      });
      rows.push({
        label: 'Normal trips evaluated',
        value: anomaly.normal_trips_evaluated != null ? String(anomaly.normal_trips_evaluated) : '--',
        target: ''
      });
    }

    const squall = results.squall;
    if (squall) {
      rows.push({
        label: 'Squall mean lead time',
        value: num(squall.mean_lead_time_minutes, 1, ' min'),
        target: 'Warning issued before arrival \u2014 the number that decides whether it helps'
      });
      rows.push({ label: 'Squall precision', value: num(squall.precision, 3), target: '' });
      rows.push({ label: 'Squall recall', value: num(squall.recall, 3), target: '' });
    }

    return rows;
  }

  function renderSarEmpty(message) {
    const list = document.getElementById('sar-list');
    if (list) list.innerHTML = '<div class="ai-empty-state">' + _escHtml(message) + '</div>';
  }

  function renderSarMetrics(results) {
    const list = document.getElementById('sar-list');
    if (!list) return;
    const rows = sarRowsFromResults(results);
    if (!rows.length) {
      renderSarEmpty('Evaluation results are present but contain no metrics.');
      return;
    }
    list.innerHTML = rows.map(m => `
      <div class="sar-row">
        <div class="sar-label">${m.label}</div>
        <div class="sar-value">${m.value}</div>
        ${m.target ? `<div class="sar-target">${m.target}</div>` : ''}
      </div>
    `).join('');

    const footer = document.querySelector('.sar-footer');
    const calibration =
      (results.drift && results.drift.calibration) ||
      (results.squall && results.squall.calibration) ||
      (results.trip_anomaly && results.trip_anomaly.calibration);
    if (footer && calibration) {
      footer.textContent =
        'Measured by the AqOne evaluation scripts. Models are calibrated on ' +
        calibration + ' observations.';
    }
  }

  function loadSarMetrics() {
    renderSarEmpty('Loading evaluation results\u2026');
    authFetch('/api/ai/metrics')
      .then(function (res) {
        if (res.status === 404) throw new Error('not-run');
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(renderSarMetrics)
      .catch(function (err) {
        renderSarEmpty(
          err.message === 'not-run'
            ? 'No evaluation results yet. Run the eval scripts to populate these figures.'
            : 'Unable to load evaluation results.'
        );
      });
  }

  loadSarMetrics();
  document.getElementById('badge-sar').textContent = incidentDrawerData.filter(function (d) { return d.alertType === 'overdue' || d.alertType === 'squall'; }).length;

  // ===== INCIDENT DRAWER (scored alert / escalation ladder) =====
  const sosDrawer          = document.getElementById('sos-drawer');
  const sosDrawerHeader    = document.getElementById('sos-drawer-header');
  const sosDrawerTitle     = document.getElementById('sos-drawer-title');
  const sosDrawerClose     = document.getElementById('sos-drawer-close');
  const sosTimerEl         = document.getElementById('sos-timer');
  const sosBtnZoom         = document.getElementById('sos-btn-zoom');
  const sosBtnAcknowledge  = document.getElementById('sos-btn-acknowledge');
  const sosBtnResolve      = document.getElementById('sos-btn-resolve');
  const sosBtnBroadcast    = document.getElementById('sos-btn-broadcast');
  const sosBtnCheckin      = document.getElementById('sos-btn-checkin');
  const sosBroadcastMsg    = document.getElementById('sos-broadcast-msg');

  let sosTimerInterval  = null;
  let sosAlertStartTime = null;
  let currentDrawerMarker  = null;
  let currentDrawerData    = null;

  function openIncidentDrawer(data, marker) {
    currentDrawerData   = data;
    currentDrawerMarker = marker;

    sosDrawerHeader.className = 'sos-drawer-header';
    if (data.alertType === 'sos')        sosDrawerHeader.classList.add('type-sos');
    else if (data.alertType === 'wave')  sosDrawerHeader.classList.add('type-wave');
    else if (data.alertType === 'capsizing') sosDrawerHeader.classList.add('type-capsizing');
    else if (data.alertType === 'overdue') sosDrawerHeader.classList.add('type-overdue');
    else if (data.alertType === 'squall') sosDrawerHeader.classList.add('type-squall');
    sosDrawerTitle.textContent = data.headerText;

    var timerLabel = document.getElementById('sos-timer-label');
    if (data.alertType === 'overdue') {
      timerLabel.textContent = 'Time Since Last Contact';
    } else {
      timerLabel.textContent = 'Time Since Alert';
    }

    document.getElementById('sos-vessel-id').textContent = data.vesselId;
    document.getElementById('sos-owner').textContent     = data.owner;
    document.getElementById('sos-position').textContent  = data.position;
    document.getElementById('sos-buoy').textContent      = data.buoy;
    document.getElementById('sos-coverage').textContent  = data.coverage;

    // confidence + escalation
    var conf = data.confidence != null ? data.confidence : 0;
    document.getElementById('sos-confidence-value').textContent = conf + '%';
    document.getElementById('sos-confidence-value').style.color = confidenceColor(conf);
    var fill = document.getElementById('sos-confidence-fill');
    fill.style.width = conf + '%';
    fill.style.background = confidenceColor(conf);
    var stageEl = document.getElementById('sos-stage');
    stageEl.textContent = data.stage || 'Stage 1 \u2014 silent check-in';
    stageEl.className = 'aq-stage-badge';
    if (data.stage && data.stage.indexOf('STAGE 3') !== -1) stageEl.classList.add('stage-dispatch');
    else if (data.stage && data.stage.indexOf('STAGE 2') !== -1) stageEl.classList.add('stage-alert');
    else if (data.stage && data.stage.indexOf('SQUALL') !== -1) stageEl.classList.add('stage-squall');
    else stageEl.classList.add('stage-checkin');
    document.getElementById('sos-next-contact').textContent = data.nextContact || 'N/A';

    var baselineMs = data.timerBaseline ? data.timerBaseline * 1000 : 0;
    sosAlertStartTime = Date.now() - baselineMs;
    if (sosTimerInterval) clearInterval(sosTimerInterval);
    sosTimerInterval = setInterval(sosTickTimer, 1000);
    sosTickTimer();

    sosBtnAcknowledge.disabled = false;
    sosBtnAcknowledge.textContent = 'Acknowledge';
    sosBroadcastMsg.textContent = '';

    sosDrawer.classList.add('open');

    if (data.alertType === 'overdue' && data.buoy) {
      var buoyName = data.buoy.split(' ')[0];
      pulseCoverageCircle(buoyName);
    }
  }

  function closeSOSDrawer() {
    sosDrawer.classList.remove('open');
    if (sosTimerInterval) { clearInterval(sosTimerInterval); sosTimerInterval = null; }
    currentDrawerMarker = null;
    currentDrawerData   = null;
  }

  function sosTickTimer() {
    if (!sosAlertStartTime) return;
    const elapsed = Math.floor((Date.now() - sosAlertStartTime) / 1000);
    const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const ss = String(elapsed % 60).padStart(2, '0');
    sosTimerEl.textContent = mm + ':' + ss;
  }

  sosDrawerClose.addEventListener('click', closeSOSDrawer);

  sosBtnZoom.addEventListener('click', function () {
    if (currentDrawerMarker) {
      map.setView(currentDrawerMarker.getLatLng(), 14);
    }
  });

  // ===== ACKNOWLEDGE WITH ETA =====
  //
  // Acknowledging is no longer a bare flag. The dispatcher tells the fisherman
  // what is happening and roughly when help arrives, which is the difference
  // between "someone saw my SOS" and "I know whether to stay with the boat".
  //
  // Minutes are collected here; the backend converts to an absolute arrival
  // time so the handset's countdown stays correct however slow delivery is.
  const ackOverlay = document.getElementById('ack-modal-overlay');
  const ackVesselEl = document.getElementById('ack-modal-vessel');
  const ackStatusEl = document.getElementById('ack-status');
  const ackEtaEl = document.getElementById('ack-eta');
  const ackNoteEl = document.getElementById('ack-note');
  const ackConfirmBtn = document.getElementById('ack-btn-confirm');

  function closeAckModal() {
    if (ackOverlay) ackOverlay.hidden = true;
  }

  function openAckModal() {
    if (!ackOverlay) return;
    const label = currentDrawerData
      ? (currentDrawerData.desc || currentDrawerData.vesselId || 'Distress call')
      : 'Distress call';
    if (ackVesselEl) ackVesselEl.textContent = label;
    ackOverlay.hidden = false;
    if (ackEtaEl) ackEtaEl.focus();
  }

  // Quick picks and the free-entry field stay in step with each other.
  const ackQuick = document.getElementById('ack-eta-quick');
  if (ackQuick) {
    ackQuick.addEventListener('click', function (event) {
      const chip = event.target.closest('.ack-eta-chip');
      if (!chip) return;
      ackQuick.querySelectorAll('.ack-eta-chip').forEach(function (b) {
        b.classList.remove('is-selected');
      });
      chip.classList.add('is-selected');
      if (ackEtaEl) ackEtaEl.value = chip.dataset.eta;
    });
  }
  if (ackEtaEl) {
    ackEtaEl.addEventListener('input', function () {
      if (!ackQuick) return;
      ackQuick.querySelectorAll('.ack-eta-chip').forEach(function (b) {
        b.classList.toggle('is-selected', b.dataset.eta === ackEtaEl.value);
      });
    });
  }

  ['ack-modal-close', 'ack-btn-cancel'].forEach(function (id) {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', closeAckModal);
  });
  if (ackOverlay) {
    ackOverlay.addEventListener('click', function (event) {
      if (event.target === ackOverlay) closeAckModal();
    });
  }

  sosBtnAcknowledge.addEventListener('click', openAckModal);

  if (ackConfirmBtn) {
    ackConfirmBtn.addEventListener('click', function () {
      const etaMinutes = Math.max(1, Math.min(720, parseInt(ackEtaEl && ackEtaEl.value, 10) || 20));
      const status = parseInt(ackStatusEl && ackStatusEl.value, 10) || 1;
      const note = (ackNoteEl && ackNoteEl.value.trim()) || null;
      const eventId = currentDrawerData && currentDrawerData.sosEventId;

      ackConfirmBtn.disabled = true;

      // Optimistic: the dispatcher sees the incident acknowledged immediately.
      // A distress console should never appear frozen while a request is in
      // flight, and a failure is surfaced below rather than blocking the UI.
      sosBtnAcknowledge.disabled = true;
      sosBtnAcknowledge.textContent = 'Acknowledged';
      if (currentDrawerData) {
        currentDrawerData.etaAt = new Date(Date.now() + etaMinutes * 60000).toISOString();
        currentDrawerData.responderStatus = status;
        const idx = alertData.findIndex(function (a) {
          return a.vesselId === currentDrawerData.vesselId ||
                 (a.lat === currentDrawerData.lat && a.lng === currentDrawerData.lng);
        });
        if (idx !== -1) {
          alertData[idx].status = 'acknowledged';
          alertData[idx].etaAt = currentDrawerData.etaAt;
          renderAlerts();
        }
      }
      closeAckModal();

      // Only reaches the backend for incidents that came from it. Demo rows in
      // alertData have no sosEventId and stay local.
      if (eventId) {
        authFetch('/api/sos/' + encodeURIComponent(eventId) + '/acknowledge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            eta_minutes: etaMinutes,
            responder_status: status,
            responder_note: note
          })
        })
          .then(function (res) {
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return res.json();
          })
          .then(function (data) {
            if (currentDrawerData) currentDrawerData.etaAt = data.eta_at;
          })
          .catch(function (err) {
            console.warn('[AqOne] Acknowledgement not delivered:', err.message);
            showToast('Not delivered', 'The fisherman may not have received the ETA.', true);
          })
          .finally(function () {
            ackConfirmBtn.disabled = false;
          });
      } else {
        ackConfirmBtn.disabled = false;
      }
    });
  }

  // Live countdown on acknowledged incidents. Never renders a negative number:
  // once the promised time passes it says the rescue is delayed, because a
  // countdown expiring into silence reads as "nobody is coming".
  function formatEta(etaAt) {
    if (!etaAt) return '';
    var remainingMs = new Date(etaAt).getTime() - Date.now();
    if (remainingMs <= 0) return 'delayed — still en route';
    var mins = Math.floor(remainingMs / 60000);
    var secs = Math.floor((remainingMs % 60000) / 1000);
    return 'ETA ' + mins + ':' + String(secs).padStart(2, '0');
  }

  setInterval(function () {
    document.querySelectorAll('[data-eta-at]').forEach(function (el) {
      var text = formatEta(el.dataset.etaAt);
      el.textContent = text;
      el.classList.toggle('is-overdue', text.indexOf('delayed') === 0);
    });
  }, 1000);

  sosBtnResolve.addEventListener('click', function () {
    console.log('Alert ' + (currentDrawerData ? currentDrawerData.vesselId : '') + ' resolved');
    if (currentDrawerMarker) incidentLayer.removeLayer(currentDrawerMarker);
    if (currentDrawerData) {
      const idx = alertData.findIndex(function (a) {
        return a.vesselId === currentDrawerData.vesselId ||
               (a.lat === currentDrawerData.lat && a.lng === currentDrawerData.lng);
      });
      if (idx !== -1) { alertData[idx].status = 'resolved'; renderAlerts(); }
    }
    closeSOSDrawer();
  });

  sosBtnBroadcast.addEventListener('click', function () {
    sosBroadcastMsg.textContent = 'Broadcast sent to 3 nearby vessels over the LoRa mesh';
  });

  sosBtnCheckin.addEventListener('click', function () {
    sosBroadcastMsg.textContent = 'Silent check-in request queued at surrounding buoys \u2014 awaiting next contact';
  });

  // ===== INCIDENT FEED =====
  function renderIncidentFeed() {
    var el = document.getElementById('incident-feed-list');
    var active = alertData.filter(function (a) { return a.status !== 'resolved'; });
    if (active.length === 0) {
      el.innerHTML = '<p class="panel-stub-text">No active incidents</p>';
      return;
    }
    el.innerHTML = active.slice(0, 4).map(function (a, i) {
      return '<div class="incident-feed-row" data-idx="' + i + '">' +
        alertIcon(a.type) +
        '<div class="incident-feed-info">' +
          '<div class="incident-feed-desc">' + a.desc + '</div>' +
          '<div class="incident-feed-meta">' + a.time + '</div>' +
        '</div>' +
      '</div>';
    }).join('');
    el.querySelectorAll('.incident-feed-row').forEach(function (row) {
      row.addEventListener('click', function () {
        var a = alertData[row.dataset.idx];
        map.setView([a.lat, a.lng], 14, { animate: true, duration: 1 });
      });
    });
  }
  renderIncidentFeed();

  // ===== BUOY HEALTH MONITOR =====
  const buoyMonitorData = initialBuoys.map(function (b) {
    return {
      id: b.id, name: b.name, status: b.status === 'active' ? 'online' : (b.status === 'danger' ? 'offline' : 'online'),
      severity: b.pressureTrend != null && b.pressureTrend <= -2.5 ? 'Pressure drop \u2014 squall watch' : 'Nominal',
      battery: b.battery, lastSignal: b.status === 'danger' ? '2 hours ago' : '1 minute ago',
      lat: b.lat, lng: b.lng,
      pressure: b.pressure, pressureTrend: b.pressureTrend,
      current: b.current, currentDir: b.currentDir,
      dotClass: b.status === 'active' ? 'dot-green' : (b.status === 'danger' ? 'dot-gray' : 'dot-yellow')
    };
  });

  const buoyRailBtn     = document.getElementById('rail-btn-buoy');
  const buoyRailBadge   = document.getElementById('buoy-rail-badge');
  const buoyDrawerBadge = document.getElementById('buoy-drawer-badge');
  const buoyListEl      = document.getElementById('buoy-list');
  const buoyFooter      = document.getElementById('buoy-drawer-footer');

  let buoySyncTime = Date.now();

  var buoyOnlineCount = buoyMonitorData.filter(function (b) { return b.status === 'online'; }).length;
  var buoyTotal = buoyMonitorData.length;
  if (buoyRailBadge) buoyRailBadge.textContent = buoyOnlineCount + '/' + buoyTotal;
  if (buoyDrawerBadge) buoyDrawerBadge.textContent = buoyOnlineCount + '/' + buoyTotal + ' Online';
  if (buoyOnlineCount < buoyTotal) {
    if (buoyRailBadge) buoyRailBadge.classList.add('badge-amber');
    if (buoyDrawerBadge) buoyDrawerBadge.classList.add('badge-amber');
  }

  function renderBuoyList() {
    buoyListEl.innerHTML = buoyMonitorData.map(function (b) {
      var offlineClass = b.status === 'offline' ? ' buoy-offline' : '';
      var batteryClass = b.battery < 20 ? ' low' : '';
      var batteryIcon = b.battery < 20
        ? '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
        : '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="7" width="12" height="14" rx="2"/><path d="M10 7V5a2 2 0 0 1 4 0v2"/></svg>';

      var pressureText = b.pressure != null
        ? b.pressure.toFixed(1) + ' hPa' + (b.pressureTrend != null ? ' (' + (b.pressureTrend > 0 ? '+' : '') + b.pressureTrend + '/30m)' : '')
        : 'n/a';

      return '<div class="buoy-row' + offlineClass + '" data-lat="' + b.lat + '" data-lng="' + b.lng + '" data-id="' + b.id + '">' +
        '<div class="buoy-row-top">' +
          '<span class="buoy-row-name">' + b.name + '</span>' +
          '<span class="buoy-status-dot ' + b.dotClass + '"></span>' +
        '</div>' +
        '<div class="buoy-row-severity">' + b.severity + '</div>' +
        '<div class="buoy-row-meta">' +
          '<span class="buoy-row-battery' + batteryClass + '">' + batteryIcon + ' ' + b.battery + '%</span>' +
          '<span class="buoy-row-signal">' + pressureText + '</span>' +
        '</div>' +
        '<div class="buoy-row-meta">' +
          '<span class="buoy-row-signal">Current: ' + (b.current || 'n/a') + ' ' + (b.currentDir || '') + '</span>' +
          '<span class="buoy-row-signal">' + b.lastSignal + '</span>' +
        '</div>' +
      '</div>';
    }).join('');

    buoyListEl.querySelectorAll('.buoy-row').forEach(function (row) {
      row.addEventListener('click', function () {
        var lat = parseFloat(row.dataset.lat);
        var lng = parseFloat(row.dataset.lng);
        map.setView([lat, lng], 13);
        console.log('[AqOne] Buoy selected:', row.dataset.id);
      });
    });
  }

  function renderBuoyHealthCard() {
    var online = buoyMonitorData.filter(function (b) { return b.status === 'online'; }).length;
    var total = buoyMonitorData.length;
    document.getElementById('buoy-health-badge').textContent = online + '/' + total;

    var list = document.getElementById('buoy-health-list');
    list.innerHTML = buoyMonitorData.map(function (b) {
      var dotColor = b.status === 'online' ? '#2ecc71' : '#e74c3c';
      var offlineTag = b.status === 'offline'
        ? ' <span class="bh-offline-tag">Offline, last seen ' + b.lastSignal + '</span>'
        : '';
      var pressTag = b.pressure != null
        ? ' <span class="bh-press" style="color:' + (b.pressureTrend <= -2.5 ? '#e67e22' : 'inherit') + ';">' + b.pressure.toFixed(1) + ' hPa</span>'
        : '';
      return '<div class="bh-row' + (b.status === 'offline' ? ' bh-offline' : '') + '" data-lat="' + b.lat + '" data-lng="' + b.lng + '">' +
        '<span class="bh-dot" style="background:' + dotColor + ';"></span>' +
        '<span class="bh-name">' + b.name + '</span>' +
        '<span class="bh-battery">' + b.battery + '%</span>' +
        pressTag +
        offlineTag +
      '</div>';
    }).join('');

    list.querySelectorAll('.bh-row').forEach(function (row) {
      row.addEventListener('click', function () {
        map.setView([parseFloat(row.dataset.lat), parseFloat(row.dataset.lng)], 14, { animate: true, duration: 1 });
      });
    });
  }

  function renderBuoyHealth() {
    var sourceBuoys = buoyMonitorData;
    var activeCount = sourceBuoys.filter(function (b) { return b.status === 'online'; }).length;
    var totalCount = sourceBuoys.length;
    var countText = activeCount + '/' + totalCount + ' Online';

    var badgeCount = document.getElementById('buoy-health-badge');
    if (badgeCount) badgeCount.textContent = countText;
    buoyRailBadge.textContent = activeCount + '/' + totalCount;
    buoyDrawerBadge.textContent = countText;

    if (activeCount < totalCount) {
      buoyRailBadge.classList.add('badge-amber');
      buoyDrawerBadge.classList.add('badge-amber');
    } else {
      buoyRailBadge.classList.remove('badge-amber');
      buoyDrawerBadge.classList.remove('badge-amber');
    }
  }

  renderBuoyList();
  renderBuoyHealthCard();
  renderBuoyHealth();

  document.getElementById('buoy-health-header').addEventListener('click', function (e) {
    if (e.target.closest('#buoy-health-toggle')) return;
    openPanel('buoys');
  });
  document.getElementById('buoy-health-toggle').addEventListener('click', function (e) {
    e.stopPropagation();
    openPanel('buoys');
  });

  function updateBuoySync() {
    var elapsed = Math.floor((Date.now() - buoySyncTime) / 1000);
    buoyFooter.textContent = 'Last synced: ' + elapsed + ' seconds ago';
  }
  updateBuoySync();
  setInterval(updateBuoySync, 30000);

  // ===== VIEWPORT-BASED STATS =====
  function updateStats() {
    const bounds = map.getBounds();
    let buoysInView = 0;
    let vesselsInView = 0;
    let incidentsInView = 0;

    initialBuoys.forEach(b => { if (bounds.contains([b.lat, b.lng])) buoysInView++; });
    vessels.forEach(v => { if (bounds.contains([v.lat, v.lng])) vesselsInView++; });
    incidents.forEach(i => { if (bounds.contains([i.lat, i.lng])) incidentsInView++; });

    document.getElementById('stat-buoys').textContent = Math.max(4, buoysInView) + '/' + initialBuoys.length;
    document.getElementById('stat-coverage').textContent = (68 + buoysInView * 4) + '%';
    document.getElementById('stat-vessels').textContent = (38 + vesselsInView * 3);
    document.getElementById('stat-leadtime').textContent = '45 min';
    document.getElementById('stat-alerts').textContent = incidentsInView;
  }

  map.on('moveend', updateStats);
  map.on('zoomend', updateStats);

  // ===== COORDINATES =====
  function formatCoord(val, pos, neg) {
    const abs = Math.abs(val);
    const deg = Math.floor(abs);
    const min = ((abs - deg) * 60).toFixed(3);
    return deg + '\u00B0 ' + min + '\u2032 ' + (val >= 0 ? pos : neg);
  }

  map.on('mousemove', function (e) {
    document.getElementById('coords-lat').textContent = formatCoord(e.latlng.lat, 'N', 'S');
    document.getElementById('coords-lng').textContent = formatCoord(e.latlng.lng, 'E', 'W');
  });

  map.on('zoomend', function () {
    document.getElementById('coords-zoom').textContent = 'Zoom: ' + map.getZoom();
  });

  // ===== HOME / RECENTER =====
  const compassWidget = document.getElementById('compass-widget');

  compassWidget.addEventListener('click', function () {
    map.setView(OPS_CENTER, OPS_ZOOM);
  });

  // ===== FULLSCREEN =====
  document.getElementById('btn-fullscreen').addEventListener('click', function () {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen();
    }
  });

  // ===== CENTER ON REGION =====
  document.getElementById('btn-center-aklan').addEventListener('click', function () {
    map.setView(OPS_CENTER, OPS_ZOOM, { animate: true, duration: 1 });
    if (activePanel) closePanel();
  });

  // ===== EXPORT =====
  document.getElementById('btn-export').addEventListener('click', function () {
    const data = {
      center: map.getCenter(),
      zoom: map.getZoom(),
      gateways: shoreStations.length,
      buoys: initialBuoys.length,
      incidents: incidents.length,
      timestamp: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'aqone-sar-console-export.json';
    a.click();
    URL.revokeObjectURL(url);
  });

  // ===== AI OPERATIONS =====
  var aiContoursLayer = L.layerGroup().addTo(map);
  var aiSquallLayer = L.layerGroup().addTo(map);
  var aiRefreshTimer = null;

  var aiColors = {
    contour95: '#ef4444',
    contour75: '#f59e0b',
    contour50: '#facc15',
    track: '#2563eb',
    squall: '#22c55e'
  };

  function aiFetchJson(path) {
    return authFetch(path)
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      });
  }

  function aiStatusClass(status) {
    var map = { alert: 'status-alert', overdue: 'status-overdue', watch: 'status-watch', normal: 'status-normal' };
    return map[status] || 'status-normal';
  }

  function aiRiskPriority(status) {
    return ({ alert: 0, overdue: 1, watch: 2, normal: 3 })[status] ?? 9;
  }

  function clearAiDriftLayers() {
    aiContoursLayer.clearLayers();
    updateAiMapKey();
  }

  function clearAiSquallLayers() {
    aiSquallLayer.clearLayers();
    updateAiMapKey();
  }

  // The drift map key describes contour and squall-polygon colours. Showing it
  // while nothing is drawn advertises layers that are not on the map, so it
  // tracks the actual layer state.
  function updateAiMapKey() {
    var key = document.getElementById('ai-map-key');
    if (!key) return;
    var hasLayers =
      (aiContoursLayer && aiContoursLayer.getLayers().length > 0) ||
      (aiSquallLayer && aiSquallLayer.getLayers().length > 0);
    key.style.display = hasLayers ? '' : 'none';
  }

  // Banner count and header badge follow the live squall feed. The cutoff is
  // the model's own decision threshold, carried in the payload - not a value
  // invented on the frontend.
  function updateSquallBanner(detections, threshold) {
    var rows = Array.isArray(detections) ? detections : [];
    var cutoff = typeof threshold === 'number' ? threshold : 0;
    var returnNow = rows.filter(function (row) {
      return Number(row.probability || 0) >= cutoff;
    });

    var countEl = document.getElementById('banner-squall-count');
    if (countEl) countEl.textContent = String(returnNow.length);

    var statusEl = document.getElementById('squall-status');
    if (!statusEl) return;
    statusEl.classList.remove('squall-watch', 'squall-return');
    if (returnNow.length) {
      statusEl.textContent = 'RETURN NOW';
      statusEl.classList.add('squall-return');
    } else if (rows.length) {
      statusEl.textContent = 'WATCH';
      statusEl.classList.add('squall-watch');
    } else {
      statusEl.textContent = 'MONITORING';
    }
  }

  function renderDriftContours(payload) {
    clearAiDriftLayers();
    var prediction = payload && payload.prediction;
    var incident = payload && payload.incident;
    var track = (payload && payload.ground_truth_track) || [];
    var metaEl = document.getElementById('ai-drift-meta');
    if (!prediction || !prediction.contours || !prediction.contours.length) {
      if (metaEl) metaEl.textContent = 'No drift contours available for the selected incident.';
      return;
    }

    var contourBounds = L.latLngBounds([]);

    prediction.contours.forEach(function (feature) {
      var mass = feature.properties && feature.properties.mass;
      var contourLabel = mass >= 0.9 ? '95% search area' : (mass >= 0.7 ? '75% search area' : '50% search area');
      var color = mass >= 0.9 ? aiColors.contour95 : (mass >= 0.7 ? aiColors.contour75 : aiColors.contour50);
      var layer = L.geoJSON(feature, {
        pane: 'aiContoursPane',
        style: function () {
          return {
            color: color,
            weight: mass >= 0.9 ? 3 : 2.25,
            opacity: 0.95,
            fillColor: color,
            fillOpacity: mass >= 0.9 ? 0.12 : (mass >= 0.7 ? 0.10 : 0.08),
            dashArray: mass >= 0.9 ? '2 4' : ''
          };
        },
        onEachFeature: function (feat, lyr) {
          lyr.bindTooltip(contourLabel, {
            sticky: true,
            direction: 'center',
            className: 'drift-incident-label'
          });
        }
      });
      layer.addTo(aiContoursLayer);
      contourBounds.extend(layer.getBounds());
    });

    if (track.length) {
      var trackLatLngs = track.map(function (point) {
        return [point.lat, point.lon];
      });
      var trackLine = L.polyline(trackLatLngs, {
        pane: 'aiTrackPane',
        color: aiColors.track,
        weight: 4,
        opacity: 0.95,
        dashArray: '10 8',
        lineCap: 'round'
      }).addTo(aiContoursLayer);
      trackLine.bindTooltip('Ground truth track', {
        sticky: true,
        direction: 'top',
        className: 'squall-track-label'
      });
      contourBounds.extend(trackLine.getBounds());
    }

    if (contourBounds.isValid()) {
      map.fitBounds(contourBounds.pad(0.12), { animate: true, duration: 0.9, maxZoom: 14 });
    }

    if (metaEl && incident) {
      var incidentTime = incident.last_contact_at ? new Date(incident.last_contact_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '--';
      metaEl.innerHTML =
        '<strong>Incident #' + incident.id + '</strong> · Vessel ' + _escHtml(incident.vessel_id) + '<br>' +
        'Last contact: ' + incidentTime + ' · ' + _escHtml(incident.abnormal_reason || 'unknown') + '<br>' +
        'Track labeled as ground truth for synthetic evaluation.';
    }

    updateAiMapKey();
  }

  function renderDriftIncidentList(items) {
    var select = document.getElementById('ai-drift-select');
    if (!select) return;
    select.innerHTML = '';
    if (!items || !items.length) {
      select.innerHTML = '<option value="">No incidents available</option>';
      var emptyMeta = document.getElementById('ai-drift-meta');
      if (emptyMeta) emptyMeta.textContent = 'No drift incidents were returned by the backend.';
      clearAiDriftLayers();
      return;
    }

    items.forEach(function (item, index) {
      var option = document.createElement('option');
      option.value = String(item.id);
      option.textContent = 'Incident #' + item.id + ' · ' + item.vessel_id + ' · ' + (item.abnormal_reason || 'unknown');
      if (index === 0) option.selected = true;
      select.appendChild(option);
    });
  }

  function renderRiskFeed(rows) {
    var list = document.getElementById('ai-risk-list');
    var count = document.getElementById('ai-risk-count');
    if (!list) return;
    if (!rows || !rows.length) {
      list.innerHTML = '<div class="ai-empty-state">No active vessel risk rows available.</div>';
      if (count) count.textContent = '0';
      return;
    }

    var sorted = rows.slice().sort(function (a, b) {
      var diff = aiRiskPriority(a.status) - aiRiskPriority(b.status);
      if (diff !== 0) return diff;
      return (b.score || 0) - (a.score || 0);
    });

    if (count) count.textContent = String(sorted.length);

    list.innerHTML = sorted.map(function (row, index) {
      var score = typeof row.score === 'number' ? row.score.toFixed(2) : String(row.score || '--');
      var lastSeen = row.last_contact_at ? new Date(row.last_contact_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '--';
      var expectedBuoy = row.expected_next_buoy_id || 'n/a';
      var statusLabel = (row.status || 'normal').toUpperCase();
      var factors = Array.isArray(row.factors) ? row.factors : [];
      return '' +
        '<details class="ai-risk-item"' + (index === 0 ? ' open' : '') + '>' +
          '<summary>' +
            '<div class="ai-risk-main">' +
              '<div class="ai-risk-title">' + _escHtml(row.vessel_id) + ' · Trip ' + _escHtml(row.trip_id) + '</div>' +
              '<div class="ai-risk-meta">Expected buoy ' + _escHtml(expectedBuoy) + ' · Last contact ' + _escHtml(lastSeen) + '</div>' +
            '</div>' +
            '<div class="ai-risk-score">' + score + '<span class="ai-risk-status ' + aiStatusClass(row.status) + '">' + statusLabel + '</span></div>' +
          '</summary>' +
          '<div class="ai-risk-details">' +
            '<div class="ai-factor-list">' + factors.map(function (factor) {
              return '<div class="ai-factor-row">' +
                '<div class="ai-factor-name">' + _escHtml(factor.name || 'factor') + '</div>' +
                '<div class="ai-factor-value">' + Number(factor.contribution || 0).toFixed(3) + '</div>' +
                '<div class="ai-factor-explainer">' + _escHtml(factor.explanation || '') + '</div>' +
              '</div>';
            }).join('') + '</div>' +
          '</div>' +
        '</details>';
    }).join('');
  }

  function renderSquallChart(traceSeries) {
    var chart = document.getElementById('ai-trace-chart');
    var legend = document.getElementById('ai-trace-legend');
    if (!chart || !legend) return;
    if (!traceSeries || !traceSeries.length) {
      legend.innerHTML = '';
      chart.innerHTML = '<div class="ai-empty-state">Pressure trace unavailable.</div>';
      return;
    }

    var minPressure = Infinity;
    var maxPressure = -Infinity;
    var maxPoints = 0;
    traceSeries.forEach(function (series) {
      series.points.forEach(function (point) {
        minPressure = Math.min(minPressure, point.pressure_hpa);
        maxPressure = Math.max(maxPressure, point.pressure_hpa);
      });
      maxPoints = Math.max(maxPoints, series.points.length);
    });
    if (!isFinite(minPressure) || !isFinite(maxPressure) || maxPoints < 2) {
      legend.innerHTML = '';
      chart.innerHTML = '<div class="ai-empty-state">Pressure trace unavailable.</div>';
      return;
    }
    var pad = Math.max(0.8, (maxPressure - minPressure) * 0.2);
    minPressure -= pad;
    maxPressure += pad;

    var width = 320;
    var height = 120;
    var innerWidth = 282;
    var innerHeight = 78;
    var left = 20;
    var top = 16;

    function projectX(index, total) {
      return left + (total <= 1 ? innerWidth / 2 : (index / (total - 1)) * innerWidth);
    }

    function projectY(value) {
      return top + (maxPressure - value) / (maxPressure - minPressure) * innerHeight;
    }

    var svg = [
      '<svg viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="Pressure trace chart">',
      '<line class="ai-trace-axis" x1="20" y1="16" x2="20" y2="94"></line>',
      '<line class="ai-trace-axis" x1="20" y1="94" x2="302" y2="94"></line>'
    ];

    var ticks = [minPressure, (minPressure + maxPressure) / 2, maxPressure];
    ticks.forEach(function (tick) {
      var y = projectY(tick);
      svg.push('<line class="ai-trace-axis" x1="20" y1="' + y.toFixed(1) + '" x2="302" y2="' + y.toFixed(1) + '" stroke-dasharray="3 4"></line>');
      svg.push('<text x="6" y="' + (y + 3).toFixed(1) + '" fill="currentColor" font-size="9">' + tick.toFixed(1) + '</text>');
    });

    traceSeries.forEach(function (series, seriesIndex) {
      var color = series.color;
      var points = series.points;
      var path = points.map(function (point, index) {
        return (index === 0 ? 'M' : 'L') + projectX(index, points.length).toFixed(1) + ',' + projectY(point.pressure_hpa).toFixed(1);
      }).join(' ');
      svg.push('<path class="ai-trace-line" d="' + path + '" stroke="' + color + '"></path>');
      svg.push('<circle cx="' + projectX(points.length - 1, points.length).toFixed(1) + '" cy="' + projectY(points[points.length - 1].pressure_hpa).toFixed(1) + '" r="2.8" fill="' + color + '"></circle>');
      if (seriesIndex === 0) {
        svg.push('<text x="24" y="10" fill="currentColor" font-size="9">hPa</text>');
      }
    });

    svg.push('</svg>');
    chart.innerHTML = svg.join('');

    legend.innerHTML = traceSeries.map(function (series) {
      return '<div class="ai-trace-legend-item"><span class="ai-trace-swatch" style="background:' + series.color + '"></span><span>' + _escHtml(series.label) + '</span></div>';
    }).join('');
  }

  function renderSquallWatch(payload, traceSeries) {
    var summary = document.getElementById('ai-squall-summary');
    if (!summary) return;
    clearAiSquallLayers();

    var detections = payload && payload.detections ? payload.detections : [];
    var threshold = payload && typeof payload.threshold === 'number' ? payload.threshold : undefined;
    updateSquallBanner(detections, threshold);
    if (!detections.length) {
      summary.innerHTML = '<div class="ai-empty-state">No active squall detections at the moment.</div>';
      renderSquallChart([]);
      updateAiMapKey();
      return;
    }

    var detection = detections[0];
    var arrival = Array.isArray(detection.arrival_by_buoy) ? detection.arrival_by_buoy : [];
    var polygon = detection.affected_polygon;

    if (polygon && polygon.geometry) {
      L.geoJSON(polygon, {
        pane: 'aiSquallPane',
        style: function () {
          return {
            color: aiColors.squall,
            weight: 3,
            fillColor: aiColors.squall,
            fillOpacity: 0.10,
            dashArray: '6 6'
          };
        },
        onEachFeature: function (feat, lyr) {
          lyr.bindTooltip('Squall watch polygon', {
            sticky: true,
            direction: 'center',
            className: 'drift-incident-label'
          });
        }
      }).addTo(aiSquallLayer);
    }

    var bounds = aiSquallLayer.getBounds();
    if (!aiContoursLayer.getLayers().length && bounds.isValid()) {
      map.fitBounds(bounds.pad(0.15), { animate: true, duration: 0.9, maxZoom: 14 });
    }

    var asOf = detection.as_of ? new Date(detection.as_of).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '--';
    summary.innerHTML =
      '<div class="ai-squall-meta-row"><span>Probability</span><strong>' + (Number(detection.probability || 0) * 100).toFixed(0) + '%</strong></div>' +
      '<div class="ai-squall-meta-row"><span>Confidence</span><strong>' + (Number(detection.confidence || 0) * 100).toFixed(0) + '%</strong></div>' +
      '<div class="ai-squall-meta-row"><span>Bearing</span><strong>' + Number((detection.propagation && detection.propagation.bearing_deg) || 0).toFixed(0) + '°</strong></div>' +
      '<div class="ai-squall-meta-row"><span>As of</span><strong>' + _escHtml(asOf) + '</strong></div>' +
      '<div class="ai-squall-meta-row"><span>Arrival window</span><strong>' + (arrival.length ? _escHtml(String(arrival[0].arrival_minutes)) + ' min first arrival' : 'n/a') + '</strong></div>';

    renderSquallChart(traceSeries);
    updateAiMapKey();
  }

  function loadDriftIncidentDetail(incidentId) {
    if (!incidentId) {
      clearAiDriftLayers();
      return Promise.resolve();
    }
    return aiFetchJson('/api/ai/drift/incident/' + encodeURIComponent(incidentId) + '?forecast_hours=24')
      .then(function (payload) {
        renderDriftContours(payload);
      })
      .catch(function (err) {
        console.warn('[AqOne] Drift incident load failed:', err.message);
        var metaEl = document.getElementById('ai-drift-meta');
        if (metaEl) metaEl.textContent = 'Unable to load the drift map right now.';
        clearAiDriftLayers();
      });
  }

  function loadSquallTrace(payload) {
    var detection = payload && payload.detections && payload.detections[0];
    var arrival = detection && detection.arrival_by_buoy ? detection.arrival_by_buoy.slice(0, 3) : [];
    if (!arrival.length) {
      renderSquallWatch(payload, []);
      return Promise.resolve();
    }

    return Promise.all(arrival.map(function (item, index) {
      return aiFetchJson('/api/ai/squall/buoy/' + encodeURIComponent(item.buoy_id))
        .then(function (detail) {
          return {
            label: detail.buoy.id,
            color: ['#2563eb', '#ef4444', '#f59e0b'][index % 3],
            points: detail.trace || []
          };
        })
        .catch(function () {
          return {
            label: item.buoy_id,
            color: ['#2563eb', '#ef4444', '#f59e0b'][index % 3],
            points: []
          };
        });
    })).then(function (series) {
      renderSquallWatch(payload, series.filter(function (item) { return item.points.length; }));
    });
  }

  function initAIOperations() {
    var driftSelect = document.getElementById('ai-drift-select');
    var driftMeta = document.getElementById('ai-drift-meta');
    var aiRiskList = document.getElementById('ai-risk-list');
    var aiSquallSummary = document.getElementById('ai-squall-summary');

    if (driftMeta) driftMeta.textContent = 'Fetching live incidents...';
    if (aiRiskList) aiRiskList.innerHTML = '<div class="ai-empty-state">Loading vessel risk feed...</div>';
    if (aiSquallSummary) aiSquallSummary.innerHTML = '<div class="ai-empty-state">Loading squall watch...</div>';

    Promise.allSettled([
      aiFetchJson('/api/ai/anomaly/active'),
      aiFetchJson('/api/ai/drift/incidents'),
      aiFetchJson('/api/ai/squall/current')
    ]).then(function (results) {
      var riskResult = results[0];
      var incidentsResult = results[1];
      var squallResult = results[2];

      if (riskResult.status === 'fulfilled') {
        renderRiskFeed(riskResult.value || []);
      } else {
        renderRiskFeed([]);
      }

      if (incidentsResult.status === 'fulfilled') {
        renderDriftIncidentList(incidentsResult.value || []);
      } else {
        renderDriftIncidentList([]);
      }

      var selectedIncidentId = driftSelect && driftSelect.value;
      var incidentPromise = selectedIncidentId ? loadDriftIncidentDetail(selectedIncidentId) : Promise.resolve();
      if (!selectedIncidentId && driftSelect && driftSelect.options.length) {
        selectedIncidentId = driftSelect.options[0].value;
        driftSelect.value = selectedIncidentId;
        incidentPromise = loadDriftIncidentDetail(selectedIncidentId);
      }

      if (driftSelect) {
        driftSelect.addEventListener('change', function () {
          loadDriftIncidentDetail(driftSelect.value);
        });
      }

      if (squallResult.status === 'fulfilled') {
        return loadSquallTrace(squallResult.value || { detections: [] });
      }
      renderSquallWatch({ detections: [] }, []);
      return incidentPromise;
    }).catch(function () {
      renderRiskFeed([]);
      renderDriftIncidentList([]);
      clearAiDriftLayers();
      clearAiSquallLayers();
      renderSquallWatch({ detections: [] }, []);
    });

    if (aiRefreshTimer) clearInterval(aiRefreshTimer);
    aiRefreshTimer = setInterval(function () {
      aiFetchJson('/api/ai/anomaly/active').then(renderRiskFeed).catch(function () { renderRiskFeed([]); });
      aiFetchJson('/api/ai/squall/current').then(loadSquallTrace).catch(function () { clearAiSquallLayers(); renderSquallWatch({ detections: [] }, []); });
      var currentSelect = document.getElementById('ai-drift-select');
      if (currentSelect && currentSelect.value) loadDriftIncidentDetail(currentSelect.value);
    }, 60000);
  }

  initAIOperations();

  // ===== EXIT LOADING =====
  window.addEventListener('load', function () {
    setTimeout(function () {
      document.getElementById('loading-overlay').classList.add('hidden');
    }, 800);
  });

  // ===== USER PROFILE PILL =====
  var userProfilePill = document.getElementById('user-profile');
  if (userProfilePill) {
    userProfilePill.style.cursor = 'pointer';
    userProfilePill.addEventListener('click', function () {
      window.location.href = 'Systemprofile.html';
    });
  }

  // ===== EXPORT =====
  const btnExport = document.getElementById('btn-export');
  if (btnExport) {
    btnExport.addEventListener('click', function () {
      const data = {
        center: map.getCenter(),
        zoom: map.getZoom(),
        facilities: facilities.length,
        buoys: initialBuoys.length,
        incidents: incidents.length,
        timestamp: new Date().toISOString()
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'aqone-dashboard-export.json';
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  // ===== EXIT LOADING =====
  function hideLoadingOverlay() {
    var overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.classList.add('hidden');
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(hideLoadingOverlay, 300);
  } else {
    window.addEventListener('load', function () {
      setTimeout(hideLoadingOverlay, 300);
    });
    document.addEventListener('DOMContentLoaded', function () {
      setTimeout(hideLoadingOverlay, 300);
    });
  }
  setTimeout(hideLoadingOverlay, 1500);

  // ===== THEME TOGGLE (shared with profile.html) =====
  // Reads BOTH storage keys used by profile.js ('aqone_dark_mode') and
  // the dashboard's own key ('aqone-theme') so dark mode persists across pages.
  (function () {
    var STORAGE_KEY = 'aqone-theme';
    var PROFILE_KEY = 'aqone_dark_mode';
    var root = document.documentElement;

    function applyTheme(theme) {
      if (theme === 'dark') {
        root.setAttribute('data-theme', 'dark');
      } else {
        root.removeAttribute('data-theme');
      }
      var darkToggle = document.getElementById('pref-dark-toggle');
      if (darkToggle) darkToggle.checked = theme === 'dark';
    }

    function resolveTheme() {
      var ownKey = localStorage.getItem(STORAGE_KEY);
      if (ownKey) return ownKey;
      var profileDark = localStorage.getItem(PROFILE_KEY);
      if (profileDark === 'true') return 'dark';
      return 'light';
    }

    applyTheme(resolveTheme());

    window.addEventListener('storage', function (e) {
      if (e.key === PROFILE_KEY) {
        var next = e.newValue === 'true' ? 'dark' : 'light';
        applyTheme(next);
        localStorage.setItem(STORAGE_KEY, next);
      }
    });

    var themeBtn = document.getElementById('btn-theme');
    if (themeBtn) {
      themeBtn.addEventListener('click', function () {
        var isDark = root.getAttribute('data-theme') === 'dark';
        var next = isDark ? 'light' : 'dark';
        applyTheme(next);
        localStorage.setItem(STORAGE_KEY, next);
      });
    }

    var prefDarkToggle = document.getElementById('pref-dark-toggle');
    if (prefDarkToggle) {
      prefDarkToggle.addEventListener('change', function () {
        var next = prefDarkToggle.checked ? 'dark' : 'light';
        applyTheme(next);
        localStorage.setItem(STORAGE_KEY, next);
      });
    }
  })();

  // ===== LANGUAGE TRANSLATIONS (EN / AKL) =====
  (function () {
    var DASHBOARD_TRANSLATIONS = {
      en: {
        subTitle: "Maritime Intelligence — Aklan LGU",
        layerStreets: "Streets",
        layerSatellite: "Satellite",
        layerHybrid: "Hybrid",
        searchPlaceholder: "Search vessels, zones, coordinates...",
        userName: "Kalibo, Aklan<br>LGU Administrator",
        railLayers: "Layers",
        railPan: "Pan",
        railPin: "Pin",
        railMeasure: "Measure",
        railBuoys: "BUOYS",
        railEmergency: "EMERGENCY",
        railAdvisories: "Advisories",
        lblIncidents: "Incident Reports",
        lblBuoyStations: "Buoy Stations",
        lblUserPins: "User Pins",
        lblCoverage: "Buoy Coverage Zones",
        lblMesh: "Mesh Network",
        btnExport: "Export View Data",
        btnCenterAklan: "Center on Aklan",
        measureHint: "Click the map to add points. Double-click to finish.",
        btnFinish: "Finish",
        btnClear: "Clear",
        hdrBuoyMonitor: "Buoy Health Monitor",
        hdrAdvisories: "Maritime Advisories",
        subAdvisories: "Create and manage official government advisories.",
        btnCreateAdv: "Create Advisory",
        filterAll: "All",
        filterInCoverage: "In Coverage",
        filterOutOfCoverage: "Out of Coverage",
        filterOverdue: "Overdue",
        wcTitle: "Current Conditions",
        hdrSeaStatus: "Sea Condition Status",
        btnSeaSafe: "Safe to Go Out",
        btnSeaCaution: "Caution — Check Advisories",
        btnSeaDanger: "Not Advised",
        lblReason: "Reason (optional)",
        phReason: "e.g. Small craft advisory in effect...",
        btnSetStatus: "Set Status",
        hdrForecast: "7-Day Forecast",
        stubForecast: "Forecast data coming soon",
        hdrRainfall: "Rainfall Timeline",
        stubRainfall: "Rainfall data coming soon",
        emTitle: "Emergency Contacts",
        emSubtitle: "Quick access for MDRRMO responders",
      },
      akl: {
        subTitle: "Intelihensiya sa Baybayon — LGU Aklan",
        layerStreets: "Mga Dalan",
        layerSatellite: "Satélite",
        layerHybrid: "Pagsagol",
        searchPlaceholder: "Mag-sapsap it sakayan, rehiyon, coordinates...",
        userName: "Kalibo, Aklan<br>Tagadumala sa LGU",
        railLayers: "Mga Han-ay",
        railPan: "I-duhol",
        railPin: "Tandaan",
        railMeasure: "Sukdon",
        railBuoys: "MGA BUOYS",
        railEmergency: "EMERHENSIYA",
        railAdvisories: "Mga Pasidaan",
        lblIncidents: "Ulat it Insidente",
        lblBuoyStations: "Estasyon it Buoy",
        lblUserPins: "Mga Tanda sang Tawo",
        lblCoverage: "Rehiyon sang Sakop it Buoy",
        lblMesh: "Network sa Mesh",
        btnExport: "I-export ang Datos",
        btnCenterAklan: "I-sentro sa Aklan",
        measureHint: "I-klick ang mapa para magdugang it punto. Double-click para matapos.",
        btnFinish: "Tapuson",
        btnClear: "Panason",
        hdrBuoyMonitor: "Kauswagan sang Buoy",
        hdrAdvisories: "Mga Pasidaan sa Baybayon",
        subAdvisories: "Maghimo ag magdumala sang opisyal nga mga pasidaan sang gobyerno.",
        btnCreateAdv: "Maghimo it Pasidaan",
        filterAll: "Tanan",
        filterInCoverage: "Yara sa Sakop",
        filterOutOfCoverage: "Gwa sa Sakop",
        filterOverdue: "Lampas sa Oras",
        wcTitle: "Kasamtangan nga Panahon",
        hdrSeaStatus: "Sitwasyon sa Baybayon",
        btnSeaSafe: "Ewas nga Maglayag",
        btnSeaCaution: "Maghalong — Basaha ang Pasidaan",
        btnSeaDanger: "Indi Ginarekomendar",
        lblReason: "Rason (opsyonal)",
        phReason: "hal. Pasidaan sa gamay nga sakayan...",
        btnSetStatus: "I-set ang Sitwasyon",
        hdrForecast: "Pasidaan sa 7-Ka Adlaw",
        stubForecast: "Maga-abot pa ang datos sa panahon",
        hdrRainfall: "Oras sang Ulan",
        stubRainfall: "Maga-abot pa ang datos sang ulan",
        emTitle: "Mga Kontaktuhon sa Emerhensiya",
        emSubtitle: "Mabilis nga pagkuha para sa mga tagatubag sang MDRRMO",
      }
    };

    function applyLanguage(lang) {
      if (lang !== 'akl') lang = 'en';
      localStorage.setItem('aqone_lang', lang);
      var dict = DASHBOARD_TRANSLATIONS[lang];

      var btnEn = document.getElementById('dash-lang-en');
      var btnAkl = document.getElementById('dash-lang-akl');
      if (btnEn && btnAkl) {
        if (lang === 'akl') {
          btnEn.classList.remove('active');
          btnAkl.classList.add('active');
        } else {
          btnAkl.classList.remove('active');
          btnEn.classList.add('active');
        }
      }

      var setText = function (selector, key) {
        var el = document.querySelector(selector);
        if (el && dict[key]) el.innerHTML = dict[key];
      };

      setText('.top-subtitle', 'subTitle');
      setText('[data-layer="streets"] span', 'layerStreets');
      setText('[data-layer="satellite"] span', 'layerSatellite');
      setText('[data-layer="hybrid"] span', 'layerHybrid');

      var searchInput = document.querySelector('.search-input');
      if (searchInput && dict.searchPlaceholder) searchInput.placeholder = dict.searchPlaceholder;

      setText('.user-name', 'userName');
      setText('#rail-btn-layers .rail-label', 'railLayers');
      setText('#rail-btn-pan .rail-label', 'railPan');
      setText('#rail-btn-pin .rail-label', 'railPin');
      setText('#rail-btn-measure .rail-label', 'railMeasure');
      setText('#rail-btn-buoy .rail-label', 'railBuoys');
      setText('#btn-emergency .rail-label', 'railEmergency');
      setText('#rail-btn-advisories .rail-label', 'railAdvisories');

      setText('#toggle-incidents + .toggle-label', 'lblIncidents');
      setText('#toggle-buoys + .toggle-label', 'lblBuoyStations');
      setText('#toggle-pins + .toggle-label', 'lblUserPins');
      setText('#toggle-coverage + .toggle-label', 'lblCoverage');
      setText('#toggle-mesh + .toggle-label', 'lblMesh');

      setText('#btn-export', 'btnExport');
      setText('#btn-center-aklan', 'btnCenterAklan');
      setText('.measure-hint', 'measureHint');
      setText('#btn-measure-finish', 'btnFinish');
      setText('#btn-measure-clear', 'btnClear');

      setText('.buoy-drawer-title', 'hdrBuoyMonitor');
      setText('.advisory-drawer-title', 'hdrAdvisories');
      setText('.advisory-drawer-desc', 'subAdvisories');
      setText('#btn-create-advisory', 'btnCreateAdv');

      setText('.vessel-filter[data-filter="all"]', 'filterAll');
      setText('.vessel-filter[data-filter="in-coverage"]', 'filterInCoverage');
      setText('.vessel-filter[data-filter="out-of-coverage"]', 'filterOutOfCoverage');
      setText('.vessel-filter[data-filter="overdue"]', 'filterOverdue');

      setText('.wc-title', 'wcTitle');
      setText('#sea-condition-card .panel-card-header span', 'hdrSeaStatus');
      setText('.sea-condition-btn.btn-safe', 'btnSeaSafe');
      setText('.sea-condition-btn.btn-caution', 'btnSeaCaution');
      setText('.sea-condition-btn.btn-danger', 'btnSeaDanger');
      setText('label[for="sea-condition-reason"]', 'lblReason');
      var seaInput = document.getElementById('sea-condition-reason');
      if (seaInput && dict.phReason) seaInput.placeholder = dict.phReason;
      setText('#sea-condition-set-btn', 'btnSetStatus');

      setText('#forecast-card .panel-card-header span', 'hdrForecast');
      setText('#forecast-body .panel-stub-text', 'stubForecast');
      setText('#rainfall-card .panel-card-header span', 'hdrRainfall');
      setText('#rainfall-body .panel-stub-text', 'stubRainfall');
      setText('.emergency-modal-title', 'emTitle');
      setText('.emergency-modal-subtitle', 'emSubtitle');
    }

    var btnEn = document.getElementById('dash-lang-en');
    var btnAkl = document.getElementById('dash-lang-akl');
    if (btnEn) btnEn.addEventListener('click', function () { applyLanguage('en'); });
    if (btnAkl) btnAkl.addEventListener('click', function () { applyLanguage('akl'); });

    var prefLangSelect = document.getElementById('pref-lang-select');
    if (prefLangSelect) {
      prefLangSelect.addEventListener('change', function (e) {
        applyLanguage(e.target.value);
      });
    }

    window.addEventListener('storage', function (e) {
      if (e.key === 'aqone_lang') applyLanguage(e.newValue);
    });

    var savedLang = localStorage.getItem('aqone_lang') || 'en';
    applyLanguage(savedLang);
  })();

  // ===== PROFILE PAGE: TABS, SAVE HANDLERS, LOGOUT (from profile.html) =====
  (function () {
    var tabs = document.querySelectorAll('.profile-tab');
    var contents = document.querySelectorAll('.profile-tab-content');

    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        tabs.forEach(function (t) { t.classList.remove('active'); });
        contents.forEach(function (c) { c.classList.remove('active'); });
        tab.classList.add('active');
        var target = document.getElementById('tab-' + tab.dataset.tab);
        if (target) target.classList.add('active');
      });
    });

    var btnSavePersonal = document.getElementById('btn-save-personal');
    if (btnSavePersonal) {
      btnSavePersonal.addEventListener('click', function () {
        var name = document.getElementById('pf-fullname').value.trim();
        showToast('Profile Updated', name ? name + '\u2019s info was saved.' : 'Your info was saved.');
      });
    }

    var btnCancelPersonal = document.getElementById('btn-cancel-personal');
    if (btnCancelPersonal) {
      btnCancelPersonal.addEventListener('click', function () {
        showToast('Changes Discarded', 'No changes were saved.');
      });
    }

    var btnSaveSecurity = document.getElementById('btn-save-security');
    if (btnSaveSecurity) {
      btnSaveSecurity.addEventListener('click', function () {
        var current = document.getElementById('pf-current-password').value;
        var next = document.getElementById('pf-new-password').value;
        var confirmVal = document.getElementById('pf-confirm-password').value;

        if (!current || !next || !confirmVal) {
          showToast('Missing Fields', 'Please fill in all password fields.');
          return;
        }
        if (next !== confirmVal) {
          showToast('Password Mismatch', 'New password and confirmation do not match.');
          return;
        }
        showToast('Password Updated', 'Your password has been changed.');
        document.getElementById('pf-current-password').value = '';
        document.getElementById('pf-new-password').value = '';
        document.getElementById('pf-confirm-password').value = '';
      });
    }

    var btnCancelSecurity = document.getElementById('btn-cancel-security');
    if (btnCancelSecurity) {
      btnCancelSecurity.addEventListener('click', function () {
        document.getElementById('pf-current-password').value = '';
        document.getElementById('pf-new-password').value = '';
        document.getElementById('pf-confirm-password').value = '';
      });
    }

    var btnEditAvatar = document.getElementById('btn-edit-avatar');
    if (btnEditAvatar) {
      btnEditAvatar.addEventListener('click', function () {
        showToast('Coming Soon', 'Photo upload isn\u2019t wired up yet.');
      });
    }

    var btnLogout = document.getElementById('btn-logout');
    if (btnLogout) {
      btnLogout.addEventListener('click', function () {
        if (confirm('Are you sure you want to log out?')) {
          window.location.href = 'login.html';
        }
      });
    }

    var lastActiveEl = document.getElementById('profile-last-active');
    if (lastActiveEl) {
      lastActiveEl.textContent = 'Active now';
    }

    var statAdvisories = document.getElementById('stat-advisories');
    var statZones = document.getElementById('stat-zones');
    var statAlertsAck = document.getElementById('stat-alerts-ack');
    if (statAdvisories) statAdvisories.textContent = '12';
    if (statZones) statZones.textContent = '6';
    if (statAlertsAck) statAlertsAck.textContent = '34';
  })();

  // ===== KEYBOARD SHORTCUTS =====
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if (sosDrawer.classList.contains('open')) { closeSOSDrawer(); return; }
      if (emergencyOverlay.classList.contains('active')) { closeEmergencyModal(); return; }
      if (advisoryOverlay.classList.contains('active')) { closeAdvisoryModal(); return; }
      if (deleteOverlay.classList.contains('active')) { closeDeleteModal(); return; }
      if (pinModeActive)    { deactivatePinMode(); activatePanMode(); return; }
      if (measureActive)    { deactivateMeasureMode(); measureClearAll(); closePanel(); activatePanMode(); return; }
      if (activePanel)      { closePanel(); }
    }
    if (e.key === 'f' && !e.ctrlKey && !e.metaKey && document.activeElement.tagName !== 'INPUT') {
      document.getElementById('btn-fullscreen').click();
    }
    if (e.key === 'b' && !e.ctrlKey && !e.metaKey && document.activeElement.tagName !== 'INPUT') {
      if (activePanel === 'layers') { closePanel(); } else { openPanel('layers'); }
    }
    if (e.key === 'h' && !e.ctrlKey && !e.metaKey && document.activeElement.tagName !== 'INPUT') {
      if (!panModeActive) {
        if (pinModeActive) { deactivatePinMode(); }
        if (measureActive) { deactivateMeasureMode(); measureClearAll(); if (activePanel === 'measure') closePanel(); }
        activatePanMode();
      }
    }
    if (e.key === 'p' && !e.ctrlKey && !e.metaKey && document.activeElement.tagName !== 'INPUT') {
      if (pinModeActive) { deactivatePinMode(); activatePanMode(); } else {
        if (measureActive) { deactivateMeasureMode(); measureClearAll(); if (activePanel === 'measure') closePanel(); }
        activatePinMode();
      }
    }
    if (e.key === 'm' && !e.ctrlKey && !e.metaKey && document.activeElement.tagName !== 'INPUT') {
      if (measureActive) { deactivateMeasureMode(); measureClearAll(); closePanel(); activatePanMode(); }
      else               { if (pinModeActive) { deactivatePinMode(); } openPanel('measure'); activateMeasureMode(); }
    }
  });

  updateStats();

  // ===== WEATHER =====
  var wcBody = document.getElementById('wc-body');
  const WConditions_INTERVAL_MS = 300000;
  const WEATHER_CACHE_KEY = 'aqone-live-weather-new-washington-v2';

  var SAFETY_THRESHOLDS = {
    safe:     { windMax: 20, waveMax: 1.0 },
    caution:  { windMax: 40, waveMax: 2.0 },
    advisory: { windMax: 60, waveMax: 3.0 }
  };

  var SAFETY_TIERS = {
    safe:     { label: 'MODEL: LOWER RISK',          cls: 'wc-safety-safe',     color: '#2ecc71' },
    caution:  { label: 'MODEL: CAUTION',             cls: 'wc-safety-caution',  color: '#f1c40f' },
    advisory: { label: 'MODEL: SMALL CRAFT CAUTION', cls: 'wc-safety-advisory', color: '#e67e22' },
    danger:   { label: 'MODEL: HIGH MARINE RISK',    cls: 'wc-safety-danger',   color: '#e74c3c' },
    unknown:  { label: 'CONDITIONS UNKNOWN',     cls: 'wc-safety-unknown',  color: '#7f8c8d' }
  };

  function classifySafety(windKmh, waveM) {
    if (windKmh === null && waveM === null) return SAFETY_TIERS.unknown;
    var w = windKmh !== null ? windKmh : 0;
    var h = waveM !== null ? waveM : 0;
    var t = SAFETY_THRESHOLDS;
    if (windKmh === null || waveM === null) {
      if (w >= t.advisory.windMax || h >= t.advisory.waveMax) return SAFETY_TIERS.danger;
      if (w >= t.caution.windMax  || h >= t.caution.waveMax)  return SAFETY_TIERS.advisory;
      if (w >= t.safe.windMax     || h >= t.safe.waveMax)     return SAFETY_TIERS.caution;
      return SAFETY_TIERS.unknown;
    }
    if (w >= t.advisory.windMax || h >= t.advisory.waveMax) return SAFETY_TIERS.danger;
    if (w >= t.caution.windMax  || h >= t.caution.waveMax)  return SAFETY_TIERS.advisory;
    if (w >= t.safe.windMax     || h >= t.safe.waveMax)     return SAFETY_TIERS.caution;
    return SAFETY_TIERS.safe;
  }

  function degToCompass(deg) {
    var dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
    return dirs[Math.round(deg / 22.5) % 16];
  }

  var WMO_MAP = {
    0:  { label: 'Clear Sky',        cls: '' },
    1:  { label: 'Mainly Clear',     cls: '' },
    2:  { label: 'Partly Cloudy',    cls: '' },
    3:  { label: 'Overcast',         cls: 'wc-icon-cloud' },
    45: { label: 'Foggy',            cls: 'wc-icon-fog' },
    48: { label: 'Rime Fog',         cls: 'wc-icon-fog' },
    51: { label: 'Light Drizzle',    cls: 'wc-icon-rain' },
    53: { label: 'Moderate Drizzle', cls: 'wc-icon-rain' },
    55: { label: 'Dense Drizzle',    cls: 'wc-icon-rain' },
    56: { label: 'Light Freezing Drizzle', cls: 'wc-icon-rain' },
    57: { label: 'Dense Freezing Drizzle', cls: 'wc-icon-rain' },
    61: { label: 'Slight Rain',      cls: 'wc-icon-rain' },
    63: { label: 'Moderate Rain',    cls: 'wc-icon-rain' },
    65: { label: 'Heavy Rain',       cls: 'wc-icon-rain' },
    66: { label: 'Light Freezing Rain',  cls: 'wc-icon-rain' },
    67: { label: 'Heavy Freezing Rain',  cls: 'wc-icon-rain' },
    71: { label: 'Slight Snow',      cls: 'wc-icon-snow' },
    73: { label: 'Moderate Snow',    cls: 'wc-icon-snow' },
    75: { label: 'Heavy Snow',       cls: 'wc-icon-snow' },
    77: { label: 'Snow Grains',      cls: 'wc-icon-snow' },
    80: { label: 'Slight Rain Showers',  cls: 'wc-icon-rain' },
    81: { label: 'Moderate Rain Showers', cls: 'wc-icon-rain' },
    82: { label: 'Violent Rain Showers',  cls: 'wc-icon-rain' },
    85: { label: 'Slight Snow Showers',   cls: 'wc-icon-snow' },
    86: { label: 'Heavy Snow Showers',    cls: 'wc-icon-snow' },
    95: { label: 'Thunderstorm',     cls: 'wc-icon-storm' },
    96: { label: 'Thunderstorm with Hail', cls: 'wc-icon-storm' },
    99: { label: 'Thunderstorm with Heavy Hail', cls: 'wc-icon-storm' }
  };

  function wmoIcon(code) {
    var m = WMO_MAP[code];
    if (!m) return { svg: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>', cls: 'wc-icon-cloud' };
    var svg = '';
    if (m.cls === 'wc-icon-storm') {
      svg = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>';
    } else if (m.cls === 'wc-icon-rain') {
      svg = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/><path d="M8 18l-1 4"/><path d="M12 18l-1 4"/><path d="M16 18l-1 4"/></svg>';
    } else if (m.cls === 'wc-icon-snow') {
      svg = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/><path d="M8 18v2"/><path d="M12 18v2"/><path d="M16 18v2"/></svg>';
    } else if (m.cls === 'wc-icon-fog') {
      svg = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>';
    } else {
      svg = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72l1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>';
    }
    return { svg: svg, cls: m.cls };
  }

  function safetyBadgeHTML(tier) {
    return '<div class="wc-safety-badge ' + tier.cls + '" style="border-color:' + tier.color + '40;color:' + tier.color + ';">' +
      '<span class="wc-safety-dot" style="background:' + tier.color + ';"></span>' +
      tier.label +
    '</div>';
  }

  function renderWeatherCard(data, marineData, meta) {
    var current = data.current || {};
    var marineCurrent = marineData && marineData.current ? marineData.current : {};
    var code = current.weather_code;
    var icon = wmoIcon(code);
    var temp = Math.round(current.temperature_2m);
    var feelsLike = Math.round(current.apparent_temperature);
    var windKmh = Number(current.wind_speed_10m);
    var gustKmh = Number(current.wind_gusts_10m);
    var windDir = degToCompass(current.wind_direction_10m || 0);
    var waveM = Number.isFinite(Number(marineCurrent.wave_height)) ? Number(marineCurrent.wave_height) : null;
    var wavePeriod = Number.isFinite(Number(marineCurrent.wave_period)) ? Number(marineCurrent.wave_period) : null;
    var pressure = Number.isFinite(Number(current.pressure_msl)) ? Number(current.pressure_msl) : null;
    var seaLevel = Number.isFinite(Number(marineCurrent.sea_level_height_msl)) ? Number(marineCurrent.sea_level_height_msl) : null;
    var condText = WMO_MAP[code] ? WMO_MAP[code].label : 'Unknown';
    var safety = classifySafety(Math.max(windKmh || 0, gustKmh || 0), waveM);
    var monitorAlerts = meta && Array.isArray(meta.alerts) ? meta.alerts : [];
    var stale = Boolean(meta && meta.stale);
    var monitorClass = monitorAlerts.length ? 'wc-monitor-danger' : stale ? 'wc-monitor-stale' : 'wc-monitor-safe';
    var monitorText = monitorAlerts.length ?
      monitorAlerts.length + ' incoming severe-weather risk' + (monitorAlerts.length === 1 ? '' : 's') + ' detected' :
      stale ? 'Live monitor paused \u00b7 showing last-known conditions' : '72-hour monitor \u00b7 no severe thresholds detected';
    var observedAt = current.time ? new Date(current.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--';

    wcBody.innerHTML =
      safetyBadgeHTML(safety) +
      '<div class="wc-live-strip"><span class="wc-live-dot ' + (stale ? 'is-stale' : '') + '"></span>' +
        (stale ? 'LAST KNOWN' : 'LIVE MODEL') + ' \u00b7 Updated ' + observedAt + '</div>' +
      '<div class="wc-main">' +
        '<div class="wc-icon ' + icon.cls + '">' + icon.svg + '</div>' +
        '<div class="wc-temp-group">' +
          '<div class="wc-temp">' + temp + '&deg;C</div>' +
          '<div class="wc-condition">' + condText + ' \u00b7 Feels ' + feelsLike + '&deg;</div>' +
        '</div>' +
      '</div>' +
      '<div class="wc-details">' +
        '<div class="wc-detail">' +
          '<span>Wind</span><span class="wc-detail-val">' + windKmh.toFixed(1) + ' / ' + gustKmh.toFixed(1) + ' km/h ' + windDir + '</span>' +
        '</div>' +
        '<div class="wc-detail">' +
          '<span>Waves</span><span class="wc-detail-val">' + (waveM !== null ? waveM.toFixed(2) + ' m / ' + wavePeriod.toFixed(1) + ' s' : '\u2014') + '</span>' +
        '</div>' +
        '<div class="wc-detail">' +
          '<span>Humidity</span><span class="wc-detail-val">' + current.relative_humidity_2m + '%</span>' +
        '</div>' +
        '<div class="wc-detail">' +
          '<span>Pressure</span><span class="wc-detail-val">' + (pressure !== null ? pressure.toFixed(0) + ' hPa' : '\u2014') + '</span>' +
        '</div>' +
        '<div class="wc-detail">' +
          '<span>Sea level</span><span class="wc-detail-val">' + (seaLevel !== null ? seaLevel.toFixed(2) + ' m MSL' : '\u2014') + '</span>' +
        '</div>' +
        '<div class="wc-detail">' +
          '<span>Rain now</span><span class="wc-detail-val">' + Number(current.precipitation || 0).toFixed(1) + ' mm</span>' +
        '</div>' +
      '</div>' +
      '<div class="wc-forecast-monitor ' + monitorClass + '">' + monitorText + '</div>' +
      '<div class="wc-source-row"><span>Open-Meteo weather + marine</span>' +
        '<a href="https://www.pagasa.dost.gov.ph/tropical-cyclone/severe-weather-bulletin" target="_blank" rel="noopener">Verify PAGASA</a></div>';
  }

  function renderForecast(daily) {
    var body = document.getElementById('forecast-body');
    var days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    var html = '<div class="forecast-grid" style="display:flex;gap:4px;">';
    for (var i = 0; i < daily.time.length; i++) {
      var d = new Date(daily.time[i] + 'T12:00:00');
      var dayName = days[d.getDay()];
      var icon = wmoIcon(daily.weather_code[i]);
      var max = Math.round(daily.temperature_2m_max[i]);
      var min = Math.round(daily.temperature_2m_min[i]);
      html += '<div class="forecast-day" style="flex:1;text-align:center;padding:6px 2px;background:rgba(255,255,255,0.04);border-radius:6px;">' +
        '<div style="font-size:10px;font-weight:700;color:var(--text-secondary);margin-bottom:4px;">' + dayName + '</div>' +
        '<div class="' + icon.cls + '" style="color:var(--text-dim);margin-bottom:4px;">' + icon.svg + '</div>' +
        '<div style="font-size:11px;font-weight:700;">' + max + '&deg;</div>' +
        '<div style="font-size:10px;color:var(--text-dim);">' + min + '&deg;</div>' +
      '</div>';
    }
    html += '</div>';
    body.innerHTML = html;
  }

  function renderRainfall(daily) {
    var body = document.getElementById('rainfall-body');
    var days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    var html = '<div class="rainfall-grid" style="display:flex;gap:6px;align-items:flex-end;">';
    var maxPrecip = 1;
    for (var i = 0; i < daily.time.length; i++) {
      if (daily.precipitation_sum[i] > maxPrecip) maxPrecip = daily.precipitation_sum[i];
    }
    for (var i = 0; i < daily.time.length; i++) {
      var d = new Date(daily.time[i] + 'T12:00:00');
      var dayName = days[d.getDay()];
      var precip = daily.precipitation_sum[i] || 0;
      var barH = Math.max(4, (precip / maxPrecip) * 50);
      html += '<div class="rainfall-day" style="flex:1;text-align:center;">' +
        '<div style="font-size:10px;color:var(--text-secondary);margin-bottom:2px;">' + precip.toFixed(1) + '</div>' +
        '<div style="height:54px;display:flex;align-items:flex-end;justify-content:center;">' +
          '<div style="width:100%;max-width:20px;height:' + barH + 'px;background:var(--primary);border-radius:3px 3px 0 0;transition:height 0.3s;"></div>' +
        '</div>' +
        '<div style="font-size:9px;font-weight:600;color:var(--text-dim);margin-top:2px;">' + dayName + '</div>' +
      '</div>';
    }
    html += '</div>';
    body.innerHTML = html;
  }

  function fetchLiveJson(url) {
    var controller = new AbortController();
    var timeout = setTimeout(function () { controller.abort(); }, 25000);
    return fetch(url, { signal: controller.signal })
      .then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.json();
      })
      .finally(function () { clearTimeout(timeout); });
  }

  function readWeatherCache() {
    try {
      var cached = JSON.parse(localStorage.getItem(WEATHER_CACHE_KEY));
      return cached && cached.weather ? cached : null;
    } catch (error) {
      return null;
    }
  }

  function writeWeatherCache(snapshot) {
    try {
      localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify(snapshot));
    } catch (error) {
      console.warn('[AqOne] Could not cache live weather conditions');
    }
  }

  function forecastTimeLabel(value) {
    var time = new Date(value);
    return time.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function buildForecastAlerts(weatherData, marineData) {
    var weather = weatherData.hourly || {};
    var marine = marineData && marineData.hourly ? marineData.hourly : {};
    var marineIndexes = {};
    (marine.time || []).forEach(function (time, index) { marineIndexes[time] = index; });
    var stormCandidate = null;
    var surgeCandidate = null;

    (weather.time || []).slice(0, 72).some(function (time, index) {
      var gust = Number(weather.wind_gusts_10m[index] || 0);
      var wind = Number(weather.wind_speed_10m[index] || 0);
      var direction = Number(weather.wind_direction_10m[index] || 0);
      var rain = Number(weather.precipitation[index] || 0);
      var pressure = Number(weather.pressure_msl[index] || 1013);
      var code = Number(weather.weather_code[index] || 0);
      var marineIndex = marineIndexes[time];
      var wave = marineIndex == null ? 0 : Number(marine.wave_height[marineIndex] || 0);
      var seaLevel = marineIndex == null ? 0 : Number(marine.sea_level_height_msl[marineIndex] || 0);
      var invertedBarometer = marineIndex == null ? 0 : Number(marine.invert_barometer_height[marineIndex] || 0);
      var onshoreWind = direction >= 315 || direction <= 90;

      if (!stormCandidate && (gust >= 89 || (gust >= 63 && pressure <= 1000) || (code >= 95 && gust >= 40))) {
        stormCandidate = { time: time, gust: gust, wind: wind, rain: rain, pressure: pressure, code: code };
      }
      if (!surgeCandidate && onshoreWind && wave >= 1.8 && gust >= 40 &&
          (seaLevel >= 0.55 || invertedBarometer >= 0.12 || pressure <= 1000)) {
        surgeCandidate = { time: time, gust: gust, wave: wave, seaLevel: seaLevel, pressure: pressure };
      }
      return Boolean(stormCandidate && surgeCandidate);
    });

    var alerts = [];
    if (stormCandidate) {
      alerts.push({
        type: 'forecast-storm',
        desc: 'Forecast model flag: possible incoming tropical-cyclone or severe-storm conditions. Gusts ' +
          stormCandidate.gust.toFixed(0) + ' km/h, pressure ' + stormCandidate.pressure.toFixed(0) +
          ' hPa. Verify the latest PAGASA bulletin.',
        time: 'Forecast ' + forecastTimeLabel(stormCandidate.time),
        lat: 11.6845,
        lng: 122.4475,
        status: 'active',
        vesselId: null,
        source: 'forecast-monitor'
      });
    }
    if (surgeCandidate) {
      alerts.push({
        type: 'storm-surge',
        desc: 'Forecast model flag: possible storm-surge risk near New Washington. Sea level ' +
          surgeCandidate.seaLevel.toFixed(2) + ' m MSL, waves ' + surgeCandidate.wave.toFixed(1) +
          ' m, gusts ' + surgeCandidate.gust.toFixed(0) + ' km/h. Verify PAGASA storm-surge warnings.',
        time: 'Forecast ' + forecastTimeLabel(surgeCandidate.time),
        lat: 11.6845,
        lng: 122.4475,
        status: 'active',
        vesselId: null,
        source: 'forecast-monitor'
      });
    }
    return alerts;
  }

  function replaceForecastAlerts(forecastAlerts) {
    for (var index = alertData.length - 1; index >= 0; index--) {
      if (alertData[index].source === 'forecast-monitor') alertData.splice(index, 1);
    }
    for (var alertIndex = forecastAlerts.length - 1; alertIndex >= 0; alertIndex--) {
      alertData.unshift(forecastAlerts[alertIndex]);
    }
    syncAlertIndicators();

    var signature = forecastAlerts.map(function (alert) { return alert.type + ':' + alert.time; }).join('|');
    var previousSignature = localStorage.getItem('aqone-forecast-alert-signature') || '';
    if (signature && signature !== previousSignature && typeof showToast === 'function') {
      showToast('Proactive Weather Alert', forecastAlerts[0].desc, true);
    }
    localStorage.setItem('aqone-forecast-alert-signature', signature);
  }

  function displayWeatherSnapshot(snapshot, stale, alerts) {
    renderWeatherCard(snapshot.weather, snapshot.marine, { stale: stale, alerts: alerts || [] });
    if (snapshot.weather.daily) {
      renderForecast(snapshot.weather.daily);
      renderRainfall(snapshot.weather.daily);
    }
  }

  function fetchWeatherData() {
    var url = 'https://api.open-meteo.com/v1/forecast?latitude=11.6845&longitude=122.4475' +
      '&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m' +
      '&hourly=wind_speed_10m,wind_direction_10m,wind_gusts_10m,precipitation,weather_code,pressure_msl' +
      '&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_sum&forecast_days=7&forecast_hours=72&timezone=Asia%2FManila';
    var marineUrl = 'https://marine-api.open-meteo.com/v1/marine?latitude=11.6845&longitude=122.4475' +
      '&current=wave_height,wave_period,sea_level_height_msl' +
      '&hourly=wave_height,wave_period,sea_level_height_msl,invert_barometer_height&forecast_hours=72&timezone=Asia%2FManila';

    Promise.allSettled([fetchLiveJson(url), fetchLiveJson(marineUrl)])
      .then(function (results) {
        if (results[0].status !== 'fulfilled') throw results[0].reason;
        var snapshot = {
          weather: results[0].value,
          marine: results[1].status === 'fulfilled' ? results[1].value : null,
          fetchedAt: new Date().toISOString()
        };
        var forecastAlerts = buildForecastAlerts(snapshot.weather, snapshot.marine);
        writeWeatherCache(snapshot);
        replaceForecastAlerts(forecastAlerts);
        displayWeatherSnapshot(snapshot, false, forecastAlerts);
      })
      .catch(function (error) {
        var cached = readWeatherCache();
        if (cached) {
          var existingAlerts = alertData.filter(function (alert) { return alert.source === 'forecast-monitor'; });
          displayWeatherSnapshot(cached, true, existingAlerts);
        } else {
          wcBody.innerHTML = '<div class="wc-error">Live weather unavailable. Check connection and PAGASA advisories.</div>';
          document.getElementById('forecast-body').innerHTML = '<p class="panel-stub-text">Forecast data unavailable</p>';
          document.getElementById('rainfall-body').innerHTML = '<p class="panel-stub-text">Rainfall data unavailable</p>';
        }
        console.warn('[AqOne] Live weather monitor unavailable:', error.message);
      });
  }

  fetchWeatherData();
  setInterval(fetchWeatherData, WConditions_INTERVAL_MS);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) fetchWeatherData();
  });

  // ===== EMERGENCY CONTACTS MODAL =====
  const emergencyOverlay = document.getElementById('emergency-modal-overlay');
  const emergencyClose   = document.getElementById('emergency-modal-close');
  const emergencyBtn     = document.getElementById('btn-emergency');

  function openEmergencyModal() {
    emergencyOverlay.classList.add('active');
    emergencyBtn.classList.add('active');
  }

  function closeEmergencyModal() {
    emergencyOverlay.classList.remove('active');
    emergencyBtn.classList.remove('active');
  }

  emergencyBtn.addEventListener('click', openEmergencyModal);
  emergencyClose.addEventListener('click', closeEmergencyModal);

  emergencyOverlay.addEventListener('click', function (e) {
    if (e.target === emergencyOverlay) closeEmergencyModal();
  });

  document.querySelectorAll('.emergency-btn-copy').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var phone = btn.dataset.phone;
      navigator.clipboard.writeText(phone).then(function () {
        var original = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(function () { btn.textContent = original; }, 2000);
      });
    });
  });

  // ===== ADVISORY PANEL =====
  var advisoryPanelClose = document.getElementById('advisory-panel-close');
  var advisoryListEl     = document.getElementById('advisory-list');
  var btnCreateAdvisory  = document.getElementById('btn-create-advisory');
  var advisoryOverlay    = document.getElementById('advisory-modal-overlay');
  var advisoryModalClose = document.getElementById('advisory-modal-close');
  var advBtnCancel       = document.getElementById('adv-btn-cancel');
  var advBtnSave         = document.getElementById('adv-btn-save');
  var advisoryModalTitle = document.getElementById('advisory-modal-title');

  var advTitleInput       = document.getElementById('adv-title');
  var advCategorySelect   = document.getElementById('adv-category');
  var advDescriptionInput = document.getElementById('adv-description');
  var advMunicipalitySelect = document.getElementById('adv-municipality');
  var advPrioritySelect   = document.getElementById('adv-priority');
  var advPublishDateInput = document.getElementById('adv-publish-date');
  var advExpirationDateInput = document.getElementById('adv-expiration-date');
  var advCoverImageInput  = document.getElementById('adv-cover-image');
  var advStatusSelect     = document.getElementById('adv-status');

  var advTitleError       = document.getElementById('adv-title-error');
  var advDescriptionError = document.getElementById('adv-description-error');
  var advMunicipalityError = document.getElementById('adv-municipality-error');

  var deleteOverlay       = document.getElementById('advisory-delete-overlay');
  var deleteClose         = document.getElementById('advisory-delete-close');
  var deleteCancelBtn     = document.getElementById('adv-delete-cancel');
  var deleteConfirmBtn    = document.getElementById('adv-delete-confirm');
  var deleteNameEl        = document.getElementById('advisory-delete-name');

  var editingAdvisoryId   = null;
  var deletingAdvisoryId  = null;

  advisoryPanelClose.addEventListener('click', function () {
    if (activePanel === 'advisories') closePanel();
  });

  function clearAdvisoryErrors() {
    advTitleError.classList.remove('visible');
    advDescriptionError.classList.remove('visible');
    advMunicipalityError.classList.remove('visible');
  }

  function validateAdvisoryForm() {
    clearAdvisoryErrors();
    var valid = true;
    if (!advTitleInput.value.trim()) {
      advTitleError.textContent = 'Title is required';
      advTitleError.classList.add('visible');
      valid = false;
    }
    if (!advDescriptionInput.value.trim()) {
      advDescriptionError.textContent = 'Description is required';
      advDescriptionError.classList.add('visible');
      valid = false;
    }
    if (!advMunicipalitySelect.value) {
      advMunicipalityError.textContent = 'Municipality is required';
      advMunicipalityError.classList.add('visible');
      valid = false;
    }
    return valid;
  }

  function resetAdvisoryForm() {
    advTitleInput.value = '';
    advCategorySelect.value = 'Weather Advisory';
    advDescriptionInput.value = '';
    advMunicipalitySelect.value = 'All';
    advPrioritySelect.value = 'Information';
    advPublishDateInput.value = new Date().toISOString().slice(0, 10);
    advExpirationDateInput.value = '';
    advCoverImageInput.value = '';
    advStatusSelect.value = 'Draft';
    clearAdvisoryErrors();
  }

  function openAdvisoryModal(advisory) {
    if (advisory) {
      editingAdvisoryId = advisory.id;
      advisoryModalTitle.textContent = 'Edit Advisory';
      advTitleInput.value = advisory.title;
      advCategorySelect.value = advisory.category;
      advDescriptionInput.value = advisory.description;
      advMunicipalitySelect.value = advisory.municipality;
      advPrioritySelect.value = advisory.priority;
      advPublishDateInput.value = advisory.publishDate;
      advExpirationDateInput.value = advisory.expirationDate;
      advStatusSelect.value = advisory.status;
    } else {
      editingAdvisoryId = null;
      advisoryModalTitle.textContent = 'Create Advisory';
      resetAdvisoryForm();
      advPublishDateInput.value = new Date().toISOString().slice(0, 10);
    }
    advisoryOverlay.classList.add('active');
  }

  function closeAdvisoryModal() {
    advisoryOverlay.classList.remove('active');
    editingAdvisoryId = null;
    clearAdvisoryErrors();
  }

  btnCreateAdvisory.addEventListener('click', function () {
    openAdvisoryModal(null);
  });

  advisoryModalClose.addEventListener('click', closeAdvisoryModal);
  advBtnCancel.addEventListener('click', closeAdvisoryModal);
  advisoryOverlay.addEventListener('click', function (e) {
    if (e.target === advisoryOverlay) closeAdvisoryModal();
  });

  advBtnSave.addEventListener('click', async function () {
    if (!validateAdvisoryForm()) return;

    var data = {
      title: advTitleInput.value.trim(),
      category: advCategorySelect.value,
      description: advDescriptionInput.value.trim(),
      municipality: advMunicipalitySelect.value,
      priority: advPrioritySelect.value,
      publishDate: advPublishDateInput.value,
      expirationDate: advExpirationDateInput.value,
      coverImage: null,
      status: advStatusSelect.value
    };

    try {
      if (editingAdvisoryId) {
        await AdvisoryService.updateAdvisory(editingAdvisoryId, data);
        showToast('Advisory Updated', data.title);
      } else {
        await AdvisoryService.createAdvisory(data);
        showToast('Advisory Created', data.title);
      }

      closeAdvisoryModal();
      await renderAdvisoryList();
    } catch (err) {
      showToast('Error', err.message, true);
    }
  });

  async function renderAdvisoryList() {
    var advisories = await AdvisoryService.getAdvisories();
    if (advisories.length === 0) {
      advisoryListEl.innerHTML = '<div class="advisory-empty">No advisories yet</div>';
      return;
    }

    advisoryListEl.innerHTML = advisories.map(function (a) {
      var priorityClass = 'priority-' + a.priority.toLowerCase();
      var statusClass = a.status === 'Published' ? 'status-published' : 'status-draft';
      var statusDot = a.status === 'Published'
        ? '<svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"/></svg>'
        : '<svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="9"/></svg>';

      return '<div class="advisory-card" data-id="' + a.id + '">' +
        '<div class="advisory-card-top">' +
          '<span class="advisory-priority-badge ' + priorityClass + '">' + a.priority + '</span>' +
          '<span class="advisory-card-title">' + _escHtml(a.title) + '</span>' +
        '</div>' +
        '<div class="advisory-card-meta">' +
          '<span>' + _escHtml(a.municipality) + '</span>' +
          '<span class="advisory-card-status ' + statusClass + '">' + statusDot + ' ' + a.status + '</span>' +
          '<span>' + a.publishDate + '</span>' +
        '</div>' +
        '<div class="advisory-card-actions">' +
          '<button class="adv-action-btn adv-edit" data-id="' + a.id + '">' +
            '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>' +
            'Edit' +
          '</button>' +
          '<button class="adv-action-btn adv-delete" data-id="' + a.id + '">' +
            '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>' +
            'Delete' +
          '</button>' +
        '</div>' +
      '</div>';
    }).join('');

    advisoryListEl.querySelectorAll('.adv-edit').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        var id = parseInt(btn.dataset.id, 10);
        var advisory = await AdvisoryService.getAdvisory(id);
        if (advisory) openAdvisoryModal(advisory);
      });
    });

    advisoryListEl.querySelectorAll('.adv-delete').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        var id = parseInt(btn.dataset.id, 10);
        var advisory = await AdvisoryService.getAdvisory(id);
        if (!advisory) return;
        deletingAdvisoryId = id;
        deleteNameEl.textContent = advisory.title;
        deleteOverlay.classList.add('active');
      });
    });
  }

  function _escHtml(str) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  function closeDeleteModal() {
    deleteOverlay.classList.remove('active');
    deletingAdvisoryId = null;
  }

  deleteClose.addEventListener('click', closeDeleteModal);
  deleteCancelBtn.addEventListener('click', closeDeleteModal);
  deleteOverlay.addEventListener('click', function (e) {
    if (e.target === deleteOverlay) closeDeleteModal();
  });

  deleteConfirmBtn.addEventListener('click', async function () {
    if (deletingAdvisoryId === null) return;
    try {
      await AdvisoryService.deleteAdvisory(deletingAdvisoryId);
      showToast('Advisory Deleted', 'Advisory has been removed.');
      closeDeleteModal();
      await renderAdvisoryList();
    } catch (err) {
      showToast('Error', err.message, true);
    }
  });

   renderAdvisoryList();

   // ===== SEA CONDITION STATUS =====
   var seaConditionCurrent = document.getElementById('sea-condition-current');
   var seaConditionSetBtn = document.getElementById('sea-condition-set-btn');
   var seaConditionReason = document.getElementById('sea-condition-reason');
   var seaConditionSelectedStatus = null;

   var SEA_STATUS_COLORS = {
     'Safe to Go Out': '#2ecc71',
     'Caution — Check Advisories': '#f1c40f',
     'Not Advised': '#e74c3c'
   };

   function formatSeaConditionTime(iso) {
     if (!iso) return '';
     var d = new Date(iso);
     var now = new Date();
     var diff = Math.floor((now - d) / 1000);
     if (diff < 60) return 'just now';
     if (diff < 3600) return Math.floor(diff / 60) + ' min ago';
     if (diff < 86400) return Math.floor(diff / 3600) + ' hr ago';
     return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
   }

   async function fetchSeaCondition() {
     try {
       var res = await authFetch('/api/sea-condition');
       if (!res.ok) throw new Error('HTTP ' + res.status);
       var data = await res.json();
       var current = data.current || data;
       renderSeaCondition(current);
     } catch (err) {
       console.warn('[AqOne] Could not fetch sea condition:', err.message);
       if (seaConditionCurrent) {
         seaConditionCurrent.innerHTML = '<div class="sea-condition-loading">Unable to load sea condition</div>';
       }
     }
   }

   function renderSeaCondition(current) {
     if (!seaConditionCurrent) return;
     var status = current.status || 'Unknown';
     var reason = current.reason || '';
     var setByName = current.set_by_name || '--';
     var createdAt = current.created_at || '';
     var color = SEA_STATUS_COLORS[status] || '#7f8c8d';
     var statusClass = status === 'Safe to Go Out' ? 'sc-safe' : (status === 'Caution — Check Advisories' ? 'sc-caution' : 'sc-danger');

     var html =
       '<div class="sc-status" style="color:' + color + ';">' + status + '</div>';
     if (reason) {
       html += '<div class="sc-reason">"' + reason + '"</div>';
     }
     html += '<div class="sc-meta">Last set by ' + setByName + ' at ' + formatSeaConditionTime(createdAt) + '</div>';

     seaConditionCurrent.innerHTML = html;
   }

   if (seaConditionSetBtn) {
     seaConditionSetBtn.addEventListener('click', function () {
       if (!seaConditionSelectedStatus) return;
       var reason = seaConditionReason ? seaConditionReason.value.trim() : '';
       var status = seaConditionSelectedStatus;

       if (!confirm('Are you sure you want to set status to "' + status + '"?')) return;

       var body = {
         status: status,
         reason: reason,
         set_by_user_id: CURRENT_USER.id,
         set_by_name: CURRENT_USER.name
       };

       authFetch('/api/sea-condition', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify(body)
       })
         .then(function (res) {
           if (!res.ok) throw new Error('HTTP ' + res.status);
           return res.json();
         })
         .then(function (data) {
           var current = data.current || data;
           renderSeaCondition(current);
           if (seaConditionReason) seaConditionReason.value = '';
           seaConditionSelectedStatus = null;
           showToast('Sea Condition Updated', 'Status set to "' + status + '".');
         })
         .catch(function (err) {
           console.error('[AqOne] Failed to set sea condition:', err.message);
           showToast('Error', 'Failed to update sea condition.', true);
         });
     });
   }

   document.querySelectorAll('.sea-condition-btn').forEach(function (btn) {
     btn.addEventListener('click', function () {
       document.querySelectorAll('.sea-condition-btn').forEach(function (b) { b.classList.remove('active'); });
       btn.classList.add('active');
       seaConditionSelectedStatus = btn.dataset.status;
     });
   });

   fetchSeaCondition();

   // ===== BANNER "LAST UPDATED" TICKER =====
   var bannerElapsed = 0;
   setInterval(function () {
     bannerElapsed += 30;
     var el = document.querySelector('.banner-time');
     if (el) el.textContent = bannerElapsed + 's ago';
   }, 30000);

   // ===== TOAST =====
   function showToast(title, msg, isError) {
     var container = document.getElementById('toast-container');
     var toast = document.createElement('div');
     toast.className = 'toast';
     if (isError) toast.classList.add('toast-error');
     toast.innerHTML = '<div class="toast-title">' + title + '</div><div class="toast-msg">' + msg + '</div>';
     container.appendChild(toast);
     setTimeout(function () {
       toast.classList.add('toast-leave');
       setTimeout(function () { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 300);
     }, 4000);
   }

})();
