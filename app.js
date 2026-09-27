/**
 * TN SevaGuard - Tamil Nadu Bill, Tax, Insurance & Renewal Due Date Tracker
 * Comprehensive reminder system for TANGEDCO EB, GCC Property Tax, CMWSSB Water Tax,
 * TN RTO Vehicle PUC/Insurance, Professional Tax, Trade License, and Utilities.
 */

// ================= State Management =================
const STORAGE_KEY = 'tn_sevaguard_dues_v2';
const THEME_KEY = 'tn_sevaguard_theme_pref';
const SHEETS_CONFIG_KEY = 'tn_sevaguard_sheets_config_v1';

let sheetsConfig = {
  url: '',
  autoSync: true,
  lastSynced: null
};

let policies = [];
let currentFilter = {
  status: 'all',
  category: 'all',
  searchQuery: '',
  sortBy: 'expiry-asc'
};
let currentView = 'grid'; // 'grid' | 'table' | 'calendar'
let currentPage = 1;
let pageSize = 50;
let categoryChartInstance = null;
let timelineChartInstance = null;

// ================= Google Sheets Two-Way Sync Engine =================
function loadSheetsConfig() {
  const saved = localStorage.getItem(SHEETS_CONFIG_KEY);
  if (saved) {
    try {
      sheetsConfig = Object.assign(sheetsConfig, JSON.parse(saved));
    } catch (e) {
      console.error('Failed to parse sheets config', e);
    }
  }
}

function saveSheetsConfig() {
  localStorage.setItem(SHEETS_CONFIG_KEY, JSON.stringify(sheetsConfig));
}

function updateSheetsUI() {
  const dot = document.getElementById('sheetSyncDot');
  const btnSyncHeader = document.getElementById('btnSyncGoogleSheets');
  const card = document.getElementById('sheetStatusCard');
  const statusTxt = document.getElementById('sheetConnectionStatus');
  const lastSyncTxt = document.getElementById('sheetLastSyncedText');
  const btnDisconnect = document.getElementById('btnDisconnectSheet');
  const btnModalSync = document.getElementById('btnModalSyncNow');
  const inputUrl = document.getElementById('inputGoogleSheetsUrl');
  const chkAuto = document.getElementById('chkAutoSyncSheets');

  if (inputUrl && !inputUrl.value && sheetsConfig.url) {
    inputUrl.value = sheetsConfig.url;
  }
  if (chkAuto) {
    chkAuto.checked = !!sheetsConfig.autoSync;
  }

  if (sheetsConfig.url) {
    if (dot) {
      dot.className = 'status-dot-indicator dot-connected';
      dot.title = 'Google Sheet: Connected & Active';
    }
    if (btnSyncHeader) btnSyncHeader.classList.remove('hidden');
    if (card) card.classList.add('connected');
    if (statusTxt) statusTxt.textContent = 'Connected to Google Sheets';
    
    let lastTime = 'Never';
    if (sheetsConfig.lastSynced) {
      const dt = new Date(sheetsConfig.lastSynced);
      lastTime = dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) + ', ' + dt.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
    }
    if (lastSyncTxt) lastSyncTxt.textContent = `Live sync active. Last synced: ${lastTime}`;
    if (btnDisconnect) btnDisconnect.classList.remove('hidden');
    if (btnModalSync) btnModalSync.classList.remove('hidden');
  } else {
    if (dot) {
      dot.className = 'status-dot-indicator dot-disconnected';
      dot.title = 'Google Sheet: Not Connected (Using Local Storage)';
    }
    if (btnSyncHeader) btnSyncHeader.classList.add('hidden');
    if (card) card.classList.remove('connected');
    if (statusTxt) statusTxt.textContent = 'Not Connected (Using Local Storage)';
    if (lastSyncTxt) lastSyncTxt.textContent = 'Connect your Google Sheet below to sync dues automatically.';
    if (btnDisconnect) btnDisconnect.classList.add('hidden');
    if (btnModalSync) btnModalSync.classList.add('hidden');
  }
}

async function syncFromGoogleSheets(silent = false) {
  if (!sheetsConfig.url) return;

  const syncIcon = document.getElementById('syncSheetsIcon');
  if (syncIcon) syncIcon.classList.add('spin-animation');
  if (!silent) showToast('Connecting to Google Sheet...', 'info');

  try {
    const res = await fetch(sheetsConfig.url);
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    const data = await res.json();

    if (data.success && Array.isArray(data.data)) {
      // Map and validate rows from Google Sheet (supports empty sheet as 0 rows)
      policies = data.data.map(item => ({
        id: item.id ? String(item.id) : ('tn_' + Math.random().toString(36).substr(2, 9)),
        name: item.name || 'Unnamed Bill',
        category: item.category || 'Other',
        provider: item.provider || 'TN Dept',
        policyNumber: item.policyNumber || 'N/A',
        regionZone: item.regionZone || '',
        holderName: item.holderName || 'Consumer',
        fatherSpouseName: item.fatherSpouseName || '',
        mobile: item.mobile ? String(item.mobile) : '',
        expiryDate: item.expiryDate || new Date().toISOString().split('T')[0],
        premiumAmount: parseFloat(item.premiumAmount) || 0,
        paymentFrequency: item.paymentFrequency || 'Bi-Monthly (2 Months - EB Bill)',
        reminderDays: parseInt(item.reminderDays, 10) || 7,
        portalUrl: item.portalUrl || '',
        notes: item.notes || ''
      }));
      savePolicies();
      renderAll();

      sheetsConfig.lastSynced = new Date().toISOString();
      saveSheetsConfig();
      updateSheetsUI();
      if (!silent) {
        if (data.data.length === 0) {
          showToast('Google Sheet synced! The sheet is currently empty (0 records).', 'info');
        } else {
          showToast(`Synced ${data.data.length} reminders from Google Sheet!`, 'success');
        }
      }
    } else {
      throw new Error(data.error || 'Invalid data format from Google Sheet');
    }
  } catch (err) {
    console.error('Google Sheet sync error:', err);
    if (!silent) {
      const errMsg = err.message || '';
      if (errMsg.includes('Failed to fetch') || errMsg.includes('NetworkError') || errMsg.includes('CORS')) {
        showToast('Sync blocked by Google permissions! In Apps Script Deploy settings, ensure "Who has access" is set to "Anyone".', 'error');
      } else {
        showToast(`Could not sync with Google Sheet: ${errMsg || 'Using local backup'}`, 'error');
      }
    }
  } finally {
    if (syncIcon) syncIcon.classList.remove('spin-animation');
  }
}

async function savePolicyToGoogleSheets(policyData, action = 'add') {
  if (!sheetsConfig.url) return;
  try {
    await fetch(sheetsConfig.url, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: action, data: policyData })
    });
    sheetsConfig.lastSynced = new Date().toISOString();
    saveSheetsConfig();
    updateSheetsUI();
  } catch (err) {
    console.error('Error posting to Google Sheets:', err);
  }
}

async function deletePolicyFromGoogleSheets(id) {
  if (!sheetsConfig.url) return;
  try {
    await fetch(sheetsConfig.url, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', id: id })
    });
  } catch (err) {
    console.error('Error deleting from Google Sheets:', err);
  }
}

// ================= Service Categories & Specific Field Configuration =================
const CATEGORY_META = {
  'Electricity (TANGEDCO / EB)': {
    fieldLabel: 'EB No',
    fieldFullLabel: 'EB No (மின் நுகர்வோர் எண்)',
    maxLength: 11,
    isNumeric: true,
    hint: 'Maximum 11 digits (Numbers only)',
    icon: 'fa-bolt',
    provider: 'TANGEDCO (Tamil Nadu Electricity Board)',
    frequency: 'Bi-Monthly (2 Months - EB Bill)',
    portal: 'https://www.tnebltd.gov.in/BillStatus/Login.xhtml',
    badgeClass: 'badge-field-eb'
  },
  'Property Tax (GCC / Municipality)': {
    fieldLabel: 'Property Tax',
    fieldFullLabel: 'Property Tax Assessment / Bill No (சொத்து வரி எண்)',
    maxLength: 14,
    isNumeric: false,
    hint: 'Maximum 14 characters (e.g. Zone/Ward/Assessment)',
    icon: 'fa-building',
    provider: 'City Municipal Corporation / Municipality',
    frequency: 'Half-Yearly (Property/Water/PT)',
    portal: 'https://chennaicorporation.gov.in/gcc/online-services/property-tax/',
    badgeClass: 'badge-field-prop'
  },
  'Water & Sewerage (CMWSSB)': {
    fieldLabel: 'Water Tax',
    fieldFullLabel: 'Water Tax Assessment / Bill No (குடிநீர் வரி எண்)',
    maxLength: 14,
    isNumeric: false,
    hint: 'Maximum 14 characters (e.g. Consumer/Bill No)',
    icon: 'fa-droplet',
    provider: 'CMWSSB MetroWater / Urban Water Board',
    frequency: 'Half-Yearly (Property/Water/PT)',
    portal: 'https://bnc.chennaimetrowater.in/',
    badgeClass: 'badge-field-water'
  },
  'Employment Exchange Renewal': {
    fieldLabel: 'Employment',
    fieldFullLabel: 'Employment Reg No (வேலைவாய்ப்பு பதிவு எண்)',
    maxLength: 15,
    isNumeric: false,
    hint: 'Maximum 15 characters (e.g. Registration / User ID)',
    icon: 'fa-user-graduate',
    provider: 'TN Dept of Employment & Training',
    frequency: 'Annual (Yearly)',
    portal: 'https://tnvelaivaaippu.gov.in/',
    badgeClass: 'badge-field-emp'
  },
  'Vehicle & RTO (PUC / FC / DL)': {
    fieldLabel: 'Vehicles',
    fieldFullLabel: 'Vehicles Reg No (வாகன பதிவு எண்)',
    maxLength: 10,
    isNumeric: false,
    hint: 'Maximum 10 characters (e.g. Vehicle Registration No)',
    icon: 'fa-car',
    provider: 'TN Transport Dept / Parivahan RTO',
    frequency: 'Annual (Yearly)',
    portal: 'https://parivahan.gov.in/',
    badgeClass: 'badge-field-veh'
  },
  'Driving Licence (DL Renewal)': {
    fieldLabel: 'DL RENEW',
    fieldFullLabel: 'Driving Licence (DL RENEW) No (ஓட்டுநர் உரிம எண்)',
    maxLength: 16,
    isNumeric: false,
    hint: 'Maximum 16 characters (Driving Licence No)',
    icon: 'fa-id-card',
    provider: 'TN Transport Dept / Sarathi Parivahan',
    frequency: 'Annual (Yearly)',
    portal: 'https://sarathi.parivahan.gov.in/',
    badgeClass: 'badge-field-dl'
  },
  'Passport Renewal': {
    fieldLabel: 'PASSPORT RENEW',
    fieldFullLabel: 'Passport (PASSPORT RENEW) File No (கடவுச்சீட்டு எண்)',
    maxLength: 15,
    isNumeric: false,
    hint: 'Maximum 15 characters (Passport / File Reference)',
    icon: 'fa-passport',
    provider: 'Passport Seva Kendra (PSK TN)',
    frequency: 'Annual (Yearly)',
    portal: 'https://www.passportindia.gov.in/',
    badgeClass: 'badge-field-pass'
  },
  'Landline & Broadband': {
    fieldLabel: 'LAND LINE',
    fieldFullLabel: 'Landline No with STD (தொலைபேசி எண்)',
    maxLength: 11,
    isNumeric: true,
    hint: 'Maximum 11 digits with STD code (Numbers only)',
    icon: 'fa-phone-flip',
    provider: 'BSNL Tamil Nadu / ACT / Airtel',
    frequency: 'Monthly',
    portal: 'https://portal.bsnl.in/',
    badgeClass: 'badge-field-land'
  },
  'Insurance (Health / Auto / Life)': {
    fieldLabel: 'Policy No',
    fieldFullLabel: 'Insurance Policy Number (காப்பீட்டு பாலிசி எண்)',
    maxLength: 25,
    isNumeric: false,
    hint: 'Maximum 25 characters',
    icon: 'fa-shield-heart',
    provider: 'Star Health / United India / LIC',
    frequency: 'Annual (Yearly)',
    portal: 'https://www.starhealth.in/online-renewal',
    badgeClass: 'badge-field-ins'
  },
  'LPG & Piped Gas': {
    fieldLabel: 'LPG ID / Consumer No',
    fieldFullLabel: 'LPG Consumer / Connection ID (எரிவாயு இணைப்பு எண்)',
    maxLength: 17,
    isNumeric: true,
    hint: 'Maximum 17 digits (Numbers only)',
    icon: 'fa-gas-pump',
    provider: 'Indane / Indian Oil Corporation',
    frequency: 'Monthly',
    portal: 'https://cx.indianoil.in/',
    badgeClass: 'badge-field-gas'
  },
  'Professional & Trade Tax': {
    fieldLabel: 'Tax / License No',
    fieldFullLabel: 'Professional Tax / Trade License No (வரி / உரிம எண்)',
    maxLength: 20,
    isNumeric: false,
    hint: 'Maximum 20 characters',
    icon: 'fa-briefcase',
    provider: 'Greater Chennai Corporation / Municipality',
    frequency: 'Half-Yearly (Property/Water/PT)',
    portal: 'https://chennaicorporation.gov.in/gcc/online-services/professional-tax/',
    badgeClass: 'badge-field-pt'
  },
  'Govt Certificates & Schemes': {
    fieldLabel: 'Scheme / CAN No',
    fieldFullLabel: 'Ration / Pension / CAN No (அரசு சான்றிதழ் எண்)',
    maxLength: 20,
    isNumeric: false,
    hint: 'Maximum 20 characters',
    icon: 'fa-landmark',
    provider: 'TN e-Sevai / Civil Supplies / EPFO',
    frequency: 'Annual (Yearly)',
    portal: 'https://www.tnesevai.tn.gov.in/',
    badgeClass: 'badge-field-other'
  },
  'Other': {
    fieldLabel: 'Account / Ref No',
    fieldFullLabel: 'Account # / Bill # / Reference #',
    maxLength: 30,
    isNumeric: false,
    hint: 'Maximum 30 characters',
    icon: 'fa-hashtag',
    provider: 'Service Provider / Dept',
    frequency: 'Monthly',
    portal: '',
    badgeClass: 'badge-field-other'
  }
};

function getCategoryMeta(cat) {
  return CATEGORY_META[cat] || CATEGORY_META['Other'];
}

function getCategoryIcon(cat) {
  const meta = getCategoryMeta(cat);
  return `<i class="fa-solid ${meta.icon}"></i>`;
}

function getServiceFieldLabel(cat) {
  return getCategoryMeta(cat).fieldLabel;
}

function getServiceFieldBadgeClass(cat) {
  return getCategoryMeta(cat).badgeClass;
}

function updateServiceCategoryFields(cat) {
  const meta = getCategoryMeta(cat);
  const labelEl = document.getElementById('labelServiceSpecificName');
  const iconEl = document.getElementById('iconPolicyNumber');
  const inputEl = document.getElementById('policyNumber');

  if (labelEl) labelEl.textContent = meta.fieldFullLabel;
  if (iconEl) iconEl.className = `fa-solid ${meta.icon}`;
  if (inputEl) {
    inputEl.placeholder = '';
    inputEl.removeAttribute('placeholder');
    inputEl.maxLength = meta.maxLength || 30;
    
    // Format / sanitize / clamp any existing value
    let val = inputEl.value;
    if (meta.isNumeric) {
      val = val.replace(/[^0-9]/g, '');
    }
    if (val.length > (meta.maxLength || 30)) {
      val = val.slice(0, meta.maxLength || 30);
    }
    inputEl.value = val;
  }
  updatePolicyNumberHint();
}

// Dynamically calculates & displays remaining characters/digits to add
function updatePolicyNumberHint() {
  const cat = document.getElementById('category') ? document.getElementById('category').value : 'Electricity (TANGEDCO / EB)';
  const meta = getCategoryMeta(cat);
  const inputEl = document.getElementById('policyNumber');
  const hintEl = document.getElementById('hintPolicyNumber');
  if (!inputEl || !hintEl) return;

  const currentLen = inputEl.value.length;
  const maxLen = meta.maxLength || 30;
  const remaining = Math.max(0, maxLen - currentLen);
  const unit = meta.isNumeric ? 'digits' : 'characters';

  if (currentLen === 0) {
    hintEl.innerHTML = `<span style="display:inline-block; padding: 2px 7px; border-radius: 5px; font-weight:700; background: rgba(79, 70, 229, 0.15); color: #818cf8; margin-right: 5px;">${maxLen}</span> ${unit} remaining to add (Max: ${maxLen})`;
  } else if (remaining === 0) {
    hintEl.innerHTML = `<span style="display:inline-block; padding: 2px 7px; border-radius: 5px; font-weight:700; background: rgba(16, 185, 129, 0.15); color: #10b981; margin-right: 5px;">✓ Limit reached</span> ${maxLen}/${maxLen} ${unit} (0 remaining)`;
  } else {
    hintEl.innerHTML = `<span style="display:inline-block; padding: 2px 7px; border-radius: 5px; font-weight:700; background: rgba(79, 70, 229, 0.2); color: #818cf8; margin-right: 5px;">${remaining}</span> ${unit} remaining to add (${currentLen}/${maxLen} entered)`;
  }
}

// Dynamically calculates & displays remaining digits for Mobile field (Max 10)
function updateMobileHint() {
  const inputEl = document.getElementById('mobile');
  const hintEl = document.getElementById('hintMobile');
  if (!inputEl || !hintEl) return;

  const currentLen = inputEl.value.length;
  const maxLen = 10;
  const remaining = Math.max(0, maxLen - currentLen);

  if (currentLen === 0) {
    hintEl.innerHTML = `<span style="display:inline-block; padding: 2px 7px; border-radius: 5px; font-weight:700; background: rgba(79, 70, 229, 0.15); color: #818cf8; margin-right: 5px;">10</span> digits remaining to add (Max: 10)`;
  } else if (remaining === 0) {
    hintEl.innerHTML = `<span style="display:inline-block; padding: 2px 7px; border-radius: 5px; font-weight:700; background: rgba(16, 185, 129, 0.15); color: #10b981; margin-right: 5px;">✓ Complete</span> 10/10 digits (0 remaining)`;
  } else {
    hintEl.innerHTML = `<span style="display:inline-block; padding: 2px 7px; border-radius: 5px; font-weight:700; background: rgba(79, 70, 229, 0.2); color: #818cf8; margin-right: 5px;">${remaining}</span> digits remaining to add (${currentLen}/10 entered)`;
  }
}

// ================= Date, Status & Currency Formatting Helpers =================
function getDaysRemaining(dateStr) {
  if (!dateStr) return 0;
  const target = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const diffTime = target - now;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

function getPolicyStatus(p) {
  if (!p || !p.expiryDate) return 'safe';
  const days = getDaysRemaining(p.expiryDate);
  if (days < 0) return 'expired';
  if (days <= (p.reminderDays || 7)) return 'urgent';
  if (days <= 30) return 'warning';
  return 'safe';
}

function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

function formatCurrency(amount) {
  const num = Number(amount) || 0;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(num);
}

function generateWhatsAppQuickText(p) {
  const days = getDaysRemaining(p.expiryDate);
  const fieldLabel = getServiceFieldLabel(p.category);
  const statusStr = days < 0 ? `Overdue by ${Math.abs(days)} days!` : days === 0 ? 'Due Today!' : `Due in ${days} days`;
  
  return `🚨 Tamil Nadu Due Date Alert:
Dear ${p.holderName}${p.fatherSpouseName ? ' (S/o / Spouse: ' + p.fatherSpouseName + ')' : ''},
Reminder for your ${p.name}.
${fieldLabel}: ${p.policyNumber}
Payment Due Date: ${formatDate(p.expiryDate)} (${statusStr})
Amount Due: ${formatCurrency(p.premiumAmount)}
Department: ${p.provider}
${p.portalUrl ? 'Pay Online: ' + p.portalUrl + '\n' : ''}Please pay before the due date to avoid penalty or disruption.
- TN SevaGuard`;
}

// ================= Tamil Nadu Quick Presets Database =================
const TN_PRESETS = {
  tangedco: {
    name: 'Home TANGEDCO Electricity (EB Bill)',
    category: 'Electricity (TANGEDCO / EB)',
    provider: 'TANGEDCO (Tamil Nadu Electricity Board)',
    policyNumber: '03205002103',
    regionZone: 'Tiruppur',
    holderName: 'Abdulrahim',
    fatherSpouseName: 'Fathimabeevi',
    mobile: '7904623327',
    paymentFrequency: 'Bi-Monthly (2 Months - EB Bill)',
    premiumAmount: 1680,
    reminderDays: 7,
    portalUrl: 'https://www.tnebltd.gov.in/BillStatus/Login.xhtml',
    notes: 'Tariff LT-1A Domestic. EB No: 03205002103'
  },
  gcc_property_tax: {
    name: 'Residential Property Tax (சொத்து வரி)',
    category: 'Property Tax (GCC / Municipality)',
    provider: 'Tiruppur City Municipal Corporation',
    policyNumber: '032/03285/2656',
    regionZone: 'Tiruppur',
    holderName: 'Abdulrahim',
    fatherSpouseName: 'Fathimabeevi',
    mobile: '7904623327',
    paymentFrequency: 'Half-Yearly (Property/Water/PT)',
    premiumAmount: 3200,
    reminderDays: 15,
    portalUrl: 'https://chennaicorporation.gov.in/gcc/online-services/property-tax/',
    notes: 'Assessment No: 032/03285/2656. Due Sept 30 & March 31.'
  },
  cmwssb_water: {
    name: 'Water & Drainage Tax (குடிநீர் வரி)',
    category: 'Water & Sewerage (CMWSSB)',
    provider: 'Tiruppur Municipal Water Board',
    policyNumber: '032/03285/2656',
    regionZone: 'Tiruppur',
    holderName: 'Abdulrahim',
    fatherSpouseName: 'Fathimabeevi',
    mobile: '7904623327',
    paymentFrequency: 'Half-Yearly (Property/Water/PT)',
    premiumAmount: 850,
    reminderDays: 15,
    portalUrl: 'https://bnc.chennaimetrowater.in/',
    notes: 'Water Tax Assessment No: 032/03285/2656'
  },
  employment_exchange: {
    name: 'TN Employment Exchange Registration Renewal',
    category: 'Employment Exchange Renewal',
    provider: 'TN Dept of Employment & Training',
    policyNumber: 'TPD556266262562',
    regionZone: 'Tiruppur',
    holderName: 'Abdulrahim',
    fatherSpouseName: 'Fathimabeevi',
    mobile: '7904623327',
    paymentFrequency: 'Annual (Yearly)',
    premiumAmount: 0,
    reminderDays: 30,
    portalUrl: 'https://tnvelaivaaippu.gov.in/',
    notes: 'Employment Exchange Reg No: TPD556266262562'
  },
  vehicles_rto: {
    name: 'Vehicle RTO FC, PUC & Insurance (TN39CF3458)',
    category: 'Vehicle & RTO (PUC / FC / DL)',
    provider: 'TN Transport Dept / Tiruppur RTO',
    policyNumber: 'TN39CF3458',
    regionZone: 'Tiruppur',
    holderName: 'Abdulrahim',
    fatherSpouseName: 'Fathimabeevi',
    mobile: '7904623327',
    paymentFrequency: 'Annual (Yearly)',
    premiumAmount: 1850,
    reminderDays: 15,
    portalUrl: 'https://parivahan.gov.in/',
    notes: 'Vehicle Reg: TN39CF3458'
  },
  dl_renew: {
    name: 'Driving Licence Renewal (DL RENEW)',
    category: 'Driving Licence (DL Renewal)',
    provider: 'TN Transport Dept / Sarathi Parivahan',
    policyNumber: 'TN39 20160004912',
    regionZone: 'Tiruppur',
    holderName: 'Abdulrahim',
    fatherSpouseName: 'Fathimabeevi',
    mobile: '7904623327',
    paymentFrequency: 'Annual (Yearly)',
    premiumAmount: 450,
    reminderDays: 30,
    portalUrl: 'https://sarathi.parivahan.gov.in/',
    notes: 'Driving Licence Renewal for Abdulrahim'
  },
  passport_renew: {
    name: 'Passport Renewal (PASSPORT RENEW)',
    category: 'Passport Renewal',
    provider: 'Passport Seva Kendra (PSK TN)',
    policyNumber: 'MD107849201923',
    regionZone: 'Tiruppur',
    holderName: 'Abdulrahim',
    fatherSpouseName: 'Fathimabeevi',
    mobile: '7904623327',
    paymentFrequency: 'Annual (Yearly)',
    premiumAmount: 1500,
    reminderDays: 30,
    portalUrl: 'https://www.passportindia.gov.in/',
    notes: 'Passport File Ref: MD107849201923'
  },
  landline_broadband: {
    name: 'BSNL Landline & Broadband Bill',
    category: 'Landline & Broadband',
    provider: 'BSNL Tamil Nadu / Tiruppur SSA',
    policyNumber: '04214328840',
    regionZone: 'Tiruppur',
    holderName: 'Abdulrahim',
    fatherSpouseName: 'Fathimabeevi',
    mobile: '7904623327',
    paymentFrequency: 'Monthly',
    premiumAmount: 649,
    reminderDays: 5,
    portalUrl: 'https://portal.bsnl.in/',
    notes: 'Landline No: 04214328840'
  },
  vehicle_insurance: {
    name: 'Comprehensive Vehicle Insurance Policy',
    category: 'Insurance (Health / Auto / Life)',
    provider: 'United India / Star Health / HDFC ERGO',
    policyNumber: 'POL-MOT-99201',
    regionZone: 'Tiruppur',
    holderName: 'Abdulrahim',
    fatherSpouseName: 'Fathimabeevi',
    mobile: '7904623327',
    paymentFrequency: 'Annual (Yearly)',
    premiumAmount: 4850,
    reminderDays: 30,
    portalUrl: 'https://www.starhealth.in/online-renewal',
    notes: 'Comprehensive Insurance Policy'
  },
  lpg_cylinder: {
    name: 'Indane Domestic LPG Gas Refill',
    category: 'LPG & Piped Gas',
    provider: 'Indane / Indian Oil Corporation',
    policyNumber: '7201984210',
    regionZone: 'Tiruppur',
    holderName: 'Abdulrahim',
    fatherSpouseName: 'Fathimabeevi',
    mobile: '7904623327',
    paymentFrequency: 'Monthly',
    premiumAmount: 920,
    reminderDays: 7,
    portalUrl: 'https://cx.indianoil.in/',
    notes: '14.2kg Refill Booking. Consumer ID: 7201984210'
  }
};

// ================= Sample Realistic Tamil Nadu Dues =================
function getRealisticSamplePolicies() {
  const now = new Date();
  
  function addDays(d, days) {
    const copy = new Date(d);
    copy.setDate(copy.getDate() + days);
    return copy.toISOString().split('T')[0];
  }

  return [
    {
      id: 'tn_eb_001',
      name: 'Home TANGEDCO Electricity (EB Bill)',
      category: 'Electricity (TANGEDCO / EB)',
      provider: 'TANGEDCO (Tamil Nadu Electricity Board)',
      policyNumber: '03205002103',
      regionZone: 'Tiruppur',
      holderName: 'Abdulrahim',
      fatherSpouseName: 'Fathimabeevi',
      mobile: '7904623327',
      expiryDate: addDays(now, 3), // DUE IN 3 DAYS (URGENT)
      premiumAmount: 1680,
      paymentFrequency: 'Bi-Monthly (2 Months - EB Bill)',
      reminderDays: 7,
      portalUrl: 'https://www.tnebltd.gov.in/BillStatus/Login.xhtml',
      notes: 'Tariff LT-1A Domestic. EB No: 03205002103'
    },
    {
      id: 'tn_pt_002',
      name: 'Residential Property Tax (சொத்து வரி)',
      category: 'Property Tax (GCC / Municipality)',
      provider: 'Tiruppur City Municipal Corporation',
      policyNumber: '032/03285/2656',
      regionZone: 'Tiruppur',
      holderName: 'Abdulrahim',
      fatherSpouseName: 'Fathimabeevi',
      mobile: '7904623327',
      expiryDate: addDays(now, 6), // DUE IN 6 DAYS (URGENT)
      premiumAmount: 3450,
      paymentFrequency: 'Half-Yearly (Property/Water/PT)',
      reminderDays: 15,
      portalUrl: 'https://chennaicorporation.gov.in/gcc/online-services/property-tax/',
      notes: 'Assessment No: 032/03285/2656'
    },
    {
      id: 'tn_wt_003',
      name: 'Water & Drainage Tax (குடிநீர் வரி)',
      category: 'Water & Sewerage (CMWSSB)',
      provider: 'Tiruppur Municipal Water Board',
      policyNumber: '032/03285/2656',
      regionZone: 'Tiruppur',
      holderName: 'Abdulrahim',
      fatherSpouseName: 'Fathimabeevi',
      mobile: '7904623327',
      expiryDate: addDays(now, 24), // DUE IN 24 DAYS (WARNING)
      premiumAmount: 850,
      paymentFrequency: 'Half-Yearly (Property/Water/PT)',
      reminderDays: 15,
      portalUrl: 'https://bnc.chennaimetrowater.in/',
      notes: 'Water Connection # 032/03285/2656'
    },
    {
      id: 'tn_emp_004',
      name: 'TN Employment Exchange Registration Renewal',
      category: 'Employment Exchange Renewal',
      provider: 'TN Dept of Employment & Training',
      policyNumber: 'TPD556266262562',
      regionZone: 'Tiruppur',
      holderName: 'Abdulrahim',
      fatherSpouseName: 'Fathimabeevi',
      mobile: '7904623327',
      expiryDate: addDays(now, 12), // DUE IN 12 DAYS (WARNING)
      premiumAmount: 0,
      paymentFrequency: 'Annual (Yearly)',
      reminderDays: 30,
      portalUrl: 'https://tnvelaivaaippu.gov.in/',
      notes: 'Employment Exchange Reg ID: TPD556266262562 (Must renew to preserve seniority)'
    },
    {
      id: 'tn_veh_005',
      name: 'Vehicle RTO FC & Insurance (TN39CF3458)',
      category: 'Vehicle & RTO (PUC / FC / DL)',
      provider: 'TN Transport Dept / Tiruppur RTO',
      policyNumber: 'TN39CF3458',
      regionZone: 'Tiruppur',
      holderName: 'Abdulrahim',
      fatherSpouseName: 'Fathimabeevi',
      mobile: '7904623327',
      expiryDate: addDays(now, 18), // DUE IN 18 DAYS (WARNING)
      premiumAmount: 1850,
      paymentFrequency: 'Annual (Yearly)',
      reminderDays: 15,
      portalUrl: 'https://parivahan.gov.in/',
      notes: 'Vehicle Reg: TN39CF3458'
    },
    {
      id: 'tn_dl_006',
      name: 'Driving Licence Renewal (DL RENEW)',
      category: 'Driving Licence (DL Renewal)',
      provider: 'TN Transport Dept / Sarathi Parivahan',
      policyNumber: 'TN39 20160004912',
      regionZone: 'Tiruppur',
      holderName: 'Abdulrahim',
      fatherSpouseName: 'Fathimabeevi',
      mobile: '7904623327',
      expiryDate: addDays(now, 45), // SAFE (45 DAYS)
      premiumAmount: 450,
      paymentFrequency: 'Annual (Yearly)',
      reminderDays: 30,
      portalUrl: 'https://sarathi.parivahan.gov.in/',
      notes: 'Driving Licence Renewal for Abdulrahim'
    },
    {
      id: 'tn_pass_007',
      name: 'Passport Renewal (PASSPORT RENEW)',
      category: 'Passport Renewal',
      provider: 'Passport Seva Kendra (PSK TN)',
      policyNumber: 'MD107849201923',
      regionZone: 'Tiruppur',
      holderName: 'Abdulrahim',
      fatherSpouseName: 'Fathimabeevi',
      mobile: '7904623327',
      expiryDate: addDays(now, 60), // SAFE (60 DAYS)
      premiumAmount: 1500,
      paymentFrequency: 'Annual (Yearly)',
      reminderDays: 30,
      portalUrl: 'https://www.passportindia.gov.in/',
      notes: 'Passport Seva File Ref: MD107849201923'
    },
    {
      id: 'tn_land_008',
      name: 'BSNL Landline & Broadband Bill',
      category: 'Landline & Broadband',
      provider: 'BSNL Tamil Nadu (Tiruppur SSA)',
      policyNumber: '04214328840',
      regionZone: 'Tiruppur',
      holderName: 'Abdulrahim',
      fatherSpouseName: 'Fathimabeevi',
      mobile: '7904623327',
      expiryDate: addDays(now, -2), // OVERDUE BY 2 DAYS
      premiumAmount: 649,
      paymentFrequency: 'Monthly',
      reminderDays: 5,
      portalUrl: 'https://portal.bsnl.in/',
      notes: 'Landline No: 04214328840'
    }
  ];
}

// ================= Persistence =================
function loadPolicies() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      policies = JSON.parse(saved);
    } catch (e) {
      console.error('Failed to parse saved policies', e);
      policies = [];
    }
  } else {
    // Start completely clean (0 dummy data)
    policies = [];
    savePolicies();
  }
}

function savePolicies() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(policies));
  } catch (e) {
    // LocalStorage quota reached (5MB limit) - all records remain safe in live memory and Google Sheets
    console.warn('Browser localStorage quota reached. Live memory and Google Sheets remain active.', e);
  }
}

// ================= Rendering & Filtering =================

function getFilteredPolicies() {
  return policies.filter(p => {
    const status = getPolicyStatus(p);
    
    // Status Filter
    if (currentFilter.status === 'expiring-urgent' && status !== 'urgent') return false;
    if (currentFilter.status === 'expiring-soon' && status !== 'warning' && status !== 'urgent') return false;
    if (currentFilter.status === 'active' && status !== 'safe') return false;
    if (currentFilter.status === 'expired' && status !== 'expired') return false;
    
    // Category Filter
    if (currentFilter.category !== 'all' && p.category !== currentFilter.category) return false;
    
    // Search Query
    if (currentFilter.searchQuery.trim() !== '') {
      const q = currentFilter.searchQuery.toLowerCase();
      const match = (p.name && p.name.toLowerCase().includes(q)) ||
                    (p.policyNumber && p.policyNumber.toLowerCase().includes(q)) ||
                    (p.provider && p.provider.toLowerCase().includes(q)) ||
                    (p.holderName && p.holderName.toLowerCase().includes(q)) ||
                    (p.regionZone && p.regionZone.toLowerCase().includes(q)) ||
                    (p.notes && p.notes.toLowerCase().includes(q));
      if (!match) return false;
    }
    
    return true;
  }).sort((a, b) => {
    switch (currentFilter.sortBy) {
      case 'expiry-asc':
        return new Date(a.expiryDate) - new Date(b.expiryDate);
      case 'expiry-desc':
        return new Date(b.expiryDate) - new Date(a.expiryDate);
      case 'premium-desc':
        return (Number(b.premiumAmount) || 0) - (Number(a.premiumAmount) || 0);
      case 'premium-asc':
        return (Number(a.premiumAmount) || 0) - (Number(b.premiumAmount) || 0);
      case 'name-asc':
        return a.name.localeCompare(b.name);
      default:
        return 0;
    }
  });
}

function renderAll() {
  const filtered = getFilteredPolicies();
  updateKPICards();
  updateAlertBannerAndNotifications();

  // Dynamic Pagination Calculation
  const totalCount = filtered.length;
  const totalPages = Math.ceil(totalCount / pageSize) || 1;
  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;

  const startIdx = (currentPage - 1) * pageSize;
  const endIdx = startIdx + pageSize;
  const paged = filtered.slice(startIdx, endIdx);

  renderGridView(paged);
  renderTableView(paged);
  renderCalendarTimeline(filtered.slice(0, 50));
  updateEmptyState(filtered.length);
  updateResultsCount(filtered.length);
  updatePaginationUI(totalCount, totalPages, startIdx, endIdx);
  renderCharts();
}

function getPageNumbersWindow(current, total, maxVisible = 10) {
  if (total <= maxVisible) {
    const list = [];
    for (let i = 1; i <= total; i++) list.push(i);
    return list;
  }

  let start = Math.max(1, current - Math.floor(maxVisible / 2));
  let end = start + maxVisible - 1;

  if (end > total) {
    end = total;
    start = Math.max(1, end - maxVisible + 1);
  }

  const list = [];
  for (let i = start; i <= end; i++) {
    list.push(i);
  }
  return list;
}

function updatePaginationUI(totalCount, totalPages, startIdx, endIdx) {
  const section = document.getElementById('paginationSection');
  if (!section) return;

  if (totalCount === 0) {
    section.classList.add('hidden');
    return;
  }
  section.classList.remove('hidden');

  const actualStart = startIdx + 1;
  const actualEnd = Math.min(endIdx, totalCount);
  const infoEl = document.getElementById('pageInfoText');
  if (infoEl) {
    infoEl.innerHTML = `Showing <strong>${actualStart.toLocaleString()}–${actualEnd.toLocaleString()}</strong> of <strong>${totalCount.toLocaleString()}</strong> dues`;
  }

  // Render Google-Style Numbered Buttons (1, 2, 3, 4, 5, 6, 7, 8, 9, 10)
  const numberListEl = document.getElementById('paginationNumberList');
  if (numberListEl) {
    const pageNumbers = getPageNumbersWindow(currentPage, totalPages, 10);
    numberListEl.innerHTML = pageNumbers.map(num => `
      <button class="btn-page-num ${num === currentPage ? 'active' : ''}" data-page="${num}" title="Go to Page ${num}">
        ${num}
      </button>
    `).join('');

    numberListEl.querySelectorAll('.btn-page-num').forEach(btn => {
      btn.addEventListener('click', function() {
        const page = parseInt(this.dataset.page, 10);
        if (page && page !== currentPage) {
          currentPage = page;
          renderAll();
          window.scrollTo({ top: 380, behavior: 'smooth' });
        }
      });
    });
  }

  const jumpInput = document.getElementById('inputJumpPage');
  if (jumpInput) {
    jumpInput.max = totalPages;
    jumpInput.placeholder = `${currentPage}/${totalPages}`;
  }

  const btnFirst = document.getElementById('btnFirstPage');
  const btnPrev = document.getElementById('btnPrevPage');
  const btnNext = document.getElementById('btnNextPage');
  const btnLast = document.getElementById('btnLastPage');

  if (btnFirst) btnFirst.disabled = (currentPage <= 1);
  if (btnPrev) btnPrev.disabled = (currentPage <= 1);
  if (btnNext) btnNext.disabled = (currentPage >= totalPages);
  if (btnLast) btnLast.disabled = (currentPage >= totalPages);
}

function updateKPICards() {
  let urgentCount = 0;
  let soonCount = 0;
  let expiredCount = 0;
  let activeCount = 0;
  let upcomingMonthOutflow = 0;

  policies.forEach(p => {
    const st = getPolicyStatus(p);
    const days = getDaysRemaining(p.expiryDate);

    if (st === 'urgent') urgentCount++;
    if (st === 'urgent' || st === 'warning') soonCount++;
    if (st === 'expired') expiredCount++;
    if (st === 'safe' || st === 'warning' || st === 'urgent') {
      activeCount++;
      if (days >= 0 && days <= 35) {
        upcomingMonthOutflow += Number(p.premiumAmount) || 0;
      }
    }
  });

  document.getElementById('kpiTotal').textContent = policies.length;
  document.getElementById('kpiExpiringUrgent').textContent = urgentCount;
  document.getElementById('kpiExpiringSoon').textContent = soonCount;
  document.getElementById('kpiExpired').textContent = expiredCount;
  document.getElementById('kpiExpiredSub').textContent = expiredCount > 0 ? 'Late fee / penalty risk' : 'All up to date';
  document.getElementById('kpiAnnualPremium').textContent = formatCurrency(upcomingMonthOutflow);
  document.getElementById('kpiActiveCount').textContent = `${activeCount} Active Reminders`;
}

function updateAlertBannerAndNotifications() {
  const urgentPolicies = policies.filter(p => getPolicyStatus(p) === 'urgent');
  const alertBanner = document.getElementById('alertBanner');
  const notifBadge = document.getElementById('notifBadge');
  const notifList = document.getElementById('notifList');

  // Banner Logic
  if (urgentPolicies.length > 0) {
    alertBanner.classList.remove('hidden');
    document.getElementById('alertBannerTitle').textContent = `Urgent: ${urgentPolicies.length} ${urgentPolicies.length === 1 ? 'Due Date' : 'Due Dates'} Approaching!`;
    const soonest = urgentPolicies.sort((a,b) => new Date(a.expiryDate) - new Date(b.expiryDate))[0];
    const days = getDaysRemaining(soonest.expiryDate);
    document.getElementById('alertBannerDesc').textContent = `"${soonest.name}" is due in ${days === 0 ? 'today' : days + ' days'} (${formatCurrency(soonest.premiumAmount)}). Pay online to avoid disconnection / penalty.`;
  } else {
    alertBanner.classList.add('hidden');
  }

  // Notification Flyout Badges
  const expiringOrExpired = policies.filter(p => {
    const st = getPolicyStatus(p);
    return st === 'urgent' || st === 'warning' || st === 'expired';
  });

  if (expiringOrExpired.length > 0) {
    notifBadge.textContent = expiringOrExpired.length;
    notifBadge.classList.remove('hidden');
  } else {
    notifBadge.classList.add('hidden');
  }

  // Populate Notification List
  if (expiringOrExpired.length === 0) {
    notifList.innerHTML = `
      <div style="padding: 1.5rem; text-align: center; color: var(--text-muted);">
        <i class="fa-solid fa-circle-check" style="font-size: 2rem; color: var(--accent-emerald); margin-bottom: 0.5rem; display: block;"></i>
        <p>All Tamil Nadu bills, taxes, and renewals are up to date! No immediate dues.</p>
      </div>
    `;
  } else {
    notifList.innerHTML = expiringOrExpired.map(p => {
      const days = getDaysRemaining(p.expiryDate);
      const st = getPolicyStatus(p);
      const isUrgent = st === 'urgent';
      const isExpired = st === 'expired';
      
      let badgeColorClass = isUrgent ? 'notif-item-urgent' : isExpired ? 'notif-item-urgent' : 'notif-item-warning';
      let icon = isExpired ? 'fa-triangle-exclamation' : isUrgent ? 'fa-fire' : 'fa-clock';
      let msg = isExpired ? `Overdue by ${Math.abs(days)} days` : days === 0 ? 'Due Today!' : `Due in ${days} days`;

      return `
        <div class="notif-item ${badgeColorClass}" onclick="openShareModal('${p.id}')">
          <div class="notif-item-icon">
            <i class="fa-solid ${icon}"></i>
          </div>
          <div class="notif-item-content">
            <h4>${escapeHtml(p.name)}</h4>
            <p><strong style="color: ${isUrgent || isExpired ? 'var(--accent-red)' : 'var(--accent-amber)'};">${msg} &bull; ${formatCurrency(p.premiumAmount)}</strong> &bull; ${escapeHtml(p.provider)}</p>
          </div>
        </div>
      `;
    }).join('');
  }
}

function updateResultsCount(count) {
  document.getElementById('resultsCount').textContent = `Showing ${count} of ${policies.length} ${policies.length === 1 ? 'due / reminder' : 'dues & reminders'}`;
}

function updateEmptyState(filteredCount) {
  const emptyState = document.getElementById('emptyState');
  const gridView = document.getElementById('gridView');
  const tableView = document.getElementById('tableView');
  const calendarView = document.getElementById('calendarView');

  if (filteredCount === 0) {
    emptyState.classList.remove('hidden');
    gridView.classList.add('hidden');
    tableView.classList.add('hidden');
    calendarView.classList.add('hidden');

    if (policies.length === 0) {
      document.getElementById('emptyTitle').textContent = 'No Dues or Bills Found';
      document.getElementById('emptySubtitle').textContent = 'Click on any Tamil Nadu Quick Preset above or Add Reminder to track your bills.';
    } else {
      document.getElementById('emptyTitle').textContent = 'No Matching Bills Found';
      document.getElementById('emptySubtitle').textContent = 'Try adjusting your search query or filter criteria.';
    }
  } else {
    emptyState.classList.add('hidden');
    if (currentView === 'grid') gridView.classList.remove('hidden');
    if (currentView === 'table') tableView.classList.remove('hidden');
    if (currentView === 'calendar') calendarView.classList.remove('hidden');
  }
}

// ================= Card Grid View =================
function renderGridView(list) {
  const container = document.getElementById('gridView');
  if (currentView !== 'grid') {
    container.classList.remove('active');
    return;
  }
  container.classList.add('active');

  container.innerHTML = list.map(p => {
    const days = getDaysRemaining(p.expiryDate);
    const status = getPolicyStatus(p);

    let cardClass = '';
    let statusBadge = '';
    let countdownTag = '';

    if (status === 'urgent') {
      cardClass = 'card-urgent';
      statusBadge = `<span class="status-badge badge-urgent"><i class="fa-solid fa-fire"></i> Due in ${days === 0 ? 'Today' : days + 'd'}</span>`;
      countdownTag = `<span class="countdown-time-tag time-urgent"><i class="fa-solid fa-clock-rotate-left"></i> ${days === 0 ? 'Due Today' : days + ' Days Left'}</span>`;
    } else if (status === 'warning') {
      cardClass = 'card-warning';
      statusBadge = `<span class="status-badge badge-warning"><i class="fa-solid fa-clock"></i> Due in ${days}d</span>`;
      countdownTag = `<span class="countdown-time-tag time-warning"><i class="fa-solid fa-hourglass-start"></i> ${days} Days Left</span>`;
    } else if (status === 'expired') {
      cardClass = 'card-expired';
      statusBadge = `<span class="status-badge badge-expired"><i class="fa-solid fa-circle-xmark"></i> Overdue</span>`;
      countdownTag = `<span class="countdown-time-tag time-expired"><i class="fa-solid fa-triangle-exclamation"></i> Overdue ${Math.abs(days)}d</span>`;
    } else {
      cardClass = 'card-safe';
      statusBadge = `<span class="status-badge badge-safe"><i class="fa-solid fa-circle-check"></i> Safe</span>`;
      countdownTag = `<span class="countdown-time-tag time-safe"><i class="fa-regular fa-calendar-check"></i> ${days} Days Left</span>`;
    }

    const meta = getCategoryMeta(p.category);
    const cleanMobile = (p.mobile || '').replace(/[^0-9]/g, '');

    return `
      <article class="policy-card ${cardClass}" id="card_${p.id}">
        <div class="card-header-row">
          <div style="display: flex; align-items: center; flex-wrap: wrap; gap: 4px;">
            <span class="category-tag">${getCategoryIcon(p.category)} ${escapeHtml(p.category)}</span>
            ${p.regionZone ? `<span class="region-badge"><i class="fa-solid fa-location-dot"></i> ${escapeHtml(p.regionZone)}</span>` : ''}
          </div>
          ${statusBadge}
        </div>

        <!-- Customer Registry Details (Common across all services) -->
        <div class="card-customer-profile">
          <div class="customer-profile-row">
            <span class="customer-name-tag">
              <i class="fa-solid fa-user text-primary"></i> ${escapeHtml(p.holderName || 'Consumer')}
            </span>
            ${cleanMobile ? `
              <a href="https://api.whatsapp.com/send?phone=91${cleanMobile}&text=${encodeURIComponent(generateWhatsAppQuickText(p))}" target="_blank" rel="noopener" class="btn-wa-chip" title="Send WhatsApp Due Alert to ${cleanMobile}">
                <i class="fa-brands fa-whatsapp"></i>
              </a>
            ` : ''}
          </div>
          ${p.fatherSpouseName ? `
            <div class="customer-spouse-tag">
              <i class="fa-solid fa-people-roof text-cyan"></i> S/o / Spouse: <strong>${escapeHtml(p.fatherSpouseName)}</strong>
            </div>
          ` : ''}
          ${cleanMobile ? `
            <div class="customer-spouse-tag">
              <i class="fa-solid fa-mobile-screen text-emerald"></i> Mobile: <strong>+91 ${escapeHtml(p.mobile)}</strong>
            </div>
          ` : ''}
        </div>

        <h3 class="card-policy-title">${escapeHtml(p.name)}</h3>
        <div class="card-provider-text">
          <span>${escapeHtml(p.provider)}</span>
          &bull;
          <span class="badge-field ${meta.badgeClass}">
            <i class="fa-solid ${meta.icon}"></i> ${meta.fieldLabel}: #${escapeHtml(p.policyNumber)}
          </span>
        </div>

        <div class="expiry-countdown-box">
          <div>
            <span class="countdown-label">Payment Due / Expiry Date</span>
            <strong class="countdown-date">${formatDate(p.expiryDate)}</strong>
          </div>
          ${countdownTag}
        </div>

        <div class="card-meta-grid">
          <div class="meta-item">
            <span>Customer Name</span>
            <strong>${escapeHtml(p.holderName)}</strong>
          </div>
          <div class="meta-item">
            <span>Due Amount (${escapeHtml(p.paymentFrequency || 'Cycle')})</span>
            <strong class="text-emerald font-semibold" style="font-size: 1.05rem;">${formatCurrency(p.premiumAmount)}</strong>
          </div>
          <div class="meta-item">
            <span>Reminder Window</span>
            <strong>${p.reminderDays || 7} Days Before</strong>
          </div>
          <div class="meta-item">
            <span>Official Portal</span>
            ${p.portalUrl ? `
              <a href="${escapeHtml(p.portalUrl)}" target="_blank" rel="noopener noreferrer" style="color: var(--primary); font-weight: 600; text-decoration: underline; font-size: 0.8rem;">
                Pay Online <i class="fa-solid fa-arrow-up-right-from-square"></i>
              </a>
            ` : '<strong>N/A</strong>'}
          </div>
        </div>

        ${p.notes ? `
          <div class="card-notes" title="${escapeHtml(p.notes)}">
            <i class="fa-regular fa-comment-dots"></i>
            <span>${escapeHtml(p.notes)}</span>
          </div>
        ` : ''}

        <div class="card-actions-footer">
          <div class="card-action-group">
            <button class="btn btn-sm btn-emerald" onclick="openRenewModal('${p.id}')" title="Mark bill as paid and set next due date">
              <i class="fa-solid fa-check-double"></i> Mark Paid & Next Cycle
            </button>
            <button class="btn btn-sm btn-outline" onclick="openShareModal('${p.id}')" title="Dispatch WhatsApp / Email Reminder & Calendar invite">
              <i class="fa-regular fa-paper-plane"></i> Alert / Pay
            </button>
          </div>

          <div class="card-action-group">
            <button class="btn btn-icon btn-sm" onclick="editPolicy('${p.id}')" title="Edit Bill Details">
              <i class="fa-regular fa-pen-to-square"></i>
            </button>
            <button class="btn btn-icon btn-sm text-red" onclick="deletePolicy('${p.id}')" title="Delete Reminder">
              <i class="fa-regular fa-trash-can"></i>
            </button>
          </div>
        </div>
      </article>
    `;
  }).join('');
}

// ================= Table View =================
function renderTableView(list) {
  const container = document.getElementById('tableView');
  if (currentView !== 'table') {
    container.classList.remove('active');
    return;
  }
  container.classList.add('active');

  const tbody = document.getElementById('tableBody');
  tbody.innerHTML = list.map(p => {
    const days = getDaysRemaining(p.expiryDate);
    const status = getPolicyStatus(p);

    let statusPill = '';
    if (status === 'urgent') {
      statusPill = `<span class="status-badge badge-urgent"><i class="fa-solid fa-fire"></i> Due in ${days}d</span>`;
    } else if (status === 'warning') {
      statusPill = `<span class="status-badge badge-warning"><i class="fa-solid fa-clock"></i> Due in ${days}d</span>`;
    } else if (status === 'expired') {
      statusPill = `<span class="status-badge badge-expired"><i class="fa-solid fa-circle-xmark"></i> Overdue</span>`;
    } else {
      statusPill = `<span class="status-badge badge-safe"><i class="fa-solid fa-circle-check"></i> Safe</span>`;
    }

    const meta = getCategoryMeta(p.category);
    const cleanMobile = (p.mobile || '').replace(/[^0-9]/g, '');

    return `
      <tr>
        <td>
          <div style="font-weight: 700;">${formatDate(p.expiryDate)}</div>
          <div>${statusPill}</div>
        </td>
        <td>
          <div style="font-weight: 700; color: var(--text-main); font-size: 0.92rem;">${escapeHtml(p.holderName || 'Consumer')}</div>
        </td>
        <td>
          <div class="customer-subtext">
            <i class="fa-solid fa-people-roof text-cyan"></i>
            <span>${escapeHtml(p.fatherSpouseName || '—')}</span>
          </div>
        </td>
        <td>
          <div class="mobile-cell-wrap">
            <span class="mobile-number-text">${escapeHtml(p.mobile || '—')}</span>
            ${cleanMobile ? `
              <a href="https://api.whatsapp.com/send?phone=91${cleanMobile}&text=${encodeURIComponent(generateWhatsAppQuickText(p))}" target="_blank" rel="noopener" class="btn-wa-chip" title="Send WhatsApp Due Reminder">
                <i class="fa-brands fa-whatsapp"></i>
              </a>
              <a href="tel:${cleanMobile}" class="btn-call-chip" title="Call ${escapeHtml(p.holderName)}">
                <i class="fa-solid fa-phone"></i>
              </a>
            ` : ''}
          </div>
        </td>
        <td>
          <div><span class="category-tag">${getCategoryIcon(p.category)} ${escapeHtml(p.category)}</span></div>
          ${p.regionZone ? `<div style="font-size: 0.72rem; color: #818cf8; margin-top: 2px;"><i class="fa-solid fa-location-dot"></i> ${escapeHtml(p.regionZone)}</div>` : ''}
        </td>
        <td>
          <div>
            <span class="badge-field ${meta.badgeClass}">
              <i class="fa-solid ${meta.icon}"></i> 
              <strong>${meta.fieldLabel}:</strong> ${escapeHtml(p.policyNumber)}
            </span>
          </div>
          <div class="text-muted" style="font-size: 0.76rem; margin-top: 3px;">${escapeHtml(p.name)}</div>
        </td>
        <td>
          <strong class="text-emerald" style="font-size: 0.95rem;">${formatCurrency(p.premiumAmount)}</strong>
          <div class="text-muted" style="font-size: 0.75rem;">${escapeHtml(p.paymentFrequency || 'Cycle')}</div>
        </td>
        <td>
          <strong style="color: ${status === 'urgent' || status === 'expired' ? 'var(--accent-red)' : status === 'warning' ? 'var(--accent-amber)' : 'var(--accent-emerald)'};">
            ${days < 0 ? Math.abs(days) + ' days overdue' : days === 0 ? 'Due Today' : days + ' days left'}
          </strong>
        </td>
        <td class="text-right">
          <div class="card-action-group" style="justify-content: flex-end;">
            ${p.portalUrl ? `
              <a href="${escapeHtml(p.portalUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-xs btn-primary" title="Open Official Pay Portal">
                <i class="fa-solid fa-arrow-up-right-from-square"></i> Pay
              </a>
            ` : ''}
            <button class="btn btn-xs btn-emerald" onclick="openRenewModal('${p.id}')" title="Mark Paid & Next Cycle">
              <i class="fa-solid fa-rotate"></i>
            </button>
            <button class="btn btn-xs btn-outline" onclick="openShareModal('${p.id}')" title="Dispatch Alerts">
              <i class="fa-regular fa-paper-plane"></i>
            </button>
            <button class="btn btn-xs btn-ghost" onclick="editPolicy('${p.id}')" title="Edit">
              <i class="fa-regular fa-pen-to-square"></i>
            </button>
            <button class="btn btn-xs btn-ghost text-red" onclick="deletePolicy('${p.id}')" title="Delete">
              <i class="fa-regular fa-trash-can"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// ================= Calendar Timeline View =================
function renderCalendarTimeline(list) {
  const container = document.getElementById('calendarView');
  if (currentView !== 'calendar') {
    container.classList.remove('active');
    return;
  }
  container.classList.add('active');

  const timelineList = document.getElementById('timelineList');
  const sorted = [...list].sort((a,b) => new Date(a.expiryDate) - new Date(b.expiryDate));

  timelineList.innerHTML = sorted.map(p => {
    const days = getDaysRemaining(p.expiryDate);
    const status = getPolicyStatus(p);

    return `
      <div class="timeline-node ${status}">
        <div class="timeline-dot"></div>
        <div class="timeline-card">
          <div>
            <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0.25rem;">
              <i class="fa-regular fa-calendar"></i> <strong>${formatDate(p.expiryDate)}</strong> 
              (${days < 0 ? 'Overdue by ' + Math.abs(days) + ' days' : days === 0 ? 'Due Today' : 'in ' + days + ' days'})
            </div>
            <h4 style="font-size: 1rem; font-weight: 700;">${escapeHtml(p.name)}</h4>
            <div style="font-size: 0.82rem; color: var(--text-muted);">
              ${escapeHtml(p.provider)} &bull; #${escapeHtml(p.policyNumber)} &bull; Amount: <strong class="text-emerald">${formatCurrency(p.premiumAmount)}</strong>
            </div>
          </div>
          <div class="card-action-group">
            ${p.portalUrl ? `
              <a href="${escapeHtml(p.portalUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-primary">
                <i class="fa-solid fa-arrow-up-right-from-square"></i> Pay Online
              </a>
            ` : ''}
            <button class="btn btn-sm btn-emerald" onclick="openRenewModal('${p.id}')">
              <i class="fa-solid fa-rotate"></i> Next Cycle
            </button>
            <button class="btn btn-sm btn-outline" onclick="openShareModal('${p.id}')">
              <i class="fa-regular fa-paper-plane"></i>
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// ================= Analytics Charts =================
function renderCharts() {
  const ctxCategory = document.getElementById('categoryChart')?.getContext('2d');
  const ctxTimeline = document.getElementById('timelineChart')?.getContext('2d');
  if (!ctxCategory || !ctxTimeline) return;

  // 1. Category Breakdown
  const categoryCounts = {};
  policies.forEach(p => {
    categoryCounts[p.category] = (categoryCounts[p.category] || 0) + 1;
  });

  const catLabels = Object.keys(categoryCounts);
  const catData = Object.values(categoryCounts);

  if (categoryChartInstance) categoryChartInstance.destroy();
  categoryChartInstance = new Chart(ctxCategory, {
    type: 'doughnut',
    data: {
      labels: catLabels,
      datasets: [{
        data: catData,
        backgroundColor: [
          '#f59e0b', // EB Amber
          '#06b6d4', // Property Tax Cyan
          '#3b82f6', // Water Blue
          '#8b5cf6', // Vehicle Purple
          '#10b981', // Insurance Emerald
          '#ef4444', // PT Red
          '#ec4899', // Gas
          '#14b8a6', // Telecom
          '#64748b'
        ],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: { color: getComputedStyle(document.body).getPropertyValue('--text-main').trim() || '#94a3b8' }
        }
      }
    }
  });

  // 2. Upcoming 6 Months Payment Timeline
  const monthMap = {};
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  
  const now = new Date();
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const key = `${monthNames[d.getMonth()]} ${d.getFullYear().toString().slice(2)}`;
    monthMap[key] = 0;
  }

  policies.forEach(p => {
    if (!p.expiryDate) return;
    const exp = new Date(p.expiryDate);
    const key = `${monthNames[exp.getMonth()]} ${exp.getFullYear().toString().slice(2)}`;
    if (monthMap.hasOwnProperty(key)) {
      monthMap[key] += Number(p.premiumAmount) || 0;
    }
  });

  if (timelineChartInstance) timelineChartInstance.destroy();
  timelineChartInstance = new Chart(ctxTimeline, {
    type: 'bar',
    data: {
      labels: Object.keys(monthMap),
      datasets: [{
        label: 'Estimated Due Amount (₹)',
        data: Object.values(monthMap),
        backgroundColor: 'rgba(79, 70, 229, 0.75)',
        borderRadius: 6,
        borderColor: '#4f46e5',
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          ticks: { color: '#94a3b8' },
          grid: { display: false }
        },
        y: {
          ticks: { color: '#94a3b8' },
          grid: { color: 'rgba(255, 255, 255, 0.05)' }
        }
      },
      plugins: {
        legend: { display: false }
      }
    }
  });
}

// ================= Modal Actions (CRUD & Renew) =================

function openAddModal() {
  document.getElementById('policyForm').reset();
  document.getElementById('policyId').value = '';
  document.getElementById('modalTitle').textContent = 'Add Tamil Nadu Bill / Renewal Reminder';
  
  // Clean blank customer & service inputs with no placeholder remnants
  document.getElementById('holderName').value = '';
  document.getElementById('fatherSpouseName').value = '';
  document.getElementById('mobile').value = '';
  document.getElementById('policyNumber').value = '';
  document.getElementById('policyName').value = '';
  document.getElementById('provider').value = '';
  document.getElementById('premiumAmount').value = '';
  document.getElementById('portalUrl').value = '';
  document.getElementById('notes').value = '';

  // Default category to Electricity (EB No - 11 digits max)
  const defaultCategory = 'Electricity (TANGEDCO / EB)';
  document.getElementById('category').value = defaultCategory;
  updateServiceCategoryFields(defaultCategory);
  updateMobileHint();
  updatePolicyNumberHint();

  const defaultDue = new Date();
  defaultDue.setDate(defaultDue.getDate() + 15);
  document.getElementById('expiryDate').value = defaultDue.toISOString().split('T')[0];
  document.getElementById('expiryDaysHint').textContent = 'Calculates days remaining automatically';
  
  document.getElementById('policyModal').classList.remove('hidden');
}

function editPolicy(id) {
  const p = policies.find(item => item.id === id);
  if (!p) return;

  document.getElementById('policyId').value = p.id;
  document.getElementById('modalTitle').textContent = 'Edit Bill / Renewal Details';
  
  // Section 1: Customer Profile (Common for all)
  document.getElementById('holderName').value = p.holderName || '';
  document.getElementById('fatherSpouseName').value = p.fatherSpouseName || '';
  document.getElementById('mobile').value = p.mobile || '';

  // Section 2: Service Category & Respective Field
  const cat = p.category || 'Electricity (TANGEDCO / EB)';
  document.getElementById('category').value = cat;
  updateServiceCategoryFields(cat);

  document.getElementById('policyName').value = p.name || '';
  document.getElementById('provider').value = p.provider || '';
  document.getElementById('policyNumber').value = p.policyNumber || '';
  document.getElementById('regionZone').value = p.regionZone || '';
  
  // Update dynamic counters for existing values
  updateMobileHint();
  updatePolicyNumberHint();

  // Section 3: Due Date & Schedule
  document.getElementById('expiryDate').value = p.expiryDate || '';
  document.getElementById('paymentFrequency').value = p.paymentFrequency || 'Bi-Monthly (2 Months - EB Bill)';
  document.getElementById('premiumAmount').value = p.premiumAmount || '';
  document.getElementById('reminderDays').value = p.reminderDays || '7';
  document.getElementById('portalUrl').value = p.portalUrl || '';
  document.getElementById('notes').value = p.notes || '';

  const days = getDaysRemaining(p.expiryDate);
  document.getElementById('expiryDaysHint').textContent = days < 0 ? `Currently overdue by ${Math.abs(days)} days` : `Due in ${days} days from today`;

  document.getElementById('policyModal').classList.remove('hidden');
}

function deletePolicy(id) {
  const p = policies.find(item => item.id === id);
  if (!p) return;

  if (confirm(`Are you sure you want to delete "${p.name}"?`)) {
    policies = policies.filter(item => item.id !== id);
    savePolicies();
    deletePolicyFromGoogleSheets(id);
    renderAll();
    showToast('Reminder deleted successfully', 'info');
  }
}

// Form Submission (Add/Edit)
document.getElementById('policyForm').addEventListener('submit', function(e) {
  e.preventDefault();
  
  const id = document.getElementById('policyId').value;
  const holderName = document.getElementById('holderName').value.trim();
  const fatherSpouseName = document.getElementById('fatherSpouseName').value.trim();
  const mobile = document.getElementById('mobile').value.trim();
  const name = document.getElementById('policyName').value.trim();
  const provider = document.getElementById('provider').value.trim();
  const policyNumber = document.getElementById('policyNumber').value.trim();
  const category = document.getElementById('category').value;
  const regionZone = document.getElementById('regionZone').value;
  const expiryDate = document.getElementById('expiryDate').value;
  const premiumAmount = parseFloat(document.getElementById('premiumAmount').value) || 0;

  if (!name || !provider || !policyNumber || !holderName || !expiryDate) {
    showToast('Please fill in all required fields (Name, Service No, Provider, Due Date)!', 'error');
    return;
  }

  const meta = getCategoryMeta(category);

  // Maximum character length verification (No more can be added)
  if (meta.maxLength && policyNumber.length > meta.maxLength) {
    showToast(`Maximum allowed length for ${meta.fieldLabel} is ${meta.maxLength} characters! No more can be added.`, 'error');
    return;
  }

  // Strict numeric validation for numeric categories (EB, Landline, LPG)
  if (meta.isNumeric && !/^[0-9]+$/.test(policyNumber)) {
    showToast(`${meta.fieldLabel} must contain numbers only!`, 'error');
    return;
  }

  // Specific length constraints per registered data structure
  if (category === 'Electricity (TANGEDCO / EB)' && policyNumber.length !== 11) {
    showToast('EB No must be exactly 11 digits (e.g. 03205002103)!', 'error');
    return;
  }

  if (category === 'Employment Exchange Renewal' && policyNumber.length > 15) {
    showToast('Employment registration number cannot exceed 15 characters!', 'error');
    return;
  }

  if (category === 'Landline & Broadband' && policyNumber.length !== 11) {
    showToast('Landline number must be 11 digits with STD code (e.g. 04214328840)!', 'error');
    return;
  }

  if (mobile && mobile.length !== 10) {
    showToast('Mobile number must be exactly 10 digits!', 'error');
    return;
  }

  const policyData = {
    id: id || ('tn_' + Math.random().toString(36).substr(2, 9)),
    name,
    provider,
    policyNumber,
    category,
    regionZone,
    holderName,
    fatherSpouseName,
    mobile,
    expiryDate,
    premiumAmount,
    paymentFrequency: document.getElementById('paymentFrequency').value,
    reminderDays: parseInt(document.getElementById('reminderDays').value) || 7,
    portalUrl: document.getElementById('portalUrl').value.trim(),
    notes: document.getElementById('notes').value.trim()
  };

  if (id) {
    const idx = policies.findIndex(p => p.id === id);
    if (idx !== -1) policies[idx] = policyData;
    savePolicyToGoogleSheets(policyData, 'update');
    showToast(sheetsConfig.url ? 'Updated & synced to Google Sheet!' : 'Reminder updated successfully!', 'success');
  } else {
    policies.push(policyData);
    savePolicyToGoogleSheets(policyData, 'add');
    showToast(sheetsConfig.url ? 'New reminder added & saved to Google Sheet!' : 'New Tamil Nadu reminder saved!', 'success');
  }

  savePolicies();
  renderAll();
  document.getElementById('policyModal').classList.add('hidden');
});

// Fast "Mark as Paid & Set Next Cycle" Modal
function openRenewModal(id) {
  const p = policies.find(item => item.id === id);
  if (!p) return;

  document.getElementById('renewPolicyId').value = p.id;
  document.getElementById('renewPolicyName').textContent = p.name;
  document.getElementById('renewPolicyDetails').textContent = `${p.provider} • #${p.policyNumber}`;
  document.getElementById('renewCurrentExpiry').textContent = formatDate(p.expiryDate);
  document.getElementById('renewNewPremium').value = p.premiumAmount || '';

  // Auto-select sensible cycle
  if (p.category === 'Electricity (TANGEDCO / EB)') {
    document.getElementById('renewExtension').value = '2-months';
  } else if (p.category.includes('Property Tax') || p.category.includes('Water') || p.category.includes('Professional')) {
    document.getElementById('renewExtension').value = '6-months';
  } else if (p.category.includes('Vehicle') && p.name.includes('PUC')) {
    document.getElementById('renewExtension').value = '6-months';
  } else if (p.category.includes('Insurance') || p.category.includes('Trade License')) {
    document.getElementById('renewExtension').value = '1-year';
  } else {
    document.getElementById('renewExtension').value = '1-month';
  }

  updateRenewalPreviewDate(p.expiryDate);
  document.getElementById('renewModal').classList.remove('hidden');
}

function updateRenewalPreviewDate(baseExpiryStr) {
  const extensionType = document.getElementById('renewExtension').value;
  const customGroup = document.getElementById('customRenewDateGroup');
  
  let baseDate = new Date(baseExpiryStr);
  const now = new Date();
  if (baseDate < now) {
    baseDate = now;
  }

  let newExpiry = new Date(baseDate);

  if (extensionType === '2-months') {
    newExpiry.setMonth(newExpiry.getMonth() + 2);
    customGroup.classList.add('hidden');
  } else if (extensionType === '6-months') {
    newExpiry.setMonth(newExpiry.getMonth() + 6);
    customGroup.classList.add('hidden');
  } else if (extensionType === '1-year') {
    newExpiry.setFullYear(newExpiry.getFullYear() + 1);
    customGroup.classList.add('hidden');
  } else if (extensionType === '1-month') {
    newExpiry.setMonth(newExpiry.getMonth() + 1);
    customGroup.classList.add('hidden');
  } else if (extensionType === 'custom') {
    customGroup.classList.remove('hidden');
    const customVal = document.getElementById('renewCustomDate').value;
    if (customVal) newExpiry = new Date(customVal);
  }

  document.getElementById('renewNewExpiryPreview').textContent = newExpiry.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
  return newExpiry.toISOString().split('T')[0];
}

document.getElementById('renewExtension').addEventListener('change', function() {
  const id = document.getElementById('renewPolicyId').value;
  const p = policies.find(item => item.id === id);
  if (p) updateRenewalPreviewDate(p.expiryDate);
});

document.getElementById('renewCustomDate').addEventListener('change', function() {
  const id = document.getElementById('renewPolicyId').value;
  const p = policies.find(item => item.id === id);
  if (p) updateRenewalPreviewDate(p.expiryDate);
});

document.getElementById('renewForm').addEventListener('submit', function(e) {
  e.preventDefault();
  const id = document.getElementById('renewPolicyId').value;
  const p = policies.find(item => item.id === id);
  if (!p) return;

  const newExpiryDate = updateRenewalPreviewDate(p.expiryDate);
  const updatedPremium = parseFloat(document.getElementById('renewNewPremium').value);

  p.expiryDate = newExpiryDate;
  if (!isNaN(updatedPremium) && updatedPremium > 0) {
    p.premiumAmount = updatedPremium;
  }

  savePolicies();
  savePolicyToGoogleSheets(p, 'update');
  renderAll();
  document.getElementById('renewModal').classList.add('hidden');

  if (typeof confetti === 'function') {
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 }
    });
  }

  showToast(`🎉 Bill paid! Next due date set to ${formatDate(newExpiryDate)}${sheetsConfig.url ? ' & synced to Sheet' : ''}.`, 'success');
});

// ================= Multi-Channel Reminder & Share Outreach =================
let activeSharePolicy = null;

function openShareModal(id) {
  const p = policies.find(item => item.id === id);
  if (!p) return;
  activeSharePolicy = p;

  const days = getDaysRemaining(p.expiryDate);
  const status = getPolicyStatus(p);
  const urgencyPrefix = status === 'urgent' ? '🚨 URGENT: ' : status === 'expired' ? '⛔ OVERDUE: ' : '⚠️ REMINDER: ';
  const meta = getCategoryMeta(p.category);
  const cleanMobile = (p.mobile || '').replace(/[^0-9]/g, '');

  // Populate recipient info chip
  const customerNameEl = document.getElementById('shareCustomerName');
  if (customerNameEl) customerNameEl.textContent = p.holderName || 'Consumer';
  const fatherSpouseEl = document.getElementById('shareFatherSpouse');
  if (fatherSpouseEl) fatherSpouseEl.textContent = p.fatherSpouseName || 'Not Specified';
  const mobileEl = document.getElementById('shareMobileNumber');
  if (mobileEl) {
    mobileEl.textContent = p.mobile ? `+91 ${p.mobile}` : 'Not provided';
  }

  const messageBody = 
`${urgencyPrefix}Tamil Nadu Due Date Notice
------------------------------------------
Citizen / Name: ${p.holderName || 'Citizen'}${p.fatherSpouseName ? '\nFather / Spouse: ' + p.fatherSpouseName : ''}${p.mobile ? '\nMobile: +91 ' + p.mobile : ''}
Service / Bill: ${p.name}
Category: ${p.category}
${meta.fieldLabel}: ${p.policyNumber}
Department / Provider: ${p.provider}${p.regionZone ? '\nRegion / Zone: ' + p.regionZone : ''}
Payment Due Date: ${formatDate(p.expiryDate)} (${days < 0 ? 'Overdue by ' + Math.abs(days) + ' days' : days === 0 ? 'Due Today!' : 'Due in ' + days + ' days'})
Amount Due: ${formatCurrency(p.premiumAmount)}

${p.portalUrl ? 'Official Pay Online Portal: ' + p.portalUrl + '\n' : ''}Please pay before the due date to avoid service disconnection, penalty, or late fees.`;

  document.getElementById('shareMessagePreview').value = messageBody;

  const payBtn = document.getElementById('btnDirectPayPortal');
  if (p.portalUrl) {
    payBtn.href = p.portalUrl;
    payBtn.classList.remove('hidden');
  } else {
    payBtn.classList.add('hidden');
  }

  // Format WhatsApp URL directly to citizen mobile if available
  let waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(messageBody)}`;
  if (cleanMobile.length >= 10) {
    const formattedPhone = cleanMobile.startsWith('91') ? cleanMobile : `91${cleanMobile.slice(-10)}`;
    waUrl = `https://api.whatsapp.com/send?phone=${formattedPhone}&text=${encodeURIComponent(messageBody)}`;
  }
  document.getElementById('btnWhatsAppShare').href = waUrl;

  const mailSubject = encodeURIComponent(`Due Date Alert: ${p.name} (${meta.fieldLabel}: ${p.policyNumber})`);
  const mailBody = encodeURIComponent(messageBody);
  document.getElementById('btnEmailShare').href = `mailto:?subject=${mailSubject}&body=${mailBody}`;

  document.getElementById('shareModal').classList.remove('hidden');
}

// Download .ICS Calendar Event for a Policy
function generateICS(p) {
  const exp = new Date(p.expiryDate);
  const startYear = exp.getFullYear();
  const startMonth = String(exp.getMonth() + 1).padStart(2, '0');
  const startDay = String(exp.getDate()).padStart(2, '0');
  
  const dateStr = `${startYear}${startMonth}${startDay}`;
  const uid = `${p.id}@tnsevaguard.app`;
  const summary = `Due Date: ${p.name} (${p.provider})`;
  const description = `Account/Consumer: ${p.policyNumber}\\nHolder: ${p.holderName}\\nAmount: ${formatCurrency(p.premiumAmount)}\\nPay Online: ${p.portalUrl || 'N/A'}`;

  return `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//TNSevaGuard//Tamil Nadu Due Reminders//EN
CALSCALE:GREGORIAN
METHOD:PUBLISH
BEGIN:VEVENT
UID:${uid}
DTSTAMP:${dateStr}T090000Z
DTSTART;VALUE=DATE:${dateStr}
SUMMARY:${summary}
DESCRIPTION:${description}
STATUS:CONFIRMED
BEGIN:VALARM
TRIGGER:-P7D
DESCRIPTION:Reminder: Bill due in 7 days
ACTION:DISPLAY
END:VALARM
BEGIN:VALARM
TRIGGER:-P1D
DESCRIPTION:Reminder: Bill due tomorrow
ACTION:DISPLAY
END:VALARM
END:VEVENT
END:VCALENDAR`;
}

function downloadFile(content, fileName, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

document.getElementById('btnDownloadSingleICS').addEventListener('click', function() {
  if (!activeSharePolicy) return;
  const ics = generateICS(activeSharePolicy);
  downloadFile(ics, `${activeSharePolicy.policyNumber}_Due_Reminder.ics`, 'text/calendar;charset=utf-8');
  showToast('Calendar event file (.ics) downloaded!', 'success');
});

document.getElementById('btnCopyReminderText').addEventListener('click', function() {
  const text = document.getElementById('shareMessagePreview').value;
  navigator.clipboard.writeText(text).then(() => {
    showToast('Reminder message copied to clipboard!', 'info');
  });
});

// Sync All Expiries to Calendar
document.getElementById('btnExportAllICS').addEventListener('click', function() {
  if (policies.length === 0) {
    showToast('No dues to export to calendar', 'warning');
    return;
  }

  let icsEvents = policies.map(p => {
    const exp = new Date(p.expiryDate);
    const dateStr = `${exp.getFullYear()}${String(exp.getMonth() + 1).padStart(2, '0')}${String(exp.getDate()).padStart(2, '0')}`;
    return `BEGIN:VEVENT
UID:${p.id}@tnsevaguard.app
DTSTAMP:${dateStr}T090000Z
DTSTART;VALUE=DATE:${dateStr}
SUMMARY:Due Date: ${p.name}
DESCRIPTION:Consumer: #${p.policyNumber} | Dept: ${p.provider} | Amount: ${formatCurrency(p.premiumAmount)} | Pay: ${p.portalUrl || ''}
STATUS:CONFIRMED
BEGIN:VALARM
TRIGGER:-P7D
DESCRIPTION:Reminder: ${p.name} due in 7 days
ACTION:DISPLAY
END:VALARM
END:VEVENT`;
  }).join('\n');

  const fullICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//TNSevaGuard//All Dues//EN
CALSCALE:GREGORIAN
${icsEvents}
END:VCALENDAR`;

  downloadFile(fullICS, 'Tamil_Nadu_All_Dues.ics', 'text/calendar;charset=utf-8');
  showToast('All due dates exported to Calendar (.ics)!', 'success');
});

// ================= Data Backup & Restore (JSON / CSV) =================

document.getElementById('btnExportJSON').addEventListener('click', function() {
  const jsonStr = JSON.stringify(policies, null, 2);
  downloadFile(jsonStr, `TN_SevaGuard_Backup_${new Date().toISOString().split('T')[0]}.json`, 'application/json');
  showToast('Database exported as JSON backup', 'success');
});

document.getElementById('btnExportCSV').addEventListener('click', function() {
  if (policies.length === 0) {
    showToast('No records to export', 'warning');
    return;
  }

  const headers = ['Consumer Name', 'Father / Spouse Name', 'Mobile Number', 'Category', 'Service Field Name', 'Account / Reg No', 'Service Name', 'Provider / Dept', 'Region / Zone', 'Due Date', 'Amount (INR)', 'Billing Cycle', 'Reminder Days', 'Portal URL', 'Notes'];
  
  const rows = policies.map(p => {
    const meta = getCategoryMeta(p.category);
    return [
      `"${(p.holderName || '').replace(/"/g, '""')}"`,
      `"${(p.fatherSpouseName || '').replace(/"/g, '""')}"`,
      `"${(p.mobile || '').replace(/"/g, '""')}"`,
      `"${(p.category || '').replace(/"/g, '""')}"`,
      `"${meta.fieldLabel}"`,
      `"${(p.policyNumber || '').replace(/"/g, '""')}"`,
      `"${(p.name || '').replace(/"/g, '""')}"`,
      `"${(p.provider || '').replace(/"/g, '""')}"`,
      `"${(p.regionZone || '').replace(/"/g, '""')}"`,
      `"${p.expiryDate || ''}"`,
      p.premiumAmount || 0,
      `"${p.paymentFrequency || ''}"`,
      p.reminderDays || 7,
      `"${(p.portalUrl || '').replace(/"/g, '""')}"`,
      `"${(p.notes || '').replace(/"/g, '""')}"`
    ].join(',');
  });

  const csvContent = [headers.join(','), ...rows].join('\n');
  downloadFile(csvContent, `TN_SevaGuard_Dues_${new Date().toISOString().split('T')[0]}.csv`, 'text/csv;charset=utf-8');
  showToast('Dues exported as CSV spreadsheet', 'success');
});

document.getElementById('importFileInput').addEventListener('change', function(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(event) {
    try {
      if (file.name.endsWith('.json')) {
        const imported = JSON.parse(event.target.result);
        if (Array.isArray(imported)) {
          policies = imported;
          savePolicies();
          renderAll();
          showToast(`Successfully imported ${imported.length} dues!`, 'success');
          document.getElementById('dataModal').classList.add('hidden');
        } else {
          throw new Error('Invalid JSON structure');
        }
      } else {
        showToast('Please upload a valid JSON backup file.', 'warning');
      }
    } catch (err) {
      showToast('Error importing file. Invalid format.', 'error');
    }
  };
  reader.readAsText(file);
});

document.getElementById('btnClearAllData').addEventListener('click', function() {
  if (confirm('Are you sure you want to delete all saved dues and bills? This cannot be undone.')) {
    policies = [];
    savePolicies();
    renderAll();
    showToast('All reminder records cleared.', 'info');
    document.getElementById('dataModal').classList.add('hidden');
  }
});

// ================= Web Notifications API =================
document.getElementById('btnReqWebNotif').addEventListener('click', function() {
  if (!('Notification' in window)) {
    showToast('This browser does not support desktop notifications', 'warning');
    return;
  }

  Notification.requestPermission().then(permission => {
    if (permission === 'granted') {
      showToast('Browser notifications enabled!', 'success');
      const urgent = policies.filter(p => getPolicyStatus(p) === 'urgent');
      new Notification('TN SevaGuard Reminder Active', {
        body: urgent.length > 0 
          ? `You have ${urgent.length} Tamil Nadu bills/dues expiring in under 7 days!` 
          : 'TN SevaGuard is active and monitoring all due dates.',
        icon: 'https://cdn-icons-png.flaticon.com/512/3652/3652191.png'
      });
    } else {
      showToast('Notifications permission was denied or dismissed', 'info');
    }
  });
});

// ================= UI Event Listeners & Modals =================

document.getElementById('btnOpenAddModal').addEventListener('click', openAddModal);
document.getElementById('btnEmptyAdd').addEventListener('click', openAddModal);
document.getElementById('btnCloseModal').addEventListener('click', () => document.getElementById('policyModal').classList.add('hidden'));
document.getElementById('btnCancelModal').addEventListener('click', () => document.getElementById('policyModal').classList.add('hidden'));

document.getElementById('btnCloseRenewModal').addEventListener('click', () => document.getElementById('renewModal').classList.add('hidden'));
document.getElementById('btnCancelRenew').addEventListener('click', () => document.getElementById('renewModal').classList.add('hidden'));

document.getElementById('btnCloseShareModal').addEventListener('click', () => document.getElementById('shareModal').classList.add('hidden'));

document.getElementById('btnDataCenter').addEventListener('click', (e) => {
  e.stopPropagation();
  document.querySelectorAll('.modal-backdrop').forEach(m => m.classList.add('hidden'));
  document.getElementById('dataModal').classList.remove('hidden');
});
document.getElementById('btnCloseDataModal').addEventListener('click', () => document.getElementById('dataModal').classList.add('hidden'));

// Clear All Records Button (Clean Slate)
const btnClearScreen = document.getElementById('btnClearScreenData');
if (btnClearScreen) {
  btnClearScreen.addEventListener('click', function() {
    if (confirm('Clear all dues from your screen and start completely clean?')) {
      policies = [];
      savePolicies();
      renderAll();
      showToast('All records cleared! You have a clean slate (0 dues).', 'info');
    }
  });
}

// Notification Flyout
document.getElementById('btnNotifications').addEventListener('click', (e) => {
  e.stopPropagation();
  document.getElementById('notifFlyout').classList.toggle('hidden');
});
document.getElementById('btnCloseNotifFlyout').addEventListener('click', () => {
  document.getElementById('notifFlyout').classList.add('hidden');
});
document.addEventListener('click', (e) => {
  const flyout = document.getElementById('notifFlyout');
  const btn = document.getElementById('btnNotifications');
  if (!flyout.contains(e.target) && !btn.contains(e.target)) {
    flyout.classList.add('hidden');
  }
});

// Alert banner button
document.getElementById('btnViewUrgent').addEventListener('click', () => {
  setFilterStatus('expiring-urgent');
  window.scrollTo({ top: 380, behavior: 'smooth' });
});
document.getElementById('btnCloseAlertBanner').addEventListener('click', () => {
  document.getElementById('alertBanner').classList.add('hidden');
});

// Analytics Collapsible
document.getElementById('analyticsHeader').addEventListener('click', () => {
  document.querySelector('.analytics-section').classList.toggle('collapsed');
});

// Search & Filters
document.getElementById('searchInput').addEventListener('input', (e) => {
  currentFilter.searchQuery = e.target.value;
  currentPage = 1;
  const btnClear = document.getElementById('btnClearSearch');
  if (e.target.value) {
    btnClear.classList.remove('hidden');
  } else {
    btnClear.classList.add('hidden');
  }
  renderAll();
});

document.getElementById('btnClearSearch').addEventListener('click', () => {
  document.getElementById('searchInput').value = '';
  document.getElementById('btnClearSearch').classList.add('hidden');
  currentFilter.searchQuery = '';
  currentPage = 1;
  renderAll();
});

document.getElementById('filterStatus').addEventListener('change', (e) => {
  currentPage = 1;
  setFilterStatus(e.target.value);
});

document.getElementById('filterCategory').addEventListener('change', (e) => {
  currentFilter.category = e.target.value;
  currentPage = 1;
  renderAll();
});

document.getElementById('sortBy').addEventListener('change', (e) => {
  currentFilter.sortBy = e.target.value;
  currentPage = 1;
  renderAll();
});

// Quick Pills
function setFilterStatus(status) {
  currentFilter.status = status;
  currentPage = 1;
  document.getElementById('filterStatus').value = status;
  
  document.querySelectorAll('.pill-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.status === status);
  });
  renderAll();
}

document.querySelectorAll('.pill-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    setFilterStatus(btn.dataset.status);
  });
});

// KPI Cards as filter shortcuts
document.querySelectorAll('.kpi-card[data-filter]').forEach(card => {
  card.addEventListener('click', () => {
    setFilterStatus(card.dataset.filter);
  });
});

// View Switcher (Grid / Table / Calendar)
document.querySelectorAll('.view-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentView = btn.dataset.view;
    renderAll();
  });
});

// Theme Toggle
const themeBtn = document.getElementById('btnThemeToggle');
function initTheme() {
  const saved = localStorage.getItem(THEME_KEY) || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  updateThemeIcon(saved);
}

function updateThemeIcon(theme) {
  themeBtn.innerHTML = theme === 'dark' ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
}

themeBtn.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const target = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', target);
  localStorage.setItem(THEME_KEY, target);
  updateThemeIcon(target);
  renderCharts();
});

// Toast notification helper
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  let icon = 'fa-circle-info';
  if (type === 'success') icon = 'fa-circle-check text-emerald';
  if (type === 'error') icon = 'fa-circle-exclamation text-red';
  if (type === 'warning') icon = 'fa-triangle-exclamation text-amber';

  toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Live date calculations in form
document.getElementById('expiryDate').addEventListener('change', function(e) {
  const days = getDaysRemaining(e.target.value);
  const hint = document.getElementById('expiryDaysHint');
  if (days < 0) {
    hint.innerHTML = `<span class="text-red font-semibold">Overdue by ${Math.abs(days)} days! Penalty / late fees may apply.</span>`;
  } else if (days === 0) {
    hint.innerHTML = `<span class="text-red font-semibold">Due Today!</span>`;
  } else if (days <= 7) {
    hint.innerHTML = `<span class="text-red font-semibold">🔥 Urgent: Due in ${days} days!</span>`;
  } else if (days <= 30) {
    hint.innerHTML = `<span class="text-amber font-semibold">⚠️ Warning: Due in ${days} days</span>`;
  } else {
    hint.innerHTML = `<span class="text-emerald">Safe: Due in ${days} days</span>`;
  }
});

// Auto-adjust dynamic fields and department defaults when category changes
document.getElementById('category').addEventListener('change', function(e) {
  const cat = e.target.value;
  updateServiceCategoryFields(cat);
  
  const prov = document.getElementById('provider');
  const freq = document.getElementById('paymentFrequency');
  const portal = document.getElementById('portalUrl');
  const meta = getCategoryMeta(cat);

  if (meta.defaultProvider) {
    prov.value = meta.defaultProvider;
  }
  if (meta.defaultPortal) {
    portal.value = meta.defaultPortal;
  }

  if (cat === 'Electricity (TANGEDCO / EB)') {
    freq.value = 'Bi-Monthly (2 Months - EB Bill)';
  } else if (cat === 'Property Tax (GCC / Municipality)' || cat === 'Water & Sewerage (CMWSSB)' || cat === 'Professional & Trade Tax') {
    freq.value = 'Half-Yearly (Property/Water/PT)';
  } else if (cat === 'Employment Exchange Renewal' || cat === 'Vehicle & RTO (PUC / FC / DL)' || cat === 'Driving Licence (DL Renewal)' || cat === 'Passport Renewal' || cat === 'Insurance (Health / Auto / Life)') {
    freq.value = 'Annual (Yearly)';
  } else if (cat === 'Landline & Broadband' || cat === 'LPG & Piped Gas') {
    freq.value = 'Monthly';
  } else {
    freq.value = 'One-Time / As Needed';
  }
});

// Strict Real-Time Length & Character Type Enforcers (No more characters can be added)
const policyNumberInput = document.getElementById('policyNumber');
if (policyNumberInput) {
  policyNumberInput.addEventListener('input', function() {
    const cat = document.getElementById('category').value;
    const meta = getCategoryMeta(cat);
    let val = this.value;

    // Digits only for numeric categories (EB No, Landline, LPG)
    if (meta.isNumeric) {
      val = val.replace(/[^0-9]/g, '');
    }

    // Auto-uppercase alphanumeric records (Vehicles, DL, Employment, Passport)
    if (cat === 'Vehicle & RTO (PUC / FC / DL)' || 
        cat === 'Employment Exchange Renewal' || 
        cat === 'Driving Licence (DL Renewal)' || 
        cat === 'Passport Renewal') {
      val = val.toUpperCase();
    }

    // Hard clamp to maximum length - no more characters can be added
    if (meta.maxLength && val.length > meta.maxLength) {
      val = val.slice(0, meta.maxLength);
    }

    this.value = val;
    updatePolicyNumberHint();
  });
}

// Strict Real-Time Mobile Input Enforcement (Max 10 digits, digits only)
const mobileInput = document.getElementById('mobile');
if (mobileInput) {
  mobileInput.maxLength = 10;
  mobileInput.addEventListener('input', function() {
    this.value = this.value.replace(/[^0-9]/g, '').slice(0, 10);
    updateMobileHint();
  });
}

// ================= Google Sheets Event Listeners =================
document.getElementById('btnGoogleSheets').addEventListener('click', (e) => {
  e.stopPropagation();
  updateSheetsUI();
  document.querySelectorAll('.modal-backdrop').forEach(m => m.classList.add('hidden'));
  document.getElementById('googleSheetsModal').classList.remove('hidden');
});

document.getElementById('btnCloseSheetsModal').addEventListener('click', () => {
  document.getElementById('googleSheetsModal').classList.add('hidden');
});

document.getElementById('btnSyncGoogleSheets').addEventListener('click', () => {
  syncFromGoogleSheets(false);
});

document.getElementById('btnModalSyncNow').addEventListener('click', () => {
  syncFromGoogleSheets(false);
});



document.getElementById('btnConnectGoogleSheet').addEventListener('click', async () => {
  const input = document.getElementById('inputGoogleSheetsUrl');
  const url = input.value.trim();
  if (!url) {
    showToast('Please enter your Google Apps Script Web App URL', 'warning');
    return;
  }
  if (!url.startsWith('https://script.google.com/')) {
    showToast('URL must start with https://script.google.com/macros/s/...', 'warning');
    return;
  }

  sheetsConfig.url = url;
  sheetsConfig.autoSync = document.getElementById('chkAutoSyncSheets').checked;
  saveSheetsConfig();
  updateSheetsUI();
  await syncFromGoogleSheets(false);
});

document.getElementById('btnDisconnectSheet').addEventListener('click', () => {
  if (confirm('Disconnect from Google Sheet and switch back to Local Storage?')) {
    sheetsConfig.url = '';
    saveSheetsConfig();
    updateSheetsUI();
    showToast('Disconnected from Google Sheet. Using local storage.', 'info');
  }
});

document.getElementById('chkAutoSyncSheets').addEventListener('change', (e) => {
  sheetsConfig.autoSync = e.target.checked;
  saveSheetsConfig();
});

document.getElementById('btnToggleSheetGuide').addEventListener('click', () => {
  const content = document.getElementById('sheetGuideContent');
  const chevron = document.getElementById('sheetGuideChevron');
  content.classList.toggle('hidden');
  if (content.classList.contains('hidden')) {
    chevron.classList.remove('fa-chevron-up');
    chevron.classList.add('fa-chevron-down');
  } else {
    chevron.classList.remove('fa-chevron-down');
    chevron.classList.add('fa-chevron-up');
  }
});

// Apps Script Code Template for Download & Copy
const GOOGLE_APPS_SCRIPT_CODE = `/**
 * TN SevaGuard - Google Apps Script Backend for Google Sheets
 * 1. Open Google Sheet > Extensions > Apps Script
 * 2. Paste this code > Save
 * 3. Deploy > New deployment > Web app (Execute as: Me, Who has access: Anyone)
 * 4. Copy Web App URL into TN SevaGuard
 */

const SHEET_NAME = 'Sheet1';

const EXPECTED_HEADERS = [
  'id', 'name', 'category', 'provider', 'policyNumber',
  'regionZone', 'holderName', 'fatherSpouseName', 'mobile', 'expiryDate', 'premiumAmount',
  'paymentFrequency', 'reminderDays', 'portalUrl', 'notes', 'lastUpdated'
];

function doGet(e) {
  try {
    const sheet = getOrCreateSheet();
    const rows = sheet.getDataRange().getValues();
    if (rows.length <= 1) return createJsonResponse({ success: true, count: 0, data: [] });

    const headers = rows[0].map(h => String(h).trim());
    const data = [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row[0] && !row[1] && !row[4]) continue;

      const item = {};
      headers.forEach((h, colIdx) => {
        let val = row[colIdx];
        if (val instanceof Date) {
          val = Utilities.formatDate(val, Session.getScriptTimeZone() || 'Asia/Kolkata', 'yyyy-MM-dd');
        }
        item[h] = val;
      });

      if (item.premiumAmount) {
        item.premiumAmount = parseFloat(String(item.premiumAmount).replace(/[^0-9.]/g, '')) || 0;
      }
      if (item.reminderDays) {
        item.reminderDays = parseInt(item.reminderDays, 10) || 7;
      }
      data.push(item);
    }

    return createJsonResponse({ success: true, count: data.length, data: data });
  } catch (err) {
    return createJsonResponse({ success: false, error: err.toString() });
  }
}

function doPost(e) {
  try {
    const sheet = getOrCreateSheet();
    const payload = JSON.parse(e.postData.contents);
    const action = payload.action || 'add';

    if (action === 'add') {
      const item = payload.data;
      if (!item) throw new Error('No data provided');
      const id = item.id || ('tn_' + Utilities.getUuid().substring(0, 8));
      const newRow = [
        id, item.name || '', item.category || '', item.provider || '',
        item.policyNumber || '', item.regionZone || '', item.holderName || '',
        item.fatherSpouseName || '', item.mobile || '',
        item.expiryDate || '', item.premiumAmount || 0, item.paymentFrequency || '',
        item.reminderDays || 7, item.portalUrl || '', item.notes || '',
        new Date().toISOString()
      ];
      sheet.appendRow(newRow);
      return createJsonResponse({ success: true, message: 'Added to Google Sheet', id: id });
    }

    if (action === 'update') {
      const item = payload.data;
      if (!item || !item.id) throw new Error('Item ID required');
      const rows = sheet.getDataRange().getValues();
      let foundIndex = -1;

      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][0]) === String(item.id) || (item.policyNumber && String(rows[i][4]) === String(item.policyNumber))) {
          foundIndex = i + 1;
          break;
        }
      }

      if (foundIndex === -1) {
        return doPost({ postData: { contents: JSON.stringify({ action: 'add', data: item }) } });
      }

      const updatedRow = [
        item.id, item.name || '', item.category || '', item.provider || '',
        item.policyNumber || '', item.regionZone || '', item.holderName || '',
        item.fatherSpouseName || '', item.mobile || '',
        item.expiryDate || '', item.premiumAmount || 0, item.paymentFrequency || '',
        item.reminderDays || 7, item.portalUrl || '', item.notes || '',
        new Date().toISOString()
      ];
      sheet.getRange(foundIndex, 1, 1, updatedRow.length).setValues([updatedRow]);
      return createJsonResponse({ success: true, message: 'Updated in Google Sheet' });
    }

    if (action === 'delete') {
      const id = payload.id;
      if (!id) throw new Error('Item ID required');
      const rows = sheet.getDataRange().getValues();
      let foundIndex = -1;

      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][0]) === String(id)) {
          foundIndex = i + 1;
          break;
        }
      }

      if (foundIndex !== -1) {
        sheet.deleteRow(foundIndex);
        return createJsonResponse({ success: true, message: 'Deleted from Google Sheet' });
      }
      return createJsonResponse({ success: false, message: 'Item not found in Sheet' });
    }

    return createJsonResponse({ success: false, error: 'Unsupported action' });
  } catch (err) {
    return createJsonResponse({ success: false, error: err.toString() });
  }
}

function getOrCreateSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0];
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(EXPECTED_HEADERS);
    sheet.getRange(1, 1, 1, EXPECTED_HEADERS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
`;

document.getElementById('btnDownloadAppsScript').addEventListener('click', () => {
  downloadFile(GOOGLE_APPS_SCRIPT_CODE, 'google_apps_script.js', 'text/javascript;charset=utf-8');
  showToast('Apps Script file (google_apps_script.js) downloaded!', 'success');
});

document.getElementById('btnCopyAppsScript').addEventListener('click', () => {
  navigator.clipboard.writeText(GOOGLE_APPS_SCRIPT_CODE).then(() => {
    showToast('Apps Script code copied to clipboard!', 'success');
  }).catch(() => {
    showToast('Could not copy automatically. Please download the file.', 'warning');
  });
});

document.getElementById('btnDownloadSampleCSV').addEventListener('click', () => {
  const csvHeaders = 'id,name,category,provider,policyNumber,regionZone,holderName,fatherSpouseName,mobile,expiryDate,premiumAmount,paymentFrequency,reminderDays,portalUrl,notes,lastUpdated\n' +
    'tn_eb_001,Home TANGEDCO Electricity (EB Bill),Electricity (TANGEDCO / EB),TANGEDCO (Tamil Nadu Electricity Board),03205002103,Tiruppur,Abdulrahim,Fathimabeevi,7904623327,2026-10-15,1680,Bi-Monthly (2 Months - EB Bill),7,https://www.tnebltd.gov.in/BillStatus/Login.xhtml,LT-1A Domestic. EB No: 03205002103,2026-09-25T06:00:00.000Z\n' +
    'tn_pt_002,Residential Property Tax (சொத்து வரி),Property Tax (GCC / Municipality),Tiruppur City Municipal Corporation,032/03285/2656,Tiruppur,Abdulrahim,Fathimabeevi,7904623327,2026-10-01,3450,Half-Yearly (Property/Water/PT),15,https://chennaicorporation.gov.in/gcc/online-services/property-tax/,Property Tax # 032/03285/2656,2026-09-25T06:00:00.000Z\n' +
    'tn_wt_003,Water & Drainage Tax (குடிநீர் வரி),Water & Sewerage (CMWSSB),Tiruppur Municipal Water Board,032/03285/2656,Tiruppur,Abdulrahim,Fathimabeevi,7904623327,2026-10-18,850,Half-Yearly (Property/Water/PT),15,https://bnc.chennaimetrowater.in/,Water Tax # 032/03285/2656,2026-09-25T06:00:00.000Z\n' +
    'tn_emp_004,TN Employment Exchange Registration Renewal,Employment Exchange Renewal,TN Dept of Employment & Training,TPD556266262562,Tiruppur,Abdulrahim,Fathimabeevi,7904623327,2026-10-12,0,Annual (Yearly),30,https://tnvelaivaaippu.gov.in/,Employment Reg ID: TPD556266262562,2026-09-25T06:00:00.000Z\n' +
    'tn_veh_005,Vehicle RTO FC & Insurance,Vehicles (RTO / FC / Road Tax),TN Transport Dept / Tiruppur RTO,TN39CF3458,Tiruppur,Abdulrahim,Fathimabeevi,7904623327,2026-10-18,1850,Annual (Yearly),15,https://parivahan.gov.in/,Vehicle Reg: TN39CF3458,2026-09-25T06:00:00.000Z\n' +
    'tn_dl_006,Driving Licence Renewal (DL RENEW),Driving Licence (DL Renewal),TN Transport Dept / Sarathi Parivahan,TN39 20160004912,Tiruppur,Abdulrahim,Fathimabeevi,7904623327,2026-11-15,450,Annual (Yearly),30,https://sarathi.parivahan.gov.in/,DL Renewal for Abdulrahim,2026-09-25T06:00:00.000Z\n' +
    'tn_pass_007,Passport Renewal (PASSPORT RENEW),Passport Renewal,Passport Seva Kendra (PSK TN),MD107849201923,Tiruppur,Abdulrahim,Fathimabeevi,7904623327,2026-11-30,1500,Annual (Yearly),30,https://www.passportindia.gov.in/,Passport Seva Ref: MD107849201923,2026-09-25T06:00:00.000Z\n' +
    'tn_land_008,BSNL Landline & Broadband Bill,Landline & Broadband,BSNL Tamil Nadu (Tiruppur SSA),04214328840,Tiruppur,Abdulrahim,Fathimabeevi,7904623327,2026-09-23,649,Monthly,5,https://portal.bsnl.in/,Landline No: 04214328840,2026-09-25T06:00:00.000Z\n';
  downloadFile(csvHeaders, 'TN_SevaGuard_Google_Sheets_Template.csv', 'text/csv;charset=utf-8');
  showToast('Sample Google Sheets CSV template downloaded!', 'success');
});

// Close Google Sheets Modal on outside click
document.addEventListener('click', (e) => {
  const modal = document.getElementById('googleSheetsModal');
  if (e.target === modal) {
    modal.classList.add('hidden');
  }
});

// ================= Pagination Controls =================
const selPageSize = document.getElementById('selectPageSize');
if (selPageSize) {
  selPageSize.addEventListener('change', function(e) {
    pageSize = parseInt(e.target.value, 10) || 50;
    currentPage = 1;
    renderAll();
  });
}

const btnFirstPage = document.getElementById('btnFirstPage');
if (btnFirstPage) {
  btnFirstPage.addEventListener('click', function() {
    if (currentPage > 1) {
      currentPage = 1;
      renderAll();
      window.scrollTo({ top: 380, behavior: 'smooth' });
    }
  });
}

const btnPrevPage = document.getElementById('btnPrevPage');
if (btnPrevPage) {
  btnPrevPage.addEventListener('click', function() {
    if (currentPage > 1) {
      currentPage--;
      renderAll();
      window.scrollTo({ top: 380, behavior: 'smooth' });
    }
  });
}

const btnNextPage = document.getElementById('btnNextPage');
if (btnNextPage) {
  btnNextPage.addEventListener('click', function() {
    const filtered = getFilteredPolicies();
    const totalPages = Math.ceil(filtered.length / pageSize) || 1;
    if (currentPage < totalPages) {
      currentPage++;
      renderAll();
      window.scrollTo({ top: 380, behavior: 'smooth' });
    }
  });
}

const btnLastPage = document.getElementById('btnLastPage');
if (btnLastPage) {
  btnLastPage.addEventListener('click', function() {
    const filtered = getFilteredPolicies();
    const totalPages = Math.ceil(filtered.length / pageSize) || 1;
    if (currentPage < totalPages) {
      currentPage = totalPages;
      renderAll();
      window.scrollTo({ top: 380, behavior: 'smooth' });
    }
  });
}

const jumpInput = document.getElementById('inputJumpPage');
if (jumpInput) {
  jumpInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      const page = parseInt(this.value, 10);
      const filtered = getFilteredPolicies();
      const totalPages = Math.ceil(filtered.length / pageSize) || 1;
      if (page >= 1 && page <= totalPages && page !== currentPage) {
        currentPage = page;
        renderAll();
        window.scrollTo({ top: 380, behavior: 'smooth' });
      }
    }
  });

  jumpInput.addEventListener('change', function() {
    const page = parseInt(this.value, 10);
    const filtered = getFilteredPolicies();
    const totalPages = Math.ceil(filtered.length / pageSize) || 1;
    if (page >= 1 && page <= totalPages && page !== currentPage) {
      currentPage = page;
      renderAll();
      window.scrollTo({ top: 380, behavior: 'smooth' });
    }
  });
}

// ================= Initialization =================
window.addEventListener('DOMContentLoaded', () => {
  initTheme();
  loadSheetsConfig();
  loadPolicies();
  updateSheetsUI();
  renderAll();

  // Automatic sync from Google Sheets on load if connected
  if (sheetsConfig.url && sheetsConfig.autoSync) {
    syncFromGoogleSheets(true);
  }
});
