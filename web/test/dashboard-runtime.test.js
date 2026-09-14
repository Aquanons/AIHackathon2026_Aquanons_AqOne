'use strict';

// node --test web/test/dashboard-runtime.test.js
//
// Runtime regression tests for Phase 1 remediation:
// - F01: HTML sink escaping in actual component renderers (buoy incident feed, sea condition, pin popup)
// - F05: Unsupported broadcast and silent check-in controls are disabled and do not report false success
// - F06: Legacy createAdvisory.html replaces fake localStorage dispatch queue with dashboard redirect
// - F10: System profile renders authenticated identity and does not share origin-wide profile caches between accounts

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { escapeHtml } = require('../js/dashboard-utils.js');
const profileApi = require('../js/profile.js');

// Minimal DOM Element stub for component rendering tests
function createStubElement(tag = 'div', id = '') {
  const children = [];
  const listeners = {};
  const dataset = {};
  const style = {};
  const classList = {
    classes: new Set(),
    add(c) { this.classes.add(c); },
    remove(c) { this.classes.delete(c); },
    contains(c) { return this.classes.has(c); },
    toggle(c, force) {
      if (force !== undefined) {
        if (force) this.classes.add(c);
        else this.classes.delete(c);
      } else if (this.classes.has(c)) {
        this.classes.delete(c);
      } else {
        this.classes.add(c);
      }
    }
  };

  return {
    tagName: tag.toUpperCase(),
    id: id,
    dataset: dataset,
    style: style,
    classList: classList,
    children: children,
    disabled: false,
    value: '',
    _innerHTML: '',
    _textContent: '',
    get innerHTML() {
      return this._innerHTML;
    },
    set innerHTML(val) {
      this._innerHTML = String(val);
      this._textContent = this._innerHTML.replace(/<[^>]*>/g, '');
    },
    get textContent() {
      return this._textContent;
    },
    set textContent(val) {
      this._textContent = String(val);
      this._innerHTML = String(val)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    },
    addEventListener(event, fn) {
      listeners[event] = listeners[event] || [];
      listeners[event].push(fn);
    },
    dispatchEvent(event) {
      const type = typeof event === 'string' ? event : event.type;
      (listeners[type] || []).forEach(fn => fn(event));
    },
    click() {
      this.dispatchEvent({ type: 'click', target: this });
    },
    querySelectorAll() {
      return [];
    },
    querySelector() {
      return null;
    },
    appendChild(child) {
      children.push(child);
      return child;
    },
    remove() {}
  };
}

function createDOMContext(elements = {}, ns = { ready: true }) {
  const elMap = new Map();
  for (const [id, el] of Object.entries(elements)) {
    elMap.set(id, el);
  }

  const documentStub = {
    getElementById(id) {
      if (elMap.has(id)) return elMap.get(id);
      const el = createStubElement('div', id);
      elMap.set(id, el);
      return el;
    },
    querySelectorAll() { return []; },
    querySelector() { return null; },
    createElement(tag) { return createStubElement(tag); },
    body: createStubElement('body'),
    documentElement: createStubElement('html'),
    addEventListener() {}
  };

  const windowStub = {
    document: documentStub,
    AqOneDashboardUtils: { escapeHtml },
    AqOneDashboard: ns,
    location: { href: 'http://localhost/html/dashboard.html', search: '', replace() {} },
    sessionStorage: {
      data: new Map(),
      getItem(k) { return this.data.has(k) ? this.data.get(k) : null; },
      setItem(k, v) { this.data.set(k, String(v)); },
      removeItem(k) { this.data.delete(k); },
      clear() { this.data.clear(); }
    },
    localStorage: {
      data: new Map(),
      getItem(k) { return this.data.has(k) ? this.data.get(k) : null; },
      setItem(k, v) { this.data.set(k, String(v)); },
      removeItem(k) { this.data.delete(k); },
      clear() { this.data.clear(); }
    },
    console: { log() {}, warn() {}, error() {} },
    setInterval() { return 1; },
    clearInterval() {},
    setTimeout(fn) { return 1; },
    Date: Date,
    JSON: JSON,
    Number: Number,
    String: String,
    Array: Array,
    Object: Object,
    Math: Math,
    parseFloat: parseFloat,
    parseInt: parseInt
  };
  windowStub.window = windowStub;

  return { window: windowStub, document: documentStub };
}

test('Phase 1 - F01: Secure rendering prevents unescaped HTML injection', async (t) => {
  await t.test('incident feed in dashboard-buoy-health.js escapes desc and time', () => {
    const maliciousAlert = {
      desc: '<img src=x onerror="auditProbe()">Boat 12 in distress',
      time: '<script>evil()</script>10:00 AM',
      isLive: true,
      status: 'active',
      type: 'sos',
      lat: 11.7,
      lng: 122.4
    };

    const ns = {
      ready: true,
      OPS_CENTER: [11.7, 122.4],
      OPS_ZOOM: 11,
      shoreStations: [],
      initialBuoys: [],
      vessels: [],
      incidents: [],
      map: { setView() {}, on() {} },
      openPanel() {},
      closePanel() {},
      allAlerts: () => [maliciousAlert],
      alertIcon: () => '<span class="icon"></span>',
      escapeHtml: escapeHtml
    };

    const feedList = createStubElement('div', 'incident-feed-list');
    const { window, document } = createDOMContext({ 'incident-feed-list': feedList }, ns);

    const code = fs.readFileSync(path.join(__dirname, '../js/dashboard/dashboard-buoy-health.js'), 'utf8');
    const context = vm.createContext(Object.assign({}, window, { window, document, AqOneDashboard: ns }));
    vm.runInContext(code, context);

    assert.ok(feedList.innerHTML.length > 0, 'feed rendered');
    assert.ok(!feedList.innerHTML.includes('<img src=x onerror="auditProbe()">'), 'raw <img> tag must not be rendered');
    assert.ok(feedList.innerHTML.includes('&lt;img src=x'), 'img tag must be escaped');
    assert.ok(!feedList.innerHTML.includes('<script>evil()</script>'), 'raw <script> tag must not be rendered');
    assert.ok(feedList.innerHTML.includes('&lt;script&gt;evil()&lt;/script&gt;'), 'script tag must be escaped');
  });

  await t.test('sea condition in dashboard-emergency-advisory.js escapes reason and setByName', async () => {
    const seaCurrent = createStubElement('div', 'sea-condition-current');
    const ns = {
      ready: true,
      escapeHtml: escapeHtml,
      authFetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }),
      CURRENT_USER: { id: 'u1', name: 'Operator' },
      showToast() {},
      closePanel() {}
    };
    const fakeAdvisoryService = {
      getAdvisories: () => Promise.resolve([]),
      getAdvisory: () => Promise.resolve(null),
      createAdvisory: () => Promise.resolve(),
      updateAdvisory: () => Promise.resolve(),
      deleteAdvisory: () => Promise.resolve()
    };

    const { window, document } = createDOMContext({ 'sea-condition-current': seaCurrent }, ns);

    const code = fs.readFileSync(path.join(__dirname, '../js/dashboard/dashboard-emergency-advisory.js'), 'utf8');
    const context = vm.createContext(Object.assign({}, window, { window, document, AqOneDashboard: ns, AdvisoryService: fakeAdvisoryService }));
    vm.runInContext(code, context);

    assert.equal(typeof ns.renderSeaCondition, 'function', 'renderSeaCondition should be exported');

    ns.renderSeaCondition({
      status: 'Caution — Check Advisories',
      reason: '<img src=x onerror=alert("xss")>High waves',
      set_by_name: '<script>evil()</script>Officer Cruz',
      created_at: new Date().toISOString()
    });

    assert.ok(!seaCurrent.innerHTML.includes('<img src=x'), 'reason must not inject raw <img>');
    assert.ok(seaCurrent.innerHTML.includes('&lt;img src=x'), 'reason must be HTML escaped');
    assert.ok(!seaCurrent.innerHTML.includes('<script>evil()</script>'), 'set_by_name must not inject raw <script>');
    assert.ok(seaCurrent.innerHTML.includes('&lt;script&gt;evil()&lt;/script&gt;'), 'set_by_name must be HTML escaped');
  });

  await t.test('dropLocalPin in dashboard-tools.js escapes CURRENT_USER.name in popup', () => {
    let capturedPopupHtml = null;
    const fakeL = {
      divIcon: (opts) => opts,
      marker: () => ({
        bindPopup: (html) => { capturedPopupHtml = html; },
        on: () => {},
        openPopup: () => {}
      }),
      layerGroup: () => ({
        addTo: () => ({ clearLayers: () => {}, addLayer: () => {} })
      }),
      polyline: () => ({ addTo: () => {} }),
      polygon: () => ({ addTo: () => {} }),
      circleMarker: () => ({ addTo: () => {} })
    };

    const maliciousUser = { name: '<img src=x onerror=alert(1)>Operator One' };

    const ns = {
      ready: true,
      CURRENT_USER: maliciousUser,
      CURRENT_USER_COLOR: '#0284c7',
      map: { on() {}, addLayer() {}, removeLayer() {} },
      tileLayers: {},
      currentBase: {},
      gatewayLayer: {},
      incidentLayer: {},
      buoyLayer: {},
      boundaryLayer: {},
      pinLayer: { addLayer() {}, removeLayer() {} },
      vesselLayer: {},
      coverageLayer: {},
      meshLayer: {},
      squallLayer: {},
      driftLayer: {},
      dangerZoneLayer: {},
      hotspotLayer: {},
      refreshDangerZones() {},
      escapeHtml: escapeHtml
    };

    const { window, document } = createDOMContext({}, ns);

    const code = fs.readFileSync(path.join(__dirname, '../js/dashboard/dashboard-tools.js'), 'utf8');
    const context = vm.createContext(Object.assign({}, window, { window, document, L: fakeL, AqOneDashboard: ns }));
    vm.runInContext(code, context);

    assert.equal(typeof ns.dropLocalPin, 'function', 'dropLocalPin should be exported on ns');
    ns.dropLocalPin({ lat: 11.71, lng: 122.45 });

    assert.ok(capturedPopupHtml, 'popup html was generated');
    assert.ok(!capturedPopupHtml.includes('<img src=x'), 'user name must not inject raw <img> tag');
    assert.ok(capturedPopupHtml.includes('&lt;img src=x onerror=alert(1)&gt;Operator One'), 'user name must be escaped');
  });
});

test('Phase 1 - F05: Unsupported broadcast and check-in actions cannot claim success', async (t) => {
  await t.test('broadcast and silent check-in buttons are disabled and do not announce delivery', () => {
    const btnBroadcast = createStubElement('button', 'sos-btn-broadcast');
    const btnCheckin = createStubElement('button', 'sos-btn-checkin');
    const broadcastMsg = createStubElement('div', 'sos-broadcast-msg');

    const ns = {
      ready: true,
      escapeHtml: escapeHtml,
      authFetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve([]) }),
      map: { setView() {} },
      openActivityDrawer() {},
      showToast() {},
      allAlerts: () => [],
      syncAlertIndicators() {}
    };

    const { window, document } = createDOMContext({
      'sos-btn-broadcast': btnBroadcast,
      'sos-btn-checkin': btnCheckin,
      'sos-broadcast-msg': broadcastMsg
    }, ns);

    const code = fs.readFileSync(path.join(__dirname, '../js/dashboard/dashboard-incidents.js'), 'utf8');
    const context = vm.createContext(Object.assign({}, window, { window, document, AqOneDashboard: ns }));
    vm.runInContext(code, context);

    assert.equal(btnBroadcast.disabled, true, 'broadcast button must be initialized disabled');
    assert.equal(btnCheckin.disabled, true, 'check-in button must be initialized disabled');

    // Simulate click on broadcast button
    btnBroadcast.click();
    assert.ok(
      !broadcastMsg.textContent.includes('Broadcast sent to 3 nearby vessels'),
      'broadcast must never claim 3 vessels were messaged over LoRa mesh'
    );
    assert.ok(
      broadcastMsg.textContent.includes('unavailable'),
      'broadcast message must honestly state capability is unavailable'
    );

    // Simulate click on check-in button
    btnCheckin.click();
    assert.ok(
      !broadcastMsg.textContent.includes('Silent check-in request queued at surrounding buoys'),
      'check-in must never claim a request was queued at buoys'
    );
    assert.ok(
      broadcastMsg.textContent.includes('unavailable'),
      'check-in message must honestly state capability is unavailable'
    );
  });
});

test('Phase 1 - F06: Standalone advisory URL redirects to dashboard and has no imaginary queue', async (t) => {
  await t.test('html/createAdvisory.html contains dashboard redirect and no localStorage queue', () => {
    const html = fs.readFileSync(path.join(__dirname, '../html/createAdvisory.html'), 'utf8');

    assert.ok(
      !html.includes('aqone_advisories'),
      'createAdvisory.html must not write or reference fake aqone_advisories queue'
    );
    assert.ok(
      !html.includes('index.html'),
      'createAdvisory.html must not contain broken index.html links'
    );
    assert.ok(
      html.includes('dashboard.html'),
      'createAdvisory.html must redirect or link to dashboard.html'
    );
    assert.ok(
      html.includes('window.location.replace') || html.includes('http-equiv="refresh"'),
      'createAdvisory.html must provide automated redirect'
    );
  });
});

test('Phase 1 - F10: Profile displays authenticated session and prevents origin-wide pollution', async (t) => {
  await t.test('renderUserProfile updates identity fields truthfully', () => {
    const headerName = createStubElement('span', 'header-user-name');
    const headerRole = createStubElement('span', 'header-user-role');
    const headerAvatar = createStubElement('div', 'header-user-avatar');
    const cardName = createStubElement('div', 'profile-card-name');
    const cardRole = createStubElement('div', 'profile-card-role');
    const cardAvatar = createStubElement('div', 'profile-card-avatar');
    const pfName = createStubElement('input', 'pf-fullname');
    const pfRole = createStubElement('input', 'pf-role');
    const pfEmail = createStubElement('input', 'pf-email');

    const dom = createDOMContext({
      'header-user-name': headerName,
      'header-user-role': headerRole,
      'header-user-avatar': headerAvatar,
      'profile-card-name': cardName,
      'profile-card-role': cardRole,
      'profile-card-avatar': cardAvatar,
      'pf-fullname': pfName,
      'pf-role': pfRole,
      'pf-email': pfEmail
    });

    global.document = dom.document;

    // Account 1: MDRRMO Officer
    profileApi.renderUserProfile({
      id: 'usr-1',
      name: 'Maria Santos',
      email: 'officer.santos@newwashington.gov.ph',
      role: 'mdrrmo'
    });

    assert.equal(headerName.textContent, 'Maria Santos');
    assert.equal(headerRole.textContent, 'MDRRMO Officer');
    assert.equal(headerAvatar.textContent, 'MS');
    assert.equal(cardName.textContent, 'Maria Santos');
    assert.equal(cardRole.textContent, 'MDRRMO Officer');
    assert.equal(pfName.value, 'Maria Santos');
    assert.equal(pfEmail.value, 'officer.santos@newwashington.gov.ph');

    // Account 2: Administrator in separate session
    profileApi.renderUserProfile({
      id: 'usr-2',
      name: 'Lenard Angelo',
      email: 'admin@aquanons.ph',
      role: 'admin'
    });

    assert.equal(headerName.textContent, 'Lenard Angelo');
    assert.equal(headerRole.textContent, 'Administrator');
    assert.equal(headerAvatar.textContent, 'LA');
    assert.equal(cardName.textContent, 'Lenard Angelo');
    assert.equal(cardRole.textContent, 'Administrator');
    assert.equal(pfName.value, 'Lenard Angelo');
    assert.equal(pfEmail.value, 'admin@aquanons.ph');

    delete global.document;
  });

  await t.test('profile.js does not store or load aqone_profile_data or fake password updates', () => {
    const profileCode = fs.readFileSync(path.join(__dirname, '../js/profile.js'), 'utf8');

    assert.ok(
      !profileCode.includes('aqone_profile_data'),
      'profile.js must not persist or read origin-wide aqone_profile_data'
    );
    assert.ok(
      !profileCode.includes('aqone_user_avatar'),
      'profile.js must not persist or read origin-wide aqone_user_avatar'
    );
    assert.ok(
      !profileCode.includes('Password updated successfully!'),
      'profile.js must not claim password updates succeeded when no backend endpoint exists'
    );
  });

  await t.test('Systemprofile.html contains no unbacked password form or fake save buttons', () => {
    const profileHtml = fs.readFileSync(path.join(__dirname, '../html/Systemprofile.html'), 'utf8');

    assert.ok(
      !profileHtml.includes('btn-save-security'),
      'Systemprofile.html must not contain fake password submit button'
    );
    assert.ok(
      !profileHtml.includes('btn-save-personal'),
      'Systemprofile.html must not contain fake personal info save button'
    );
    assert.ok(
      !profileHtml.includes('btn-edit-avatar'),
      'Systemprofile.html must not contain unsupported change photo button'
    );
  });
});
