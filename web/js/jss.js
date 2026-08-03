(function () {
  'use strict';

  // ═══════════════════════════════════════════════
  // TOAST NOTIFICATIONS
  // ═══════════════════════════════════════════════
  function showToast(title, msg) {
    var container = document.getElementById('toast-container');
    if (!container) return;
    var toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = '<div class="toast-title">' + title + '</div><div class="toast-msg">' + msg + '</div>';
    container.appendChild(toast);
    setTimeout(function () {
      toast.classList.add('toast-leave');
      setTimeout(function () { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 300);
    }, 4000);
  }

  // ═══════════════════════════════════════════════
  // THEME TOGGLE (dark mode)
  // ═══════════════════════════════════════════════
  (function () {
    var STORAGE_KEY = 'aqone-theme';
    var root = document.documentElement;

    function applyTheme(theme) {
      if (theme === 'dark') {
        root.setAttribute('data-theme', 'dark');
      } else {
        root.removeAttribute('data-theme');
      }
      var darkToggle = document.getElementById('pref-dark-toggle');
      if (darkToggle) darkToggle.checked = theme === 'dark';
    }

    var savedTheme = localStorage.getItem(STORAGE_KEY) || 'light';
    applyTheme(savedTheme);

    var themeBtn = document.getElementById('btn-theme');
    if (themeBtn) {
      themeBtn.addEventListener('click', function () {
        var isDark = root.getAttribute('data-theme') === 'dark';
        var next = isDark ? 'light' : 'dark';
        applyTheme(next);
        localStorage.setItem(STORAGE_KEY, next);
      });
    }

    var prefDarkToggle = document.getElementById('pref-dark-toggle');
    if (prefDarkToggle) {
      prefDarkToggle.addEventListener('change', function () {
        var next = prefDarkToggle.checked ? 'dark' : 'light';
        applyTheme(next);
        localStorage.setItem(STORAGE_KEY, next);
      });
    }
  })();

  // ═══════════════════════════════════════════════
  // PROFILE TABS
  // ═══════════════════════════════════════════════
  var tabs = document.querySelectorAll('.profile-tab');
  var contents = document.querySelectorAll('.profile-tab-content');

  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      tabs.forEach(function (t) { t.classList.remove('active'); });
      contents.forEach(function (c) { c.classList.remove('active'); });
      tab.classList.add('active');
      var target = document.getElementById('tab-' + tab.dataset.tab);
      if (target) target.classList.add('active');
    });
  });

  // ═══════════════════════════════════════════════
  // PERSONAL INFO — SAVE / CANCEL
  // ═══════════════════════════════════════════════
  var btnSavePersonal = document.getElementById('btn-save-personal');
  if (btnSavePersonal) {
    btnSavePersonal.addEventListener('click', function () {
      var name = document.getElementById('pf-fullname').value.trim();
      showToast('Profile Updated', name ? name + '\u2019s info was saved.' : 'Your info was saved.');
    });
  }

  var btnCancelPersonal = document.getElementById('btn-cancel-personal');
  if (btnCancelPersonal) {
    btnCancelPersonal.addEventListener('click', function () {
      showToast('Changes Discarded', 'No changes were saved.');
    });
  }

  // ═══════════════════════════════════════════════
  // SECURITY — PASSWORD UPDATE
  // ═══════════════════════════════════════════════
  var btnSaveSecurity = document.getElementById('btn-save-security');
  if (btnSaveSecurity) {
    btnSaveSecurity.addEventListener('click', function () {
      var current = document.getElementById('pf-current-password').value;
      var next = document.getElementById('pf-new-password').value;
      var confirmVal = document.getElementById('pf-confirm-password').value;

      if (!current || !next || !confirmVal) {
        showToast('Missing Fields', 'Please fill in all password fields.');
        return;
      }
      if (next !== confirmVal) {
        showToast('Password Mismatch', 'New password and confirmation do not match.');
        return;
      }
      showToast('Password Updated', 'Your password has been changed.');
      document.getElementById('pf-current-password').value = '';
      document.getElementById('pf-new-password').value = '';
      document.getElementById('pf-confirm-password').value = '';
    });
  }

  var btnCancelSecurity = document.getElementById('btn-cancel-security');
  if (btnCancelSecurity) {
    btnCancelSecurity.addEventListener('click', function () {
      document.getElementById('pf-current-password').value = '';
      document.getElementById('pf-new-password').value = '';
      document.getElementById('pf-confirm-password').value = '';
    });
  }

  // ═══════════════════════════════════════════════
  // CHANGE PHOTO (placeholder)
  // ═══════════════════════════════════════════════
  var btnEditAvatar = document.getElementById('btn-edit-avatar');
  if (btnEditAvatar) {
    btnEditAvatar.addEventListener('click', function () {
      showToast('Coming Soon', 'Photo upload isn\u2019t wired up yet.');
    });
  }

  // ═══════════════════════════════════════════════
  // LOGOUT
  // ═══════════════════════════════════════════════
  var btnLogout = document.getElementById('btn-logout');
  if (btnLogout) {
    btnLogout.addEventListener('click', function () {
      if (confirm('Are you sure you want to log out?')) {
        // Clear any session data you use, then redirect
        // sessionStorage.clear();
        window.location.href = 'login.html';
      }
    });
  }

  // ═══════════════════════════════════════════════
  // "LAST ACTIVE" TICKER
  // ═══════════════════════════════════════════════
  var lastActiveEl = document.getElementById('profile-last-active');
  if (lastActiveEl) {
    lastActiveEl.textContent = 'Active now';
  }

  // ═══════════════════════════════════════════════
  // PLACEHOLDER STATS
  // Replace with real counts from your API when available.
  // ═══════════════════════════════════════════════
  var statAdvisories = document.getElementById('stat-advisories');
  var statZones = document.getElementById('stat-zones');
  var statAlertsAck = document.getElementById('stat-alerts-ack');
  if (statAdvisories) statAdvisories.textContent = '12';
  if (statZones) statZones.textContent = '6';
  if (statAlertsAck) statAlertsAck.textContent = '34';

})();