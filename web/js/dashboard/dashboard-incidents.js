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

})(window.AqOneDashboard = window.AqOneDashboard || {});
