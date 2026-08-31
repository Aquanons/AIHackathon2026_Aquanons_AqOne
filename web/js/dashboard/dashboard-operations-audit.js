(function (ns) {
  'use strict';
  if (!ns.ready) return;
  var authFetch = ns.authFetch;
  var showToast = ns.showToast;
  var auditTimelineHtml = ns.auditTimelineHtml;
  var CURRENT_USER = ns.CURRENT_USER;
  var closePanel = ns.closePanel;

  // docs/41_OPERATIONS_CONSOLE_AUDITABILITY_IMPLEMENTATION_PLAN.md Phase 4.

  // ===== CASE ACTIVITY DRAWER (any responder role) =====
  var activityDrawer = document.getElementById('activity-drawer');
  var activityDrawerTitle = document.getElementById('activity-drawer-title');
  var activityDrawerClose = document.getElementById('activity-drawer-close');
  var activityDrawerContent = document.getElementById('activity-drawer-content');
  var activityDrawerUnavailable = document.getElementById('activity-drawer-unavailable');

  function closeActivityDrawer() {
    if (activityDrawer) activityDrawer.classList.remove('open');
  }

  // Opened from the SOS drawer's "View Activity" button, a trip-check row,
  // or the drift case card - reads the authorized timeline for exactly one
  // case, never a bulk cross-case listing (that is the admin-only panel
  // below). A fetch failure only marks this one panel unavailable - it must
  // never touch the SOS feed's own LIVE/STALE/OFFLINE freshness or imply
  // that the case itself changed state (plan item 5).
  function openActivityDrawer(resourceType, resourceId, title) {
    if (!activityDrawer || !activityDrawerContent) return;
    activityDrawerTitle.textContent = title || 'Case Activity';
    activityDrawerContent.innerHTML = '<div class="audit-timeline-loading">Loading…</div>';
    if (activityDrawerUnavailable) activityDrawerUnavailable.hidden = true;
    activityDrawer.classList.add('open');

    authFetch(
      '/api/ops/cases/' + encodeURIComponent(resourceType) + '/' +
      encodeURIComponent(resourceId) + '/timeline'
    )
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        activityDrawerContent.innerHTML = auditTimelineHtml(data.events);
      })
      .catch(function (err) {
        console.warn('[AqOne] Case timeline unavailable:', err.message);
        activityDrawerContent.innerHTML = '';
        if (activityDrawerUnavailable) activityDrawerUnavailable.hidden = false;
      });
  }

  if (activityDrawerClose) activityDrawerClose.addEventListener('click', closeActivityDrawer);

  // ===== ADMIN-ONLY GLOBAL AUDIT SEARCH / EXPORT =====
  var railBtnAudit = document.getElementById('rail-btn-audit');
  var auditPanelClose = document.getElementById('audit-panel-close');
  var auditFilterForm = document.getElementById('audit-filter-form');
  var auditFilterActorEmail = document.getElementById('audit-filter-actor-email');
  var auditFilterAction = document.getElementById('audit-filter-action');
  var auditFilterResourceType = document.getElementById('audit-filter-resource-type');
  var auditFilterDateFrom = document.getElementById('audit-filter-date-from');
  var auditFilterDateTo = document.getElementById('audit-filter-date-to');
  var auditResultsEl = document.getElementById('audit-results');
  var auditErrorEl = document.getElementById('audit-error');
  var auditAppliedFiltersEl = document.getElementById('audit-applied-filters');
  var auditLoadMoreBtn = document.getElementById('audit-load-more-btn');
  var auditExportCsvBtn = document.getElementById('audit-export-csv-btn');
  var auditExportJsonBtn = document.getElementById('audit-export-json-btn');

  var auditEvents = [];
  var auditNextCursor = null;

  // Omitted entirely for every role but admin, not merely disabled - a
  // non-admin never sees an empty but tempting control (plan item 3).
  if (CURRENT_USER && CURRENT_USER.role === 'admin' && railBtnAudit) {
    railBtnAudit.hidden = false;
  }

  function currentAuditFilters() {
    return {
      actor_email: auditFilterActorEmail ? auditFilterActorEmail.value.trim() : '',
      action: auditFilterAction ? auditFilterAction.value.trim() : '',
      resource_type: auditFilterResourceType ? auditFilterResourceType.value : '',
      date_from: auditFilterDateFrom ? auditFilterDateFrom.value : '',
      date_to: auditFilterDateTo ? auditFilterDateTo.value : ''
    };
  }

  function buildAuditQuery(extra) {
    var filters = currentAuditFilters();
    var params = new URLSearchParams();
    Object.keys(filters).forEach(function (key) {
      if (filters[key]) params.set(key, filters[key]);
    });
    if (extra) {
      Object.keys(extra).forEach(function (key) { params.set(key, extra[key]); });
    }
    return params.toString();
  }

  function renderAuditResults() {
    if (auditResultsEl) auditResultsEl.innerHTML = auditTimelineHtml(auditEvents);
    if (auditLoadMoreBtn) auditLoadMoreBtn.hidden = !auditNextCursor;
  }

  function renderAppliedFilters(applied) {
    if (!auditAppliedFiltersEl || !applied) return;
    var parts = [];
    if (applied.actor_email) parts.push('actor: ' + applied.actor_email);
    if (applied.action) parts.push('action: ' + applied.action);
    if (applied.resource_type) parts.push('resource: ' + applied.resource_type);
    if (applied.date_from) parts.push('from: ' + applied.date_from);
    if (applied.date_to) parts.push('to: ' + applied.date_to);
    auditAppliedFiltersEl.textContent = parts.length ? ('Applied filters — ' + parts.join(', ')) : '';
  }

  // Appends on "Load more" rather than replacing - never loads the complete
  // history into the browser at once (plan item 3).
  function fetchAuditPage(cursor) {
    var qs = buildAuditQuery(cursor ? { cursor: cursor } : null);
    if (auditErrorEl) auditErrorEl.hidden = true;

    return authFetch('/api/ops/audit' + (qs ? '?' + qs : ''))
      .then(function (res) {
        if (!res.ok) {
          var err = new Error('HTTP ' + res.status);
          err.status = res.status;
          throw err;
        }
        return res.json();
      })
      .then(function (data) {
        auditEvents = cursor ? auditEvents.concat(data.events || []) : (data.events || []);
        auditNextCursor = data.next_cursor;
        renderAuditResults();
        renderAppliedFilters(data.applied_filters);
      })
      .catch(function (err) {
        console.warn('[AqOne] Audit search failed:', err.message);
        if (auditErrorEl) {
          auditErrorEl.hidden = false;
          // Defensive - the rail button is already hidden for a non-admin,
          // but the server stays the real authority (plan item 3/4).
          auditErrorEl.textContent = err.status === 403
            ? "You don't have permission to view the audit log."
            : 'Audit search unavailable right now.';
        }
      });
  }

  function renderAuditPanel() {
    auditEvents = [];
    auditNextCursor = null;
    fetchAuditPage(null);
  }

  if (auditFilterForm) {
    auditFilterForm.addEventListener('submit', function (event) {
      event.preventDefault();
      renderAuditPanel();
    });
  }

  if (auditLoadMoreBtn) {
    auditLoadMoreBtn.addEventListener('click', function () {
      if (auditNextCursor) fetchAuditPage(auditNextCursor);
    });
  }

  if (auditPanelClose && closePanel) {
    auditPanelClose.addEventListener('click', closePanel);
  }

  // Same Blob/createObjectURL/<a download> technique as the existing
  // client-side "Export Map Snapshot" button (dashboard-profile-pill.js) -
  // here downloading server-returned bytes instead of client-built JSON.
  function downloadAuditExport(format) {
    var qs = buildAuditQuery({ format: format });
    authFetch('/api/ops/audit/export?' + qs)
      .then(function (res) {
        if (!res.ok) {
          var err = new Error('HTTP ' + res.status);
          err.status = res.status;
          throw err;
        }
        return res.blob();
      })
      .then(function (blob) {
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'operations-audit-export.' + format;
        a.click();
        URL.revokeObjectURL(url);
      })
      .catch(function (err) {
        console.warn('[AqOne] Audit export failed:', err.message);
        showToast(
          'Export failed',
          err.status === 403
            ? "You don't have permission to export the audit log."
            : 'The export could not be generated.',
          true
        );
      });
  }

  if (auditExportCsvBtn) {
    auditExportCsvBtn.addEventListener('click', function () { downloadAuditExport('csv'); });
  }
  if (auditExportJsonBtn) {
    auditExportJsonBtn.addEventListener('click', function () { downloadAuditExport('json'); });
  }

  ns.openActivityDrawer = openActivityDrawer;
  ns.renderAuditPanel = renderAuditPanel;

})(window.AqOneDashboard = window.AqOneDashboard || {});
