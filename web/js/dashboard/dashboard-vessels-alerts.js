(function (ns) {
  'use strict';
  if (!ns.ready) return;
  var escapeHtml = ns.escapeHtml;
  var alertBadge = ns.alertBadge;
  var map = ns.map;
  var vesselLayer = ns.vesselLayer;
  var createMarkerIcon = ns.createMarkerIcon;
  var createOverdueIcon = ns.createOverdueIcon;
  var makePopup = ns.makePopup;

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
      if (data) ns.openIncidentDrawer(data, marker);
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
          if (data) ns.openIncidentDrawer(data, null);
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
          ns.openIncidentDrawer(a.drawerData, ns.liveSosMarkers[a.sosEventId] || null);
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
  const sosStatusEl = document.getElementById('stats-sos-status');
  if (bannerCountEl) bannerCountEl.textContent = activeAlertCount;
  if (sosStatusEl) {
    sosStatusEl.textContent = activeAlertCount ? 'ACTION NEEDED' : 'ALL CLEAR';
    sosStatusEl.className = 'metric-status metric-status-' + (activeAlertCount ? 'danger' : 'clear');
  }
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
    const sosStatus = document.getElementById('stats-sos-status');
    if (alertBadge) alertBadge.textContent = activeCount;
    if (bannerCountEl) bannerCountEl.textContent = activeCount;
    if (sosStatus) {
      sosStatus.textContent = activeCount ? 'ACTION NEEDED' : 'ALL CLEAR';
      sosStatus.className = 'metric-status metric-status-' + (activeCount ? 'danger' : 'clear');
    }
    if (liveBanner) liveBanner.classList.toggle('has-alerts', activeCount > 0);
    renderAlerts();
  }

  ns.vessels = vessels;
  ns.vesselStatusBadge = vesselStatusBadge;
  ns.overdueVessels = overdueVessels;
  ns.overdueDrawerData = overdueDrawerData;
  ns.vesselMarkers = vesselMarkers;
  ns.activeVessels = activeVessels;
  ns.renderVessels = renderVessels;
  ns.vesselFilters = vesselFilters;
  ns.overdueCount = overdueCount;
  ns.alertData = alertData;
  ns.liveAlerts = liveAlerts;
  ns.allAlerts = allAlerts;
  ns.alertIcon = alertIcon;
  ns.alertStatusPill = alertStatusPill;
  ns.confidenceColor = confidenceColor;
  ns.alertConfidenceRow = alertConfidenceRow;
  ns.renderAlerts = renderAlerts;
  ns.activeAlertCount = activeAlertCount;
  ns.liveBanner = liveBanner;
  ns.bannerCountEl = bannerCountEl;
  ns.squallCountEl = squallCountEl;
  ns.syncAlertIndicators = syncAlertIndicators;

})(window.AqOneDashboard = window.AqOneDashboard || {});
