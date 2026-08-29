(function () {
  'use strict';

  var beats = [
    'Baseline', 'Pressure falls', 'Zones escalate', 'RETURN NOW',
    'Boat overdue', 'SOS + drift', 'Ack + re-task'
  ];
  var state = { fired: [] };
  var paused = false;
  var keyInput = document.getElementById('demo-key');
  var message = document.getElementById('message');
  var connection = document.getElementById('connection');
  var connectionDot = document.getElementById('connection-dot');
  var squallStatusEl = document.getElementById('demo-squall-status');

  localStorage.setItem('AQONE_WEATHER_BASE', '/api/demo/weather/forecast');
  localStorage.setItem('AQONE_MARINE_BASE', '/api/demo/weather/marine');

  function api(path, options) {
    var request = options || {};
    request.headers = Object.assign({}, request.headers || {}, {
      'X-Demo-Key': keyInput.value
    });
    return fetch('/api/demo' + path, request).then(function (response) {
      return response.json().then(function (body) {
        if (!response.ok) throw new Error(body.detail || 'Demo request failed');
        return body;
      });
    });
  }

  function setMessage(text) { message.textContent = text; }

  function refreshBeats() {
    var container = document.getElementById('beats');
    container.innerHTML = '';
    beats.forEach(function (label, index) {
      var row = document.createElement('div');
      row.className = 'beat';
      var number = document.createElement('div');
      number.className = 'beat-number';
      number.textContent = String(index);
      var title = document.createElement('div');
      title.textContent = label;
      var status = document.createElement('div');
      status.className = 'beat-state' + (state.fired.indexOf(index) >= 0 ? ' fired' : '');
      status.textContent = state.fired.indexOf(index) >= 0 ? 'FIRED' : 'PENDING';
      var button = document.createElement('button');
      button.textContent = 'Fire';
      button.addEventListener('click', function () { fire('/beat/' + index); });
      row.appendChild(number);
      row.appendChild(title);
      row.appendChild(status);
      row.appendChild(button);
      container.appendChild(row);
    });
  }

  function refreshState(next) {
    state = next;
    refreshBeats();
    setMessage(state.scenario ? 'Run ' + state.run_id + ' · current beat ' + state.beat : 'No active scenario');
  }

  // docs/39_SQUALL_NOWCASTING_IMPLEMENTATION_PLAN.md Phase 3: the synthetic
  // scenario's squall status only appears here now - production dashboard/
  // handset routes read live pressure telemetry only. Same unified shape as
  // GET /api/public/squall (docs/05_PUBLIC_API.md), always source:
  // "synthetic" here, visibly labelled as such.
  function renderSquallStatus(status) {
    if (!squallStatusEl) return;
    var level = (status.level || 'unknown').toUpperCase();
    var reason = status.status_reason ? ' — ' + status.status_reason : '';
    var lead = typeof status.lead_minutes === 'number' ? ' · lead ' + status.lead_minutes + 'm' : '';
    squallStatusEl.textContent = '[SYNTHETIC] ' + level + reason + lead;
  }

  function pollSquall() {
    api('/squall').then(renderSquallStatus).catch(function (error) {
      if (squallStatusEl) squallStatusEl.textContent = 'Squall status unavailable: ' + error.message;
    });
  }

  function poll() {
    api('/state').then(function (next) {
      connection.textContent = 'Connected';
      connectionDot.classList.add('online');
      refreshState(next);
    }).catch(function (error) {
      connection.textContent = 'Disconnected';
      connectionDot.classList.remove('online');
      setMessage(error.message);
    });
    pollSquall();
  }

  function fire(path) {
    if (paused && path === '/advance') return;
    api(path, { method: 'POST' }).then(refreshState).catch(function (error) { setMessage(error.message); });
  }

  document.getElementById('start-squall').addEventListener('click', function () { fire('/scenario/squall-fleet/start'); });
  document.getElementById('start-clear').addEventListener('click', function () { fire('/scenario/clear-day/start'); });
  document.getElementById('step').addEventListener('click', function () { fire('/advance'); });
  document.getElementById('pause').addEventListener('click', function (event) {
    paused = !paused;
    event.target.textContent = paused ? 'Resume' : 'Pause';
  });
  document.getElementById('skip').addEventListener('click', function () {
    fire('/beat/' + document.getElementById('skip-to').value);
  });
  document.getElementById('reset').addEventListener('click', function () {
    api('/reset', { method: 'POST' }).then(refreshState).catch(function (error) { setMessage(error.message); });
  });
  beats.forEach(function (label, index) {
    var option = document.createElement('option');
    option.value = String(index);
    option.textContent = index + ' · ' + label;
    document.getElementById('skip-to').appendChild(option);
  });

  refreshBeats();
  poll();
  setInterval(poll, 5000);
}());
