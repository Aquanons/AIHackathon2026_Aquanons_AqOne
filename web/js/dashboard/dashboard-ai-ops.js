(function (ns) {
  'use strict';
  if (!ns.ready) return;
  var authFetch = ns.authFetch;
  var incidents = ns.incidents;
  var map = ns.map;

  // ===== AI OPERATIONS =====
  var aiContoursLayer = L.layerGroup().addTo(map);
  var aiSquallLayer = L.layerGroup().addTo(map);
  var aiRefreshTimer = null;

  var aiColors = {
    contour95: '#ef4444',
    contour75: '#f59e0b',
    contour50: '#facc15',
    track: '#2563eb',
    squall: '#22c55e'
  };

  function aiFetchJson(path) {
    return authFetch(path)
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      });
  }

  function aiStatusClass(status) {
    var map = { alert: 'status-alert', overdue: 'status-overdue', watch: 'status-watch', normal: 'status-normal' };
    return map[status] || 'status-normal';
  }

  function aiRiskPriority(status) {
    return ({ alert: 0, overdue: 1, watch: 2, normal: 3 })[status] ?? 9;
  }

  function clearAiDriftLayers() {
    aiContoursLayer.clearLayers();
    updateAiMapKey();
  }

  function clearAiSquallLayers() {
    aiSquallLayer.clearLayers();
    updateAiMapKey();
  }

  function updateAiMapKey() {
    var key = document.getElementById('ai-map-key');
    if (!key) return;
    key.style.display = 'none';
  }

  // Banner count and header badge follow the live squall feed. The cutoff is
  // the model's own decision threshold, carried in the payload - not a value
  // invented on the frontend.
  function updateSquallBanner(detections, threshold) {
    var rows = Array.isArray(detections) ? detections : [];
    var cutoff = typeof threshold === 'number' ? threshold : 0;
    var returnNow = rows.filter(function (row) {
      return Number(row.probability || 0) >= cutoff;
    });

    var countEl = document.getElementById('banner-squall-count');
    if (countEl) countEl.textContent = String(returnNow.length);

    var statusEl = document.getElementById('squall-status');
    if (!statusEl) return;
    statusEl.classList.remove('squall-watch', 'squall-return');
    if (returnNow.length) {
      statusEl.textContent = 'RETURN NOW';
      statusEl.classList.add('squall-return');
    } else if (rows.length) {
      statusEl.textContent = 'WATCH';
      statusEl.classList.add('squall-watch');
    } else {
      statusEl.textContent = 'MONITORING';
    }
  }

  function renderDriftContours(payload) {
    clearAiDriftLayers();
    var prediction = payload && payload.prediction;
    var incident = payload && payload.incident;
    var track = (payload && payload.ground_truth_track) || [];
    var metaEl = document.getElementById('ai-drift-meta');

    // The response carries two contour sets. `prediction.contours` is the raw
    // Monte Carlo output - the prior, which never changes. `payload.contours`
    // is computed from the posterior grid and therefore reflects any sectors
    // already searched and eliminated.
    //
    // We previously drew the prior, which meant a dispatcher could report "we
    // searched here, nothing found", the posterior would correctly update in
    // the database, and the map would carry on showing the original search
    // area. The whole point of Bayesian re-tasking was invisible.
    var contours = (payload && payload.contours && payload.contours.length)
      ? payload.contours
      : (prediction && prediction.contours);

    if (!contours || !contours.length) {
      if (metaEl) metaEl.textContent = 'No drift contours available for the selected incident.';
      return;
    }

    var contourBounds = L.latLngBounds([]);

    contours.forEach(function (feature) {
      var mass = feature.properties && feature.properties.mass;
      var contourLabel = mass >= 0.9 ? '95% search area' : (mass >= 0.7 ? '75% search area' : '50% search area');
      var color = mass >= 0.9 ? aiColors.contour95 : (mass >= 0.7 ? aiColors.contour75 : aiColors.contour50);
      var layer = L.geoJSON(feature, {
        pane: 'aiContoursPane',
        style: function () {
          return {
            color: color,
            weight: mass >= 0.9 ? 3 : 2.25,
            opacity: 0.95,
            fillColor: color,
            fillOpacity: mass >= 0.9 ? 0.12 : (mass >= 0.7 ? 0.10 : 0.08),
            dashArray: mass >= 0.9 ? '2 4' : ''
          };
        },
        onEachFeature: function (feat, lyr) {
          // The incident id is named in the tooltip so a large red polygon can
          // never be mistaken for a live emergency. These are replayed
          // synthetic incidents; the map should say so where someone hovers.
          lyr.bindTooltip(
            contourLabel +
            (incident ? ' · replayed incident #' + incident.id + (incident.is_synthetic ? ' (synthetic)' : '') : ''),
            {
              sticky: true,
              direction: 'center',
              className: 'drift-incident-label'
            }
          );
        }
      });
      layer.addTo(aiContoursLayer);
      contourBounds.extend(layer.getBounds());
    });

    if (track.length) {
      var trackLatLngs = track.map(function (point) {
        return [point.lat, point.lon];
      });
      var trackLine = L.polyline(trackLatLngs, {
        pane: 'aiTrackPane',
        color: aiColors.track,
        weight: 4,
        opacity: 0.95,
        dashArray: '10 8',
        lineCap: 'round'
      }).addTo(aiContoursLayer);
      trackLine.bindTooltip('Ground truth track', {
        sticky: true,
        direction: 'top',
        className: 'squall-track-label'
      });
      contourBounds.extend(trackLine.getBounds());
    }

    // Sectors already searched, drawn as hatched grey boxes. Seeing where has
    // been eliminated is half the value of a probability map - otherwise the
    // dispatcher cannot tell which part of the remaining area is new.
    //
    // Sector bounds arrive in metres relative to the posterior grid's origin,
    // so they are converted back on the same local tangent plane the backend
    // used (see KM_PER_DEG_LAT in backend/app/ai/drift.py).
    var grid = payload && payload.posterior_grid;
    var origin = grid && grid.origin;
    var sectors = (payload && payload.search_sectors) || [];
    if (origin && sectors.length) {
      var mPerDegLat = 110574.0;
      var mPerDegLon = 111320.0 * Math.cos(origin.lat * Math.PI / 180);
      sectors.forEach(function (sector) {
        var south = origin.lat + sector.y_min_m / mPerDegLat;
        var north = origin.lat + sector.y_max_m / mPerDegLat;
        var west = origin.lon + sector.x_min_m / mPerDegLon;
        var east = origin.lon + sector.x_max_m / mPerDegLon;
        var box = L.rectangle([[south, west], [north, east]], {
          pane: 'aiContoursPane',
          color: '#94a3b8',
          weight: 1.5,
          opacity: 0.9,
          fillColor: '#64748b',
          fillOpacity: 0.22,
          dashArray: '4 4'
        }).addTo(aiContoursLayer);
        var pod = typeof sector.detection_probability === 'number'
          ? Math.round(sector.detection_probability * 100) + '% detection probability'
          : 'searched';
        box.bindTooltip('Searched — ' + pod, {
          sticky: true,
          direction: 'center',
          className: 'drift-incident-label'
        });
      });
    }

    if (contourBounds.isValid()) {
      map.fitBounds(contourBounds.pad(0.12), { animate: true, duration: 0.9, maxZoom: 14 });
    }

    if (metaEl && incident) {
      var incidentTime = incident.last_contact_at ? new Date(incident.last_contact_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '--';

      // These four came down the wire on every request and were thrown away.
      // They are what turns a coloured blob into a forecast a dispatcher can
      // reason about - and, in the case of the current source, they are how we
      // stay honest on stage about which parts are real.
      var bits = [];

      if (prediction && prediction.object_class) {
        bits.push('Drift class: <strong>' + ns._escHtml(String(prediction.object_class).replace(/_/g, ' ')) + '</strong>');
      }

      // Share of particles whose current came from real buoy observations
      // rather than the synthetic fallback field. 0% is not a failure - it is
      // the truthful state until buoys are in the water - so it is labelled
      // rather than hidden.
      if (typeof payload.observation_fraction === 'number') {
        var pct = Math.round(payload.observation_fraction * 100);
        bits.push(
          pct > 0
            ? 'Currents: <strong>' + pct + '% from buoy observations</strong>'
            : 'Currents: <strong>simulated</strong> (no buoy observations yet)'
        );
      }

      if (prediction && prediction.wind_source) {
        bits.push('Wind: ' + ns._escHtml(prediction.wind_source) +
          (prediction.degraded ? ' <span class="drift-degraded">(degraded — live wind unavailable)</span>' : ''));
      }

      var searched = (payload && payload.search_sectors) || [];
      if (searched.length) {
        bits.push('<strong>' + searched.length + '</strong> sector' + (searched.length === 1 ? '' : 's') +
          ' searched — contours show the updated posterior');
      }

      metaEl.innerHTML =
        (incident.is_synthetic
          ? '<span class="drift-replay-badge">REPLAY — SYNTHETIC INCIDENT</span><br>'
          : '') +
        '<strong>Incident #' + incident.id + '</strong> · Vessel ' + ns._escHtml(incident.vessel_id) + '<br>' +
        'Last contact: ' + incidentTime + ' · ' + ns._escHtml(incident.abnormal_reason || 'unknown') + '<br>' +
        (bits.length ? bits.join(' · ') + '<br>' : '') +
        'Track labeled as ground truth for synthetic evaluation.';
    }

    updateAiMapKey();
  }

  function renderDriftIncidentList(items) {
    var select = document.getElementById('ai-drift-select');
    if (!select) return;
    select.innerHTML = '';
    if (!items || !items.length) {
      select.innerHTML = '<option value="">No incidents available</option>';
      var emptyMeta = document.getElementById('ai-drift-meta');
      if (emptyMeta) emptyMeta.textContent = 'No drift incidents were returned by the backend.';
      clearAiDriftLayers();
      return;
    }

    items.forEach(function (item, index) {
      var option = document.createElement('option');
      option.value = String(item.id);
      option.textContent = 'Incident #' + item.id + ' · ' + item.vessel_id + ' · ' + (item.abnormal_reason || 'unknown');
      if (index === 0) option.selected = true;
      select.appendChild(option);
    });
  }

  function renderRiskFeed(rows) {
    var list = document.getElementById('ai-risk-list');
    var count = document.getElementById('ai-risk-count');
    if (!list) return;
    if (!rows || !rows.length) {
      list.innerHTML = '<div class="ai-empty-state">No active vessel risk rows available.</div>';
      if (count) count.textContent = '0';
      return;
    }

    var sorted = rows.slice().sort(function (a, b) {
      var diff = aiRiskPriority(a.status) - aiRiskPriority(b.status);
      if (diff !== 0) return diff;
      return (b.score || 0) - (a.score || 0);
    });

    if (count) count.textContent = String(sorted.length);

    list.innerHTML = sorted.map(function (row, index) {
      var score = typeof row.score === 'number' ? row.score.toFixed(2) : String(row.score || '--');
      var lastSeen = row.last_contact_at ? new Date(row.last_contact_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '--';
      var expectedBuoy = row.expected_next_buoy_id || 'n/a';
      var statusLabel = (row.status || 'normal').toUpperCase();
      var factors = Array.isArray(row.factors) ? row.factors : [];
      return '' +
        '<details class="ai-risk-item"' + (index === 0 ? ' open' : '') + '>' +
          '<summary>' +
            '<div class="ai-risk-main">' +
              '<div class="ai-risk-title">' + ns._escHtml(row.vessel_id) + ' · Trip ' + ns._escHtml(row.trip_id) + '</div>' +
              '<div class="ai-risk-meta">Expected buoy ' + ns._escHtml(expectedBuoy) + ' · Last contact ' + ns._escHtml(lastSeen) + '</div>' +
            '</div>' +
            '<div class="ai-risk-score">' + score + '<span class="ai-risk-status ' + aiStatusClass(row.status) + '">' + statusLabel + '</span></div>' +
          '</summary>' +
          '<div class="ai-risk-details">' +
            '<div class="ai-factor-list">' + factors.map(function (factor) {
              return '<div class="ai-factor-row">' +
                '<div class="ai-factor-name">' + ns._escHtml(factor.name || 'factor') + '</div>' +
                '<div class="ai-factor-value">' + Number(factor.contribution || 0).toFixed(3) + '</div>' +
                '<div class="ai-factor-explainer">' + ns._escHtml(factor.explanation || '') + '</div>' +
              '</div>';
            }).join('') + '</div>' +
          '</div>' +
        '</details>';
    }).join('');
  }

  function renderSquallChart(traceSeries) {
    var chart = document.getElementById('ai-trace-chart');
    var legend = document.getElementById('ai-trace-legend');
    if (!chart || !legend) return;
    if (!traceSeries || !traceSeries.length) {
      legend.innerHTML = '';
      chart.innerHTML = '<div class="ai-empty-state">Pressure trace unavailable.</div>';
      return;
    }

    var minPressure = Infinity;
    var maxPressure = -Infinity;
    var maxPoints = 0;
    traceSeries.forEach(function (series) {
      series.points.forEach(function (point) {
        minPressure = Math.min(minPressure, point.pressure_hpa);
        maxPressure = Math.max(maxPressure, point.pressure_hpa);
      });
      maxPoints = Math.max(maxPoints, series.points.length);
    });
    if (!isFinite(minPressure) || !isFinite(maxPressure) || maxPoints < 2) {
      legend.innerHTML = '';
      chart.innerHTML = '<div class="ai-empty-state">Pressure trace unavailable.</div>';
      return;
    }
    var pad = Math.max(0.8, (maxPressure - minPressure) * 0.2);
    minPressure -= pad;
    maxPressure += pad;

    var width = 320;
    var height = 120;
    var innerWidth = 282;
    var innerHeight = 78;
    var left = 20;
    var top = 16;

    function projectX(index, total) {
      return left + (total <= 1 ? innerWidth / 2 : (index / (total - 1)) * innerWidth);
    }

    function projectY(value) {
      return top + (maxPressure - value) / (maxPressure - minPressure) * innerHeight;
    }

    var svg = [
      '<svg viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="Pressure trace chart">',
      '<line class="ai-trace-axis" x1="20" y1="16" x2="20" y2="94"></line>',
      '<line class="ai-trace-axis" x1="20" y1="94" x2="302" y2="94"></line>'
    ];

    var ticks = [minPressure, (minPressure + maxPressure) / 2, maxPressure];
    ticks.forEach(function (tick) {
      var y = projectY(tick);
      svg.push('<line class="ai-trace-axis" x1="20" y1="' + y.toFixed(1) + '" x2="302" y2="' + y.toFixed(1) + '" stroke-dasharray="3 4"></line>');
      svg.push('<text x="6" y="' + (y + 3).toFixed(1) + '" fill="currentColor" font-size="9">' + tick.toFixed(1) + '</text>');
    });

    traceSeries.forEach(function (series, seriesIndex) {
      var color = series.color;
      var points = series.points;
      var path = points.map(function (point, index) {
        return (index === 0 ? 'M' : 'L') + projectX(index, points.length).toFixed(1) + ',' + projectY(point.pressure_hpa).toFixed(1);
      }).join(' ');
      svg.push('<path class="ai-trace-line" d="' + path + '" stroke="' + color + '"></path>');
      svg.push('<circle cx="' + projectX(points.length - 1, points.length).toFixed(1) + '" cy="' + projectY(points[points.length - 1].pressure_hpa).toFixed(1) + '" r="2.8" fill="' + color + '"></circle>');
      if (seriesIndex === 0) {
        svg.push('<text x="24" y="10" fill="currentColor" font-size="9">hPa</text>');
      }
    });

    svg.push('</svg>');
    chart.innerHTML = svg.join('');

    legend.innerHTML = traceSeries.map(function (series) {
      return '<div class="ai-trace-legend-item"><span class="ai-trace-swatch" style="background:' + series.color + '"></span><span>' + ns._escHtml(series.label) + '</span></div>';
    }).join('');
    updateSquallLegendVisibility();
  }

  function updateSquallLegendVisibility() {
    var legend = document.getElementById('ai-trace-legend');
    if (!legend) return;
    var hasContent = legend.children.length > 0;
    legend.style.display = hasContent ? '' : 'none';
  }

  function renderSquallWatch(payload, traceSeries) {
    var summary = document.getElementById('ai-squall-summary');
    if (!summary) return;
    clearAiSquallLayers();

    var detections = payload && payload.detections ? payload.detections : [];
    var threshold = payload && typeof payload.threshold === 'number' ? payload.threshold : undefined;
    updateSquallBanner(detections, threshold);
    if (!detections.length) {
      summary.innerHTML = '<div class="ai-empty-state">No active squall detections at the moment.</div>';
      renderSquallChart([]);
      updateAiMapKey();
      return;
    }

    var detection = detections[0];
    var arrival = Array.isArray(detection.arrival_by_buoy) ? detection.arrival_by_buoy : [];
    var polygon = detection.affected_polygon;

    if (polygon && polygon.geometry) {
      L.geoJSON(polygon, {
        pane: 'aiSquallPane',
        style: function () {
          return {
            color: aiColors.squall,
            weight: 3,
            fillColor: aiColors.squall,
            fillOpacity: 0.10,
            dashArray: '6 6'
          };
        },
        onEachFeature: function (feat, lyr) {
          lyr.bindTooltip('Squall watch polygon', {
            sticky: true,
            direction: 'center',
            className: 'drift-incident-label'
          });
        }
      }).addTo(aiSquallLayer);
    }

    var bounds = aiSquallLayer.getBounds();
    if (!aiContoursLayer.getLayers().length && bounds.isValid()) {
      map.fitBounds(bounds.pad(0.15), { animate: true, duration: 0.9, maxZoom: 14 });
    }

    var asOf = detection.as_of ? new Date(detection.as_of).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '--';
    summary.innerHTML =
      '<div class="ai-squall-meta-row"><span>Probability</span><strong>' + (Number(detection.probability || 0) * 100).toFixed(0) + '%</strong></div>' +
      '<div class="ai-squall-meta-row"><span>Confidence</span><strong>' + (Number(detection.confidence || 0) * 100).toFixed(0) + '%</strong></div>' +
      '<div class="ai-squall-meta-row"><span>Bearing</span><strong>' + Number((detection.propagation && detection.propagation.bearing_deg) || 0).toFixed(0) + '°</strong></div>' +
      '<div class="ai-squall-meta-row"><span>As of</span><strong>' + ns._escHtml(asOf) + '</strong></div>' +
      '<div class="ai-squall-meta-row"><span>Arrival window</span><strong>' + (arrival.length ? ns._escHtml(String(arrival[0].arrival_minutes)) + ' min first arrival' : 'n/a') + '</strong></div>';

    renderSquallChart(traceSeries);
    updateAiMapKey();
  }

  function loadDriftIncidentDetail(incidentId) {
    if (!incidentId) {
      clearAiDriftLayers();
      return Promise.resolve();
    }
    return aiFetchJson('/api/ai/drift/incident/' + encodeURIComponent(incidentId) + '?forecast_hours=24')
      .then(function (payload) {
        renderDriftContours(payload);
      })
      .catch(function (err) {
        console.warn('[AqOne] Drift incident load failed:', err.message);
        var metaEl = document.getElementById('ai-drift-meta');
        if (metaEl) metaEl.textContent = 'Unable to load the drift map right now.';
        clearAiDriftLayers();
      });
  }

  function loadSquallTrace(payload) {
    var detection = payload && payload.detections && payload.detections[0];
    var arrival = detection && detection.arrival_by_buoy ? detection.arrival_by_buoy.slice(0, 3) : [];
    if (!arrival.length) {
      renderSquallWatch(payload, []);
      return Promise.resolve();
    }

    return Promise.all(arrival.map(function (item, index) {
      return aiFetchJson('/api/ai/squall/buoy/' + encodeURIComponent(item.buoy_id))
        .then(function (detail) {
          return {
            label: detail.buoy.id,
            color: ['#2563eb', '#ef4444', '#f59e0b'][index % 3],
            points: detail.trace || []
          };
        })
        .catch(function () {
          return {
            label: item.buoy_id,
            color: ['#2563eb', '#ef4444', '#f59e0b'][index % 3],
            points: []
          };
        });
    })).then(function (series) {
      renderSquallWatch(payload, series.filter(function (item) { return item.points.length; }));
    });
  }

  function initAIOperations() {
    var driftSelect = document.getElementById('ai-drift-select');
    var driftMeta = document.getElementById('ai-drift-meta');
    var aiRiskList = document.getElementById('ai-risk-list');
    var aiSquallSummary = document.getElementById('ai-squall-summary');

    if (driftMeta) driftMeta.textContent = 'Fetching live incidents...';
    if (aiRiskList) aiRiskList.innerHTML = '<div class="ai-empty-state">Loading vessel risk feed...</div>';
    if (aiSquallSummary) aiSquallSummary.innerHTML = '<div class="ai-empty-state">Loading squall watch...</div>';

    Promise.allSettled([
      aiFetchJson('/api/ai/anomaly/active'),
      aiFetchJson('/api/ai/drift/incidents'),
      aiFetchJson('/api/ai/squall/current')
    ]).then(function (results) {
      var riskResult = results[0];
      var incidentsResult = results[1];
      var squallResult = results[2];

      if (riskResult.status === 'fulfilled') {
        renderRiskFeed(riskResult.value || []);
      } else {
        renderRiskFeed([]);
      }

      if (incidentsResult.status === 'fulfilled') {
        renderDriftIncidentList(incidentsResult.value || []);
      } else {
        renderDriftIncidentList([]);
      }

      var selectedIncidentId = driftSelect && driftSelect.value;
      var incidentPromise = selectedIncidentId ? loadDriftIncidentDetail(selectedIncidentId) : Promise.resolve();
      if (!selectedIncidentId && driftSelect && driftSelect.options.length) {
        selectedIncidentId = driftSelect.options[0].value;
        driftSelect.value = selectedIncidentId;
        incidentPromise = loadDriftIncidentDetail(selectedIncidentId);
      }

      if (driftSelect) {
        driftSelect.addEventListener('change', function () {
          loadDriftIncidentDetail(driftSelect.value);
        });
      }

      if (squallResult.status === 'fulfilled') {
        return loadSquallTrace(squallResult.value || { detections: [] }).then(updateSquallLegendVisibility);
      }
      renderSquallWatch({ detections: [] }, []);
      updateSquallLegendVisibility();
      return incidentPromise;
    }).catch(function () {
      renderRiskFeed([]);
      renderDriftIncidentList([]);
      clearAiDriftLayers();
      clearAiSquallLayers();
      renderSquallWatch({ detections: [] }, []);
      updateSquallLegendVisibility();
    });

    if (aiRefreshTimer) clearInterval(aiRefreshTimer);
    aiRefreshTimer = setInterval(function () {
      aiFetchJson('/api/ai/anomaly/active').then(renderRiskFeed).catch(function () { renderRiskFeed([]); });
      aiFetchJson('/api/ai/squall/current').then(loadSquallTrace).then(updateSquallLegendVisibility).catch(function () { clearAiSquallLayers(); renderSquallWatch({ detections: [] }, []); updateSquallLegendVisibility(); });
      var currentSelect = document.getElementById('ai-drift-select');
      if (currentSelect && currentSelect.value) loadDriftIncidentDetail(currentSelect.value);
    }, 60000);
  }

  initAIOperations();


  // ===== EXIT LOADING =====
  window.addEventListener('load', function () {
    setTimeout(function () {
      document.getElementById('loading-overlay').classList.add('hidden');
    }, 800);
  });

  ns.aiContoursLayer = aiContoursLayer;
  ns.aiSquallLayer = aiSquallLayer;
  ns.aiRefreshTimer = aiRefreshTimer;
  ns.aiColors = aiColors;
  ns.aiFetchJson = aiFetchJson;
  ns.aiStatusClass = aiStatusClass;
  ns.aiRiskPriority = aiRiskPriority;
  ns.clearAiDriftLayers = clearAiDriftLayers;
  ns.clearAiSquallLayers = clearAiSquallLayers;
  ns.updateAiMapKey = updateAiMapKey;
  ns.updateSquallBanner = updateSquallBanner;
  ns.renderDriftContours = renderDriftContours;
  ns.renderDriftIncidentList = renderDriftIncidentList;
  ns.renderRiskFeed = renderRiskFeed;
  ns.renderSquallChart = renderSquallChart;
  ns.updateSquallLegendVisibility = updateSquallLegendVisibility;
  ns.renderSquallWatch = renderSquallWatch;
  ns.loadDriftIncidentDetail = loadDriftIncidentDetail;
  ns.loadSquallTrace = loadSquallTrace;
  ns.initAIOperations = initAIOperations;

})(window.AqOneDashboard = window.AqOneDashboard || {});
