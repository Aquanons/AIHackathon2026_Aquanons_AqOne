(function (ns) {
  'use strict';
  if (!ns.ready) return;
  var dashboardUtils = ns.dashboardUtils;
  var escapeHtml = ns.escapeHtml;
  var classifyFreshness = ns.classifyFreshness;
  var freshnessLabel = ns.freshnessLabel;
  var alertBadge = ns.alertBadge;
  var OPS_CENTER = ns.OPS_CENTER;
  var OPS_ZOOM = ns.OPS_ZOOM;
  var TILES = ns.TILES;
  var PIN_POLL_INTERVAL_MS = ns.PIN_POLL_INTERVAL_MS;
  var API_BASE = ns.API_BASE;
  var TOKEN_KEY = ns.TOKEN_KEY;
  var USER_KEY = ns.USER_KEY;
  var LOGIN_URL = ns.LOGIN_URL;
  var getToken = ns.getToken;
  var clearSession = ns.clearSession;
  var redirectToLogin = ns.redirectToLogin;
  var authFetch = ns.authFetch;
  var CURRENT_USER = ns.CURRENT_USER;
  var PIN_PALETTE = ns.PIN_PALETTE;
  var hashUserId = ns.hashUserId;
  var CURRENT_USER_COLOR = ns.CURRENT_USER_COLOR;
  var shoreStations = ns.shoreStations;
  var initialBuoys = ns.initialBuoys;
  var _metresBetween = ns._metresBetween;
  var meshLinks = ns.meshLinks;
  var incidents = ns.incidents;
  var opsBoundary = ns.opsBoundary;
  var map = ns.map;
  var tileLayers = ns.tileLayers;
  var currentBase = ns.currentBase;
  var gatewayLayer = ns.gatewayLayer;
  var incidentLayer = ns.incidentLayer;
  var buoyLayer = ns.buoyLayer;
  var boundaryLayer = ns.boundaryLayer;
  var pinLayer = ns.pinLayer;
  var vesselLayer = ns.vesselLayer;
  var coverageLayer = ns.coverageLayer;
  var meshLayer = ns.meshLayer;
  var squallLayer = ns.squallLayer;
  var driftLayer = ns.driftLayer;
  var dangerZoneLayer = ns.dangerZoneLayer;
  var showToast = ns.showToast;
  var createMarkerIcon = ns.createMarkerIcon;
  var createOverdueIcon = ns.createOverdueIcon;
  var makePopup = ns.makePopup;
  var coverageCircles = ns.coverageCircles;
  var pulseCoverageCircle = ns.pulseCoverageCircle;
  var meshPolylines = ns.meshPolylines;
  var findNode = ns.findNode;
  var gatewayBuoy = ns.gatewayBuoy;
  var meshPath = ns.meshPath;
  var meshDot = ns.meshDot;
  var dotIdx = ns.dotIdx;
  var meshDotInterval = ns.meshDotInterval;
  var incidentDrawerData = ns.incidentDrawerData;
  var incidentMarkers = ns.incidentMarkers;
  var apiBuoys = ns.apiBuoys;
  var dangerZoneRequestId = ns.dangerZoneRequestId;
  var lastDangerZoneResult = ns.lastDangerZoneResult;
  var dangerZoneCacheKey = ns.dangerZoneCacheKey;
  var readCachedDangerZoneResult = ns.readCachedDangerZoneResult;
  var cacheDangerZoneResult = ns.cacheDangerZoneResult;
  var escapeDangerZoneText = ns.escapeDangerZoneText;
  var renderDangerZones = ns.renderDangerZones;
  var refreshDangerZones = ns.refreshDangerZones;
  var boundaryPoly = ns.boundaryPoly;
  var pinModeActive = ns.pinModeActive;
  var panModeActive = ns.panModeActive;
  var pinBtn = ns.pinBtn;
  var panBtn = ns.panBtn;
  var mapEl = ns.mapEl;
  var pinMarkers = ns.pinMarkers;
  var relativeTime = ns.relativeTime;
  var createPinIcon = ns.createPinIcon;
  var dropLocalPin = ns.dropLocalPin;
  var activatePinMode = ns.activatePinMode;
  var deactivatePinMode = ns.deactivatePinMode;
  var activatePanMode = ns.activatePanMode;
  var deactivatePanMode = ns.deactivatePanMode;
  var MEASURE_COLOR = ns.MEASURE_COLOR;
  var MEASURE_PREVIEW = ns.MEASURE_PREVIEW;
  var haversineKm = ns.haversineKm;
  var fmtKm = ns.fmtKm;
  var measureActive = ns.measureActive;
  var measureFinished = ns.measureFinished;
  var measurePts = ns.measurePts;
  var measureLayer = ns.measureLayer;
  var mPolyline = ns.mPolyline;
  var mPreview = ns.mPreview;
  var mTooltips = ns.mTooltips;
  var mVertices = ns.mVertices;
  var measureBtn = ns.measureBtn;
  var measureHud = ns.measureHud;
  var hudTotal = ns.hudTotal;
  var panelTotal = ns.panelTotal;
  var panelCount = ns.panelCount;
  var btnFinish = ns.btnFinish;
  var btnClear = ns.btnClear;
  var mDblClickGuard = ns.mDblClickGuard;
  var measureUpdateUI = ns.measureUpdateUI;
  var measureAddVertexMarker = ns.measureAddVertexMarker;
  var measureAddSegmentLabel = ns.measureAddSegmentLabel;
  var measureRedrawPolyline = ns.measureRedrawPolyline;
  var measureClearLabels = ns.measureClearLabels;
  var measureClearVertices = ns.measureClearVertices;
  var measureRebuildLabels = ns.measureRebuildLabels;
  var measureAddPoint = ns.measureAddPoint;
  var measureClearPreview = ns.measureClearPreview;
  var measureUpdatePreview = ns.measureUpdatePreview;
  var measureClearAll = ns.measureClearAll;
  var measureFinish = ns.measureFinish;
  var activateMeasureMode = ns.activateMeasureMode;
  var deactivateMeasureMode = ns.deactivateMeasureMode;
  var onMeasureMouseMove = ns.onMeasureMouseMove;
  var switchLayer = ns.switchLayer;
  var toolPanelCard = ns.toolPanelCard;
  var toolPanelTitle = ns.toolPanelTitle;
  var railBtns = ns.railBtns;
  var panelContents = ns.panelContents;
  var panelCloseBtns = ns.panelCloseBtns;
  var activePanel = ns.activePanel;
  var PANEL_TITLES = ns.PANEL_TITLES;
  var openPanel = ns.openPanel;
  var closePanel = ns.closePanel;
  var toggleLayer = ns.toggleLayer;
  var dangerZoneRefresh = ns.dangerZoneRefresh;
  var statsWidget = ns.statsWidget;
  var statsMinimizeBtn = ns.statsMinimizeBtn;
  var statsBody = ns.statsBody;
  var statsMinimized = ns.statsMinimized;
  var statAlertsCard = ns.statAlertsCard;
  var legendCard = ns.legendCard;
  var legendToggle = ns.legendToggle;
  var legendCollapsed = ns.legendCollapsed;
  var statsTabs = ns.statsTabs;
  var tabContents = ns.tabContents;
  var LIVE_SOS_POLL_MS = ns.LIVE_SOS_POLL_MS;
  var liveSosLayer = ns.liveSosLayer;
  var liveSosMarkers = ns.liveSosMarkers;
  var liveSosFirstLoad = ns.liveSosFirstLoad;
  var knownSosIds = ns.knownSosIds;
  var lastSosSuccessMs = ns.lastSosSuccessMs;
  var syncStatusEl = ns.syncStatusEl;
  var syncTextEl = ns.syncTextEl;
  var bannerTimeEl = ns.bannerTimeEl;
  var updateSyncStatus = ns.updateSyncStatus;
  var liveSosIcon = ns.liveSosIcon;
  var deliveryPath = ns.deliveryPath;
  var sosPosition = ns.sosPosition;
  var liveAlertFromEvent = ns.liveAlertFromEvent;
  var syncLiveSosMarkers = ns.syncLiveSosMarkers;
  var loadActiveSos = ns.loadActiveSos;
  var sarRowsFromResults = ns.sarRowsFromResults;
  var renderSarEmpty = ns.renderSarEmpty;
  var renderSarMetrics = ns.renderSarMetrics;
  var loadSarMetrics = ns.loadSarMetrics;
  var sosDrawer = ns.sosDrawer;
  var sosDrawerHeader = ns.sosDrawerHeader;
  var sosDrawerTitle = ns.sosDrawerTitle;
  var sosDrawerClose = ns.sosDrawerClose;
  var sosTimerEl = ns.sosTimerEl;
  var sosBtnZoom = ns.sosBtnZoom;
  var sosBtnAcknowledge = ns.sosBtnAcknowledge;
  var sosBtnResolve = ns.sosBtnResolve;
  var sosBtnBroadcast = ns.sosBtnBroadcast;
  var sosBtnCheckin = ns.sosBtnCheckin;
  var sosBroadcastMsg = ns.sosBroadcastMsg;
  var sosTimerInterval = ns.sosTimerInterval;
  var sosAlertStartTime = ns.sosAlertStartTime;
  var currentDrawerMarker = ns.currentDrawerMarker;
  var currentDrawerData = ns.currentDrawerData;
  var openIncidentDrawer = ns.openIncidentDrawer;
  var closeSOSDrawer = ns.closeSOSDrawer;
  var sosTickTimer = ns.sosTickTimer;
  var ackOverlay = ns.ackOverlay;
  var ackVesselEl = ns.ackVesselEl;
  var ackStatusEl = ns.ackStatusEl;
  var ackEtaEl = ns.ackEtaEl;
  var ackNoteEl = ns.ackNoteEl;
  var ackConfirmBtn = ns.ackConfirmBtn;
  var closeAckModal = ns.closeAckModal;
  var openAckModal = ns.openAckModal;
  var ackQuick = ns.ackQuick;
  var formatEta = ns.formatEta;

  // ===== INCIDENT FEED =====
  function renderIncidentFeed() {
    var el = document.getElementById('incident-feed-list');
    if (!el) return;
    var active = allAlerts().filter(function (a) { return a.status !== 'resolved'; });
    if (active.length === 0) {
      el.innerHTML = '<p class="panel-stub-text">No active incidents</p>';
      return;
    }
    var shown = active.slice(0, 4);
    el.innerHTML = shown.map(function (a, i) {
      return '<div class="incident-feed-row' + (a.isLive ? ' incident-feed-live' : '') +
        '" data-idx="' + i + '">' +
        alertIcon(a.type) +
        '<div class="incident-feed-info">' +
          '<div class="incident-feed-desc">' +
            (a.isLive ? '<span class="alert-live-badge">LIVE</span>' : '') + a.desc + '</div>' +
          '<div class="incident-feed-meta">' + a.time + '</div>' +
        '</div>' +
      '</div>';
    }).join('');
    el.querySelectorAll('.incident-feed-row').forEach(function (row) {
      row.addEventListener('click', function () {
        // Indexes into the filtered list that was actually rendered. This
        // previously indexed the unfiltered array, so a click could pan to a
        // different incident than the one clicked.
        var a = shown[row.dataset.idx];
        if (!a || a.lat == null || a.lng == null) return;
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

  ns.dashboardUtils = dashboardUtils;
  ns.escapeHtml = escapeHtml;
  ns.classifyFreshness = classifyFreshness;
  ns.freshnessLabel = freshnessLabel;
  ns.alertBadge = alertBadge;
  ns.OPS_CENTER = OPS_CENTER;
  ns.OPS_ZOOM = OPS_ZOOM;
  ns.TILES = TILES;
  ns.PIN_POLL_INTERVAL_MS = PIN_POLL_INTERVAL_MS;
  ns.API_BASE = API_BASE;
  ns.TOKEN_KEY = TOKEN_KEY;
  ns.USER_KEY = USER_KEY;
  ns.LOGIN_URL = LOGIN_URL;
  ns.getToken = getToken;
  ns.clearSession = clearSession;
  ns.redirectToLogin = redirectToLogin;
  ns.authFetch = authFetch;
  ns.CURRENT_USER = CURRENT_USER;
  ns.PIN_PALETTE = PIN_PALETTE;
  ns.hashUserId = hashUserId;
  ns.CURRENT_USER_COLOR = CURRENT_USER_COLOR;
  ns.shoreStations = shoreStations;
  ns.initialBuoys = initialBuoys;
  ns._metresBetween = _metresBetween;
  ns.meshLinks = meshLinks;
  ns.incidents = incidents;
  ns.opsBoundary = opsBoundary;
  ns.map = map;
  ns.tileLayers = tileLayers;
  ns.currentBase = currentBase;
  ns.gatewayLayer = gatewayLayer;
  ns.incidentLayer = incidentLayer;
  ns.buoyLayer = buoyLayer;
  ns.boundaryLayer = boundaryLayer;
  ns.pinLayer = pinLayer;
  ns.vesselLayer = vesselLayer;
  ns.coverageLayer = coverageLayer;
  ns.meshLayer = meshLayer;
  ns.squallLayer = squallLayer;
  ns.driftLayer = driftLayer;
  ns.dangerZoneLayer = dangerZoneLayer;
  ns.showToast = showToast;
  ns.createMarkerIcon = createMarkerIcon;
  ns.createOverdueIcon = createOverdueIcon;
  ns.makePopup = makePopup;
  ns.coverageCircles = coverageCircles;
  ns.pulseCoverageCircle = pulseCoverageCircle;
  ns.meshPolylines = meshPolylines;
  ns.findNode = findNode;
  ns.gatewayBuoy = gatewayBuoy;
  ns.meshPath = meshPath;
  ns.meshDot = meshDot;
  ns.dotIdx = dotIdx;
  ns.meshDotInterval = meshDotInterval;
  ns.incidentDrawerData = incidentDrawerData;
  ns.incidentMarkers = incidentMarkers;
  ns.apiBuoys = apiBuoys;
  ns.dangerZoneRequestId = dangerZoneRequestId;
  ns.lastDangerZoneResult = lastDangerZoneResult;
  ns.dangerZoneCacheKey = dangerZoneCacheKey;
  ns.readCachedDangerZoneResult = readCachedDangerZoneResult;
  ns.cacheDangerZoneResult = cacheDangerZoneResult;
  ns.escapeDangerZoneText = escapeDangerZoneText;
  ns.renderDangerZones = renderDangerZones;
  ns.refreshDangerZones = refreshDangerZones;
  ns.boundaryPoly = boundaryPoly;
  ns.pinModeActive = pinModeActive;
  ns.panModeActive = panModeActive;
  ns.pinBtn = pinBtn;
  ns.panBtn = panBtn;
  ns.mapEl = mapEl;
  ns.pinMarkers = pinMarkers;
  ns.relativeTime = relativeTime;
  ns.createPinIcon = createPinIcon;
  ns.dropLocalPin = dropLocalPin;
  ns.activatePinMode = activatePinMode;
  ns.deactivatePinMode = deactivatePinMode;
  ns.activatePanMode = activatePanMode;
  ns.deactivatePanMode = deactivatePanMode;
  ns.MEASURE_COLOR = MEASURE_COLOR;
  ns.MEASURE_PREVIEW = MEASURE_PREVIEW;
  ns.haversineKm = haversineKm;
  ns.fmtKm = fmtKm;
  ns.measureActive = measureActive;
  ns.measureFinished = measureFinished;
  ns.measurePts = measurePts;
  ns.measureLayer = measureLayer;
  ns.mPolyline = mPolyline;
  ns.mPreview = mPreview;
  ns.mTooltips = mTooltips;
  ns.mVertices = mVertices;
  ns.measureBtn = measureBtn;
  ns.measureHud = measureHud;
  ns.hudTotal = hudTotal;
  ns.panelTotal = panelTotal;
  ns.panelCount = panelCount;
  ns.btnFinish = btnFinish;
  ns.btnClear = btnClear;
  ns.mDblClickGuard = mDblClickGuard;
  ns.measureUpdateUI = measureUpdateUI;
  ns.measureAddVertexMarker = measureAddVertexMarker;
  ns.measureAddSegmentLabel = measureAddSegmentLabel;
  ns.measureRedrawPolyline = measureRedrawPolyline;
  ns.measureClearLabels = measureClearLabels;
  ns.measureClearVertices = measureClearVertices;
  ns.measureRebuildLabels = measureRebuildLabels;
  ns.measureAddPoint = measureAddPoint;
  ns.measureClearPreview = measureClearPreview;
  ns.measureUpdatePreview = measureUpdatePreview;
  ns.measureClearAll = measureClearAll;
  ns.measureFinish = measureFinish;
  ns.activateMeasureMode = activateMeasureMode;
  ns.deactivateMeasureMode = deactivateMeasureMode;
  ns.onMeasureMouseMove = onMeasureMouseMove;
  ns.switchLayer = switchLayer;
  ns.toolPanelCard = toolPanelCard;
  ns.toolPanelTitle = toolPanelTitle;
  ns.railBtns = railBtns;
  ns.panelContents = panelContents;
  ns.panelCloseBtns = panelCloseBtns;
  ns.activePanel = activePanel;
  ns.PANEL_TITLES = PANEL_TITLES;
  ns.openPanel = openPanel;
  ns.closePanel = closePanel;
  ns.toggleLayer = toggleLayer;
  ns.dangerZoneRefresh = dangerZoneRefresh;
  ns.statsWidget = statsWidget;
  ns.statsMinimizeBtn = statsMinimizeBtn;
  ns.statsBody = statsBody;
  ns.statsMinimized = statsMinimized;
  ns.statAlertsCard = statAlertsCard;
  ns.legendCard = legendCard;
  ns.legendToggle = legendToggle;
  ns.legendCollapsed = legendCollapsed;
  ns.statsTabs = statsTabs;
  ns.tabContents = tabContents;
  ns.LIVE_SOS_POLL_MS = LIVE_SOS_POLL_MS;
  ns.liveSosLayer = liveSosLayer;
  ns.liveSosMarkers = liveSosMarkers;
  ns.liveSosFirstLoad = liveSosFirstLoad;
  ns.knownSosIds = knownSosIds;
  ns.lastSosSuccessMs = lastSosSuccessMs;
  ns.syncStatusEl = syncStatusEl;
  ns.syncTextEl = syncTextEl;
  ns.bannerTimeEl = bannerTimeEl;
  ns.updateSyncStatus = updateSyncStatus;
  ns.liveSosIcon = liveSosIcon;
  ns.deliveryPath = deliveryPath;
  ns.sosPosition = sosPosition;
  ns.liveAlertFromEvent = liveAlertFromEvent;
  ns.syncLiveSosMarkers = syncLiveSosMarkers;
  ns.loadActiveSos = loadActiveSos;
  ns.sarRowsFromResults = sarRowsFromResults;
  ns.renderSarEmpty = renderSarEmpty;
  ns.renderSarMetrics = renderSarMetrics;
  ns.loadSarMetrics = loadSarMetrics;
  ns.sosDrawer = sosDrawer;
  ns.sosDrawerHeader = sosDrawerHeader;
  ns.sosDrawerTitle = sosDrawerTitle;
  ns.sosDrawerClose = sosDrawerClose;
  ns.sosTimerEl = sosTimerEl;
  ns.sosBtnZoom = sosBtnZoom;
  ns.sosBtnAcknowledge = sosBtnAcknowledge;
  ns.sosBtnResolve = sosBtnResolve;
  ns.sosBtnBroadcast = sosBtnBroadcast;
  ns.sosBtnCheckin = sosBtnCheckin;
  ns.sosBroadcastMsg = sosBroadcastMsg;
  ns.sosTimerInterval = sosTimerInterval;
  ns.sosAlertStartTime = sosAlertStartTime;
  ns.currentDrawerMarker = currentDrawerMarker;
  ns.currentDrawerData = currentDrawerData;
  ns.openIncidentDrawer = openIncidentDrawer;
  ns.closeSOSDrawer = closeSOSDrawer;
  ns.sosTickTimer = sosTickTimer;
  ns.ackOverlay = ackOverlay;
  ns.ackVesselEl = ackVesselEl;
  ns.ackStatusEl = ackStatusEl;
  ns.ackEtaEl = ackEtaEl;
  ns.ackNoteEl = ackNoteEl;
  ns.ackConfirmBtn = ackConfirmBtn;
  ns.closeAckModal = closeAckModal;
  ns.openAckModal = openAckModal;
  ns.ackQuick = ackQuick;
  ns.formatEta = formatEta;
  ns.renderIncidentFeed = renderIncidentFeed;
  ns.buoyMonitorData = buoyMonitorData;
  ns.buoyRailBtn = buoyRailBtn;
  ns.buoyRailBadge = buoyRailBadge;
  ns.buoyDrawerBadge = buoyDrawerBadge;
  ns.buoyListEl = buoyListEl;
  ns.buoyFooter = buoyFooter;
  ns.buoySyncTime = buoySyncTime;
  ns.buoyOnlineCount = buoyOnlineCount;
  ns.buoyTotal = buoyTotal;
  ns.renderBuoyList = renderBuoyList;
  ns.renderBuoyHealthCard = renderBuoyHealthCard;
  ns.renderBuoyHealth = renderBuoyHealth;
  ns.updateBuoySync = updateBuoySync;
  ns.updateStats = updateStats;
  ns.formatCoord = formatCoord;
  ns.compassWidget = compassWidget;

})(window.AqOneDashboard = window.AqOneDashboard || {});
