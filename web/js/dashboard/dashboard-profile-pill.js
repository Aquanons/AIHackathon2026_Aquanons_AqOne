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


  // TODO(luna): no matching DOM elements found in dashboard.html — appears unreachable, confirm with Lenard
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
  ns.aiContoursLayer = aiContoursLayer;
  ns.aiSquallLayer = aiSquallLayer;
  ns.aiRefreshTimer = aiRefreshTimer;
  ns.aiColors = aiColors;
  ns.aiFetchJson = aiFetchJson;
  ns.aiStatusClass = aiStatusClass;
  ns.aiRiskPriority = aiRiskPriority;
  ns.clearAiDriftLayers = clearAiDriftLayers;
  ns.clearAiSquallLayers = clearAiSquallLayers;
  ns.updateAiMapKey = updateAiMapKey;
  ns.updateSquallBanner = updateSquallBanner;
  ns.renderDriftContours = renderDriftContours;
  ns.renderDriftIncidentList = renderDriftIncidentList;
  ns.renderRiskFeed = renderRiskFeed;
  ns.renderSquallChart = renderSquallChart;
  ns.updateSquallLegendVisibility = updateSquallLegendVisibility;
  ns.renderSquallWatch = renderSquallWatch;
  ns.loadDriftIncidentDetail = loadDriftIncidentDetail;
  ns.loadSquallTrace = loadSquallTrace;
  ns.initAIOperations = initAIOperations;
  ns.userProfilePill = userProfilePill;
  ns.btnExport = btnExport;
  ns.hideLoadingOverlay = hideLoadingOverlay;

})(window.AqOneDashboard = window.AqOneDashboard || {});
