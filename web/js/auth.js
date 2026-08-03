'use strict';

/* ==========================================================================
   AqOne v3 — auth.js
   Fixes v2 bugs:
     - Both username AND password are now validated.
     - Session is stored in localStorage when "Remember me" is checked,
       otherwise in sessionStorage. The dashboard reads both, so the
       v2 "always Guest" bug is gone.
     - "Remember me" is actually honoured (7-day expiry in localStorage).
   Exposes a shared AqSession API used by dashboard.html / app.js.
   ========================================================================== */

var AqSession = (function () {

  var LS_KEY = 'aqone_session';
  var MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days for remembered sessions

  function read() {
    var raw = null;
    try {
      raw = localStorage.getItem(LS_KEY) || sessionStorage.getItem(LS_KEY);
    } catch (err) {
      raw = null;
    }
    if (!raw) return null;

    var session = null;
    try {
      session = JSON.parse(raw);
    } catch (err) {
      return null;
    }

    // Expired remembered sessions are dropped.
    if (session && session.expiresAt && Date.now() > session.expiresAt) {
      clear();
      return null;
    }
    return session;
  }

  function write(session, remember) {
    var payload = JSON.stringify(session);
    if (remember) {
      session.expiresAt = Date.now() + MAX_AGE_MS;
      payload = JSON.stringify(session);
      try {
        localStorage.setItem(LS_KEY, payload);
        sessionStorage.removeItem(LS_KEY);
      } catch (err) { /* storage unavailable */ }
    } else {
      try {
        sessionStorage.setItem(LS_KEY, payload);
        localStorage.removeItem(LS_KEY);
      } catch (err) { /* storage unavailable */ }
    }
  }

  function clear() {
    try {
      localStorage.removeItem(LS_KEY);
      sessionStorage.removeItem(LS_KEY);
    } catch (err) { /* storage unavailable */ }
  }

  return { read: read, write: write, clear: clear };
})();

/* ---- Login page logic (only runs on login.html) ---- */
var loginForm = document.getElementById('login-form');
if (loginForm) {
  var DEMO_ACCOUNTS = {
    admin:    { password: 'admin123', name: 'LGU Administrator', role: 'Administrator' },
    operator: { password: 'ocean123', name: 'MDRRMO Operator',   role: 'Operator' }
  };

  var errorBox = document.getElementById('auth-error');
  var card = document.getElementById('auth-card');
  var usernameInput = document.getElementById('username');
  var passwordInput = document.getElementById('password');
  var pwToggle = document.getElementById('pw-toggle');
  var rememberInput = document.getElementById('remember');

  // Show / hide password toggle
  pwToggle.addEventListener('click', function () {
    var isPassword = passwordInput.type === 'password';
    passwordInput.type = isPassword ? 'text' : 'password';
    pwToggle.textContent = isPassword ? 'Hide' : 'Show';
    passwordInput.focus();
  });

  // Demo account quick-fill chips
  document.querySelectorAll('.demo-chip').forEach(function (chip) {
    chip.addEventListener('click', function () {
      usernameInput.value = chip.getAttribute('data-user');
      passwordInput.value = chip.getAttribute('data-pass');
      passwordInput.focus();
    });
  });

  function fail(message) {
    errorBox.textContent = message;
    card.classList.remove('shake');
    // force reflow so the animation replays
    void card.offsetWidth;
    card.classList.add('shake');
    usernameInput.classList.toggle('invalid', !usernameInput.value);
    passwordInput.classList.toggle('invalid', !passwordInput.value);
  }

  loginForm.addEventListener('submit', function (e) {
    e.preventDefault();

    var username = usernameInput.value.trim().toLowerCase();
    var password = passwordInput.value;
    var remember = rememberInput.checked;

    if (!username || !password) {
      fail('Please enter both username and password.');
      return;
    }

    var account = DEMO_ACCOUNTS[username];

    // v3 fix: password is now actually checked.
    if (!account || account.password !== password) {
      fail('Invalid username or password.');
      return;
    }

    var session = {
      user: username,
      name: account.name,
      role: account.role,
      loginTime: new Date().toISOString()
    };

    AqSession.write(session, remember);
    window.location.href = 'dashboard.html';
  });
}
