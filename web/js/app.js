'use strict';

// ===== SESSION =====
var session = null;
try {
  session = JSON.parse(localStorage.getItem('aqone_session') || 'null');
} catch (err) {
  session = null;
}

// BUG: auth.js saved the session to sessionStorage, not localStorage,
// so this is always null and the header shows "Guest".
var displayName = session && session.name ? session.name : 'Guest User';
document.getElementById('user-chip').textContent = displayName;

// ===== CONFIG =====
var CENTER = [11.65, 122.43];
var ZOOM = 12;

// ===== MAP =====
var map = L.map('map').setView(CENTER, ZOOM);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

// ===== MOCK DATA =====
var vessels = [
  { id: 'V-001', name: 'Bangka ni Mang Juan',  owner: 'Eddie Magbanua', lat: 11.7059, lng: 122.3693, status: 'active' },
  { id: 'V-002', name: 'Bangka ni Kapitan',    owner: 'Ramon Flores',   lat: 11.6516, lng: 122.4328, status: 'overdue' },
  { id: 'V-003', name: 'Saging Express',       owner: 'Felix Tambong',  lat: 11.82,   lng: 122.20,   status: 'active' },
  { id: 'V-004', name: 'Dagat Boys',           owner: 'Jun Antinero',   lat: 11.95,   lng: 121.95,   status: 'active' }
];

var buoys = [
  { name: 'Buoy Alpha', lat: 11.82, lng: 122.20, online: true },
  { name: 'Buoy Bravo', lat: 11.95, lng: 121.95, online: true },
  { name: 'Buoy Charlie', lat: 11.75, lng: 122.38, online: false }
];

var alerts = [
  { id: 1, type: 'Overdue Vessel',   vessel: 'V-002', time: '2h ago', severity: 'warning' },
  { id: 2, type: 'Capsizing Risk',   vessel: 'V-005', time: '5h ago', severity: 'danger' },
  { id: 3, type: 'Equipment Failure', vessel: 'V-003', time: '1d ago', severity: 'info' }
];

var advisories = [
  { id: 1, title: 'Small craft advisory — Boracay', date: 'Jul 30, 2026', status: 'published' },
  { id: 2, title: 'Catch reporting drive',          date: 'Jul 28, 2026', status: 'draft' }
];

// ===== MAP MARKERS =====
vessels.forEach(function (v) {
  L.marker([v.lat, v.lng]).addTo(map)
    .bindPopup('<b>' + v.name + '</b><br>' + v.id + ' — ' + v.status);
});

buoys.forEach(function (b) {
  L.circle([b.lat, b.lng], {
    radius: 1500,
    color: b.online ? '#22c55e' : '#ef4444',
    fillColor: b.online ? '#22c55e' : '#ef4444',
    fillOpacity: 0.08
  }).addTo(map).bindPopup(b.name + (b.online ? ' (online)' : ' (offline)'));
});

// ===== RENDER =====
function renderVessels() {
  var list = document.getElementById('vessel-list');
  list.innerHTML = '';
  vessels.forEach(function (v) {
    var li = document.createElement('li');
    li.className = 'vessel-item status-' + v.status;
    li.innerHTML =
      '<div class="vessel-main"><b>' + v.id + '</b> ' + v.name +
      '<span class="v-status">' + v.status + '</span></div>' +
      '<div class="v-owner">' + v.owner + '</div>';
    list.appendChild(li);
  });
}

function renderAlerts() {
  var box = document.getElementById('alert-list');
  box.innerHTML = '';
  alerts.forEach(function (a) {
    var div = document.createElement('div');
    div.className = 'alert-item sev-' + a.severity;
    div.innerHTML =
      '<span class="sev-dot"></span>' +
      '<div class="alert-main"><b>' + a.type + '</b>' +
      '<span class="alert-sub">' + a.vessel + ' · ' + a.time + '</span></div>' +
      '<button class="icon-btn" onclick="removeAlert(' + a.id + ')" title="Remove">&times;</button>';
    box.appendChild(div);
  });
  document.getElementById('alert-badge').textContent = alerts.length;
}

function renderAdvisories() {
  var box = document.getElementById('advisory-list');
  box.innerHTML = '';
  advisories.forEach(function (adv) {
    var div = document.createElement('div');
    div.className = 'advisory-item';
    div.innerHTML =
      '<div class="adv-title">' + adv.title + '</div>' +
      '<div class="adv-meta">' + adv.date + ' · ' + adv.status + '</div>';
    box.appendChild(div);
  });
}

function renderStats() {
  document.getElementById('vessel-count').textContent = vessels.length;
  document.getElementById('alert-count').textContent = alerts.length;
  document.getElementById('buoy-count').textContent = buoys.filter(function (b) { return b.online; }).length;
}

// ===== REMOVE ALERT =====
function removeAlert(id) {
  // BUG: the array is updated but the list is never re-rendered,
  // so the item only disappears after a page reload.
  var idx = -1;
  for (var i = 0; i < alerts.length; i++) {
    if (alerts[i].id === id) { idx = i; break; }
  }
  if (idx !== -1) alerts.splice(idx, 1);
  console.log('Removed alert ' + id + ' (not re-rendered yet)');
}

// ===== SEARCH =====
// BUG: no event listener is attached — typing in the search box does nothing.
var searchInput = document.getElementById('search');

// ===== STATUS FILTER =====
// BUG: the dropdown never listens for 'change', so it never filters anything.
var filterSelect = document.getElementById('status-filter');

// ===== LAST UPDATED TIMER =====
// BUG: element id typo ('lastupdate' vs 'last-updated') — the timer throws
// every 30s and the timestamp never changes.
var tick = 0;
setInterval(function () {
  tick += 1;
  document.getElementById('lastupdate').textContent = 'Last updated: ' + tick + 's ago';
}, 30000);

// ===== LIVE POLL (stub) =====
// Would fetch from /api/live — endpoint not built yet.
function pollLive() {
  console.warn('Live endpoint not implemented yet.');
}

renderStats();
renderVessels();
renderAlerts();
renderAdvisories();
setInterval(pollLive, 15000);
