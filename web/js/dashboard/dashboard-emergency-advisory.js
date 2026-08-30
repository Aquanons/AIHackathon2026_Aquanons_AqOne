(function (ns) {
  'use strict';
  if (!ns.ready) return;
  var escapeHtml = ns.escapeHtml;
  var authFetch = ns.authFetch;
  var CURRENT_USER = ns.CURRENT_USER;
  var showToast = ns.showToast;
  var closePanel = ns.closePanel;

  // ===== EMERGENCY CONTACTS MODAL =====
  const emergencyOverlay = document.getElementById('emergency-modal-overlay');
  const emergencyClose   = document.getElementById('emergency-modal-close');
  const emergencyBtn     = document.getElementById('btn-emergency');

  function openEmergencyModal() {
    emergencyOverlay.classList.add('active');
    emergencyBtn.classList.add('active');
  }

  function closeEmergencyModal() {
    emergencyOverlay.classList.remove('active');
    emergencyBtn.classList.remove('active');
  }

  emergencyBtn.addEventListener('click', openEmergencyModal);
  emergencyClose.addEventListener('click', closeEmergencyModal);

  emergencyOverlay.addEventListener('click', function (e) {
    if (e.target === emergencyOverlay) closeEmergencyModal();
  });

  document.querySelectorAll('.emergency-btn-copy').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var phone = btn.dataset.phone;
      navigator.clipboard.writeText(phone).then(function () {
        var original = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(function () { btn.textContent = original; }, 2000);
      });
    });
  });


  // ===== ADVISORY PANEL =====
  var advisoryPanelClose = document.getElementById('advisory-panel-close');
  var advisoryListEl     = document.getElementById('advisory-list');
  var btnCreateAdvisory  = document.getElementById('btn-create-advisory');
  var advisoryOverlay    = document.getElementById('advisory-modal-overlay');
  var advisoryModalClose = document.getElementById('advisory-modal-close');
  var advBtnCancel       = document.getElementById('adv-btn-cancel');
  var advBtnSave         = document.getElementById('adv-btn-save');
  var advisoryModalTitle = document.getElementById('advisory-modal-title');

  var advTitleInput       = document.getElementById('adv-title');
  var advCategorySelect   = document.getElementById('adv-category');
  var advDescriptionInput = document.getElementById('adv-description');
  var advMunicipalitySelect = document.getElementById('adv-municipality');
  var advPrioritySelect   = document.getElementById('adv-priority');
  var advPublishDateInput = document.getElementById('adv-publish-date');
  var advExpirationDateInput = document.getElementById('adv-expiration-date');
  var advCoverImageInput  = document.getElementById('adv-cover-image');
  var advStatusSelect     = document.getElementById('adv-status');

  var advTitleError       = document.getElementById('adv-title-error');
  var advDescriptionError = document.getElementById('adv-description-error');
  var advMunicipalityError = document.getElementById('adv-municipality-error');

  var deleteOverlay       = document.getElementById('advisory-delete-overlay');
  var deleteClose         = document.getElementById('advisory-delete-close');
  var deleteCancelBtn     = document.getElementById('adv-delete-cancel');
  var deleteConfirmBtn    = document.getElementById('adv-delete-confirm');
  var deleteNameEl        = document.getElementById('advisory-delete-name');

  var editingAdvisoryId   = null;
  var deletingAdvisoryId  = null;

  advisoryPanelClose.addEventListener('click', function () {
    if (ns.activePanel === 'advisories') closePanel();
  });

  function clearAdvisoryErrors() {
    advTitleError.classList.remove('visible');
    advDescriptionError.classList.remove('visible');
    advMunicipalityError.classList.remove('visible');
  }

  function validateAdvisoryForm() {
    clearAdvisoryErrors();
    var valid = true;
    if (!advTitleInput.value.trim()) {
      advTitleError.textContent = 'Title is required';
      advTitleError.classList.add('visible');
      valid = false;
    }
    if (!advDescriptionInput.value.trim()) {
      advDescriptionError.textContent = 'Description is required';
      advDescriptionError.classList.add('visible');
      valid = false;
    }
    if (!advMunicipalitySelect.value) {
      advMunicipalityError.textContent = 'Municipality is required';
      advMunicipalityError.classList.add('visible');
      valid = false;
    }
    return valid;
  }

  function resetAdvisoryForm() {
    advTitleInput.value = '';
    advCategorySelect.value = 'Weather Advisory';
    advDescriptionInput.value = '';
    advMunicipalitySelect.value = 'All';
    advPrioritySelect.value = 'Information';
    advPublishDateInput.value = new Date().toISOString().slice(0, 10);
    advExpirationDateInput.value = '';
    advCoverImageInput.value = '';
    advStatusSelect.value = 'Published';
    clearAdvisoryErrors();
  }

  function openAdvisoryModal(advisory) {
    if (advisory) {
      editingAdvisoryId = advisory.id;
      advisoryModalTitle.textContent = 'Edit Advisory';
      advTitleInput.value = advisory.title;
      advCategorySelect.value = advisory.category;
      advDescriptionInput.value = advisory.description;
      advMunicipalitySelect.value = advisory.municipality;
      advPrioritySelect.value = advisory.priority;
      advPublishDateInput.value = advisory.publishDate;
      advExpirationDateInput.value = advisory.expirationDate;
      advStatusSelect.value = advisory.status;
    } else {
      editingAdvisoryId = null;
      advisoryModalTitle.textContent = 'Create Advisory';
      resetAdvisoryForm();
      advPublishDateInput.value = new Date().toISOString().slice(0, 10);
    }
    advisoryOverlay.classList.add('active');
  }

  function closeAdvisoryModal() {
    advisoryOverlay.classList.remove('active');
    editingAdvisoryId = null;
    clearAdvisoryErrors();
  }

  btnCreateAdvisory.addEventListener('click', function () {
    openAdvisoryModal(null);
  });

  advisoryModalClose.addEventListener('click', closeAdvisoryModal);
  advBtnCancel.addEventListener('click', closeAdvisoryModal);
  advisoryOverlay.addEventListener('click', function (e) {
    if (e.target === advisoryOverlay) closeAdvisoryModal();
  });

  advBtnSave.addEventListener('click', async function () {
    if (!validateAdvisoryForm()) return;

    var data = {
      title: advTitleInput.value.trim(),
      category: advCategorySelect.value,
      description: advDescriptionInput.value.trim(),
      municipality: advMunicipalitySelect.value,
      priority: advPrioritySelect.value,
      publishDate: advPublishDateInput.value,
      expirationDate: advExpirationDateInput.value,
      coverImage: null,
      status: advStatusSelect.value
    };

    try {
      if (editingAdvisoryId) {
        await AdvisoryService.updateAdvisory(editingAdvisoryId, data);
        showToast('Advisory Updated', data.title);
      } else {
        await AdvisoryService.createAdvisory(data);
        showToast('Advisory Created', data.title);
      }

      closeAdvisoryModal();
      await renderAdvisoryList();
    } catch (err) {
      showToast('Error', err.message, true);
    }
  });

  async function renderAdvisoryList() {
    var advisories = await AdvisoryService.getAdvisories();
    if (advisories.length === 0) {
      advisoryListEl.innerHTML = '<div class="advisory-empty">No advisories yet</div>';
      return;
    }

    advisoryListEl.innerHTML = advisories.map(function (a) {
      var priorityClass = 'priority-' + a.priority.toLowerCase();
      var statusClass = a.status === 'Published' ? 'status-published' : 'status-draft';
      var statusDot = a.status === 'Published'
        ? '<svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"/></svg>'
        : '<svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="9"/></svg>';

      return '<div class="advisory-card" data-id="' + a.id + '">' +
        '<div class="advisory-card-top">' +
          '<span class="advisory-priority-badge ' + priorityClass + '">' + a.priority + '</span>' +
          '<span class="advisory-card-title">' + _escHtml(a.title) + '</span>' +
        '</div>' +
        '<div class="advisory-card-meta">' +
          '<span>' + _escHtml(a.municipality) + '</span>' +
          '<span class="advisory-card-status ' + statusClass + '">' + statusDot + ' ' + a.status + '</span>' +
          '<span>' + a.publishDate + '</span>' +
        '</div>' +
        '<div class="advisory-card-actions">' +
          '<button class="adv-action-btn adv-edit" data-id="' + a.id + '">' +
            '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>' +
            'Edit' +
          '</button>' +
          '<button class="adv-action-btn adv-delete" data-id="' + a.id + '">' +
            '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>' +
            'Delete' +
          '</button>' +
        '</div>' +
      '</div>';
    }).join('');

    advisoryListEl.querySelectorAll('.adv-edit').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        var id = parseInt(btn.dataset.id, 10);
        var advisory = await AdvisoryService.getAdvisory(id);
        if (advisory) openAdvisoryModal(advisory);
      });
    });

    advisoryListEl.querySelectorAll('.adv-delete').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        var id = parseInt(btn.dataset.id, 10);
        var advisory = await AdvisoryService.getAdvisory(id);
        if (!advisory) return;
        deletingAdvisoryId = id;
        deleteNameEl.textContent = advisory.title;
        deleteOverlay.classList.add('active');
      });
    });
  }

  // Delegates to the shared, DOM-free implementation
  // (web/js/dashboard-utils.js) so there is exactly one escaping function in
  // this codebase, not two that can silently drift apart. Kept under its
  // original name because ~15 call sites already use it.
  function _escHtml(str) {
    return escapeHtml(str);
  }

  function closeDeleteModal() {
    deleteOverlay.classList.remove('active');
    deletingAdvisoryId = null;
  }

  deleteClose.addEventListener('click', closeDeleteModal);
  deleteCancelBtn.addEventListener('click', closeDeleteModal);
  deleteOverlay.addEventListener('click', function (e) {
    if (e.target === deleteOverlay) closeDeleteModal();
  });

  deleteConfirmBtn.addEventListener('click', async function () {
    if (deletingAdvisoryId === null) return;
    try {
      await AdvisoryService.deleteAdvisory(deletingAdvisoryId);
      showToast('Advisory Deleted', 'Advisory has been removed.');
      closeDeleteModal();
      await renderAdvisoryList();
    } catch (err) {
      showToast('Error', err.message, true);
    }
  });

   renderAdvisoryList();


   // ===== SEA CONDITION STATUS =====
   var seaConditionCurrent = document.getElementById('sea-condition-current');
   var seaConditionSetBtn = document.getElementById('sea-condition-set-btn');
   var seaConditionReason = document.getElementById('sea-condition-reason');
   var seaConditionSelectedStatus = null;

   var SEA_STATUS_COLORS = {
     'Safe to Go Out': '#2ecc71',
     'Caution — Check Advisories': '#f1c40f',
     'Not Advised': '#e74c3c'
   };

   function formatSeaConditionTime(iso) {
     if (!iso) return '';
     var d = new Date(iso);
     var now = new Date();
     var diff = Math.floor((now - d) / 1000);
     if (diff < 60) return 'just now';
     if (diff < 3600) return Math.floor(diff / 60) + ' min ago';
     if (diff < 86400) return Math.floor(diff / 3600) + ' hr ago';
     return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
   }

   async function fetchSeaCondition() {
     try {
       var res = await authFetch('/api/sea-condition');
       if (!res.ok) throw new Error('HTTP ' + res.status);
       var data = await res.json();
       var current = data.current || data;
       renderSeaCondition(current);
     } catch (err) {
       console.warn('[AqOne] Could not fetch sea condition:', err.message);
       if (seaConditionCurrent) {
         seaConditionCurrent.innerHTML = '<div class="sea-condition-loading">Unable to load sea condition</div>';
       }
     }
   }

   function renderSeaCondition(current) {
     if (!seaConditionCurrent) return;
     var status = current.status || 'Unknown';
     var reason = current.reason || '';
     var setByName = current.set_by_name || '--';
     var createdAt = current.created_at || '';
     var color = SEA_STATUS_COLORS[status] || '#7f8c8d';
     var statusClass = status === 'Safe to Go Out' ? 'sc-safe' : (status === 'Caution — Check Advisories' ? 'sc-caution' : 'sc-danger');

     var html =
       '<div class="sc-status" style="color:' + color + ';">' + status + '</div>';
     if (reason) {
       html += '<div class="sc-reason">"' + reason + '"</div>';
     }
     html += '<div class="sc-meta">Last set by ' + setByName + ' at ' + formatSeaConditionTime(createdAt) + '</div>';

     seaConditionCurrent.innerHTML = html;
   }

   if (seaConditionSetBtn) {
     seaConditionSetBtn.addEventListener('click', function () {
       if (!seaConditionSelectedStatus) return;
       var reason = seaConditionReason ? seaConditionReason.value.trim() : '';
       var status = seaConditionSelectedStatus;

       if (!confirm('Are you sure you want to set status to "' + status + '"?')) return;

       // Actor is derived server-side from the bearer token (docs/41 Phase 1) -
       // the backend no longer reads set_by_user_id/set_by_name from the body.
       var body = {
         status: status,
         reason: reason
       };

       authFetch('/api/sea-condition', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify(body)
       })
         .then(function (res) {
           if (!res.ok) throw new Error('HTTP ' + res.status);
           return res.json();
         })
         .then(function (data) {
           var current = data.current || data;
           renderSeaCondition(current);
           if (seaConditionReason) seaConditionReason.value = '';
           seaConditionSelectedStatus = null;
           showToast('Sea Condition Updated', 'Status set to "' + status + '".');
         })
         .catch(function (err) {
           console.error('[AqOne] Failed to set sea condition:', err.message);
           showToast('Error', 'Failed to update sea condition.', true);
         });
     });
   }

   document.querySelectorAll('.sea-condition-btn').forEach(function (btn) {
     btn.addEventListener('click', function () {
       document.querySelectorAll('.sea-condition-btn').forEach(function (b) { b.classList.remove('active'); });
       btn.classList.add('active');
       seaConditionSelectedStatus = btn.dataset.status;
     });
   });

   fetchSeaCondition();

   // The banner's "Last updated" ticker used to be an independent counter
   // here, incrementing every 30s regardless of whether anything had
   // actually refreshed - a second copy of the fake-freshness problem
   // updateSyncStatus() above now fixes for the header pill. Removed rather
   // than kept in sync by hand: updateSyncStatus() already writes
   // .banner-time every second from the one real timestamp
   // (lastSosSuccessMs), so a second writer here could only drift from it.

  ns.emergencyOverlay = emergencyOverlay;
  ns.emergencyClose = emergencyClose;
  ns.emergencyBtn = emergencyBtn;
  ns.openEmergencyModal = openEmergencyModal;
  ns.closeEmergencyModal = closeEmergencyModal;
  ns.advisoryPanelClose = advisoryPanelClose;
  ns.advisoryListEl = advisoryListEl;
  ns.btnCreateAdvisory = btnCreateAdvisory;
  ns.advisoryOverlay = advisoryOverlay;
  ns.advisoryModalClose = advisoryModalClose;
  ns.advBtnCancel = advBtnCancel;
  ns.advBtnSave = advBtnSave;
  ns.advisoryModalTitle = advisoryModalTitle;
  ns.advTitleInput = advTitleInput;
  ns.advCategorySelect = advCategorySelect;
  ns.advDescriptionInput = advDescriptionInput;
  ns.advMunicipalitySelect = advMunicipalitySelect;
  ns.advPrioritySelect = advPrioritySelect;
  ns.advPublishDateInput = advPublishDateInput;
  ns.advExpirationDateInput = advExpirationDateInput;
  ns.advCoverImageInput = advCoverImageInput;
  ns.advStatusSelect = advStatusSelect;
  ns.advTitleError = advTitleError;
  ns.advDescriptionError = advDescriptionError;
  ns.advMunicipalityError = advMunicipalityError;
  ns.deleteOverlay = deleteOverlay;
  ns.deleteClose = deleteClose;
  ns.deleteCancelBtn = deleteCancelBtn;
  ns.deleteConfirmBtn = deleteConfirmBtn;
  ns.deleteNameEl = deleteNameEl;
  ns.editingAdvisoryId = editingAdvisoryId;
  ns.deletingAdvisoryId = deletingAdvisoryId;
  ns.clearAdvisoryErrors = clearAdvisoryErrors;
  ns.validateAdvisoryForm = validateAdvisoryForm;
  ns.resetAdvisoryForm = resetAdvisoryForm;
  ns.openAdvisoryModal = openAdvisoryModal;
  ns.closeAdvisoryModal = closeAdvisoryModal;
  ns.renderAdvisoryList = renderAdvisoryList;
  ns.closeDeleteModal = closeDeleteModal;
  ns.seaConditionCurrent = seaConditionCurrent;
  ns.seaConditionSetBtn = seaConditionSetBtn;
  ns.seaConditionReason = seaConditionReason;
  ns.seaConditionSelectedStatus = seaConditionSelectedStatus;
  ns.SEA_STATUS_COLORS = SEA_STATUS_COLORS;
  ns.formatSeaConditionTime = formatSeaConditionTime;
  ns.fetchSeaCondition = fetchSeaCondition;
  ns.renderSeaCondition = renderSeaCondition;

})(window.AqOneDashboard = window.AqOneDashboard || {});
