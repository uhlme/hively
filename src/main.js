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
  seedDemoData
} from './storage.js';

// --- Service Worker Registration ---
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => console.log('Service Worker registered successfully:', reg.scope))
      .catch(err => console.error('Service Worker registration failed:', err));
  });
}

// --- State Variables ---
let currentView = 'dashboard';
let activeHiveIdForDetail = null;
let currentFinanceTab = 'expenses'; // 'expenses' or 'honey'

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

// --- App Initialization ---
document.addEventListener('DOMContentLoaded', () => {
  initStorage();
  setupRouting();
  setupModals();
  setupForms();
  setupSettings();
  
  // Initial render
  navigate(currentView);
});

// --- Routing / View Swapping ---
function setupRouting() {
  const navItems = document.querySelectorAll('nav.bottom-nav .nav-item');
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const view = item.getAttribute('data-view');
      navigate(view);
    });
  });

  // Top header quick-add button
  document.getElementById('btn-quick-add').addEventListener('click', () => {
    openHiveModal();
  });

  // Back button on detail view
  document.getElementById('btn-back-to-hives').addEventListener('click', () => {
    navigate('hives');
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
  
  tabExpenses.addEventListener('click', () => {
    tabExpenses.classList.add('active');
    tabHoney.classList.remove('active');
    currentFinanceTab = 'expenses';
    renderFinanceView();
  });

  tabHoney.addEventListener('click', () => {
    tabHoney.classList.add('active');
    tabExpenses.classList.remove('active');
    currentFinanceTab = 'honey';
    renderFinanceView();
  });

  // Finance list buttons
  document.getElementById('btn-add-expense').addEventListener('click', () => {
    openFinanceModal();
  });
  document.getElementById('btn-add-honey').addEventListener('click', () => {
    openHoneyModal();
  });
}

function navigate(viewName) {
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
    renderDashboardView();
  } else if (viewName === 'hives') {
    renderHivesView();
  } else if (viewName === 'hive-detail') {
    renderHiveDetailView();
  } else if (viewName === 'finances') {
    renderFinanceView();
  }
}

// --- Dynamic Rendering ---

function renderDashboardView() {
  const hives = getHives();
  const honey = getHoneyHarvests();
  const finances = getFinances();

  // Statistics
  document.getElementById('stat-hives-count').innerText = hives.filter(h => h.status !== 'Aufgelöst').length;
  
  const totalHoney = honey.reduce((sum, h) => sum + parseFloat(h.amount || 0), 0);
  document.getElementById('stat-honey-weight').innerText = totalHoney.toFixed(1);

  const totalExpenses = finances
    .filter(f => f.type === 'expense' || !f.type) // old data might not have type, fallback to expenses
    .reduce((sum, f) => sum + parseFloat(f.price || 0), 0);
  document.getElementById('stat-expenses-sum').innerText = totalExpenses.toLocaleString('de-CH', { style: 'currency', currency: 'CHF' });

  // Recent activities list (Inspections & Harvests merged, newest first)
  const inspections = getInspections();
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

  recentList.innerHTML = activities.slice(0, 5).map(act => `
    <div class="card" style="padding: 12px; margin-bottom: 10px;">
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
}

function renderHivesView() {
  const hives = getHives();
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
    card.addEventListener('click', () => {
      activeHiveIdForDetail = card.getAttribute('data-id');
      navigate('hive-detail');
    });
  });
}

function renderHiveDetailView() {
  const hive = getHiveById(activeHiveIdForDetail);
  if (!hive) {
    navigate('hives');
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
  const inspections = getInspections(activeHiveIdForDetail);
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
    const stars = '★'.repeat(parseInt(insp.temperament || 5)) + '☆'.repeat(5 - parseInt(insp.temperament || 5));
    return `
      <div class="log-item inspection-log-card" data-id="${insp.id}">
        <div class="log-item-header">
          <span>${formatDateString(insp.date)}</span>
          <span style="color: var(--primary); font-size: 0.9rem;">${stars}</span>
        </div>
        <div style="margin-bottom: 6px; font-size: 0.9rem;">
          ${insp.broodStatus ? `<div>🔍 <strong>Brut:</strong> ${insp.broodStatus}</div>` : ''}
          ${insp.honeySuper ? `<div>🍯 <strong>Honigraum:</strong> ${insp.honeySuper}</div>` : ''}
          ${insp.feeding && insp.feeding !== 'Nein' ? `<div>🌾 <strong>Futter:</strong> ${insp.feeding}</div>` : ''}
          ${insp.varroa && insp.varroa !== 'Keine Behandlung' ? `<div>🕷️ <strong>Varroa:</strong> ${insp.varroa}</div>` : ''}
        </div>
        ${insp.notes ? `<p class="text-secondary" style="font-size: 0.85rem; border-top: 1px solid rgba(255,255,255,0.03); padding-top: 6px; margin-top: 6px; font-style: italic;">"${insp.notes}"</p>` : ''}
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

function renderFinanceView() {
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
    const finances = getFinances().filter(f => f.type === 'expense' || !f.type);
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
      btn.addEventListener('click', () => {
        if (confirm('Kauf wirklich löschen?')) {
          deleteFinance(btn.getAttribute('data-id'));
          renderFinanceView();
          renderDashboardView();
        }
      });
    });

  } else {
    sectionExpenses.classList.add('hidden');
    sectionHoney.classList.remove('hidden');
    document.getElementById('btn-quick-add').innerText = '+ Ernte';

    // Render Honey Yields
    const honey = getHoneyHarvests();
    const hives = getHives();
    
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
      btn.addEventListener('click', () => {
        if (confirm('Erntebeleg wirklich löschen?')) {
          deleteHoneyHarvest(btn.getAttribute('data-id'));
          renderFinanceView();
          renderDashboardView();
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
    document.getElementById('hive-form-notes').value = hive.notes || '';
    deleteBtn.style.display = 'block';
  } else {
    title.innerText = 'Neues Volk erfassen';
    document.getElementById('hive-form-id').value = '';
    document.getElementById('hive-form-queen-name').value = '';
    document.getElementById('hive-form-queen-year').value = new Date().getFullYear();
    deleteBtn.style.display = 'none';
  }

  openModal('modal-hive');
}

function openInspectionModal(inspection = null, preselectedHiveId = null) {
  const form = document.getElementById('form-inspection');
  const deleteBtn = document.getElementById('btn-delete-inspection');
  form.reset();

  // Populate Hive dropdown
  const hiveSelect = document.getElementById('insp-form-hive-id');
  const hives = getHives();
  
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
    document.getElementById('insp-form-brood').value = inspection.broodStatus || '';
    document.getElementById('insp-form-honey-super').value = inspection.honeySuper || '';
    document.getElementById('insp-form-temperament').value = inspection.temperament || '5';
    document.getElementById('insp-form-feeding').value = inspection.feeding || 'Nein';
    document.getElementById('insp-form-varroa').value = inspection.varroa || 'Keine Behandlung';
    document.getElementById('insp-form-notes').value = inspection.notes || '';
    deleteBtn.style.display = 'block';
  } else {
    document.getElementById('insp-form-id').value = '';
    document.getElementById('insp-form-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('insp-form-temperament').value = '5';
    document.getElementById('insp-form-feeding').value = 'Nein';
    document.getElementById('insp-form-varroa').value = 'Keine Behandlung';
    deleteBtn.style.display = 'none';

    if (preselectedHiveId) {
      document.getElementById('insp-form-hive-id').value = preselectedHiveId;
    }
  }

  openModal('modal-inspection');
}

function openFinanceModal(finance = null) {
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

function openHoneyModal(honey = null) {
  const form = document.getElementById('form-honey');
  const deleteBtn = document.getElementById('btn-delete-honey');
  form.reset();

  // Populate Hive dropdown
  const hiveSelect = document.getElementById('honey-form-hive-id');
  const hives = getHives();

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
  document.getElementById('form-hive').addEventListener('submit', (e) => {
    e.preventDefault();
    const id = document.getElementById('hive-form-id').value;
    const hive = {
      name: document.getElementById('hive-form-name').value,
      queenName: document.getElementById('hive-form-queen-name').value,
      breed: document.getElementById('hive-form-breed').value,
      queenYear: parseInt(document.getElementById('hive-form-queen-year').value),
      status: document.getElementById('hive-form-status').value,
      notes: document.getElementById('hive-form-notes').value
    };

    if (id) hive.id = id;

    const saved = saveHive(hive);
    closeModal('modal-hive');
    
    if (id) {
      // In details view, reload detail info
      renderHiveDetailView();
    } else {
      // Navigate to list
      navigate('hives');
    }
    renderDashboardView();
  });

  // Hive Delete Button
  document.getElementById('btn-delete-hive').addEventListener('click', () => {
    const id = document.getElementById('hive-form-id').value;
    if (id && confirm('Möchtest du dieses Volk und alle dazugehörigen Durchsichten unwiderruflich löschen?')) {
      deleteHive(id);
      closeModal('modal-hive');
      navigate('hives');
      renderDashboardView();
    }
  });

  // Inspection Form Submit
  document.getElementById('form-inspection').addEventListener('submit', (e) => {
    e.preventDefault();
    const id = document.getElementById('insp-form-id').value;
    const inspection = {
      hiveId: document.getElementById('insp-form-hive-id').value,
      date: document.getElementById('insp-form-date').value,
      broodStatus: document.getElementById('insp-form-brood').value,
      honeySuper: document.getElementById('insp-form-honey-super').value,
      temperament: document.getElementById('insp-form-temperament').value,
      feeding: document.getElementById('insp-form-feeding').value,
      varroa: document.getElementById('insp-form-varroa').value,
      notes: document.getElementById('insp-form-notes').value
    };

    if (id) inspection.id = id;

    saveInspection(inspection);
    closeModal('modal-inspection');

    // Refresh view
    if (currentView === 'hive-detail') {
      renderHiveDetailView();
    } else {
      navigate('dashboard');
    }
    renderDashboardView();
  });

  // Inspection Delete Button
  document.getElementById('btn-delete-inspection').addEventListener('click', () => {
    const id = document.getElementById('insp-form-id').value;
    if (id && confirm('Diese Durchsicht wirklich löschen?')) {
      deleteInspection(id);
      closeModal('modal-inspection');
      if (currentView === 'hive-detail') {
        renderHiveDetailView();
      }
      renderDashboardView();
    }
  });

  // Finance Form Submit (Expenses)
  document.getElementById('form-finance').addEventListener('submit', (e) => {
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

    saveFinance(item);
    closeModal('modal-finance');
    
    if (currentView === 'finances') {
      renderFinanceView();
    } else {
      navigate('finances');
    }
    renderDashboardView();
  });

  // Honey Form Submit (Honey Harvests)
  document.getElementById('form-honey').addEventListener('submit', (e) => {
    e.preventDefault();
    const id = document.getElementById('honey-form-id').value;
    const harvest = {
      hiveId: document.getElementById('honey-form-hive-id').value,
      date: document.getElementById('honey-form-date').value,
      amount: parseFloat(document.getElementById('honey-form-amount').value),
      type: document.getElementById('honey-form-type').value
    };

    if (id) harvest.id = id;

    saveHoneyHarvest(harvest);
    closeModal('modal-honey');

    if (currentView === 'finances') {
      currentFinanceTab = 'honey';
      const tabExpenses = document.getElementById('tab-fin-expenses');
      const tabHoney = document.getElementById('tab-fin-honey');
      tabExpenses.classList.remove('active');
      tabHoney.classList.add('active');
      renderFinanceView();
    } else {
      navigate('finances');
      currentFinanceTab = 'honey';
      const tabExpenses = document.getElementById('tab-fin-expenses');
      const tabHoney = document.getElementById('tab-fin-honey');
      tabExpenses.classList.remove('active');
      tabHoney.classList.add('active');
      renderFinanceView();
    }
    renderDashboardView();
  });
}

// --- Backup & Settings Administration ---
function setupSettings() {
  // Export Data
  document.getElementById('btn-export-backup').addEventListener('click', () => {
    const dataStr = exportData();
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
    reader.onload = (evt) => {
      const success = importData(evt.target.result);
      if (success) {
        alert('Daten erfolgreich importiert!');
        navigate('dashboard');
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
}
