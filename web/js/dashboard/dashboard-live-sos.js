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

  // ===== LIVE SOS FEED =====
  //
  // The dashboard previously rendered only the hardcoded demo rows above, so a
  // real distress call could sit in the database while the screen showed three
  // fictional vessels. This is the path that makes a pressed button visible.
  //
  // Polling rather than SSE: /api/sos/active already exists and needs no
  // reconnect logic. Three seconds keeps the LGU screen feeling live, and a
  // missed poll self-heals on the next tick.
  const LIVE_SOS_POLL_MS = 3000;
  const liveSosLayer = L.layerGroup().addTo(map);
  const liveSosMarkers = {};
  let liveSosFirstLoad = true;
  let knownSosIds = Object.create(null);


  // ===== FEED FRESHNESS (LIVE / STALE / OFFLINE) =====
  //
  // Previously the "LIVE" badge in the header was static markup - it read
  // LIVE even while loadActiveSos() had been failing silently, and the "Last
  // updated" banner text was an independent 30-second counter with no
  // connection to whether a poll had actually succeeded. Both were fake
  // operational state (Hard Reset rule 4). This tracks the one fact that
  // matters - when a poll last actually succeeded - and both indicators are
  // now driven from it.
  let lastSosSuccessMs = null;
  const syncStatusEl = document.getElementById('sync-status');
  const syncTextEl = document.getElementById('sync-text');
  const bannerTimeEl = document.querySelector('.banner-time');

  function updateSyncStatus() {
    const state = classifyFreshness(lastSosSuccessMs, Date.now(), {
      pollIntervalMs: LIVE_SOS_POLL_MS
    });

    if (syncStatusEl) {
      syncStatusEl.classList.toggle('is-stale', state === 'stale');
      syncStatusEl.classList.toggle('is-offline', state === 'offline');
    }
    if (syncTextEl) {
      syncTextEl.textContent = freshnessLabel(state);
    }
    if (syncStatusEl) {
      syncStatusEl.title = lastSosSuccessMs == null
        ? 'The live SOS feed has not loaded successfully yet'
        : 'Live SOS feed last refreshed ' + Math.max(0, Math.round((Date.now() - lastSosSuccessMs) / 1000)) + 's ago';
    }
    if (bannerTimeEl) {
      bannerTimeEl.textContent = lastSosSuccessMs == null
        ? 'never'
        : Math.max(0, Math.round((Date.now() - lastSosSuccessMs) / 1000)) + 's ago';
    }
  }

  updateSyncStatus();
  // Ticks independently of the poll interval so STALE/OFFLINE appears
  // promptly even between polls, instead of only updating when a poll
  // happens to run.
  setInterval(updateSyncStatus, 1000);

  function liveSosIcon() {
    return L.divIcon({
      className: 'live-sos-marker',
      html: '<span class="live-sos-pulse"></span><span class="live-sos-core">SOS</span>',
      iconSize: [28, 28],
      iconAnchor: [14, 14]
    });
  }

  function relativeTime(iso) {
    const then = new Date(iso).getTime();
    if (!isFinite(then)) return 'unknown time';
    const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
    if (secs < 60) return secs + ' seconds ago';
    const mins = Math.floor(secs / 60);
    if (mins < 60) return mins + (mins === 1 ? ' minute ago' : ' minutes ago');
    const hrs = Math.floor(mins / 60);
    return hrs + (hrs === 1 ? ' hour ' : ' hours ') + (mins % 60) + ' minutes ago';
  }

  // How the SOS reached us, stated plainly. The dispatcher needs to know
  // whether the mesh carried this or whether the handset had signal, because
  // it changes what they can assume about the vessel's situation.
  function deliveryPath(ev) {
    const paths = [];
    if (ev.delivered_via_buoy) paths.push('LoRa mesh' + (ev.buoy_id ? ' via ' + ev.buoy_id : ''));
    if (ev.delivered_direct) paths.push('direct internet');
    if (!paths.length) return 'Path unrecorded';
    return paths.join(' + ');
  }

  function sosPosition(ev) {
    if (typeof ev.latitude !== 'number' || typeof ev.longitude !== 'number') {
      return 'No GPS fix reported';
    }
    return ev.latitude.toFixed(4) + '° N, ' + ev.longitude.toFixed(4) + '° E';
  }

  function liveAlertFromEvent(ev) {
    const boat = ev.boat || ev.vessel_id || 'Unidentified vessel';
    const hasFix = typeof ev.latitude === 'number' && typeof ev.longitude === 'number';
    const alert = {
      isLive: true,
      sosEventId: ev.id,
      type: 'sos',
      desc: 'SOS — ' + boat + (ev.note ? ' — “' + ev.note + '”' : ''),
      time: relativeTime(ev.created_at),
      lat: hasFix ? Number(ev.latitude.toFixed(4)) : null,
      lng: hasFix ? Number(ev.longitude.toFixed(4)) : null,
      status: ev.acknowledged_at ? 'acknowledged' : 'active',
      vesselId: ev.vessel_id || null,
      confidence: null,
      stage: 'DISTRESS CALL — ' + deliveryPath(ev)
    };
    alert.drawerData = {
      alertType: 'sos',
      headerText: 'SOS — DISTRESS CALL RECEIVED',
      sosEventId: ev.id,
      vesselId: ev.vessel_id || 'Unknown',
      owner: boat,
      position: sosPosition(ev),
      lat: alert.lat,
      lng: alert.lng,
      buoy: ev.buoy_id || 'Not relayed by a buoy',
      coverage: deliveryPath(ev) + (ev.trust_tier ? ' · trust tier ' + ev.trust_tier : ''),
      confidence: null,
      stage: 'DISTRESS CALL — human pressed the button',
      nextContact: ev.note || 'No message attached',
      timerBaseline: Math.max(0, Math.floor((Date.now() - new Date(ev.created_at).getTime()) / 1000))
    };
    return alert;
  }

  function syncLiveSosMarkers() {
    const seen = Object.create(null);
    liveAlerts.forEach(function (a) {
      if (a.lat == null || a.lng == null) return;
      seen[a.sosEventId] = true;
      let marker = liveSosMarkers[a.sosEventId];
      if (!marker) {
        marker = L.marker([a.lat, a.lng], { icon: liveSosIcon(), zIndexOffset: 1000 });
        // Leaflet renders tooltip content as innerHTML, not textContent - see
        // https://leafletjs.com/reference.html#tooltip. a.desc carries the
        // fisher's own note text, so it must be escaped here too.
        marker.bindTooltip(escapeHtml(a.desc), { direction: 'top', offset: [0, -14] });
        liveSosLayer.addLayer(marker);
        liveSosMarkers[a.sosEventId] = marker;
      } else {
        marker.setLatLng([a.lat, a.lng]);
      }
      marker.off('click');
      marker.on('click', function () { openIncidentDrawer(a.drawerData, marker); });
    });

    // Acknowledged events leave /active, so their markers must go too.
    Object.keys(liveSosMarkers).forEach(function (id) {
      if (!seen[id]) {
        liveSosLayer.removeLayer(liveSosMarkers[id]);
        delete liveSosMarkers[id];
      }
    });
  }

  function loadActiveSos() {
    return authFetch('/api/sos/active')
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        const events = (data && data.events) || [];
        liveAlerts = events.map(liveAlertFromEvent);

        // Announce genuinely new calls, but never on the first load - a
        // dispatcher opening the dashboard should not be hit with a klaxon for
        // events they already handled before the page refreshed.
        if (!liveSosFirstLoad) {
          events.forEach(function (ev) {
            if (!knownSosIds[ev.id]) {
              showToast(
                'SOS received',
                (ev.boat || ev.vessel_id || 'A vessel') + ' · ' + sosPosition(ev),
                true
              );
            }
          });
        }
        knownSosIds = Object.create(null);
        events.forEach(function (ev) { knownSosIds[ev.id] = true; });
        liveSosFirstLoad = false;

        // The one fact updateSyncStatus() needs: this poll actually
        // succeeded, right now. Everything the LIVE/STALE/OFFLINE indicator
        // shows is derived from this single timestamp.
        lastSosSuccessMs = Date.now();
        updateSyncStatus();

        syncLiveSosMarkers();
        syncAlertIndicators();
        renderIncidentFeed();
      })
      .catch(function (err) {
        // A failed poll must not blank the list. The last known set of live
        // alerts stays on screen rather than a distress call silently
        // vanishing because one request timed out. It must, however, be
        // visible in the sync indicator - updateSyncStatus() will move to
        // STALE/OFFLINE on its own once enough time has passed without a
        // fresh lastSosSuccessMs, which this call makes immediate instead of
        // waiting up to a second for the next tick.
        console.warn('[AqOne] Live SOS poll failed:', err.message);
        updateSyncStatus();
      });
  }

  loadActiveSos();
  setInterval(loadActiveSos, LIVE_SOS_POLL_MS);

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

})(window.AqOneDashboard = window.AqOneDashboard || {});
