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
  ns.wcBody = wcBody;
  ns.WConditions_INTERVAL_MS = WConditions_INTERVAL_MS;
  ns.WEATHER_CACHE_KEY = WEATHER_CACHE_KEY;
  ns.SAFETY_THRESHOLDS = SAFETY_THRESHOLDS;
  ns.SAFETY_TIERS = SAFETY_TIERS;
  ns.classifySafety = classifySafety;
  ns.degToCompass = degToCompass;
  ns.WMO_MAP = WMO_MAP;
  ns.wmoIcon = wmoIcon;
  ns.safetyBadgeHTML = safetyBadgeHTML;
  ns.renderWeatherCard = renderWeatherCard;
  ns.renderForecast = renderForecast;
  ns.renderRainfall = renderRainfall;
  ns.fetchLiveJson = fetchLiveJson;
  ns.readWeatherCache = readWeatherCache;
  ns.writeWeatherCache = writeWeatherCache;
  ns.forecastTimeLabel = forecastTimeLabel;
  ns.buildForecastAlerts = buildForecastAlerts;
  ns.replaceForecastAlerts = replaceForecastAlerts;
  ns.displayWeatherSnapshot = displayWeatherSnapshot;
  ns.fetchWeatherData = fetchWeatherData;
  ns.emergencyOverlay = emergencyOverlay;
  ns.emergencyClose = emergencyClose;
  ns.emergencyBtn = emergencyBtn;
  ns.openEmergencyModal = openEmergencyModal;
  ns.closeEmergencyModal = closeEmergencyModal;
  ns.advisoryPanelClose = advisoryPanelClose;
  ns.advisoryListEl = advisoryListEl;
  ns.btnCreateAdvisory = btnCreateAdvisory;
  ns.advisoryOverlay = advisoryOverlay;
  ns.advisoryModalClose = advisoryModalClose;
  ns.advBtnCancel = advBtnCancel;
  ns.advBtnSave = advBtnSave;
  ns.advisoryModalTitle = advisoryModalTitle;
  ns.advTitleInput = advTitleInput;
  ns.advCategorySelect = advCategorySelect;
  ns.advDescriptionInput = advDescriptionInput;
  ns.advMunicipalitySelect = advMunicipalitySelect;
  ns.advPrioritySelect = advPrioritySelect;
  ns.advPublishDateInput = advPublishDateInput;
  ns.advExpirationDateInput = advExpirationDateInput;
  ns.advCoverImageInput = advCoverImageInput;
  ns.advStatusSelect = advStatusSelect;
  ns.advTitleError = advTitleError;
  ns.advDescriptionError = advDescriptionError;
  ns.advMunicipalityError = advMunicipalityError;
  ns.deleteOverlay = deleteOverlay;
  ns.deleteClose = deleteClose;
  ns.deleteCancelBtn = deleteCancelBtn;
  ns.deleteConfirmBtn = deleteConfirmBtn;
  ns.deleteNameEl = deleteNameEl;
  ns.editingAdvisoryId = editingAdvisoryId;
  ns.deletingAdvisoryId = deletingAdvisoryId;
  ns.clearAdvisoryErrors = clearAdvisoryErrors;
  ns.validateAdvisoryForm = validateAdvisoryForm;
  ns.resetAdvisoryForm = resetAdvisoryForm;
  ns.openAdvisoryModal = openAdvisoryModal;
  ns.closeAdvisoryModal = closeAdvisoryModal;
  ns.renderAdvisoryList = renderAdvisoryList;
  ns._escHtml = _escHtml;
  ns.closeDeleteModal = closeDeleteModal;
  ns.seaConditionCurrent = seaConditionCurrent;
  ns.seaConditionSetBtn = seaConditionSetBtn;
  ns.seaConditionReason = seaConditionReason;
  ns.seaConditionSelectedStatus = seaConditionSelectedStatus;
  ns.SEA_STATUS_COLORS = SEA_STATUS_COLORS;
  ns.formatSeaConditionTime = formatSeaConditionTime;
  ns.fetchSeaCondition = fetchSeaCondition;
  ns.renderSeaCondition = renderSeaCondition;

})(window.AqOneDashboard = window.AqOneDashboard || {});
