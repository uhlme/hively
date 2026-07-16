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
  exportData,
  importData,
  seedDemoData,
  syncLocalToRemote,
  getTasksState,
  saveTaskState,
  processSyncQueue,
  getSyncQueueLength
} from './storage.js';
import { supabase } from './supabase.js';
import { startAudioRecording, stopAudioRecording, parseAudioWithGemini } from './voiceAssistant.js';
import { parseReceiptWithGemini } from './receiptScanner.js';
import { fetchCurrentWeather, fetchDashboardWeatherAndPollen, getCachedLocation } from './weather.js';
import { getWeatherInsightFromGemini } from './aiHelper.js';
import { saveOfflineMemo, getOfflineMemos, deleteOfflineMemo, blobToBase64, base64ToBlob } from './offlineAI.js';
import { CALENDAR_TASKS, CALENDAR_MONTH_NAMES } from './calendarTasks.js';
import { escapeHtml, statusToCssClass } from './utils.js';

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

function getQueenColorClass(year) {
  const lastDigit = year ? year.toString().slice(-1) : '';
  const color = QUEEN_COLORS[lastDigit] || 'white';
  return `queen-${color}`;
}

function getQueenColorName(year) {
  const lastDigit = year ? year.toString().slice(-1) : '';
  const color = QUEEN_COLORS[lastDigit] || 'white';
  const names = {
    white: 'Weiß',
    yellow: 'Gelb',
    red: 'Rot',
    green: 'Grün',
    blue: 'Blau'
  };
  return names[color] || 'Weiß';
}

function formatDateString(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return isoString;
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
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
  try {
    await initStorage();
  } catch (err) {
    console.error('Storage-Initialisierung fehlgeschlagen:', err);
  }
  setupRouting();
  setupModals();
  setupForms();
  setupSettings();
  setupAuth();
  setupVoiceAssistant();
  setupReceiptScanner();
  setupConnectionTracking();

  // Pin #app to the real visible viewport height. Works in BOTH Safari (tracks the
  // dynamic URL bar) and standalone PWA (full height), unlike 100vh/100dvh which
  // each break in one of the two environments.
  bindAppHeight();

  // Initial render
  const urlParams = new URLSearchParams(window.location.search);
  const viewParam = urlParams.get('view');
  if (viewParam && ['dashboard', 'hives', 'hive-detail', 'finances', 'settings', 'calendar'].includes(viewParam)) {
    currentView = viewParam;
  }
  await navigate(currentView);
});

// --- Routing / View Swapping ---
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

  // Back button on detail view
  document.getElementById('btn-back-to-hives').addEventListener('click', async () => {
    await navigate('hives');
  });

  // View specific quick actions
  document.getElementById('dash-btn-insp').addEventListener('click', () => {
    openInspectionModal();
  });
  document.getElementById('dash-btn-honey').addEventListener('click', () => {
    openHoneyModal();
  });
  document.getElementById('btn-new-inspection').addEventListener('click', () => {
    openInspectionModal(null, activeHiveIdForDetail);
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
    tabExpenses.classList.add('active');
    tabHoney.classList.remove('active');
    tabSponsorships.classList.remove('active');
    currentFinanceTab = 'expenses';
    await renderFinanceView();
  });

  tabHoney.addEventListener('click', async () => {
    tabHoney.classList.add('active');
    tabExpenses.classList.remove('active');
    tabSponsorships.classList.remove('active');
    currentFinanceTab = 'honey';
    await renderFinanceView();
  });

  tabSponsorships.addEventListener('click', async () => {
    tabSponsorships.classList.add('active');
    tabExpenses.classList.remove('active');
    tabHoney.classList.remove('active');
    currentFinanceTab = 'sponsorships';
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

async function navigate(viewName) {
  currentView = viewName;

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

  // Header button sync
  const quickAddBtn = document.getElementById('btn-quick-add');
  if (viewName === 'hives') {
    quickAddBtn.classList.remove('hidden');
    quickAddBtn.innerText = '+ Volk';
  } else if (viewName === 'finances') {
    quickAddBtn.classList.remove('hidden');
    if (currentFinanceTab === 'expenses') {
      quickAddBtn.innerText = '+ Kauf';
    } else if (currentFinanceTab === 'honey') {
      quickAddBtn.innerText = '+ Ernte';
    } else {
      quickAddBtn.innerText = '+ Paten.';
    }
  } else {
    quickAddBtn.classList.add('hidden');
  }

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
  }
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
    financeSumEl.innerHTML = `<span style="font-size: 0.85rem; font-weight: 500; color: var(--text-secondary); margin-right: 2px;">CHF</span>${escapeHtml(balance.toFixed(2))}`;
    if (balance >= 0) {
      financeSumEl.style.color = 'var(--success)';
    } else {
      financeSumEl.style.color = 'var(--danger)';
    }
  }

  // Recent activities list (Inspections & Harvests merged, newest first)
  const inspections = await getInspections();
  const activities = [];

  inspections.forEach(i => {
    const hive = hives.find(h => h.id === i.hiveId);
    activities.push({
      date: i.date || i.createdAt,
      type: 'inspection',
      hiveName: hive ? hive.name : 'Unbekanntes Volk',
      details: i.notes || 'Durchsicht protokolliert.',
      tag: '📝 Durchsicht',
      raw: i
    });
  });

  honey.forEach(h => {
    const hive = hives.find(hive => hive.id === h.hiveId);
    activities.push({
      date: h.date || h.createdAt,
      type: 'honey',
      hiveName: hive ? hive.name : 'Unbekanntes Volk',
      details: `${h.amount} kg geerntet (${h.type || 'Blüte'})`,
      tag: '🍯 Honigernte',
      raw: h
    });
  });

  // Sort activities by date desc
  activities.sort((a, b) => new Date(b.date) - new Date(a.date));

  const recentList = document.getElementById('dashboard-recent-activities');
  if (activities.length === 0) {
    recentList.innerHTML = `<p class="text-muted text-center" style="padding: 20px;">Keine Aktivitäten vorhanden.</p>`;
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

    // Attach click handlers to open edit modals
    document.querySelectorAll('.recent-activity-card').forEach(card => {
      const openActivity = () => {
        const idx = parseInt(card.getAttribute('data-index'));
        const act = activities[idx];
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
  const elEmoji = document.getElementById('radar-weather-emoji');
  const elInsight = document.getElementById('radar-insight');

  if (!radarContent) return;

  // Bind click handlers (safely overwrite)
  if (btnSetup) {
    btnSetup.onclick = async () => {
      setupPrompt.style.display = 'none';
      radarLoading.style.display = 'block';
      radarLoading.innerText = 'Standort ermitteln... ⏳';
      try {
        const weatherData = await fetchDashboardWeatherAndPollen(true);
        const insight = await getWeatherInsightFromGemini(weatherData);
        const data = {
          ...weatherData,
          insight: insight,
          timestamp: Date.now()
        };
        sessionStorage.setItem('bienen_radar_cache', JSON.stringify(data));
        applyRadarData(data);
      } catch (err) {
        radarLoading.innerText = 'Standort-Fehler ❌';
        setTimeout(() => {
          radarLoading.style.display = 'none';
          setupPrompt.style.display = 'flex';
        }, 3000);
      }
    };
  }

  if (btnLocate) {
    btnLocate.onclick = async (e) => {
      e.stopPropagation();
      btnLocate.style.display = 'none';
      radarLoading.style.display = 'block';
      radarLoading.innerText = 'Ortung... ⏳';
      radarContent.style.opacity = '0.5';
      try {
        const weatherData = await fetchDashboardWeatherAndPollen(true);
        const insight = await getWeatherInsightFromGemini(weatherData);
        const data = {
          ...weatherData,
          insight: insight,
          timestamp: Date.now()
        };
        sessionStorage.setItem('bienen_radar_cache', JSON.stringify(data));
        radarContent.style.opacity = '1';
        applyRadarData(data);
      } catch (err) {
        radarLoading.innerText = 'Fehler ❌';
        radarContent.style.opacity = '1';
        setTimeout(() => {
          radarLoading.style.display = 'none';
          btnLocate.style.display = 'block';
        }, 3000);
      }
    };
  }

  // Check if we have cached coordinates
  const cachedLoc = getCachedLocation();
  if (!cachedLoc) {
    // Show location request card
    radarContent.style.display = 'none';
    radarLoading.style.display = 'none';
    if (btnLocate) btnLocate.style.display = 'none';
    if (setupPrompt) setupPrompt.style.display = 'flex';
    return;
  }

  // Hide setup card, show loading/content
  if (setupPrompt) setupPrompt.style.display = 'none';
  if (btnLocate) btnLocate.style.display = 'block';

  const cached = sessionStorage.getItem('bienen_radar_cache');
  if (cached) {
    try {
      const data = JSON.parse(cached);
      if (Date.now() - data.timestamp < 2 * 60 * 60 * 1000) {
        applyRadarData(data);
        return;
      }
    } catch (e) {}
  }

  radarContent.style.display = 'none';
  radarLoading.style.display = 'block';
  radarLoading.innerText = 'Lädt... ⏳';

  try {
    const weatherData = await fetchDashboardWeatherAndPollen(false);
    const insight = await getWeatherInsightFromGemini(weatherData);
    
    const data = {
      ...weatherData,
      insight: insight,
      timestamp: Date.now()
    };
    
    sessionStorage.setItem('bienen_radar_cache', JSON.stringify(data));
    applyRadarData(data);
  } catch (err) {
    radarLoading.innerText = 'Radar offline';
    radarLoading.style.color = 'var(--danger)';
  }

  function applyRadarData(data) {
    radarLoading.style.display = 'none';
    if (btnLocate) btnLocate.style.display = 'block';
    radarContent.style.display = 'flex';
    
    elTemp.innerText = data.temperature;
    elCond.innerText = data.conditionText;
    elEmoji.innerText = data.conditionEmoji;
    elWind.innerText = data.windSpeed;
    elPollen.innerText = data.dominantPollen ? `${data.dominantPollen.name} (${data.dominantPollen.value})` : 'Keine';
    elInsight.innerText = data.insight;
  }
}

function formatGuideHtml(guide) {
  return escapeHtml(guide).replace(/\n/g, '<br>');
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

  if (tasksForMonth.length === 0) {
    container.innerHTML = `<p class="text-muted text-center">Keine Aufgaben für diesen Monat hinterlegt.</p>`;
    return;
  }

  const monthName = CALENDAR_MONTH_NAMES[parseInt(selectedMonth, 10) - 1];
  const doneCount = tasksForMonth.filter((task, index) => isTaskDone(monthState, task, index)).length;

  let html = `
    <div class="calendar-month-header">
      <h3>📌 Imker-Aufgaben im ${escapeHtml(monthName)}</h3>
      <p class="text-secondary calendar-month-progress">${doneCount} von ${tasksForMonth.length} erledigt · Tippe auf einen Schritt für die Anleitung</p>
    </div>
    <div class="calendar-task-list">
  `;

  tasksForMonth.forEach((task, index) => {
    const done = isTaskDone(monthState, task, index);
    const checked = done ? 'checked' : '';
    html += `
      <article class="calendar-task ${done ? 'is-done' : ''}" data-task-id="${escapeHtml(task.id)}">
        <div class="calendar-task-main">
          <label class="calendar-task-check">
            <input type="checkbox" class="task-checkbox" data-month="${escapeHtml(selectedMonth)}" data-task-id="${escapeHtml(task.id)}" data-task-index="${index}" ${checked} />
            <span class="calendar-task-title">${escapeHtml(task.title)}</span>
          </label>
          <button type="button" class="calendar-task-toggle" aria-expanded="false" aria-controls="guide-${escapeHtml(task.id)}" data-guide-toggle="${escapeHtml(task.id)}">
            Anleitung
          </button>
        </div>
        <div class="calendar-task-meta">
          <span class="calendar-task-date" title="Richttermin">🗓 ${escapeHtml(task.approxDate)}</span>
        </div>
        <div id="guide-${escapeHtml(task.id)}" class="calendar-task-guide hidden" hidden>
          <p class="calendar-task-guide-text">${formatGuideHtml(task.guide)}</p>
        </div>
      </article>
    `;
  });

  html += `</div>`;
  container.innerHTML = html;

  document.querySelectorAll('.task-checkbox').forEach(chk => {
    chk.addEventListener('change', async (e) => {
      const month = e.target.getAttribute('data-month');
      const taskId = e.target.getAttribute('data-task-id');
      const checked = e.target.checked;
      const card = e.target.closest('.calendar-task');

      if (card) {
        card.classList.toggle('is-done', checked);
      }

      await saveTaskState(month, taskId, checked);

      const progress = container.querySelector('.calendar-month-progress');
      if (progress) {
        const total = tasksForMonth.length;
        const doneNow = container.querySelectorAll('.task-checkbox:checked').length;
        progress.textContent = `${doneNow} von ${total} erledigt · Tippe auf einen Schritt für die Anleitung`;
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
        btn.textContent = 'Schliessen';
      } else {
        guide.hidden = true;
        guide.classList.add('hidden');
        btn.setAttribute('aria-expanded', 'false');
        btn.classList.remove('is-open');
        btn.textContent = 'Anleitung';
      }
    });
  });
}

async function renderHivesView() {
  const hives = await getHives();
  const container = document.getElementById('hives-list-container');
  
  if (hives.length === 0) {
    container.innerHTML = `
      <div class="card text-center" style="padding: 40px 20px;">
        <p class="text-muted" style="margin-bottom: 20px;">Du hast noch keine Völker erfasst.</p>
        <button id="btn-add-hive-empty" class="btn btn-primary" style="width: auto; margin: 0 auto;">Erstes Volk erfassen</button>
      </div>
    `;
    document.getElementById('btn-add-hive-empty').addEventListener('click', () => openHiveModal());
    return;
  }

  container.innerHTML = hives.map(hive => {
    const qColorClass = getQueenColorClass(hive.queenYear);
    const qColorName = getQueenColorName(hive.queenYear);
    const statusClass = statusToCssClass(hive.status);
    const queenLabel = hive.queenName
      ? `"${escapeHtml(hive.queenName)}"`
      : 'Ohne Namen';
    return `
      <div class="card hive-card" data-id="${escapeHtml(hive.id)}" role="button" tabindex="0">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
          <div>
            <h3 style="font-size: 1.15rem; font-weight: 600;">${escapeHtml(hive.name)}</h3>
            <span class="text-muted" style="font-size: 0.85rem;">Rasse: ${escapeHtml(hive.breed || 'Nicht definiert')}</span>
          </div>
          <span class="status-badge status-${statusClass}">${escapeHtml(hive.status)}</span>
        </div>
        <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.05);">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="queen-badge ${qColorClass}">${hive.queenYear ? escapeHtml(hive.queenYear.toString().slice(-2)) : '?' }</span>
            <span class="text-secondary" style="font-size: 0.85rem;">Königin ${queenLabel} (${escapeHtml(hive.queenYear || 'Unbekannt')}, ${escapeHtml(qColorName)})</span>
          </div>
          <span class="text-primary-color" style="font-size: 0.85rem; font-weight: 500;">Details anzeigen →</span>
        </div>
      </div>
    `;
  }).join('');

  // Add click handlers for hive cards
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

  // Render Hive Details Info Block
  const infoBlock = document.getElementById('detail-hive-info');
  const qColorClass = getQueenColorClass(hive.queenYear);
  const qColorName = getQueenColorName(hive.queenYear);
  
  infoBlock.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
      <span class="status-badge status-${statusToCssClass(hive.status)}">${escapeHtml(hive.status)}</span>
      <button id="btn-edit-hive-details" class="btn btn-secondary btn-sm">Stammdaten bearbeiten</button>
    </div>
    <div class="detail-row">
      <span class="text-secondary">Name der Königin</span>
      <span style="font-weight: 500;">${escapeHtml(hive.queenName || 'Kein Name vergeben')}</span>
    </div>
    <div class="detail-row">
      <span class="text-secondary">Rasse / Herkunft</span>
      <span style="font-weight: 500;">${escapeHtml(hive.breed || 'Nicht angegeben')}</span>
    </div>
    <div class="detail-row">
      <span class="text-secondary">Königinnen-Jahrgang</span>
      <div style="display: flex; align-items: center; gap: 6px;">
        <span class="queen-badge ${qColorClass}" style="width: 20px; height: 20px; font-size: 0.65rem;">${hive.queenYear ? escapeHtml(hive.queenYear.toString().slice(-2)) : '?'}</span>
        <span style="font-weight: 500;">${escapeHtml(hive.queenYear || 'Unbekannt')} (${escapeHtml(qColorName)})</span>
      </div>
    </div>
    <div class="detail-row">
      <span class="text-secondary">Brutraum (Waben)</span>
      <span style="font-weight: 500;">${escapeHtml(hive.broodFrames || 0)}</span>
    </div>
    <div class="detail-row">
      <span class="text-secondary">1. Honigraum (Waben)</span>
      <span style="font-weight: 500;">${escapeHtml(hive.honeyFrames1 || 0)}</span>
    </div>
    <div class="detail-row">
      <span class="text-secondary">2. Honigraum (Waben)</span>
      <span style="font-weight: 500;">${escapeHtml(hive.honeyFrames2 || 0)}</span>
    </div>
    <div class="detail-row">
      <span class="text-secondary">Erstellt am</span>
      <span style="font-weight: 500;">${escapeHtml(formatDateString(hive.createdAt))}</span>
    </div>
    ${hive.notes ? `
      <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.05);">
        <span class="text-muted" style="font-size: 0.8rem; display: block; margin-bottom: 4px;">Notizen:</span>
        <p class="text-secondary" style="font-size: 0.9rem; white-space: pre-wrap;">${escapeHtml(hive.notes)}</p>
      </div>
    ` : ''}
  `;

  // Attach event to edit hive stammdaten
  document.getElementById('btn-edit-hive-details').addEventListener('click', () => {
    openHiveModal(hive);
  });

  // Render Inspections Timeline
  const inspections = await getInspections(activeHiveIdForDetail);
  const timeline = document.getElementById('hive-inspections-list');
  
  if (inspections.length === 0) {
    timeline.innerHTML = `
      <div class="card text-center" style="padding: 24px; border-style: dashed;">
        <p class="text-muted">Keine Durchsichten erfasst.</p>
        <button id="btn-new-insp-empty" class="btn btn-sm btn-secondary" style="margin-top: 12px;">Erste Durchsicht eintragen</button>
      </div>
    `;
    document.getElementById('btn-new-insp-empty').addEventListener('click', () => {
      openInspectionModal(null, activeHiveIdForDetail);
    });
    return;
  }

  timeline.innerHTML = inspections.map(insp => {
    const weatherString = (insp.weatherTemp !== undefined && insp.weatherTemp !== null) ? 
        `<span style="margin-left: 8px; font-size: 0.85rem;" class="text-secondary">| ${escapeHtml(insp.weatherCondition || '')} ${escapeHtml(insp.weatherTemp)}°C</span>` : '';
    return `
      <div class="log-item inspection-log-card" data-id="${escapeHtml(insp.id)}">
        <div class="log-item-header">
          <span>${escapeHtml(formatDateString(insp.date))}${weatherString}</span>
        </div>
        ${insp.notes ? `<p class="text-secondary" style="font-size: 0.95rem; white-space: pre-wrap; margin-top: 8px;">${escapeHtml(insp.notes)}</p>` : ''}
        <div style="text-align: right; margin-top: 8px;">
          <button class="btn btn-sm btn-secondary btn-edit-insp" data-id="${escapeHtml(insp.id)}" style="padding: 2px 8px; min-height: 24px; font-size: 0.75rem;">Bearbeiten</button>
        </div>
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
    document.getElementById('btn-quick-add').innerText = '+ Kauf';
    
    // Render Expenses
    const finances = (await getFinances()).filter(f => f.type === 'expense' || !f.type);
    if (finances.length === 0) {
      expensesList.innerHTML = `<p class="text-muted text-center" style="padding: 40px 20px;">Keine Käufe erfasst.</p>`;
      return;
    }

    expensesList.innerHTML = finances.map(item => `
      <div class="card finance-card" data-id="${escapeHtml(item.id)}" style="padding: 12px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; cursor: pointer;" role="button" tabindex="0">
        <div>
          <h4 style="font-size: 1rem; font-weight: 600;">${escapeHtml(item.description)}</h4>
          <div class="text-muted" style="font-size: 0.8rem; margin-top: 4px;">
            <span>${escapeHtml(formatDateString(item.date))}</span> &bull; 
            <span style="color: var(--primary);">${escapeHtml(item.category)}</span>
          </div>
        </div>
        <div style="text-align: right; display: flex; flex-direction: column; align-items: flex-end; gap: 8px;">
          <span style="font-weight: 700; color: var(--danger); font-size: 1.1rem;">- ${escapeHtml(parseFloat(item.price).toFixed(2))} CHF</span>
          <button class="btn btn-sm btn-danger btn-delete-fin-item" data-id="${escapeHtml(item.id)}" style="padding: 2px 8px; min-height: 24px; font-size: 0.7rem; width: auto; background: none; border: 1px solid var(--danger); color: var(--danger); z-index: 2;">Löschen</button>
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
        if (confirm('Kauf wirklich löschen?')) {
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
    document.getElementById('btn-quick-add').innerText = '+ Ernte';

    // Render Honey Yields
    const honey = await getHoneyHarvests();
    const hives = await getHives();
    
    if (honey.length === 0) {
      honeyList.innerHTML = `<p class="text-muted text-center" style="padding: 40px 20px;">Keine Honigernten erfasst.</p>`;
      return;
    }

    honeyList.innerHTML = honey.map(harvest => {
      const hive = hives.find(h => h.id === harvest.hiveId);
      return `
        <div class="card honey-card" data-id="${escapeHtml(harvest.id)}" style="padding: 12px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; cursor: pointer;" role="button" tabindex="0">
          <div>
            <h4 style="font-size: 1rem; font-weight: 600;">${escapeHtml(hive ? hive.name : 'Unbekanntes Volk')}</h4>
            <div class="text-muted" style="font-size: 0.8rem; margin-top: 4px;">
              <span>${escapeHtml(formatDateString(harvest.date))}</span> &bull; 
              <span>Sorte: <strong>${escapeHtml(harvest.type || 'Frühtracht')}</strong></span>
            </div>
          </div>
          <div style="text-align: right; display: flex; flex-direction: column; align-items: flex-end; gap: 8px;">
            <span style="font-weight: 700; color: var(--primary); font-size: 1.1rem;">🍯 ${escapeHtml(parseFloat(harvest.amount).toFixed(1))} kg</span>
            <button class="btn btn-sm btn-danger btn-delete-honey-item" data-id="${escapeHtml(harvest.id)}" style="padding: 2px 8px; min-height: 24px; font-size: 0.7rem; width: auto; background: none; border: 1px solid var(--danger); color: var(--danger); z-index: 2;">Löschen</button>
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
        if (confirm('Erntebeleg wirklich löschen?')) {
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
    document.getElementById('btn-quick-add').innerText = '+ Paten.';

    // Render Bienenpatenschaften
    const finances = (await getFinances()).filter(f => f.type === 'sponsorship');
    const hives = await getHives();

    if (finances.length === 0) {
      sponsorshipsList.innerHTML = `<p class="text-muted text-center" style="padding: 40px 20px;">Keine Patenschaften erfasst.</p>`;
      return;
    }

    sponsorshipsList.innerHTML = finances.map(item => {
      const hive = hives.find(h => h.id === item.hiveId);
      return `
        <div class="card sponsorship-card" data-id="${escapeHtml(item.id)}" style="padding: 12px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; cursor: pointer;" role="button" tabindex="0">
          <div>
            <h4 style="font-size: 1rem; font-weight: 600;">👤 ${escapeHtml(item.sponsorName || 'Unbekannter Pate')}</h4>
            <div class="text-muted" style="font-size: 0.8rem; margin-top: 4px;">
              <span>${escapeHtml(formatDateString(item.date))}</span> &bull; 
              <span>Kasten: <strong>${escapeHtml(hive ? hive.name : 'Gelöschtes Volk')}</strong></span>
            </div>
          </div>
          <div style="text-align: right; display: flex; flex-direction: column; align-items: flex-end; gap: 8px;">
            <span style="font-weight: 700; color: var(--success); font-size: 1.1rem;">+ ${escapeHtml(parseFloat(item.price).toFixed(2))} CHF</span>
            <button class="btn btn-sm btn-danger btn-delete-sponsorship-item" data-id="${escapeHtml(item.id)}" style="padding: 2px 8px; min-height: 24px; font-size: 0.7rem; width: auto; background: none; border: 1px solid var(--danger); color: var(--danger); z-index: 2;">Löschen</button>
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
        if (confirm('Patenschaft wirklich löschen?')) {
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
      btn.setAttribute('aria-label', 'Schliessen');
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

function openHiveModal(hive = null) {
  const form = document.getElementById('form-hive');
  const deleteBtn = document.getElementById('btn-delete-hive');
  const title = document.getElementById('modal-hive-title');
  form.reset();

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
    deleteBtn.style.display = 'block';
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
  const form = document.getElementById('form-inspection');
  const deleteBtn = document.getElementById('btn-delete-inspection');
  form.reset();

  const hivesContainer = document.getElementById('insp-form-hives-container');
  const hives = await getHives();
  
  if (hives.length === 0) {
    alert('Bitte erstelle zuerst ein Volk/Kasten, bevor du Durchsichten erfasst.');
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
    deleteBtn.style.display = 'none';
    
    weatherStatusSection.style.display = 'flex';
    inpWeatherTemp.value = '';
    inpWeatherCond.value = '';
    
    const loadWeather = async () => {
      weatherDisplay.innerHTML = 'Wird ermittelt... ⏳';
      btnWeatherRetry.style.display = 'none';
      try {
        const w = await fetchCurrentWeather();
        weatherDisplay.innerHTML = `${escapeHtml(w.conditionEmoji)} ${escapeHtml(w.temperature)}°C`;
        inpWeatherTemp.value = w.temperature;
        inpWeatherCond.value = w.conditionText;
      } catch (err) {
        weatherDisplay.innerHTML = `<span class="text-danger">Wetter-Fehler</span>`;
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

async function openFinanceModal(finance = null) {
  const form = document.getElementById('form-finance');
  const deleteBtn = document.getElementById('btn-delete-finance');
  form.reset();

  if (finance) {
    document.getElementById('finance-form-id').value = finance.id;
    document.getElementById('finance-form-date').value = finance.date;
    document.getElementById('finance-form-description').value = finance.description;
    document.getElementById('finance-form-category').value = finance.category || 'Hardware';
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
    alert('Bitte erstelle zuerst ein Volk, bevor du eine Honigernte buchst.');
    openHiveModal();
    return;
  }

  hiveSelect.innerHTML = hives.map(h => `<option value="${escapeHtml(h.id)}">${escapeHtml(h.name)}</option>`).join('');

  if (honey) {
    document.getElementById('honey-form-id').value = honey.id;
    document.getElementById('honey-form-hive-id').value = honey.hiveId;
    document.getElementById('honey-form-date').value = honey.date;
    document.getElementById('honey-form-amount').value = honey.amount;
    document.getElementById('honey-form-type').value = honey.type || 'Frühtracht';
    deleteBtn.style.display = 'block';
  } else {
    document.getElementById('honey-form-id').value = '';
    document.getElementById('honey-form-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('honey-form-type').value = 'Frühtracht';
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
    alert('Bitte erstelle zuerst ein Volk, bevor du eine Patenschaft buchst.');
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

// --- Form Submissions & Database Write Ops ---
function setupForms() {
  // Hive Form Submit
  document.getElementById('form-hive').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const id = document.getElementById('hive-form-id').value;
      const hive = {
        name: document.getElementById('hive-form-name').value,
        queenName: document.getElementById('hive-form-queen-name').value,
        breed: document.getElementById('hive-form-breed').value,
        queenYear: parseInt(document.getElementById('hive-form-queen-year').value),
        status: document.getElementById('hive-form-status').value,
        broodFrames: parseInt(document.getElementById('hive-form-brood-frames').value) || 0,
        honeyFrames1: parseInt(document.getElementById('hive-form-honey-frames-1').value) || 0,
        honeyFrames2: parseInt(document.getElementById('hive-form-honey-frames-2').value) || 0,
        notes: document.getElementById('hive-form-notes').value
      };

      if (id) hive.id = id;

      await saveHive(hive);
      closeModal('modal-hive');
      
      if (id) {
        // In details view, reload detail info
        await renderHiveDetailView();
      } else {
        // Navigate to list
        await navigate('hives');
      }
      await renderDashboardView();
    } catch (err) {
      console.error('Fehler beim Speichern des Volks:', err);
      alert('Fehler beim Speichern des Volks: ' + (err.message || err));
    }
  });

  // Hive Delete Button
  document.getElementById('btn-delete-hive').addEventListener('click', async () => {
    const id = document.getElementById('hive-form-id').value;
    if (id && confirm('Möchtest du dieses Volk und alle dazugehörigen Durchsichten unwiderruflich löschen?')) {
      await deleteHive(id);
      closeModal('modal-hive');
      await navigate('hives');
      await renderDashboardView();
    }
  });

  // Inspection Form Submit
  document.getElementById('form-inspection').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const id = document.getElementById('insp-form-id').value;
      
      // Get checked checkboxes (either checkbox or hidden input)
      const checkedCheckboxes = Array.from(document.querySelectorAll('.hive-checkbox')).filter(el => {
        return el.type === 'hidden' || el.checked;
      });
      if (checkedCheckboxes.length === 0) {
        alert('Bitte wähle mindestens ein Bienenvolk aus.');
        return;
      }
      
      const date = document.getElementById('insp-form-date').value;
      const notes = document.getElementById('insp-form-notes').value;
      const weatherTemp = document.getElementById('insp-weather-temp').value;
      const weatherCondition = document.getElementById('insp-weather-condition').value;

      if (id) {
        // Edit mode: save single update
        const inspection = {
          id: id,
          hiveId: checkedCheckboxes[0].value,
          date: date,
          broodStatus: '',
          honeySuper: '',
          temperament: 5,
          weatherTemp: weatherTemp !== '' ? parseFloat(weatherTemp) : undefined,
          weatherCondition: weatherCondition !== '' ? weatherCondition : undefined,
          feeding: '',
          varroa: '',
          notes: notes
        };
        await saveInspection(inspection);
      } else {
        // Creation mode: save separate inspections for each checked hive
        for (const chk of checkedCheckboxes) {
          const inspection = {
            hiveId: chk.value,
            date: date,
            broodStatus: '',
            honeySuper: '',
            temperament: 5,
            weatherTemp: weatherTemp !== '' ? parseFloat(weatherTemp) : undefined,
            weatherCondition: weatherCondition !== '' ? weatherCondition : undefined,
            feeding: '',
            varroa: '',
            notes: notes
          };
          await saveInspection(inspection);
        }
      }

      closeModal('modal-inspection');

      // Refresh view
      if (currentView === 'hive-detail') {
        await renderHiveDetailView();
      } else {
        await navigate('dashboard');
      }
      await renderDashboardView();
    } catch (err) {
      console.error('Fehler beim Speichern der Durchsicht:', err);
      alert('Fehler beim Speichern der Durchsicht: ' + (err.message || err));
    }
  });

  // Inspection Delete Button
  document.getElementById('btn-delete-inspection').addEventListener('click', async () => {
    const id = document.getElementById('insp-form-id').value;
    if (id && confirm('Diese Durchsicht wirklich löschen?')) {
      await deleteInspection(id);
      closeModal('modal-inspection');
      if (currentView === 'hive-detail') {
        await renderHiveDetailView();
      }
      await renderDashboardView();
    }
  });

  // Finance Form Submit (Expenses)
  document.getElementById('form-finance').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const id = document.getElementById('finance-form-id').value;
      const item = {
        date: document.getElementById('finance-form-date').value,
        description: document.getElementById('finance-form-description').value,
        category: document.getElementById('finance-form-category').value,
        price: parseFloat(document.getElementById('finance-form-price').value),
        type: 'expense'
      };

      if (id) item.id = id;

      await saveFinance(item);
      closeModal('modal-finance');
      
      if (currentView === 'finances') {
        await renderFinanceView();
      } else {
        await navigate('finances');
      }
      await renderDashboardView();
    } catch (err) {
      console.error('Fehler beim Speichern der Ausgabe:', err);
      alert('Fehler beim Speichern der Ausgabe: ' + (err.message || err));
    }
  });

  // Finance Delete Button (modal)
  document.getElementById('btn-delete-finance').addEventListener('click', async () => {
    const id = document.getElementById('finance-form-id').value;
    if (id && confirm('Diesen Kauf wirklich löschen?')) {
      try {
        await deleteFinance(id);
        closeModal('modal-finance');
        if (currentView === 'finances') {
          await renderFinanceView();
        }
        await renderDashboardView();
      } catch (err) {
        console.error('Fehler beim Löschen der Ausgabe:', err);
        alert('Fehler beim Löschen: ' + (err.message || err));
      }
    }
  });

  // Honey Form Submit (Honey Harvests)
  document.getElementById('form-honey').addEventListener('submit', async (e) => {
    e.preventDefault();
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
      closeModal('modal-honey');

      if (currentView === 'finances') {
        currentFinanceTab = 'honey';
        const tabExpenses = document.getElementById('tab-fin-expenses');
        const tabHoney = document.getElementById('tab-fin-honey');
        tabExpenses.classList.remove('active');
        tabHoney.classList.add('active');
        await renderFinanceView();
      } else {
        await navigate('finances');
        currentFinanceTab = 'honey';
        const tabExpenses = document.getElementById('tab-fin-expenses');
        const tabHoney = document.getElementById('tab-fin-honey');
        tabExpenses.classList.remove('active');
        tabHoney.classList.add('active');
        await renderFinanceView();
      }
      await renderDashboardView();
    } catch (err) {
      console.error('Fehler beim Speichern der Honigernte:', err);
      alert('Fehler beim Speichern der Honigernte: ' + (err.message || err));
    }
  });

  // Honey Delete Button (modal)
  document.getElementById('btn-delete-honey').addEventListener('click', async () => {
    const id = document.getElementById('honey-form-id').value;
    if (id && confirm('Diese Honigernte wirklich löschen?')) {
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
        alert('Fehler beim Löschen: ' + (err.message || err));
      }
    }
  });

  // Sponsorship Form Submit
  document.getElementById('form-sponsorship').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const id = document.getElementById('sponsorship-form-id').value;
      const sponsorName = document.getElementById('sponsorship-form-sponsor').value;
      const item = {
        date: document.getElementById('sponsorship-form-date').value,
        description: `Patenschaft: ${sponsorName}`,
        sponsorName: sponsorName,
        hiveId: document.getElementById('sponsorship-form-hive-id').value,
        price: parseFloat(document.getElementById('sponsorship-form-price').value),
        category: 'Patenschaft',
        notes: document.getElementById('sponsorship-form-notes').value,
        type: 'sponsorship'
      };

      if (id) item.id = id;

      await saveFinance(item);
      closeModal('modal-sponsorship');

      if (currentView === 'finances') {
        currentFinanceTab = 'sponsorships';
        const tabExpenses = document.getElementById('tab-fin-expenses');
        const tabHoney = document.getElementById('tab-fin-honey');
        const tabSponsorships = document.getElementById('tab-fin-sponsorships');
        tabExpenses.classList.remove('active');
        tabHoney.classList.remove('active');
        tabSponsorships.classList.add('active');
        await renderFinanceView();
      } else {
        await navigate('finances');
        currentFinanceTab = 'sponsorships';
        const tabExpenses = document.getElementById('tab-fin-expenses');
        const tabHoney = document.getElementById('tab-fin-honey');
        const tabSponsorships = document.getElementById('tab-fin-sponsorships');
        tabExpenses.classList.remove('active');
        tabHoney.classList.remove('active');
        tabSponsorships.classList.add('active');
        await renderFinanceView();
      }
      await renderDashboardView();
    } catch (err) {
      console.error('Fehler beim Speichern der Patenschaft:', err);
      alert('Fehler beim Speichern der Patenschaft: ' + (err.message || err));
    }
  });

  // Sponsorship Delete Button
  document.getElementById('btn-delete-sponsorship').addEventListener('click', async () => {
    const id = document.getElementById('sponsorship-form-id').value;
    if (id && confirm('Diese Patenschaft wirklich löschen?')) {
      await deleteFinance(id);
      closeModal('modal-sponsorship');
      if (currentView === 'finances') {
        await renderFinanceView();
      }
      await renderDashboardView();
    }
  });

  // Force window layout refresh on input blur to fix iOS Safari touch target bug
  document.addEventListener('focusout', (e) => {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) {
      window.scrollTo(0, window.scrollY);
    }
  });
}

// --- Backup & Settings Administration ---
function setupSettings() {
  // Export Data
  document.getElementById('btn-export-backup').addEventListener('click', async () => {
    const dataStr = await exportData();
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `bienen_tracker_backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  // Trigger file dialog
  const fileInput = document.getElementById('input-import-file');
  document.getElementById('btn-trigger-import').addEventListener('click', () => {
    fileInput.click();
  });

  // Handle Import file
  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      const success = await importData(evt.target.result);
      if (success) {
        alert('Daten erfolgreich importiert!');
        await navigate('dashboard');
      } else {
        alert('Fehler beim Importieren der Datei. Bitte überprüfe das Format.');
      }
    };
    reader.readAsText(file);
  });

  // Seed Data
  document.getElementById('btn-seed-data').addEventListener('click', () => {
    if (confirm('Möchtest du die Demo-Daten laden? Bestehende Daten bleiben erhalten.')) {
      seedDemoData();
      alert('Demo-Daten erfolgreich hinzugefügt!');
      navigate('dashboard');
    }
  });

  // Clear database
  document.getElementById('btn-clear-data').addEventListener('click', () => {
    if (confirm('ACHTUNG: Möchtest du wirklich alle Daten unwiderruflich löschen?')) {
      localStorage.clear();
      alert('Alle Daten wurden gelöscht.');
      location.reload();
    }
  });

  // Force Refresh
  document.getElementById('btn-force-refresh').addEventListener('click', async () => {
    if (confirm('Möchtest du ein Update erzwingen und die App neu laden?')) {
      // Unregister Service Workers
      if ('serviceWorker' in navigator) {
        try {
          const registrations = await navigator.serviceWorker.getRegistrations();
          for (const registration of registrations) {
            await registration.unregister();
          }
        } catch (e) {
          console.error('Error unregistering service worker:', e);
        }
      }
      // Clear cache
      if ('caches' in window) {
        try {
          const keys = await caches.keys();
          for (const key of keys) {
            await caches.delete(key);
          }
        } catch (e) {
          console.error('Error clearing caches:', e);
        }
      }
      // Force reload page
      window.location.reload(true);
    }
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
      userStatus.innerText = session.user.email;
      btnAuthAction.innerText = 'Logout';
      
      // Check if there is local data to sync
      let localHives = [];
      try {
        localHives = JSON.parse(localStorage.getItem('bee_tracker_hives') || '[]') || [];
      } catch {
        localHives = [];
      }
      const hasDeclinedSync = localStorage.getItem('bee_tracker_sync_declined') === 'true';
      if (localHives.length > 0 && !hasDeclinedSync) {
        if (confirm('Möchtest du deine bestehenden lokalen Bienendaten in dein Online-Konto übertragen?')) {
          try {
            await syncLocalToRemote();
            alert('Daten erfolgreich synchronisiert!');
          } catch (syncErr) {
            console.error('Sync fehlgeschlagen:', syncErr);
            alert('Synchronisation unvollständig: ' + (syncErr.message || syncErr));
          }
        } else {
          localStorage.setItem('bee_tracker_sync_declined', 'true');
        }
      }
      
      await navigate(currentView);
    } else {
      userStatus.innerText = 'Lokal';
      btnAuthAction.innerText = 'Login';
      await navigate(currentView);
    }
  });

  // Header button click
  btnAuthAction.addEventListener('click', async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      if (confirm('Möchtest du dich abmelden?')) {
        localStorage.removeItem('bee_tracker_sync_declined');
        await supabase.auth.signOut();
        location.reload(); // Reload to reset storage state
      }
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
    submitBtn.disabled = true;

    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;

    try {
      if (authMode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        closeModal('modal-auth');
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        successMsg.innerText = 'Registrierung erfolgreich! Bitte überprüfe deine E-Mails zur Bestätigung.';
        successMsg.style.display = 'block';
      }
    } catch (err) {
      errorMsg.innerText = err.message || 'Ein Fehler ist aufgetreten.';
      errorMsg.style.display = 'block';
    } finally {
      submitBtn.disabled = false;
    }
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

    previewDiv.innerText = 'Aufnahme läuft... Mundart sprechen erlaubt!';
    previewDiv.style.display = 'block';

    startAudioRecording({
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
  });

  function resetUI() {
    currentStatus = 'idle';
    btnIcon.innerText = '🎙️';
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
      btnIcon.innerText = '🛑';
      btnText.innerText = 'Diktieren stoppen';
      statusBadge.innerText = 'Aufnahme...';
      statusBadge.style.background = '#ef4444';
      statusBadge.style.color = '#fff';
      btnRecord.classList.remove('btn-secondary');
      btnRecord.classList.add('btn-danger');
      statusBadge.classList.add('voice-badge-listening');
    } else if (status === 'processing') {
      btnIcon.innerText = '⏳';
      btnText.innerText = 'KI analysiert...';
      statusBadge.innerText = 'Analysiere...';
      statusBadge.style.background = 'var(--primary)';
      statusBadge.style.color = '#000';
      statusBadge.classList.remove('voice-badge-listening');
    } else {
      resetUI();
    }
  }

  async function handleAudioProcessing(audioBlob) {
    if (!navigator.onLine) {
      updateUIForStatus('idle');
      previewDiv.style.display = 'none';
      try {
        const base64 = await blobToBase64(audioBlob);
        await saveOfflineMemo('voice', base64, audioBlob.type);
        alert('Offline-Modus: Dein Diktat wurde lokal gespeichert. Sobald du Internetverbindung hast, wird es automatisch verarbeitet! 💾');
        await renderOfflineMemos();
      } catch (err) {
        console.error(err);
        alert('Fehler beim lokalen Speichern der Sprachnotiz.');
      }
      return;
    }

    updateUIForStatus('processing');
    try {
      const data = await parseAudioWithGemini(audioBlob);
      if (!data) throw new Error('Ungültige Antwort der KI.');

      // Match Hive Names
      if (data.hiveNames && Array.isArray(data.hiveNames)) {
        const hives = await getHives();
        const chkContainer = document.getElementById('insp-form-hives-container');
        
        // Reset all checkboxes first
        const checkboxes = chkContainer.querySelectorAll('.hive-checkbox');
        checkboxes.forEach(chk => {
          chk.checked = false;
        });

        const isAlle = data.hiveNames.includes('alle');
        
        if (isAlle) {
          checkboxes.forEach(chk => {
            chk.checked = true;
            highlightLabel(chk.parentElement);
          });
        } else {
          for (const rawName of data.hiveNames) {
            const matchedHive = hives.find(h => 
              h.name.toLowerCase().includes(rawName.toLowerCase()) || 
              rawName.toLowerCase().includes(h.name.toLowerCase())
            );
            if (matchedHive) {
              const chk = document.getElementById(`hive-chk-${matchedHive.id}`);
              if (chk) {
                chk.checked = true;
                highlightLabel(chk.parentElement);
              }
            }
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
      errorDiv.innerText = formatGeminiError(err, 'Fehler bei der KI-Verarbeitung.');
      errorDiv.style.display = 'block';
      resetUI();
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
    fileInput.click();
  });

  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!navigator.onLine) {
      try {
        const base64 = await blobToBase64(file);
        await saveOfflineMemo('receipt', base64, file.type);
        alert('Offline-Modus: Der Beleg wurde lokal gesichert. Er wird analysiert, sobald du wieder online bist! 💾');
        await renderOfflineMemos();
      } catch (err) {
        console.error(err);
        alert('Fehler beim lokalen Speichern des Belegs.');
      } finally {
        fileInput.value = '';
      }
      return;
    }

    updateUI('processing');
    errorDiv.style.display = 'none';

    try {
      const data = await parseReceiptWithGemini(file);
      if (!data) throw new Error('Keine Daten vom Beleg-Scanner empfangen.');

      // Populate form fields
      if (data.date) {
        document.getElementById('finance-form-date').value = data.date;
        highlightField('finance-form-date');
      }
      if (data.description) {
        document.getElementById('finance-form-description').value = data.description;
        highlightField('finance-form-description');
      }
      if (data.category) {
        const catSelect = document.getElementById('finance-form-category');
        const validCategories = Array.from(catSelect.options).map(opt => opt.value);
        if (validCategories.includes(data.category)) {
          catSelect.value = data.category;
        } else {
          catSelect.value = 'Sonstiges';
        }
        highlightField('finance-form-category');
      }
      if (data.price !== undefined && data.price !== null) {
        document.getElementById('finance-form-price').value = parseFloat(data.price).toFixed(2);
        highlightField('finance-form-price');
      }

      statusBadge.innerText = 'Beleg erfasst!';
      statusBadge.style.background = '#10b981';
      statusBadge.style.color = '#fff';

      setTimeout(() => {
        updateUI('idle');
      }, 3000);

    } catch (err) {
      console.error(err);
      errorDiv.innerText = formatGeminiError(err, 'Fehler beim Analysieren des Belegs.');
      errorDiv.style.display = 'block';
      updateUI('idle');
    } finally {
      fileInput.value = '';
    }
  });

  function updateUI(status) {
    if (status === 'processing') {
      btnScan.disabled = true;
      btnIcon.innerText = '⏳';
      btnText.innerText = 'Beleg wird analysiert...';
      statusBadge.innerText = 'Analysiere...';
      statusBadge.style.background = 'var(--primary)';
      statusBadge.style.color = '#000';
    } else {
      btnScan.disabled = false;
      btnIcon.innerText = '📷';
      btnText.innerText = 'Beleg hochladen / fotografieren';
      statusBadge.innerText = 'Bereit';
      statusBadge.style.background = 'rgba(255,255,255,0.1)';
      statusBadge.style.color = 'var(--text-primary)';
    }
  }
}

function formatGeminiError(err, defaultMessage) {
  const errMsg = err.message || err.toString() || '';
  if (errMsg.includes('429') || errMsg.toLowerCase().includes('quota') || errMsg.toLowerCase().includes('limit')) {
    return 'Die Anfragegrenze der künstlichen Intelligenz wurde vorübergehend überschritten. Bitte warte ca. 10 Sekunden und versuche es erneut. ⏳';
  }
  if (errMsg.includes('403') || errMsg.includes('400') || errMsg.toLowerCase().includes('api key') || errMsg.toLowerCase().includes('key not valid')) {
    return 'Der KI-API-Schlüssel ist ungültig oder abgelaufen. Bitte überprüfe deine Einstellungen oder deinen Schlüssel. 🔑';
  }
  if (errMsg.toLowerCase().includes('fetch') || errMsg.toLowerCase().includes('network') || errMsg.toLowerCase().includes('failed to fetch')) {
    return 'Netzwerkfehler: Keine Verbindung zur künstlichen Intelligenz möglich. Bitte überprüfe deine Internetverbindung. 📡';
  }
  return defaultMessage || 'Ein unerwarteter Fehler ist bei der KI-Analyse aufgetreten. Bitte versuche es erneut.';
}

function setupConnectionTracking() {
  updateConnectionStatusUI();
  
  window.addEventListener('online', async () => {
    updateConnectionStatusUI();
    console.log('[Connection] Online! Synchronisiere Daten...');
    try {
      await processSyncQueue();
      await processOfflineMemosQueue();
    } catch (e) {
      console.error('[Connection] Error auto-syncing:', e);
    }
    updateConnectionStatusUI();
    
    // Also re-render dashboard if we are currently viewing it
    if (currentView === 'dashboard') {
      await renderDashboardView();
    }
  });
  
  window.addEventListener('offline', () => {
    updateConnectionStatusUI();
    console.log('[Connection] Offline.');
    if (currentView === 'dashboard') {
      renderOfflineMemos();
    }
  });

  // Initial sync check
  if (navigator.onLine) {
    processSyncQueue().then(() => {
      updateConnectionStatusUI();
      processOfflineMemosQueue().then(() => {
        if (currentView === 'dashboard') {
          renderDashboardView();
        }
      });
    });
  }
}

function updateConnectionStatusUI() {
  const statusEl = document.getElementById('connection-status');
  if (!statusEl) return;

  if (navigator.onLine) {
    const pendingCount = getSyncQueueLength();
    if (pendingCount > 0) {
      statusEl.innerText = '🔄';
      statusEl.title = `Online - ${pendingCount} Änderungen ausstehend...`;
    } else {
      statusEl.innerText = '🟢';
      statusEl.title = 'Online - Synchronisiert';
    }
  } else {
    statusEl.innerText = '🔌';
    statusEl.title = 'Offline - Änderungen werden lokal gespeichert';
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
    const typeLabel = memo.type === 'voice' ? '🎙️ Diktat' : '📷 Beleg-Scan';
    const detailText = memo.type === 'voice' 
      ? `Sprachmemo vom ${formatDateString(new Date(memo.timestamp).toISOString())} um ${dateStr}`
      : `Beleg hochgeladen am ${formatDateString(new Date(memo.timestamp).toISOString())} um ${dateStr}`;
      
    return `
      <div class="card" style="padding: 10px; margin-bottom: 0; display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.15);">
        <div>
          <div style="font-weight: 600; font-size: 0.9rem;">${typeLabel}</div>
          <div class="text-secondary" style="font-size: 0.8rem; margin-top: 2px;">${detailText}</div>
        </div>
        <button class="btn btn-sm btn-primary btn-process-offline-memo" data-id="${memo.id}" style="width: auto; padding: 4px 10px; min-height: 28px; font-size: 0.75rem;">
          ${navigator.onLine ? 'Verarbeiten' : 'Wartet auf Netz'}
        </button>
      </div>
    `;
  }).join('');

  document.querySelectorAll('.btn-process-offline-memo').forEach(btn => {
    btn.disabled = !navigator.onLine;
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      btn.disabled = true;
      btn.innerText = 'Verarbeite...';
      try {
        await processSingleOfflineMemo(id);
        await renderOfflineMemos();
        await renderDashboardView();
      } catch (err) {
        btn.disabled = false;
        btn.innerText = 'Wiederholen';
        alert('Verarbeitung fehlgeschlagen: ' + err.message);
      }
    });
  });
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
    const targetHiveIds = [];
    
    if (data.hiveNames && Array.isArray(data.hiveNames)) {
      const isAlle = data.hiveNames.includes('alle');
      if (isAlle) {
        hives.forEach(h => targetHiveIds.push(h.id));
      } else {
        for (const rawName of data.hiveNames) {
          const matchedHive = hives.find(h => 
            h.name.toLowerCase().includes(rawName.toLowerCase()) || 
            rawName.toLowerCase().includes(h.name.toLowerCase())
          );
          if (matchedHive) {
            targetHiveIds.push(matchedHive.id);
          }
        }
      }
    }

    if (targetHiveIds.length === 0) {
      throw new Error('Es konnte kein passendes Volk für das Diktat gefunden werden.');
    }

    // 3. Create inspections
    const date = new Date(memo.timestamp).toISOString().split('T')[0];
    for (const hiveId of targetHiveIds) {
      const inspection = {
        hiveId: hiveId,
        date: date,
        broodStatus: '',
        honeySuper: '',
        temperament: 5,
        notes: data.notes || 'Durchsicht via Offline-Sprachmemo.'
      };
      await saveInspection(inspection);
    }

  } else if (memo.type === 'receipt') {
    // 1. Process receipt file with Gemini
    const file = new File([blob], 'offline_receipt.jpg', { type: memo.mediaType });
    const data = await parseReceiptWithGemini(file);
    if (!data) throw new Error('Keine Beleg-Daten von Gemini erkannt.');

    // 2. Save finance item
    const finance = {
      date: data.date || new Date(memo.timestamp).toISOString().split('T')[0],
      description: data.description || 'Offline Beleg-Scan',
      category: data.category || 'Sonstiges',
      price: parseFloat(data.price || 0),
      type: 'expense'
    };
    await saveFinance(finance);
  }

  // 4. Delete memo from IndexedDB on success
  await deleteOfflineMemo(id);
}

async function processOfflineMemosQueue() {
  if (!navigator.onLine) return;
  const memos = await getOfflineMemos();
  for (const memo of memos) {
    try {
      await processSingleOfflineMemo(memo.id);
    } catch (err) {
      console.error('Error auto-processing offline memo:', err);
    }
  }
}
