const BASE = '';

function authHeaders() {
  const t = sessionStorage.getItem('aqoneToken');
  return t ? { Authorization: `Bearer ${t}` } : {};
}

async function request(path, options = {}) {
  const res = await fetch(BASE + path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...authHeaders(), ...(options.headers || {}) },
  });

  let body;
  try { body = await res.json(); } catch { body = null; }

  // Envelope per docs/01_CONTRACTS.md 3.1 — payload is always under data.
  if (!res.ok || !body || body.ok !== true) {
    const code = body?.error?.code ?? 'INTERNAL';
    const message = body?.error?.message ?? `HTTP ${res.status}`;
    const e = new Error(message);
    e.code = code;
    e.status = res.status;
    throw e;
  }
  return body.data;
}

export const api = {
  login: (username, password) =>
    request('/api/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  me: () => request('/api/me'),
  listSos: (limit = 50) => request(`/api/sos?limit=${limit}`),
  acknowledge: (id) => request(`/api/sos/${encodeURIComponent(id)}/acknowledge`, { method: 'POST' }),
};
