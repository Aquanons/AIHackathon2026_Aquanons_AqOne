// Pure helpers extracted from dashboard.js so they can be unit tested with
// `node --test` (see web/test/dashboard-utils.test.js) without a browser or
// a DOM. Loaded as a plain <script> in dashboard.html (attaches
// window.AqOneDashboardUtils, matching the window.AqOneDangerZonePredictor
// convention already used in this codebase) and required directly from
// Node for tests via module.exports.
//
// docs/20_WEEK_1_DASHBOARD_FLUTTER_IMPLEMENTATION_PLAN.md Phase 3:
//   - escapeHtml(): server-provided SOS text (boat name, note, buoy id) must
//     never be inserted into innerHTML/tooltips/popups unescaped.
//   - classifyFreshness(): the "LIVE" indicator must be driven by the most
//     recent successful /api/sos/active refresh, not a hardcoded label.
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && typeof module.exports === 'object') {
    module.exports = factory();
  } else {
    root.AqOneDashboardUtils = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * Escapes text for safe insertion into innerHTML, a Leaflet tooltip/popup,
   * or an HTML attribute value. Pure string replacement rather than the
   * DOM-textNode trick (`div.appendChild(document.createTextNode(str))`)
   * used elsewhere in dashboard.js, so this same function runs identically
   * in the browser and under plain `node --test` with no DOM shim.
   *
   * `null`/`undefined` become an empty string rather than the literal text
   * "null" - a distress call with a missing note must render as no note,
   * not as the word "null".
   */
  function escapeHtml(value) {
    if (value == null) {
      return '';
    }
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Classifies how trustworthy the live feed's "LIVE" claim currently is,
   * based only on when a poll last actually succeeded - never on whether a
   * poll is merely in flight.
   *
   * - 'live': a poll succeeded within the last `staleAfterMs`.
   * - 'stale': the feed has succeeded before, but not recently enough to
   *   trust - the mesh or the browser tab may have hung.
   * - 'offline': either no poll has ever succeeded, or it has been so long
   *   that the on-screen data must be treated as unknown, not "live".
   *
   * Defaults follow the plan's polling cadence
   * (LIVE_SOS_POLL_MS = 3000 in dashboard.js): stale after 3 missed polls,
   * offline after 10.
   */
  function classifyFreshness(lastSuccessMs, nowMs, options) {
    var opts = options || {};
    var pollIntervalMs = opts.pollIntervalMs || 3000;
    var staleAfterMs = opts.staleAfterMs || pollIntervalMs * 3;
    var offlineAfterMs = opts.offlineAfterMs || pollIntervalMs * 10;

    if (lastSuccessMs == null || !isFinite(lastSuccessMs)) {
      return 'offline';
    }
    var age = nowMs - lastSuccessMs;
    if (age < 0) {
      // Clock skew or a bad timestamp - treat as freshly successful rather
      // than crashing the indicator into a negative age.
      return 'live';
    }
    if (age <= staleAfterMs) {
      return 'live';
    }
    if (age <= offlineAfterMs) {
      return 'stale';
    }
    return 'offline';
  }

  /**
   * Human-facing copy for each freshness state, so dashboard.js and the
   * tests share one source of truth for the wording instead of the label
   * drifting from the classification logic.
   */
  var FRESHNESS_LABELS = {
    live: 'LIVE',
    stale: 'STALE',
    offline: 'OFFLINE'
  };

  function freshnessLabel(state) {
    return FRESHNESS_LABELS[state] || FRESHNESS_LABELS.offline;
  }

  /**
   * The badge text/CSS class for one incident-feed row, so a scripted
   * sample row (web/js/dashboard.js `alertData`) can never look like a real
   * distress call (`isLive: true`, sourced from `/api/sos/active`) and vice
   * versa. Pulled out of the render template into a pure function so the
   * live/demo distinction itself - not just the escaping around it - is
   * covered by a test, per Phase 3 of
   * docs/20_WEEK_1_DASHBOARD_FLUTTER_IMPLEMENTATION_PLAN.md ("synthetic/demo
   * badges").
   */
  function alertBadge(isLive) {
    return isLive
      ? { text: 'LIVE', cssClass: 'alert-live-badge' }
      : { text: 'DEMO', cssClass: 'alert-demo-badge' };
  }

  return {
    escapeHtml: escapeHtml,
    classifyFreshness: classifyFreshness,
    freshnessLabel: freshnessLabel,
    alertBadge: alertBadge
  };
});
