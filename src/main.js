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
  syncLocalToRemote
} from './storage.js';
import { supabase } from './supabase.js';
import { startAudioRecording, stopAudioRecording, parseAudioWithGemini } from './voiceAssistant.js';
import { parseReceiptWithGemini } from './receiptScanner.js';

// --- Service Worker Registration ---
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => console.log('Service Worker registered:', reg.scope))
      .catch(err => console.error('Service Worker registration failed:', err));
  });
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
    if (inset > cachedBottomInset) cachedBottomInset = inset;
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
  await initStorage();
  setupRouting();
  setupModals();
  setupForms();
  setupSettings();
  setupAuth();
  setupVoiceAssistant();
  setupReceiptScanner();

  // Pin #app to the real visible viewport height. Works in BOTH Safari (tracks the
  // dynamic URL bar) and standalone PWA (full height), unlike 100vh/100dvh which
  // each break in one of the two environments.
  bindAppHeight();

  // Initial render
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
    openHiveModal();
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
  document.getElementById('btn-add-hive').addEventListener('click', () => {
    openHiveModal();
  });
  document.getElementById('btn-new-inspection').addEventListener('click', () => {
    openInspectionModal(null, activeHiveIdForDetail);
  });

  // Finance Tabs Segmented Control
  const tabExpenses = document.getElementById('tab-fin-expenses');
  const tabHoney = document.getElementById('tab-fin-honey');
  
  tabExpenses.addEventListener('click', async () => {
    tabExpenses.classList.add('active');
    tabHoney.classList.remove('active');
    currentFinanceTab = 'expenses';
    await renderFinanceView();
  });

  tabHoney.addEventListener('click', async () => {
    tabHoney.classList.add('active');
    tabExpenses.classList.remove('active');
    currentFinanceTab = 'honey';
    await renderFinanceView();
  });

  // Finance list buttons
  document.getElementById('btn-add-expense').addEventListener('click', () => {
    openFinanceModal();
  });
  document.getElementById('btn-add-honey').addEventListener('click', () => {
    openHoneyModal();
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
    quickAddBtn.innerText = currentFinanceTab === 'expenses' ? '+ Kauf' : '+ Ernte';
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
  document.getElementById('stat-expenses-sum').innerHTML = `<span style="font-size: 0.85rem; font-weight: 500; color: var(--text-secondary); margin-right: 2px;">CHF</span>${totalExpenses.toFixed(2)}`;

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
    return;
  }

  recentList.innerHTML = activities.slice(0, 5).map((act, index) => `
    <div class="card recent-activity-card" data-index="${index}" style="padding: 12px; margin-bottom: 10px; cursor: pointer;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
        <span class="text-primary-color" style="font-size: 0.85rem; font-weight: 600;">${act.tag}</span>
        <span class="text-muted" style="font-size: 0.75rem;">${formatDateString(act.date)}</span>
      </div>
      <div style="font-weight: 500; font-size: 0.95rem;">${act.hiveName}</div>
      <div class="text-secondary" style="font-size: 0.85rem; margin-top: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
        ${act.details}
      </div>
    </div>
  `).join('');

  // Attach click handlers to open edit modals
  document.querySelectorAll('.recent-activity-card').forEach(card => {
    card.addEventListener('click', () => {
      const idx = parseInt(card.getAttribute('data-index'));
      const act = activities[idx];
      if (act.type === 'inspection') {
        openInspectionModal(act.raw);
      } else if (act.type === 'honey') {
        openHoneyModal(act.raw);
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
    return `
      <div class="card hive-card" data-id="${hive.id}">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
          <div>
            <h3 style="font-size: 1.15rem; font-weight: 600;">${hive.name}</h3>
            <span class="text-muted" style="font-size: 0.85rem;">Rasse: ${hive.breed || 'Nicht definiert'}</span>
          </div>
          <span class="status-badge status-${hive.status.toLowerCase().replace(' ', '-')}">${hive.status}</span>
        </div>
        <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.05);">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="queen-badge ${qColorClass}">${hive.queenYear ? hive.queenYear.toString().slice(-2) : '?' }</span>
            <span class="text-secondary" style="font-size: 0.85rem;">Königin ${hive.queenName ? `"${hive.queenName}"` : 'Ohne Namen'} (${hive.queenYear || 'Unbekannt'}, ${qColorName})</span>
          </div>
          <span class="text-primary-color" style="font-size: 0.85rem; font-weight: 500;">Details anzeigen →</span>
        </div>
      </div>
    `;
  }).join('');

  // Add click handlers for hive cards
  document.querySelectorAll('.hive-card').forEach(card => {
    card.addEventListener('click', async () => {
      activeHiveIdForDetail = card.getAttribute('data-id');
      await navigate('hive-detail');
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
      <span class="status-badge status-${hive.status.toLowerCase().replace(' ', '-')}">${hive.status}</span>
      <button id="btn-edit-hive-details" class="btn btn-secondary btn-sm">Stammdaten bearbeiten</button>
    </div>
    <div class="detail-row">
      <span class="text-secondary">Name der Königin</span>
      <span style="font-weight: 500;">${hive.queenName || 'Kein Name vergeben'}</span>
    </div>
    <div class="detail-row">
      <span class="text-secondary">Rasse / Herkunft</span>
      <span style="font-weight: 500;">${hive.breed || 'Nicht angegeben'}</span>
    </div>
    <div class="detail-row">
      <span class="text-secondary">Königinnen-Jahrgang</span>
      <div style="display: flex; align-items: center; gap: 6px;">
        <span class="queen-badge ${qColorClass}" style="width: 20px; height: 20px; font-size: 0.65rem;">${hive.queenYear ? hive.queenYear.toString().slice(-2) : '?'}</span>
        <span style="font-weight: 500;">${hive.queenYear || 'Unbekannt'} (${qColorName})</span>
      </div>
    </div>
    <div class="detail-row">
      <span class="text-secondary">Brutraum (Waben)</span>
      <span style="font-weight: 500;">${hive.broodFrames || 0}</span>
    </div>
    <div class="detail-row">
      <span class="text-secondary">1. Honigraum (Waben)</span>
      <span style="font-weight: 500;">${hive.honeyFrames1 || 0}</span>
    </div>
    <div class="detail-row">
      <span class="text-secondary">2. Honigraum (Waben)</span>
      <span style="font-weight: 500;">${hive.honeyFrames2 || 0}</span>
    </div>
    <div class="detail-row">
      <span class="text-secondary">Erstellt am</span>
      <span style="font-weight: 500;">${formatDateString(hive.createdAt)}</span>
    </div>
    ${hive.notes ? `
      <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.05);">
        <span class="text-muted" style="font-size: 0.8rem; display: block; margin-bottom: 4px;">Notizen:</span>
        <p class="text-secondary" style="font-size: 0.9rem; white-space: pre-wrap;">${hive.notes}</p>
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
    return `
      <div class="log-item inspection-log-card" data-id="${insp.id}">
        <div class="log-item-header">
          <span>${formatDateString(insp.date)}</span>
        </div>
        ${insp.notes ? `<p class="text-secondary" style="font-size: 0.95rem; white-space: pre-wrap; margin-top: 8px;">${insp.notes}</p>` : ''}
        <div style="text-align: right; margin-top: 8px;">
          <button class="btn btn-sm btn-secondary btn-edit-insp" data-id="${insp.id}" style="padding: 2px 8px; min-height: 24px; font-size: 0.75rem;">Bearbeiten</button>
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
  const sectionExpenses = document.getElementById('section-expenses');
  const sectionHoney = document.getElementById('section-honey');

  // Toggle sections
  if (currentFinanceTab === 'expenses') {
    sectionExpenses.classList.remove('hidden');
    sectionHoney.classList.add('hidden');
    document.getElementById('btn-quick-add').innerText = '+ Kauf';
    
    // Render Expenses
    const finances = (await getFinances()).filter(f => f.type === 'expense' || !f.type);
    if (finances.length === 0) {
      expensesList.innerHTML = `<p class="text-muted text-center" style="padding: 40px 20px;">Keine Käufe erfasst.</p>`;
      return;
    }

    expensesList.innerHTML = finances.map(item => `
      <div class="card" style="padding: 12px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <h4 style="font-size: 1rem; font-weight: 600;">${item.description}</h4>
          <div class="text-muted" style="font-size: 0.8rem; margin-top: 4px;">
            <span>${formatDateString(item.date)}</span> &bull; 
            <span style="color: var(--primary);">${item.category}</span>
          </div>
        </div>
        <div style="text-align: right; display: flex; flex-direction: column; align-items: flex-end; gap: 8px;">
          <span style="font-weight: 700; color: var(--danger); font-size: 1.1rem;">- ${parseFloat(item.price).toFixed(2)} CHF</span>
          <button class="btn btn-sm btn-danger btn-delete-fin-item" data-id="${item.id}" style="padding: 2px 8px; min-height: 24px; font-size: 0.7rem; width: auto; background: none; border: 1px solid var(--danger); color: var(--danger);">Löschen</button>
        </div>
      </div>
    `).join('');

    // Delete buttons
    document.querySelectorAll('.btn-delete-fin-item').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (confirm('Kauf wirklich löschen?')) {
          await deleteFinance(btn.getAttribute('data-id'));
          await renderFinanceView();
          await renderDashboardView();
        }
      });
    });

  } else {
    sectionExpenses.classList.add('hidden');
    sectionHoney.classList.remove('hidden');
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
        <div class="card" style="padding: 12px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center;">
          <div>
            <h4 style="font-size: 1rem; font-weight: 600;">${hive ? hive.name : 'Unbekanntes Volk'}</h4>
            <div class="text-muted" style="font-size: 0.8rem; margin-top: 4px;">
              <span>${formatDateString(harvest.date)}</span> &bull; 
              <span>Sorte: <strong>${harvest.type || 'Frühtracht'}</strong></span>
            </div>
          </div>
          <div style="text-align: right; display: flex; flex-direction: column; align-items: flex-end; gap: 8px;">
            <span style="font-weight: 700; color: var(--primary); font-size: 1.1rem;">🍯 ${parseFloat(harvest.amount).toFixed(1)} kg</span>
            <button class="btn btn-sm btn-danger btn-delete-honey-item" data-id="${harvest.id}" style="padding: 2px 8px; min-height: 24px; font-size: 0.7rem; width: auto; background: none; border: 1px solid var(--danger); color: var(--danger);">Löschen</button>
          </div>
        </div>
      `;
    }).join('');

    // Delete buttons
    document.querySelectorAll('.btn-delete-honey-item').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (confirm('Erntebeleg wirklich löschen?')) {
          await deleteHoneyHarvest(btn.getAttribute('data-id'));
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
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        closeModal(overlay.id);
      }
    });
  });

  // Setup close buttons via selector [data-close]
  const closeBtns = document.querySelectorAll('[data-close]');
  closeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const modalId = btn.getAttribute('data-close');
      closeModal(modalId);
    });
  });
}

function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.add('active');
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

  // Populate Hive dropdown
  const hiveSelect = document.getElementById('insp-form-hive-id');
  const hives = await getHives();
  
  if (hives.length === 0) {
    alert('Bitte erstelle zuerst ein Volk/Kasten, bevor du Durchsichten erfasst.');
    openHiveModal();
    return;
  }

  hiveSelect.innerHTML = hives.map(h => `<option value="${h.id}">${h.name}</option>`).join('');

  if (inspection) {
    document.getElementById('insp-form-id').value = inspection.id;
    document.getElementById('insp-form-hive-id').value = inspection.hiveId;
    document.getElementById('insp-form-date').value = inspection.date;
    document.getElementById('insp-form-notes').value = inspection.notes || '';
    deleteBtn.style.display = 'block';
  } else {
    document.getElementById('insp-form-id').value = '';
    document.getElementById('insp-form-date').value = new Date().toISOString().split('T')[0];
    deleteBtn.style.display = 'none';

    if (preselectedHiveId) {
      document.getElementById('insp-form-hive-id').value = preselectedHiveId;
    }
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

  hiveSelect.innerHTML = hives.map(h => `<option value="${h.id}">${h.name}</option>`).join('');

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

// --- Form Submissions & Database Write Ops ---
function setupForms() {
  // Hive Form Submit
  document.getElementById('form-hive').addEventListener('submit', async (e) => {
    e.preventDefault();
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
    const id = document.getElementById('insp-form-id').value;
    const inspection = {
      hiveId: document.getElementById('insp-form-hive-id').value,
      date: document.getElementById('insp-form-date').value,
      broodStatus: '',
      honeySuper: '',
      temperament: 5,
      feeding: '',
      varroa: '',
      notes: document.getElementById('insp-form-notes').value
    };

    if (id) inspection.id = id;

    await saveInspection(inspection);
    closeModal('modal-inspection');

    // Refresh view
    if (currentView === 'hive-detail') {
      await renderHiveDetailView();
    } else {
      await navigate('dashboard');
    }
    await renderDashboardView();
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
  });

  // Honey Form Submit (Honey Harvests)
  document.getElementById('form-honey').addEventListener('submit', async (e) => {
    e.preventDefault();
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
      const localHives = JSON.parse(localStorage.getItem('bee_tracker_hives')) || [];
      const hasDeclinedSync = localStorage.getItem('bee_tracker_sync_declined') === 'true';
      if (localHives.length > 0 && !hasDeclinedSync) {
        if (confirm('Möchtest du deine bestehenden lokalen Bienendaten in dein Online-Konto übertragen?')) {
          await syncLocalToRemote();
          alert('Daten erfolgreich synchronisiert!');
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
    updateUIForStatus('processing');
    try {
      const data = await parseAudioWithGemini(audioBlob);
      if (!data) throw new Error('Ungültige Antwort der KI.');

      // Match Hive Name
      if (data.hiveName) {
        const hives = await getHives();
        const matchedHive = hives.find(h => 
          h.name.toLowerCase().includes(data.hiveName.toLowerCase()) || 
          data.hiveName.toLowerCase().includes(h.name.toLowerCase())
        );
        if (matchedHive) {
          document.getElementById('insp-form-hive-id').value = matchedHive.id;
          highlightField('insp-form-hive-id');
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
      errorDiv.innerText = err.message || 'Fehler bei der KI-Verarbeitung.';
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
      errorDiv.innerText = err.message || 'Fehler beim Analysieren des Belegs.';
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
