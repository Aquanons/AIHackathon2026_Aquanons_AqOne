(function () {
  'use strict';

  // ===== CONFIG =====
  const NEW_WASHINGTON_CENTER = [11.65159, 122.43286];
  const NEW_WASHINGTON_ZOOM = 13;

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

  const API_BASE = window.AQONE_API_BASE || '';
  const PIN_POLL_INTERVAL_MS = 15000;

  // ===== MOCK CURRENT USER =====
  const CURRENT_USER = { id: 'lgu_admin_kalibo', name: 'LGU Administrator' };

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
  const facilities = [
    { name: 'Kalibo MDRRMO', lat: 11.7059, lng: 122.3693, type: 'MDRRMO', status: 'active', pop: '15,200' },
    { name: 'Malay Municipal Hall', lat: 11.9007, lng: 121.9191, type: 'Municipal Hall', status: 'active', pop: '8,400' },
    { name: 'Boracay Health Center', lat: 11.9674, lng: 121.9248, type: 'Health Center', status: 'active', pop: '32,100' },
    { name: 'New Washington Fish Port', lat: 11.7641, lng: 122.4296, type: 'Fish Port', status: 'active', pop: '12,600' },
    { name: 'Banga Rural Health Unit', lat: 11.6364, lng: 122.3328, type: 'Health Unit', status: 'warning', pop: '9,800' },
    { name: 'Batan Municipal Hall', lat: 11.5861, lng: 122.4089, type: 'Municipal Hall', status: 'active', pop: '7,100' },
    { name: 'Ibajay LGU Office', lat: 11.8179, lng: 122.1650, type: 'LGU Office', status: 'active', pop: '6,400' },
    { name: 'Nabas Emergency Station', lat: 11.8188, lng: 122.0522, type: 'Emergency Station', status: 'warning', pop: '5,200' },
  ];

  const initialBuoys = [
    { name: 'Buoy Alpha', lat: 11.82, lng: 122.20, status: 'active', battery: 87, signal: 'Strong', coverageRadius: 2000, isGateway: true },
    { name: 'Buoy Bravo', lat: 11.95, lng: 121.95, status: 'active', battery: 72, signal: 'Moderate', coverageRadius: 2000 },
    { name: 'Buoy Charlie', lat: 11.75, lng: 122.38, status: 'warning', battery: 31, signal: 'Weak', coverageRadius: 2000 },
    { name: 'Buoy Delta', lat: 11.65, lng: 122.15, status: 'active', battery: 94, signal: 'Strong', coverageRadius: 2000 },
    { name: 'Buoy Echo', lat: 11.88, lng: 122.45, status: 'danger', battery: 12, signal: 'Lost', coverageRadius: 2000 },
  ];

  const meshLinks = [
    ['Buoy Alpha', 'Buoy Bravo'],
    ['Buoy Alpha', 'Buoy Charlie'],
    ['Buoy Alpha', 'Buoy Delta'],
    ['Buoy Alpha', 'Buoy Echo'],
    ['Buoy Charlie', 'Buoy Echo'],
    ['Buoy Bravo', 'Buoy Delta']
  ];

  const incidents = [
    { name: 'Capsizing Alert - Boracay North', lat: 11.9850, lng: 121.9100, severity: 'danger', date: '2026-07-15', type: 'Capsizing' },
    { name: 'Overdue Vessel - Malumpati', lat: 11.7320, lng: 122.2950, severity: 'warning', date: '2026-07-14', type: 'Overdue Vessel' },
    { name: 'Equipment Failure - Banga', lat: 11.6400, lng: 122.3400, severity: 'warning', date: '2026-07-13', type: 'Equipment Failure' },
  ];

  const aklanBoundary = [
    [11.97, 121.87], [12.00, 121.95], [11.95, 122.10], [11.92, 122.25],
    [11.85, 122.45], [11.78, 122.55], [11.65, 122.50], [11.55, 122.42],
    [11.50, 122.30], [11.52, 122.15], [11.58, 122.00], [11.65, 121.92],
    [11.75, 121.88], [11.85, 121.87], [11.97, 121.87]
  ];

  // ===== MAP INIT =====
  const map = L.map('map', {
    center: NEW_WASHINGTON_CENTER,
    zoom: NEW_WASHINGTON_ZOOM,
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
  const facilityLayer = L.layerGroup();
  const incidentLayer = L.layerGroup();
  const hotspotLayer  = L.layerGroup();
  const buoyLayer     = L.layerGroup();
  const boundaryLayer = L.layerGroup();
  const pinLayer      = L.layerGroup();
  const vesselLayer   = L.layerGroup();
  const coverageLayer = L.layerGroup();
  const meshLayer      = L.layerGroup();

  map.createPane('aiContoursPane');
  map.getPane('aiContoursPane').style.zIndex = 430;
  map.createPane('aiTrackPane');
  map.getPane('aiTrackPane').style.zIndex = 440;
  map.createPane('aiSquallPane');
  map.getPane('aiSquallPane').style.zIndex = 450;

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

  // ===== FACILITY MARKERS =====
  facilities.forEach(f => {
    const marker = L.marker([f.lat, f.lng], { icon: createMarkerIcon('facility') })
      .bindPopup(makePopup(f.name, [
        ['Type', f.type],
        ['Status', f.status.charAt(0).toUpperCase() + f.status.slice(1)],
        ['Coverage Pop.', f.pop]
      ], { cls: f.status, text: f.status }));
    facilityLayer.addLayer(marker);
  });

  // ===== BUOY MARKERS =====
  initialBuoys.forEach(b => {
    var extraRows = b.isGateway
      ? [['Role', 'LoRa Gateway — mesh exit to backend']]
      : [];
    const marker = L.marker([b.lat, b.lng], { icon: createMarkerIcon('buoy') })
      .bindPopup(makePopup(b.name, [
        ['Status', b.status.charAt(0).toUpperCase() + b.status.slice(1)],
        ['Battery', b.battery + '%'],
        ['Signal', b.signal]
      ].concat(extraRows), { cls: b.status, text: b.status }));
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
  coverageLayer.addTo(map);

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
  meshLinks.forEach(function (link) {
    var b1 = initialBuoys.find(function (b) { return b.name === link[0]; });
    var b2 = initialBuoys.find(function (b) { return b.name === link[1]; });
    if (!b1 || !b2) return;
    var line = L.polyline([[b1.lat, b1.lng], [b2.lat, b2.lng]], {
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
    var b1 = initialBuoys.find(function (b) { return b.name === link[0]; });
    var b2 = initialBuoys.find(function (b) { return b.name === link[1]; });
    if (!b1 || !b2) return;
    var steps = 25;
    for (var i = 0; i <= steps; i++) {
      var t = i / steps;
      meshPath.push([
        b1.lat + (b2.lat - b1.lat) * t,
        b1.lng + (b2.lng - b1.lng) * t
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
    { alertType: 'capsizing', headerText: 'CAPSIZING RISK ZONE',
      vesselId: 'V-003', owner: 'Eddie Magbanua',
      position: '11.9850\u00B0 N, 121.9100\u00B0 E', lat: 11.9850, lng: 121.9100,
      buoy: 'Buoy-B', coverage: 'Within Buoy-B coverage radius' },
    { alertType: 'wave', headerText: 'DANGEROUS WAVE ZONE',
      vesselId: 'V-005', owner: 'Felix Tambong',
      position: '11.7320\u00B0 N, 122.2950\u00B0 E', lat: 11.7320, lng: 122.2950,
      buoy: 'Buoy-A', coverage: 'Within Buoy-A coverage radius' },
    { alertType: 'sos', headerText: 'MANUAL SOS TRIGGERED',
      vesselId: 'V-002', owner: 'Ramon Flores',
      position: '11.7823\u00B0 N, 122.1234\u00B0 E', lat: 11.7823, lng: 122.1234,
      buoy: 'Buoy-B', coverage: 'Last seen within Buoy-B coverage radius' },
  ];

  const incidentMarkers = [];

  incidents.forEach((inc, idx) => {
    const marker = L.marker([inc.lat, inc.lng], { icon: createMarkerIcon('incident') });
    const drawerData = incidentDrawerData[idx];
    if (drawerData) {
      marker.on('click', function () { openSOSDrawer(drawerData, marker); });
    }
    incidentLayer.addLayer(marker);
    incidentMarkers.push(marker);
  });

  // ===== BOUNDARY =====
  const boundaryPoly = L.polygon(aklanBoundary, {
    color: '#2ecc71',
    weight: 2.5,
    fillColor: '#2ecc71',
    fillOpacity: 0.06,
    dashArray: '8 6',
    className: 'aklan-boundary'
  }).bindTooltip('Aklan Fishing Zone Boundary', { permanent: true, direction: 'center', className: 'boundary-tooltip' });
  boundaryLayer.addLayer(boundaryPoly);

  // ===== HOTSPOT SYSTEM =====
  const MIN_REPORTERS_FOR_FLAG = 5;

  let hotspots = [
    { lat: 11.85, lng: 122.10, radius: 3500, prediction: 12, protected: false, protectedUntil: null, reason: '',
      catchTrend: -61, reporters: 4, health: 'critical', zoneName: 'Zone A — Nabas Offshore' },
    { lat: 11.70, lng: 122.25, radius: 2800, prediction: 28, protected: false, protectedUntil: null, reason: '',
      catchTrend: -38, reporters: 7, health: 'declining', zoneName: 'Zone B — Ibajay Coast' },
    { lat: 11.92, lng: 121.98, radius: 2200, prediction: 49, protected: false, protectedUntil: null, reason: '',
      catchTrend: -12, reporters: 5, health: 'declining', zoneName: 'Zone C — Tangalan Waters' },
    { lat: 11.62, lng: 122.35, radius: 1800, prediction: 67, protected: false, protectedUntil: null, reason: '',
      catchTrend: +8, reporters: 11, health: 'healthy', zoneName: 'Zone D — Kalibo Bay' },
    { lat: 11.55, lng: 122.05, radius: 3000, prediction: 84, protected: false, protectedUntil: null, reason: '',
      catchTrend: +24, reporters: 9, health: 'healthy', zoneName: 'Zone E — Batan Shoals' },
    { lat: 11.78, lng: 121.90, radius: 2600, prediction: 96, protected: false, protectedUntil: null, reason: '',
      catchTrend: +41, reporters: 14, health: 'healthy', zoneName: 'Zone F — New Washington Deep' },
  ];

  let hotspotCircles = [];
  let currentDesignateIndex = -1;

  function getPredictionColor(prediction) {
    if (typeof prediction === 'string') {
      switch (prediction) {
        case 'high':   return '#e74c3c';
        case 'medium': return '#f39c12';
        case 'low':    return '#3498db';
        default:       return '#95a5a6';
      }
    }
    if (prediction <= 15) return '#95a5a6';
    if (prediction <= 35) return '#3498db';
    if (prediction <= 55) return '#2ecc71';
    if (prediction <= 75) return '#f1c40f';
    if (prediction <= 90) return '#e67e22';
    return '#e74c3c';
  }

  function getPredictionLabel(prediction) {
    if (typeof prediction === 'string') {
      switch (prediction) {
        case 'high':   return 'High Fish Concentration';
        case 'medium': return 'Moderate Fish Concentration';
        case 'low':    return 'Low Fish Concentration';
        default:       return 'Unknown';
      }
    }
    if (prediction <= 15) return 'Negligible Fish Activity';
    if (prediction <= 35) return 'Sparse Fish Distribution';
    if (prediction <= 55) return 'Moderate Fish Concentration';
    if (prediction <= 75) return 'High Fish Concentration';
    if (prediction <= 90) return 'Dense Fish Aggregation';
    return 'Exceptional Fish Concentration';
  }

  function buildProgressBar(prediction, color) {
    var width = typeof prediction === 'string'
      ? (prediction === 'high' ? 85 : prediction === 'medium' ? 55 : 25)
      : prediction;
    return '<div style="margin:6px 0;height:6px;background:rgba(255,255,255,0.15);border-radius:3px;overflow:hidden;">' +
      '<div style="height:100%;width:' + width + '%;background:' + color + ';border-radius:3px;transition:width 0.4s ease;"></div></div>';
  }

  function buildTooltipContent(h) {
    var predColor = getPredictionColor(h.prediction);
    var predLabel = getPredictionLabel(h.prediction);
    var pctText = typeof h.prediction === 'string'
      ? h.prediction.charAt(0).toUpperCase() + h.prediction.slice(1)
      : h.prediction + '%';
    return '<div class="hotspot-tip">' +
      '<div class="hotspot-tip-pct" style="color:' + predColor + ';">' + pctText + '</div>' +
      '<div class="hotspot-tip-label">' + predLabel + '</div></div>';
  }

  function buildHotspotPopup(h, idx) {
    var predColor = getPredictionColor(h.prediction);
    var predLabel = getPredictionLabel(h.prediction);
    var hLat = h.lat || h.latitude;
    var hLng = h.lng || h.longitude;
    var hRadius = h.radius || 1500;
    var hZoneName = h.zoneName || h.posted_by || ('Zone ' + (idx + 1));
    var content = '';

    if (h.protected) {
      var d = new Date(h.protectedUntil);
      var dateStr = d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      content += '<div class="popup-title" style="color:#e74c3c;">Protected Fish Conservation Zone</div>';
      content += '<div class="popup-row"><span>Zone</span><span style="font-weight:700;color:#fff;">' + hZoneName + '</span></div>';
      content += '<div class="popup-row"><span>Hotspot</span><span>#' + (idx + 1) + '</span></div>';
      content += '<div class="popup-row"><span>Status</span><span style="color:#e74c3c;font-weight:700;">NO FISHING ZONE</span></div>';
      content += '<div class="popup-row"><span>Protected Until</span><span>' + dateStr + '</span></div>';
      content += '<div class="popup-row"><span>Reason</span><span>' + (h.reason || 'N/A') + '</span></div>';
      content += '<div class="popup-row"><span>Radius</span><span>' + (hRadius / 1000).toFixed(1) + ' km</span></div>';
      content += '<div class="popup-divider"></div>';
      content += '<div class="popup-row"><span>AI Prediction</span><span>' + (typeof h.prediction === 'string' ? h.prediction : h.prediction + '%') + '</span></div>';
      content += '<div class="popup-row"><span>Classification</span><span style="color:' + predColor + ';font-weight:700;">' + predLabel + '</span></div>';
      content += buildProgressBar(h.prediction, predColor);
      content += '<div style="margin-top:6px"><span class="popup-badge badge-danger">NO FISHING</span></div>';
      content += '<div style="margin-top:8px;display:flex;gap:6px;">';
      content += '<button class="popup-btn popup-btn-remove" style="flex:1;padding:5px 10px;border:none;border-radius:4px;background:rgba(231,76,60,0.2);color:#e74c3c;font-size:11px;font-weight:700;cursor:pointer;">Remove Protection</button>';
      content += '<button class="popup-btn popup-btn-focus" style="flex:1;padding:5px 10px;border:none;border-radius:4px;background:rgba(52,152,219,0.2);color:#3498db;font-size:11px;font-weight:700;cursor:pointer;">Focus Zone</button>';
      content += '</div>';
    } else {
      content += '<div class="popup-title">AI Fish Hotspot</div>';
      content += '<div class="popup-row"><span>Prediction Strength</span><span>' + (typeof h.prediction === 'string' ? h.prediction : h.prediction + '%') + '</span></div>';
      content += '<div class="popup-row"><span>Classification</span><span style="color:' + predColor + ';font-weight:700;">' + predLabel + '</span></div>';
      content += buildProgressBar(h.prediction, predColor);
      content += '<div class="popup-divider"></div>';
      content += '<div class="popup-row"><span>Zone</span><span style="font-weight:700;color:#fff;">' + hZoneName + '</span></div>';

      if (h.catchTrend !== undefined) {
        var trendColor = h.catchTrend >= 0 ? '#2ecc71' : (h.health === 'critical' ? '#e74c3c' : '#f39c12');
        var trendPrefix = h.catchTrend >= 0 ? '+' : '';
        content += '<div class="popup-row"><span>30-Day Catch Trend</span><span style="color:' + trendColor + ';font-weight:700;">' + trendPrefix + h.catchTrend + '% vs baseline</span></div>';
      }

      if (h.reporters !== undefined) {
        var meetsThreshold = h.reporters >= MIN_REPORTERS_FOR_FLAG;
        var reporterDisplay = meetsThreshold
          ? h.reporters + ' fishermen <span style="color:#2ecc71;font-size:10px;">&check; threshold met</span>'
          : h.reporters + ' of ' + MIN_REPORTERS_FOR_FLAG + ' fishermen <span style="color:#f39c12;font-size:10px;">&mdash; below threshold, flag pending</span>';
        content += '<div class="popup-row"><span>Independent Reporters</span><span>' + reporterDisplay + '</span></div>';
      }

      if (h.health) {
        var healthColor = h.health === 'healthy' ? '#2ecc71' : (h.health === 'critical' ? '#e74c3c' : '#f39c12');
        var healthLabel = h.health === 'healthy' ? 'Healthy' : (h.health === 'critical' ? 'Critical — Action Recommended' : 'Declining — Monitor Closely');
        content += '<div class="popup-row"><span>Zone Health</span><span class="popup-badge" style="background:' + healthColor + '22;color:' + healthColor + ';border:1px solid ' + healthColor + '44;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;">' + healthLabel + '</span></div>';
      }

      if (h.health === 'declining' || h.health === 'critical') {
        var meets = h.reporters !== undefined && h.reporters >= MIN_REPORTERS_FOR_FLAG;
        if (meets) {
          content += '<div style="margin:6px 0;padding:6px 8px;background:rgba(231,76,60,0.1);border-left:3px solid #e74c3c;border-radius:0 4px 4px 0;font-size:10px;color:rgba(255,255,255,0.7);">BFAR Review Recommended — catch decline detected across ' + h.reporters + ' independent reporters over 30 days.</div>';
        } else if (h.reporters !== undefined) {
          content += '<div style="margin:6px 0;padding:6px 8px;background:rgba(243,156,18,0.1);border-left:3px solid #f39c12;border-radius:0 4px 4px 0;font-size:10px;color:rgba(255,255,255,0.7);">Catch decline observed — below minimum reporter threshold (' + h.reporters + ' of ' + MIN_REPORTERS_FOR_FLAG + ') for formal BFAR flagging.</div>';
        }
      }

      content += '<div class="popup-row"><span>Radius</span><span>' + (hRadius / 1000).toFixed(1) + ' km</span></div>';
      content += '<div class="popup-row" style="margin-top:8px;"><span>Designation Status</span><span style="color:#2ecc71;font-weight:700;">Open Fishing Area</span></div>';
      content += '<button class="popup-btn popup-btn-designate" style="width:100%;margin-top:6px;padding:6px 10px;border:none;border-radius:4px;background:#e74c3c;color:#fff;font-size:11px;font-weight:700;cursor:pointer;">Designate No Fishing Zone</button>';
    }
    return content;
  }

  function wireHotspotPopup(circle, h, idx) {
    circle.on('popupopen', function () {
      setTimeout(function () {
        if (h.protected) {
          var removeBtn = document.querySelector('.popup-btn-remove');
          if (removeBtn) removeBtn.addEventListener('click', function () {
            removeProtection(idx);
            map.closePopup();
          });
          var focusBtn = document.querySelector('.popup-btn-focus');
          if (focusBtn) focusBtn.addEventListener('click', function () {
            map.setView([h.lat || h.latitude, h.lng || h.longitude], 13);
          });
        } else {
          var designateBtn = document.querySelector('.popup-btn-designate');
          if (designateBtn) designateBtn.addEventListener('click', function () {
            currentDesignateIndex = idx;
            document.getElementById('bfar-modal-overlay').classList.add('active');
          });
        }
      }, 50);
    });
  }

  hotspots.forEach(function (h, idx) {
    var predColor = getPredictionColor(h.prediction);
    var circle = L.circle([h.lat, h.lng], {
      radius: h.radius,
      color: predColor,
      fillColor: predColor,
      fillOpacity: 0.12,
      weight: 1.5,
      dashArray: '4 4',
      className: 'hotspot-circle'
    }).bindPopup(buildHotspotPopup(h, idx));
    circle.bindTooltip(buildTooltipContent(h), {
      direction: 'top',
      offset: L.point(0, -20),
      className: 'hotspot-tooltip'
    });

    circle.on('mouseover', function () {
      this.setStyle({ weight: 2.5, fillOpacity: 0.25 });
    });
    circle.on('mouseout', function () {
      var color = h.protected ? '#e74c3c' : getPredictionColor(h.prediction);
      var fillOpacity = h.protected ? 0.25 : 0.12;
      this.setStyle({ weight: 1.5, fillOpacity: fillOpacity });
    });

    wireHotspotPopup(circle, h, idx);

    hotspotLayer.addLayer(circle);
    hotspotCircles.push(circle);
  });

  // Add layers to map
  facilityLayer.addTo(map);
  incidentLayer.addTo(map);
  buoyLayer.addTo(map);
  pinLayer.addTo(map);
  vesselLayer.addTo(map);

  // ===== PIN TOOL =====
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

  function buildPinPopup(pin, isOwner) {
    const droppedAt = new Date(pin.created_at);
    const swatchStyle =
      `display:inline-block;width:12px;height:12px;border-radius:50%;` +
      `background:${pin.color};vertical-align:middle;margin-right:6px;` +
      `border:2px solid rgba(255,255,255,0.7);`;

    const deleteFooter = isOwner
      ? `<div class="pin-popup-footer" id="pin-footer-${pin.id}">
           <button class="pin-delete-btn" data-pin-id="${pin.id}" data-action="delete-init">
             <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
               <polyline points="3 6 5 6 21 6"/>
               <path d="M19 6l-1 14H6L5 6"/>
               <path d="M10 11v6"/><path d="M14 11v6"/>
               <path d="M9 6V4h6v2"/>
             </svg>
             Delete
           </button>
         </div>`
      : '';

    return `<div class="popup-title">
              <span style="${swatchStyle}"></span>${pin.user_name}
            </div>
            <div class="popup-row">
              <span>Pinned</span>
              <span>${relativeTime(droppedAt)}</span>
            </div>
            <div class="popup-row">
              <span>Lat</span>
              <span>${Number(pin.latitude).toFixed(5)}</span>
            </div>
            <div class="popup-row">
              <span>Lng</span>
              <span>${Number(pin.longitude).toFixed(5)}</span>
            </div>
            ${deleteFooter}`;
  }

  async function deletePin(pinId) {
    const url = `${API_BASE}/api/pins/${encodeURIComponent(pinId)}` +
                `?user_id=${encodeURIComponent(CURRENT_USER.id)}`;
    try {
      const res = await fetch(url, { method: 'DELETE' });
      if (res.status === 403) {
        console.warn('[AqOne] Delete rejected: not the pin owner.');
        return false;
      }
      if (!res.ok && res.status !== 404) {
        throw new Error(`HTTP ${res.status}`);
      }
    } catch (err) {
      console.error('[AqOne] Failed to delete pin:', err.message);
      return false;
    }
    if (pinMarkers[pinId]) {
      pinLayer.removeLayer(pinMarkers[pinId]);
      delete pinMarkers[pinId];
    }
    return true;
  }

  function upsertPinMarker(pin) {
    if (pinMarkers[pin.id]) return;
    const isOwner = (pin.user_id === CURRENT_USER.id);
    const marker = L.marker([pin.latitude, pin.longitude], {
      icon: createPinIcon(pin.color)
    });

    marker.bindPopup(() => buildPinPopup(pin, isOwner));

    marker.on('popupopen', function () {
      const container = marker.getPopup().getElement();
      if (!container) return;

      container.addEventListener('click', async function handlePopupClick(e) {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;

        const action = btn.dataset.action;
        const footer = container.querySelector(`#pin-footer-${pin.id}`);

        if (action === 'delete-init') {
          footer.innerHTML =
            `<div class="pin-confirm-row">
               <span class="pin-confirm-label">Delete this pin?</span>
               <button class="pin-confirm-yes" data-action="delete-confirm">Yes</button>
               <button class="pin-confirm-no"  data-action="delete-cancel">No</button>
             </div>`;
          marker.getPopup().update();
        }

        if (action === 'delete-confirm') {
          btn.disabled = true;
          btn.textContent = '\u2026';
          const ok = await deletePin(pin.id);
          if (!ok) {
            footer.innerHTML =
              `<button class="pin-delete-btn" data-pin-id="${pin.id}" data-action="delete-init">
                 Delete
               </button>`;
            marker.getPopup().update();
          }
        }

        if (action === 'delete-cancel') {
          footer.innerHTML =
            `<button class="pin-delete-btn" data-pin-id="${pin.id}" data-action="delete-init">
               <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                 <polyline points="3 6 5 6 21 6"/>
                 <path d="M19 6l-1 14H6L5 6"/>
                 <path d="M10 11v6"/><path d="M14 11v6"/>
                 <path d="M9 6V4h6v2"/>
               </svg>
               Delete
             </button>`;
          marker.getPopup().update();
        }
      });
    });

    pinLayer.addLayer(marker);
    pinMarkers[pin.id] = marker;
  }

  function syncPinMarkers(pins) {
    const serverIds = new Set(pins.map(p => p.id));
    for (const id of Object.keys(pinMarkers)) {
      if (!serverIds.has(id)) {
        pinLayer.removeLayer(pinMarkers[id]);
        delete pinMarkers[id];
      }
    }
    pins.forEach(upsertPinMarker);
  }

  async function fetchPins() {
    try {
      const res = await fetch(`${API_BASE}/api/pins`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const pins = await res.json();
      syncPinMarkers(pins);
    } catch (err) {
      console.warn('[AqOne] Could not fetch pins:', err.message);
    }
  }

  async function dropPin(latlng) {
    const body = {
      user_id:   CURRENT_USER.id,
      user_name: CURRENT_USER.name,
      color:     CURRENT_USER_COLOR,
      latitude:  latlng.lat,
      longitude: latlng.lng,
    };
    try {
      const res = await fetch(`${API_BASE}/api/pins`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const pin = await res.json();
      upsertPinMarker(pin);
      if (pinMarkers[pin.id]) pinMarkers[pin.id].openPopup();
    } catch (err) {
      console.error('[AqOne] Failed to save pin:', err.message);
      const localId = 'local-' + Date.now();
      const localPin = {
        id:         localId,
        user_id:    CURRENT_USER.id,
        user_name:  CURRENT_USER.name,
        color:      CURRENT_USER_COLOR,
        latitude:   latlng.lat,
        longitude:  latlng.lng,
        created_at: new Date().toISOString(),
      };

      const swatchStyle =
        `display:inline-block;width:12px;height:12px;border-radius:50%;` +
        `background:${localPin.color};vertical-align:middle;margin-right:6px;` +
        `border:2px solid rgba(255,255,255,0.7);`;

      const popupHtml =
        `<div class="popup-title">` +
          `<span style="${swatchStyle}"></span>${localPin.user_name}` +
        `</div>` +
        `<div class="popup-row" style="color:#f1c40f;font-size:10px;margin-bottom:2px;">` +
          `<span>\u26A0 Not saved — backend offline</span>` +
        `</div>` +
        `<div class="popup-row">` +
          `<span>Pinned</span><span>just now</span>` +
        `</div>` +
        `<div class="popup-row">` +
          `<span>Lat</span><span>${latlng.lat.toFixed(5)}</span>` +
        `</div>` +
        `<div class="popup-row">` +
          `<span>Lng</span><span>${latlng.lng.toFixed(5)}</span>` +
        `</div>` +
        `<div class="pin-popup-footer" id="pin-footer-${localId}">` +
          `<button class="pin-delete-btn" data-pin-id="${localId}" data-action="delete-init">` +
            `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">` +
              `<polyline points="3 6 5 6 21 6"/>` +
              `<path d="M19 6l-1 14H6L5 6"/>` +
              `<path d="M10 11v6"/><path d="M14 11v6"/>` +
              `<path d="M9 6V4h6v2"/>` +
            `</svg>` +
            `Delete` +
          `</button>` +
        `</div>`;

      const marker = L.marker([latlng.lat, latlng.lng], {
        icon: createPinIcon(localPin.color)
      });
      marker.bindPopup(popupHtml);

      marker.on('popupopen', function () {
        const container = marker.getPopup().getElement();
        if (!container) return;
        container.addEventListener('click', function handleLocalDelete(e) {
          const btn = e.target.closest('[data-action]');
          if (!btn) return;
          const footer = container.querySelector(`#pin-footer-${localId}`);
          if (btn.dataset.action === 'delete-init') {
            footer.innerHTML =
              `<div class="pin-confirm-row">` +
                `<span class="pin-confirm-label">Delete this pin?</span>` +
                `<button class="pin-confirm-yes" data-action="delete-confirm">Yes</button>` +
                `<button class="pin-confirm-no"  data-action="delete-cancel">No</button>` +
              `</div>`;
            marker.getPopup().update();
          }
          if (btn.dataset.action === 'delete-confirm') {
            pinLayer.removeLayer(marker);
          }
          if (btn.dataset.action === 'delete-cancel') {
            footer.innerHTML =
              `<button class="pin-delete-btn" data-pin-id="${localId}" data-action="delete-init">` +
                `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">` +
                  `<polyline points="3 6 5 6 21 6"/>` +
                  `<path d="M19 6l-1 14H6L5 6"/>` +
                  `<path d="M10 11v6"/><path d="M14 11v6"/>` +
                  `<path d="M9 6V4h6v2"/>` +
                `</svg>` +
                `Delete` +
              `</button>`;
            marker.getPopup().update();
          }
        });
      });

      pinLayer.addLayer(marker);
      marker.openPopup();
    }
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

  fetchPins();
  setInterval(fetchPins, PIN_POLL_INTERVAL_MS);

  // ===== LIVE API: FETCH BUOYS =====
  let apiBuoys = [];

  async function fetchBuoys() {
    try {
      const res = await fetch(`${API_BASE}/api/buoys`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      apiBuoys = (data.buoys || []).map(b => ({
        name:   b.name || b.buoy_id,
        battery: b.battery_level != null ? b.battery_level : '--',
        signal:  b.connectivity_status === 'online' ? 85
               : b.connectivity_status === 'stale'  ? 45 : 15,
        status:  b.status || 'unknown',
      }));
      renderBuoyHealth();
    } catch (err) {
      console.warn('[AqOne] Could not fetch buoys:', err.message);
    }
  }

  // ===== LIVE API: FETCH HOTSPOTS =====
  async function fetchHotspots() {
    try {
      const res = await fetch(`${API_BASE}/api/spots`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const incoming = data.spots || [];
      const serverIds = new Set(incoming.map(s => s.id));

      for (let i = hotspots.length - 1; i >= 0; i--) {
        const h = hotspots[i];
        if (h.id && !serverIds.has(h.id)) {
          const circle = hotspotCircles[i];
          if (circle) hotspotLayer.removeLayer(circle);
          hotspots.splice(i, 1);
          hotspotCircles.splice(i, 1);
        }
      }

      incoming.forEach(function (s) {
        const existingIdx = hotspots.findIndex(function (h) { return h.id === s.id; });
        if (existingIdx !== -1) {
          const h = hotspots[existingIdx];
          h.posted_by = s.posted_by;
          h.latitude = s.latitude;
          h.longitude = s.longitude;
          h.lat = s.latitude;
          h.lng = s.longitude;
          const circle = hotspotCircles[existingIdx];
          if (circle) {
            circle.setLatLng([s.latitude, s.longitude]);
            const color = h.protected ? '#e74c3c' : getPredictionColor(h.prediction);
            circle.setStyle({ color: color, fillColor: color });
            circle.setPopupContent(buildHotspotPopup(h, existingIdx));
            circle.setTooltipContent(buildTooltipContent(h));
          }
        } else {
          const idx = hotspots.length;
          const newHotspot = {
            id: s.id,
            posted_by: s.posted_by,
            latitude: s.latitude,
            longitude: s.longitude,
            lat: s.latitude,
            lng: s.longitude,
            prediction: 'medium',
            protected: false,
            protectedUntil: null,
            reason: '',
            catchTrend: 0,
            reporters: 0,
            health: 'healthy',
            zoneName: s.posted_by || ('Zone ' + (idx + 1)),
            radius: 1500,
          };
          hotspots.push(newHotspot);
          const predColor = getPredictionColor(newHotspot.prediction);
          const circle = L.circle([newHotspot.latitude, newHotspot.longitude], {
            radius: newHotspot.radius,
            color: predColor,
            fillColor: predColor,
            fillOpacity: 0.12,
            weight: 1.5,
            dashArray: '4 4',
            className: 'hotspot-circle'
          }).bindPopup(buildHotspotPopup(newHotspot, idx));
          circle.bindTooltip(buildTooltipContent(newHotspot), {
            direction: 'top',
            offset: L.point(0, -20),
            className: 'hotspot-tooltip'
          });
          circle.on('mouseover', function () {
            this.setStyle({ weight: 2.5, fillOpacity: 0.25 });
          });
          circle.on('mouseout', function () {
            var color = newHotspot.protected ? '#e74c3c' : getPredictionColor(newHotspot.prediction);
            var fillOpacity = newHotspot.protected ? 0.25 : 0.12;
            this.setStyle({ weight: 1.5, fillOpacity: fillOpacity });
          });
          wireHotspotPopup(circle, newHotspot, idx);
          hotspotLayer.addLayer(circle);
          hotspotCircles.push(circle);
        }
      });

      var activeFilter = document.querySelector('.zones-filter.active');
      renderZonesTab(activeFilter ? activeFilter.dataset.filter : 'all');
    } catch (err) {
      console.warn('[AqOne] Could not fetch hotspots:', err.message);
    }
  }

  fetchBuoys();
  fetchHotspots();
  setInterval(fetchBuoys, PIN_POLL_INTERVAL_MS);
  setInterval(fetchHotspots, PIN_POLL_INTERVAL_MS);

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

  const PANEL_TITLES = { layers: 'Filters & Tools', measure: 'Measure Distance', buoys: 'Buoy Health Monitor', advisories: 'Maritime Advisories' };

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
      dropPin(e.latlng);
      deactivatePinMode();
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

  toggleLayer('toggle-facilities', facilityLayer);
  toggleLayer('toggle-incidents', incidentLayer);
  toggleLayer('toggle-hotspots',  hotspotLayer);
  toggleLayer('toggle-buoys',     buoyLayer);
  toggleLayer('toggle-pins',      pinLayer);
  toggleLayer('toggle-coverage',  coverageLayer);
  toggleLayer('toggle-mesh',      meshLayer);

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

  // ===== VESSEL DATA =====
  const vessels = [
    { name: 'Sta. Maria',     id: 'V-001', owner: 'Juan dela Cruz',     status: 'in-coverage',     checkin: '2 minutes ago',     lat: 11.6431, lng: 122.3456, buoy: 'Buoy-A' },
    { name: 'San Pedro',      id: 'V-002', owner: 'Ramon Flores',       status: 'overdue',         checkin: '47 minutes ago',    lat: 11.7823, lng: 122.1234, buoy: 'Buoy-B' },
    { name: 'Birhen sa Regla', id: 'V-003', owner: 'Eddie Magbanua',    status: 'out-of-coverage', checkin: '1 hour ago',        lat: 11.5012, lng: 122.5678, buoy: null },
    { name: 'Sto. Nino',      id: 'V-004', owner: 'Rodel Javines',     status: 'in-coverage',     checkin: '5 minutes ago',     lat: 11.8234, lng: 122.2345, buoy: 'Buoy-C' },
    { name: 'Maria Gracia',   id: 'V-005', owner: 'Felix Tambong',     status: 'overdue',         checkin: '1 hour 12 minutes ago', lat: 11.6789, lng: 122.4567, buoy: 'Buoy-A' },
  ];

  function vesselStatusBadge(status) {
    const map = { 'in-coverage': ['In Coverage', 'status-green'], 'out-of-coverage': ['Out of Coverage', 'status-gray'], 'overdue': ['Overdue', 'status-red'] };
    const [label, cls] = map[status] || ['', ''];
    return `<span class="status-badge ${cls}">${label}</span>`;
  }

  const overdueVessels = vessels.filter(function (v) { return v.status === 'overdue'; });
  const overdueDrawerData = {
    'V-002': {
      alertType: 'overdue', headerText: 'OVERDUE VESSEL',
      vesselId: 'V-002', owner: 'Ramon Flores',
      position: '11.7823\u00B0 N, 122.1234\u00B0 E',
      timerBaseline: 47 * 60,
      buoy: 'Buoy-B', coverage: 'Last seen within Buoy-B coverage radius \u2014 flagged as overdue'
    },
    'V-005': {
      alertType: 'overdue', headerText: 'OVERDUE VESSEL',
      vesselId: 'V-005', owner: 'Felix Tambong',
      position: '11.6789\u00B0 N, 122.4567\u00B0 E',
      timerBaseline: 72 * 60,
      buoy: 'Buoy-A', coverage: 'Last seen within Buoy-A coverage radius \u2014 flagged as overdue'
    }
  };

  const vesselMarkers = {};

  overdueVessels.forEach(function (v) {
    var marker = L.marker([v.lat, v.lng], { icon: createOverdueIcon() });
    marker.on('click', function () {
      var data = overdueDrawerData[v.id];
      if (data) openSOSDrawer(data, marker);
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
      ['Last Check-in', v.checkin],
      ['Buoy', v.buoy || 'N/A']
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
          <div class="vessel-checkin">Last check-in: ${v.checkin}</div>
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
          if (data) openSOSDrawer(data, null);
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

  // ===== ALERT DATA =====
  const alertData = [
    { type: 'SOS',              desc: 'Manual SOS \u2014 Vessel "San Pedro" (V-002)',      time: '14 minutes ago',  lat: 11.7823, lng: 122.1234, status: 'active', vesselId: 'V-002' },
    { type: 'wave-zone',        desc: 'Dangerous Wave Zone \u2014 Buoy-B',                 time: '31 minutes ago',  lat: 11.7901, lng: 122.1456, status: 'active', vesselId: null },
    { type: 'overdue-vessel',   desc: 'Overdue Vessel \u2014 "Maria Gracia" (V-005)',     time: '1 hour 12 minutes ago', lat: 11.6789, lng: 122.4567, status: 'acknowledged', vesselId: 'V-005' },
    { type: 'capsizing-risk',   desc: 'Capsizing Risk Zone \u2014 Buoy-A',                time: '2 hours ago',     lat: 11.6431, lng: 122.3456, status: 'resolved', vesselId: null },
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

  function renderAlerts() {
    const list = document.getElementById('alert-list');
    list.innerHTML = alertData.map((a, i) => `
      <div class="alert-row" data-alert-index="${i}">
        ${alertIcon(a.type)}
        <div class="alert-info">
          <div class="alert-desc">${a.desc}</div>
          <div class="alert-meta">${a.time} &middot; ${a.lat}&deg; N, ${a.lng}&deg; E</div>
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

  // ===== ZONES TAB =====
  function renderZonesTab(filter) {
    var list = document.getElementById('zones-list');
    var sorted = hotspots.slice().sort(function (a, b) {
      var order = { critical: 0, declining: 1, healthy: 2 };
      return (order[a.health] || 2) - (order[b.health] || 2);
    });
    if (filter === 'needs-review') {
      sorted = sorted.filter(function (h) { return (h.health === 'critical' || h.health === 'declining') && h.reporters >= MIN_REPORTERS_FOR_FLAG; });
    }
    list.innerHTML = '';
    sorted.forEach(function (h) {
      var healthClass = h.health === 'critical' ? 'critical' : (h.health === 'declining' ? 'declining' : 'healthy');
      var trendColor = h.catchTrend >= 0 ? '#2ecc71' : (h.health === 'critical' ? '#e74c3c' : '#f39c12');
      var trendPrefix = h.catchTrend >= 0 ? '+' : '';
      var meetsThreshold = h.reporters >= MIN_REPORTERS_FOR_FLAG;
      var belowThreshold = !meetsThreshold && (h.health === 'critical' || h.health === 'declining');
      var badgeColor = belowThreshold ? '#f39c12' : (h.health === 'healthy' ? '#2ecc71' : (h.health === 'critical' ? '#e74c3c' : '#f39c12'));
      var badgeLabel = belowThreshold ? 'PENDING' : (h.health ? h.health.toUpperCase() : 'UNKNOWN');
      var reporterDisplay = meetsThreshold
        ? h.reporters + ' reporters <span style="color:#2ecc71;">\u2713</span>'
        : h.reporters + ' of ' + MIN_REPORTERS_FOR_FLAG + ' reporters <span style="color:#f39c12;">flag pending</span>';
      var hZoneName = h.zoneName || h.posted_by || 'Unknown Zone';
      var row = document.createElement('div');
      row.className = 'zone-row zone-' + healthClass + (belowThreshold ? ' zone-below-threshold' : '');
      row.innerHTML =
        '<div class="zone-row-name">' + hZoneName + '</div>' +
        '<div class="zone-row-meta">' +
          '<span class="zone-row-trend" style="color:' + trendColor + ';">' + trendPrefix + h.catchTrend + '%</span>' +
          '<span class="zone-row-reporters">' + reporterDisplay + '</span>' +
          '<span class="zone-health-badge" style="background:' + badgeColor + '22;color:' + badgeColor + ';border:1px solid ' + badgeColor + '44;">' + badgeLabel + '</span>' +
        '</div>';
      var realIdx = hotspots.indexOf(h);
      row.addEventListener('click', function () {
        map.setView([h.lat || h.latitude, h.lng || h.longitude], 13);
        if (hotspotCircles[realIdx]) hotspotCircles[realIdx].openPopup();
      });
      list.appendChild(row);
    });

    var flaggedCount = hotspots.filter(function (h) {
      return (h.health === 'critical' || h.health === 'declining') && h.reporters >= MIN_REPORTERS_FOR_FLAG;
    }).length;
    document.getElementById('zones-badge').textContent = flaggedCount;
  }

  renderZonesTab('all');

  document.querySelectorAll('.zones-filter').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.zones-filter').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      renderZonesTab(btn.dataset.filter);
    });
  });

  // ===== SOS BROADCAST DRAWER =====
  const sosDrawer          = document.getElementById('sos-drawer');
  const sosDrawerHeader    = document.getElementById('sos-drawer-header');
  const sosDrawerTitle     = document.getElementById('sos-drawer-title');
  const sosDrawerClose     = document.getElementById('sos-drawer-close');
  const sosTimerEl         = document.getElementById('sos-timer');
  const sosBtnZoom         = document.getElementById('sos-btn-zoom');
  const sosBtnAcknowledge  = document.getElementById('sos-btn-acknowledge');
  const sosBtnResolve      = document.getElementById('sos-btn-resolve');
  const sosBtnBroadcast    = document.getElementById('sos-btn-broadcast');
  const sosBroadcastMsg    = document.getElementById('sos-broadcast-msg');

  let sosTimerInterval  = null;
  let sosAlertStartTime = null;
  let currentDrawerMarker  = null;
  let currentDrawerData    = null;

  function openSOSDrawer(data, marker) {
    currentDrawerData   = data;
    currentDrawerMarker = marker;

    sosDrawerHeader.className = 'sos-drawer-header';
    if (data.alertType === 'sos')        sosDrawerHeader.classList.add('type-sos');
    else if (data.alertType === 'wave')  sosDrawerHeader.classList.add('type-wave');
    else if (data.alertType === 'capsizing') sosDrawerHeader.classList.add('type-capsizing');
    else if (data.alertType === 'overdue') sosDrawerHeader.classList.add('type-overdue');
    sosDrawerTitle.textContent = data.headerText;

    var timerLabel = document.getElementById('sos-timer-label');
    if (data.alertType === 'overdue') {
      timerLabel.textContent = 'Time Since Last Check-in';
    } else {
      timerLabel.textContent = 'Time Since Alert';
    }

    document.getElementById('sos-vessel-id').textContent = data.vesselId;
    document.getElementById('sos-owner').textContent     = data.owner;
    document.getElementById('sos-position').textContent  = data.position;
    document.getElementById('sos-buoy').textContent      = data.buoy;
    document.getElementById('sos-coverage').textContent  = data.coverage;

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
      pulseCoverageCircle(data.buoy);
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
    sosBroadcastMsg.textContent = 'Broadcast sent to 3 nearby vessels over LoRa mesh';
  });

  // ===== BUOY HEALTH MONITOR =====
  const buoyMonitorData = [
    { id: 'buoy-a', name: 'Buoy-A', status: 'online', severity: 'Dangerous Wave Zone',
      battery: 78, lastSignal: '1 minute ago', lat: 11.6431, lng: 122.3456, dotClass: 'dot-yellow' },
    { id: 'buoy-b', name: 'Buoy-B', status: 'online', severity: 'Capsizing Risk',
      battery: 45, lastSignal: '3 minutes ago', lat: 11.7901, lng: 122.1456, dotClass: 'dot-red' },
    { id: 'buoy-c', name: 'Buoy-C', status: 'online', severity: 'Calm',
      battery: 91, lastSignal: '30 seconds ago', lat: 11.8234, lng: 122.2345, dotClass: 'dot-green' },
    { id: 'buoy-d', name: 'Buoy-D', status: 'offline', severity: 'Unknown',
      battery: 12, lastSignal: '2 hours ago', lat: 11.5512, lng: 122.6234, dotClass: 'dot-gray' },
  ];

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

      return '<div class="buoy-row' + offlineClass + '" data-lat="' + b.lat + '" data-lng="' + b.lng + '" data-id="' + b.id + '">' +
        '<div class="buoy-row-top">' +
          '<span class="buoy-row-name">' + b.name + '</span>' +
          '<span class="buoy-status-dot ' + b.dotClass + '"></span>' +
        '</div>' +
        '<div class="buoy-row-severity">' + b.severity + '</div>' +
        '<div class="buoy-row-meta">' +
          '<span class="buoy-row-battery' + batteryClass + '">' + batteryIcon + ' ' + b.battery + '%</span>' +
          '<span class="buoy-row-signal"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg> ' + b.lastSignal + '</span>' +
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
      return '<div class="bh-row' + (b.status === 'offline' ? ' bh-offline' : '') + '" data-lat="' + b.lat + '" data-lng="' + b.lng + '">' +
        '<span class="bh-dot" style="background:' + dotColor + ';"></span>' +
        '<span class="bh-name">' + b.name + '</span>' +
        '<span class="bh-battery">' + b.battery + '%</span>' +
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
    var sourceBuoys = apiBuoys.length > 0 ? apiBuoys : buoyMonitorData;
    var activeCount = sourceBuoys.filter(function (b) { return b.status === 'active' || b.status === 'online'; }).length;
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

    var list = document.getElementById('buoy-health-list');
    if (list) {
      list.innerHTML = sourceBuoys.map(function (b) {
        var isOnline = b.status === 'active' || b.status === 'online';
        var dotColor = isOnline ? '#2ecc71' : '#e74c3c';
        var offlineTag = !isOnline
          ? ' <span class="bh-offline-tag">Offline</span>'
          : '';
        return '<div class="bh-row' + (!isOnline ? ' bh-offline' : '') + '">' +
          '<span class="bh-dot" style="background:' + dotColor + ';"></span>' +
          '<span class="bh-name">' + b.name + '</span>' +
          '<span class="bh-battery">' + b.battery + '%</span>' +
          offlineTag +
        '</div>';
      }).join('');

      list.querySelectorAll('.bh-row').forEach(function (row) {
        row.addEventListener('click', function () {
          var name = row.querySelector('.bh-name').textContent;
          var match = initialBuoys.find(function (b) { return b.name === name; });
          if (match) map.setView([match.lat, match.lng], 14, { animate: true, duration: 1 });
        });
      });
    }

    if (buoyListEl) {
      buoyListEl.innerHTML = sourceBuoys.map(function (b) {
        var isOnline = b.status === 'active' || b.status === 'online';
        var dotClass = isOnline ? 'dot-green' : 'dot-gray';
        var batteryClass = (typeof b.battery === 'number' && b.battery < 20) ? ' low' : '';
        var batteryIcon = (typeof b.battery === 'number' && b.battery < 20)
          ? '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
          : '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="7" width="12" height="14" rx="2"/><path d="M10 7V5a2 2 0 0 1 4 0v2"/></svg>';
        return '<div class="buoy-row' + (!isOnline ? ' buoy-offline' : '') + '">' +
          '<div class="buoy-row-top">' +
            '<span class="buoy-row-name">' + b.name + '</span>' +
            '<span class="buoy-status-dot ' + dotClass + '"></span>' +
          '</div>' +
          '<div class="buoy-row-meta">' +
            '<span class="buoy-row-battery' + batteryClass + '">' + batteryIcon + ' ' + b.battery + '%</span>' +
            '<span class="buoy-row-signal">Signal: ' + b.signal + '</span>' +
          '</div>' +
        '</div>';
      }).join('');
    }
  }

  renderBuoyList();
  renderBuoyHealthCard();

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
    let facilitiesInView = 0;
    let buoysInView = 0;
    let incidentsInView = 0;

    facilities.forEach(f => { if (bounds.contains([f.lat, f.lng])) facilitiesInView++; });
    initialBuoys.forEach(b => { if (bounds.contains([b.lat, b.lng])) buoysInView++; });
    incidents.forEach(i => { if (bounds.contains([i.lat, i.lng])) incidentsInView++; });

    document.getElementById('stat-population').textContent = (54320 + facilitiesInView * 1200).toLocaleString();
    document.getElementById('stat-active').textContent = (1247 + facilitiesInView * 85).toLocaleString();
    document.getElementById('stat-projects').textContent = Math.max(18, facilitiesInView * 3);
    document.getElementById('stat-catches').textContent = (3891 + buoysInView * 320).toLocaleString() + ' kg';
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
    map.setView(NEW_WASHINGTON_CENTER, NEW_WASHINGTON_ZOOM);
  });

  // ===== FULLSCREEN =====
  document.getElementById('btn-fullscreen').addEventListener('click', function () {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen();
    }
  });

  // ===== CENTER ON AKLAN =====
  document.getElementById('btn-center-aklan').addEventListener('click', function () {
    map.setView(NEW_WASHINGTON_CENTER, NEW_WASHINGTON_ZOOM, { animate: true, duration: 1 });
    if (activePanel) closePanel();
  });

  // ===== EXPORT =====
  document.getElementById('btn-export').addEventListener('click', function () {
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
    return fetch(API_BASE + path, { headers: { Accept: 'application/json' } })
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
  }

  function clearAiSquallLayers() {
    aiSquallLayer.clearLayers();
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
  }

  function renderDriftIncidentList(items) {
    var select = document.getElementById('ai-drift-select');
    if (!select) return;
    select.innerHTML = '';
    if (!items || !items.length) {
      select.innerHTML = '<option value="">No incidents available</option>';
      document.getElementById('ai-drift-meta').textContent = 'No drift incidents were returned by the backend.';
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
    if (!detections.length) {
      summary.innerHTML = '<div class="ai-empty-state">No active squall detections at the moment.</div>';
      renderSquallChart([]);
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
      window.location.href = 'dashboardprof.html';
    });
  }

  // ===== THEME TOGGLE (shared with profile.html) =====
  // Merged with profile.html's theme script: this now also keeps the
  // #pref-dark-toggle checkbox on the profile page in sync, and both
  // entry points (button click / checkbox change) funnel through one
  // applyTheme() so the two pages can never fight over the toggle.
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
  // Wrapped in its own IIFE and guarded with `if (element)` checks so it's a
  // safe no-op on pages (like this dashboard) that don't have these elements.
  // Reuses the dashboard's existing showToast() instead of redefining it.
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

    // ===== SAVE HANDLERS (placeholder — wire to your API as needed) =====
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

    // ===== CHANGE PHOTO (placeholder) =====
    var btnEditAvatar = document.getElementById('btn-edit-avatar');
    if (btnEditAvatar) {
      btnEditAvatar.addEventListener('click', function () {
        showToast('Coming Soon', 'Photo upload isn\u2019t wired up yet.');
      });
    }

    // ===== LOGOUT =====
    var btnLogout = document.getElementById('btn-logout');
    if (btnLogout) {
      btnLogout.addEventListener('click', function () {
        if (confirm('Are you sure you want to log out?')) {
          // Clear any session data you use, then redirect
          // sessionStorage.clear();
          window.location.href = 'login.html';
        }
      });
    }

    // ===== "LAST ACTIVE" TICKER =====
    var lastActiveEl = document.getElementById('profile-last-active');
    if (lastActiveEl) {
      lastActiveEl.textContent = 'Active now';
    }

    // ===== PLACEHOLDER STATS =====
    // Replace with real counts from your API when available.
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
      if (bfarOverlay.classList.contains('active')) { closeBFARModal(); return; }
      if (emergencyOverlay.classList.contains('active')) { closeEmergencyModal(); return; }
      if (aiOverlay && aiOverlay.classList.contains('active')) { closeAIModal(); return; }
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

  // ===== AI RISK ASSESSMENT =====
  const aiOverlay = document.getElementById('ai-modal-overlay');
  const aiClose   = document.getElementById('ai-modal-close');
  const aiRefreshBtn = document.getElementById('ai-btn-refresh');
  const aiRefreshIcon = document.getElementById('ai-refresh-icon');

  function openAIModal() {
    aiOverlay.classList.add('active');
  }

  function closeAIModal() {
    aiOverlay.classList.remove('active');
  }

  if (aiClose) aiClose.addEventListener('click', closeAIModal);
  if (aiOverlay) {
    aiOverlay.addEventListener('click', function (e) {
      if (e.target === aiOverlay) closeAIModal();
    });
  }



  var scenarios = [
    {
      risk: 'SAFE', riskClass: 'risk-safe', confidence: 94,
      factors: {
        wave:  { value: '0.8 meters', status: 'Safe',     cls: 'status-safe' },
        wind:  { value: '12 km/h',    status: 'Safe',     cls: 'status-safe' },
        rain:  { value: '20%',        status: 'Safe',     cls: 'status-safe' },
        storm: { value: 'None',       status: 'Safe',     cls: 'status-safe' }
      },
      recommendation: 'Current conditions are favorable for fishing operations. All vessel types are advised as safe to operate. Standard safety protocols still apply.'
    },
    {
      risk: 'MODERATE RISK', riskClass: 'risk-moderate', confidence: 87,
      factors: {
        wave:  { value: '1.4 meters', status: 'Safe',     cls: 'status-safe' },
        wind:  { value: '22 km/h',    status: 'Moderate', cls: 'status-moderate' },
        rain:  { value: '65%',        status: 'Moderate', cls: 'status-moderate' },
        storm: { value: 'None',       status: 'Safe',     cls: 'status-safe' }
      },
      recommendation: 'Current conditions suggest that small fishing vessels should proceed with caution due to elevated wind speeds and moderate rainfall probability. Larger commercial vessels are considered safe to operate.'
    },
    {
      risk: 'HIGH RISK', riskClass: 'risk-high', confidence: 96,
      factors: {
        wave:  { value: '3.2 meters', status: 'High Risk', cls: 'status-risk' },
        wind:  { value: '45 km/h',    status: 'High Risk', cls: 'status-risk' },
        rain:  { value: '90%',        status: 'High Risk', cls: 'status-risk' },
        storm: { value: 'Tropical Storm Warning', status: 'High Risk', cls: 'status-risk' }
      },
      recommendation: 'Adverse weather conditions detected. LGU is advised to suspend fishing operations for all vessel types until further notice. Notify all registered fisherfolk and coastal communities immediately.'
    }
  ];

  function applyScenario(scenario) {
    var badge = document.getElementById('ai-risk-badge');
    badge.textContent = scenario.risk;
    badge.className = 'ai-risk-badge ' + scenario.riskClass;

    document.getElementById('ai-confidence-value').textContent = scenario.confidence + '%';

    var fill = document.getElementById('ai-progress-fill');
    fill.style.width = scenario.confidence + '%';
    fill.className = 'ai-progress-fill';
    if (scenario.riskClass === 'risk-safe') fill.classList.add('fill-safe');
    else if (scenario.riskClass === 'risk-high') fill.classList.add('fill-high');

    document.getElementById('factor-wave-value').textContent = scenario.factors.wave.value;
    document.getElementById('factor-wave-status').textContent = scenario.factors.wave.status;
    document.getElementById('factor-wave-status').className = 'ai-status-badge ' + scenario.factors.wave.cls;

    document.getElementById('factor-wind-value').textContent = scenario.factors.wind.value;
    document.getElementById('factor-wind-status').textContent = scenario.factors.wind.status;
    document.getElementById('factor-wind-status').className = 'ai-status-badge ' + scenario.factors.wind.cls;

    document.getElementById('factor-rain-value').textContent = scenario.factors.rain.value;
    document.getElementById('factor-rain-status').textContent = scenario.factors.rain.status;
    document.getElementById('factor-rain-status').className = 'ai-status-badge ' + scenario.factors.rain.cls;

    document.getElementById('factor-storm-value').textContent = scenario.factors.storm.value;
    document.getElementById('factor-storm-status').textContent = scenario.factors.storm.status;
    document.getElementById('factor-storm-status').className = 'ai-status-badge ' + scenario.factors.storm.cls;

    document.getElementById('ai-recommendation-text').textContent = scenario.recommendation;

    document.querySelectorAll('.ai-factor-card').forEach(function (card, i) {
      card.style.animation = 'none';
      void card.offsetHeight;
      card.style.animation = 'ai-fade-slide 0.4s ease';
      card.style.animationFillMode = 'both';
      card.style.animationDelay = (0.05 * (i + 1)) + 's';
    });
    var rec = document.querySelector('.ai-recommendation');
    rec.style.animation = 'none';
    void rec.offsetHeight;
    rec.style.animation = 'ai-fade-slide 0.4s ease';
    rec.style.animationDelay = '0.25s';
    rec.style.animationFillMode = 'both';
  }

  if (aiRefreshBtn) {
    aiRefreshBtn.addEventListener('click', function () {
      aiRefreshBtn.disabled = true;
      aiRefreshIcon.classList.add('spinning');
      setTimeout(function () {
        var idx = Math.floor(Math.random() * scenarios.length);
        applyScenario(scenarios[idx]);
        aiRefreshBtn.disabled = false;
        aiRefreshIcon.classList.remove('spinning');
      }, 1000);
    });
  }

  // ===== BFAR CONSERVATION ZONES =====
  function updateHotspotCircle(idx) {
    var h = hotspots[idx];
    var circle = hotspotCircles[idx];
    if (h.protected) {
      circle.setStyle({
        color: '#e74c3c',
        fillColor: '#e74c3c',
        fillOpacity: 0.25,
        weight: 2.5,
        dashArray: null
      });
    } else {
      var predColor = getPredictionColor(h.prediction);
      circle.setStyle({
        color: predColor,
        fillColor: predColor,
        fillOpacity: 0.12,
        weight: 1.5,
        dashArray: '4 4'
      });
    }
    circle.unbindPopup();
    circle.bindPopup(buildHotspotPopup(h, idx));
    wireHotspotPopup(circle, h, idx);
    circle.unbindTooltip();
    circle.bindTooltip(buildTooltipContent(h), {
      direction: 'top',
      offset: L.point(0, -20),
      className: 'hotspot-tooltip'
    });
  }

  function designateZone(idx, durationDays, reason) {
    var h = hotspots[idx];
    var until = new Date();
    until.setDate(until.getDate() + durationDays);
    h.protected = true;
    h.protectedUntil = until.getTime();
    h.reason = reason;
    updateHotspotCircle(idx);
    renderProtectedZones();
    updateBFARStats();
    var dateStr = until.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    showToast('Conservation Zone Created', 'Fish Hotspot #' + (idx + 1) + ' is now protected until ' + dateStr + '.');
  }

  function removeProtection(idx) {
    var h = hotspots[idx];
    h.protected = false;
    h.protectedUntil = null;
    h.reason = '';
    updateHotspotCircle(idx);
    renderProtectedZones();
    updateBFARStats();
    showToast('Conservation Zone Removed', 'Fishing is now permitted in this area.');
  }

  function renderProtectedZones() {
    var list = document.getElementById('protected-zone-list');
    var protectedZones = hotspots.filter(function (h) { return h.protected; });
    if (protectedZones.length === 0) {
      list.innerHTML = '<div class="protected-zone-empty">No protected zones yet</div>';
      return;
    }
    list.innerHTML = '';
    hotspots.forEach(function (h, idx) {
      if (!h.protected) return;
      var d = new Date(h.protectedUntil);
      var dateStr = d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      var hZoneName = h.zoneName || h.posted_by || ('Zone #' + (idx + 1));
      var card = document.createElement('div');
      card.className = 'bfar-card';
      card.innerHTML =
        '<div class="bfar-card-title">' + hZoneName + '</div>' +
        '<div class="bfar-card-meta">Protected until ' + dateStr + '</div>' +
        '<div class="bfar-card-meta">' + (h.reason || '') + '</div>' +
        '<div class="bfar-card-actions">' +
          '<button class="bfar-card-btn btn-focus" data-idx="' + idx + '">Focus</button>' +
          '<button class="bfar-card-btn btn-remove" data-idx="' + idx + '">Remove</button>' +
        '</div>';
      list.appendChild(card);
    });
    list.querySelectorAll('.btn-focus').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = parseInt(btn.dataset.idx);
        map.setView([hotspots[idx].lat || hotspots[idx].latitude, hotspots[idx].lng || hotspots[idx].longitude], 13);
      });
    });
    list.querySelectorAll('.btn-remove').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = parseInt(btn.dataset.idx);
        removeProtection(idx);
      });
    });
  }

  function updateBFARStats() {
    var count = hotspots.filter(function (h) { return h.protected; }).length;
    var el = document.getElementById('stat-projects');
    if (el) {
      var base = count > 0 ? 15 + count * 5 : 18;
      el.textContent = Math.max(18, base);
    }
  }

  function showToast(title, msg) {
    var container = document.getElementById('toast-container');
    var toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = '<div class="toast-title">' + title + '</div><div class="toast-msg">' + msg + '</div>';
    container.appendChild(toast);
    setTimeout(function () {
      toast.classList.add('toast-leave');
      setTimeout(function () { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 300);
    }, 4000);
  }

  // BFAR Modal
  var bfarOverlay = document.getElementById('bfar-modal-overlay');
  var bfarClose = document.getElementById('bfar-modal-close');
  var bfarCancel = document.getElementById('bfar-btn-cancel');
  var bfarConfirm = document.getElementById('bfar-btn-confirm');

  function closeBFARModal() { bfarOverlay.classList.remove('active'); }

  bfarClose.addEventListener('click', closeBFARModal);
  bfarCancel.addEventListener('click', closeBFARModal);
  bfarOverlay.addEventListener('click', function (e) { if (e.target === bfarOverlay) closeBFARModal(); });


  bfarConfirm.addEventListener('click', function () {
    if (currentDesignateIndex < 0) return;
    var duration = parseInt(document.getElementById('bfar-duration').value);
    var reason = document.getElementById('bfar-reason').value;
    if (isNaN(duration)) duration = 30;
    designateZone(currentDesignateIndex, duration, reason);
    currentDesignateIndex = -1;
    closeBFARModal();
  });

  // Custom events for hotspot popup buttons
  window.addEventListener('bfar-designate', function (e) {
    currentDesignateIndex = e.detail.idx;
    bfarOverlay.classList.add('active');
  });
  window.addEventListener('remove-protection', function (e) {
    removeProtection(e.detail.idx);
  });

  renderProtectedZones();
  updateBFARStats();

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
       var res = await fetch(API_BASE + '/api/sea-condition');
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

       fetch(API_BASE + '/api/sea-condition', {
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

})();
