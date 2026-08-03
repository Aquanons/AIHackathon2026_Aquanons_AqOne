'use strict';

// ===== CONFIG =====
var center = [11.65, 122.43];
var zoom = 12;

// ===== MAP =====
var map = L.map('map').setView(center, zoom);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: 'OpenStreetMap'
}).addTo(map);

// ===== VESSELS (hardcoded for now, backend not built yet) =====
var vessels = [
  { id: 'V-001', name: 'Bangka ni Mang Juan', lat: 11.7059, lng: 122.3693 },
  { id: 'V-002', name: 'Bangka ni Kapitan',   lat: 11.6516, lng: 122.4328 },
  { id: 'V-003', name: 'Bangka',              lat: 0,        lng: 0 }
];

// ===== FACILITIES (placeholders) =====
var facilities = [
  { name: 'MDRRMO Kalibo', lat: 11.7059, lng: 122.3693 },
  { name: 'New Washington Fish Port', lat: 11.6516, lng: 122.4328 }
];

// ===== MARKERS =====
vessels.forEach(function (v) {
  L.marker([v.lat, v.lng]).addTo(map)
    .bindPopup('<b>' + v.name + '</b><br>' + v.id);
});

facilities.forEach(function (f) {
  L.circle([f.lat, f.lng], { radius: 500, color: '#38bdf8' }).addTo(map)
    .bindPopup(f.name);
});

// ===== STATS =====
// BUG: wrong capitalization — getElementbyId is not a function, kills the rest of the script
document.getElementbyId('vessel-count').textContent = vessels.length;

// BUG: 'activeAlerts' is never defined
document.getElementById('alert-count').textContent = activeAlerts.length;

// ===== REFRESH =====
// Never wired up because the script crashed above.
function refreshData() {
  var mult = Math.random() * 100;
  document.getElementById('vessel-count').textContent = vessels.length * mult;
  document.getElementById('alert-count').textContent = Math.round(mult);
}

// BUG: fetchData is defined but never called, and the endpoint doesn't exist yet
function fetchData() {
  fetch(API_BASE + '/vessels')
    .then(function (res) { return res.json(); })
    .then(function (data) { console.log(data); })
    .catch(function (err) { console.log(err); });
}
