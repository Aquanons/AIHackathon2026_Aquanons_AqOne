/* ══════════════════════════════════════════════════════════════
   ADVISORY SERVICE — Async API layer (FastAPI /api/advisories)
   Converts between frontend camelCase and backend snake_case.
   ══════════════════════════════════════════════════════════════ */
var AdvisoryService = (function () {
  'use strict';

  const API_BASE = window.location.origin;

  function toSnakeCase(obj) {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      result[snakeKey] = value;
    }
    return result;
  }

  function toCamelCase(obj) {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
      result[camelKey] = value;
    }
    return result;
  }

  async function fetchJson(path, options = {}) {
    const token = sessionStorage.getItem('aqoneToken') || '';
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: headers,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.detail || `Request failed: ${response.status}`);
    }
    return data;
  }

  async function getAdvisories(params = {}) {
    const query = new URLSearchParams();
    if (params.status) query.set('status', params.status);
    if (params.municipality) query.set('municipality', params.municipality);
    const queryString = query.toString() ? `?${query.toString()}` : '';
    const data = await fetchJson(`/api/advisories${queryString}`);
    return (data.advisories || []).map(toCamelCase);
  }

  async function getAdvisory(id) {
    const data = await fetchJson(`/api/advisories/${id}`);
    return data.advisory ? toCamelCase(data.advisory) : null;
  }

  async function createAdvisory(payload) {
    const body = toSnakeCase({ ...payload });
    if (body.publish_date === '') delete body.publish_date;
    if (body.expiration_date === '') delete body.expiration_date;
    const data = await fetchJson('/api/advisories', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return toCamelCase(data.advisory);
  }

  async function updateAdvisory(id, payload) {
    const body = toSnakeCase({ ...payload });
    if (body.publish_date === '') delete body.publish_date;
    if (body.expiration_date === '') delete body.expiration_date;
    const data = await fetchJson(`/api/advisories/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    return toCamelCase(data.advisory);
  }

  async function deleteAdvisory(id) {
    await fetchJson(`/api/advisories/${id}`, { method: 'DELETE' });
    return { success: true };
  }

  return {
    getAdvisories: getAdvisories,
    getAdvisory: getAdvisory,
    createAdvisory: createAdvisory,
    updateAdvisory: updateAdvisory,
    deleteAdvisory: deleteAdvisory,
  };
})();
