// Admin account creation. This page is deliberately unlinked from anywhere in
// the app - it is reached only by pasting the URL - and the setup key is
// verified server-side, so the obscurity of the URL is convenience, not the
// security boundary.
(function () {
  'use strict';

  var API_BASE = window.location.origin;

  var keyForm = document.getElementById('setupKeyForm');
  var signupForm = document.getElementById('adminSignupForm');
  var messageEl = document.getElementById('message');
  var submitBtn = document.getElementById('submitBtn');
  var setupKeyInput = document.getElementById('setupKey');

  var setupKey = '';

  function setMessage(text, kind) {
    messageEl.textContent = text || '';
    messageEl.className = 'message' + (kind ? ' ' + kind : '');
  }

  // The key is not validated here - it is sent with the account creation
  // request and checked by the server. This step only collects it.
  keyForm.addEventListener('submit', function (event) {
    event.preventDefault();
    var value = setupKeyInput.value.trim();
    if (!value) {
      setMessage('Enter the setup key.', 'error');
      return;
    }
    setupKey = value;
    keyForm.hidden = true;
    signupForm.hidden = false;
    setMessage('');
    document.getElementById('email').focus();
  });

  signupForm.addEventListener('submit', function (event) {
    event.preventDefault();

    var email = document.getElementById('email').value.trim();
    var fullName = document.getElementById('fullName').value.trim();
    var password = document.getElementById('password').value;
    var role = document.getElementById('role').value;

    if (!email || !password) {
      setMessage('Email and password are required.', 'error');
      return;
    }
    if (password.length < 8) {
      setMessage('Password must be at least 8 characters.', 'error');
      return;
    }

    submitBtn.disabled = true;
    setMessage('Creating account...');

    fetch(API_BASE + '/api/admin-signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        setup_key: setupKey,
        email: email,
        full_name: fullName,
        password: password,
        role: role
      })
    })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          if (!res.ok) throw new Error(data.detail || 'Request failed (' + res.status + ')');
          return data;
        });
      })
      .then(function (data) {
        setMessage(
          (data.message || 'Account created.') + ' You can now log in with ' + email + '.',
          'success'
        );
        signupForm.reset();
      })
      .catch(function (err) {
        setMessage(err.message, 'error');
      })
      .finally(function () {
        submitBtn.disabled = false;
      });
  });
})();
