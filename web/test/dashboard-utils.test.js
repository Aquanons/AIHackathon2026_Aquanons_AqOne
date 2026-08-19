'use strict';

// node --test web/test/dashboard-utils.test.js
//
// Covers docs/20_WEEK_1_DASHBOARD_FLUTTER_IMPLEMENTATION_PLAN.md Phase 3's
// required test surface: escaping, fresh/stale/offline transitions, and
// synthetic/demo badges. Requires web/js/dashboard-utils.js directly (its
// UMD wrapper exports via module.exports under Node), so this exercises the
// exact same code dashboard.html loads in the browser - not a reimplementation.

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  escapeHtml,
  classifyFreshness,
  freshnessLabel,
  alertBadge
} = require('../js/dashboard-utils.js');

test('escapeHtml', async (t) => {
  await t.test('escapes the five HTML-significant characters', () => {
    assert.equal(
      escapeHtml(`<script>alert('x')</script> & "quoted"`),
      '&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt; &amp; &quot;quoted&quot;'
    );
  });

  await t.test('escapes an SOS note carrying an injected tag, per the plan\'s XSS scenario', () => {
    // The exact shape of the bug this closes: a fisher's free-text note
    // rendered straight into innerHTML by web/js/dashboard.js
    // liveAlertFromEvent()/renderAlerts().
    const note = '<img src=x onerror=alert(1)>';
    const escaped = escapeHtml(note);
    assert.ok(!escaped.includes('<img'));
    assert.equal(escaped, '&lt;img src=x onerror=alert(1)&gt;');
  });

  await t.test('turns null/undefined into an empty string, not the word "null"', () => {
    assert.equal(escapeHtml(null), '');
    assert.equal(escapeHtml(undefined), '');
  });

  await t.test('leaves ordinary text untouched', () => {
    assert.equal(escapeHtml('engine down, taking water'), 'engine down, taking water');
  });

  await t.test('coerces non-string input (e.g. a number) to text first', () => {
    assert.equal(escapeHtml(42), '42');
  });
});

test('classifyFreshness', async (t) => {
  const POLL_MS = 3000; // matches LIVE_SOS_POLL_MS in web/js/dashboard.js

  await t.test('is offline before any poll has ever succeeded', () => {
    assert.equal(classifyFreshness(null, Date.now(), { pollIntervalMs: POLL_MS }), 'offline');
    assert.equal(classifyFreshness(undefined, Date.now(), { pollIntervalMs: POLL_MS }), 'offline');
  });

  await t.test('is live immediately after a successful poll', () => {
    const now = 1_000_000;
    assert.equal(classifyFreshness(now, now, { pollIntervalMs: POLL_MS }), 'live');
  });

  await t.test('stays live within the stale threshold (3 missed polls)', () => {
    const now = 1_000_000;
    const lastSuccess = now - POLL_MS * 2;
    assert.equal(classifyFreshness(lastSuccess, now, { pollIntervalMs: POLL_MS }), 'live');
  });

  await t.test('becomes stale after missing several polls, before offline', () => {
    const now = 1_000_000;
    const lastSuccess = now - POLL_MS * 5;
    assert.equal(classifyFreshness(lastSuccess, now, { pollIntervalMs: POLL_MS }), 'stale');
  });

  await t.test('becomes offline once far too much time has passed', () => {
    const now = 1_000_000;
    const lastSuccess = now - POLL_MS * 20;
    assert.equal(classifyFreshness(lastSuccess, now, { pollIntervalMs: POLL_MS }), 'offline');
  });

  await t.test('transitions live -> stale -> offline as time passes with no new success', () => {
    const lastSuccess = 0;
    const pollOpts = { pollIntervalMs: POLL_MS };
    assert.equal(classifyFreshness(lastSuccess, 0, pollOpts), 'live');
    assert.equal(classifyFreshness(lastSuccess, POLL_MS * 3, pollOpts), 'live');
    assert.equal(classifyFreshness(lastSuccess, POLL_MS * 5, pollOpts), 'stale');
    // offlineAfterMs defaults to pollIntervalMs * 10 and the boundary itself
    // is still "stale" (age <= offlineAfterMs); one tick past it is offline.
    assert.equal(classifyFreshness(lastSuccess, POLL_MS * 10 + 1, pollOpts), 'offline');
  });

  await t.test('a fresh success immediately pulls the state back to live from offline', () => {
    const pollOpts = { pollIntervalMs: POLL_MS };
    // Was offline (no success in a long time)...
    assert.equal(classifyFreshness(0, POLL_MS * 20, pollOpts), 'offline');
    // ...then a poll succeeds "now" - must read live again, not stay offline.
    const now = POLL_MS * 20;
    assert.equal(classifyFreshness(now, now, pollOpts), 'live');
  });

  await t.test('does not crash on clock skew (lastSuccess after now)', () => {
    const now = 1000;
    assert.equal(classifyFreshness(now + 5000, now, { pollIntervalMs: POLL_MS }), 'live');
  });

  await t.test('respects custom thresholds when given', () => {
    const now = 100000;
    const opts = { pollIntervalMs: POLL_MS, staleAfterMs: 1000, offlineAfterMs: 2000 };
    assert.equal(classifyFreshness(now - 500, now, opts), 'live');
    assert.equal(classifyFreshness(now - 1500, now, opts), 'stale');
    assert.equal(classifyFreshness(now - 3000, now, opts), 'offline');
  });
});

test('freshnessLabel', () => {
  assert.equal(freshnessLabel('live'), 'LIVE');
  assert.equal(freshnessLabel('stale'), 'STALE');
  assert.equal(freshnessLabel('offline'), 'OFFLINE');
  // An unrecognised state must fail safe to the most cautious label, never
  // silently claim LIVE.
  assert.equal(freshnessLabel('nonsense'), 'OFFLINE');
  assert.equal(freshnessLabel(undefined), 'OFFLINE');
});

test('alertBadge (synthetic/demo vs. live incident-feed badges)', async (t) => {
  await t.test('a real SOS event gets the LIVE badge', () => {
    const badge = alertBadge(true);
    assert.equal(badge.text, 'LIVE');
    assert.equal(badge.cssClass, 'alert-live-badge');
  });

  await t.test('a scripted/sample row gets the DEMO badge, never LIVE', () => {
    const badge = alertBadge(false);
    assert.equal(badge.text, 'DEMO');
    assert.equal(badge.cssClass, 'alert-demo-badge');
    assert.notEqual(badge.text, 'LIVE');
  });

  await t.test('undefined isLive (e.g. a malformed row) is treated as demo, not live', () => {
    // Fail-safe direction matters: an ambiguous row must never default to
    // looking like a real distress call.
    const badge = alertBadge(undefined);
    assert.equal(badge.text, 'DEMO');
  });
});
