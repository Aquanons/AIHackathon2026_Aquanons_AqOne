(function (ns) {
  'use strict';
  if (!ns.ready) return;
  var authFetch = ns.authFetch;
  var showToast = ns.showToast;
  var tripChecksListHtml = ns.tripChecksListHtml;

  // ===== TRIP CHECKS (docs/38_AUTOMATIC_DISTRESS_DETECTION_IMPLEMENTATION_PLAN.md Phase 3) =====
  //
  // A separate queue from the SOS "Alerts" tab on purpose - a trip check is a
  // confidence-scored review candidate from routine buoy contact, never an
  // SOS and never an automatic dispatch. Reuses the exact fetch/poll/action
  // idiom dashboard-live-sos.js and dashboard-incidents.js already use for
  // the SOS feed, per the plan's "reuse the current fetch helpers and action
  // pattern; do not build WebSockets or a second dashboard".
  const TRIP_CHECKS_POLL_MS = 15000;

  const tripChecksListEl = document.getElementById('trip-checks-list');
  const tripChecksBadgeEl = document.getElementById('badge-tripchecks');

  function renderTripChecks(cases) {
    if (tripChecksListEl) tripChecksListEl.innerHTML = tripChecksListHtml(cases);
    if (tripChecksBadgeEl) tripChecksBadgeEl.textContent = cases.length;
  }

  function loadOpenCases() {
    return authFetch('/api/ai/anomaly/cases/open')
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (cases) {
        renderTripChecks(Array.isArray(cases) ? cases : []);
      })
      .catch(function (err) {
        // A failed poll must not blank an already-rendered queue - same
        // fail-safe direction as loadActiveSos() for the SOS feed.
        console.warn('[AqOne] Trip checks poll failed:', err);
      });
  }

  function postCaseAction(caseId, action, body) {
    return authFetch('/api/ai/anomaly/cases/' + encodeURIComponent(caseId) + '/' + action, {
      method: 'POST',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined
    }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    });
  }

  const ACTION_LABELS = {
    acknowledge: 'Acknowledge',
    dismiss: 'Dismiss',
    escalate: 'Escalate',
    resolve: 'Resolve'
  };

  if (tripChecksListEl) {
    tripChecksListEl.addEventListener('click', function (event) {
      const button = event.target.closest('[data-case-action]');
      if (!button || button.disabled) return;
      const action = button.getAttribute('data-case-action');
      const caseId = button.getAttribute('data-case-id');
      if (!action || !caseId) return;

      let body = null;
      if (action === 'dismiss' || action === 'escalate') {
        const reason = window.prompt(ACTION_LABELS[action] + ' - reason:');
        if (reason == null) return; // cancelled
        const trimmed = reason.trim();
        if (!trimmed) {
          showToast('Reason required', ACTION_LABELS[action] + ' needs a short reason.', true);
          return;
        }
        body = { reason: trimmed };
      }

      button.disabled = true;
      postCaseAction(caseId, action, body)
        // Re-poll rather than mutate locally, matching dashboard-incidents.js -
        // the server's own row, not a guessed one, and it must still be there
        // after a reload.
        .then(function () { return loadOpenCases(); })
        .catch(function (err) {
          showToast('Not delivered', 'The trip check is unchanged until this succeeds.', true);
          console.warn('[AqOne] Trip check action failed:', err);
        })
        .finally(function () {
          button.disabled = false;
        });
    });
  }

  loadOpenCases();
  setInterval(loadOpenCases, TRIP_CHECKS_POLL_MS);

  ns.loadOpenCases = loadOpenCases;

})(window.AqOneDashboard = window.AqOneDashboard || {});
