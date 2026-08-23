/* ══════════════════════════════════════════════════════════════
   AQONE PROFILE SYSTEM - FULL INTERACTIVITY & LANGUAGE SWITCHER
   ══════════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    initLanguageSwitcher();
    initDarkMode();
    initPhotoUploader();
    initPersonalForm();
    initSecurityForm();
    initHeaderAndActions();
    loadSavedProfileData();
});

/* --------------------------------------------------------------
   1. TOAST NOTIFICATION ENGINE
   -------------------------------------------------------------- */
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast-item toast-${type}`;

    const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ';
    toast.innerHTML = `
        <span class="toast-icon">${icon}</span>
        <span class="toast-message">${message}</span>
    `;

    container.appendChild(toast);

    // Trigger animation
    setTimeout(() => toast.classList.add('show'), 10);

    // Auto remove after 3.5s
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

/* --------------------------------------------------------------
   2. TABS SWITCHER SYSTEM
   -------------------------------------------------------------- */
function initTabs() {
    const tabs = document.querySelectorAll('.profile-tab');
    const tabContents = document.querySelectorAll('.profile-tab-content');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetTab = tab.getAttribute('data-tab');

            tabs.forEach(t => t.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));

            tab.classList.add('active');
            const targetContent = document.getElementById(`tab-${targetTab}`);
            if (targetContent) {
                targetContent.classList.add('active');
            }
        });
    });
}

/* --------------------------------------------------------------
   3. ENGLISH <-> AKLANON LANGUAGE TRANSLATOR
   -------------------------------------------------------------- */
const translations = {
    en: {
        topTitle: "AqOne",
        topSubtitle: "My Profile",
        userRoleHeader: "Administrator",
        btnChangePhoto: "Change Photo",
        statAdvisories: "Advisories",
        statZones: "Zones Reviewed",
        statAlerts: "Alerts Handled",
        metaJoined: "Joined March 2024",
        metaActive: "Active now",
        btnLogout: "Log Out",
        tabPersonal: "Personal Info",
        tabSecurity: "Security",
        tabPreferences: "Preferences",
        hdrPersonalInfo: "Personal Information",
        subPersonalInfo: "Update your name, role, and contact details.",
        lblFullName: "Full Name",
        lblPosition: "Position",
        lblOffice: "Office / Municipality",
        lblRole: "System Role",
        lblEmail: "Email Address",
        lblPhone: "Contact Number",
        btnCancel: "Cancel",
        btnSave: "Save Changes",
        hdrSecurity: "Password & Security",
        subSecurity: "Change your password to keep your account secure.",
        lblCurrentPass: "Current Password",
        lblNewPass: "New Password",
        lblConfirmPass: "Confirm New Password",
        btnUpdatePass: "Update Password",
        hdrSessions: "Active Sessions",
        subSessions: "Devices currently signed in to your account.",
        sessionName: "This Device — Chrome on Windows",
        sessionMeta: "Kalibo, Aklan · Active now",
        sessionBadge: "Current",
        hdrPref: "Preferences",
        subPref: "Control how AqOne looks and notifies you.",
        lblLangPref: "System Language / Eingguahe",
        descLangPref: "Choose between English and Akeanon (Aklanon).",
        lblDarkMode: "Dark Mode",
        descDarkMode: "Switch between light and dark interface themes.",
        lblEmailNotif: "Email Notifications",
        descEmailNotif: "Receive alerts and advisory updates by email.",
        lblSoundAlerts: "SOS Sound Alerts",
        descSoundAlerts: "Play a sound when a new distress signal is received.",
        phPass: "••••••••",
        phPhone: "+63 994 489 1004"
    },
    akl: {
        topTitle: "AqOne",
        topSubtitle: "Akun Profile",
        userRoleHeader: "Administrador",
        btnChangePhoto: "Bag-uhon ang Litrato",
        statAdvisories: "Mga Pasidaan",
        statZones: "Rebisa nga Zuknayan",
        statAlerts: "Ginasikaso nga Alerto",
        metaJoined: "Nag-intra it Marso 2024",
        metaActive: "Aktibo makaron",
        btnLogout: "Mag-gwa",
        tabPersonal: "Impormasyon sa Kaugalingon",
        tabSecurity: "Sekuridad",
        tabPreferences: "Gusto / Preferensya",
        hdrPersonalInfo: "Impormasyon sa Kaugalingon",
        subPersonalInfo: "I-update ang imung pangaean, trabaho, ag mga detalye sa pag-kontak.",
        lblFullName: "Kumpletong Pangaean",
        lblPosition: "Posisyon sa Trabaho",
        lblOffice: "Opisina / Munisipyo",
        lblRole: "Papel sa Sistema",
        lblEmail: "Email Address",
        lblPhone: "Numero sa Telepono",
        btnCancel: "Kanselahon",
        btnSave: "I-save ang Ginbag-o",
        hdrSecurity: "Password ag Sekuridad",
        subSecurity: "Bag-uhon ang imung password agud mangin ewas ang imung account.",
        lblCurrentPass: "Karon nga Password",
        lblNewPass: "Bag-ong Password",
        lblConfirmPass: "Kumpirmaha ang Bag-ong Password",
        btnUpdatePass: "I-update ang Password",
        hdrSessions: "Aktibo nga mga Seksyon",
        subSessions: "Mga aparato nga nakasulod sa imung account.",
        sessionName: "Daya nga Aparato — Chrome sa Windows",
        sessionMeta: "Kalibo, Aklan · Aktibo makaron",
        sessionBadge: "Kasamtangan",
        hdrPref: "Gusto / Preferensya",
        subPref: "Kontrolaha kon paano gina-pakita ag gina-notipikar ka it AqOne.",
        lblLangPref: "Eingguahe sa Sistema",
        descLangPref: "Pumili sa English o Akeanon (Aklanon).",
        lblDarkMode: "Madulom nga Mode (Dark Mode)",
        descDarkMode: "Mag-balhin sa maensang ag madulom nga tema.",
        lblEmailNotif: "Mga Notipikasyon sa Email",
        descEmailNotif: "Makatawo it mga pasidaan ag alerta pinaagi sa email.",
        lblSoundAlerts: "Tubag nga Tunog para sa SOS",
        descSoundAlerts: "Patugtuga ang tunog kon makadawat it bag-ong signal sang pag-ingganto.",
        phPass: "••••••••",
        phPhone: "+63 994 489 1004"
    }
};

function setLanguage(lang) {
    const btnEn = document.getElementById('lang-en');
    const btnAkl = document.getElementById('lang-akl');
    const selectLang = document.getElementById('pref-lang-select');

    if (lang === 'akl') {
        if (btnEn) btnEn.classList.remove('active');
        if (btnAkl) btnAkl.classList.add('active');
        if (selectLang) selectLang.value = 'akl';
    } else {
        lang = 'en';
        if (btnAkl) btnAkl.classList.remove('active');
        if (btnEn) btnEn.classList.add('active');
        if (selectLang) selectLang.value = 'en';
    }

    const dict = translations[lang];

    // Apply translations across UI
    const updateText = (selector, key) => {
        const el = document.querySelector(selector);
        if (el && dict[key]) el.textContent = dict[key];
    };

    updateText('.top-subtitle', 'topSubtitle');
    updateText('.header-user-role', 'userRoleHeader');
    updateText('#btn-edit-avatar', 'btnChangePhoto');
    updateText('#stat-advisories + .profile-stat-label', 'statAdvisories');
    updateText('#stat-zones + .profile-stat-label', 'statZones');
    updateText('#stat-alerts-ack + .profile-stat-label', 'statAlerts');
    updateText('.profile-meta-row:nth-child(1) span', 'metaJoined');
    updateText('#profile-last-active', 'metaActive');
    updateText('#btn-logout', 'btnLogout');

    // Tabs
    const tabs = document.querySelectorAll('.profile-tab');
    if (tabs[0]) tabs[0].textContent = dict.tabPersonal;
    if (tabs[1]) tabs[1].textContent = dict.tabSecurity;
    if (tabs[2]) tabs[2].textContent = dict.tabPreferences;

    // Personal Info Panel
    updateText('#tab-personal .profile-panel-header h3', 'hdrPersonalInfo');
    updateText('#tab-personal .profile-panel-header p', 'subPersonalInfo');
    updateText('label[for="pf-fullname"]', 'lblFullName');
    updateText('label[for="pf-position"]', 'lblPosition');
    updateText('label[for="pf-office"]', 'lblOffice');
    updateText('label[for="pf-role"]', 'lblRole');
    updateText('label[for="pf-email"]', 'lblEmail');
    updateText('label[for="pf-phone"]', 'lblPhone');
    updateText('#btn-cancel-personal', 'btnCancel');
    updateText('#btn-save-personal', 'btnSave');

    // Security Panel
    updateText('#tab-security .profile-panel:nth-child(1) .profile-panel-header h3', 'hdrSecurity');
    updateText('#tab-security .profile-panel:nth-child(1) .profile-panel-header p', 'subSecurity');
    updateText('label[for="sec-current-password"]', 'lblCurrentPass');
    updateText('label[for="sec-new-password"]', 'lblNewPass');
    updateText('label[for="sec-confirm-password"]', 'lblConfirmPass');
    updateText('#btn-cancel-security', 'btnCancel');
    updateText('#btn-save-security', 'btnUpdatePass');

    // Sessions Panel
    updateText('#tab-security .profile-panel:nth-child(2) .profile-panel-header h3', 'hdrSessions');
    updateText('#tab-security .profile-panel:nth-child(2) .profile-panel-header p', 'subSessions');
    updateText('.profile-session-name', 'sessionName');
    updateText('.profile-session-meta', 'sessionMeta');
    updateText('.profile-session-badge', 'sessionBadge');

    // Preferences Panel
    updateText('#tab-preferences .profile-panel-header h3', 'hdrPref');
    updateText('#tab-preferences .profile-panel-header p', 'subPref');

    const prefRows = document.querySelectorAll('.profile-toggle-row');
    if (prefRows[0]) {
        prefRows[0].querySelector('.profile-toggle-title').textContent = dict.lblLangPref;
        prefRows[0].querySelector('.profile-toggle-desc').textContent = dict.descLangPref;
    }
    if (prefRows[1]) {
        prefRows[1].querySelector('.profile-toggle-title').textContent = dict.lblDarkMode;
        prefRows[1].querySelector('.profile-toggle-desc').textContent = dict.descDarkMode;
    }
    if (prefRows[2]) {
        prefRows[2].querySelector('.profile-toggle-title').textContent = dict.lblEmailNotif;
        prefRows[2].querySelector('.profile-toggle-desc').textContent = dict.descEmailNotif;
    }
    if (prefRows[3]) {
        prefRows[3].querySelector('.profile-toggle-title').textContent = dict.lblSoundAlerts;
        prefRows[3].querySelector('.profile-toggle-desc').textContent = dict.descSoundAlerts;
    }

    localStorage.setItem('aqone_lang', lang);
}

function initLanguageSwitcher() {
    const btnEn = document.getElementById('lang-en');
    const btnAkl = document.getElementById('lang-akl');
    const selectLang = document.getElementById('pref-lang-select');

    if (btnEn) btnEn.addEventListener('click', () => setLanguage('en'));
    if (btnAkl) btnAkl.addEventListener('click', () => setLanguage('akl'));
    if (selectLang) {
        selectLang.addEventListener('change', (e) => setLanguage(e.target.value));
    }

    const savedLang = localStorage.getItem('aqone_lang') || 'en';
    setLanguage(savedLang);
}

/* --------------------------------------------------------------
   4. DARK MODE TOGGLE
   -------------------------------------------------------------- */
function initDarkMode() {
    const darkToggle = document.getElementById('pref-dark-toggle');

    const applyDarkMode = (isDark) => {
        if (isDark) {
            document.body.classList.add('dark-mode');
            document.documentElement.setAttribute('data-theme', 'dark');
        } else {
            document.body.classList.remove('dark-mode');
            document.documentElement.setAttribute('data-theme', 'light');
        }
    };

    // Load saved preference
    const savedDark = localStorage.getItem('aqone_dark_mode') === 'true';
    if (darkToggle) {
        darkToggle.checked = savedDark;
        darkToggle.addEventListener('change', (e) => {
            const isDark = e.target.checked;
            applyDarkMode(isDark);
            localStorage.setItem('aqone_dark_mode', isDark);
            showToast(isDark ? 'Dark mode enabled' : 'Light mode enabled', 'info');
        });
    }
    applyDarkMode(savedDark);
}

/* --------------------------------------------------------------
   5. PHOTO UPLOADER (CHANGE PHOTO BUTTON)
   -------------------------------------------------------------- */
function initPhotoUploader() {
    const editBtn = document.getElementById('btn-edit-avatar');
    if (!editBtn) return;

    // Create hidden file input dynamically
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);

    editBtn.addEventListener('click', () => {
        fileInput.click();
    });

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const imgUrl = event.target.result;

                // Update Profile Card Avatar
                const cardAvatar = document.querySelector('.profile-card-avatar');
                if (cardAvatar) {
                    cardAvatar.style.backgroundImage = `url(${imgUrl})`;
                    cardAvatar.style.backgroundSize = 'cover';
                    cardAvatar.style.backgroundPosition = 'center';
                    cardAvatar.textContent = ''; // clear initial letters
                }

                // Update Header Avatar
                const headerAvatar = document.querySelector('.header-user-avatar');
                if (headerAvatar) {
                    headerAvatar.style.backgroundImage = `url(${imgUrl})`;
                    headerAvatar.style.backgroundSize = 'cover';
                    headerAvatar.style.backgroundPosition = 'center';
                    headerAvatar.textContent = '';
                }

                localStorage.setItem('aqone_user_avatar', imgUrl);
                showToast('Profile photo updated successfully!', 'success');
            };
            reader.readAsDataURL(file);
        }
    });
}

/* --------------------------------------------------------------
   6. PERSONAL INFO FORM (SAVE / CANCEL)
   -------------------------------------------------------------- */
function initPersonalForm() {
    const saveBtn = document.getElementById('btn-save-personal');
    const cancelBtn = document.getElementById('btn-cancel-personal');

    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            const fullName = document.getElementById('pf-fullname')?.value.trim();
            const position = document.getElementById('pf-position')?.value.trim();
            const email = document.getElementById('pf-email')?.value.trim();
            const phone = document.getElementById('pf-phone')?.value.trim();

            if (!fullName) {
                showToast('Please enter your full name', 'error');
                return;
            }

            // Update UI elements in sidebar & header
            const cardName = document.querySelector('.profile-card-name');
            const cardRole = document.querySelector('.profile-card-role');
            const headerName = document.querySelector('.header-user-name');

            if (cardName) cardName.textContent = fullName;
            if (cardRole && position) cardRole.textContent = position;
            if (headerName) headerName.textContent = fullName;

            // Save to localStorage
            const profileData = { fullName, position, email, phone };
            localStorage.setItem('aqone_profile_data', JSON.stringify(profileData));

            showToast('Personal information saved successfully!', 'success');
        });
    }

    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            loadSavedProfileData();
            showToast('Changes discarded', 'info');
        });
    }
}

/* --------------------------------------------------------------
   7. SECURITY FORM (UPDATE PASSWORD / CANCEL)
   -------------------------------------------------------------- */
function initSecurityForm() {
    const saveBtn = document.getElementById('btn-save-security');
    const cancelBtn = document.getElementById('btn-cancel-security');

    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            const currentPass = document.getElementById('sec-current-password')?.value;
            const newPass = document.getElementById('sec-new-password')?.value;
            const confirmPass = document.getElementById('sec-confirm-password')?.value;

            if (!currentPass) {
                showToast('Please enter your current password', 'error');
                return;
            }
            if (!newPass || newPass.length < 6) {
                showToast('New password must be at least 6 characters', 'error');
                return;
            }
            if (newPass !== confirmPass) {
                showToast('New password and confirm password do not match', 'error');
                return;
            }

            // Reset password inputs
            document.getElementById('sec-current-password').value = '';
            document.getElementById('sec-new-password').value = '';
            document.getElementById('sec-confirm-password').value = '';

            showToast('Password updated successfully!', 'success');
        });
    }

    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            const currentInput = document.getElementById('sec-current-password');
            const newInput = document.getElementById('sec-new-password');
            const confirmInput = document.getElementById('sec-confirm-password');

            if (currentInput) currentInput.value = '';
            if (newInput) newInput.value = '';
            if (confirmInput) confirmInput.value = '';

            showToast('Password form cleared', 'info');
        });
    }
}

/* --------------------------------------------------------------
   8. HEADER ACTIONS & LOGOUT
   -------------------------------------------------------------- */
function initHeaderAndActions() {
    const notifBtn = document.getElementById('btn-notifications');
    const logoutBtn = document.getElementById('btn-logout');

    if (notifBtn) {
        notifBtn.addEventListener('click', () => {
            showToast('You have no new notifications', 'info');
        });
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            if (confirm('Are you sure you want to log out?')) {
                showToast('Logging out...', 'info');
                sessionStorage.removeItem('aqoneToken');
                sessionStorage.removeItem('aqoneUser');
                sessionStorage.removeItem('aqoneDemoBypassActive');
                setTimeout(() => {
                    window.location.href = 'login.html';
                }, 1000);
            }
        });
    }
}

/* --------------------------------------------------------------
   9. LOAD SAVED PROFILE DATA
   -------------------------------------------------------------- */
function loadSavedProfileData() {
    const rawData = localStorage.getItem('aqone_profile_data');
    if (rawData) {
        try {
            const data = JSON.parse(rawData);
            if (data.fullName && document.getElementById('pf-fullname')) {
                document.getElementById('pf-fullname').value = data.fullName;
                document.querySelector('.profile-card-name').textContent = data.fullName;
                document.querySelector('.header-user-name').textContent = data.fullName;
            }
            if (data.position && document.getElementById('pf-position')) {
                document.getElementById('pf-position').value = data.position;
                document.querySelector('.profile-card-role').textContent = data.position;
            }
            if (data.email && document.getElementById('pf-email')) {
                document.getElementById('pf-email').value = data.email;
            }
            if (data.phone && document.getElementById('pf-phone')) {
                document.getElementById('pf-phone').value = data.phone;
            }
        } catch (e) {
            console.error('Error loading saved profile data', e);
        }
    }

    // Load saved avatar
    const savedAvatar = localStorage.getItem('aqone_user_avatar');
    if (savedAvatar) {
        const cardAvatar = document.querySelector('.profile-card-avatar');
        const headerAvatar = document.querySelector('.header-user-avatar');
        if (cardAvatar) {
            cardAvatar.style.backgroundImage = `url(${savedAvatar})`;
            cardAvatar.style.backgroundSize = 'cover';
            cardAvatar.style.backgroundPosition = 'center';
            cardAvatar.textContent = '';
        }
        if (headerAvatar) {
            headerAvatar.style.backgroundImage = `url(${savedAvatar})`;
            headerAvatar.style.backgroundSize = 'cover';
            headerAvatar.style.backgroundPosition = 'center';
            headerAvatar.textContent = '';
        }
    }
}
