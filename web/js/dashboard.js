(function () {
  'use strict';

  // ===== CONFIG =====
  const OPS_CENTER = [11.65159, 122.43286];
  const OPS_ZOOM = 11;

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

  // ===== MOCK CURRENT USER =====
  const CURRENT_USER = { id: 'pcg_ops_region6', name: 'SAR Duty Officer' };

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
  const shoreStations = [
    { name: 'PCG Aklan Station', lat: 11.7059, lng: 122.3693, type: 'PCG Station', status: 'active', role: 'Shore gateway' },
    { name: 'BFAR New Washington', lat: 11.7641, lng: 122.4296, type: 'BFAR Station', status: 'active', role: 'Shore gateway' },
    { name: 'Malay Gateway', lat: 11.9007, lng: 121.9191, type: 'Gateway', status: 'warning', role: 'Shore gateway' },
  ];

  // Buoy nodes — GPS, barometer, current sensing, solar + battery, LoRa mesh radio
  const initialBuoys = [
    { name: 'Buoy Alpha',   id: 'buoy-alpha',   lat: 11.82, lng: 122.20, status: 'active',  battery: 87, signal: 'Strong',   pressure: 1008.4, pressureTrend: -1.2, current: '0.6 m/s', currentDir: 'SW',  coverageRadius: 2000, isGateway: true },
    { name: 'Buoy Bravo',   id: 'buoy-bravo',   lat: 11.95, lng: 121.95, status: 'active',  battery: 72, signal: 'Moderate', pressure: 1007.1, pressureTrend: -2.8, current: '0.9 m/s', currentDir: 'S',   coverageRadius: 2000 },
    { name: 'Buoy Charlie', id: 'buoy-charlie', lat: 11.75, lng: 122.38, status: 'warning', battery: 31, signal: 'Weak',     pressure: 1006.3, pressureTrend: -3.4, current: '0.4 m/s', currentDir: 'W',   coverageRadius: 2000 },
    { name: 'Buoy Delta',   id: 'buoy-delta',   lat: 11.65, lng: 122.15, status: 'active',  battery: 94, signal: 'Strong',   pressure: 1008.9, pressureTrend: -0.5, current: '0.3 m/s', currentDir: 'SE',  coverageRadius: 2000 },
    { name: 'Buoy Echo',    id: 'buoy-echo',    lat: 11.88, lng: 122.45, status: 'danger',  battery: 12, signal: 'Lost',     pressure: null,   pressureTrend: null, current: null,     currentDir: null, coverageRadius: 2000 },
  ];

  const meshLinks = [
    ['Buoy Alpha', 'Buoy Bravo'],
    ['Buoy Alpha', 'Buoy Charlie'],
    ['Buoy Alpha', 'Buoy Delta'],
    ['Buoy Alpha', 'Buoy Echo'],
    ['Buoy Charlie', 'Buoy Echo'],
    ['Buoy Bravo', 'Buoy Delta'],
    ['Buoy Alpha', 'PCG Aklan Station'],
    ['Buoy Bravo', 'Malay Gateway'],
  ];

  const incidents = [
    { name: 'Overdue Vessel — San Pedro', lat: 11.7823, lng: 122.1234, severity: 'danger', date: '2026-08-04', type: 'Overdue Vessel' },
    { name: 'Squall Watch — Boracay North', lat: 11.9850, lng: 121.9100, severity: 'warning', date: '2026-08-04', type: 'Squall Nowcast' },
    { name: 'Overdue Vessel — Maria Gracia', lat: 11.6789, lng: 122.4567, severity: 'warning', date: '2026-08-04', type: 'Overdue Vessel' },
  ];

  const opsBoundary = [
    [11.97, 121.87], [12.00, 121.95], [11.95, 122.10], [11.92, 122.25],
    [11.85, 122.45], [11.78, 122.55], [11.65, 122.50], [11.55, 122.42],
    [11.50, 122.30], [11.52, 122.15], [11.58, 122.00], [11.65, 121.92],
    [11.75, 121.88], [11.85, 121.87], [11.97, 121.87]
  ];

  // Squall nowcasting state (from buoy barometer array)
  const squallData = {
    state: 'return-now', // 'monitoring' | 'watch' | 'return-now'
    detectingBuoys: ['Buoy Bravo', 'Buoy Charlie'],
    pressureDrop: '3.1 hPa / 30 min',
    leadTimeMin: 45,
    onset: 'est. 14:20',
    propagation: 'SW 18 km/h',
    confidence: 88,
    note: 'Localized convective squall developing across northern approach — every phone in contact range gets a RETURN NOW alert; buoys flash physically.'
  };

  // Drift prediction / Bayesian search allocation state
  const driftData = {
    active: true,
    vesselId: 'V-002',
    vesselName: 'San Pedro',
    lkp: 'Buoy-B, 09:40, heading NW',
    elapsedMin: 47,
    lkpLat: 11.7823, lkpLng: 122.1234,
    searchArea: { h1: '12.4 km²', h6: '68 km²', h24: '210 km²' },
    sectorsTotal: 6,
    sectorsSearched: 2,
    currentField: '0.6 m/s SW (buoy-derived)',
    survivability: 'High — sea temp 29°C, light sea state',
    note: 'Probability density propagated from last-contact position; PCG sectors re-tasked as negatives are reported.'
  };

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
  var coverageCircles = {};
  initialBuoys.forEach(function (b) {
    var circle = L.circle([b.lat, b.lng], {
      radius: b.coverageRadius || 2000,
      color: '#60a5fa',
      fillColor: '#60a5fa',
      fillOpacity: 0.08,
      weight: 1.5,
      dashArray: '6 4',
      opacity: 0.4
    });
    coverageLayer.addLayer(circle);
    coverageCircles[b.name] = circle;
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

  // ===== SQUALL NOWCAST WATCH =====
  function renderSquallLayer() {
    squallLayer.clearLayers();
    var activeBuoys = initialBuoys.filter(function (b) { return squallData.detectingBuoys.indexOf(b.name) !== -1; });
    activeBuoys.forEach(function (b) {
      if (b.lat === undefined) return;
      var circle = L.circle([b.lat, b.lng], {
        radius: 5000,
        color: '#e67e22',
        fillColor: '#e67e22',
        fillOpacity: squallData.state === 'return-now' ? 0.25 : 0.12,
        weight: 2,
        opacity: 0.8,
        dashArray: '6 6',
        className: 'squall-watch-circle'
      });
      squallLayer.addLayer(circle);
    });

    var centroid = activeBuoys.length
      ? activeBuoys.reduce(function (acc, b) { acc[0] += b.lat; acc[1] += b.lng; return acc; }, [0, 0])
      : null;
    if (centroid && activeBuoys.length) {
      centroid[0] /= activeBuoys.length;
      centroid[1] /= activeBuoys.length;
      var warning = L.polygon([
        [centroid[0] - 0.06, centroid[1] - 0.09],
        [centroid[0] - 0.06, centroid[1] + 0.09],
        [centroid[0] + 0.10, centroid[1] + 0.06],
        [centroid[0] + 0.10, centroid[1] - 0.06]
      ], {
        color: squallData.state === 'return-now' ? '#e74c3c' : '#e67e22',
        weight: 2.5,
        fillColor: squallData.state === 'return-now' ? '#e74c3c' : '#e67e22',
        fillOpacity: 0.15,
        className: 'squall-watch-poly'
      });
      var labelText = squallData.state === 'return-now'
        ? 'RETURN NOW — squall onset ' + squallData.onset
        : 'Squall watch — ' + squallData.detectingBuoys.length + ' buoys detecting pressure drop';
      warning.bindTooltip(labelText, { permanent: true, direction: 'center', className: 'squall-tooltip' });
      squallLayer.addLayer(warning);
    }
  }

  // ===== DRIFT PROBABILITY FIELD =====
  function renderDriftLayer() {
    driftLayer.clearLayers();
    if (!driftData.active) return;
    var c = [driftData.lkpLat, driftData.lkpLng];
    var contours = [
      { r: 2500,  opacity: 0.30, weight: 2.5 },
      { r: 5000,  opacity: 0.20, weight: 2 },
      { r: 8000,  opacity: 0.12, weight: 1.5 },
      { r: 12000, opacity: 0.06, weight: 1 }
    ];
    contours.forEach(function (ct) {
      var circle = L.circle(c, {
        radius: ct.r,
        color: '#e74c3c',
        fillColor: '#e74c3c',
        fillOpacity: ct.opacity,
        weight: ct.weight,
        opacity: 0.7,
        className: 'drift-contour'
      });
      driftLayer.addLayer(circle);
    });

    // drift direction arrow (SW current + wind leeway)
    var dir = { lat: -0.045, lng: -0.06 };
    var arrowEnd = [c[0] + dir.lat, c[1] + dir.lng];
    var arrow = L.polyline([c, arrowEnd], {
      color: '#f1c40f',
      weight: 2.5,
      opacity: 0.9
    });
    driftLayer.addLayer(arrow);

    // Bayesian search sectors
    var sectors = [
      { center: [c[0] + dir.lat * 0.5, c[1] + dir.lng * 0.5], searched: true,  color: '#2ecc71' },
      { center: [c[0] + dir.lat * 0.8, c[1] + dir.lng * 0.8], searched: false, color: '#f1c40f' },
      { center: [c[0] + dir.lat * 0.3, c[1] + dir.lng * 1.2], searched: false, color: '#f1c40f' }
    ];
    sectors.forEach(function (s, i) {
      var poly = L.polygon([
        [s.center[0] - 0.025, s.center[1] - 0.035],
        [s.center[0] - 0.025, s.center[1] + 0.035],
        [s.center[0] + 0.035, s.center[1] + 0.03],
        [s.center[0] + 0.035, s.center[1] - 0.03]
      ], {
        color: s.color,
        weight: 2,
        fillColor: s.color,
        fillOpacity: s.searched ? 0.12 : 0.06,
        dashArray: s.searched ? null : '4 4'
      });
      poly.bindTooltip(s.searched ? 'Sector ' + (i + 1) + ' — searched, negative' : 'Sector ' + (i + 1) + ' — next highest probability mass', { direction: 'center', className: 'drift-tooltip' });
      driftLayer.addLayer(poly);
    });

    var lkp = L.marker(c, { icon: createOverdueIcon() });
    driftLayer.addLayer(lkp);
  }

  // ===== INCIDENT MARKERS =====
  const incidentDrawerData = [
    { alertType: 'overdue', headerText: 'OVERDUE VESSEL — MISSED EXPECTED CONTACT',
      vesselId: 'V-002', owner: 'Ramon Flores',
      position: '11.7823\u00B0 N, 122.1234\u00B0 E', lat: 11.7823, lng: 122.1234,
      buoy: 'Buoy-B', coverage: 'Last seen within Buoy-B coverage radius \u2014 flagged as overdue',
      confidence: 88, stage: 'Stage 3 \u2014 SCORED ALERT', nextContact: 'Buoy-C \u00b7 10:05 (missed \u2014 47 min)',
      timerBaseline: 47 * 60 },
    { alertType: 'squall', headerText: 'RETURN NOW — SQUALL NOWCAST',
      vesselId: 'ALL', owner: 'Broadcast \u2014 all vessels in contact range',
      position: 'Approach NW \u2014 arrival est. 14:20', lat: 11.9850, lng: 121.9100,
      buoy: 'Buoy-B / Buoy-C', coverage: 'Alert propagated across LoRa mesh \u2014 waiting at every buoy',
      confidence: 88, stage: 'Squall nowcast \u2014 45 min lead', nextContact: 'Delivered to phones on next contact',
      timerBaseline: 12 * 60 },
    { alertType: 'overdue', headerText: 'OVERDUE VESSEL — ESCALATING',
      vesselId: 'V-005', owner: 'Felix Tambong',
      position: '11.6789\u00B0 N, 122.4567\u00B0 E', lat: 11.6789, lng: 122.4567,
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
    document.getElementById(checkboxId).addEventListener('change', function () {
      if (this.checked) { layer.addTo(map); } else { map.removeLayer(layer); }
    });
  }

  toggleLayer('toggle-gateways',  gatewayLayer);
  toggleLayer('toggle-vessels',   vesselLayer);
  toggleLayer('toggle-incidents', incidentLayer);
  toggleLayer('toggle-buoys',     buoyLayer);
  toggleLayer('toggle-coverage',  coverageLayer);
  toggleLayer('toggle-mesh',      meshLayer);
  toggleLayer('toggle-squall',    squallLayer);
  toggleLayer('toggle-drift',     driftLayer);
  toggleLayer('toggle-boundary',  boundaryLayer);
  toggleLayer('toggle-pins',      pinLayer);

  // ===== STATS PANEL =====
  const statsWidget = document.getElementById('stats-widget');
  const statsMinimizeBtn = document.getElementById('stats-minimize');
  const statsBody = document.getElementById('stats-body');
  let statsMinimized = false;

  statsMinimizeBtn.addEventListener('click', () => {
    statsMinimized = !statsMinimized;
    statsWidget.classList.toggle('minimized', statsMinimized);
    statsMinimizeBtn.innerHTML = statsMinimized ? '+' : '&minus;';
  });

  // Active alerts card click
  const statAlertsCard = document.querySelector('.stat-card.stat-alerts');
  if (statAlertsCard) {
    statAlertsCard.style.cursor = 'pointer';
    statAlertsCard.addEventListener('click', function() {
      statsTabs.forEach(t => t.classList.remove('active'));
      tabContents.forEach(tc => tc.classList.remove('active'));
      document.querySelector('.stats-tab[data-tab="alerts"]').classList.add('active');
      document.getElementById('tab-alerts').classList.add('active');
      if (statsMinimized) { statsMinimized = false; statsWidget.classList.remove('minimized'); statsMinimizeBtn.innerHTML = '&minus;'; }
    });
  }

  // ===== LEGEND =====
  const legendCard = document.querySelector('.map-legend');
  const legendToggle = document.getElementById('legend-toggle');
  let legendCollapsed = false;

  legendToggle.addEventListener('click', () => {
    legendCollapsed = !legendCollapsed;
    legendCard.classList.toggle('collapsed', legendCollapsed);
    legendToggle.innerHTML = legendCollapsed ? '+' : '&minus;';
  });

  // ===== TAB SWITCHING =====
  const statsTabs = document.querySelectorAll('.stats-tab');
  const tabContents = document.querySelectorAll('.tab-content');

  statsTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      statsTabs.forEach(t => t.classList.remove('active'));
      tabContents.forEach(tc => tc.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
    });
  });

  // ===== VESSEL DATA (phone–buoy contact events) =====
  const vessels = [
    { name: 'Sta. Maria',      id: 'V-001', owner: 'Juan dela Cruz', status: 'in-coverage',     checkin: '2 minutes ago',     lat: 11.6431, lng: 122.3456, buoy: 'Buoy-A', next: 'Buoy-D \u00b7 10:15' },
    { name: 'San Pedro',       id: 'V-002', owner: 'Ramon Flores',   status: 'overdue',         checkin: '47 minutes ago',    lat: 11.7823, lng: 122.1234, buoy: 'Buoy-B', next: 'Buoy-C \u00b7 10:05 (MISSED)' },
    { name: 'Birhen sa Regla', id: 'V-003', owner: 'Eddie Magbanua', status: 'out-of-coverage', checkin: '1 hour ago',        lat: 11.5012, lng: 122.5678, buoy: null,    next: 'No expected contact' },
    { name: 'Sto. Nino',       id: 'V-004', owner: 'Rodel Javines',  status: 'in-coverage',     checkin: '5 minutes ago',     lat: 11.8234, lng: 122.2345, buoy: 'Buoy-C', next: 'Buoy-A \u00b7 10:40' },
    { name: 'Maria Gracia',    id: 'V-005', owner: 'Felix Tambong',  status: 'overdue',         checkin: '1 hour 12 minutes ago', lat: 11.6789, lng: 122.4567, buoy: 'Buoy-A', next: 'Buoy-A \u00b7 09:15 (MISSED)' },
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
      position: '11.7823\u00B0 N, 122.1234\u00B0 E',
      timerBaseline: 47 * 60,
      buoy: 'Buoy-B', coverage: 'Last seen within Buoy-B coverage radius \u2014 flagged as overdue',
      confidence: 88, stage: 'Stage 3 \u2014 SCORED ALERT', nextContact: 'Buoy-C \u00b7 10:05 (missed \u2014 47 min)'
    },
    'V-005': {
      alertType: 'overdue', headerText: 'OVERDUE VESSEL — ESCALATING',
      vesselId: 'V-005', owner: 'Felix Tambong',
      position: '11.6789\u00B0 N, 122.4567\u00B0 E',
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
    { type: 'overdue-vessel', desc: 'Overdue \u2014 "San Pedro" (V-002) missed expected contact at Buoy-C', time: '14 minutes ago',  lat: 11.7823, lng: 122.1234, status: 'active', vesselId: 'V-002', confidence: 88, stage: 'STAGE 3 \u2014 SCORED ALERT' },
    { type: 'sos',             desc: 'Manual SOS \u2014 Vessel "San Pedro" (V-002)',                       time: '14 minutes ago',  lat: 11.7823, lng: 122.1234, status: 'active', vesselId: 'V-002', confidence: 92, stage: 'STAGE 3 \u2014 SCORED ALERT' },
    { type: 'wave-zone',       desc: 'Squall Nowcast \u2014 RETURN NOW on Buoy-B / Buoy-C',                time: '12 minutes ago',  lat: 11.7901, lng: 122.1456, status: 'active', vesselId: null, confidence: 88, stage: 'SQUALL \u2014 45 MIN LEAD' },
    { type: 'overdue-vessel',  desc: 'Overdue \u2014 "Maria Gracia" (V-005) check-in request outstanding', time: '1 hour 12 minutes ago', lat: 11.6789, lng: 122.4567, status: 'acknowledged', vesselId: 'V-005', confidence: 64, stage: 'STAGE 2 \u2014 CHECK-IN' },
    { type: 'capsizing-risk',  desc: 'Resolved \u2014 false alarm from single-vessel deviation',            time: '2 hours ago',     lat: 11.6431, lng: 122.3456, status: 'resolved', vesselId: null, confidence: 41, stage: 'STAGE 1 \u2014 SILENT CHECK-IN' },
  ];

  function alertIcon(type) {
    const icons = {
      'sos': `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
      'wave-zone': `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12c1.5-2 3.5-3 5.5-3s4 1 5.5 3 3.5 3 5.5 3 4-1 5.5-3"/><path d="M2 7c1.5-2 3.5-3 5.5-3s4 1 5.5 3 3.5 3 5.5 3 4-1 5.5-3"/></svg>`,
      'overdue-vessel': `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>`,
      'capsizing-risk': `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
    };
    const colors = { 'sos': 'icon-red', 'wave-zone': 'icon-yellow', 'overdue-vessel': 'icon-orange', 'capsizing-risk': 'icon-yellow' };
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
  if (squallCountEl) squallCountEl.textContent = squallData.state === 'return-now' ? 1 : 0;

  // ===== SAR METRICS TAB =====
  const sarMetrics = [
    { label: 'Time from incident to alert', value: '22 min', target: 'Target: tens of minutes (vs hours/overnight today)' },
    { label: 'Search area \u2014 hour 1', value: '12.4 km\u00B2', target: 'Shrinks as drift model learns local current field' },
    { label: 'Search area \u2014 hour 6', value: '68 km\u00B2', target: '' },
    { label: 'Search area \u2014 hour 24', value: '210 km\u00B2', target: '' },
    { label: 'Survival rate (alerted incidents)', value: '94%', target: '' },
    { label: 'False alarm rate', value: '6%', target: 'Confidence scoring keeps this low \u2014 PCG trust is non-negotiable' },
    { label: 'Buoy coverage of municipal waters', value: '68%', target: 'Retrofit existing aids first, then site by trip density' },
    { label: 'Squall alert lead time', value: '45 min', target: '30\u201390 min window from pressure-field model' },
    { label: 'Squall alert hit rate', value: '88%', target: '' },
    { label: 'App adoption (registered fisherfolk)', value: '1,247 / 2,500', target: 'Distributed via BFAR FishR registration' },
  ];

  function renderSarMetrics() {
    const list = document.getElementById('sar-list');
    list.innerHTML = sarMetrics.map(m => `
      <div class="sar-row">
        <div class="sar-label">${m.label}</div>
        <div class="sar-value">${m.value}</div>
        ${m.target ? `<div class="sar-target">${m.target}</div>` : ''}
      </div>
    `).join('');
  }

  renderSarMetrics();
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

  sosBtnAcknowledge.addEventListener('click', function () {
    sosBtnAcknowledge.disabled = true;
    sosBtnAcknowledge.textContent = 'Acknowledged';
    console.log('Alert ' + (currentDrawerData ? currentDrawerData.vesselId : '') + ' acknowledged');
    if (currentDrawerData) {
      const idx = alertData.findIndex(function (a) {
        return a.vesselId === currentDrawerData.vesselId ||
               (a.lat === currentDrawerData.lat && a.lng === currentDrawerData.lng);
      });
      if (idx !== -1) { alertData[idx].status = 'acknowledged'; renderAlerts(); }
    }
  });

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
  buoyRailBadge.textContent = buoyOnlineCount + '/' + buoyTotal;
  buoyDrawerBadge.textContent = buoyOnlineCount + '/' + buoyTotal + ' Online';
  if (buoyOnlineCount < buoyTotal) {
    buoyRailBadge.classList.add('badge-amber');
    buoyDrawerBadge.classList.add('badge-amber');
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
      squall: squallData,
      drift: { active: driftData.active, lkp: driftData.lkp },
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

  // ===== THEME TOGGLE (shared with profile.html) =====
  (function () {
    var STORAGE_KEY = 'aqone-theme';
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

    var savedTheme = localStorage.getItem(STORAGE_KEY) || 'light';
    applyTheme(savedTheme);

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
  const WConditions_INTERVAL_MS = 600000;

  var SAFETY_THRESHOLDS = {
    safe:     { windMax: 20, waveMax: 1.0 },
    caution:  { windMax: 40, waveMax: 2.0 },
    advisory: { windMax: 60, waveMax: 3.0 }
  };

  var SAFETY_TIERS = {
    safe:     { label: 'SAFE TO SAIL',         cls: 'wc-safety-safe',     color: '#2ecc71' },
    caution:  { label: 'CAUTION',               cls: 'wc-safety-caution',  color: '#f1c40f' },
    advisory: { label: 'SMALL CRAFT ADVISORY',  cls: 'wc-safety-advisory', color: '#e67e22' },
    danger:   { label: 'DO NOT SAIL',           cls: 'wc-safety-danger',   color: '#e74c3c' },
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

  function renderWeatherCard(data, waveM) {
    var code = data.current.weather_code;
    var icon = wmoIcon(code);
    var temp = Math.round(data.current.temperature_2m);
    var windKmh = data.current.wind_speed_10m;
    var windDir = degToCompass(data.current.wind_direction_10m || 0);
    var condText = WMO_MAP[code] ? WMO_MAP[code].label : 'Unknown';

    var safety = classifySafety(windKmh, waveM);

    wcBody.innerHTML =
      safetyBadgeHTML(safety) +
      '<div class="wc-main">' +
        '<div class="wc-icon ' + icon.cls + '">' + icon.svg + '</div>' +
        '<div class="wc-temp-group">' +
          '<div class="wc-temp">' + temp + '&deg;C</div>' +
          '<div class="wc-condition">' + condText + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="wc-details">' +
        '<div class="wc-detail">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2"/></svg>' +
          '<span class="wc-detail-val">' + windKmh + ' km/h</span>' +
          '<span>' + windDir + '</span>' +
        '</div>' +
        '<div class="wc-detail">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12c1.5-2 3.5-3 5.5-3s4 1 5.5 3 3.5 3 5.5 3 4-1 5.5-3"/></svg>' +
          '<span class="wc-detail-val">' + (waveM !== null ? waveM.toFixed(1) + ' m' : '\u2014') + '</span>' +
          '<span>Waves</span>' +
        '</div>' +
        '<div class="wc-detail">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>' +
          '<span class="wc-detail-val">' + data.current.relative_humidity_2m + '%</span>' +
          '<span>Humidity</span>' +
        '</div>' +
      '</div>';
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

  function fetchWeatherData() {
    var url = 'https://api.open-meteo.com/v1/forecast?latitude=11.65159&longitude=122.43286' +
      '&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m' +
      '&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_sum&forecast_days=7&timezone=auto';
    var marineUrl = 'https://marine-api.open-meteo.com/v1/marine?latitude=11.65159&longitude=122.43286' +
      '&current=wave_height&timezone=auto';

    Promise.all([
      fetch(url).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }),
      fetch(marineUrl).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).catch(function () { return null; })
    ])
    .then(function (results) {
      var weatherData = results[0];
      var marineData  = results[1];
      var waveM = null;
      if (marineData && marineData.current && typeof marineData.current.wave_height === 'number') {
        waveM = marineData.current.wave_height;
      }
      renderWeatherCard(weatherData, waveM);
      if (weatherData.daily) {
        renderForecast(weatherData.daily);
        renderRainfall(weatherData.daily);
      }
    })
    .catch(function () {
      wcBody.innerHTML = '<div class="wc-error">Weather data unavailable</div>';
      document.getElementById('forecast-body').innerHTML = '<p class="panel-stub-text">Forecast data unavailable</p>';
      document.getElementById('rainfall-body').innerHTML = '<p class="panel-stub-text">Rainfall data unavailable</p>';
    });
  }

  fetchWeatherData();
  setInterval(fetchWeatherData, WConditions_INTERVAL_MS);

  // ===== SQUALL NOWCAST CARD =====
  function renderSquallCard() {
    var statusEl = document.getElementById('squall-status');
    var bodyEl = document.getElementById('squall-body');

    if (squallData.state === 'return-now') {
      statusEl.textContent = 'RETURN NOW';
      statusEl.className = 'squall-status squall-return';
    } else if (squallData.state === 'watch') {
      statusEl.textContent = 'WATCH';
      statusEl.className = 'squall-status squall-watch';
    } else {
      statusEl.textContent = 'MONITORING';
      statusEl.className = 'squall-status squall-moni';
    }

    var html = '';
    html += '<div class="squall-hero">' +
      '<div class="squall-hero-title">Localized convective squall developing</div>' +
      '<div class="squall-hero-meta">' +
        '<span><strong>' + squallData.detectingBuoys.length + '</strong> buoys detecting pressure drop</span>' +
        '<span><strong>' + squallData.leadTimeMin + ' min</strong> lead \u00b7 ' + squallData.onset + '</span>' +
      '</div>' +
      '<div class="squall-hero-note">' + squallData.note + '</div>' +
    '</div>';

    html += '<div class="squall-buoys">';
    buoyMonitorData.forEach(function (b) {
      if (b.pressure == null) return;
      var trend = b.pressureTrend != null ? b.pressureTrend : 0;
      var trendColor = trend <= -2.5 ? '#e67e22' : (trend >= 1 ? '#22c55e' : '#94a3b8');
      var arrow = trend > 0 ? '\u2191' : trend < 0 ? '\u2193' : '\u2192';
      html += '<div class="squall-buoy">' +
        '<span class="squall-buoy-name">' + b.name + '</span>' +
        '<span class="squall-pressure">' + b.pressure.toFixed(1) + ' hPa</span>' +
        '<span class="squall-trend" style="color:' + trendColor + ';">' + arrow + ' ' + (trend > 0 ? '+' : '') + trend.toFixed(1) + '</span>' +
      '</div>';
    });
    html += '</div>';

    html += '<div class="squall-meta">' +
      '<span>Propagation: ' + squallData.propagation + '</span>' +
      '<span>Model confidence: <strong style="color:#f1c40f;">' + squallData.confidence + '%</strong></span>' +
    '</div>';
    bodyEl.innerHTML = html;
  }
  renderSquallCard();

  // ===== DRIFT & SEARCH CARD =====
  function renderDriftCard() {
    var bodyEl = document.getElementById('drift-body');
    if (!driftData.active) {
      bodyEl.innerHTML = '<p class="panel-stub-text">No active drift scenario</p>';
      return;
    }
    var searchedPct = Math.round((driftData.sectorsSearched / driftData.sectorsTotal) * 100);
    var html = '';
    html += '<div class="drift-hero">' +
      '<div class="drift-hero-title">' + driftData.vesselName + ' (' + driftData.vesselId + ')</div>' +
      '<div class="drift-hero-meta">' +
        '<span>LKP: ' + driftData.lkp + '</span>' +
        '<span>Elapsed: <strong>' + driftData.elapsedMin + ' min</strong></span>' +
      '</div>' +
    '</div>';

    html += '<div class="drift-areas">';
    html += '<div class="drift-area"><span class="drift-area-label">Hr 1</span><span class="drift-area-value">' + driftData.searchArea.h1 + '</span></div>';
    html += '<div class="drift-area"><span class="drift-area-label">Hr 6</span><span class="drift-area-value">' + driftData.searchArea.h6 + '</span></div>';
    html += '<div class="drift-area"><span class="drift-area-label">Hr 24</span><span class="drift-area-value">' + driftData.searchArea.h24 + '</span></div>';
    html += '</div>';

    html += '<div class="drift-row"><span class="drift-label">Sectors searched</span>' +
      '<span class="drift-value">' + driftData.sectorsSearched + ' / ' + driftData.sectorsTotal + ' (' + searchedPct + '%)</span></div>';
    html += '<div class="drift-progress"><div class="drift-progress-fill" style="width:' + searchedPct + '%"></div></div>';

    html += '<div class="drift-row"><span class="drift-label">Current field</span><span class="drift-value">' + driftData.currentField + '</span></div>';
    html += '<div class="drift-row"><span class="drift-label">Survivability</span><span class="drift-value drift-survivability">' + driftData.survivability + '</span></div>';
    html += '<div class="drift-note">' + driftData.note + '</div>';

    bodyEl.innerHTML = html;
  }
  renderDriftCard();

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
       var res = await fetch('/api/sea-condition');
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

       fetch('/api/sea-condition', {
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
