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
  var renderIncidentFeed = ns.renderIncidentFeed;
  var buoyMonitorData = ns.buoyMonitorData;
  var buoyRailBtn = ns.buoyRailBtn;
  var buoyRailBadge = ns.buoyRailBadge;
  var buoyDrawerBadge = ns.buoyDrawerBadge;
  var buoyListEl = ns.buoyListEl;
  var buoyFooter = ns.buoyFooter;
  var buoySyncTime = ns.buoySyncTime;
  var buoyOnlineCount = ns.buoyOnlineCount;
  var buoyTotal = ns.buoyTotal;
  var renderBuoyList = ns.renderBuoyList;
  var renderBuoyHealthCard = ns.renderBuoyHealthCard;
  var renderBuoyHealth = ns.renderBuoyHealth;
  var updateBuoySync = ns.updateBuoySync;
  var updateStats = ns.updateStats;
  var formatCoord = ns.formatCoord;
  var compassWidget = ns.compassWidget;
  var aiContoursLayer = ns.aiContoursLayer;
  var aiSquallLayer = ns.aiSquallLayer;
  var aiRefreshTimer = ns.aiRefreshTimer;
  var aiColors = ns.aiColors;
  var aiFetchJson = ns.aiFetchJson;
  var aiStatusClass = ns.aiStatusClass;
  var aiRiskPriority = ns.aiRiskPriority;
  var clearAiDriftLayers = ns.clearAiDriftLayers;
  var clearAiSquallLayers = ns.clearAiSquallLayers;
  var updateAiMapKey = ns.updateAiMapKey;
  var updateSquallBanner = ns.updateSquallBanner;
  var renderDriftContours = ns.renderDriftContours;
  var renderDriftIncidentList = ns.renderDriftIncidentList;
  var renderRiskFeed = ns.renderRiskFeed;
  var renderSquallChart = ns.renderSquallChart;
  var updateSquallLegendVisibility = ns.updateSquallLegendVisibility;
  var renderSquallWatch = ns.renderSquallWatch;
  var loadDriftIncidentDetail = ns.loadDriftIncidentDetail;
  var loadSquallTrace = ns.loadSquallTrace;
  var initAIOperations = ns.initAIOperations;
  var userProfilePill = ns.userProfilePill;
  var btnExport = ns.btnExport;
  var hideLoadingOverlay = ns.hideLoadingOverlay;
  var wcBody = ns.wcBody;
  var WConditions_INTERVAL_MS = ns.WConditions_INTERVAL_MS;
  var WEATHER_CACHE_KEY = ns.WEATHER_CACHE_KEY;
  var SAFETY_THRESHOLDS = ns.SAFETY_THRESHOLDS;
  var SAFETY_TIERS = ns.SAFETY_TIERS;
  var classifySafety = ns.classifySafety;
  var degToCompass = ns.degToCompass;
  var WMO_MAP = ns.WMO_MAP;
  var wmoIcon = ns.wmoIcon;
  var safetyBadgeHTML = ns.safetyBadgeHTML;
  var renderWeatherCard = ns.renderWeatherCard;
  var renderForecast = ns.renderForecast;
  var renderRainfall = ns.renderRainfall;
  var fetchLiveJson = ns.fetchLiveJson;
  var readWeatherCache = ns.readWeatherCache;
  var writeWeatherCache = ns.writeWeatherCache;
  var forecastTimeLabel = ns.forecastTimeLabel;
  var buildForecastAlerts = ns.buildForecastAlerts;
  var replaceForecastAlerts = ns.replaceForecastAlerts;
  var displayWeatherSnapshot = ns.displayWeatherSnapshot;
  var fetchWeatherData = ns.fetchWeatherData;

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

  // Real SOS events from the backend. Kept in a separate array from the demo
  // rows above so that nothing scripted can ever be mistaken for a live
  // distress call: live entries carry isLive and a real sosEventId, demo rows
  // carry neither. Live entries always sort first.
  let liveAlerts = [];

  function allAlerts() {
    return liveAlerts.concat(alertData);
  }

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

  // A live SOS shows no confidence score. The other alert types are model
  // output and a percentage is meaningful; a person pressing the button is a
  // fact, and dressing it in a fabricated confidence number would be a lie in
  // the one place on this dashboard where lying costs the most.
  function alertConfidenceRow(a) {
    if (a.isLive) {
      return `<div class="aq-alert-conf">
            <span class="aq-stage-mini">${escapeHtml(a.stage)}</span>
          </div>`;
    }
    return `<div class="aq-alert-conf">
            <span class="aq-conf-mini" style="color:${confidenceColor(a.confidence)};">${a.confidence}% conf</span>
            <span class="aq-conf-bar"><span class="aq-conf-fill" style="width:${a.confidence}%;background:${confidenceColor(a.confidence)};"></span></span>
            <span class="aq-stage-mini">${escapeHtml(a.stage)}</span>
          </div>`;
  }

  function renderAlerts() {
    const list = document.getElementById('alert-list');
    const rows = allAlerts();
    list.innerHTML = rows.map((a, i) => `
      <div class="alert-row${a.isLive ? ' alert-row-live' : ' alert-row-secondary'}" data-alert-index="${i}">
        ${alertIcon(a.type)}
        <div class="alert-info">
          <div class="alert-desc">${(function () {
            var badge = alertBadge(a.isLive);
            var title = a.isLive ? '' : ' title="Scripted sample data, not a real incident"';
            return '<span class="' + badge.cssClass + '"' + title + '>' + badge.text + '</span>';
          })()}${escapeHtml(a.desc)}</div>
          <div class="alert-meta">${a.time} &middot; ${
            a.lat == null || a.lng == null
              ? '<span class="alert-nofix">no GPS fix</span>'
              : a.lat + '&deg; N, ' + a.lng + '&deg; E'
          }${a.etaAt ? ' &middot; <span data-eta-at="' + escapeHtml(a.etaAt) + '"></span>' : ''}</div>
          ${alertConfidenceRow(a)}
        </div>
        ${alertStatusPill(a.status)}
      </div>
    `).join('');

    list.querySelectorAll('.alert-row').forEach(row => {
      row.addEventListener('click', () => {
        var a = rows[row.dataset.alertIndex];
        if (!a) return;
        // An SOS sent without a GPS fix is still a real distress call and must
        // stay clickable. There is simply nowhere to pan the map to.
        if (a.lat != null && a.lng != null) {
          map.setView([a.lat, a.lng], 14, { animate: true, duration: 1 });
        }
        if (a.isLive && a.drawerData) {
          openIncidentDrawer(a.drawerData, liveSosMarkers[a.sosEventId] || null);
          return;
        }
        if (a.vesselId) {
          var vm = vesselMarkers[a.vesselId];
          if (vm) vm.openPopup();
        }
      });
    });
  }

  renderAlerts();

  const activeAlertCount = liveAlerts.filter(a => a.status === 'active').length;
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
    const activeCount = liveAlerts.filter(function (alert) {
      return alert.status === 'active';
    }).length;
    const alertBadge = document.getElementById('badge-alerts');
    if (alertBadge) alertBadge.textContent = activeCount;
    if (bannerCountEl) bannerCountEl.textContent = activeCount;
    if (liveBanner) liveBanner.classList.toggle('has-alerts', activeCount > 0);
    renderAlerts();
  }


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
    advStatusSelect.value = 'Published';
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

  // Delegates to the shared, DOM-free implementation
  // (web/js/dashboard-utils.js) so there is exactly one escaping function in
  // this codebase, not two that can silently drift apart. Kept under its
  // original name because ~15 call sites already use it.
  function _escHtml(str) {
    return escapeHtml(str);
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

   // The banner's "Last updated" ticker used to be an independent counter
   // here, incrementing every 30s regardless of whether anything had
   // actually refreshed - a second copy of the fake-freshness problem
   // updateSyncStatus() above now fixes for the header pill. Removed rather
   // than kept in sync by hand: updateSyncStatus() already writes
   // .banner-time every second from the one real timestamp
   // (lastSosSuccessMs), so a second writer here could only drift from it.


})(window.AqOneDashboard = window.AqOneDashboard || {});
