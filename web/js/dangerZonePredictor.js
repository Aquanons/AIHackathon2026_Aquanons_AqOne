(function () {
  'use strict';

  var WEATHER_ENDPOINT = 'https://api.open-meteo.com/v1/forecast';
  var MARINE_ENDPOINT = 'https://marine-api.open-meteo.com/v1/marine';
  var NEW_WASHINGTON_COVERAGE = [
    { id: 'tambak-coastal-waters', name: 'Tambak Coastal Waters', lat: 11.680, lng: 122.414, radius: 600, depth_m: 9, bathymetry_dataset: 'gebco2020' },
    { id: 'poblacion-coastal-waters', name: 'Poblacion Coastal Waters', lat: 11.666, lng: 122.431, radius: 600, depth_m: 9, bathymetry_dataset: 'gebco2020' },
    { id: 'pinamuk-an-coastal-waters', name: 'Pinamuk-an Coastal Waters', lat: 11.652, lng: 122.448, radius: 600, depth_m: 21, bathymetry_dataset: 'gebco2020' },
    { id: 'ochando-coastal-waters', name: 'Ochando Coastal Waters', lat: 11.638, lng: 122.465, radius: 600, depth_m: 17, bathymetry_dataset: 'gebco2020' },
    { id: 'fatima-coastal-waters', name: 'Fatima Coastal Waters', lat: 11.624, lng: 122.482, radius: 600, depth_m: 6, bathymetry_dataset: 'gebco2020' }
  ];

  function withNewWashingtonCoverage(modelSectors) {
    var seen = {};
    return (modelSectors || []).concat(NEW_WASHINGTON_COVERAGE).filter(function (sector) {
      if (seen[sector.id]) return false;
      seen[sector.id] = true;
      return true;
    });
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function getModel() {
    if (!window.AqOneDangerZoneModel) {
      throw new Error('Danger-zone model artifact is unavailable');
    }
    return window.AqOneDangerZoneModel;
  }

  function treeValue(tree, features) {
    var node = 0;
    while (tree.feature[node] >= 0) {
      var featureValue = features[tree.feature[node]];
      node = featureValue <= tree.threshold[node]
        ? tree.children_left[node]
        : tree.children_right[node];
    }
    return tree.value[node];
  }

  function predictProbability(featureMap) {
    var model = getModel();
    var features = model.features.map(function (name) {
      var value = Number(featureMap[name]);
      if (!Number.isFinite(value)) throw new Error('Missing live feature: ' + name);
      return value;
    });
    var rawScore = model.ensemble.base_raw_score;
    model.ensemble.trees.forEach(function (tree) {
      rawScore += model.ensemble.learning_rate * treeValue(tree, features);
    });
    return 1 / (1 + Math.exp(-rawScore));
  }

  function endpointUrl(endpoint, sectors, fields, kind) {
    var params = new URLSearchParams();
    params.set('latitude', sectors.map(function (sector) { return sector.lat; }).join(','));
    params.set('longitude', sectors.map(function (sector) { return sector.lng; }).join(','));
    params.set('current', fields.join(','));
    params.set('forecast_hours', '1');
    params.set('timezone', 'UTC');
    if (kind === 'weather') params.set('cell_selection', 'sea');
    return endpoint + '?' + params.toString();
  }

  async function fetchJson(url) {
    var controller = new AbortController();
    var timeout = setTimeout(function () { controller.abort(); }, 30000);
    try {
      var response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error('Live data request failed with HTTP ' + response.status);
      return await response.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  function asLocations(payload) {
    return Array.isArray(payload) ? payload : [payload];
  }

  function degradedBuoyCount(buoys) {
    return (buoys || []).filter(function (buoy) {
      var status = String(buoy.status || '').toLowerCase();
      var signal = Number(buoy.signal);
      return status === 'danger' || status === 'warning' || status === 'offline' ||
        status === 'stale' || (Number.isFinite(signal) && signal < 50);
    }).length;
  }

  function riskLevel(score) {
    if (score >= 65) return { key: 'danger', label: 'Danger', color: '#ef4444' };
    if (score >= 40) return { key: 'watch', label: 'Watch', color: '#f59e0b' };
    return { key: 'low', label: 'Lower risk', color: '#22c55e' };
  }

  function reasonsFor(features, degradedCount) {
    var reasons = [];
    if (features.wave_height >= 2 && (features.wind_gusts_10m >= 40 || features.wind_speed_10m >= 30)) {
      reasons.push('Super-strong live wind and waves detected at the same time');
    }
    if (features.wave_height >= 2) reasons.push('Wave height at or above 2.0 m');
    else if (features.wave_height >= 1.4) reasons.push('Elevated live wave height');
    if (features.wind_gusts_10m >= 40) reasons.push('Wind gusts at or above 40 km/h');
    else if (features.wind_speed_10m >= 24) reasons.push('Strong live surface winds');
    if (features.weather_code >= 95) reasons.push('Live thunderstorm signal');
    if (features.precipitation >= 5) reasons.push('Heavy live precipitation');
    if (features.depth_m <= 50) reasons.push('Shallow-water bathymetry');
    if (degradedCount) reasons.push(degradedCount + ' degraded live buoy signal' + (degradedCount === 1 ? '' : 's'));
    if (!reasons.length) reasons.push('Gradient-boosted historical weather and marine pattern');
    return reasons;
  }

  function predictionsFromPayloads(weatherPayload, marinePayload, buoys, configuredSectors) {
    var model = getModel();
    var sectors = configuredSectors || model.sectors;
    var weatherLocations = asLocations(weatherPayload);
    var marineLocations = asLocations(marinePayload);
    if (weatherLocations.length !== sectors.length || marineLocations.length !== sectors.length) {
      throw new Error('Live data did not return every configured offshore scan cell');
    }
    var degradedCount = degradedBuoyCount(buoys);
    var buoyAdjustment = buoys && buoys.length ? Math.min(0.08, degradedCount * 0.025) : 0;
    var now = new Date();
    var angle = 2 * Math.PI * now.getUTCMonth() / 12;

    return sectors.map(function (sector, index) {
      var weather = weatherLocations[index].current || {};
      var marine = marineLocations[index].current || {};
      var features = {
        wind_speed_10m: weather.wind_speed_10m,
        wind_gusts_10m: weather.wind_gusts_10m,
        precipitation: weather.precipitation,
        weather_code: weather.weather_code,
        wave_height: marine.wave_height,
        wave_period: marine.wave_period,
        depth_m: sector.depth_m,
        month_sin: Math.sin(angle),
        month_cos: Math.cos(angle)
      };
      var modelProbability = predictProbability(features);
      var probability = clamp(modelProbability + buoyAdjustment, 0.01, 0.99);
      var score = Math.round(probability * 100);
      var trigger = 'Model probability';
      var measuredDanger = features.wave_height >= 2 &&
        (features.wind_gusts_10m >= 40 || features.wind_speed_10m >= 30);
      var measuredWatch = features.wave_height >= 1.4 || features.wind_gusts_10m >= 30 ||
        features.wind_speed_10m >= 24 || features.precipitation >= 5 || features.weather_code >= 95;
      if (measuredDanger) {
        score = Math.max(score, 65);
        trigger = 'Simultaneous live wind + wave danger threshold';
      } else if (measuredWatch || score >= 40) {
        score = clamp(score, 40, 64);
        trigger = measuredWatch ? 'Single-condition live watch threshold' : 'Elevated AI probability';
      } else {
        score = Math.min(score, 39);
      }
      var level = riskLevel(score);
      return {
        id: sector.id,
        name: sector.name,
        lat: sector.lat,
        lng: sector.lng,
        radius: Math.min(sector.radius, 800),
        depthM: sector.depth_m,
        score: score,
        modelProbability: Math.round(modelProbability * 100),
        buoyAdjustment: Math.round(buoyAdjustment * 100),
        trigger: trigger,
        level: level.key,
        label: level.label,
        color: level.color,
        reasons: reasonsFor(features, buoys && buoys.length ? degradedCount : 0),
        source: 'Open-Meteo live weather/marine + GEBCO bathymetry',
        observedAt: weather.time || marine.time || now.toISOString(),
        features: features
      };
    });
  }

  async function predictLive(buoys) {
    var model = getModel();
    var sectors = withNewWashingtonCoverage(model.sectors);
    var weatherUrl = endpointUrl(
      WEATHER_ENDPOINT,
      sectors,
      ['wind_speed_10m', 'wind_gusts_10m', 'precipitation', 'weather_code'],
      'weather'
    );
    var marineUrl = endpointUrl(
      MARINE_ENDPOINT,
      sectors,
      ['wave_height', 'wave_period'],
      'marine'
    );
    var payloads = await Promise.all([fetchJson(weatherUrl), fetchJson(marineUrl)]);
    var allPredictions = predictionsFromPayloads(payloads[0], payloads[1], buoys || [], sectors);
    allPredictions.sort(function (left, right) {
      return right.score - left.score || right.features.wave_height - left.features.wave_height ||
        right.features.wind_gusts_10m - left.features.wind_gusts_10m;
    });
    var dangerPredictions = allPredictions.filter(function (prediction) { return prediction.level === 'danger'; });
    var watchPredictions = allPredictions.filter(function (prediction) { return prediction.level === 'watch'; });
    var alertPredictions = dangerPredictions.concat(watchPredictions);
    // Keep every New Washington monitoring cell visible. Safe cells stay green,
    // while watch/danger cells change color as each live refresh is evaluated.
    var selected = allPredictions;
    return {
      predictions: selected,
      scannedCount: allPredictions.length,
      dangerCount: dangerPredictions.length,
      watchCount: watchPredictions.length,
      strongestProbability: allPredictions.length ? allPredictions[0].score : 0,
      fetchedAt: new Date().toISOString(),
      modelVersion: model.version,
      modelType: model.model_type,
      metrics: model.metadata.metrics,
      buoySource: buoys && buoys.length ? 'AqOne buoy API live' : 'AqOne buoy API unavailable',
      sources: model.metadata.sources,
      limitations: model.metadata.limitations
    };
  }

  window.AqOneDangerZonePredictor = {
    predictLive: predictLive,
    predictProbability: predictProbability,
    predictionsFromPayloads: predictionsFromPayloads
  };
})();
