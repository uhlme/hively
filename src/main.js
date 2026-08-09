import {
  initStorage,
  getHives,
  getHiveById,
  saveHive,
  deleteHive,
  getInspections,
  saveInspection,
  deleteInspection,
  getFinances,
  saveFinance,
  deleteFinance,
  getHoneyHarvests,
  saveHoneyHarvest,
  deleteHoneyHarvest,
  getApiaries,
  getApiaryById,
  saveApiary,
  deleteApiary,
  getTreatments,
  getActiveTreatmentsForHive,
  saveTreatment,
  deleteTreatment,
  syncLocalToRemote,
  getTasksState,
  saveTaskState,
  processSyncQueue,
  getSyncQueueLength,
  getLastSyncSummary,
  syncNow,
  clearLocalEntityCache,
  clearCloudSessionData,
  hasPendingSyncForOperation,
  hasLocalDomainData
} from './storage.js';
import {
  TREATMENT_PRODUCTS,
  getTreatmentProduct,
  computeHarvestBlockedUntil,
  VARROA_LEVEL_LABELS,
  summarizeChecklist,
  formatChecklistChips,
  getTreatmentProductLabel
} from './healthCatalog.js';
import {
  financeCategoryLabel,
  financeCategorySelectValue,
  financeCategoryStorageValue,
  normalizeFinanceCategoryId
} from './financeCategories.js';
import { supabase } from './supabase.js';
import { startAudioRecording, stopAudioRecording, parseAudioWithGemini } from './voiceAssistant.js';
import { parseReceiptWithGemini } from './receiptScanner.js';
import {
  conditionFromCode,
  fetchCurrentWeather,
  fetchDashboardWeatherAndPollen,
  getCachedLocation,
  LocationPermissionError,
  weatherIconSvg,
  writeWeatherCache
} from './weather.js';
import { getWeatherInsightFromGemini } from './aiHelper.js';
import { saveOfflineMemo, getOfflineMemos, deleteOfflineMemo, blobToBase64, base64ToBlob, clearOfflineAiDatabase } from './offlineAI.js';
import {
  getNetworkPrefs,
  saveNetworkPrefs,
  shouldUseBackgroundNetwork,
  shouldAutoProcessMedia,
  getConnectionType,
  isConstrainedConnection
} from './network.js';
import {
  ensureActiveOperation,
  listMyOperations,
  refreshActiveOperationBilling,
  createOperation,
  updateOperation,
  createInvite,
  buildInviteLink,
  joinWithCode,
  listOperationMembers,
  getActiveOperationMeta,
  getActiveOperationId,
  setActiveOperation,
  isOperationOwner,
  clearActiveOperation,
  getProfileMap,
  previewInvite,
  canEditOperation,
  isOperationViewer,
  roleLabel
} from './operations.js';
import { CALENDAR_TASKS, CALENDAR_MONTH_NAMES } from './calendarTasks.js';
import { escapeHtml, statusToCssClass, withButtonLoading, safeJsonParse, formatHiveActivityLabel } from './utils.js';
import { getProUpsellInsight, isProUpsellInsight } from './radarInsight.js';
import {
  applyHistoryAction,
  buildHistoryState,
  resolveHistoryAction,
  shouldHistoryBackFromNested,
  viewFromHistoryState
} from './navigationHistory.js';
import {
  applyDomI18n,
  formatDate,
  getLocale,
  getLocaleTag,
  initI18n,
  legalUrl,
  onLocaleChange,
  setLocale,
  t
} from './i18n/index.js';
import { getHiveRecommendation } from './hiveRecommendations.js';
import {
  initAnalytics,
  trackPageView,
  trackEvent,
  identifyUser,
  resetAnalyticsUser,
  installGlobalErrorHandlers
} from './analytics.js';
import {
  APP_VERSION,
  prepareBugReport,
  openMailto,
  rememberError
} from './bugReport.js';
import {
  isBillingEnabled,
  hasProAccess,
  getActivePlanMeta,
  startProCheckout,
  openBillingPortal,
  formatLocalizedBillingSummary,
  setupNativeBillingLifecycle,
  consumeNativeBillingLaunchUrl,
  consumeBillingCheckoutPending,
  clearBillingCheckoutPending,
  TRIAL_DAYS
} from './billing.js';

const RADAR_CACHE_KEY = 'hively_radar_cache';
const RADAR_FRESH_MS = 2 * 60 * 60 * 1000;
const RADAR_STALE_OK_MS = 7 * 24 * 60 * 60 * 1000;

function readRadarCache() {
  const raw = localStorage.getItem(RADAR_CACHE_KEY) || sessionStorage.getItem('bienen_radar_cache');
  return safeJsonParse(raw, null);
}

function writeRadarCache(data) {
  try {
    localStorage.setItem(RADAR_CACHE_KEY, JSON.stringify(data));
    sessionStorage.setItem('bienen_radar_cache', JSON.stringify(data));
  } catch (e) {
    console.warn('Radar-Cache konnte nicht gespeichert werden:', e);
  }
  // Keep inspection-weather cache in sync so Durchsicht works offline too
  if (data?.temperature != null) {
    writeWeatherCache({
      temperature: data.temperature,
      conditionText: data.conditionText,
      conditionIcon: data.conditionIcon,
      code: data.code,
      latitude: data.latitude,
      longitude: data.longitude,
      timestamp: data.timestamp || Date.now()
    });
  }
}

async function buildRadarPayload(forceLocation) {
  const weatherData = await fetchDashboardWeatherAndPollen(forceLocation);
  let insight = t('ai.insightDataSaver');
  if (shouldUseBackgroundNetwork() && hasProAccess()) {
    insight = await getWeatherInsightFromGemini(weatherData);
  } else if (shouldUseBackgroundNetwork() && isBillingEnabled() && !hasProAccess()) {
    insight = getProUpsellInsight();
  }
  return {
    ...weatherData,
    insight,
    locale: getLocale(),
    timestamp: Date.now()
  };
}

/**
 * Refresh KI insight when Pro unlocks or the UI locale changed
 * (cached German/French/… text would otherwise stick for RADAR_FRESH_MS).
 */
async function refreshRadarInsightIfNeeded(cached) {
  if (!cached || !shouldUseBackgroundNetwork()) return null;

  const locale = getLocale();
  const localeChanged = cached.locale !== locale;
  const upsell = isProUpsellInsight(cached.insight);
  if (!localeChanged && !upsell) return null;

  try {
    if (hasProAccess() && (upsell || localeChanged)) {
      const insight = await getWeatherInsightFromGemini(cached);
      const next = { ...cached, insight, locale, timestamp: Date.now() };
      writeRadarCache(next);
      return next;
    }

    if (isBillingEnabled() && !hasProAccess() && (upsell || localeChanged)) {
      const next = { ...cached, insight: getProUpsellInsight(), locale };
      writeRadarCache(next);
      return next;
    }
  } catch (err) {
    console.warn('KI-Einschätzung-Aktualisierung fehlgeschlagen:', err);
  }
  return null;
}

// --- State Variables ---
let currentView = 'dashboard';
let activeHiveIdForDetail = null;
let currentFinanceTab = 'expenses'; // 'expenses' or 'honey'
let authMode = 'login'; // 'login' or 'register'

// --- Color Helpers ---
// White (1 or 6), Yellow (2 or 7), Red (3 or 8), Green (4 or 9), Blue (5 or 0)
const QUEEN_COLORS = {
  1: 'white', 6: 'white',
  2: 'yellow', 7: 'yellow',
  3: 'red', 8: 'red',
  4: 'green', 9: 'green',
  5: 'blue', 0: 'blue'
};

function getQueenColorInfo(year) {
  const lastDigit = year ? year.toString().slice(-1) : '';
  const color = QUEEN_COLORS[lastDigit] || 'white';
  const colorKey = `hives.queenColors.${color}`;
  return {
    color,
    className: `queen-${color}`,
    name: t(colorKey)
  };
}

function canEditActiveOp() {
  // E2E-only seam: simulate Betrachter without a live Supabase session
  if (typeof window !== 'undefined' && window.__HIVELY_E2E_FORCE_VIEWER__) return false;
  return !supabase || !getActiveOperationId() || canEditOperation();
}

function isOwnerActiveOp() {
  return !supabase || !getActiveOperationId() || isOperationOwner();
}

function readInspectionChecklistFromForm() {
  const queenSeen = document.getElementById('insp-queen-seen')?.value || '';
  const strength = document.getElementById('insp-strength')?.value || '';
  const varroaLevel = document.getElementById('insp-varroa-level')?.value || '';
  return {
    queenSeen: queenSeen || null,
    eggs: !!document.getElementById('insp-eggs')?.checked,
    openBrood: !!document.getElementById('insp-open-brood')?.checked,
    cappedBrood: !!document.getElementById('insp-capped-brood')?.checked,
    playCups: !!document.getElementById('insp-play-cups')?.checked,
    queenCells: !!document.getElementById('insp-queen-cells')?.checked,
    strength: strength || null,
    varroaLevel: varroaLevel || null
  };
}

function fillInspectionChecklistForm(insp) {
  const c = insp?.checklist || {};
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val ?? '';
  };
  const setChk = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.checked = !!val;
  };
  setVal('insp-queen-seen', c.queenSeen || '');
  setChk('insp-eggs', c.eggs);
  setChk('insp-open-brood', c.openBrood);
  setChk('insp-capped-brood', c.cappedBrood);
  setChk('insp-play-cups', c.playCups);
  setChk('insp-queen-cells', c.queenCells);
  setVal('insp-strength', c.strength || '');
  setVal('insp-varroa-level', c.varroaLevel || '');

  // Legacy fields (temperament / feeding / honeySuper) live outside checklist
  setVal('insp-temperament', insp?.temperament != null ? String(insp.temperament) : '5');
  setVal('insp-feeding', insp?.feeding || '');
  setVal('insp-honey-super', insp?.honeySuper || '');
}

async function populateApiarySelect(selectEl, selectedId = null) {
  if (!selectEl) return;
  const apiaries = await getApiaries();
  const opts = [
    `<option value="">${escapeHtml(t('hives.apiaryNone'))}</option>`,
    ...apiaries.map(
      (a) =>
        `<option value="${escapeHtml(a.id)}">${escapeHtml(a.name)}</option>`
    )
  ];
  selectEl.innerHTML = opts.join('');
  if (selectedId) {
    selectEl.value = selectedId;
  }
}

function addDaysToDateStr(dateStr, days) {
  if (!dateStr || days == null || days === '') return '';
  const n = Number(days);
  if (!Number.isFinite(n)) return '';
  const d = new Date(`${dateStr}T12:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}

function updateTreatmentPhiHint() {
  const hint = document.getElementById('treatment-form-phi-hint');
  if (!hint) return;
  const productId = document.getElementById('treatment-form-product')?.value;
  const product = getTreatmentProduct(productId);
  const dateStart = document.getElementById('treatment-form-date-start')?.value;
  const dateEnd = document.getElementById('treatment-form-date-end')?.value;
  if (!product) {
    hint.textContent = '';
    return;
  }
  const blocked = computeHarvestBlockedUntil(dateStart, dateEnd, product.phiDays);
  if (blocked != null) {
    hint.textContent = t('treatments.phiHintFull', { date: formatDateString(blocked), days: product.phiDays });
  } else if (product.phiDays == null) {
    hint.textContent = t('treatments.phiHintNone');
  } else {
    hint.textContent = t('treatments.phiHint', { label: `${getTreatmentProductLabel(product.id)} (PHI ${product.phiDays})` });
  }
}

/** Match spoken/OCR hive names to hive records (`alle` = all). */
function matchHivesByNames(hives, hiveNames) {
  if (!Array.isArray(hiveNames) || hiveNames.length === 0) return [];
  if (hiveNames.includes('alle')) return [...hives];

  const matched = [];
  for (const rawName of hiveNames) {
    const needle = String(rawName).toLowerCase();
    const hive = hives.find(
      (h) =>
        h.name.toLowerCase().includes(needle) || needle.includes(h.name.toLowerCase())
    );
    if (hive) matched.push(hive);
  }
  return matched;
}

function setFinanceTab(tab) {
  currentFinanceTab = tab;
  const tabs = {
    expenses: document.getElementById('tab-fin-expenses'),
    honey: document.getElementById('tab-fin-honey'),
    sponsorships: document.getElementById('tab-fin-sponsorships')
  };
  for (const [key, el] of Object.entries(tabs)) {
    if (!el) continue;
    if (key === tab) el.classList.add('active');
    else el.classList.remove('active');
  }
}

function formatDateString(isoString) {
  return formatDate(isoString);
}

// --- Viewport Height (Safari + PWA safe) ---
const IS_STANDALONE = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

// env(safe-area-inset-bottom) is unreliable on this iOS PWA (returns 0 or 34
// non-deterministically). screen.height - innerHeight is stable, so use that and
// cache the max so a flaky 0 read never shrinks the clearance back.
let cachedBottomInset = 0;
function setAppHeight() {
  const app = document.getElementById('app');
  if (!app) return;
  if (IS_STANDALONE) {
    // PWA: cover the FULL screen so the nav background reaches the very bottom
    // (no black gap). Reserve the device's real bottom inset as nav padding so the
    // labels sit above the home-indicator cut line.
    app.style.height = '100vh';
    const inset = Math.max(0, Math.round(screen.height - window.innerHeight));
    // Safe area bottom inset + status bar is never larger than 120px. Any value larger is the keyboard.
    const isKeyboardOpen = document.activeElement && (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName) || document.activeElement.isContentEditable);
    if (inset > cachedBottomInset && inset < 120 && !isKeyboardOpen) {
      cachedBottomInset = inset;
    }
    // +12px breathing room so the labels aren't flush against the home-indicator edge.
    document.documentElement.style.setProperty('--sab', (cachedBottomInset + 12) + 'px');
  } else {
    // Safari: no home indicator; track the dynamic URL bar via the visual viewport.
    document.documentElement.style.setProperty('--sab', '0px');
    app.style.height = (window.visualViewport ? window.visualViewport.height : window.innerHeight) + 'px';
  }
}

// On PWA cold start the visual viewport isn't settled at DOMContentLoaded (same root
// cause that breaks 100dvh). Re-run after the viewport has had a chance to settle.
function bindAppHeight() {
  setAppHeight();
  requestAnimationFrame(setAppHeight);
  [50, 150, 300, 600].forEach(ms => setTimeout(setAppHeight, ms));
  window.addEventListener('load', setAppHeight);
  window.addEventListener('pageshow', setAppHeight);
  window.addEventListener('resize', setAppHeight);
  window.addEventListener('orientationchange', () => setTimeout(setAppHeight, 100));
  if (window.visualViewport) window.visualViewport.addEventListener('resize', setAppHeight);
}

// --- App Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
  initI18n();
  try {
    await initStorage();
  } catch (err) {
    console.error('Storage-Initialisierung fehlgeschlagen:', err);
  }
  initAnalytics();
  installGlobalErrorHandlers({ onError: rememberError });
  const versionLabel = document.getElementById('app-version-label');
  if (versionLabel) versionLabel.textContent = t('common.version', { version: APP_VERSION });
  setupLocaleControls();
  setupRouting();
  setupModals();
  setupForms();
  setupSettings();
  setupBugReport();
  setupBilling();
  setupOperationsUI();
  setupAuth();
  setupVoiceAssistant();
  setupReceiptScanner();
  setupConnectionTracking();
  onLocaleChange(async () => {
    applyDomI18n(document);
    updateLegalLinks();
    if (versionLabel) versionLabel.textContent = t('common.version', { version: APP_VERSION });
    refreshBillingSettingsUI();
    try {
      await navigate(currentView);
    } catch (err) {
      console.warn('Re-render nach Sprachwechsel fehlgeschlagen:', err);
    }
  });
  const nativeBillingHandlers = {
    onBillingReturn: (result) => handleBillingReturn(result, { fromDeepLink: true }),
    onAppResume: () => refreshBillingOnResume(),
    onBrowserFinished: () => handleNativeBrowserFinished()
  };
  setupNativeBillingLifecycle(nativeBillingHandlers).catch((err) =>
    console.warn('Native Billing-Lifecycle fehlgeschlagen:', err)
  );

  // Pin #app to the real visible viewport height. Works in BOTH Safari (tracks the
  // dynamic URL bar) and standalone PWA (full height), unlike 100vh/100dvh which
  // each break in one of the two environments.
  bindAppHeight();

  // Initial render
  const urlParams = new URLSearchParams(window.location.search);
  const viewParam = urlParams.get('view');
  const joinCode = urlParams.get('join');
  if (viewParam && ['dashboard', 'hives', 'hive-detail', 'finances', 'settings', 'calendar'].includes(viewParam)) {
    currentView = viewParam;
  }

  // If already logged in, bootstrap active Betrieb before first render
  if (supabase) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        identifyUser(session.user);
        // Same migrate-before-clear path as onAuthStateChange (never wipe first).
        await prepareSessionWorkspace(session, { joinCode });
      } else if (joinCode) {
        // Remember invite until after login / registration
        sessionStorage.setItem('hively_pending_join', joinCode);
        await promptLoginForInvite(joinCode);
      }
    } catch (err) {
      console.warn('Betrieb-Bootstrap fehlgeschlagen:', err);
    }
  }

  await navigate(currentView);
  updateOperationChrome();
  applyRoleBasedUI();
  refreshBillingSettingsUI();

  // Cold-start deep link (after bootstrap — appUrlOpen alone misses launch-by-URL)
  let handledNativeLaunchBilling = false;
  try {
    const launchParsed = await consumeNativeBillingLaunchUrl(nativeBillingHandlers);
    handledNativeLaunchBilling = Boolean(launchParsed?.billing);
  } catch (err) {
    console.warn('Native Launch-URL für Billing fehlgeschlagen:', err);
  }

  const billingParam = urlParams.get('billing');
  if (!handledNativeLaunchBilling && (billingParam === 'success' || billingParam === 'cancel')) {
    await handleBillingReturn(billingParam, { fromDeepLink: false });
  }
});

// --- Routing / View Swapping ---
function setQuickAddLabel(label) {
  const btn = document.getElementById('btn-quick-add');
  if (!btn) return;
  btn.innerText = label;
  btn.setAttribute('aria-label', label);
}

/** Extra main padding only when the FAB is actually visible (not hidden / not viewer). */
function syncFabLayout() {
  const btn = document.getElementById('btn-quick-add');
  const visible =
    Boolean(btn) &&
    !btn.classList.contains('hidden') &&
    !btn.classList.contains('is-readonly-hidden');
  document.body.classList.toggle('has-fab', visible);
}

function setupRouting() {
  const navItems = document.querySelectorAll('nav.bottom-nav .nav-item');
  navItems.forEach(item => {
    item.addEventListener('click', async () => {
      const view = item.getAttribute('data-view');
      await navigate(view);
    });
  });

  // Top header quick-add button
  document.getElementById('btn-quick-add').addEventListener('click', () => {
    if (currentView === 'hives') {
      openHiveModal();
    } else if (currentView === 'finances') {
      if (currentFinanceTab === 'expenses') {
        openFinanceModal();
      } else if (currentFinanceTab === 'honey') {
        openHoneyModal();
      } else if (currentFinanceTab === 'sponsorships') {
        openSponsorshipModal();
      }
    } else {
      openHiveModal();
    }
  });

  // Settings header button
  document.getElementById('btn-settings-header').addEventListener('click', async () => {
    await navigate('settings');
  });

  // Back button on detail view — prefer browser/Android history so Back returns
  // to the screen we came from (dashboard for viewers, Kästen otherwise).
  document.getElementById('btn-back-to-hives').addEventListener('click', async () => {
    if (shouldHistoryBackFromNested(window.history.state)) {
      window.history.back();
      return;
    }
    await navigate('hives', { historyMode: 'replace' });
  });

  window.addEventListener('popstate', async (event) => {
    const openModalEl = document.querySelector('.modal-overlay.active');
    if (openModalEl) {
      closeModal(openModalEl.id);
    }
    const { view, hiveId } = viewFromHistoryState(event.state, 'dashboard');
    if (hiveId) activeHiveIdForDetail = hiveId;
    else if (view !== 'hive-detail') activeHiveIdForDetail = null;
    await navigate(view, { historyMode: 'skip' });
    applyRoleBasedUI();
  });

  // View specific quick actions
  document.getElementById('dash-btn-insp').addEventListener('click', () => {
    openInspectionModal();
  });
  document.getElementById('dash-btn-treatment')?.addEventListener('click', () => {
    openTreatmentModal();
  });
  document.getElementById('dash-btn-honey').addEventListener('click', () => {
    openHoneyModal();
  });
  document.getElementById('btn-new-inspection').addEventListener('click', () => {
    openInspectionModal(null, activeHiveIdForDetail);
  });

  document.getElementById('apiary-filter')?.addEventListener('change', async () => {
    if (currentView === 'hives') await renderHivesView();
  });

  // Dashboard Finance Stat Card Navigation Click
  const statCardFinance = document.getElementById('stat-card-finance');
  if (statCardFinance) {
    statCardFinance.addEventListener('click', async () => {
      await navigate('finances');
    });
  }

  // Finance Tabs Segmented Control
  const tabExpenses = document.getElementById('tab-fin-expenses');
  const tabHoney = document.getElementById('tab-fin-honey');
  const tabSponsorships = document.getElementById('tab-fin-sponsorships');

  tabExpenses.addEventListener('click', async () => {
    setFinanceTab('expenses');
    await renderFinanceView();
  });

  tabHoney.addEventListener('click', async () => {
    setFinanceTab('honey');
    await renderFinanceView();
  });

  tabSponsorships.addEventListener('click', async () => {
    setFinanceTab('sponsorships');
    await renderFinanceView();
  });

  // Finance list buttons
  document.getElementById('btn-add-honey').addEventListener('click', () => {
    openHoneyModal();
  });

  document.getElementById('btn-add-sponsorship').addEventListener('click', () => {
    openSponsorshipModal();
  });
}

let navigateGeneration = 0;

/**
 * @param {string} viewName
 * @param {{ historyMode?: 'auto' | 'push' | 'replace' | 'skip' }} [options]
 */
async function navigate(viewName, options = {}) {
  const { historyMode = 'auto' } = options;
  const fromView = currentView;
  const gen = ++navigateGeneration;
  currentView = viewName;

  // Push/replace History BEFORE async render so Android hardware Back already
  // has a stack entry while hive-detail (or any nested view) is on screen.
  const historyAction = resolveHistoryAction(fromView, viewName, historyMode);
  applyHistoryAction(
    historyAction,
    buildHistoryState(viewName, { hiveId: activeHiveIdForDetail })
  );

  // Toggle active tab in bottom nav
  const navItems = document.querySelectorAll('nav.bottom-nav .nav-item');
  navItems.forEach(item => {
    if (item.getAttribute('data-view') === viewName) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  // Hide all views
  const views = document.querySelectorAll('.view');
  views.forEach(v => v.classList.add('hidden'));

  // Show active view
  const targetView = document.getElementById(`view-${viewName}`);
  if (targetView) {
    targetView.classList.remove('hidden');
  }

  // Floating quick-add sync (Kästen / Finanzen)
  const quickAddBtn = document.getElementById('btn-quick-add');
  if (quickAddBtn) {
    if (viewName === 'hives') {
      quickAddBtn.classList.remove('hidden');
      setQuickAddLabel('+ Volk');
    } else if (viewName === 'finances') {
      quickAddBtn.classList.remove('hidden');
      let label = '+ Paten.';
      if (currentFinanceTab === 'expenses') label = '+ Kauf';
      else if (currentFinanceTab === 'honey') label = '+ Ernte';
      setQuickAddLabel(label);
    } else {
      quickAddBtn.classList.add('hidden');
    }
  }
  syncFabLayout();

  const stillCurrent = () => gen === navigateGeneration;

  // Render content
  if (viewName === 'dashboard') {
    await renderDashboardView();
  } else if (viewName === 'hives') {
    await renderHivesView();
  } else if (viewName === 'hive-detail') {
    await renderHiveDetailView();
  } else if (viewName === 'finances') {
    await renderFinanceView();
  } else if (viewName === 'calendar') {
    await renderCalendarView();
  } else if (viewName === 'settings') {
    refreshNetworkSettingsUI();
    try {
      if (supabase && isBillingEnabled()) {
        await refreshActiveOperationBilling();
      }
    } catch (err) {
      console.warn('Billing-Refresh in Einstellungen fehlgeschlagen:', err);
    }
    if (!stillCurrent()) return;
    refreshOperationSettingsUI();
    await renderApiariesSettings();
  }

  // Stale navigate (rapid tab switches) must not update analytics / finish late
  if (!stillCurrent()) return;
  trackPageView(viewName);
}

// --- Dynamic Rendering ---

async function renderDashboardView() {
  const hives = await getHives();
  const honey = await getHoneyHarvests();
  const finances = await getFinances();

  // Statistics
  document.getElementById('stat-hives-count').innerText = hives.filter(h => h.status !== 'Aufgelöst').length;
  
  const totalHoney = honey.reduce((sum, h) => sum + parseFloat(h.amount || 0), 0);
  document.getElementById('stat-honey-weight').innerHTML = `${totalHoney.toFixed(1)} <span style="font-size: 0.95rem; font-weight: 500; color: var(--text-secondary); margin-left: 2px;">kg</span>`;

  const totalExpenses = finances
    .filter(f => f.type === 'expense' || !f.type) // old data might not have type, fallback to expenses
    .reduce((sum, f) => sum + parseFloat(f.price || 0), 0);
  const totalIncome = finances
    .filter(f => f.type === 'sponsorship' || f.type === 'income')
    .reduce((sum, f) => sum + parseFloat(f.price || 0), 0);
  const balance = totalIncome - totalExpenses;

  const financeSumEl = document.getElementById('stat-finance-sum');
  if (financeSumEl) {
    const amountStr = balance.toFixed(2);
    // Long amounts (e.g. -2097.99) need a smaller type size to stay inside the card
    const amountClass = amountStr.replace('-', '').length >= 7
      ? 'stat-amount stat-amount-sm'
      : 'stat-amount';
    financeSumEl.innerHTML = `<span class="${amountClass}">${escapeHtml(amountStr)}</span><span class="stat-currency">CHF</span>`;
    financeSumEl.classList.toggle('is-positive', balance >= 0);
    financeSumEl.classList.toggle('is-negative', balance < 0);
    financeSumEl.style.color = '';
  }

  // Recent activities list (Inspections & Harvests merged, newest first)
  const inspections = await getInspections();
  const activities = [];

  inspections.forEach(i => {
    const hive = hives.find(h => h.id === i.hiveId);
    activities.push({
      date: i.date || i.createdAt,
      type: 'inspection',
      hiveName: formatHiveActivityLabel(hive),
      details: i.notes || 'Durchsicht protokolliert.',
      tag: 'Durchsicht',
      raw: i
    });
  });

  honey.forEach(h => {
    const hive = hives.find(hive => hive.id === h.hiveId);
    activities.push({
      date: h.date || h.createdAt,
      type: 'honey',
      hiveName: formatHiveActivityLabel(hive),
      details: `${h.amount} kg geerntet (${h.type || 'Blüte'})`,
      tag: 'Honigernte',
      raw: h
    });
  });

  // Sort activities by date desc
  activities.sort((a, b) => new Date(b.date) - new Date(a.date));

  const recentList = document.getElementById('dashboard-recent-activities');
  if (activities.length === 0) {
    recentList.innerHTML = `<p class="text-muted text-center" style="padding: 20px;">${escapeHtml(t('dashboard.noActivities'))}</p>`;
  } else {
    recentList.innerHTML = activities.slice(0, 5).map((act, index) => `
      <div class="card recent-activity-card" data-index="${index}" style="padding: 12px; margin-bottom: 10px; cursor: pointer;" role="button" tabindex="0">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
          <span class="text-primary-color" style="font-size: 0.85rem; font-weight: 600;">${escapeHtml(act.tag)}</span>
          <span class="text-muted" style="font-size: 0.75rem;">${escapeHtml(formatDateString(act.date))}</span>
        </div>
        <div style="font-weight: 500; font-size: 0.95rem;">${escapeHtml(act.hiveName)}</div>
        <div class="text-secondary" style="font-size: 0.85rem; margin-top: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
          ${escapeHtml(act.details)}
        </div>
      </div>
    `).join('');

    // Attach click handlers to open edit modals (or hive detail for viewers)
    document.querySelectorAll('.recent-activity-card').forEach(card => {
      const openActivity = async () => {
        const idx = parseInt(card.getAttribute('data-index'));
        const act = activities[idx];
        const canEdit = canEditActiveOp();
        if (!canEdit) {
          if (act.raw?.hiveId) {
            activeHiveIdForDetail = act.raw.hiveId;
            await navigate('hive-detail');
          }
          return;
        }
        if (act.type === 'inspection') {
          openInspectionModal(act.raw);
        } else if (act.type === 'honey') {
          openHoneyModal(act.raw);
        }
      };
      card.addEventListener('click', openActivity);
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openActivity();
        }
      });
    });
  }

  // Always load radar + offline memos (even with zero activities)
  loadDashboardRadar();
  await renderOfflineMemos();
  await renderDashboardTreatments(hives);
}

async function renderDashboardTreatments(hives) {
  const card = document.getElementById('dashboard-treatments');
  const list = document.getElementById('dashboard-treatments-list');
  if (!card || !list) return;

  const treatments = await getTreatments({ status: 'active' });
  if (!treatments.length) {
    card.style.display = 'none';
    list.innerHTML = '';
    return;
  }

  card.style.display = '';
  const canEdit = canEditActiveOp();
  list.innerHTML = treatments.map((tx) => {
    const hiveNames = (tx.hiveIds || [])
      .map((id) => hives.find((h) => h.id === id)?.name)
      .filter(Boolean)
      .join(', ') || t('common.noHives');
    const product = getTreatmentProductLabel(tx.productId) || tx.productLabel || t('treatments.fallbackLabel');
    const blocked = tx.harvestBlockedUntil
      ? t('treatments.honeyFreeFrom', { date: formatDateString(tx.harvestBlockedUntil) })
      : '';
    return `
      <div class="dashboard-treatment-item" data-id="${escapeHtml(tx.id)}" style="padding: 10px 12px; background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.25); border-radius: 8px; cursor: ${canEdit ? 'pointer' : 'default'};" ${canEdit ? 'role="button" tabindex="0"' : ''}>
        <div style="display: flex; justify-content: space-between; gap: 8px; align-items: flex-start;">
          <div>
            <div style="font-weight: 600; font-size: 0.95rem;">${escapeHtml(product)}</div>
            <div class="text-secondary" style="font-size: 0.8rem; margin-top: 4px;">${escapeHtml(hiveNames)}</div>
            <div class="text-muted" style="font-size: 0.75rem; margin-top: 4px;">
              ${escapeHtml(t('treatments.since', { date: formatDateString(tx.dateStart) }))}${escapeHtml(blocked)}
            </div>
          </div>
          <span class="treatment-badge">${escapeHtml(t('common.active'))}</span>
        </div>
      </div>
    `;
  }).join('');

  if (!canEdit) return;
  list.querySelectorAll('.dashboard-treatment-item').forEach((el) => {
    const open = () => {
      const id = el.getAttribute('data-id');
      const t = treatments.find((x) => x.id === id);
      if (t) openTreatmentModal(t);
    };
    el.addEventListener('click', open);
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        open();
      }
    });
  });
}

async function loadDashboardRadar() {
  const radarContent = document.getElementById('radar-content');
  const radarLoading = document.getElementById('radar-loading');
  const setupPrompt = document.getElementById('radar-setup-prompt');
  const btnSetup = document.getElementById('btn-radar-setup');
  const btnLocate = document.getElementById('btn-radar-locate');

  const elTemp = document.getElementById('radar-temp');
  const elCond = document.getElementById('radar-condition');
  const elWind = document.getElementById('radar-wind');
  const elPollen = document.getElementById('radar-pollen');
  const elIcon = document.getElementById('radar-weather-icon');
  const elInsight = document.getElementById('radar-insight');

  if (!radarContent) return;

  function applyRadarData(data, { stale = false } = {}) {
    radarLoading.style.display = 'none';
    if (btnLocate) btnLocate.style.display = 'block';
    radarContent.style.display = 'flex';
    radarContent.style.opacity = '1';

    elTemp.innerText = data.temperature;
    if (elCond) {
      const cond = data.code != null ? conditionFromCode(data.code) : null;
      elCond.innerText = cond?.labelKey
        ? t(cond.labelKey)
        : data.conditionText || t('weather.unknown');
    }
    if (elIcon) {
      // Fixed SVG paths from weather.js — not user content.
      elIcon.innerHTML = weatherIconSvg(data.code ?? data.conditionIcon ?? data.conditionText, {
        size: 28
      });
    }
    elWind.innerText = data.windSpeed;
    if (data.dominantPollen) {
      const pollenName = data.dominantPollen.nameKey
        ? t(data.dominantPollen.nameKey)
        : data.dominantPollen.name;
      elPollen.innerText = `${pollenName} (${data.dominantPollen.value})`;
    } else {
      elPollen.innerText = t('radar.pollenNone');
    }
    const ageHint = stale ? ` (${t('radar.stale')})` : '';
    elInsight.innerText = (data.insight || '') + ageHint;
  }

  const setupErrorEl = document.getElementById('radar-setup-error');

  function radarLocationErrorMessage(err) {
    if (err instanceof LocationPermissionError) {
      if (err.code === 'denied') return t('radar.locateDeniedHint');
      if (err.code === 'disabled') return t('radar.locateDisabled');
    }
    return t('radar.locateFailed');
  }

  function showRadarSetupError(err) {
    radarLoading.style.display = 'none';
    radarLoading.innerText = t('dashboard.radarLoading');
    if (btnLocate) btnLocate.style.display = 'none';
    radarContent.style.display = 'none';
    radarContent.style.opacity = '1';
    if (setupPrompt) setupPrompt.style.display = 'flex';
    if (setupErrorEl) {
      setupErrorEl.textContent = radarLocationErrorMessage(err);
      setupErrorEl.style.display = 'block';
    }
  }

  function clearRadarSetupError() {
    if (setupErrorEl) {
      setupErrorEl.textContent = '';
      setupErrorEl.style.display = 'none';
    }
  }

  // Bind click handlers (safely overwrite)
  if (btnSetup) {
    btnSetup.onclick = async () => {
      clearRadarSetupError();
      setupPrompt.style.display = 'none';
      radarLoading.style.display = 'block';
      radarLoading.innerText = t('radar.locating');
      try {
        const data = await buildRadarPayload(true);
        writeRadarCache(data);
        applyRadarData(data);
      } catch (err) {
        const stale = readRadarCache();
        if (stale && !(err instanceof LocationPermissionError)) {
          applyRadarData(stale, { stale: true });
          return;
        }
        showRadarSetupError(err);
      }
    };
  }

  if (btnLocate) {
    btnLocate.onclick = async (e) => {
      e.stopPropagation();
      clearRadarSetupError();
      btnLocate.style.display = 'none';
      radarLoading.style.display = 'block';
      radarLoading.innerText = t('radar.locating');
      radarContent.style.opacity = '0.5';
      try {
        const data = await buildRadarPayload(true);
        writeRadarCache(data);
        applyRadarData(data);
      } catch (err) {
        const stale = readRadarCache();
        if (err instanceof LocationPermissionError) {
          showRadarSetupError(err);
          return;
        }
        if (stale) {
          applyRadarData(stale, { stale: true });
          return;
        }
        showRadarSetupError(err);
      }
    };
  }

  // Check if we have cached coordinates
  const cachedLoc = getCachedLocation();
  if (!cachedLoc) {
    // Show location request card — but prefer any persisted radar cache
    const stale = readRadarCache();
    if (stale && Date.now() - stale.timestamp < RADAR_STALE_OK_MS) {
      if (setupPrompt) setupPrompt.style.display = 'none';
      applyRadarData(stale, { stale: true });
      const refreshed = await refreshRadarInsightIfNeeded(stale);
      if (refreshed) applyRadarData(refreshed);
      return;
    }
    radarContent.style.display = 'none';
    radarLoading.style.display = 'none';
    if (btnLocate) btnLocate.style.display = 'none';
    if (setupPrompt) setupPrompt.style.display = 'flex';
    return;
  }

  // Hide setup card, show loading/content
  if (setupPrompt) setupPrompt.style.display = 'none';
  if (btnLocate) btnLocate.style.display = 'block';

  const cached = readRadarCache();
  if (cached && Date.now() - cached.timestamp < RADAR_FRESH_MS) {
    applyRadarData(cached);
    // Pro unlock or language change: refresh KI insight language/content.
    const refreshed = await refreshRadarInsightIfNeeded(cached);
    if (refreshed) applyRadarData(refreshed);
    return;
  }

  // Weak link: keep showing stale cache instead of burning data/time on refresh
  if (cached && !shouldUseBackgroundNetwork() && Date.now() - cached.timestamp < RADAR_STALE_OK_MS) {
    applyRadarData(cached, { stale: true });
    return;
  }

  radarContent.style.display = 'none';
  radarLoading.style.display = 'block';
  radarLoading.innerText = 'Lädt...';

  try {
    const data = await buildRadarPayload(false);
    writeRadarCache(data);
    applyRadarData(data);
  } catch (err) {
    if (cached && Date.now() - cached.timestamp < RADAR_STALE_OK_MS) {
      applyRadarData(cached, { stale: true });
      return;
    }
    radarLoading.innerText = 'Radar offline';
    radarLoading.style.color = 'var(--danger)';
  }
}

function formatGuideHtml(guide) {
  return escapeHtml(guide).replace(/\n/g, '<br>');
}

function renderGuideStepsHtml(steps = []) {
  if (!steps.length) return '';

  const items = steps.map((step, i) => {
    const caption = escapeHtml(step.caption || '');
    return `
      <li class="calendar-guide-step">
        <span class="calendar-guide-step-num">${i + 1}</span>
        <span class="calendar-guide-step-text">${caption}</span>
      </li>
    `;
  }).join('');

  return `
    <div class="calendar-guide-steps">
      <h4 class="calendar-guide-heading">${escapeHtml(t('calendar.guideOpen'))}</h4>
      <ol class="calendar-guide-step-list">
        ${items}
      </ol>
    </div>
  `;
}

function isTaskDone(monthState, task, index) {
  if (monthState[task.id]) return true;
  // Backward compatible with older index-based checkbox state
  if (monthState[index] || monthState[String(index)]) return true;
  return false;
}

async function renderCalendarView() {
  const container = document.getElementById('calendar-tasks-container');
  const monthSelect = document.getElementById('calendar-month-select');
  
  if (!monthSelect.hasAttribute('data-initialized')) {
    const currentMonth = new Date().getMonth() + 1;
    monthSelect.value = currentMonth.toString();
    monthSelect.setAttribute('data-initialized', 'true');
    
    monthSelect.addEventListener('change', async () => {
      await renderCalendarView();
    });
  }

  const selectedMonth = monthSelect.value;
  const tasksForMonth = CALENDAR_TASKS[selectedMonth] || [];
  const state = await getTasksState();
  const monthState = state[selectedMonth] || {};
  const canEdit = canEditActiveOp();

  if (tasksForMonth.length === 0) {
    container.innerHTML = `<div class="empty-state"><p class="empty-state-text">${escapeHtml(t('calendar.emptyMonth'))}</p></div>`;
    return;
  }

  const monthName = t(`calendar.months.${selectedMonth}`) || CALENDAR_MONTH_NAMES[parseInt(selectedMonth, 10) - 1];
  const doneCount = tasksForMonth.filter((task, index) => isTaskDone(monthState, task, index)).length;
  const localizeTask = (task) => {
    const titleKey = `calendar.tasks.${task.id}.title`;
    const dateKey = `calendar.tasks.${task.id}.approxDate`;
    const guideKey = `calendar.tasks.${task.id}.guide`;
    const title = t(titleKey);
    const approxDate = t(dateKey);
    const guide = t(guideKey);
    return {
      ...task,
      title: title !== titleKey ? title : task.title,
      approxDate: approxDate !== dateKey ? approxDate : task.approxDate,
      guide: guide !== guideKey ? guide : task.guide
    };
  };

  let html = `
    <div class="calendar-month-header">
      <h3>${escapeHtml(t('calendar.heading', { month: monthName }))}</h3>
      <p class="text-secondary calendar-month-progress">${escapeHtml(t('calendar.progressHint', { done: doneCount, total: tasksForMonth.length }))}</p>
    </div>
    <div class="calendar-task-list">
  `;

  tasksForMonth.forEach((task, index) => {
    const locTask = localizeTask(task);
    const done = isTaskDone(monthState, task, index);
    const checked = done ? 'checked' : '';
    const disabledAttr = canEdit ? '' : 'disabled';
    html += `
      <article class="calendar-task ${done ? 'is-done' : ''}" data-task-id="${escapeHtml(task.id)}">
        <div class="calendar-task-main">
          <label class="calendar-task-check">
            <input type="checkbox" class="task-checkbox" data-month="${escapeHtml(selectedMonth)}" data-task-id="${escapeHtml(task.id)}" data-task-index="${index}" ${checked} ${disabledAttr} />
            <span class="calendar-task-title">${escapeHtml(locTask.title)}</span>
          </label>
          <button type="button" class="calendar-task-toggle" aria-expanded="false" aria-controls="guide-${escapeHtml(task.id)}" data-guide-toggle="${escapeHtml(task.id)}">
            ${escapeHtml(t('calendar.guideOpen'))}
          </button>
        </div>
        <div class="calendar-task-meta">
          <span class="calendar-task-date" title="${escapeHtml(t('calendar.approxDateTitle'))}">${escapeHtml(locTask.approxDate)}</span>
        </div>
        <div id="guide-${escapeHtml(task.id)}" class="calendar-task-guide hidden" hidden>
          <p class="calendar-task-guide-text">${formatGuideHtml(locTask.guide)}</p>
          ${renderGuideStepsHtml(task.guideSteps || [])}
        </div>
      </article>
    `;
  });

  html += `</div>`;
  container.innerHTML = html;

  document.querySelectorAll('.task-checkbox').forEach(chk => {
    if (!canEdit) return;
    chk.addEventListener('change', async (e) => {
      const month = e.target.getAttribute('data-month');
      const taskId = e.target.getAttribute('data-task-id');
      const checked = e.target.checked;
      const card = e.target.closest('.calendar-task');

      if (card) {
        card.classList.toggle('is-done', checked);
      }

      await saveTaskState(month, taskId, checked);
      trackEvent('calendar_task_toggled', { month, task_id: taskId, done: checked });

      const progress = container.querySelector('.calendar-month-progress');
      if (progress) {
        const total = tasksForMonth.length;
        const doneNow = container.querySelectorAll('.task-checkbox:checked').length;
        progress.textContent = t('calendar.progressHint', { done: doneNow, total });
      }
    });
  });

  document.querySelectorAll('[data-guide-toggle]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-guide-toggle');
      const guide = document.getElementById(`guide-${id}`);
      if (!guide) return;

      const willOpen = guide.hasAttribute('hidden');
      if (willOpen) {
        guide.hidden = false;
        guide.classList.remove('hidden');
        btn.setAttribute('aria-expanded', 'true');
        btn.classList.add('is-open');
        btn.textContent = t('calendar.guideClose');
      } else {
        guide.hidden = true;
        guide.classList.add('hidden');
        btn.setAttribute('aria-expanded', 'false');
        btn.classList.remove('is-open');
        btn.textContent = t('calendar.guideOpen');
      }
    });
  });
}

async function renderHivesView() {
  const hives = await getHives();
  const apiaries = await getApiaries();
  const activeTreatments = await getTreatments({ status: 'active' });
  const container = document.getElementById('hives-list-container');
  const canEdit = canEditActiveOp();
  const filterEl = document.getElementById('apiary-filter');
  const selectedFilter = filterEl ? filterEl.value : '';

  // Keep filter options in sync (preserve selection)
  if (filterEl) {
    const prev = selectedFilter;
    filterEl.innerHTML = [
      `<option value="">Alle Stände</option>`,
      ...apiaries.map(
        (a) => `<option value="${escapeHtml(a.id)}">${escapeHtml(a.name)}</option>`
      ),
      `<option value="__none__">Ohne Stand</option>`
    ].join('');
    filterEl.value = prev;
  }

  if (hives.length === 0) {
    container.innerHTML = `
      <div class="card empty-state">
        <p class="empty-state-title">${escapeHtml(canEdit ? t('hives.emptyTitle') : t('hives.emptyTitleReadonly'))}</p>
        <p class="empty-state-text">${canEdit ? 'Du hast noch keine Völker erfasst.' : 'In diesem Betrieb sind noch keine Völker erfasst.'}</p>
        ${canEdit ? '<button id="btn-add-hive-empty" class="btn btn-primary">Erstes Volk erfassen</button>' : ''}
      </div>
    `;
    document.getElementById('btn-add-hive-empty')?.addEventListener('click', () => openHiveModal());
    return;
  }

  const apiaryById = Object.fromEntries(apiaries.map((a) => [a.id, a]));
  const treatmentsByHive = {};
  for (const tx of activeTreatments) {
    for (const hid of tx.hiveIds || []) {
      if (!treatmentsByHive[hid]) treatmentsByHive[hid] = [];
      treatmentsByHive[hid].push(tx);
    }
  }

  let filtered = hives;
  const filterVal = filterEl?.value || '';
  if (filterVal === '__none__') {
    filtered = hives.filter((h) => !h.apiaryId);
  } else if (filterVal) {
    filtered = hives.filter((h) => h.apiaryId === filterVal);
  }

  if (filtered.length === 0) {
    container.innerHTML = `<div class="empty-state"><p class="empty-state-text">${escapeHtml(t('hives.emptyApiaryShort'))}</p></div>`;
    return;
  }

  function renderHiveCard(hive) {
    const qColor = getQueenColorInfo(hive.queenYear);
    const qColorClass = qColor.className;
    const qColorName = qColor.name;
    const statusClass = statusToCssClass(hive.status);
    const queenLabel = hive.queenName
      ? `"${escapeHtml(hive.queenName)}"`
      : 'Ohne Namen';
    const apiaryName = hive.apiaryId
      ? (apiaryById[hive.apiaryId]?.name || 'Unbekannter Stand')
      : null;
    const hasTreatment = (treatmentsByHive[hive.id] || []).length > 0;
    return `
      <div class="card hive-card" data-id="${escapeHtml(hive.id)}" role="button" tabindex="0">
        <div class="hive-card-top">
          <div>
            <h3 class="hive-card-name">${escapeHtml(hive.name)}</h3>
            ${apiaryName ? `<div class="hive-card-meta">${escapeHtml(apiaryName)}</div>` : ''}
            <div class="hive-card-meta">Rasse: ${escapeHtml(hive.breed || 'Nicht definiert')}</div>
          </div>
          <div class="hive-card-badges">
            <span class="status-badge status-${statusClass}">${escapeHtml(hive.status)}</span>
            ${hasTreatment ? `<span class="treatment-badge">${escapeHtml(t('treatments.badge'))}</span>` : ''}
          </div>
        </div>
        <div class="hive-card-footer">
          <div class="hive-card-queen">
            <span class="queen-badge ${qColorClass}">${hive.queenYear ? escapeHtml(hive.queenYear.toString().slice(-2)) : '?' }</span>
            <span class="hive-card-queen-text">${escapeHtml(t('hives.queenLine', { label: queenLabel, year: hive.queenYear || t('common.unknown'), color: qColorName }))}</span>
          </div>
          <span class="hive-card-cta">Details</span>
        </div>
      </div>
    `;
  }

  // When "Alle Stände": group by apiary; when filtered: flat list
  let html = '';
  if (!filterVal) {
    const groups = new Map();
    for (const a of apiaries) groups.set(a.id, []);
    const orphans = [];
    for (const h of filtered) {
      if (h.apiaryId && groups.has(h.apiaryId)) groups.get(h.apiaryId).push(h);
      else orphans.push(h);
    }
    for (const a of apiaries) {
      const list = groups.get(a.id) || [];
      if (!list.length) continue;
      html += `<h3 class="apiary-group-title">${escapeHtml(a.name)}</h3>`;
      html += list.map(renderHiveCard).join('');
    }
    if (orphans.length) {
      html += `<h3 class="apiary-group-title">Ohne Stand</h3>`;
      html += orphans.map(renderHiveCard).join('');
    }
  } else {
    html = filtered.map(renderHiveCard).join('');
  }

  container.innerHTML = html;

  document.querySelectorAll('.hive-card').forEach(card => {
    const openHive = async () => {
      activeHiveIdForDetail = card.getAttribute('data-id');
      await navigate('hive-detail');
    };
    card.addEventListener('click', openHive);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openHive();
      }
    });
  });
}

async function renderHiveDetailView() {
  const hive = await getHiveById(activeHiveIdForDetail);
  if (!hive) {
    await navigate('hives');
    return;
  }

  // Set Title
  document.getElementById('detail-hive-title').innerText = hive.name;

  const canEdit = canEditActiveOp();
  const apiary = hive.apiaryId ? await getApiaryById(hive.apiaryId) : null;
  const activeTreatments = await getActiveTreatmentsForHive(hive.id);

  // Render Hive Details Info Block
  const infoBlock = document.getElementById('detail-hive-info');
  const qColor = getQueenColorInfo(hive.queenYear);
  const qColorClass = qColor.className;
  const qColorName = qColor.name;

  const treatmentsBanner = activeTreatments.length
    ? `<div class="treatment-banner-list">
        ${activeTreatments.map((tx) => {
          const label = getTreatmentProductLabel(tx.productId) || tx.productLabel || t('treatments.fallbackLabel');
          const blocked = tx.harvestBlockedUntil
            ? t('treatments.honeyFreeFrom', { date: formatDateString(tx.harvestBlockedUntil) })
            : '';
          return `
            <div class="treatment-banner${canEdit ? ' is-clickable' : ''}" data-treatment-id="${escapeHtml(tx.id)}">
              <div class="treatment-banner-row">
                <div>
                  <span class="treatment-badge">${escapeHtml(t('common.active'))}</span>
                  <strong class="treatment-banner-label">${escapeHtml(label)}</strong>
                  <div class="treatment-banner-meta">${escapeHtml(t('treatments.since', { date: formatDateString(tx.dateStart) }))}${escapeHtml(blocked)}</div>
                </div>
                ${canEdit ? `<span class="treatment-banner-cta">${escapeHtml(t('common.edit'))}</span>` : ''}
              </div>
            </div>
          `;
        }).join('')}
      </div>`
    : '';
  
  infoBlock.innerHTML = `
    ${treatmentsBanner}
    <div class="detail-header-top">
      <span class="status-badge status-${statusToCssClass(hive.status)}">${escapeHtml(hive.status)}</span>
      ${canEdit ? '<button id="btn-edit-hive-details" class="btn btn-secondary btn-sm">Stammdaten bearbeiten</button>' : ''}
    </div>
    <div class="detail-row">
      <span class="text-secondary">Bienenstand</span>
      <span class="detail-row-value">${escapeHtml(apiary?.name || 'Kein Stand')}</span>
    </div>
    <div class="detail-row">
      <span class="text-secondary">${escapeHtml(t('hives.queenName'))}</span>
      <span class="detail-row-value">${escapeHtml(hive.queenName || 'Kein Name vergeben')}</span>
    </div>
    <div class="detail-row">
      <span class="text-secondary">Rasse / Herkunft</span>
      <span class="detail-row-value">${escapeHtml(hive.breed || 'Nicht angegeben')}</span>
    </div>
    <div class="detail-row">
      <span class="text-secondary">${escapeHtml(t('hives.queenYear'))}</span>
      <div class="detail-row-queen">
        <span class="queen-badge ${qColorClass}">${hive.queenYear ? escapeHtml(hive.queenYear.toString().slice(-2)) : '?'}</span>
        <span class="detail-row-value">${escapeHtml(hive.queenYear || 'Unbekannt')} (${escapeHtml(qColorName)})</span>
      </div>
    </div>
    <div class="detail-row">
      <span class="text-secondary">Brutraum (Waben)</span>
      <span class="detail-row-value">${escapeHtml(hive.broodFrames || 0)}</span>
    </div>
    <div class="detail-row">
      <span class="text-secondary">1. Honigraum (Waben)</span>
      <span class="detail-row-value">${escapeHtml(hive.honeyFrames1 || 0)}</span>
    </div>
    <div class="detail-row">
      <span class="text-secondary">2. Honigraum (Waben)</span>
      <span class="detail-row-value">${escapeHtml(hive.honeyFrames2 || 0)}</span>
    </div>
    <div class="detail-row">
      <span class="text-secondary">Erstellt am</span>
      <span class="detail-row-value">${escapeHtml(formatDateString(hive.createdAt))}</span>
    </div>
    ${hive.notes ? `
      <div class="detail-notes">
        <span class="detail-notes-label">Notizen</span>
        <p class="detail-notes-text">${escapeHtml(hive.notes)}</p>
      </div>
    ` : ''}
  `;

  // Attach event to edit hive stammdaten
  document.getElementById('btn-edit-hive-details')?.addEventListener('click', () => {
    openHiveModal(hive);
  });

  if (canEdit) {
    infoBlock.querySelectorAll('.treatment-banner').forEach((el) => {
      el.addEventListener('click', async () => {
        const id = el.getAttribute('data-treatment-id');
        const t = activeTreatments.find((x) => x.id === id);
        if (t) openTreatmentModal(t);
      });
    });
  }

  // Render AI Recommendation Section (remove existing if present)
  const existingRecommendationBlock = document.getElementById('hive-recommendation-block');
  if (existingRecommendationBlock) {
    existingRecommendationBlock.remove();
  }

  const inspections = await getInspections(activeHiveIdForDetail);
  const recommendationBlock = document.createElement('div');
  recommendationBlock.id = 'hive-recommendation-block';
  recommendationBlock.className = 'card recommendation-card';
  recommendationBlock.innerHTML = `
    <div class="recommendation-header">
      <h3 class="section-title">${escapeHtml(t('ai.recommendationTitle'))}</h3>
      <button id="btn-refresh-recommendation" class="btn btn-sm btn-secondary">${escapeHtml(t('common.retry'))}</button>
    </div>
    <div id="recommendation-content" class="recommendation-body">
      <span>${escapeHtml(t('ai.recommendationLoading'))}</span>
    </div>
  `;
  
  // Insert recommendation block after info block
  infoBlock.parentNode.insertBefore(recommendationBlock, infoBlock.nextSibling);

  // Load recommendation
  async function loadRecommendation() {
    const recommendationContent = document.getElementById('recommendation-content');
    if (!recommendationContent) return;

    if (!hasProAccess()) {
      recommendationContent.innerHTML =
        '<span class="text-secondary">' +
        escapeHtml(t('ai.recommendationPro')) +
        ' <button type="button" class="btn btn-sm btn-secondary" id="btn-rec-upsell" style="width:auto; margin-top:8px;">' +
        escapeHtml(t('billing.upsellTitle')) +
        '</button></span>';
      document.getElementById('btn-rec-upsell')?.addEventListener('click', () => {
        openProModal(t('ai.featureRecommendation'));
      });
      return;
    }

    try {
      recommendationContent.innerHTML = `<span>${escapeHtml(t('ai.recommendationLoading'))}</span>`;
      const recommendation = await getHiveRecommendation(hive, inspections);
      const softFail =
        recommendation === t('ai.recommendationUnavailable') ||
        recommendation === t('ai.recommendationNoInspections');
      trackEvent('ai_recommendation_loaded', { ok: !softFail });

      // Simple text formatting (proxy/auth errors are returned as plain text)
      const formattedRecommendation = escapeHtml(recommendation).replace(/\n/g, '<br>');
      const cls = softFail ? 'text-secondary' : '';
      recommendationContent.innerHTML = `<div class="${cls}">${formattedRecommendation}</div>`;
    } catch (err) {
      console.error('Fehler beim Laden der Empfehlung:', err);
      trackEvent('ai_recommendation_loaded', { ok: false });
      recommendationContent.innerHTML =
        '<span class="text-danger">' +
        escapeHtml(err?.message || t('ai.recommendationLoadError')) +
        '</span>';
    }
  }

  // Initial load
  loadRecommendation();

  // Refresh button
  document.getElementById('btn-refresh-recommendation')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-refresh-recommendation');
    if (!btn) return;
    btn.disabled = true;
    btn.innerText = 'Lädt...';
    await loadRecommendation();
    btn.disabled = false;
    btn.innerText = 'Neu laden';
  });

  // Render Inspections Timeline
  const timeline = document.getElementById('hive-inspections-list');
  
  if (inspections.length === 0) {
    timeline.innerHTML = `
      <div class="card empty-state empty-state-dashed">
        <p class="empty-state-text">${escapeHtml(t('inspections.empty'))}</p>
        ${canEdit ? '<button id="btn-new-insp-empty" class="btn btn-sm btn-secondary">Erste Durchsicht eintragen</button>' : ''}
      </div>
    `;
    document.getElementById('btn-new-insp-empty')?.addEventListener('click', () => {
      openInspectionModal(null, activeHiveIdForDetail);
    });
    return;
  }

  const creatorIds = inspections.map((i) => i.createdBy).filter(Boolean);
  let creatorNames = {};
  try {
    if (supabase && creatorIds.length) {
      creatorNames = await getProfileMap(creatorIds);
    }
  } catch (err) {
    console.warn('Profilnamen nicht geladen:', err);
  }

  timeline.innerHTML = inspections.map(insp => {
    const weatherString = (insp.weatherTemp !== undefined && insp.weatherTemp !== null) ? 
        `<span class="log-item-weather">${escapeHtml(insp.weatherCondition || '')} ${escapeHtml(insp.weatherTemp)}°C</span>` : '';
    const byName = insp.createdBy ? (creatorNames[insp.createdBy] || null) : null;
    const byChip = byName
      ? `<span class="created-by-chip">von ${escapeHtml(byName)}</span>`
      : '';
    const chips = formatChecklistChips(insp);
    const chipsHtml = chips.length
      ? `<div class="checklist-chips">${chips.map((c) => `<span class="checklist-chip">${escapeHtml(c)}</span>`).join('')}</div>`
      : '';
    return `
      <div class="log-item inspection-log-card" data-id="${escapeHtml(insp.id)}">
        <div class="log-item-header">
          <span>${escapeHtml(formatDateString(insp.date))}${weatherString}</span>
          ${byChip}
        </div>
        ${chipsHtml}
        ${insp.notes ? `<p class="log-item-notes">${escapeHtml(insp.notes)}</p>` : ''}
        ${canEdit ? `
        <div class="log-item-actions">
          <button class="btn btn-sm btn-secondary btn-edit-insp" data-id="${escapeHtml(insp.id)}">Bearbeiten</button>
        </div>` : ''}
      </div>
    `;
  }).join('');

  // Attach click handler for inspection editing buttons
  document.querySelectorAll('.btn-edit-insp').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-id');
      const insp = inspections.find(i => i.id === id);
      if (insp) {
        openInspectionModal(insp);
      }
    });
  });
}

async function renderFinanceView() {
  const expensesList = document.getElementById('expenses-list-container');
  const honeyList = document.getElementById('honey-list-container');
  const sponsorshipsList = document.getElementById('sponsorships-list-container');
  const sectionExpenses = document.getElementById('section-expenses');
  const sectionHoney = document.getElementById('section-honey');
  const sectionSponsorships = document.getElementById('section-sponsorships');

  // Toggle sections
  if (currentFinanceTab === 'expenses') {
    sectionExpenses.classList.remove('hidden');
    sectionHoney.classList.add('hidden');
    sectionSponsorships.classList.add('hidden');
    setQuickAddLabel('+ Kauf');
    
    // Render Expenses
    const finances = (await getFinances()).filter(f => f.type === 'expense' || !f.type);
    if (finances.length === 0) {
      expensesList.innerHTML = `<div class="empty-state"><p class="empty-state-text">${escapeHtml(t('finances.emptyExpenses'))}</p></div>`;
      return;
    }

    expensesList.innerHTML = finances.map(item => `
      <div class="data-row finance-card" data-id="${escapeHtml(item.id)}" role="button" tabindex="0">
        <div class="data-row-main">
          <h4 class="data-row-title">${escapeHtml(item.description)}</h4>
          <div class="data-row-meta">
            ${escapeHtml(formatDateString(item.date))} · <span class="data-row-cat">${escapeHtml(financeCategoryLabel(item.category))}</span>
          </div>
        </div>
        <div class="data-row-side">
          <span class="amount amount-danger">−${escapeHtml(parseFloat(item.price).toFixed(2))} CHF</span>
          <button class="btn btn-sm btn-danger btn-row-delete btn-delete-fin-item" data-id="${escapeHtml(item.id)}">${escapeHtml(t('common.delete'))}</button>
        </div>
      </div>
    `).join('');

    // Click handler to edit a purchase
    document.querySelectorAll('.finance-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.classList.contains('btn-delete-fin-item')) return;
        const id = card.getAttribute('data-id');
        const purchase = finances.find(f => f.id === id);
        if (purchase) {
          openFinanceModal(purchase);
        }
      });
    });

    // Delete buttons
    document.querySelectorAll('.btn-delete-fin-item').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm(t('confirms.deleteExpense'))) {
          await deleteFinance(btn.getAttribute('data-id'));
          await renderFinanceView();
          await renderDashboardView();
        }
      });
    });

  } else if (currentFinanceTab === 'honey') {
    sectionExpenses.classList.add('hidden');
    sectionHoney.classList.remove('hidden');
    sectionSponsorships.classList.add('hidden');
    setQuickAddLabel('+ Ernte');

    // Render Honey Yields
    const honey = await getHoneyHarvests();
    const hives = await getHives();
    
    if (honey.length === 0) {
      honeyList.innerHTML = `<div class="empty-state"><p class="empty-state-text">${escapeHtml(t('finances.emptyHoney'))}</p></div>`;
      return;
    }

    honeyList.innerHTML = honey.map(harvest => {
      const hive = hives.find(h => h.id === harvest.hiveId);
      return `
        <div class="data-row honey-card" data-id="${escapeHtml(harvest.id)}" role="button" tabindex="0">
          <div class="data-row-main">
            <h4 class="data-row-title">${escapeHtml(hive ? hive.name : 'Unbekanntes Volk')}</h4>
            <div class="data-row-meta">
              ${escapeHtml(formatDateString(harvest.date))} · ${escapeHtml(t('finances.typePrefix', { type: harvest.type || t('finances.defaultHoneyType') }))}
            </div>
          </div>
          <div class="data-row-side">
            <span class="amount amount-primary">${escapeHtml(parseFloat(harvest.amount).toFixed(1))} kg</span>
            <button class="btn btn-sm btn-danger btn-row-delete btn-delete-honey-item" data-id="${escapeHtml(harvest.id)}">${escapeHtml(t('common.delete'))}</button>
          </div>
        </div>
      `;
    }).join('');

    // Click handler to edit an harvest
    document.querySelectorAll('.honey-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.classList.contains('btn-delete-honey-item')) return;
        const id = card.getAttribute('data-id');
        const harvest = honey.find(h => h.id === id);
        if (harvest) {
          openHoneyModal(harvest);
        }
      });
    });

    // Delete buttons
    document.querySelectorAll('.btn-delete-honey-item').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm(t('confirms.deleteHoney'))) {
          await deleteHoneyHarvest(btn.getAttribute('data-id'));
          await renderFinanceView();
          await renderDashboardView();
        }
      });
    });
  } else {
    sectionExpenses.classList.add('hidden');
    sectionHoney.classList.add('hidden');
    sectionSponsorships.classList.remove('hidden');
    setQuickAddLabel('+ Paten.');

    // Render Bienenpatenschaften
    const finances = (await getFinances()).filter(f => f.type === 'sponsorship');
    const hives = await getHives();

    if (finances.length === 0) {
      sponsorshipsList.innerHTML = `<div class="empty-state"><p class="empty-state-text">${escapeHtml(t('finances.emptySponsorships'))}</p></div>`;
      return;
    }

    sponsorshipsList.innerHTML = finances.map(item => {
      const hive = hives.find(h => h.id === item.hiveId);
      return `
        <div class="data-row sponsorship-card" data-id="${escapeHtml(item.id)}" role="button" tabindex="0">
          <div class="data-row-main">
            <h4 class="data-row-title">${escapeHtml(item.sponsorName || 'Unbekannter Pate')}</h4>
            <div class="data-row-meta">
              ${escapeHtml(formatDateString(item.date))} · ${escapeHtml(t('finances.hivePrefix', { name: hive ? hive.name : t('common.unknownHive') }))}
            </div>
          </div>
          <div class="data-row-side">
            <span class="amount amount-success">+${escapeHtml(parseFloat(item.price).toFixed(2))} CHF</span>
            <button class="btn btn-sm btn-danger btn-row-delete btn-delete-sponsorship-item" data-id="${escapeHtml(item.id)}">${escapeHtml(t('common.delete'))}</button>
          </div>
        </div>
      `;
    }).join('');

    // Click handler to edit a sponsorship
    document.querySelectorAll('.sponsorship-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.classList.contains('btn-delete-sponsorship-item')) return;
        const id = card.getAttribute('data-id');
        const sponsorship = finances.find(f => f.id === id);
        if (sponsorship) {
          openSponsorshipModal(sponsorship);
        }
      });
    });

    // Delete buttons
    document.querySelectorAll('.btn-delete-sponsorship-item').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm(t('confirms.deleteSponsorship'))) {
          await deleteFinance(btn.getAttribute('data-id'));
          await renderFinanceView();
          await renderDashboardView();
        }
      });
    });
  }
}

// --- Modals Toggle Logic ---
function setupModals() {
  // Setup overlay click to close
  const overlays = document.querySelectorAll('.modal-overlay');
  overlays.forEach(overlay => {
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        closeModal(overlay.id);
      }
    });
  });

  // Setup close buttons via selector [data-close]
  const closeBtns = document.querySelectorAll('[data-close]');
  closeBtns.forEach(btn => {
    if (!btn.getAttribute('aria-label')) {
      btn.setAttribute('aria-label', t('common.close'));
    }
    btn.addEventListener('click', () => {
      const modalId = btn.getAttribute('data-close');
      closeModal(modalId);
    });
  });

  // Escape closes the topmost open modal
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const open = document.querySelector('.modal-overlay.active');
    if (open) closeModal(open.id);
  });
}

function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.add('active');
    const focusTarget = modal.querySelector('input, select, textarea, button:not([data-close])');
    if (focusTarget) {
      setTimeout(() => focusTarget.focus(), 50);
    }
  }
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.remove('active');
  }
}

// --- Form Population & Display ---

async function openHiveModal(hive = null) {
  if (!canEditActiveOp()) {
    alert(t('hives.viewerReadonly'));
    return;
  }
  const form = document.getElementById('form-hive');
  const deleteBtn = document.getElementById('btn-delete-hive');
  const title = document.getElementById('modal-hive-title');
  form.reset();

  await populateApiarySelect(
    document.getElementById('hive-form-apiary'),
    hive?.apiaryId || null
  );

  if (hive) {
    title.innerText = 'Stammdaten bearbeiten';
    document.getElementById('hive-form-id').value = hive.id;
    document.getElementById('hive-form-name').value = hive.name;
    document.getElementById('hive-form-queen-name').value = hive.queenName || '';
    document.getElementById('hive-form-breed').value = hive.breed || '';
    document.getElementById('hive-form-queen-year').value = hive.queenYear || 2026;
    document.getElementById('hive-form-status').value = hive.status || 'Gesund';
    document.getElementById('hive-form-brood-frames').value = hive.broodFrames || 0;
    document.getElementById('hive-form-honey-frames-1').value = hive.honeyFrames1 || 0;
    document.getElementById('hive-form-honey-frames-2').value = hive.honeyFrames2 || 0;
    document.getElementById('hive-form-notes').value = hive.notes || '';
    if (hive.apiaryId) {
      document.getElementById('hive-form-apiary').value = hive.apiaryId;
    }
    const canDelete = isOwnerActiveOp();
    deleteBtn.style.display = canDelete ? 'block' : 'none';
  } else {
    title.innerText = 'Neues Volk erfassen';
    document.getElementById('hive-form-id').value = '';
    document.getElementById('hive-form-queen-name').value = '';
    document.getElementById('hive-form-queen-year').value = new Date().getFullYear();
    document.getElementById('hive-form-brood-frames').value = 0;
    document.getElementById('hive-form-honey-frames-1').value = 0;
    document.getElementById('hive-form-honey-frames-2').value = 0;
    deleteBtn.style.display = 'none';
  }

  openModal('modal-hive');
}

async function openInspectionModal(inspection = null, preselectedHiveId = null) {
  if (!canEditActiveOp()) {
    alert(t('inspections.viewerReadonly'));
    return;
  }
  const form = document.getElementById('form-inspection');
  const deleteBtn = document.getElementById('btn-delete-inspection');
  form.reset();

  const hivesContainer = document.getElementById('insp-form-hives-container');
  const hives = await getHives();
  
  if (hives.length === 0) {
    alert(t('inspections.needHiveFirst'));
    openHiveModal();
    return;
  }

  const weatherStatusSection = document.getElementById('weather-status-section');
  const weatherDisplay = document.getElementById('weather-display');
  const btnWeatherRetry = document.getElementById('btn-weather-retry');
  const inpWeatherTemp = document.getElementById('insp-weather-temp');
  const inpWeatherCond = document.getElementById('insp-weather-condition');

  if (inspection) {
    document.getElementById('insp-form-id').value = inspection.id;
    document.getElementById('insp-form-date').value = inspection.date;
    document.getElementById('insp-form-notes').value = inspection.notes || '';
    fillInspectionChecklistForm(inspection);
    inpWeatherTemp.value = inspection.weatherTemp !== undefined ? inspection.weatherTemp : '';
    inpWeatherCond.value = inspection.weatherCondition || '';
    deleteBtn.style.display = 'block';
    
    weatherStatusSection.style.display = 'none'; // Hide weather fetch for old ones

    const matchedHive = hives.find(h => h.id === inspection.hiveId);
    const hiveName = matchedHive ? matchedHive.name : 'Unbekanntes Volk';
    hivesContainer.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; font-weight: 500;">
        <span>${escapeHtml(hiveName)}</span>
        <span class="text-muted" style="font-size: 0.75rem;">(Nicht änderbar)</span>
      </div>
      <input type="hidden" class="hive-checkbox" value="${escapeHtml(inspection.hiveId)}" checked />
    `;
  } else {
    document.getElementById('insp-form-id').value = '';
    document.getElementById('insp-form-date').value = new Date().toISOString().split('T')[0];
    fillInspectionChecklistForm(null);
    deleteBtn.style.display = 'none';
    
    weatherStatusSection.style.display = 'flex';
    inpWeatherTemp.value = '';
    inpWeatherCond.value = '';
    
    const loadWeather = async () => {
      weatherDisplay.innerHTML = escapeHtml(t('inspections.weatherLoading'));
      btnWeatherRetry.style.display = 'none';
      try {
        const w = await fetchCurrentWeather();
        const cond = w.code != null ? conditionFromCode(w.code) : null;
        const condLabel = cond?.labelKey ? t(cond.labelKey) : (w.conditionText || t('weather.unknown'));
        const cacheHint = w.fromCache ? ` <span class="text-muted" style="font-weight:400;">(${escapeHtml(t('radar.stale'))})</span>` : '';
        weatherDisplay.innerHTML = `${escapeHtml(condLabel)} · ${escapeHtml(w.temperature)}°C${cacheHint}`;
        inpWeatherTemp.value = w.temperature;
        inpWeatherCond.value = condLabel;
        if (w.fromCache) {
          btnWeatherRetry.style.display = 'block';
        }
      } catch (err) {
        weatherDisplay.innerHTML = `<span class="text-danger">${escapeHtml(t('inspections.weatherOffline'))}</span>`;
        btnWeatherRetry.style.display = 'block';
      }
    };
    btnWeatherRetry.onclick = loadWeather;
    loadWeather();

    hivesContainer.innerHTML = hives.map(h => {
      const isChecked = (preselectedHiveId === h.id) ? 'checked' : '';
      return `
        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-weight: normal; margin: 0; padding: 4px; transition: background-color 0.2s;">
          <input type="checkbox" class="hive-checkbox" value="${escapeHtml(h.id)}" ${isChecked} id="hive-chk-${escapeHtml(h.id)}" style="width: auto; margin: 0;" />
          <span>${escapeHtml(h.name)}</span>
        </label>
      `;
    }).join('');
  }

  openModal('modal-inspection');
}

async function openTreatmentModal(treatment = null, preselectedHiveId = null) {
  if (!canEditActiveOp()) {
    alert(t('treatments.viewerReadonly'));
    return;
  }
  const form = document.getElementById('form-treatment');
  const deleteBtn = document.getElementById('btn-delete-treatment');
  const title = document.getElementById('modal-treatment-title');
  form.reset();

  const hives = await getHives();
  if (hives.length === 0) {
    alert(t('treatments.needHiveFirst'));
    openHiveModal();
    return;
  }

  const productSelect = document.getElementById('treatment-form-product');
  productSelect.innerHTML = TREATMENT_PRODUCTS.map(
    (p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(getTreatmentProductLabel(p.id))}</option>`
  ).join('');

  const hivesContainer = document.getElementById('treatment-form-hives-container');
  const preselectIds = treatment?.hiveIds
    || (preselectedHiveId ? [preselectedHiveId] : (activeHiveIdForDetail ? [activeHiveIdForDetail] : []));

  hivesContainer.innerHTML = hives.map((h) => {
    const isChecked = preselectIds.includes(h.id) ? 'checked' : '';
    return `
      <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-weight: normal; margin: 0; padding: 4px;">
        <input type="checkbox" class="treatment-hive-checkbox" value="${escapeHtml(h.id)}" ${isChecked} style="width: auto; margin: 0;" />
        <span>${escapeHtml(h.name)}</span>
      </label>
    `;
  }).join('');

  if (treatment) {
    title.innerText = t('treatments.editTitle');
    document.getElementById('treatment-form-id').value = treatment.id;
    document.getElementById('treatment-form-date-start').value = treatment.dateStart || '';
    document.getElementById('treatment-form-date-end').value = treatment.dateEnd || '';
    document.getElementById('treatment-form-product').value = treatment.productId || 'formic_60';
    document.getElementById('treatment-form-dose').value = treatment.dose || '';
    document.getElementById('treatment-form-status').value = treatment.status || 'active';
    document.getElementById('treatment-form-notes').value = treatment.notes || '';
    deleteBtn.style.display = 'block';
  } else {
    title.innerText = t('treatments.title');
    document.getElementById('treatment-form-id').value = '';
    document.getElementById('treatment-form-date-start').value = new Date().toISOString().split('T')[0];
    document.getElementById('treatment-form-date-end').value = '';
    document.getElementById('treatment-form-product').value = 'formic_60';
    document.getElementById('treatment-form-status').value = 'active';
    deleteBtn.style.display = 'none';

    // Prefill end date from product default duration
    const product = getTreatmentProduct(productSelect.value);
    if (product?.defaultDurationDays) {
      const start = document.getElementById('treatment-form-date-start').value;
      document.getElementById('treatment-form-date-end').value =
        addDaysToDateStr(start, product.defaultDurationDays - 1) || '';
    }
  }

  updateTreatmentPhiHint();
  openModal('modal-treatment');
}

async function openFinanceModal(finance = null) {
  const form = document.getElementById('form-finance');
  const deleteBtn = document.getElementById('btn-delete-finance');
  form.reset();

  if (finance) {
    document.getElementById('finance-form-id').value = finance.id;
    document.getElementById('finance-form-date').value = finance.date;
    document.getElementById('finance-form-description').value = finance.description;
    document.getElementById('finance-form-category').value = financeCategorySelectValue(finance.category);
    document.getElementById('finance-form-price').value = finance.price;
    deleteBtn.style.display = 'block';
  } else {
    document.getElementById('finance-form-id').value = '';
    document.getElementById('finance-form-date').value = new Date().toISOString().split('T')[0];
    deleteBtn.style.display = 'none';
  }

  openModal('modal-finance');
}

async function openHoneyModal(honey = null) {
  const form = document.getElementById('form-honey');
  const deleteBtn = document.getElementById('btn-delete-honey');
  form.reset();

  // Populate Hive dropdown
  const hiveSelect = document.getElementById('honey-form-hive-id');
  const hives = await getHives();

  if (hives.length === 0) {
    alert(t('finances.needHiveHoney'));
    openHiveModal();
    return;
  }

  hiveSelect.innerHTML = hives.map(h => `<option value="${escapeHtml(h.id)}">${escapeHtml(h.name)}</option>`).join('');

  if (honey) {
    document.getElementById('honey-form-id').value = honey.id;
    document.getElementById('honey-form-hive-id').value = honey.hiveId;
    document.getElementById('honey-form-date').value = honey.date;
    document.getElementById('honey-form-amount').value = honey.amount;
    document.getElementById('honey-form-type').value = honey.type || t('finances.defaultHoneyType');
    deleteBtn.style.display = 'block';
  } else {
    document.getElementById('honey-form-id').value = '';
    document.getElementById('honey-form-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('honey-form-type').value = t('finances.defaultHoneyType');
    deleteBtn.style.display = 'none';
    
    if (activeHiveIdForDetail) {
      document.getElementById('honey-form-hive-id').value = activeHiveIdForDetail;
    }
  }

  openModal('modal-honey');
}

async function openSponsorshipModal(sponsorship = null) {
  const form = document.getElementById('form-sponsorship');
  const deleteBtn = document.getElementById('btn-delete-sponsorship');
  form.reset();

  // Populate Hive dropdown
  const hiveSelect = document.getElementById('sponsorship-form-hive-id');
  const hives = await getHives();

  if (hives.length === 0) {
    alert(t('finances.needHiveSponsorship'));
    openHiveModal();
    return;
  }

  hiveSelect.innerHTML = hives.map(h => `<option value="${escapeHtml(h.id)}">${escapeHtml(h.name)}</option>`).join('');

  if (sponsorship) {
    document.getElementById('sponsorship-form-id').value = sponsorship.id;
    document.getElementById('sponsorship-form-date').value = sponsorship.date;
    document.getElementById('sponsorship-form-sponsor').value = sponsorship.sponsorName || '';
    document.getElementById('sponsorship-form-hive-id').value = sponsorship.hiveId || hives[0].id;
    document.getElementById('sponsorship-form-price').value = sponsorship.price;
    document.getElementById('sponsorship-form-notes').value = sponsorship.notes || '';
    deleteBtn.style.display = 'block';
  } else {
    document.getElementById('sponsorship-form-id').value = '';
    document.getElementById('sponsorship-form-date').value = new Date().toISOString().split('T')[0];
    deleteBtn.style.display = 'none';
    
    if (activeHiveIdForDetail) {
      document.getElementById('sponsorship-form-hive-id').value = activeHiveIdForDetail;
    }
  }

  openModal('modal-sponsorship');
}

function getFormSubmitButton(form, event) {
  if (event?.submitter && event.submitter.tagName === 'BUTTON') return event.submitter;
  return form.querySelector('button[type="submit"]');
}

// --- Form Submissions & Database Write Ops ---
function setupForms() {
  // Hive Form Submit
  document.getElementById('form-hive').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const submitBtn = getFormSubmitButton(form, e);
    await withButtonLoading(submitBtn, async () => {
      try {
        const id = document.getElementById('hive-form-id').value;
        const apiaryId = document.getElementById('hive-form-apiary')?.value || null;
        const hive = {
          name: document.getElementById('hive-form-name').value,
          queenName: document.getElementById('hive-form-queen-name').value,
          breed: document.getElementById('hive-form-breed').value,
          queenYear: parseInt(document.getElementById('hive-form-queen-year').value),
          status: document.getElementById('hive-form-status').value,
          broodFrames: parseInt(document.getElementById('hive-form-brood-frames').value) || 0,
          honeyFrames1: parseInt(document.getElementById('hive-form-honey-frames-1').value) || 0,
          honeyFrames2: parseInt(document.getElementById('hive-form-honey-frames-2').value) || 0,
          notes: document.getElementById('hive-form-notes').value,
          apiaryId: apiaryId || null
        };

        if (id) hive.id = id;

        await saveHive(hive);
        trackEvent(id ? 'hive_updated' : 'hive_created');
        closeModal('modal-hive');

        if (id) {
          await renderHiveDetailView();
        } else {
          await navigate('hives');
        }
        await renderDashboardView();
      } catch (err) {
        console.error('Fehler beim Speichern des Volks:', err);
        alert(t('errors.saveHive', { name: err.message || err }));
      }
    });
  });

  // Hive Delete Button
  document.getElementById('btn-delete-hive').addEventListener('click', async () => {
    const id = document.getElementById('hive-form-id').value;
    if (id && confirm(t('confirms.deleteHive'))) {
      const btn = document.getElementById('btn-delete-hive');
      await withButtonLoading(btn, async () => {
        await deleteHive(id);
        trackEvent('hive_deleted');
        closeModal('modal-hive');
        await navigate('hives');
        await renderDashboardView();
      }, t('common.deleting'));
    }
  });

  // Inspection Form Submit
  document.getElementById('form-inspection').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const submitBtn = getFormSubmitButton(form, e);

    const id = document.getElementById('insp-form-id').value;
    const checkedCheckboxes = Array.from(document.querySelectorAll('.hive-checkbox')).filter(el => {
      return el.type === 'hidden' || el.checked;
    });
    if (checkedCheckboxes.length === 0) {
      alert(t('inspections.selectHive'));
      return;
    }

    await withButtonLoading(submitBtn, async () => {
      try {
        const date = document.getElementById('insp-form-date').value;
        const notes = document.getElementById('insp-form-notes').value;
        const weatherTemp = document.getElementById('insp-weather-temp').value;
        const weatherCondition = document.getElementById('insp-weather-condition').value;
        const checklist = readInspectionChecklistFromForm();
        const broodStatus = summarizeChecklist(checklist);
        const temperament = parseInt(document.getElementById('insp-temperament')?.value || '5', 10) || 5;
        const feeding = document.getElementById('insp-feeding')?.value || '';
        const honeySuper = document.getElementById('insp-honey-super')?.value || '';
        const varroa = checklist.varroaLevel && VARROA_LEVEL_LABELS[checklist.varroaLevel]
          ? VARROA_LEVEL_LABELS[checklist.varroaLevel]
          : '';

        if (id) {
          const inspection = {
            id: id,
            hiveId: checkedCheckboxes[0].value,
            date: date,
            broodStatus,
            honeySuper,
            temperament,
            weatherTemp: weatherTemp !== '' ? parseFloat(weatherTemp) : undefined,
            weatherCondition: weatherCondition !== '' ? weatherCondition : undefined,
            feeding,
            varroa,
            notes: notes,
            checklist
          };
          await saveInspection(inspection);
        } else {
          for (const chk of checkedCheckboxes) {
            const inspection = {
              hiveId: chk.value,
              date: date,
              broodStatus,
              honeySuper,
              temperament,
              weatherTemp: weatherTemp !== '' ? parseFloat(weatherTemp) : undefined,
              weatherCondition: weatherCondition !== '' ? weatherCondition : undefined,
              feeding,
              varroa,
              notes: notes,
              checklist
            };
            await saveInspection(inspection);
          }
        }

        trackEvent(id ? 'inspection_updated' : 'inspection_created', {
          hive_count: checkedCheckboxes.length
        });
        closeModal('modal-inspection');

        if (currentView === 'hive-detail') {
          await renderHiveDetailView();
        } else {
          await navigate('dashboard');
        }
        await renderDashboardView();
      } catch (err) {
        console.error('Fehler beim Speichern der Durchsicht:', err);
        alert(t('errors.saveInspection', { name: err.message || err }));
      }
    });
  });

  // Inspection Delete Button
  document.getElementById('btn-delete-inspection').addEventListener('click', async () => {
    const id = document.getElementById('insp-form-id').value;
    if (id && confirm(t('confirms.deleteInspection'))) {
      const btn = document.getElementById('btn-delete-inspection');
      await withButtonLoading(btn, async () => {
        await deleteInspection(id);
        closeModal('modal-inspection');
        if (currentView === 'hive-detail') {
          await renderHiveDetailView();
        }
        await renderDashboardView();
      }, t('common.deleting'));
    }
  });

  // Treatment Form Submit
  document.getElementById('form-treatment')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const submitBtn = getFormSubmitButton(form, e);

    const checked = Array.from(document.querySelectorAll('.treatment-hive-checkbox')).filter((el) => el.checked);
    if (checked.length === 0) {
      alert(t('inspections.selectHive'));
      return;
    }

    await withButtonLoading(submitBtn, async () => {
      try {
        const id = document.getElementById('treatment-form-id').value;
        const productId = document.getElementById('treatment-form-product').value;
        const product = getTreatmentProduct(productId);
        const dateStart = document.getElementById('treatment-form-date-start').value;
        const dateEnd = document.getElementById('treatment-form-date-end').value || null;
        const phiDays = product?.phiDays ?? null;
        const treatment = {
          hiveIds: checked.map((c) => c.value),
          dateStart,
          dateEnd,
          disease: product?.disease || 'varroa',
          productId,
          productLabel: product ? getTreatmentProductLabel(product.id) : productId,
          dose: document.getElementById('treatment-form-dose').value || null,
          phiDays,
          harvestBlockedUntil: computeHarvestBlockedUntil(dateStart, dateEnd, phiDays),
          status: document.getElementById('treatment-form-status').value || 'active',
          notes: document.getElementById('treatment-form-notes').value || null
        };
        if (id) treatment.id = id;

        await saveTreatment(treatment);
        trackEvent(id ? 'treatment_updated' : 'treatment_created', {
          hive_count: treatment.hiveIds.length,
          product_id: productId || undefined
        });
        closeModal('modal-treatment');

        if (currentView === 'hive-detail') {
          await renderHiveDetailView();
        } else if (currentView === 'hives') {
          await renderHivesView();
        }
        await renderDashboardView();
      } catch (err) {
        console.error('Fehler beim Speichern der Behandlung:', err);
        alert(t('errors.saveTreatment', { name: err.message || err }));
      }
    });
  });

  document.getElementById('btn-delete-treatment')?.addEventListener('click', async () => {
    const id = document.getElementById('treatment-form-id').value;
    if (id && confirm(t('confirms.deleteTreatment'))) {
      const btn = document.getElementById('btn-delete-treatment');
      await withButtonLoading(btn, async () => {
        await deleteTreatment(id);
        closeModal('modal-treatment');
        if (currentView === 'hive-detail') await renderHiveDetailView();
        else if (currentView === 'hives') await renderHivesView();
        await renderDashboardView();
      }, t('common.deleting'));
    }
  });

  // Product change → suggest end date + PHI hint
  document.getElementById('treatment-form-product')?.addEventListener('change', () => {
    const product = getTreatmentProduct(document.getElementById('treatment-form-product').value);
    const start = document.getElementById('treatment-form-date-start')?.value;
    const endEl = document.getElementById('treatment-form-date-end');
    if (product?.defaultDurationDays && start && endEl && !endEl.value) {
      endEl.value = addDaysToDateStr(start, product.defaultDurationDays - 1) || '';
    }
    updateTreatmentPhiHint();
  });
  document.getElementById('treatment-form-date-start')?.addEventListener('change', updateTreatmentPhiHint);
  document.getElementById('treatment-form-date-end')?.addEventListener('change', updateTreatmentPhiHint);

  // Finance Form Submit (Expenses)
  document.getElementById('form-finance').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const submitBtn = getFormSubmitButton(form, e);
    await withButtonLoading(submitBtn, async () => {
      try {
        const id = document.getElementById('finance-form-id').value;
        const item = {
          date: document.getElementById('finance-form-date').value,
          description: document.getElementById('finance-form-description').value,
          category: financeCategoryStorageValue(document.getElementById('finance-form-category').value),
          price: parseFloat(document.getElementById('finance-form-price').value),
          type: 'expense'
        };

        if (id) item.id = id;

        await saveFinance(item);
        trackEvent(id ? 'expense_updated' : 'expense_created', {
          category: item.category || undefined
        });
        closeModal('modal-finance');

        if (currentView === 'finances') {
          await renderFinanceView();
        } else {
          await navigate('finances');
        }
        await renderDashboardView();
      } catch (err) {
        console.error('Fehler beim Speichern der Ausgabe:', err);
        alert(t('errors.saveFinance', { name: err.message || err }));
      }
    });
  });

  // Finance Delete Button (modal)
  document.getElementById('btn-delete-finance').addEventListener('click', async () => {
    const id = document.getElementById('finance-form-id').value;
    if (id && confirm(t('confirms.deleteFinance'))) {
      const btn = document.getElementById('btn-delete-finance');
      await withButtonLoading(btn, async () => {
        try {
          await deleteFinance(id);
          closeModal('modal-finance');
          if (currentView === 'finances') {
            await renderFinanceView();
          }
          await renderDashboardView();
        } catch (err) {
          console.error('Fehler beim Löschen der Ausgabe:', err);
          alert(t('errors.deleteGeneric', { name: err.message || err }));
        }
      }, t('common.deleting'));
    }
  });

  // Honey Form Submit (Honey Harvests)
  document.getElementById('form-honey').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const submitBtn = getFormSubmitButton(form, e);
    await withButtonLoading(submitBtn, async () => {
      try {
        const id = document.getElementById('honey-form-id').value;
        const harvest = {
          hiveId: document.getElementById('honey-form-hive-id').value,
          date: document.getElementById('honey-form-date').value,
          amount: parseFloat(document.getElementById('honey-form-amount').value),
          type: document.getElementById('honey-form-type').value
        };

        if (id) harvest.id = id;

        await saveHoneyHarvest(harvest);
        trackEvent(id ? 'honey_updated' : 'honey_created', {
          type: harvest.type || undefined
        });
        closeModal('modal-honey');

        if (currentView === 'finances') {
          setFinanceTab('honey');
          await renderFinanceView();
        } else {
          await navigate('finances');
          setFinanceTab('honey');
          await renderFinanceView();
        }
        await renderDashboardView();
      } catch (err) {
        console.error('Fehler beim Speichern der Honigernte:', err);
        alert(t('errors.saveHoney', { name: err.message || err }));
      }
    });
  });

  // Honey Delete Button (modal)
  document.getElementById('btn-delete-honey').addEventListener('click', async () => {
    const id = document.getElementById('honey-form-id').value;
    if (id && confirm(t('confirms.deleteHoneyEntry'))) {
      const btn = document.getElementById('btn-delete-honey');
      await withButtonLoading(btn, async () => {
        try {
          await deleteHoneyHarvest(id);
          closeModal('modal-honey');
          if (currentView === 'finances') {
            currentFinanceTab = 'honey';
            await renderFinanceView();
          }
          await renderDashboardView();
        } catch (err) {
          console.error('Fehler beim Löschen der Honigernte:', err);
          alert(t('errors.deleteGeneric', { name: err.message || err }));
        }
      }, t('common.deleting'));
    }
  });

  // Sponsorship Form Submit
  document.getElementById('form-sponsorship').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const submitBtn = getFormSubmitButton(form, e);
    await withButtonLoading(submitBtn, async () => {
      try {
        const id = document.getElementById('sponsorship-form-id').value;
        const sponsorName = document.getElementById('sponsorship-form-sponsor').value;
        const item = {
          date: document.getElementById('sponsorship-form-date').value,
          description: t('finances.sponsorshipDesc', { name: sponsorName }),
          sponsorName: sponsorName,
          hiveId: document.getElementById('sponsorship-form-hive-id').value,
          price: parseFloat(document.getElementById('sponsorship-form-price').value),
          category: 'sponsorship',
          notes: document.getElementById('sponsorship-form-notes').value,
          type: 'sponsorship'
        };

        if (id) item.id = id;

        await saveFinance(item);
        trackEvent(id ? 'sponsorship_updated' : 'sponsorship_created');
        closeModal('modal-sponsorship');

        if (currentView === 'finances') {
          setFinanceTab('sponsorships');
          await renderFinanceView();
        } else {
          await navigate('finances');
          setFinanceTab('sponsorships');
          await renderFinanceView();
        }
        await renderDashboardView();
      } catch (err) {
        console.error('Fehler beim Speichern der Patenschaft:', err);
        alert(t('errors.saveSponsorship', { name: err.message || err }));
      }
    });
  });

  // Sponsorship Delete Button
  document.getElementById('btn-delete-sponsorship').addEventListener('click', async () => {
    const id = document.getElementById('sponsorship-form-id').value;
    if (id && confirm(t('confirms.deleteSponsorshipEntry'))) {
      const btn = document.getElementById('btn-delete-sponsorship');
      await withButtonLoading(btn, async () => {
        await deleteFinance(id);
        closeModal('modal-sponsorship');
        if (currentView === 'finances') {
          await renderFinanceView();
        }
        await renderDashboardView();
      }, t('common.deleting'));
    }
  });

  // Force window layout refresh on input blur to fix iOS Safari touch target bug
  document.addEventListener('focusout', (e) => {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) {
      window.scrollTo(0, window.scrollY);
    }
  });
}

function formatSyncStatusText() {
  const summary = getLastSyncSummary();
  const prefs = getNetworkPrefs();
  const conn = getConnectionType();
  const parts = [];

  if (!navigator.onLine) {
    parts.push(t('offline.changesLocal'));
  } else if (prefs.fieldMode && isConstrainedConnection()) {
    parts.push(`${t('offline.fieldModeOn')} (${conn || t('header.offline')}).`);
  } else {
    parts.push(conn ? `${t('header.online')} (${conn}).` : t('header.online') + '.');
  }

  parts.push(summary.pending > 0
    ? t('offline.pendingSync', { n: summary.pending })
    : t('offline.allSynced'));

  if (summary.lastPullAt) {
    const when = new Date(summary.lastPullAt).toLocaleString(getLocaleTag(), {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
    parts.push(`${when}`);
  }

  return parts.join(' ');
}

function refreshNetworkSettingsUI() {
  const prefs = getNetworkPrefs();
  const fieldEl = document.getElementById('pref-field-mode');
  const wifiEl = document.getElementById('pref-wifi-only-media');
  const statusEl = document.getElementById('network-sync-status');
  if (fieldEl) fieldEl.checked = !!prefs.fieldMode;
  if (wifiEl) wifiEl.checked = !!prefs.wifiOnlyMedia;
  if (statusEl) statusEl.textContent = formatSyncStatusText();
}

async function renderApiariesSettings() {
  const list = document.getElementById('apiaries-list');
  if (!list) return;
  const apiaries = await getApiaries();
  const canEdit = canEditActiveOp();

  if (apiaries.length === 0) {
    list.innerHTML = `<p class="text-muted" style="font-size: 0.85rem; margin: 0;">Noch keine Bienenstände erfasst.</p>`;
    return;
  }

  list.innerHTML = apiaries.map((a) => `
    <div class="apiary-settings-row" data-id="${escapeHtml(a.id)}" style="display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 10px 12px; background: rgba(255,255,255,0.04); border-radius: 8px; border: 1px solid var(--border-color);">
      <span style="font-weight: 500; font-size: 0.95rem;">${escapeHtml(a.name)}</span>
      ${canEdit ? `<button type="button" class="btn btn-sm btn-danger btn-delete-apiary" data-id="${escapeHtml(a.id)}" style="width: auto; padding: 4px 10px; font-size: 0.75rem;">${escapeHtml(t('common.delete'))}</button>` : ''}
    </div>
  `).join('');

  list.querySelectorAll('.btn-delete-apiary').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      if (!id || !confirm(t('confirms.deleteApiary'))) return;
      await withButtonLoading(btn, async () => {
        await deleteApiary(id);
        await renderApiariesSettings();
        if (currentView === 'hives') await renderHivesView();
      }, '…');
    });
  });
}

// --- Pro / Billing ---
function openProModal(featureLabel = '') {
  const lead = document.getElementById('pro-modal-lead');
  const err = document.getElementById('pro-modal-error');
  if (err) {
    err.style.display = 'none';
    err.textContent = '';
  }
  if (lead) {
    lead.innerHTML = featureLabel
      ? `<strong>${escapeHtml(featureLabel)}</strong> ist Teil von Hively Pro. ` +
        `KI und Cloud-Sync freischalten – <strong>${TRIAL_DAYS} Tage gratis</strong>, danach monatlich oder jährlich.`
      : `Schalte KI (Diktat, Beleg-Scan, Empfehlungen) und Cloud-Sync inkl. Team-Einladungen frei. ` +
        `<strong>${TRIAL_DAYS} Tage gratis</strong>, danach wählbar monatlich oder jährlich.`;
  }
  openModal('modal-pro');
}

function requireProFeature(featureLabel) {
  if (hasProAccess()) return true;
  openProModal(featureLabel);
  trackEvent('pro_upsell_shown', { feature: featureLabel || 'unknown' });
  return false;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** After Checkout success: poll until webhook has set Pro (or give up). */
async function pollBillingAfterCheckout({ attempts = 8, delayMs = 1500 } = {}) {
  if (!isBillingEnabled()) return false;
  for (let i = 0; i < attempts; i++) {
    try {
      if (supabase) await refreshActiveOperationBilling();
    } catch (err) {
      console.warn('Billing refresh failed:', err);
    }
    refreshBillingSettingsUI();
    applyRoleBasedUI();
    if (getActivePlanMeta().hasPro) return true;
    if (i < attempts - 1) await delay(delayMs);
  }
  return getActivePlanMeta().hasPro;
}

let lastBillingResumeRefreshAt = 0;
let billingReturnInFlight = false;

/** Soft refresh when the native app resumes or in-app browser closes. */
async function refreshBillingOnResume() {
  if (!isBillingEnabled() || !supabase || !getActiveOperationId()) return;
  const now = Date.now();
  if (now - lastBillingResumeRefreshAt < 12000) return;
  lastBillingResumeRefreshAt = now;
  try {
    await refreshActiveOperationBilling();
  } catch (err) {
    console.warn('Billing-Refresh nach Resume fehlgeschlagen:', err);
  }
  refreshBillingSettingsUI();
  applyRoleBasedUI();
}

/**
 * After Capacitor Browser closes: if Checkout was pending, run the full
 * success poll (HTTPS return page cannot use custom-scheme as Stripe URL).
 */
async function handleNativeBrowserFinished() {
  const pending = consumeBillingCheckoutPending();
  if (pending === 'checkout') {
    await handleBillingReturn('success', { fromDeepLink: true });
    return;
  }
  if (pending === 'portal') {
    await refreshBillingOnResume();
    if (currentView !== 'settings') await navigate('settings');
    return;
  }
  await refreshBillingOnResume();
}

/**
 * Handle Stripe Checkout return (web query or native deep link).
 * @param {'success' | 'cancel'} result
 * @param {{ fromDeepLink?: boolean }} [options]
 */
async function handleBillingReturn(result, { fromDeepLink = false } = {}) {
  if (result !== 'success' && result !== 'cancel') return;
  if (billingReturnInFlight) return;
  billingReturnInFlight = true;
  clearBillingCheckoutPending();
  try {
    trackEvent('billing_checkout_returned', {
      result,
      surface: fromDeepLink ? 'native' : 'web'
    });

    // Pro-Modal bleibt sonst über dem Return-Flow offen (native Browser-Close).
    closeModal('modal-pro');

    if (result === 'success') {
      let activated = false;
      if (isBillingEnabled()) {
        activated = await pollBillingAfterCheckout();
      } else {
        refreshBillingSettingsUI();
      }
      if (activated) {
        alert(t('billing.welcomePro'));
      } else if (isBillingEnabled()) {
        alert(
          'Willkommen bei Hively Pro! Die Freischaltung kann noch kurz dauern – bitte Einstellungen in einer Minute aktualisieren.'
        );
      }
    }

    if (!fromDeepLink) {
      try {
        const clean = new URL(window.location.href);
        clean.searchParams.delete('billing');
        window.history.replaceState({}, '', clean.pathname + clean.search + clean.hash);
      } catch {
        /* ignore */
      }
    }

    if (result === 'success') {
      await navigate('dashboard');
      // navigate() uses a fresh radar cache that may still say «Teil von Hively Pro».
      try {
        await loadDashboardRadar();
      } catch (err) {
        console.warn('Radar-Refresh nach Pro-Aktivierung fehlgeschlagen:', err);
      }
    } else if (currentView !== 'settings') {
      await navigate('settings');
    } else {
      refreshBillingSettingsUI();
    }
  } finally {
    billingReturnInFlight = false;
  }
}

function refreshBillingSettingsUI() {
  const summary = document.getElementById('billing-plan-summary');
  const openBtn = document.getElementById('btn-open-pro');
  const manageBtn = document.getElementById('btn-manage-billing');
  if (!summary) return;

  if (!isBillingEnabled()) {
    summary.textContent = 'Billing ist in dieser Umgebung nicht aktiviert.';
    if (openBtn) openBtn.style.display = 'none';
    if (manageBtn) manageBtn.style.display = 'none';
    return;
  }

  if (!supabase || !getActiveOperationId()) {
    summary.textContent = 'Login und Betrieb anlegen, um Pro zu starten.';
    if (openBtn) openBtn.style.display = '';
    if (manageBtn) manageBtn.style.display = 'none';
    return;
  }

  const plan = getActivePlanMeta();
  summary.textContent = formatLocalizedBillingSummary(plan);
  if (plan.hasPro) {
    if (openBtn) openBtn.style.display = isOperationOwner() ? 'none' : '';
    if (manageBtn) manageBtn.style.display = isOperationOwner() ? '' : 'none';
  } else {
    if (openBtn) openBtn.style.display = '';
    if (manageBtn) {
      manageBtn.style.display =
        isOperationOwner() && getActiveOperationMeta()?.stripeCustomerId ? '' : 'none';
    }
  }
}

function setupBilling() {
  document.getElementById('btn-open-pro')?.addEventListener('click', () => {
    if (!supabase) {
      alert(t('billing.needsLogin'));
      return;
    }
    if (!getActiveOperationId()) {
      alert(t('billing.needsOperation'));
      openOperationsModal();
      return;
    }
    if (!isOperationOwner()) {
      alert(t('billing.ownerOnly'));
      return;
    }
    openProModal();
  });

  document.getElementById('btn-manage-billing')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-manage-billing');
    await withButtonLoading(btn, async () => {
      try {
        await openBillingPortal();
      } catch (err) {
        alert(err.message || t('billing.manageFailed'));
      }
    }, 'Öffne…');
  });

  document.getElementById('btn-pro-checkout')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-pro-checkout');
    const errEl = document.getElementById('pro-modal-error');
    const selected = document.querySelector('input[name="pro-interval"]:checked');
    const interval = selected?.value === 'month' ? 'month' : 'year';
    if (errEl) {
      errEl.style.display = 'none';
      errEl.textContent = '';
    }
    await withButtonLoading(btn, async () => {
      try {
        trackEvent('billing_checkout_started', { interval });
        await startProCheckout(interval);
      } catch (err) {
        if (errEl) {
          errEl.style.display = 'block';
          errEl.textContent = err.message || 'Checkout fehlgeschlagen.';
        }
      }
    }, 'Weiter zu Stripe…');
  });

  refreshBillingSettingsUI();
}

function setupBugReport() {
  const openBtn = document.getElementById('btn-report-bug');
  const form = document.getElementById('form-bug-report');
  const errorEl = document.getElementById('bug-report-error');
  const successEl = document.getElementById('bug-report-success');
  const messageEl = document.getElementById('bug-report-message');
  const emailEl = document.getElementById('bug-report-email');
  const submitBtn = document.getElementById('btn-bug-report-submit');

  const showError = (text) => {
    if (!errorEl) return;
    errorEl.style.display = text ? 'block' : 'none';
    errorEl.textContent = text || '';
    if (successEl) {
      successEl.style.display = 'none';
      successEl.textContent = '';
    }
  };

  const showSuccess = (text) => {
    if (!successEl) return;
    successEl.style.display = text ? 'block' : 'none';
    successEl.textContent = text || '';
    if (errorEl) {
      errorEl.style.display = 'none';
      errorEl.textContent = '';
    }
  };

  openBtn?.addEventListener('click', () => {
    form?.reset();
    showError('');
    showSuccess('');
    openModal('modal-bug-report');
  });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const prepared = prepareBugReport({
      message: messageEl?.value || '',
      replyEmail: emailEl?.value || '',
      view: currentView
    });
    if (!prepared.ok) {
      showError(prepared.error);
      return;
    }

    await withButtonLoading(submitBtn, async () => {
      trackEvent('bug_report_submitted', prepared.analyticsProps);
      const opened = openMailto(prepared.mailtoUrl);
      if (opened) {
        showSuccess('Mail-Programm geöffnet. Sende die Nachricht ab – danke fürs Melden!');
      } else {
        showError(
          `Mail konnte nicht geöffnet werden. Bitte schreib an ${prepared.mailtoUrl.replace(/^mailto:/, '').split('?')[0]}`
        );
      }
    }, 'Öffne Mail…');
  });
}

function updateLegalLinks() {
  const map = {
    'link-legal-impressum': 'impressum',
    'link-legal-agb': 'agb',
    'link-legal-privacy': 'privacy',
    'link-legal-delete': 'delete-account'
  };
  for (const [id, page] of Object.entries(map)) {
    const el = document.getElementById(id);
    if (el) el.href = legalUrl(page);
  }
}

function setupLocaleControls() {
  const select = document.getElementById('settings-locale');
  if (select) {
    select.value = getLocale();
    select.addEventListener('change', () => {
      setLocale(select.value);
    });
  }
  updateLegalLinks();
  applyDomI18n(document);
}

function setupSettings() {
  const fieldEl = document.getElementById('pref-field-mode');
  const wifiEl = document.getElementById('pref-wifi-only-media');
  const syncBtn = document.getElementById('btn-sync-now');

  if (fieldEl) {
    fieldEl.addEventListener('change', () => {
      saveNetworkPrefs({ fieldMode: fieldEl.checked });
      refreshNetworkSettingsUI();
      updateConnectionStatusUI();
    });
  }
  if (wifiEl) {
    wifiEl.addEventListener('change', () => {
      saveNetworkPrefs({ wifiOnlyMedia: wifiEl.checked });
      refreshNetworkSettingsUI();
    });
  }
  if (syncBtn) {
    syncBtn.addEventListener('click', async () => {
      if (!requireProFeature(t('ai.featureCloudSync'))) return;
      if (!navigator.onLine) {
        alert(t('errors.syncOffline'));
        return;
      }
      await withButtonLoading(syncBtn, async () => {
        try {
          const result = await syncNow();
          if (shouldAutoProcessMedia()) {
            await processOfflineMemosQueue();
          }
          alert(result.pending > 0
            ? t('errors.syncPartial', { n: result.pending })
            : t('errors.syncOk'));
          refreshNetworkSettingsUI();
          updateConnectionStatusUI();
          if (currentView === 'dashboard') await renderDashboardView();
        } catch (err) {
          console.error(err);
          alert(t('errors.syncFailed', { name: err.message || err }));
        } finally {
          refreshNetworkSettingsUI();
        }
      }, 'Synchronisiere…');
    });
  }

  refreshNetworkSettingsUI();

  // Apiaries management
  document.getElementById('btn-add-apiary')?.addEventListener('click', async () => {
    if (!canEditActiveOp()) {
      alert(t('errors.viewerApiary'));
      return;
    }
    const input = document.getElementById('apiary-name-input');
    const name = (input?.value || '').trim();
    if (!name) {
      alert(t('errors.apiaryNameRequired'));
      return;
    }
    const btn = document.getElementById('btn-add-apiary');
    await withButtonLoading(btn, async () => {
      await saveApiary({ name });
      if (input) input.value = '';
      await renderApiariesSettings();
    }, 'Speichern…');
  });

  document.getElementById('btn-reset-local-data')?.addEventListener('click', async () => {
    const confirmed = confirm(t('confirms.clearLocal'));
    if (!confirmed) return;

    const btn = document.getElementById('btn-reset-local-data');
    await withButtonLoading(btn, async () => {
      try {
        await clearOfflineAiDatabase();
      } catch (e) {
        console.warn('Offline-AI IndexedDB konnte nicht vollständig gelöscht werden:', e);
      }
      localStorage.clear();
      try {
        sessionStorage.clear();
      } catch (_) { /* ignore */ }
      alert(t('errors.localDataCleared'));
      location.reload();
    }, t('common.deletingLong'));
  });
}

// --- Bienenbetrieb (Operations) ---

async function promptLoginForInvite(joinCode) {
  let inviteLabel = t('auth.inviteFallbackName');
  try {
    const preview = await previewInvite(joinCode);
    if (preview?.operation_name) {
      inviteLabel = `„${preview.operation_name}“`;
    }
  } catch (err) {
    console.warn('Invite-Vorschau nicht möglich:', err);
  }

  alert(t('auth.inviteLoginAlert', { name: inviteLabel }));
  openModal('modal-auth');
}

async function bootstrapOperationsForSession(session, { joinCode } = {}) {
  if (!session) {
    clearActiveOperation();
    updateOperationChrome();
    applyRoleBasedUI();
    return;
  }

  const pending = joinCode || sessionStorage.getItem('hively_pending_join');
  if (pending) {
    try {
      const joined = await joinWithCode(pending);
      sessionStorage.removeItem('hively_pending_join');
      // Clean join param from URL without reload
      const url = new URL(window.location.href);
      url.searchParams.delete('join');
      window.history.replaceState({}, '', url.pathname + url.search);
      alert(t('errors.joinOk', { name: joined.name }));
    } catch (err) {
      console.warn('Join via code failed:', err);
      alert(t('errors.joinFailed', { name: err.message || err }));
      await ensureActiveOperation();
    }
  } else {
    await ensureActiveOperation();
  }

  // Never clear here — prepareSessionWorkspace owns migrate-then-clear ordering.
  updateOperationChrome();
  applyRoleBasedUI();
}

/**
 * Offer local→cloud migration while entity keys are still intact.
 * @returns {'uploaded'|'declined'|'failed'|'skipped_empty'|'skipped_not_owner'|'skipped_declined_before'}
 */
async function maybeOfferLocalMigration() {
  const hasLocal = hasLocalDomainData();
  if (!hasLocal) return 'skipped_empty';

  const hasDeclinedSync = localStorage.getItem('bee_tracker_sync_declined') === 'true';
  if (hasDeclinedSync) return 'skipped_declined_before';
  if (!isOperationOwner()) return 'skipped_not_owner';

  if (confirm(t('confirms.transferLocal'))) {
    try {
      const ok = await syncLocalToRemote();
      if (!ok) {
        throw new Error('Kein aktiver Betrieb oder Sync nicht möglich.');
      }
      trackEvent('sync_local_to_remote', { ok: true });
      alert(t('errors.syncOk'));
      return 'uploaded';
    } catch (syncErr) {
      console.error('Sync fehlgeschlagen:', syncErr);
      trackEvent('sync_local_to_remote', { ok: false });
      alert(t('errors.syncIncomplete', { name: syncErr.message || syncErr }));
      return 'failed';
    }
  }

  localStorage.setItem('bee_tracker_sync_declined', 'true');
  trackEvent('sync_local_to_remote_declined');
  return 'declined';
}

/** Prevent cold-start + INITIAL_SESSION from double-prompting / clearing after decline. */
let sessionWorkspacePreparedKey = null;
let sessionWorkspaceInFlight = null;

/**
 * Shared session workspace setup: resolve Betrieb → migrate → clear only when safe.
 * Used by cold start and onAuthStateChange (except TOKEN_REFRESHED).
 */
async function prepareSessionWorkspace(session, { joinCode } = {}) {
  const key = session?.user?.id || null;
  if (key && sessionWorkspacePreparedKey === key) {
    await bootstrapOperationsForSession(session, { joinCode });
    return;
  }
  if (sessionWorkspaceInFlight) {
    await sessionWorkspaceInFlight;
    await bootstrapOperationsForSession(session, { joinCode });
    return;
  }

  sessionWorkspaceInFlight = (async () => {
    await bootstrapOperationsForSession(session, { joinCode });
    const outcome = await maybeOfferLocalMigration();

    // Keep local data on decline / prior decline / failure / non-owner.
    // Clear only after successful upload or when there was nothing local to preserve.
    const mayClear = outcome === 'uploaded' || outcome === 'skipped_empty';

    if (mayClear && navigator.onLine && !hasPendingSyncForOperation()) {
      clearLocalEntityCache();
    }

    sessionWorkspacePreparedKey = key;
  })();

  try {
    await sessionWorkspaceInFlight;
  } finally {
    sessionWorkspaceInFlight = null;
  }
}

async function switchToOperation(operation) {
  setActiveOperation(operation, operation.role);
  clearLocalEntityCache();
  updateOperationChrome();
  applyRoleBasedUI();
  closeModal('modal-operations');
  await navigate(currentView === 'hive-detail' ? 'hives' : currentView);
}

function updateOperationChrome() {
  const btn = document.getElementById('btn-operation-switcher');
  if (!btn) return;
  const meta = getActiveOperationMeta();
  if (!supabase || !meta) {
    btn.style.display = 'none';
    return;
  }
  btn.style.display = '';
  btn.textContent = meta.name || 'Betrieb';
  btn.title = `${meta.name} (${roleLabel(meta.role)})`;
}

function applyRoleBasedUI() {
  const owner = isOwnerActiveOp();
  const canEdit = canEditActiveOp();
  const viewer = supabase && getActiveOperationId() && isOperationViewer();

  const financeNav = document.querySelector('nav.bottom-nav .nav-item[data-view="finances"]');
  if (financeNav) {
    financeNav.style.display = owner ? '' : 'none';
  }
  const financeCard = document.getElementById('stat-card-finance');
  if (financeCard) {
    financeCard.style.display = owner ? '' : 'none';
  }

  const quickAdd = document.getElementById('btn-quick-add');
  if (quickAdd) {
    quickAdd.classList.toggle('is-readonly-hidden', !canEdit);
  }
  syncFabLayout();
  const dashInsp = document.getElementById('dash-btn-insp');
  const dashHoney = document.getElementById('dash-btn-honey');
  const dashTreatment = document.getElementById('dash-btn-treatment');
  if (dashInsp) dashInsp.style.display = canEdit ? '' : 'none';
  if (dashHoney) dashHoney.style.display = canEdit ? '' : 'none';
  if (dashTreatment) dashTreatment.style.display = canEdit ? '' : 'none';

  const apiaryAddBtn = document.getElementById('btn-add-apiary');
  const apiaryNameInput = document.getElementById('apiary-name-input');
  if (apiaryAddBtn) apiaryAddBtn.style.display = canEdit ? '' : 'none';
  if (apiaryNameInput) apiaryNameInput.disabled = !canEdit;

  const newInsp = document.getElementById('btn-new-inspection');
  if (newInsp) newInsp.style.display = canEdit ? '' : 'none';

  const viewerBanner = document.getElementById('viewer-readonly-banner');
  if (viewerBanner) {
    viewerBanner.style.display = viewer ? 'block' : 'none';
  }

  // If editor/viewer landed on finances, bounce to dashboard
  if (!owner && currentView === 'finances') {
    navigate('dashboard');
  }
}

async function refreshOperationSettingsUI() {
  const summary = document.getElementById('operation-settings-summary');
  const ownerPanel = document.getElementById('operation-owner-panel');
  if (!summary) return;

  if (!supabase) {
    summary.textContent = 'Lokal-Modus – melde dich an, um Betriebe zu nutzen.';
    if (ownerPanel) ownerPanel.style.display = 'none';
    return;
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    summary.textContent = 'Nicht angemeldet – Login erforderlich für Betriebe.';
    if (ownerPanel) ownerPanel.style.display = 'none';
    return;
  }

  const meta = getActiveOperationMeta();
  if (!meta) {
    summary.textContent = 'Kein aktiver Betrieb.';
    if (ownerPanel) ownerPanel.style.display = 'none';
    return;
  }

  const addr = [meta.addressLine, [meta.postalCode, meta.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  summary.innerHTML = `<strong>${escapeHtml(meta.name)}</strong><br>${escapeHtml(addr || 'Adresse noch nicht hinterlegt')}<br>Rolle: ${escapeHtml(roleLabel(meta.role))}`;

  refreshBillingSettingsUI();

  if (ownerPanel) {
    if (meta.role === 'owner') {
      ownerPanel.style.display = 'block';
      document.getElementById('op-settings-name').value = meta.name || '';
      document.getElementById('op-settings-address').value = meta.addressLine || '';
      document.getElementById('op-settings-zip').value = meta.postalCode || '';
      document.getElementById('op-settings-city').value = meta.city || '';
      await renderOperationMembers(meta.id);
    } else {
      ownerPanel.style.display = 'none';
    }
  }
}

async function renderOperationMembers(operationId) {
  const list = document.getElementById('operation-members-list');
  if (!list) return;
  try {
    const members = await listOperationMembers(operationId);
    list.innerHTML = `
      <h4 style="font-size: 0.85rem; margin-bottom: 8px;">Mitglieder</h4>
      ${members.map((m) => `
        <div style="display:flex; justify-content:space-between; gap:8px; font-size:0.85rem; padding:6px 0; border-bottom:1px solid var(--border-color);">
          <span>${escapeHtml(m.displayName)}${m.email ? ` <span class="text-muted">(${escapeHtml(m.email)})</span>` : ''}</span>
          <span class="text-muted">${escapeHtml(roleLabel(m.role))}</span>
        </div>
      `).join('')}
    `;
  } catch (err) {
    list.innerHTML = `<p class="text-danger" style="font-size:0.85rem;">Mitglieder konnten nicht geladen werden.</p>`;
  }
}

async function openOperationsModal() {
  if (!supabase) {
    alert(t('errors.operationsNeedLogin'));
    return;
  }
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    openModal('modal-auth');
    return;
  }
  await renderOperationsList();
  openModal('modal-operations');
}

async function renderOperationsList() {
  const list = document.getElementById('operations-list');
  if (!list) return;
  list.innerHTML = '<p class="text-secondary" style="font-size:0.85rem;">Lädt…</p>';
  try {
    const ops = await listMyOperations();
    const activeId = getActiveOperationId();
    if (ops.length === 0) {
      list.innerHTML = '<p class="text-secondary" style="font-size:0.85rem;">Noch keine Betriebe.</p>';
      return;
    }
    list.innerHTML = ops.map((op) => `
      <button type="button" class="operation-list-item ${op.id === activeId ? 'is-active' : ''}" data-op-id="${escapeHtml(op.id)}">
        <span>
          <strong style="display:block;">${escapeHtml(op.name)}</strong>
          <span class="text-muted" style="font-size:0.75rem;">${escapeHtml([op.postalCode, op.city].filter(Boolean).join(' ') || 'Ohne Ort')}</span>
        </span>
        <span class="op-role">${escapeHtml(roleLabel(op.role))}</span>
      </button>
    `).join('');

    list.querySelectorAll('[data-op-id]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const op = ops.find((o) => o.id === btn.getAttribute('data-op-id'));
        if (op) await switchToOperation(op);
      });
    });
  } catch (err) {
    list.innerHTML = `<p class="text-danger" style="font-size:0.85rem;">${escapeHtml(err.message || err)}</p>`;
  }
}

function setupOperationsUI() {
  const switcher = document.getElementById('btn-operation-switcher');
  if (switcher) {
    switcher.addEventListener('click', () => openOperationsModal());
  }

  document.getElementById('btn-open-operations')?.addEventListener('click', () => openOperationsModal());
  document.getElementById('btn-join-operation')?.addEventListener('click', () => {
    openModal('modal-operation-join');
  });
  document.getElementById('btn-op-create-open')?.addEventListener('click', () => {
    closeModal('modal-operations');
    openModal('modal-operation-create');
  });
  document.getElementById('btn-op-join-open')?.addEventListener('click', () => {
    closeModal('modal-operations');
    openModal('modal-operation-join');
  });

  document.getElementById('form-operation-create')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.submitter || e.currentTarget.querySelector('button[type="submit"]');
    await withButtonLoading(btn, async () => {
      try {
        const created = await createOperation({
          name: document.getElementById('op-create-name').value,
          addressLine: document.getElementById('op-create-address').value,
          postalCode: document.getElementById('op-create-zip').value,
          city: document.getElementById('op-create-city').value
        });
        clearLocalEntityCache();
        closeModal('modal-operation-create');
        e.currentTarget.reset();
        updateOperationChrome();
        applyRoleBasedUI();
        await navigate('dashboard');
        alert(t('errors.createOpOk', { name: created.name }));
      } catch (err) {
        alert(t('errors.createOpFailed', { name: err.message || err }));
      }
    }, 'Anlegen…');
  });

  document.getElementById('form-operation-join')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.submitter || e.currentTarget.querySelector('button[type="submit"]');
    const code = document.getElementById('op-join-code').value.trim();
    await withButtonLoading(btn, async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          sessionStorage.setItem('hively_pending_join', code);
          closeModal('modal-operation-join');
          openModal('modal-auth');
          return;
        }
        const joined = await joinWithCode(code);
        clearLocalEntityCache();
        closeModal('modal-operation-join');
        e.currentTarget.reset();
        updateOperationChrome();
        applyRoleBasedUI();
        await navigate('dashboard');
        alert(t('errors.joinedShort', { name: joined.name }));
      } catch (err) {
        alert(t('errors.joinFailed', { name: err.message || err }));
      }
    }, 'Beitreten…');
  });

  document.getElementById('btn-save-operation')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-save-operation');
    const opId = getActiveOperationId();
    if (!opId) return;
    await withButtonLoading(btn, async () => {
      try {
        await updateOperation(opId, {
          name: document.getElementById('op-settings-name').value,
          addressLine: document.getElementById('op-settings-address').value,
          postalCode: document.getElementById('op-settings-zip').value,
          city: document.getElementById('op-settings-city').value
        });
        updateOperationChrome();
        await refreshOperationSettingsUI();
        alert(t('errors.saveOpOk'));
      } catch (err) {
        alert(t('errors.saveOpFailed', { name: err.message || err }));
      }
    });
  });

  document.getElementById('btn-create-invite')?.addEventListener('click', async () => {
    if (!requireProFeature(t('ai.featureTeamInvites'))) return;
    const btn = document.getElementById('btn-create-invite');
    const opId = getActiveOperationId();
    const result = document.getElementById('operation-invite-result');
    const roleSelect = document.getElementById('op-invite-role');
    if (!opId) return;
    const inviteRole = roleSelect?.value === 'viewer' ? 'viewer' : 'editor';
    await withButtonLoading(btn, async () => {
      try {
        const invite = await createInvite(opId, { role: inviteRole, daysValid: 30 });
        const link = buildInviteLink(invite.code);
        const roleTxt = roleLabel(invite.role);
        if (result) {
          result.style.display = 'block';
          result.innerHTML = `
            Rolle: <strong>${escapeHtml(roleTxt)}</strong><br>
            Code: <strong>${escapeHtml(invite.code)}</strong><br>
            Link: <span style="word-break:break-all;">${escapeHtml(link)}</span><br>
            <button type="button" class="btn btn-sm btn-secondary" id="btn-copy-invite" style="margin-top:8px; width:auto;">Kopieren</button>
          `;
          document.getElementById('btn-copy-invite')?.addEventListener('click', async () => {
            try {
              await navigator.clipboard.writeText(`${invite.code}\n${link}`);
              alert(t('errors.inviteCopied'));
            } catch {
              prompt('Einladung kopieren:', `${invite.code}\n${link}`);
            }
          });
        }
      } catch (err) {
        alert(t('errors.inviteFailed', { name: err.message || err }));
      }
    }, 'Erzeuge…');
  });
}

// --- Supabase Authentication Setup ---
function setupAuth() {
  if (!supabase) {
    document.getElementById('btn-auth-action').style.display = 'none';
    document.getElementById('user-status').innerText = 'Lokal-Modus';
    return;
  }

  const userStatus = document.getElementById('user-status');
  const btnAuthAction = document.getElementById('btn-auth-action');
  const formAuth = document.getElementById('form-auth');
  const tabLogin = document.getElementById('tab-auth-login');
  const tabRegister = document.getElementById('tab-auth-register');
  const errorMsg = document.getElementById('auth-error-msg');
  const successMsg = document.getElementById('auth-success-msg');
  const modalTitle = document.getElementById('auth-modal-title');
  const submitBtn = document.getElementById('btn-auth-submit');

  // Listen to auth changes
  supabase.auth.onAuthStateChange(async (event, session) => {
    if (session) {
      identifyUser(session.user);
      if (event === 'SIGNED_IN') {
        trackEvent('auth_signed_in');
      }
      userStatus.innerText = session.user.email;
      btnAuthAction.innerText = 'Logout';

      // Token refresh must not wipe entity caches or re-run migration/bootstrap.
      if (event === 'TOKEN_REFRESHED') {
        return;
      }

      try {
        if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
          const pendingJoin = sessionStorage.getItem('hively_pending_join');
          await prepareSessionWorkspace(session, { joinCode: pendingJoin });
        } else {
          await bootstrapOperationsForSession(session, {
            joinCode: sessionStorage.getItem('hively_pending_join')
          });
        }
      } catch (err) {
        console.warn('Betrieb nach Login nicht bereit:', err);
      }

      await navigate(currentView);
      updateOperationChrome();
      applyRoleBasedUI();
    } else {
      if (event === 'SIGNED_OUT') {
        trackEvent('auth_signed_out');
        resetAnalyticsUser();
        sessionWorkspacePreparedKey = null;
        try {
          await clearOfflineAiDatabase();
        } catch (e) {
          console.warn('Offline-AI IndexedDB beim Logout nicht vollständig gelöscht:', e);
        }
        clearCloudSessionData();
      }
      userStatus.innerText = 'Lokal';
      btnAuthAction.innerText = 'Login';
      clearActiveOperation();
      updateOperationChrome();
      applyRoleBasedUI();
      await navigate(currentView);
    }
  });

  // Header button click
  btnAuthAction.addEventListener('click', async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      if (!confirm(t('confirms.logout'))) {
        return;
      }
      const pending = getSyncQueueLength();
      if (pending > 0) {
        if (navigator.onLine && shouldUseBackgroundNetwork()) {
          try {
            await processSyncQueue();
          } catch (e) {
            console.warn('Logout-Sync fehlgeschlagen:', e);
          }
        }
        if (getSyncQueueLength() > 0) {
          if (!confirm(t('confirms.logoutPendingSync', { n: getSyncQueueLength() }))) {
            return;
          }
        }
      }
      localStorage.removeItem('bee_tracker_sync_declined');
      // Clear only after SIGNED_OUT (avoids wipe if signOut fails).
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) {
        alert(t('auth.signOutFailed', { name: signOutError.message || signOutError }));
        return;
      }
      location.reload();
    } else {
      openModal('modal-auth');
    }
  });

  // Modal tabs
  tabLogin.addEventListener('click', () => {
    authMode = 'login';
    tabLogin.className = 'btn btn-sm btn-primary';
    tabRegister.className = 'btn btn-sm btn-secondary';
    modalTitle.innerText = 'Bei Hively anmelden';
    submitBtn.innerText = 'Anmelden';
    errorMsg.style.display = 'none';
    successMsg.style.display = 'none';
  });

  tabRegister.addEventListener('click', () => {
    authMode = 'register';
    tabLogin.className = 'btn btn-sm btn-secondary';
    tabRegister.className = 'btn btn-sm btn-primary';
    modalTitle.innerText = 'Konto erstellen';
    submitBtn.innerText = 'Registrieren';
    errorMsg.style.display = 'none';
    successMsg.style.display = 'none';
  });

  // Auth Form Submit
  formAuth.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorMsg.style.display = 'none';
    successMsg.style.display = 'none';

    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const loadingLabel = authMode === 'login' ? 'Anmelden…' : 'Registrieren…';

    await withButtonLoading(submitBtn, async () => {
      try {
        if (authMode === 'login') {
          const { error } = await supabase.auth.signInWithPassword({ email, password });
          if (error) throw error;
          trackEvent('auth_login_submitted');
          closeModal('modal-auth');
        } else {
          const { error } = await supabase.auth.signUp({ email, password });
          if (error) throw error;
          trackEvent('auth_signup_submitted');
          successMsg.innerText = 'Registrierung erfolgreich! Du kannst dich jetzt anmelden.';
          successMsg.style.display = 'block';
          // Kein Bestätigungsmail mehr – direkt zum Login-Tab wechseln
          authMode = 'login';
          tabLogin.className = 'btn btn-sm btn-primary';
          tabRegister.className = 'btn btn-sm btn-secondary';
          modalTitle.innerText = 'Bei Hively anmelden';
          submitBtn.innerText = 'Anmelden';
        }
      } catch (err) {
        errorMsg.innerText = err.message || 'Ein Fehler ist aufgetreten.';
        errorMsg.style.display = 'block';
      }
    }, loadingLabel);
  });
}

// --- KI Voice Assistant Integration ---
function setupVoiceAssistant() {
  const btnRecord = document.getElementById('btn-voice-record');
  const btnIcon = document.getElementById('voice-btn-icon');
  const btnText = document.getElementById('voice-btn-text');
  const statusBadge = document.getElementById('voice-status-badge');
  const previewDiv = document.getElementById('voice-transcription-preview');
  const errorDiv = document.getElementById('voice-assistant-error');

  if (!btnRecord) return;

  let currentStatus = 'idle'; // 'idle', 'listening', 'processing'

  btnRecord.addEventListener('click', async () => {
    errorDiv.style.display = 'none';

    if (currentStatus === 'listening') {
      btnRecord.disabled = true; // Prevent double click during transition
      const audioBlob = await stopAudioRecording();
      btnRecord.disabled = false;
      
      if (audioBlob) {
        await handleAudioProcessing(audioBlob);
      }
      return;
    }

    if (!requireProFeature(t('ai.featureVoice'))) return;

    previewDiv.innerText = 'Aufnahme läuft... Mundart sprechen erlaubt!';
    previewDiv.style.display = 'block';

    btnRecord.disabled = true;
    try {
      await startAudioRecording({
        onError: (err) => {
          errorDiv.innerText = err;
          errorDiv.style.display = 'block';
          resetUI();
        },
        onStatusChange: (status) => {
          currentStatus = status;
          updateUIForStatus(status);
        }
      });
    } finally {
      btnRecord.disabled = false;
    }
  });

  function resetUI() {
    currentStatus = 'idle';
    btnIcon.innerText = '';
    btnText.innerText = 'Diktieren starten';
    statusBadge.innerText = 'Bereit';
    statusBadge.style.background = 'rgba(255,255,255,0.1)';
    statusBadge.style.color = 'var(--text)';
    btnRecord.classList.remove('btn-danger');
    btnRecord.classList.add('btn-secondary');
    statusBadge.classList.remove('voice-badge-listening');
  }

  function updateUIForStatus(status) {
    if (status === 'listening') {
      btnIcon.innerText = '';
      btnText.innerText = 'Diktieren stoppen';
      statusBadge.innerText = 'Aufnahme...';
      statusBadge.style.background = '#ef4444';
      statusBadge.style.color = '#fff';
      btnRecord.classList.remove('btn-secondary');
      btnRecord.classList.add('btn-danger');
      statusBadge.classList.add('voice-badge-listening');
    } else if (status === 'processing') {
      btnIcon.innerText = '';
      btnText.innerText = 'KI analysiert…';
      statusBadge.innerText = t('ai.receiptAnalyzing');
      statusBadge.style.background = 'var(--primary)';
      statusBadge.style.color = '#000';
      statusBadge.classList.remove('voice-badge-listening');
    } else {
      resetUI();
    }
  }

  async function queueVoiceMemoLocally(audioBlob, message) {
    updateUIForStatus('idle');
    previewDiv.style.display = 'none';
    try {
      const base64 = await blobToBase64(audioBlob);
      await saveOfflineMemo('voice', base64, audioBlob.type || 'audio/webm');
      alert(message);
      await renderOfflineMemos();
    } catch (err) {
      console.error(err);
      alert(t('errors.voiceSaveFailed'));
    }
  }

  async function handleAudioProcessing(audioBlob) {
    // Weak / offline links: never burn mobile data on large audio uploads
    if (!shouldAutoProcessMedia()) {
      const msg = !navigator.onLine
        ? t('ai.voiceOfflineSaved')
        : t('ai.voiceOfflineSaved');
      await queueVoiceMemoLocally(audioBlob, msg);
      return;
    }

    updateUIForStatus('processing');
    try {
      const data = await parseAudioWithGemini(audioBlob);
      trackEvent('ai_voice_parsed', { ok: true });
      if (!data) throw new Error('Ungültige Antwort der KI.');

      // Match Hive Names
      if (data.hiveNames && Array.isArray(data.hiveNames)) {
        const hives = await getHives();
        const chkContainer = document.getElementById('insp-form-hives-container');
        const checkboxes = chkContainer.querySelectorAll('.hive-checkbox');
        checkboxes.forEach((chk) => {
          chk.checked = false;
        });

        for (const matchedHive of matchHivesByNames(hives, data.hiveNames)) {
          const chk = document.getElementById(`hive-chk-${matchedHive.id}`);
          if (chk) {
            chk.checked = true;
            highlightLabel(chk.parentElement);
          }
        }
      }

      // Populate Notes
      if (data.notes) {
        const input = document.getElementById('insp-form-notes');
        input.value = data.notes;
        highlightField('insp-form-notes');
      }

      statusBadge.innerText = 'Eingetragen!';
      statusBadge.style.background = '#10b981';
      statusBadge.style.color = '#fff';

      setTimeout(() => {
        resetUI();
        previewDiv.style.display = 'none';
      }, 3000);

    } catch (err) {
      console.error(err);
      // Network/API failure: keep the recording locally instead of losing it
      try {
        const base64 = await blobToBase64(audioBlob);
        await saveOfflineMemo('voice', base64, audioBlob.type || 'audio/webm');
        errorDiv.innerText = 'Analyse fehlgeschlagen – Diktat lokal gespeichert und später erneut verarbeitbar.';
        errorDiv.style.display = 'block';
        await renderOfflineMemos();
        resetUI();
        previewDiv.style.display = 'none';
      } catch (saveErr) {
        console.error(saveErr);
        errorDiv.innerText = formatGeminiError(err, 'Fehler bei der KI-Verarbeitung.');
        errorDiv.style.display = 'block';
        resetUI();
      }
    }
  }
}

// Global UI helper to highlight updated input fields
function highlightField(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.transition = 'all 0.3s ease';
  el.style.boxShadow = '0 0 10px var(--primary)';
  el.style.borderColor = 'var(--primary)';
  setTimeout(() => {
    el.style.boxShadow = 'none';
    el.style.borderColor = '';
  }, 2000);
}

function highlightLabel(label) {
  if (!label) return;
  label.style.transition = 'all 0.3s ease';
  label.style.backgroundColor = 'rgba(242, 180, 46, 0.2)'; // semi-transparent primary color
  label.style.borderRadius = '6px';
  setTimeout(() => {
    label.style.backgroundColor = '';
  }, 2000);
}

// --- KI Beleg-Scanner Integration ---
function setupReceiptScanner() {
  const btnScan = document.getElementById('btn-receipt-scan');
  const fileInput = document.getElementById('input-receipt-file');
  const statusBadge = document.getElementById('receipt-status-badge');
  const errorDiv = document.getElementById('receipt-scanner-error');
  const btnIcon = document.getElementById('receipt-btn-icon');
  const btnText = document.getElementById('receipt-btn-text');

  if (!btnScan || !fileInput) return;

  btnScan.addEventListener('click', () => {
    errorDiv.style.display = 'none';
    if (!requireProFeature(t('ai.featureReceipt'))) return;
    fileInput.click();
  });

  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!shouldAutoProcessMedia()) {
      try {
        const base64 = await blobToBase64(file);
        await saveOfflineMemo('receipt', base64, file.type || 'image/jpeg');
        alert(!navigator.onLine
          ? t('ai.receiptOfflineSaved')
          : t('ai.receiptOfflineSaved'));
        await renderOfflineMemos();
      } catch (err) {
        console.error(err);
        alert(t('errors.receiptSaveFailed'));
      } finally {
        fileInput.value = '';
      }
      return;
    }

    updateUI('processing');
    errorDiv.style.display = 'none';

    try {
      const data = await parseReceiptWithGemini(file);
      trackEvent('ai_receipt_parsed', { ok: true });
      if (!data) throw new Error(t('ai.noReceiptData'));

      // Populate form fields
      if (data.date) {
        document.getElementById('finance-form-date').value = data.date;
        highlightField('finance-form-date');
      }
      if (data.description) {
        document.getElementById('finance-form-description').value = data.description;
        highlightField('finance-form-description');
      }
      {
        const catSelect = document.getElementById('finance-form-category');
        const rawCat = data.categoryId || data.category;
        if (rawCat && catSelect) {
          catSelect.value = financeCategorySelectValue(rawCat);
          highlightField('finance-form-category');
        }
      }
      if (data.price !== undefined && data.price !== null) {
        document.getElementById('finance-form-price').value = parseFloat(data.price).toFixed(2);
        highlightField('finance-form-price');
      }

      statusBadge.innerText = t('ai.receiptCaptured');
      statusBadge.style.background = '#10b981';
      statusBadge.style.color = '#fff';

      setTimeout(() => {
        updateUI('idle');
      }, 3000);

    } catch (err) {
      console.error(err);
      try {
        const base64 = await blobToBase64(file);
        await saveOfflineMemo('receipt', base64, file.type || 'image/jpeg');
        errorDiv.innerText = t('ai.receiptOfflineFallback');
        errorDiv.style.display = 'block';
        await renderOfflineMemos();
      } catch (saveErr) {
        console.error(saveErr);
        errorDiv.innerText = formatGeminiError(err, t('ai.receiptError'));
        errorDiv.style.display = 'block';
      }
      updateUI('idle');
    } finally {
      fileInput.value = '';
    }
  });

  function updateUI(status) {
    if (status === 'processing') {
      btnScan.disabled = true;
      btnIcon.innerText = '';
      btnText.innerText = t('ai.receiptBtnProcessing');
      statusBadge.innerText = t('ai.receiptAnalyzing');
      statusBadge.style.background = 'var(--primary)';
      statusBadge.style.color = '#000';
    } else {
      btnScan.disabled = false;
      btnIcon.innerText = '';
      btnText.innerText = t('ai.receiptUpload');
      statusBadge.innerText = 'Bereit';
      statusBadge.style.background = 'rgba(255,255,255,0.1)';
      statusBadge.style.color = 'var(--text-primary)';
    }
  }
}

function formatGeminiError(err, defaultMessage) {
  const errMsg = err.message || err.toString() || '';
  if (
    errMsg.toLowerCase().includes('hively pro') ||
    errMsg.toLowerCase().includes('pro erforderlich') ||
    errMsg.includes('402')
  ) {
    return 'Diese KI-Funktion gehört zu Hively Pro. Du kannst Pro in den Einstellungen aktivieren.';
  }
  if (errMsg.includes('429') || errMsg.toLowerCase().includes('quota') || errMsg.toLowerCase().includes('limit')) {
    return 'Die Anfragegrenze der künstlichen Intelligenz wurde vorübergehend überschritten. Bitte warte ca. 10 Sekunden und versuche es erneut.';
  }
  if (errMsg.includes('403') || errMsg.includes('400') || errMsg.toLowerCase().includes('api key') || errMsg.toLowerCase().includes('key not valid')) {
    return 'Der KI-API-Schlüssel ist ungültig oder abgelaufen. Bitte überprüfe deine Einstellungen oder deinen Schlüssel.';
  }
  if (errMsg.toLowerCase().includes('fetch') || errMsg.toLowerCase().includes('network') || errMsg.toLowerCase().includes('failed to fetch')) {
    return 'Netzwerkfehler: Keine Verbindung zur künstlichen Intelligenz möglich. Bitte überprüfe deine Internetverbindung.';
  }
  return defaultMessage || 'Ein unerwarteter Fehler ist bei der KI-Analyse aufgetreten. Bitte versuche es erneut.';
}

function setupConnectionTracking() {
  updateConnectionStatusUI();

  window.addEventListener('online', async () => {
    updateConnectionStatusUI();
    console.log('[Connection] Online – prüfe Sync...');
    try {
      // Outbox flush for all sessions (RLS/Pro gates enforce server-side).
      // Align with initial sync — do not require client hasProAccess().
      if (shouldUseBackgroundNetwork()) {
        await processSyncQueue();
      }
      if (shouldAutoProcessMedia() && hasProAccess()) {
        await processOfflineMemosQueue();
      }
    } catch (e) {
      console.error('[Connection] Error auto-syncing:', e);
    }
    updateConnectionStatusUI();
    refreshNetworkSettingsUI();

    if (currentView === 'dashboard') {
      await renderDashboardView();
    }
  });

  window.addEventListener('offline', () => {
    updateConnectionStatusUI();
    refreshNetworkSettingsUI();
    console.log('[Connection] Offline.');
    if (currentView === 'dashboard') {
      renderOfflineMemos();
    }
  });

  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (conn && typeof conn.addEventListener === 'function') {
    conn.addEventListener('change', () => {
      updateConnectionStatusUI();
      refreshNetworkSettingsUI();
    });
  }

  // Initial sync only when the link looks usable
  if (navigator.onLine && shouldUseBackgroundNetwork()) {
    processSyncQueue().then(async () => {
      updateConnectionStatusUI();
      if (shouldAutoProcessMedia()) {
        await processOfflineMemosQueue();
      }
      if (currentView === 'dashboard') {
        await renderDashboardView();
      }
    }).catch((e) => console.error('[Connection] Initial sync failed:', e));
  }
}

function updateConnectionStatusUI() {
  const statusEl = document.getElementById('connection-status');
  if (!statusEl) return;

  const pendingCount = getSyncQueueLength();
  const prefs = getNetworkPrefs();

  statusEl.classList.remove('is-online', 'is-offline', 'is-pending', 'is-field');
  statusEl.innerText = '';

  if (!navigator.onLine) {
    statusEl.classList.add('is-offline');
    statusEl.title = t('offline.changesLocal');
    statusEl.setAttribute('aria-label', t('header.offline'));
    return;
  }

  if (prefs.fieldMode && isConstrainedConnection()) {
    statusEl.classList.add('is-field');
    statusEl.title = pendingCount > 0
      ? `Funkloch-Modus – ${pendingCount} Änderungen lokal wartend`
      : `Funkloch-Modus (${getConnectionType() || 'schwaches Netz'}) – lokale Daten`;
    statusEl.setAttribute('aria-label', 'Funkloch-Modus');
    return;
  }

  if (pendingCount > 0) {
    statusEl.classList.add('is-pending');
    statusEl.title = `Online – ${pendingCount} Änderungen ausstehend`;
    statusEl.setAttribute('aria-label', 'Sync ausstehend');
  } else {
    statusEl.classList.add('is-online');
    statusEl.title = 'Online – synchronisiert';
    statusEl.setAttribute('aria-label', 'Online');
  }
}

async function renderOfflineMemos() {
  const container = document.getElementById('dashboard-offline-memos');
  const list = document.getElementById('offline-memos-list');
  if (!container || !list) return;

  const memos = await getOfflineMemos();
  if (memos.length === 0) {
    container.style.display = 'none';
    return;
  }

  container.style.display = 'block';
  list.innerHTML = memos.map(memo => {
    const dateStr = new Date(memo.timestamp).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    const stamped = `${formatDateString(new Date(memo.timestamp).toISOString())} um ${dateStr}`;
    const typeLabel = memo.type === 'voice' ? 'Diktat' : 'Beleg-Scan';
    const detailText =
      memo.type === 'voice' ? `Sprachmemo vom ${stamped}` : `Beleg hochgeladen am ${stamped}`;

    let actionLabel = 'Wartet auf Netz';
    if (shouldAutoProcessMedia()) actionLabel = 'Verarbeiten';
    else if (navigator.onLine) actionLabel = 'Wartet auf WLAN';

    return `
      <div class="card" style="padding: 10px; margin-bottom: 0; display: flex; justify-content: space-between; align-items: center; gap: 10px; background: rgba(0,0,0,0.15);">
        <div style="min-width: 0;">
          <div style="font-weight: 600; font-size: 0.9rem;">${typeLabel}</div>
          <div class="text-secondary" style="font-size: 0.8rem; margin-top: 2px;">${detailText}</div>
        </div>
        <div style="display: flex; flex-shrink: 0; gap: 6px; align-items: center;">
          <button type="button" class="btn btn-sm btn-primary btn-process-offline-memo" data-id="${escapeHtml(memo.id)}" style="width: auto; padding: 4px 10px; min-height: 28px; font-size: 0.75rem;">
            ${actionLabel}
          </button>
          <button type="button" class="btn btn-sm btn-danger btn-discard-offline-memo" data-id="${escapeHtml(memo.id)}" data-type="${escapeHtml(memo.type || 'voice')}" style="width: auto; padding: 4px 10px; min-height: 28px; font-size: 0.75rem;">
            Verwerfen
          </button>
        </div>
      </div>
    `;
  }).join('');

  document.querySelectorAll('.btn-process-offline-memo').forEach(btn => {
    // Manual process allowed whenever online (user explicitly taps)
    btn.disabled = !navigator.onLine;
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      if (!id) return;
      setOfflineMemoRowBusy(id, true, { processLabel: 'Verarbeite...' });
      try {
        await processSingleOfflineMemo(id);
        await renderOfflineMemos();
        await renderDashboardView();
      } catch (err) {
        setOfflineMemoRowBusy(id, false, { processLabel: 'Wiederholen' });
        // Discard during processing is expected — no alert.
        if (/verworfen/i.test(String(err?.message || ''))) {
          await renderOfflineMemos();
          return;
        }
        alert(t('errors.processFailed', { name: err.message }));
      }
    });
  });

  document.querySelectorAll('.btn-discard-offline-memo').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      const type = btn.getAttribute('data-type') || 'voice';
      if (!id) return;
      const confirmMsg =
        type === 'receipt'
          ? t('offline.memoConfirmDiscard')
          : t('offline.memoConfirmDiscard');
      if (!confirm(confirmMsg)) return;
      setOfflineMemoRowBusy(id, true);
      try {
        await deleteOfflineMemo(id);
        trackEvent('offline_memo_discarded', { type });
        await renderOfflineMemos();
      } catch (err) {
        setOfflineMemoRowBusy(id, false);
        alert(t('errors.discardFailed', { name: err?.message || err }));
      }
    });
  });
}

/** Disable process + discard for one offline memo row while an action runs. */
function setOfflineMemoRowBusy(id, busy, { processLabel } = {}) {
  document.querySelectorAll('.btn-process-offline-memo, .btn-discard-offline-memo').forEach((btn) => {
    if (btn.getAttribute('data-id') !== id) return;
    btn.disabled = busy || (btn.classList.contains('btn-process-offline-memo') && !navigator.onLine);
    if (processLabel && btn.classList.contains('btn-process-offline-memo')) {
      btn.innerText = processLabel;
    }
  });
}

async function assertOfflineMemoStillExists(id) {
  const memos = await getOfflineMemos();
  if (!memos.some((m) => m.id === id)) {
    throw new Error('Offline-Eintrag wurde verworfen.');
  }
}

async function processSingleOfflineMemo(id) {
  const memos = await getOfflineMemos();
  const memo = memos.find(m => m.id === id);
  if (!memo) return;

  const blob = base64ToBlob(memo.mediaData, memo.mediaType);

  if (memo.type === 'voice') {
    // 1. Process voice audio with Gemini
    const data = await parseAudioWithGemini(blob);
    if (!data) throw new Error('Keine Antwort von Gemini erhalten.');

    // 2. Determine target hive IDs
    const hives = await getHives();
    const targetHiveIds = matchHivesByNames(hives, data.hiveNames).map((h) => h.id);

    if (targetHiveIds.length === 0) {
      throw new Error('Es konnte kein passendes Volk für das Diktat gefunden werden.');
    }

    // Abort if the user discarded the memo while Gemini was running.
    await assertOfflineMemoStillExists(id);

    // 3. Create inspections
    const date = new Date(memo.timestamp).toISOString().split('T')[0];
    for (const hiveId of targetHiveIds) {
      const inspection = {
        hiveId: hiveId,
        date: date,
        broodStatus: '',
        honeySuper: '',
        temperament: 5,
        notes: data.notes || t('inspections.offlineMemoNotes')
      };
      await saveInspection(inspection);
    }

  } else if (memo.type === 'receipt') {
    // 1. Process receipt file with Gemini
    const file = new File([blob], 'offline_receipt.jpg', { type: memo.mediaType });
    const data = await parseReceiptWithGemini(file);
    if (!data) throw new Error('Keine Beleg-Daten von Gemini erkannt.');

    await assertOfflineMemoStillExists(id);

    // 2. Save finance item
    const finance = {
      date: data.date || new Date(memo.timestamp).toISOString().split('T')[0],
      description: data.description || t('finances.offlineReceipt'),
      category: financeCategoryStorageValue(data.categoryId || data.category || 'other'),
      price: parseFloat(data.price || 0),
      type: 'expense'
    };
    await saveFinance(finance);
  }

  // 4. Delete memo from IndexedDB on success (no-op if already discarded)
  const stillThere = (await getOfflineMemos()).some((m) => m.id === id);
  if (stillThere) await deleteOfflineMemo(id);
}

async function processOfflineMemosQueue() {
  if (!shouldAutoProcessMedia()) return;
  const memos = await getOfflineMemos();
  for (const memo of memos) {
    try {
      await processSingleOfflineMemo(memo.id);
    } catch (err) {
      console.error('Error auto-processing offline memo:', err);
    }
  }
}
