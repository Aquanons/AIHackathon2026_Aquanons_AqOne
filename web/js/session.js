export function requireAuth() {
  if (!sessionStorage.getItem('aqoneToken')) {
    window.location.replace('index.html');
    return false;
  }
  return true;
}

export function can(permission) {
  const perms = JSON.parse(sessionStorage.getItem('aqonePermissions') || '[]');
  return perms.includes(permission);
}

export function saveSession(token, user) {
  sessionStorage.setItem('aqoneToken', token);
  sessionStorage.setItem('aqonePermissions', JSON.stringify(user?.permissions || []));
  sessionStorage.setItem('aqoneUser', JSON.stringify(user || {}));
}

export function currentUser() {
  try {
    return JSON.parse(sessionStorage.getItem('aqoneUser') || '{}');
  } catch {
    return {};
  }
}

export function clearSession() {
  sessionStorage.removeItem('aqoneToken');
  sessionStorage.removeItem('aqonePermissions');
  sessionStorage.removeItem('aqoneUser');
}
