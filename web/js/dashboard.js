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
    //
    // A real SOS carries no confidence score and must not be shown with one.
    // The old code coerced a missing score to 0, which would have rendered a
    // human distress call as "0% confidence" - the most damaging possible
    // misreading on this screen. Null hides the meter instead.
    var confValueEl = document.getElementById('sos-confidence-value');
    var fill = document.getElementById('sos-confidence-fill');
    var confBlock = confValueEl ? confValueEl.closest('.sos-conf') : null;
    if (data.confidence == null) {
      if (confValueEl) confValueEl.textContent = 'Not scored';
      if (confValueEl) confValueEl.style.color = 'var(--text-muted, #94a3b8)';
      if (fill) fill.style.width = '0%';
      if (confBlock) confBlock.classList.add('is-unscored');
    } else {
      var conf = data.confidence;
      if (confBlock) confBlock.classList.remove('is-unscored');
      if (confValueEl) {
        confValueEl.textContent = conf + '%';
        confValueEl.style.color = confidenceColor(conf);
      }
      if (fill) {
        fill.style.width = conf + '%';
        fill.style.background = confidenceColor(conf);
      }
    }
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

        // Match on the event id when there is one. The old positional match on
        // vesselId-or-coordinates could acknowledge the wrong row when two
        // alerts shared a vessel, and could not address a live event at all.
        const row = allAlerts().find(function (a) {
          if (eventId) return a.sosEventId === eventId;
          return a.vesselId === currentDrawerData.vesselId ||
                 (a.lat === currentDrawerData.lat && a.lng === currentDrawerData.lng);
        });
        if (row) {
          row.status = 'acknowledged';
          row.etaAt = currentDrawerData.etaAt;
          syncAlertIndicators();
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
    const eventId = currentDrawerData && currentDrawerData.sosEventId;
    if (currentDrawerMarker) {
      incidentLayer.removeLayer(currentDrawerMarker);
      liveSosLayer.removeLayer(currentDrawerMarker);
    }
    if (currentDrawerData) {
      const row = allAlerts().find(function (a) {
        if (eventId) return a.sosEventId === eventId;
        return a.vesselId === currentDrawerData.vesselId ||
               (a.lat === currentDrawerData.lat && a.lng === currentDrawerData.lng);
      });
      if (row) { row.status = 'resolved'; syncAlertIndicators(); }
    }
    closeSOSDrawer();
    if (eventId) {
      authFetch('/api/sos/' + encodeURIComponent(eventId) + '/resolve', {
        method: 'POST'
      })
        .then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return loadActiveSos();
        })
        .catch(function (err) {
          console.warn('[AqOne] Resolve not delivered:', err.message);
          showToast('Not delivered', 'The incident may reappear until the backend is updated.', true);
        });
    }
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

  function updateAiMapKey() {
    var key = document.getElementById('ai-map-key');
    if (!key) return;
    key.style.display = 'none';
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

    // The response carries two contour sets. `prediction.contours` is the raw
    // Monte Carlo output - the prior, which never changes. `payload.contours`
    // is computed from the posterior grid and therefore reflects any sectors
    // already searched and eliminated.
    //
    // We previously drew the prior, which meant a dispatcher could report "we
    // searched here, nothing found", the posterior would correctly update in
    // the database, and the map would carry on showing the original search
    // area. The whole point of Bayesian re-tasking was invisible.
    var contours = (payload && payload.contours && payload.contours.length)
      ? payload.contours
      : (prediction && prediction.contours);

    if (!contours || !contours.length) {
      if (metaEl) metaEl.textContent = 'No drift contours available for the selected incident.';
      return;
    }

    var contourBounds = L.latLngBounds([]);

    contours.forEach(function (feature) {
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
          // The incident id is named in the tooltip so a large red polygon can
          // never be mistaken for a live emergency. These are replayed
          // synthetic incidents; the map should say so where someone hovers.
          lyr.bindTooltip(
            contourLabel +
            (incident ? ' · replayed incident #' + incident.id + (incident.is_synthetic ? ' (synthetic)' : '') : ''),
            {
              sticky: true,
              direction: 'center',
              className: 'drift-incident-label'
            }
          );
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

    // Sectors already searched, drawn as hatched grey boxes. Seeing where has
    // been eliminated is half the value of a probability map - otherwise the
    // dispatcher cannot tell which part of the remaining area is new.
    //
    // Sector bounds arrive in metres relative to the posterior grid's origin,
    // so they are converted back on the same local tangent plane the backend
    // used (see KM_PER_DEG_LAT in backend/app/ai/drift.py).
    var grid = payload && payload.posterior_grid;
    var origin = grid && grid.origin;
    var sectors = (payload && payload.search_sectors) || [];
    if (origin && sectors.length) {
      var mPerDegLat = 110574.0;
      var mPerDegLon = 111320.0 * Math.cos(origin.lat * Math.PI / 180);
      sectors.forEach(function (sector) {
        var south = origin.lat + sector.y_min_m / mPerDegLat;
        var north = origin.lat + sector.y_max_m / mPerDegLat;
        var west = origin.lon + sector.x_min_m / mPerDegLon;
        var east = origin.lon + sector.x_max_m / mPerDegLon;
        var box = L.rectangle([[south, west], [north, east]], {
          pane: 'aiContoursPane',
          color: '#94a3b8',
          weight: 1.5,
          opacity: 0.9,
          fillColor: '#64748b',
          fillOpacity: 0.22,
          dashArray: '4 4'
        }).addTo(aiContoursLayer);
        var pod = typeof sector.detection_probability === 'number'
          ? Math.round(sector.detection_probability * 100) + '% detection probability'
          : 'searched';
        box.bindTooltip('Searched — ' + pod, {
          sticky: true,
          direction: 'center',
          className: 'drift-incident-label'
        });
      });
    }

    if (contourBounds.isValid()) {
      map.fitBounds(contourBounds.pad(0.12), { animate: true, duration: 0.9, maxZoom: 14 });
    }

    if (metaEl && incident) {
      var incidentTime = incident.last_contact_at ? new Date(incident.last_contact_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '--';

      // These four came down the wire on every request and were thrown away.
      // They are what turns a coloured blob into a forecast a dispatcher can
      // reason about - and, in the case of the current source, they are how we
      // stay honest on stage about which parts are real.
      var bits = [];

      if (prediction && prediction.object_class) {
        bits.push('Drift class: <strong>' + _escHtml(String(prediction.object_class).replace(/_/g, ' ')) + '</strong>');
      }

      // Share of particles whose current came from real buoy observations
      // rather than the synthetic fallback field. 0% is not a failure - it is
      // the truthful state until buoys are in the water - so it is labelled
      // rather than hidden.
      if (typeof payload.observation_fraction === 'number') {
        var pct = Math.round(payload.observation_fraction * 100);
        bits.push(
          pct > 0
            ? 'Currents: <strong>' + pct + '% from buoy observations</strong>'
            : 'Currents: <strong>simulated</strong> (no buoy observations yet)'
        );
      }

      if (prediction && prediction.wind_source) {
        bits.push('Wind: ' + _escHtml(prediction.wind_source) +
          (prediction.degraded ? ' <span class="drift-degraded">(degraded — live wind unavailable)</span>' : ''));
      }

      var searched = (payload && payload.search_sectors) || [];
      if (searched.length) {
        bits.push('<strong>' + searched.length + '</strong> sector' + (searched.length === 1 ? '' : 's') +
          ' searched — contours show the updated posterior');
      }

      metaEl.innerHTML =
        (incident.is_synthetic
          ? '<span class="drift-replay-badge">REPLAY — SYNTHETIC INCIDENT</span><br>'
          : '') +
        '<strong>Incident #' + incident.id + '</strong> · Vessel ' + _escHtml(incident.vessel_id) + '<br>' +
        'Last contact: ' + incidentTime + ' · ' + _escHtml(incident.abnormal_reason || 'unknown') + '<br>' +
        (bits.length ? bits.join(' · ') + '<br>' : '') +
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
    updateSquallLegendVisibility();
  }

  function updateSquallLegendVisibility() {
    var legend = document.getElementById('ai-trace-legend');
    if (!legend) return;
    var hasContent = legend.children.length > 0;
    legend.style.display = hasContent ? '' : 'none';
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
        return loadSquallTrace(squallResult.value || { detections: [] }).then(updateSquallLegendVisibility);
      }
      renderSquallWatch({ detections: [] }, []);
      updateSquallLegendVisibility();
      return incidentPromise;
    }).catch(function () {
      renderRiskFeed([]);
      renderDriftIncidentList([]);
      clearAiDriftLayers();
      clearAiSquallLayers();
      renderSquallWatch({ detections: [] }, []);
      updateSquallLegendVisibility();
    });

    if (aiRefreshTimer) clearInterval(aiRefreshTimer);
    aiRefreshTimer = setInterval(function () {
      aiFetchJson('/api/ai/anomaly/active').then(renderRiskFeed).catch(function () { renderRiskFeed([]); });
      aiFetchJson('/api/ai/squall/current').then(loadSquallTrace).then(updateSquallLegendVisibility).catch(function () { clearAiSquallLayers(); renderSquallWatch({ detections: [] }, []); updateSquallLegendVisibility(); });
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
