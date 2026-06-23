// Data storage utility for Bee-Tracker using localStorage
// Abstracts the data access so it can be easily upgraded to IndexedDB later if needed.

const KEYS = {
  HIVES: 'bee_tracker_hives',
  INSPECTIONS: 'bee_tracker_inspections',
  FINANCES: 'bee_tracker_finances',
  HONEY: 'bee_tracker_honey'
};

// Seed demo data if storage is empty
export function initStorage() {
  if (!localStorage.getItem(KEYS.HIVES)) {
    seedDemoData();
  }
}

// Hives CRUD
export function getHives() {
  return JSON.parse(localStorage.getItem(KEYS.HIVES)) || [];
}

export function getHiveById(id) {
  return getHives().find(h => h.id === id);
}

export function saveHive(hive) {
  const hives = getHives();
  if (hive.id) {
    const idx = hives.findIndex(h => h.id === hive.id);
    if (idx !== -1) {
      hives[idx] = { ...hives[idx], ...hive, updatedAt: new Date().toISOString() };
    }
  } else {
    hive.id = 'hive_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    hive.createdAt = new Date().toISOString();
    hive.updatedAt = hive.createdAt;
    hives.push(hive);
  }
  localStorage.setItem(KEYS.HIVES, JSON.stringify(hives));
  return hive;
}

export function deleteHive(id) {
  let hives = getHives();
  hives = hives.filter(h => h.id !== id);
  localStorage.setItem(KEYS.HIVES, JSON.stringify(hives));

  // Cascade delete inspections and honey harvests for this hive
  let inspections = getInspections();
  inspections = inspections.filter(i => i.hiveId !== id);
  localStorage.setItem(KEYS.INSPECTIONS, JSON.stringify(inspections));

  let honey = getHoneyHarvests();
  honey = honey.filter(h => h.hiveId !== id);
  localStorage.setItem(KEYS.HONEY, JSON.stringify(honey));
}

// Inspections CRUD
export function getInspections(hiveId = null) {
  const inspections = JSON.parse(localStorage.getItem(KEYS.INSPECTIONS)) || [];
  if (hiveId) {
    return inspections
      .filter(i => i.hiveId === hiveId)
      .sort((a, b) => new Date(b.date) - new Date(a.date)); // newest first
  }
  return inspections.sort((a, b) => new Date(b.date) - new Date(a.date));
}

export function saveInspection(inspection) {
  const inspections = JSON.parse(localStorage.getItem(KEYS.INSPECTIONS)) || [];
  if (inspection.id) {
    const idx = inspections.findIndex(i => i.id === inspection.id);
    if (idx !== -1) {
      inspections[idx] = { ...inspections[idx], ...inspection, updatedAt: new Date().toISOString() };
    }
  } else {
    inspection.id = 'insp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    inspection.createdAt = new Date().toISOString();
    inspection.updatedAt = inspection.createdAt;
    inspections.push(inspection);
  }
  localStorage.setItem(KEYS.INSPECTIONS, JSON.stringify(inspections));
  return inspection;
}

export function deleteInspection(id) {
  let inspections = JSON.parse(localStorage.getItem(KEYS.INSPECTIONS)) || [];
  inspections = inspections.filter(i => i.id !== id);
  localStorage.setItem(KEYS.INSPECTIONS, JSON.stringify(inspections));
}

// Finances CRUD
export function getFinances() {
  const finances = JSON.parse(localStorage.getItem(KEYS.FINANCES)) || [];
  return finances.sort((a, b) => new Date(b.date) - new Date(a.date));
}

export function saveFinance(item) {
  const finances = getFinances();
  if (item.id) {
    const idx = finances.findIndex(f => f.id === item.id);
    if (idx !== -1) {
      finances[idx] = { ...finances[idx], ...item, updatedAt: new Date().toISOString() };
    }
  } else {
    item.id = 'fin_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    item.createdAt = new Date().toISOString();
    item.updatedAt = item.createdAt;
    finances.push(item);
  }
  localStorage.setItem(KEYS.FINANCES, JSON.stringify(finances));
  return item;
}

export function deleteFinance(id) {
  let finances = getFinances();
  finances = finances.filter(f => f.id !== id);
  localStorage.setItem(KEYS.FINANCES, JSON.stringify(finances));
}

// Honey Harvests CRUD
export function getHoneyHarvests() {
  const honey = JSON.parse(localStorage.getItem(KEYS.HONEY)) || [];
  return honey.sort((a, b) => new Date(b.date) - new Date(a.date));
}

export function saveHoneyHarvest(harvest) {
  const honey = getHoneyHarvests();
  if (harvest.id) {
    const idx = honey.findIndex(h => h.id === harvest.id);
    if (idx !== -1) {
      honey[idx] = { ...honey[idx], ...harvest, updatedAt: new Date().toISOString() };
    }
  } else {
    harvest.id = 'honey_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    harvest.createdAt = new Date().toISOString();
    harvest.updatedAt = harvest.createdAt;
    honey.push(harvest);
  }
  localStorage.setItem(KEYS.HONEY, JSON.stringify(honey));
  return harvest;
}

export function deleteHoneyHarvest(id) {
  let honey = getHoneyHarvests();
  honey = honey.filter(h => h.id !== id);
  localStorage.setItem(KEYS.HONEY, JSON.stringify(honey));
}

// Export/Import JSON Backup
export function exportData() {
  const data = {
    hives: getHives(),
    inspections: getInspections(),
    finances: getFinances(),
    honey: getHoneyHarvests(),
    exportedAt: new Date().toISOString()
  };
  return JSON.stringify(data, null, 2);
}

export function importData(jsonString) {
  try {
    const data = JSON.parse(jsonString);
    if (data.hives && Array.isArray(data.hives)) {
      localStorage.setItem(KEYS.HIVES, JSON.stringify(data.hives));
    }
    if (data.inspections && Array.isArray(data.inspections)) {
      localStorage.setItem(KEYS.INSPECTIONS, JSON.stringify(data.inspections));
    }
    if (data.finances && Array.isArray(data.finances)) {
      localStorage.setItem(KEYS.FINANCES, JSON.stringify(data.finances));
    }
    if (data.honey && Array.isArray(data.honey)) {
      localStorage.setItem(KEYS.HONEY, JSON.stringify(data.honey));
    }
    return true;
  } catch (e) {
    console.error('Failed to import data', e);
    return false;
  }
}

// Seed Demo Data
export function seedDemoData() {
  const demoHives = [
    {
      id: 'hive_demo_1',
      name: 'Kasten 1 - Apfelwiese',
      queenName: 'Berta',
      queenColor: 'white', // 2026: Weiß
      queenYear: 2026,
      breed: 'Carnica',
      status: 'Gesund',
      notes: 'Sehr starkes Volk, sanftmütig und fleißig.',
      createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days ago
    },
    {
      id: 'hive_demo_2',
      name: 'Kasten 2 - Waldrand',
      queenName: 'Cleo',
      queenColor: 'blue', // 2025: Blau
      queenYear: 2025,
      breed: 'Buckfast',
      status: 'Varroa-Behandlung',
      notes: 'Königin gezeichnet. Aktuell Ameisensäure-Behandlung.',
      createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString() // 60 days ago
    }
  ];

  const demoInspections = [
    {
      id: 'insp_demo_1',
      hiveId: 'hive_demo_1',
      date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 2 days ago
      feeding: 'Nein',
      varroa: 'Keine Behandlung',
      broodStatus: 'Stifte, offene und verdeckelte Brut vorhanden',
      honeySuper: '2 Honigräume aufgesetzt',
      temperament: '5', // Sehr sanft
      notes: 'Schwarmstimmung kontrolliert, keine Spielnäpfchen bestiftet. Honigräume gut gefüllt.'
    },
    {
      id: 'insp_demo_2',
      hiveId: 'hive_demo_2',
      date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 5 days ago
      feeding: '1:1 Zuckerwasser (3 Liter)',
      varroa: 'Ameisensäure (60% ad us. vet.)',
      broodStatus: 'Brutnest verkleinert, aber Brut in allen Stadien vorhanden',
      honeySuper: 'Kein Honigraum',
      temperament: '3', // Mäßig
      notes: 'Ameisensäure-Verdunster eingesetzt. Milbenfall kontrollieren.'
    }
  ];

  const demoFinances = [
    {
      id: 'fin_demo_1',
      date: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      description: 'Zucker für Einfütterung (50 kg)',
      category: 'Futter',
      price: 54.90,
      type: 'expense'
    },
    {
      id: 'fin_demo_2',
      date: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      description: 'Verkauf Blütenhonig (10 Gläser á 500g)',
      category: 'Honigverkauf',
      price: 75.00,
      type: 'income'
    },
    {
      id: 'fin_demo_3',
      date: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      description: 'Neue Liebig-Zanderbeute komplett',
      category: 'Hardware',
      price: 139.00,
      type: 'expense'
    }
  ];

  const demoHoney = [
    {
      id: 'honey_demo_1',
      hiveId: 'hive_demo_1',
      date: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      amount: 18.5,
      type: 'Frühtracht'
    },
    {
      id: 'honey_demo_2',
      hiveId: 'hive_demo_2',
      date: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      amount: 12.0,
      type: 'Frühtracht'
    }
  ];

  localStorage.setItem(KEYS.HIVES, JSON.stringify(demoHives));
  localStorage.setItem(KEYS.INSPECTIONS, JSON.stringify(demoInspections));
  localStorage.setItem(KEYS.FINANCES, JSON.stringify(demoFinances));
  localStorage.setItem(KEYS.HONEY, JSON.stringify(demoHoney));
}
