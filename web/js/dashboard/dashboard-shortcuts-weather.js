(function (ns) {
  'use strict';
  if (!ns.ready) return;
  var showToast = ns.showToast;
  var activatePinMode = ns.activatePinMode;
  var deactivatePinMode = ns.deactivatePinMode;
  var activatePanMode = ns.activatePanMode;
  var measureClearAll = ns.measureClearAll;
  var activateMeasureMode = ns.activateMeasureMode;
  var deactivateMeasureMode = ns.deactivateMeasureMode;
  var openPanel = ns.openPanel;
  var closePanel = ns.closePanel;
  var sosDrawer = ns.sosDrawer;
  var closeSOSDrawer = ns.closeSOSDrawer;
  var updateStats = ns.updateStats;

  // ===== KEYBOARD SHORTCUTS =====
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if (sosDrawer.classList.contains('open')) { closeSOSDrawer(); return; }
      if (ns.emergencyOverlay.classList.contains('active')) { ns.closeEmergencyModal(); return; }
      if (ns.advisoryOverlay.classList.contains('active')) { ns.closeAdvisoryModal(); return; }
      if (ns.deleteOverlay.classList.contains('active')) { ns.closeDeleteModal(); return; }
      if (ns.pinModeActive)    { deactivatePinMode(); activatePanMode(); return; }
      if (ns.measureActive)    { deactivateMeasureMode(); measureClearAll(); closePanel(); activatePanMode(); return; }
      if (ns.activePanel)      { closePanel(); }
    }
    if (e.key === 'f' && !e.ctrlKey && !e.metaKey && document.activeElement.tagName !== 'INPUT') {
      document.getElementById('btn-fullscreen').click();
    }
    if (e.key === 'b' && !e.ctrlKey && !e.metaKey && document.activeElement.tagName !== 'INPUT') {
      if (ns.activePanel === 'layers') { closePanel(); } else { openPanel('layers'); }
    }
    if (e.key === 'h' && !e.ctrlKey && !e.metaKey && document.activeElement.tagName !== 'INPUT') {
      if (!ns.panModeActive) {
        if (ns.pinModeActive) { deactivatePinMode(); }
        if (ns.measureActive) { deactivateMeasureMode(); measureClearAll(); if (ns.activePanel === 'measure') closePanel(); }
        activatePanMode();
      }
    }
    if (e.key === 'p' && !e.ctrlKey && !e.metaKey && document.activeElement.tagName !== 'INPUT') {
      if (ns.pinModeActive) { deactivatePinMode(); activatePanMode(); } else {
        if (ns.measureActive) { deactivateMeasureMode(); measureClearAll(); if (ns.activePanel === 'measure') closePanel(); }
        activatePinMode();
      }
    }
    if (e.key === 'm' && !e.ctrlKey && !e.metaKey && document.activeElement.tagName !== 'INPUT') {
      if (ns.measureActive) { deactivateMeasureMode(); measureClearAll(); closePanel(); activatePanMode(); }
      else               { if (ns.pinModeActive) { deactivatePinMode(); } openPanel('measure'); activateMeasureMode(); }
    }
  });

  updateStats();


  // ===== WEATHER =====
  var wcBody = document.getElementById('wc-body');
  const WConditions_INTERVAL_MS = 300000;
  const WEATHER_CACHE_KEY = 'aqone-live-weather-new-washington-v2';

  var SAFETY_THRESHOLDS = {
    safe:     { windMax: 20, waveMax: 1.0 },
    caution:  { windMax: 40, waveMax: 2.0 },
    advisory: { windMax: 60, waveMax: 3.0 }
  };

  var SAFETY_TIERS = {
    safe:     { label: 'MODEL: LOWER RISK',          cls: 'wc-safety-safe',     color: '#2ecc71' },
    caution:  { label: 'MODEL: CAUTION',             cls: 'wc-safety-caution',  color: '#f1c40f' },
    advisory: { label: 'MODEL: SMALL CRAFT CAUTION', cls: 'wc-safety-advisory', color: '#e67e22' },
    danger:   { label: 'MODEL: HIGH MARINE RISK',    cls: 'wc-safety-danger',   color: '#e74c3c' },
    unknown:  { label: 'CONDITIONS UNKNOWN',     cls: 'wc-safety-unknown',  color: '#7f8c8d' }
  };

  function classifySafety(windKmh, waveM) {
    if (windKmh === null && waveM === null) return SAFETY_TIERS.unknown;
    var w = windKmh !== null ? windKmh : 0;
    var h = waveM !== null ? waveM : 0;
    var t = SAFETY_THRESHOLDS;
    if (windKmh === null || waveM === null) {
      if (w >= t.advisory.windMax || h >= t.advisory.waveMax) return SAFETY_TIERS.danger;
      if (w >= t.caution.windMax  || h >= t.caution.waveMax)  return SAFETY_TIERS.advisory;
      if (w >= t.safe.windMax     || h >= t.safe.waveMax)     return SAFETY_TIERS.caution;
      return SAFETY_TIERS.unknown;
    }
    if (w >= t.advisory.windMax || h >= t.advisory.waveMax) return SAFETY_TIERS.danger;
    if (w >= t.caution.windMax  || h >= t.caution.waveMax)  return SAFETY_TIERS.advisory;
    if (w >= t.safe.windMax     || h >= t.safe.waveMax)     return SAFETY_TIERS.caution;
    return SAFETY_TIERS.safe;
  }

  function degToCompass(deg) {
    var dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
    return dirs[Math.round(deg / 22.5) % 16];
  }

  var WMO_MAP = {
    0:  { label: 'Clear Sky',        cls: '' },
    1:  { label: 'Mainly Clear',     cls: '' },
    2:  { label: 'Partly Cloudy',    cls: '' },
    3:  { label: 'Overcast',         cls: 'wc-icon-cloud' },
    45: { label: 'Foggy',            cls: 'wc-icon-fog' },
    48: { label: 'Rime Fog',         cls: 'wc-icon-fog' },
    51: { label: 'Light Drizzle',    cls: 'wc-icon-rain' },
    53: { label: 'Moderate Drizzle', cls: 'wc-icon-rain' },
    55: { label: 'Dense Drizzle',    cls: 'wc-icon-rain' },
    56: { label: 'Light Freezing Drizzle', cls: 'wc-icon-rain' },
    57: { label: 'Dense Freezing Drizzle', cls: 'wc-icon-rain' },
    61: { label: 'Slight Rain',      cls: 'wc-icon-rain' },
    63: { label: 'Moderate Rain',    cls: 'wc-icon-rain' },
    65: { label: 'Heavy Rain',       cls: 'wc-icon-rain' },
    66: { label: 'Light Freezing Rain',  cls: 'wc-icon-rain' },
    67: { label: 'Heavy Freezing Rain',  cls: 'wc-icon-rain' },
    71: { label: 'Slight Snow',      cls: 'wc-icon-snow' },
    73: { label: 'Moderate Snow',    cls: 'wc-icon-snow' },
    75: { label: 'Heavy Snow',       cls: 'wc-icon-snow' },
    77: { label: 'Snow Grains',      cls: 'wc-icon-snow' },
    80: { label: 'Slight Rain Showers',  cls: 'wc-icon-rain' },
    81: { label: 'Moderate Rain Showers', cls: 'wc-icon-rain' },
    82: { label: 'Violent Rain Showers',  cls: 'wc-icon-rain' },
    85: { label: 'Slight Snow Showers',   cls: 'wc-icon-snow' },
    86: { label: 'Heavy Snow Showers',    cls: 'wc-icon-snow' },
    95: { label: 'Thunderstorm',     cls: 'wc-icon-storm' },
    96: { label: 'Thunderstorm with Hail', cls: 'wc-icon-storm' },
    99: { label: 'Thunderstorm with Heavy Hail', cls: 'wc-icon-storm' }
  };

  function wmoIcon(code) {
    var m = WMO_MAP[code];
    if (!m) return { svg: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>', cls: 'wc-icon-cloud' };
    var svg = '';
    if (m.cls === 'wc-icon-storm') {
      svg = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>';
    } else if (m.cls === 'wc-icon-rain') {
      svg = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/><path d="M8 18l-1 4"/><path d="M12 18l-1 4"/><path d="M16 18l-1 4"/></svg>';
    } else if (m.cls === 'wc-icon-snow') {
      svg = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/><path d="M8 18v2"/><path d="M12 18v2"/><path d="M16 18v2"/></svg>';
    } else if (m.cls === 'wc-icon-fog') {
      svg = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>';
    } else {
      svg = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72l1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>';
    }
    return { svg: svg, cls: m.cls };
  }

  function safetyBadgeHTML(tier) {
    return '<div class="wc-safety-badge ' + tier.cls + '" style="border-color:' + tier.color + '40;color:' + tier.color + ';">' +
      '<span class="wc-safety-dot" style="background:' + tier.color + ';"></span>' +
      tier.label +
    '</div>';
  }

  function renderWeatherCard(data, marineData, meta) {
    var current = data.current || {};
    var marineCurrent = marineData && marineData.current ? marineData.current : {};
    var code = current.weather_code;
    var icon = wmoIcon(code);
    var temp = Math.round(current.temperature_2m);
    var feelsLike = Math.round(current.apparent_temperature);
    var windKmh = Number(current.wind_speed_10m);
    var gustKmh = Number(current.wind_gusts_10m);
    var windDir = degToCompass(current.wind_direction_10m || 0);
    var waveM = Number.isFinite(Number(marineCurrent.wave_height)) ? Number(marineCurrent.wave_height) : null;
    var wavePeriod = Number.isFinite(Number(marineCurrent.wave_period)) ? Number(marineCurrent.wave_period) : null;
    var pressure = Number.isFinite(Number(current.pressure_msl)) ? Number(current.pressure_msl) : null;
    var seaLevel = Number.isFinite(Number(marineCurrent.sea_level_height_msl)) ? Number(marineCurrent.sea_level_height_msl) : null;
    var condText = WMO_MAP[code] ? WMO_MAP[code].label : 'Unknown';
    var safety = classifySafety(Math.max(windKmh || 0, gustKmh || 0), waveM);
    var monitorAlerts = meta && Array.isArray(meta.alerts) ? meta.alerts : [];
    var stale = Boolean(meta && meta.stale);
    var monitorClass = monitorAlerts.length ? 'wc-monitor-danger' : stale ? 'wc-monitor-stale' : 'wc-monitor-safe';
    var monitorText = monitorAlerts.length ?
      monitorAlerts.length + ' incoming severe-weather risk' + (monitorAlerts.length === 1 ? '' : 's') + ' detected' :
      stale ? 'Live monitor paused \u00b7 showing last-known conditions' : '72-hour monitor \u00b7 no severe thresholds detected';
    var observedAt = current.time ? new Date(current.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--';

    wcBody.innerHTML =
      safetyBadgeHTML(safety) +
      '<div class="wc-live-strip"><span class="wc-live-dot ' + (stale ? 'is-stale' : '') + '"></span>' +
        (stale ? 'LAST KNOWN' : 'LIVE MODEL') + ' \u00b7 Updated ' + observedAt + '</div>' +
      '<div class="wc-main">' +
        '<div class="wc-icon ' + icon.cls + '">' + icon.svg + '</div>' +
        '<div class="wc-temp-group">' +
          '<div class="wc-temp">' + temp + '&deg;C</div>' +
          '<div class="wc-condition">' + condText + ' \u00b7 Feels ' + feelsLike + '&deg;</div>' +
        '</div>' +
      '</div>' +
      '<div class="wc-details">' +
        '<div class="wc-detail">' +
          '<span>Wind</span><span class="wc-detail-val">' + windKmh.toFixed(1) + ' / ' + gustKmh.toFixed(1) + ' km/h ' + windDir + '</span>' +
        '</div>' +
        '<div class="wc-detail">' +
          '<span>Waves</span><span class="wc-detail-val">' + (waveM !== null ? waveM.toFixed(2) + ' m / ' + wavePeriod.toFixed(1) + ' s' : '\u2014') + '</span>' +
        '</div>' +
        '<div class="wc-detail">' +
          '<span>Humidity</span><span class="wc-detail-val">' + current.relative_humidity_2m + '%</span>' +
        '</div>' +
        '<div class="wc-detail">' +
          '<span>Pressure</span><span class="wc-detail-val">' + (pressure !== null ? pressure.toFixed(0) + ' hPa' : '\u2014') + '</span>' +
        '</div>' +
        '<div class="wc-detail">' +
          '<span>Sea level</span><span class="wc-detail-val">' + (seaLevel !== null ? seaLevel.toFixed(2) + ' m MSL' : '\u2014') + '</span>' +
        '</div>' +
        '<div class="wc-detail">' +
          '<span>Rain now</span><span class="wc-detail-val">' + Number(current.precipitation || 0).toFixed(1) + ' mm</span>' +
        '</div>' +
      '</div>' +
      '<div class="wc-forecast-monitor ' + monitorClass + '">' + monitorText + '</div>' +
      '<div class="wc-source-row"><span>Open-Meteo weather + marine</span>' +
        '<a href="https://www.pagasa.dost.gov.ph/tropical-cyclone/severe-weather-bulletin" target="_blank" rel="noopener">Verify PAGASA</a></div>';
  }

  function renderForecast(daily) {
    var body = document.getElementById('forecast-body');
    var days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    var html = '<div class="forecast-grid" style="display:flex;gap:4px;">';
    for (var i = 0; i < daily.time.length; i++) {
      var d = new Date(daily.time[i] + 'T12:00:00');
      var dayName = days[d.getDay()];
      var icon = wmoIcon(daily.weather_code[i]);
      var max = Math.round(daily.temperature_2m_max[i]);
      var min = Math.round(daily.temperature_2m_min[i]);
      html += '<div class="forecast-day" style="flex:1;text-align:center;padding:6px 2px;background:rgba(255,255,255,0.04);border-radius:6px;">' +
        '<div style="font-size:10px;font-weight:700;color:var(--text-secondary);margin-bottom:4px;">' + dayName + '</div>' +
        '<div class="' + icon.cls + '" style="color:var(--text-dim);margin-bottom:4px;">' + icon.svg + '</div>' +
        '<div style="font-size:11px;font-weight:700;">' + max + '&deg;</div>' +
        '<div style="font-size:10px;color:var(--text-dim);">' + min + '&deg;</div>' +
      '</div>';
    }
    html += '</div>';
    body.innerHTML = html;
  }

  function renderRainfall(daily) {
    var body = document.getElementById('rainfall-body');
    var days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    var html = '<div class="rainfall-grid" style="display:flex;gap:6px;align-items:flex-end;">';
    var maxPrecip = 1;
    for (var i = 0; i < daily.time.length; i++) {
      if (daily.precipitation_sum[i] > maxPrecip) maxPrecip = daily.precipitation_sum[i];
    }
    for (var i = 0; i < daily.time.length; i++) {
      var d = new Date(daily.time[i] + 'T12:00:00');
      var dayName = days[d.getDay()];
      var precip = daily.precipitation_sum[i] || 0;
      var barH = Math.max(4, (precip / maxPrecip) * 50);
      html += '<div class="rainfall-day" style="flex:1;text-align:center;">' +
        '<div style="font-size:10px;color:var(--text-secondary);margin-bottom:2px;">' + precip.toFixed(1) + '</div>' +
        '<div style="height:54px;display:flex;align-items:flex-end;justify-content:center;">' +
          '<div style="width:100%;max-width:20px;height:' + barH + 'px;background:var(--primary);border-radius:3px 3px 0 0;transition:height 0.3s;"></div>' +
        '</div>' +
        '<div style="font-size:9px;font-weight:600;color:var(--text-dim);margin-top:2px;">' + dayName + '</div>' +
      '</div>';
    }
    html += '</div>';
    body.innerHTML = html;
  }

  function fetchLiveJson(url) {
    var controller = new AbortController();
    var timeout = setTimeout(function () { controller.abort(); }, 25000);
    return fetch(url, { signal: controller.signal })
      .then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.json();
      })
      .finally(function () { clearTimeout(timeout); });
  }

  function readWeatherCache() {
    try {
      var cached = JSON.parse(localStorage.getItem(WEATHER_CACHE_KEY));
      return cached && cached.weather ? cached : null;
    } catch (error) {
      return null;
    }
  }

  function writeWeatherCache(snapshot) {
    try {
      localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify(snapshot));
    } catch (error) {
      console.warn('[AqOne] Could not cache live weather conditions');
    }
  }

  function forecastTimeLabel(value) {
    var time = new Date(value);
    return time.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function buildForecastAlerts(weatherData, marineData) {
    var weather = weatherData.hourly || {};
    var marine = marineData && marineData.hourly ? marineData.hourly : {};
    var marineIndexes = {};
    (marine.time || []).forEach(function (time, index) { marineIndexes[time] = index; });
    var stormCandidate = null;
    var surgeCandidate = null;

    (weather.time || []).slice(0, 72).some(function (time, index) {
      var gust = Number(weather.wind_gusts_10m[index] || 0);
      var wind = Number(weather.wind_speed_10m[index] || 0);
      var direction = Number(weather.wind_direction_10m[index] || 0);
      var rain = Number(weather.precipitation[index] || 0);
      var pressure = Number(weather.pressure_msl[index] || 1013);
      var code = Number(weather.weather_code[index] || 0);
      var marineIndex = marineIndexes[time];
      var wave = marineIndex == null ? 0 : Number(marine.wave_height[marineIndex] || 0);
      var seaLevel = marineIndex == null ? 0 : Number(marine.sea_level_height_msl[marineIndex] || 0);
      var invertedBarometer = marineIndex == null ? 0 : Number(marine.invert_barometer_height[marineIndex] || 0);
      var onshoreWind = direction >= 315 || direction <= 90;

      if (!stormCandidate && (gust >= 89 || (gust >= 63 && pressure <= 1000) || (code >= 95 && gust >= 40))) {
        stormCandidate = { time: time, gust: gust, wind: wind, rain: rain, pressure: pressure, code: code };
      }
      if (!surgeCandidate && onshoreWind && wave >= 1.8 && gust >= 40 &&
          (seaLevel >= 0.55 || invertedBarometer >= 0.12 || pressure <= 1000)) {
        surgeCandidate = { time: time, gust: gust, wave: wave, seaLevel: seaLevel, pressure: pressure };
      }
      return Boolean(stormCandidate && surgeCandidate);
    });

    var alerts = [];
    if (stormCandidate) {
      alerts.push({
        type: 'forecast-storm',
        desc: 'Forecast model flag: possible incoming tropical-cyclone or severe-storm conditions. Gusts ' +
          stormCandidate.gust.toFixed(0) + ' km/h, pressure ' + stormCandidate.pressure.toFixed(0) +
          ' hPa. Verify the latest PAGASA bulletin.',
        time: 'Forecast ' + forecastTimeLabel(stormCandidate.time),
        lat: 11.6845,
        lng: 122.4475,
        status: 'active',
        vesselId: null,
        source: 'forecast-monitor'
      });
    }
    if (surgeCandidate) {
      alerts.push({
        type: 'storm-surge',
        desc: 'Forecast model flag: possible storm-surge risk near New Washington. Sea level ' +
          surgeCandidate.seaLevel.toFixed(2) + ' m MSL, waves ' + surgeCandidate.wave.toFixed(1) +
          ' m, gusts ' + surgeCandidate.gust.toFixed(0) + ' km/h. Verify PAGASA storm-surge warnings.',
        time: 'Forecast ' + forecastTimeLabel(surgeCandidate.time),
        lat: 11.6845,
        lng: 122.4475,
        status: 'active',
        vesselId: null,
        source: 'forecast-monitor'
      });
    }
    return alerts;
  }

  function replaceForecastAlerts(forecastAlerts) {
    for (var index = alertData.length - 1; index >= 0; index--) {
      if (alertData[index].source === 'forecast-monitor') alertData.splice(index, 1);
    }
    for (var alertIndex = forecastAlerts.length - 1; alertIndex >= 0; alertIndex--) {
      alertData.unshift(forecastAlerts[alertIndex]);
    }
    ns.syncAlertIndicators();

    var signature = forecastAlerts.map(function (alert) { return alert.type + ':' + alert.time; }).join('|');
    var previousSignature = localStorage.getItem('aqone-forecast-alert-signature') || '';
    if (signature && signature !== previousSignature && typeof showToast === 'function') {
      showToast('Proactive Weather Alert', forecastAlerts[0].desc, true);
    }
    localStorage.setItem('aqone-forecast-alert-signature', signature);
  }

  function displayWeatherSnapshot(snapshot, stale, alerts) {
    renderWeatherCard(snapshot.weather, snapshot.marine, { stale: stale, alerts: alerts || [] });
    if (snapshot.weather.daily) {
      renderForecast(snapshot.weather.daily);
      renderRainfall(snapshot.weather.daily);
    }
  }

  function fetchWeatherData() {
    var url = 'https://api.open-meteo.com/v1/forecast?latitude=11.6845&longitude=122.4475' +
      '&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m' +
      '&hourly=wind_speed_10m,wind_direction_10m,wind_gusts_10m,precipitation,weather_code,pressure_msl' +
      '&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_sum&forecast_days=7&forecast_hours=72&timezone=Asia%2FManila';
    var marineUrl = 'https://marine-api.open-meteo.com/v1/marine?latitude=11.6845&longitude=122.4475' +
      '&current=wave_height,wave_period,sea_level_height_msl' +
      '&hourly=wave_height,wave_period,sea_level_height_msl,invert_barometer_height&forecast_hours=72&timezone=Asia%2FManila';

    Promise.allSettled([fetchLiveJson(url), fetchLiveJson(marineUrl)])
      .then(function (results) {
        if (results[0].status !== 'fulfilled') throw results[0].reason;
        var snapshot = {
          weather: results[0].value,
          marine: results[1].status === 'fulfilled' ? results[1].value : null,
          fetchedAt: new Date().toISOString()
        };
        var forecastAlerts = buildForecastAlerts(snapshot.weather, snapshot.marine);
        writeWeatherCache(snapshot);
        replaceForecastAlerts(forecastAlerts);
        displayWeatherSnapshot(snapshot, false, forecastAlerts);
      })
      .catch(function (error) {
        var cached = readWeatherCache();
        if (cached) {
          var existingAlerts = alertData.filter(function (alert) { return alert.source === 'forecast-monitor'; });
          displayWeatherSnapshot(cached, true, existingAlerts);
        } else {
          wcBody.innerHTML = '<div class="wc-error">Live weather unavailable. Check connection and PAGASA advisories.</div>';
          document.getElementById('forecast-body').innerHTML = '<p class="panel-stub-text">Forecast data unavailable</p>';
          document.getElementById('rainfall-body').innerHTML = '<p class="panel-stub-text">Rainfall data unavailable</p>';
        }
        console.warn('[AqOne] Live weather monitor unavailable:', error.message);
      });
  }

  fetchWeatherData();
  setInterval(fetchWeatherData, WConditions_INTERVAL_MS);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) fetchWeatherData();
  });

  ns.wcBody = wcBody;
  ns.WConditions_INTERVAL_MS = WConditions_INTERVAL_MS;
  ns.WEATHER_CACHE_KEY = WEATHER_CACHE_KEY;
  ns.SAFETY_THRESHOLDS = SAFETY_THRESHOLDS;
  ns.SAFETY_TIERS = SAFETY_TIERS;
  ns.classifySafety = classifySafety;
  ns.degToCompass = degToCompass;
  ns.WMO_MAP = WMO_MAP;
  ns.wmoIcon = wmoIcon;
  ns.safetyBadgeHTML = safetyBadgeHTML;
  ns.renderWeatherCard = renderWeatherCard;
  ns.renderForecast = renderForecast;
  ns.renderRainfall = renderRainfall;
  ns.fetchLiveJson = fetchLiveJson;
  ns.readWeatherCache = readWeatherCache;
  ns.writeWeatherCache = writeWeatherCache;
  ns.forecastTimeLabel = forecastTimeLabel;
  ns.buildForecastAlerts = buildForecastAlerts;
  ns.replaceForecastAlerts = replaceForecastAlerts;
  ns.displayWeatherSnapshot = displayWeatherSnapshot;
  ns.fetchWeatherData = fetchWeatherData;

})(window.AqOneDashboard = window.AqOneDashboard || {});
