const API_BASE = window.location.origin;
const LAST_EMAIL_KEY = 'aqoneLastEmail';

function showMessage(message, isError = false) {
  if (isError) {
    console.error(message);
  }
  alert(message);
}

async function postJson(path, payload) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.detail || 'Request failed');
  }

  return data;
}

function fillSavedEmail() {
  const savedEmail = sessionStorage.getItem(LAST_EMAIL_KEY);
  const emailField = document.getElementById('email');

  if (emailField && savedEmail) {
    emailField.value = savedEmail;
  }
}

async function handleLogin(event) {
  event.preventDefault();

  const email = document.getElementById('email')?.value.trim() || '';
  const password = document.getElementById('password')?.value.trim() || '';

  if (!email || !password) {
    showMessage('Please enter your email and password.');
    return;
  }

  try {
    const result = await postJson('/api/login', { email, password });
    sessionStorage.setItem(LAST_EMAIL_KEY, email);
    if (result.token) {
      sessionStorage.setItem('aqoneToken', result.token);
    }
    // The dashboard attributes sea-condition entries to the signed-in account
    // rather than a hardcoded operator name.
    if (result.user) {
      sessionStorage.setItem('aqoneUser', JSON.stringify(result.user));
    }
    window.location.href = 'dashboard.html';
  } catch (error) {
    showMessage(error.message, true);
  }
}

// There is no public sign-up. Dashboard accounts are created by an
// administrator through html/admin-signup.html, which requires a server-side
// setup key and is handled by js/admin-signup.js.

function initAuthForms() {
  fillSavedEmail();

  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', handleLogin);
  }
}

window.addEventListener('DOMContentLoaded', initAuthForms);
