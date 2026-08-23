(function (ns) {
  'use strict';
  if (!ns.ready) return;
  var authFetch = ns.authFetch;
  var incidents = ns.incidents;
  var map = ns.map;
  var incidentLayer = ns.incidentLayer;
  var showToast = ns.showToast;
  var pulseCoverageCircle = ns.pulseCoverageCircle;
  var liveSosLayer = ns.liveSosLayer;
  var loadActiveSos = ns.loadActiveSos;
  var allAlerts = ns.allAlerts;
  var syncAlertIndicators = ns.syncAlertIndicators;

  // ===== INCIDENT DRAWER (scored alert / escalation ladder) =====
  const sosDrawer          = document.getElementById('sos-drawer');
  const sosDrawerHeader    = document.getElementById('sos-drawer-header');
  const sosDrawerTitle     = document.getElementById('sos-drawer-title');
  const sosDrawerClose     = document.getElementById('sos-drawer-close');
  const sosTimerEl         = document.getElementById('sos-timer');
  const sosBtnZoom         = document.getElementById('sos-btn-zoom');
  const sosBtnAcknowledge  = document.getElementById('sos-btn-acknowledge');
  const sosBtnResolve      = document.getElementById('sos-btn-resolve');
  const sosBtnBroadcast    = document.getElementById('sos-btn-broadcast');
  const sosBtnCheckin      = document.getElementById('sos-btn-checkin');
  const sosBroadcastMsg    = document.getElementById('sos-broadcast-msg');

  let sosTimerInterval  = null;
  let sosAlertStartTime = null;
  let currentDrawerMarker  = null;
  let currentDrawerData    = null;

  function openIncidentDrawer(data, marker) {
    currentDrawerData   = data;
    currentDrawerMarker = marker;

    sosDrawerHeader.className = 'sos-drawer-header';
    if (data.alertType === 'sos')        sosDrawerHeader.classList.add('type-sos');
    else if (data.alertType === 'wave')  sosDrawerHeader.classList.add('type-wave');
    else if (data.alertType === 'capsizing') sosDrawerHeader.classList.add('type-capsizing');
    else if (data.alertType === 'overdue') sosDrawerHeader.classList.add('type-overdue');
    else if (data.alertType === 'squall') sosDrawerHeader.classList.add('type-squall');
    sosDrawerTitle.textContent = data.headerText;

    var timerLabel = document.getElementById('sos-timer-label');
    if (data.alertType === 'overdue') {
      timerLabel.textContent = 'Time Since Last Contact';
    } else {
      timerLabel.textContent = 'Time Since Alert';
    }

    document.getElementById('sos-vessel-id').textContent = data.vesselId;
    document.getElementById('sos-owner').textContent     = data.owner;
    document.getElementById('sos-position').textContent  = data.position;
    document.getElementById('sos-buoy').textContent      = data.buoy;
    document.getElementById('sos-coverage').textContent  = data.coverage;

    // confidence + escalation
    //
    // A real SOS carries no confidence score and must not be shown with one.
    // The old code coerced a missing score to 0, which would have rendered a
    // human distress call as "0% confidence" - the most damaging possible
    // misreading on this screen. Null hides the meter instead.
    var confValueEl = document.getElementById('sos-confidence-value');
    var fill = document.getElementById('sos-confidence-fill');
    var confBlock = confValueEl ? confValueEl.closest('.sos-conf') : null;
    if (data.confidence == null) {
      if (confValueEl) confValueEl.textContent = 'Not scored';
      if (confValueEl) confValueEl.style.color = 'var(--text-muted, #94a3b8)';
      if (fill) fill.style.width = '0%';
      if (confBlock) confBlock.classList.add('is-unscored');
    } else {
      var conf = data.confidence;
      if (confBlock) confBlock.classList.remove('is-unscored');
      if (confValueEl) {
        confValueEl.textContent = conf + '%';
        confValueEl.style.color = confidenceColor(conf);
      }
      if (fill) {
        fill.style.width = conf + '%';
        fill.style.background = confidenceColor(conf);
      }
    }
    var stageEl = document.getElementById('sos-stage');
    stageEl.textContent = data.stage || 'Stage 1 \u2014 silent check-in';
    stageEl.className = 'aq-stage-badge';
    if (data.stage && data.stage.indexOf('STAGE 3') !== -1) stageEl.classList.add('stage-dispatch');
    else if (data.stage && data.stage.indexOf('STAGE 2') !== -1) stageEl.classList.add('stage-alert');
    else if (data.stage && data.stage.indexOf('SQUALL') !== -1) stageEl.classList.add('stage-squall');
    else stageEl.classList.add('stage-checkin');
    document.getElementById('sos-next-contact').textContent = data.nextContact || 'N/A';

    var baselineMs = data.timerBaseline ? data.timerBaseline * 1000 : 0;
    sosAlertStartTime = Date.now() - baselineMs;
    if (sosTimerInterval) clearInterval(sosTimerInterval);
    sosTimerInterval = setInterval(sosTickTimer, 1000);
    sosTickTimer();

    sosBtnAcknowledge.disabled = false;
    sosBtnAcknowledge.textContent = 'Acknowledge';
    sosBroadcastMsg.textContent = '';

    sosDrawer.classList.add('open');

    if (data.alertType === 'overdue' && data.buoy) {
      var buoyName = data.buoy.split(' ')[0];
      pulseCoverageCircle(buoyName);
    }
  }

  function closeSOSDrawer() {
    sosDrawer.classList.remove('open');
    if (sosTimerInterval) { clearInterval(sosTimerInterval); sosTimerInterval = null; }
    currentDrawerMarker = null;
    currentDrawerData   = null;
  }

  function sosTickTimer() {
    if (!sosAlertStartTime) return;
    const elapsed = Math.floor((Date.now() - sosAlertStartTime) / 1000);
    const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const ss = String(elapsed % 60).padStart(2, '0');
    sosTimerEl.textContent = mm + ':' + ss;
  }

  sosDrawerClose.addEventListener('click', closeSOSDrawer);

  sosBtnZoom.addEventListener('click', function () {
    if (currentDrawerMarker) {
      map.setView(currentDrawerMarker.getLatLng(), 14);
    }
  });


  // ===== ACKNOWLEDGE WITH ETA =====
  //
  // Acknowledging is no longer a bare flag. The dispatcher tells the fisherman
  // what is happening and roughly when help arrives, which is the difference
  // between "someone saw my SOS" and "I know whether to stay with the boat".
  //
  // Minutes are collected here; the backend converts to an absolute arrival
  // time so the handset's countdown stays correct however slow delivery is.
  const ackOverlay = document.getElementById('ack-modal-overlay');
  const ackVesselEl = document.getElementById('ack-modal-vessel');
  const ackStatusEl = document.getElementById('ack-status');
  const ackEtaEl = document.getElementById('ack-eta');
  const ackNoteEl = document.getElementById('ack-note');
  const ackConfirmBtn = document.getElementById('ack-btn-confirm');

  function closeAckModal() {
    if (ackOverlay) ackOverlay.hidden = true;
  }

  function openAckModal() {
    if (!ackOverlay) return;
    const label = currentDrawerData
      ? (currentDrawerData.desc || currentDrawerData.vesselId || 'Distress call')
      : 'Distress call';
    if (ackVesselEl) ackVesselEl.textContent = label;
    ackOverlay.hidden = false;
    if (ackEtaEl) ackEtaEl.focus();
  }

  // Quick picks and the free-entry field stay in step with each other.
  const ackQuick = document.getElementById('ack-eta-quick');
  if (ackQuick) {
    ackQuick.addEventListener('click', function (event) {
      const chip = event.target.closest('.ack-eta-chip');
      if (!chip) return;
      ackQuick.querySelectorAll('.ack-eta-chip').forEach(function (b) {
        b.classList.remove('is-selected');
      });
      chip.classList.add('is-selected');
      if (ackEtaEl) ackEtaEl.value = chip.dataset.eta;
    });
  }
  if (ackEtaEl) {
    ackEtaEl.addEventListener('input', function () {
      if (!ackQuick) return;
      ackQuick.querySelectorAll('.ack-eta-chip').forEach(function (b) {
        b.classList.toggle('is-selected', b.dataset.eta === ackEtaEl.value);
      });
    });
  }

  ['ack-modal-close', 'ack-btn-cancel'].forEach(function (id) {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', closeAckModal);
  });
  if (ackOverlay) {
    ackOverlay.addEventListener('click', function (event) {
      if (event.target === ackOverlay) closeAckModal();
    });
  }

  sosBtnAcknowledge.addEventListener('click', openAckModal);

  if (ackConfirmBtn) {
    ackConfirmBtn.addEventListener('click', function () {
      const etaMinutes = Math.max(1, Math.min(720, parseInt(ackEtaEl && ackEtaEl.value, 10) || 20));
      const status = parseInt(ackStatusEl && ackStatusEl.value, 10) || 1;
      const note = (ackNoteEl && ackNoteEl.value.trim()) || null;
      const eventId = currentDrawerData && currentDrawerData.sosEventId;

      ackConfirmBtn.disabled = true;

      // Optimistic: the dispatcher sees the incident acknowledged immediately.
      // A distress console should never appear frozen while a request is in
      // flight, and a failure is surfaced below rather than blocking the UI.
      sosBtnAcknowledge.disabled = true;
      sosBtnAcknowledge.textContent = 'Acknowledged';
      if (currentDrawerData) {
        currentDrawerData.etaAt = new Date(Date.now() + etaMinutes * 60000).toISOString();
        currentDrawerData.responderStatus = status;

        // Match on the event id when there is one. The old positional match on
        // vesselId-or-coordinates could acknowledge the wrong row when two
        // alerts shared a vessel, and could not address a live event at all.
        const row = allAlerts().find(function (a) {
          if (eventId) return a.sosEventId === eventId;
          return a.vesselId === currentDrawerData.vesselId ||
                 (a.lat === currentDrawerData.lat && a.lng === currentDrawerData.lng);
        });
        if (row) {
          row.status = 'acknowledged';
          row.etaAt = currentDrawerData.etaAt;
          syncAlertIndicators();
        }
      }
      closeAckModal();

      // Only reaches the backend for incidents that came from it. Demo rows in
      // alertData have no sosEventId and stay local.
      if (eventId) {
        authFetch('/api/sos/' + encodeURIComponent(eventId) + '/acknowledge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            eta_minutes: etaMinutes,
            responder_status: status,
            responder_note: note
          })
        })
          .then(function (res) {
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return res.json();
          })
          .then(function (data) {
            if (currentDrawerData) currentDrawerData.etaAt = data.eta_at;
          })
          .catch(function (err) {
            console.warn('[AqOne] Acknowledgement not delivered:', err.message);
            showToast('Not delivered', 'The fisherman may not have received the ETA.', true);
          })
          .finally(function () {
            ackConfirmBtn.disabled = false;
          });
      } else {
        ackConfirmBtn.disabled = false;
      }
    });
  }

  // Live countdown on acknowledged incidents. Never renders a negative number:
  // once the promised time passes it says the rescue is delayed, because a
  // countdown expiring into silence reads as "nobody is coming".
  function formatEta(etaAt) {
    if (!etaAt) return '';
    var remainingMs = new Date(etaAt).getTime() - Date.now();
    if (remainingMs <= 0) return 'delayed — still en route';
    var mins = Math.floor(remainingMs / 60000);
    var secs = Math.floor((remainingMs % 60000) / 1000);
    return 'ETA ' + mins + ':' + String(secs).padStart(2, '0');
  }

  setInterval(function () {
    document.querySelectorAll('[data-eta-at]').forEach(function (el) {
      var text = formatEta(el.dataset.etaAt);
      el.textContent = text;
      el.classList.toggle('is-overdue', text.indexOf('delayed') === 0);
    });
  }, 1000);

  sosBtnResolve.addEventListener('click', function () {
    console.log('Alert ' + (currentDrawerData ? currentDrawerData.vesselId : '') + ' resolved');
    const eventId = currentDrawerData && currentDrawerData.sosEventId;
    if (currentDrawerMarker) {
      incidentLayer.removeLayer(currentDrawerMarker);
      liveSosLayer.removeLayer(currentDrawerMarker);
    }
    if (currentDrawerData) {
      const row = allAlerts().find(function (a) {
        if (eventId) return a.sosEventId === eventId;
        return a.vesselId === currentDrawerData.vesselId ||
               (a.lat === currentDrawerData.lat && a.lng === currentDrawerData.lng);
      });
      if (row) { row.status = 'resolved'; syncAlertIndicators(); }
    }
    closeSOSDrawer();
    if (eventId) {
      authFetch('/api/sos/' + encodeURIComponent(eventId) + '/resolve', {
        method: 'POST'
      })
        .then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return loadActiveSos();
        })
        .catch(function (err) {
          console.warn('[AqOne] Resolve not delivered:', err.message);
          showToast('Not delivered', 'The incident may reappear until the backend is updated.', true);
        });
    }
  });

  sosBtnBroadcast.addEventListener('click', function () {
    sosBroadcastMsg.textContent = 'Broadcast sent to 3 nearby vessels over the LoRa mesh';
  });

  sosBtnCheckin.addEventListener('click', function () {
    sosBroadcastMsg.textContent = 'Silent check-in request queued at surrounding buoys \u2014 awaiting next contact';
  });

  ns.sosDrawer = sosDrawer;
  ns.sosDrawerHeader = sosDrawerHeader;
  ns.sosDrawerTitle = sosDrawerTitle;
  ns.sosDrawerClose = sosDrawerClose;
  ns.sosTimerEl = sosTimerEl;
  ns.sosBtnZoom = sosBtnZoom;
  ns.sosBtnAcknowledge = sosBtnAcknowledge;
  ns.sosBtnResolve = sosBtnResolve;
  ns.sosBtnBroadcast = sosBtnBroadcast;
  ns.sosBtnCheckin = sosBtnCheckin;
  ns.sosBroadcastMsg = sosBroadcastMsg;
  ns.sosTimerInterval = sosTimerInterval;
  ns.sosAlertStartTime = sosAlertStartTime;
  ns.currentDrawerMarker = currentDrawerMarker;
  ns.currentDrawerData = currentDrawerData;
  ns.openIncidentDrawer = openIncidentDrawer;
  ns.closeSOSDrawer = closeSOSDrawer;
  ns.sosTickTimer = sosTickTimer;
  ns.ackOverlay = ackOverlay;
  ns.ackVesselEl = ackVesselEl;
  ns.ackStatusEl = ackStatusEl;
  ns.ackEtaEl = ackEtaEl;
  ns.ackNoteEl = ackNoteEl;
  ns.ackConfirmBtn = ackConfirmBtn;
  ns.closeAckModal = closeAckModal;
  ns.openAckModal = openAckModal;
  ns.ackQuick = ackQuick;
  ns.formatEta = formatEta;

})(window.AqOneDashboard = window.AqOneDashboard || {});
