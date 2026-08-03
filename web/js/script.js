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
    showMessage(result.message || 'Login successful.');
    window.location.href = 'dashboard.html';
  } catch (error) {
    showMessage(error.message, true);
  }
}

async function handleSignup(event) {
  event.preventDefault();

  const fullName = document.getElementById('fullName')?.value.trim() || '';
  const email = document.getElementById('email')?.value.trim() || '';
  const position = document.getElementById('position')?.value.trim() || '';
  const office = document.getElementById('office')?.value.trim() || '';
  const role = document.getElementById('role')?.value || '';
  const password = document.getElementById('password')?.value.trim() || '';
  const consent = document.getElementById('consent')?.checked || false;

  if (!fullName || !email || !position || !office || !role || !password) {
    showMessage('Please complete every required field before signing up.');
    return;
  }

  if (!consent) {
    showMessage('Please agree to the privacy policy before continuing.');
    return;
  }

  try {
    const result = await postJson('/api/register', {
      full_name: fullName,
      email,
      position,
      office,
      role,
      password,
      consent
    });

    sessionStorage.setItem(LAST_EMAIL_KEY, email);
    showMessage(result.message || 'Account created successfully.');
    window.location.href = 'login.html';
  } catch (error) {
    showMessage(error.message, true);
  }
}

function initAuthForms() {
  fillSavedEmail();

  const loginForm = document.getElementById('loginForm');
  const signupForm = document.getElementById('signupForm');

  if (loginForm) {
    loginForm.addEventListener('submit', handleLogin);
  }

  if (signupForm) {
    signupForm.addEventListener('submit', handleSignup);
  }
}

window.addEventListener('DOMContentLoaded', initAuthForms);
