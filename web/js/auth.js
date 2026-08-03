'use strict';

/* ==========================================================================
   AqOne v4 — auth.js
   Adds a local account registry (with hashed passwords), signup, login,
   roles and session persistence on top of the v3 session API.
   ========================================================================== */

// ---- password hashing (prototype-grade, not for production) ----
function hashPassword(pw) {
  var h = 2166136261;
  var s = 'aqone.v4.' + pw;
  for (var i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

// ---- account registry ----
var AqAccounts = (function () {
  var ACC_KEY = 'aqone_v4_accounts';

  function seed() {
    var demo = [
      { username: 'admin',    name: 'LGU Administrator', role: 'Administrator', hash: hashPassword('admin123'), created: Date.now() },
      { username: 'operator', name: 'MDRRMO Operator',   role: 'Operator',      hash: hashPassword('ocean123'), created: Date.now() }
    ];
    save(demo);
    return demo;
  }

  function list() {
    var raw = null;
    try { raw = localStorage.getItem(ACC_KEY); } catch (err) { raw = null; }
    if (!raw) return seed();
    try {
      var arr = JSON.parse(raw);
      if (!Array.isArray(arr) || !arr.length) return seed();
      return arr;
    } catch (err) {
      return seed();
    }
  }

  function save(arr) {
    try { localStorage.setItem(ACC_KEY, JSON.stringify(arr)); } catch (err) { /* unavailable */ }
  }

  function find(username) {
    var u = (username || '').trim().toLowerCase();
    var arr = list();
    for (var i = 0; i < arr.length; i++) {
      if (arr[i].username.toLowerCase() === u) return arr[i];
    }
    return null;
  }

  function create(opts) {
    var arr = list();
    var acc = {
      username: opts.username.trim().toLowerCase(),
      name: opts.name.trim(),
      role: opts.role,
      hash: hashPassword(opts.password),
      created: Date.now()
    };
    arr.push(acc);
    save(arr);
    return acc;
  }

  function verify(username, password) {
    var acc = find(username);
    if (!acc) return null;
    if (acc.hash !== hashPassword(password)) return null;
    return acc;
  }

  function update(updated) {
    var arr = list();
    for (var i = 0; i < arr.length; i++) {
      if (arr[i].username === updated.username) {
        arr[i] = updated;
        save(arr);
        return true;
      }
    }
    return false;
  }

  return { list: list, find: find, create: create, verify: verify, update: update, seed: seed };
})();

// ---- session API (shared by login page and dashboard) ----
var AqSession = (function () {
  var LS_KEY = 'aqone_session';
  var MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

  function read() {
    var raw = null;
    try { raw = localStorage.getItem(LS_KEY) || sessionStorage.getItem(LS_KEY); } catch (err) { raw = null; }
    if (!raw) return null;
    var session = null;
    try { session = JSON.parse(raw); } catch (err) { return null; }
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
      } catch (err) { /* unavailable */ }
    } else {
      try {
        sessionStorage.setItem(LS_KEY, payload);
        localStorage.removeItem(LS_KEY);
      } catch (err) { /* unavailable */ }
    }
  }

  function clear() {
    try { localStorage.removeItem(LS_KEY); sessionStorage.removeItem(LS_KEY); } catch (err) { /* unavailable */ }
  }

  return { read: read, write: write, clear: clear };
})();

// ---- helpers used by auth pages ----
function shakeCard(card) {
  card.classList.remove('shake');
  void card.offsetWidth;
  card.classList.add('shake');
}

function showError(id, msg) {
  var el = document.getElementById(id);
  if (el) el.textContent = msg;
}

/* ==========================================================================
   LOGIN PAGE
   ========================================================================== */
var loginForm = document.getElementById('login-form');
if (loginForm) {
  var card = document.getElementById('auth-card');
  var usernameInput = document.getElementById('username');
  var passwordInput = document.getElementById('password');
  var pwToggle = document.getElementById('pw-toggle');

  document.getElementById('pw-toggle').addEventListener('click', function () {
    var isPassword = passwordInput.type === 'password';
    passwordInput.type = isPassword ? 'text' : 'password';
    pwToggle.textContent = isPassword ? 'Hide' : 'Show';
    passwordInput.focus();
  });

  document.querySelectorAll('.demo-chip').forEach(function (chip) {
    chip.addEventListener('click', function () {
      usernameInput.value = chip.getAttribute('data-user');
      passwordInput.value = chip.getAttribute('data-pass');
      passwordInput.focus();
    });
  });

  loginForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var username = usernameInput.value.trim();
    var password = passwordInput.value;
    var remember = document.getElementById('remember').checked;

    if (!username || !password) {
      showError('auth-error', 'Please enter both username and password.');
      shakeCard(card);
      return;
    }

    var account = AqAccounts.verify(username, password);
    if (!account) {
      showError('auth-error', 'Invalid username or password.');
      shakeCard(card);
      return;
    }

    AqSession.write({ user: account.username, name: account.name, role: account.role, loginTime: new Date().toISOString() }, remember);
    window.location.href = 'dashboard.html';
  });
}

/* ==========================================================================
   SIGNUP PAGE
   ========================================================================== */
var signupForm = document.getElementById('signup-form');
if (signupForm) {
  var sCard = document.getElementById('auth-card');
  var sUser = document.getElementById('s-username');
  var sPass = document.getElementById('s-password');

  function setHint(msg, ok) {
    var el = document.getElementById('s-username-hint');
    el.textContent = msg || '';
    el.className = 'field-hint' + (ok ? ' good' : msg ? ' bad' : '');
  }

  sUser.addEventListener('input', function () {
    var v = sUser.value.trim().toLowerCase();
    if (!v) return setHint('', false);
    if (!/^[a-z0-9_]{3,20}$/.test(v)) {
      setHint('Use 3–20 letters, numbers or underscores.', false);
    } else if (AqAccounts.find(v)) {
      setHint('That username is taken.', false);
    } else {
      setHint('Username is available.', true);
    }
  });

  signupForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var username = sUser.value.trim().toLowerCase();
    var name = document.getElementById('s-name').value.trim();
    var role = document.getElementById('s-role').value;
    var pass = sPass.value;
    var confirm = document.getElementById('s-confirm').value;
    var terms = document.getElementById('s-terms').checked;

    var fields = [sUser, document.getElementById('s-name'), sPass, document.getElementById('s-confirm')];
    fields.forEach(function (f) { f.classList.remove('invalid'); });

    if (!/^[a-z0-9_]{3,20}$/.test(username)) {
      showError('auth-error', 'Username must be 3–20 letters, numbers or underscores.');
      sUser.classList.add('invalid');
      shakeCard(sCard);
      return;
    }
    if (AqAccounts.find(username)) {
      showError('auth-error', 'That username is already taken.');
      sUser.classList.add('invalid');
      shakeCard(sCard);
      return;
    }
    if (!name) {
      showError('auth-error', 'Please enter a display name.');
      document.getElementById('s-name').classList.add('invalid');
      shakeCard(sCard);
      return;
    }
    if (pass.length < 6) {
      showError('auth-error', 'Password must be at least 6 characters.');
      sPass.classList.add('invalid');
      shakeCard(sCard);
      return;
    }
    if (pass !== confirm) {
      showError('auth-error', 'Passwords do not match.');
      document.getElementById('s-confirm').classList.add('invalid');
      shakeCard(sCard);
      return;
    }
    if (!terms) {
      showError('auth-error', 'Please accept the Terms of Use.');
      shakeCard(sCard);
      return;
    }

    AqAccounts.create({ username: username, name: name, role: role, password: pass });
    try { sessionStorage.setItem('aqone_signup_ok', username); } catch (err) { /* ignore */ }
    window.location.href = 'login.html';
  });
}
