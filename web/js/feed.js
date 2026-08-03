import { api } from './api.js';
import { esc } from './escape.js';
import { can } from './session.js';

let items = [];

export function setItems(next) {
  items = Array.isArray(next) ? next : [];
  render();
}

export function upsert(sos, opts = {}) {
  const index = items.findIndex((s) => s.id === sos.id);
  if (index === -1) items.push(sos);
  else items[index] = { ...items[index], ...sos };
  render(opts);
}

function compare(a, b) {
  const aActive = a.status !== 'acknowledged';
  const bActive = b.status !== 'acknowledged';
  if (aActive !== bActive) return Number(bActive) - Number(aActive);
  return timeOf(b.submitted_at) - timeOf(a.submitted_at);
}

function timeOf(iso) {
  const t = Date.parse(iso ?? '');
  return Number.isNaN(t) ? 0 : t;
}

function activeCount() {
  return items.filter((s) => s.status !== 'acknowledged').length;
}

function coord(value) {
  return Number.isFinite(value) ? esc(value.toFixed(5)) : 'no fix';
}

function formatTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso ?? '');
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'medium' });
}

function emptyState() {
  return '<p class="empty">No SOS alerts.</p>';
}

function row(s, opts) {
  const isActive = s.status !== 'acknowledged';
  const isNew = opts.newId === s.id ? ' is-new' : '';
  return `
    <article class="sos-row ${isActive ? 'is-active' : 'is-acked'}${isNew}" data-id="${esc(s.id)}">
      <div class="sos-main">
        <div class="sos-who">${esc(s.reporter_name) || 'Unnamed vessel'}${s.vessel_name ? ' — ' + esc(s.vessel_name) : ''}</div>
        <div class="sos-meta">
          <span class="coord">${coord(s.lat)}, ${coord(s.lon)}</span>
          · ${esc(s.path)}
          · ${esc(formatTime(s.submitted_at))}
        </div>
        ${s.status === 'acknowledged'
          ? `<div class="sos-ack">Acknowledged by ${esc(s.acknowledged_by_name) || '—'}</div>`
          : ''}
      </div>
      ${isActive && can('sos.acknowledge')
        ? `<button class="btn-ack" data-id="${esc(s.id)}">Acknowledge</button>`
        : `<span class="pill pill-${esc(s.status)}">${esc(s.status)}</span>`}
    </article>`;
}

export function render(opts = {}) {
  const list = [...items].sort(compare);
  const el = document.getElementById('sos-list');
  el.innerHTML = list.length ? list.map((s) => row(s, opts)).join('') : emptyState();
  const badge = document.getElementById('active-count');
  if (badge) badge.textContent = String(activeCount());
}

export function bindAck(onRefresh) {
  const el = document.getElementById('sos-list');
  el.addEventListener('click', async (event) => {
    const button = event.target.closest('.btn-ack');
    if (!button) return;
    button.disabled = true;
    const id = button.dataset.id;
    try {
      const data = await api.acknowledge(id);
      const updated = data?.sos ?? data;
      if (updated) upsert(updated);
    } catch (e) {
      if (e.code === 'ALREADY_ACKNOWLEDGED' || e.status === 409) {
        if (onRefresh) await onRefresh();
      } else {
        button.disabled = false;
        showError(e.message || 'Could not acknowledge.');
      }
    }
  });
}

function showError(message) {
  const el = document.getElementById('feed-error');
  if (el) el.textContent = message;
}
