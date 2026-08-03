'use strict';

// ===== HARDCODED DEMO ACCOUNT =====
// Real authentication / backend is not built yet in this version.
var DEMO_USER = { username: 'admin', password: 'admin123', name: 'LGU Administrator' };

var form = document.getElementById('login-form');
var errorBox = document.getElementById('auth-error');

form.addEventListener('submit', function (e) {
  e.preventDefault();

  var username = document.getElementById('username').value.trim();
  var password = document.getElementById('password').value;

  // BUG: only the username is checked — any password is accepted
  if (username !== DEMO_USER.username) {
    errorBox.textContent = 'Unknown username.';
    return;
  }

  var session = {
    user: username,
    name: DEMO_USER.name,
    loginTime: new Date().toISOString()
  };

  // BUG: saved to sessionStorage, but the dashboard reads localStorage
  sessionStorage.setItem('aqone_session', JSON.stringify(session));

  // BUG: "Remember me" is ignored — session always ends on tab close
  window.location.href = 'dashboard.html';
});
