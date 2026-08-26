(function (ns) {
  'use strict';
  if (!ns.ready) return;
  var map = ns.map;
  var hotspotLayer = ns.hotspotLayer;
  var API_BASE = ns.API_BASE;
  var escapeHtml = ns.escapeHtml;
  var statusText = document.getElementById('hotspot-status-text');
  var HOTSPOT_POLL_MS = 300000;

  function escaped(value) {
    return escapeHtml(String(value == null ? '' : value));
  }

  function formatGeneratedAt(value) {
    var date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value == null ? '' : value) : date.toLocaleString();
  }

  function colourForScore(score) {
    if (score < 0.25) return { fill: '#1e3a5f', opacity: 0.15 };
    if (score <= 0.50) return { fill: '#2563eb', opacity: 0.22 };
    if (score <= 0.75) return { fill: '#38bdf8', opacity: 0.30 };
    return { fill: '#7dd3fc', opacity: 0.38 };
  }

  function cellPopup(cell, payload) {
    var score = Number(cell.score);
    var observations = Number(cell.observations);
    var lat = Number(cell.center_lat);
    var lon = Number(cell.center_lon);
    var size = Number(cell.cell_size_degrees);
    var rows = [
      '<div class="popup-row"><span>Relative activity</span><span>' + escaped(Math.round(score * 100) + '%') + '</span></div>',
      '<div class="popup-row"><span>Catch reports</span><span>' + escaped(observations) + '</span></div>',
      '<div class="popup-row"><span>Cell centre</span><span>' + escaped(lat.toFixed(3) + '\u00b0, ' + lon.toFixed(3) + '\u00b0') + '</span></div>',
      '<div class="popup-row"><span>Cell size</span><span>' + escaped((size * 111).toFixed(1) + ' km') + '</span></div>'
    ].join('');
    var provenance = escaped(payload.model_version) + ' · ' +
      escaped(payload.window_days) + '-day window · min ' +
      escaped(payload.min_reporters) + ' reporters · generated ' +
      escaped(formatGeneratedAt(payload.generated_at));
    return rows +
      '<div class="popup-divider"></div>' +
      '<div style="font-size:10px;line-height:1.45;color:#9ca3af;">' + provenance + '</div>' +
      '<div style="margin-top:7px"><span class="popup-badge badge-warn">RELATIVE ACTIVITY · NOT A CATCH PREDICTION</span></div>';
  }

  function renderHotspots(payload) {
    hotspotLayer.clearLayers();
    if (payload === null) {
      if (statusText) statusText.textContent = 'Hotspot surface unavailable';
      return;
    }
    if (!payload.cells || payload.cells.length === 0) {
      if (statusText) {
        statusText.textContent = 'No cells meet the ' + payload.min_reporters +
          '-reporter threshold in the last ' + payload.window_days + ' days';
      }
      return;
    }
    if (statusText) statusText.textContent = 'Consented catch logs';
    payload.cells.forEach(function (cell) {
      var lat = Number(cell.center_lat);
      var lon = Number(cell.center_lon);
      var halfEdge = Number(cell.cell_size_degrees) / 2;
      var score = Number(cell.score);
      var colour = colourForScore(score);
      var activity = escaped(Math.round(score * 100) + '%');
      var reports = escaped(cell.observations);
      var rectangle = L.rectangle([
        [lat - halfEdge, lon - halfEdge],
        [lat + halfEdge, lon + halfEdge]
      ], {
        weight: 1,
        color: colour.fill,
        fillColor: colour.fill,
        fillOpacity: colour.opacity,
        className: 'hotspot-cell'
      });
      rectangle.bindTooltip('Relative activity ' + activity + ' · ' + reports + ' catch reports', {
        direction: 'top',
        sticky: true
      });
      rectangle.bindPopup(cellPopup(cell, payload));
      hotspotLayer.addLayer(rectangle);
    });
  }

  async function fetchHotspots() {
    try {
      var response = await fetch(API_BASE + '/api/public/hotspots');
      if (!response.ok) throw new Error('HTTP ' + response.status);
      var payload = await response.json();
      if (!payload || !Array.isArray(payload.cells)) throw new Error('Invalid hotspot response');
      renderHotspots(payload);
    } catch (error) {
      renderHotspots(null);
      console.warn('[AqOne] Hotspot surface unavailable:', error.message);
    }
  }

  hotspotLayer.addTo(map);
  fetchHotspots();
  setInterval(fetchHotspots, HOTSPOT_POLL_MS);

})(window.AqOneDashboard = window.AqOneDashboard || {});
