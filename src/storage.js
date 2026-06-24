// Data storage utility for Bee-Tracker using localStorage or Supabase DB
import { supabase } from './supabase.js';

const KEYS = {
  HIVES: 'bee_tracker_hives',
  INSPECTIONS: 'bee_tracker_inspections',
  FINANCES: 'bee_tracker_finances',
  HONEY: 'bee_tracker_honey'
};

// Check if user is logged in
export async function getSession() {
  if (!supabase) return null;
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

async function useRemote() {
  if (!supabase) return false;
  const { data: { session } } = await supabase.auth.getSession();
  return !!session;
}

// Mappers between Local (camelCase) and DB (snake_case)
function mapHiveToDB(h) {
  return {
    id: h.id,
    name: h.name,
    queen_name: h.queenName || null,
    queen_year: h.queenYear ? parseInt(h.queenYear) : null,
    queen_color: h.queenColor || null,
    breed: h.breed || null,
    status: h.status || 'Gesund',
    notes: h.notes || null,
    created_at: h.createdAt || new Date().toISOString(),
    updated_at: h.updatedAt || new Date().toISOString()
  };
}

function mapHiveFromDB(h) {
  return {
    id: h.id,
    name: h.name,
    queenName: h.queen_name,
    queenYear: h.queen_year,
    queenColor: h.queen_color,
    breed: h.breed,
    status: h.status,
    notes: h.notes,
    createdAt: h.created_at,
    updatedAt: h.updated_at
  };
}

function mapInspectionToDB(i) {
  return {
    id: i.id,
    hive_id: i.hiveId,
    date: i.date,
    feeding: i.feeding || null,
    varroa: i.varroa || null,
    brood_status: i.broodStatus || null,
    honey_super: i.honeySuper || null,
    temperament: i.temperament ? parseInt(i.temperament) : 5,
    notes: i.notes || null,
    created_at: i.createdAt || new Date().toISOString(),
    updated_at: i.updatedAt || new Date().toISOString()
  };
}

function mapInspectionFromDB(i) {
  return {
    id: i.id,
    hiveId: i.hive_id,
    date: i.date,
    feeding: i.feeding,
    varroa: i.varroa,
    broodStatus: i.brood_status,
    honeySuper: i.honey_super,
    temperament: i.temperament,
    notes: i.notes,
    createdAt: i.created_at,
    updatedAt: i.updated_at
  };
}

function mapFinanceToDB(f) {
  return {
    id: f.id,
    date: f.date,
    description: f.description,
    category: f.category || null,
    price: parseFloat(f.price),
    type: f.type || 'expense',
    created_at: f.createdAt || new Date().toISOString(),
    updated_at: f.updatedAt || new Date().toISOString()
  };
}

function mapFinanceFromDB(f) {
  return {
    id: f.id,
    date: f.date,
    description: f.description,
    category: f.category,
    price: parseFloat(f.price),
    type: f.type,
    createdAt: f.created_at,
    updatedAt: f.updated_at
  };
}

function mapHoneyToDB(h) {
  return {
    id: h.id,
    hive_id: h.hiveId,
    date: h.date,
    amount: parseFloat(h.amount),
    type: h.type || null,
    created_at: h.createdAt || new Date().toISOString(),
    updated_at: h.updatedAt || new Date().toISOString()
  };
}

function mapHoneyFromDB(h) {
  return {
    id: h.id,
    hiveId: h.hive_id,
    date: h.date,
    amount: parseFloat(h.amount),
    type: h.type,
    createdAt: h.created_at,
    updatedAt: h.updated_at
  };
}

// Seed demo data if storage is empty
export async function initStorage() {
  if (await useRemote()) {
    return; // Online session, no demo data seeding
  }
  if (!localStorage.getItem(KEYS.HIVES) && !localStorage.getItem('bee_tracker_demo_seeded')) {
    seedDemoData();
    localStorage.setItem('bee_tracker_demo_seeded', 'true');
  }
}

// Hives CRUD
export async function getHives() {
  if (await useRemote()) {
    const { data, error } = await supabase.from('hives').select('*').order('name');
    if (error) {
      console.error('Error fetching hives from Supabase:', error);
      return [];
    }
    return data.map(mapHiveFromDB);
  }
  return JSON.parse(localStorage.getItem(KEYS.HIVES)) || [];
}

export async function getHiveById(id) {
  if (await useRemote()) {
    const { data, error } = await supabase.from('hives').select('*').eq('id', id).single();
    if (error) {
      console.error('Error fetching hive from Supabase:', error);
      return null;
    }
    return mapHiveFromDB(data);
  }
  return (await getHives()).find(h => h.id === id);
}

export async function saveHive(hive) {
  const isRemote = await useRemote();
  if (!hive.id) {
    hive.id = 'hive_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    hive.createdAt = new Date().toISOString();
  }
  hive.updatedAt = new Date().toISOString();

  if (isRemote) {
    const { data: { session } } = await supabase.auth.getSession();
    const dbData = { ...mapHiveToDB(hive), user_id: session.user.id };
    const { error } = await supabase.from('hives').upsert(dbData);
    if (error) {
      console.error('Error saving hive to Supabase:', error);
      throw error;
    }
    return hive;
  }

  const hives = await getHives();
  const idx = hives.findIndex(h => h.id === hive.id);
  if (idx !== -1) {
    hives[idx] = { ...hives[idx], ...hive };
  } else {
    hives.push(hive);
  }
  localStorage.setItem(KEYS.HIVES, JSON.stringify(hives));
  return hive;
}

export async function deleteHive(id) {
  if (await useRemote()) {
    const { error } = await supabase.from('hives').delete().eq('id', id);
    if (error) {
      console.error('Error deleting hive from Supabase:', error);
      throw error;
    }
    return;
  }

  let hives = await getHives();
  hives = hives.filter(h => h.id !== id);
  localStorage.setItem(KEYS.HIVES, JSON.stringify(hives));

  // Cascade delete inspections and honey harvests for this hive locally
  let inspections = await getInspections();
  inspections = inspections.filter(i => i.hiveId !== id);
  localStorage.setItem(KEYS.INSPECTIONS, JSON.stringify(inspections));

  let honey = await getHoneyHarvests();
  honey = honey.filter(h => h.hiveId !== id);
  localStorage.setItem(KEYS.HONEY, JSON.stringify(honey));
}

// Inspections CRUD
export async function getInspections(hiveId = null) {
  if (await useRemote()) {
    let query = supabase.from('inspections').select('*').order('date', { ascending: false });
    if (hiveId) {
      query = query.eq('hive_id', hiveId);
    }
    const { data, error } = await query;
    if (error) {
      console.error('Error fetching inspections from Supabase:', error);
      return [];
    }
    return data.map(mapInspectionFromDB);
  }

  const inspections = JSON.parse(localStorage.getItem(KEYS.INSPECTIONS)) || [];
  if (hiveId) {
    return inspections
      .filter(i => i.hiveId === hiveId)
      .sort((a, b) => new Date(b.date) - new Date(a.date)); // newest first
  }
  return inspections.sort((a, b) => new Date(b.date) - new Date(a.date));
}

export async function saveInspection(inspection) {
  const isRemote = await useRemote();
  if (!inspection.id) {
    inspection.id = 'insp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    inspection.createdAt = new Date().toISOString();
  }
  inspection.updatedAt = new Date().toISOString();

  if (isRemote) {
    const { data: { session } } = await supabase.auth.getSession();
    const dbData = { ...mapInspectionToDB(inspection), user_id: session.user.id };
    const { error } = await supabase.from('inspections').upsert(dbData);
    if (error) {
      console.error('Error saving inspection to Supabase:', error);
      throw error;
    }
    return inspection;
  }

  const inspections = JSON.parse(localStorage.getItem(KEYS.INSPECTIONS)) || [];
  const idx = inspections.findIndex(i => i.id === inspection.id);
  if (idx !== -1) {
    inspections[idx] = { ...inspections[idx], ...inspection };
  } else {
    inspections.push(inspection);
  }
  localStorage.setItem(KEYS.INSPECTIONS, JSON.stringify(inspections));
  return inspection;
}

export async function deleteInspection(id) {
  if (await useRemote()) {
    const { error } = await supabase.from('inspections').delete().eq('id', id);
    if (error) {
      console.error('Error deleting inspection from Supabase:', error);
      throw error;
    }
    return;
  }

  let inspections = JSON.parse(localStorage.getItem(KEYS.INSPECTIONS)) || [];
  inspections = inspections.filter(i => i.id !== id);
  localStorage.setItem(KEYS.INSPECTIONS, JSON.stringify(inspections));
}

// Finances CRUD
export async function getFinances() {
  if (await useRemote()) {
    const { data, error } = await supabase.from('finances').select('*').order('date', { ascending: false });
    if (error) {
      console.error('Error fetching finances from Supabase:', error);
      return [];
    }
    return data.map(mapFinanceFromDB);
  }

  const finances = JSON.parse(localStorage.getItem(KEYS.FINANCES)) || [];
  return finances.sort((a, b) => new Date(b.date) - new Date(a.date));
}

export async function saveFinance(item) {
  const isRemote = await useRemote();
  if (!item.id) {
    item.id = 'fin_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    item.createdAt = new Date().toISOString();
  }
  item.updatedAt = new Date().toISOString();

  if (isRemote) {
    const { data: { session } } = await supabase.auth.getSession();
    const dbData = { ...mapFinanceToDB(item), user_id: session.user.id };
    const { error } = await supabase.from('finances').upsert(dbData);
    if (error) {
      console.error('Error saving finance to Supabase:', error);
      throw error;
    }
    return item;
  }

  const finances = await getFinances();
  const idx = finances.findIndex(f => f.id === item.id);
  if (idx !== -1) {
    finances[idx] = { ...finances[idx], ...item };
  } else {
    finances.push(item);
  }
  localStorage.setItem(KEYS.FINANCES, JSON.stringify(finances));
  return item;
}

export async function deleteFinance(id) {
  if (await useRemote()) {
    const { error } = await supabase.from('finances').delete().eq('id', id);
    if (error) {
      console.error('Error deleting finance from Supabase:', error);
      throw error;
    }
    return;
  }

  let finances = await getFinances();
  finances = finances.filter(f => f.id !== id);
  localStorage.setItem(KEYS.FINANCES, JSON.stringify(finances));
}

// Honey Harvests CRUD
export async function getHoneyHarvests() {
  if (await useRemote()) {
    const { data, error } = await supabase.from('honey_harvests').select('*').order('date', { ascending: false });
    if (error) {
      console.error('Error fetching honey harvests from Supabase:', error);
      return [];
    }
    return data.map(mapHoneyFromDB);
  }

  const honey = JSON.parse(localStorage.getItem(KEYS.HONEY)) || [];
  return honey.sort((a, b) => new Date(b.date) - new Date(a.date));
}

export async function saveHoneyHarvest(harvest) {
  const isRemote = await useRemote();
  if (!harvest.id) {
    harvest.id = 'honey_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    harvest.createdAt = new Date().toISOString();
  }
  harvest.updatedAt = new Date().toISOString();

  if (isRemote) {
    const { data: { session } } = await supabase.auth.getSession();
    const dbData = { ...mapHoneyToDB(harvest), user_id: session.user.id };
    const { error } = await supabase.from('honey_harvests').upsert(dbData);
    if (error) {
      console.error('Error saving honey harvest to Supabase:', error);
      throw error;
    }
    return harvest;
  }

  const honey = await getHoneyHarvests();
  const idx = honey.findIndex(h => h.id === harvest.id);
  if (idx !== -1) {
    honey[idx] = { ...honey[idx], ...harvest };
  } else {
    honey.push(harvest);
  }
  localStorage.setItem(KEYS.HONEY, JSON.stringify(honey));
  return harvest;
}

export async function deleteHoneyHarvest(id) {
  if (await useRemote()) {
    const { error } = await supabase.from('honey_harvests').delete().eq('id', id);
    if (error) {
      console.error('Error deleting honey harvest from Supabase:', error);
      throw error;
    }
    return;
  }

  let honey = await getHoneyHarvests();
  honey = honey.filter(h => h.id !== id);
  localStorage.setItem(KEYS.HONEY, JSON.stringify(honey));
}

// Sync Local Data to Supabase
export async function syncLocalToRemote() {
  if (!supabase) return false;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return false;
  
  const userId = session.user.id;

  // Sync hives
  const hives = JSON.parse(localStorage.getItem(KEYS.HIVES)) || [];
  if (hives.length > 0) {
    const dbHives = hives.map(h => ({ ...mapHiveToDB(h), user_id: userId }));
    const { error } = await supabase.from('hives').upsert(dbHives);
    if (error) console.error('Error syncing hives:', error);
  }

  // Sync inspections
  const inspections = JSON.parse(localStorage.getItem(KEYS.INSPECTIONS)) || [];
  if (inspections.length > 0) {
    const dbInspections = inspections.map(i => ({ ...mapInspectionToDB(i), user_id: userId }));
    const { error } = await supabase.from('inspections').upsert(dbInspections);
    if (error) console.error('Error syncing inspections:', error);
  }

  // Sync finances
  const finances = JSON.parse(localStorage.getItem(KEYS.FINANCES)) || [];
  if (finances.length > 0) {
    const dbFinances = finances.map(f => ({ ...mapFinanceToDB(f), user_id: userId }));
    const { error } = await supabase.from('finances').upsert(dbFinances);
    if (error) console.error('Error syncing finances:', error);
  }

  // Sync honey
  const honey = JSON.parse(localStorage.getItem(KEYS.HONEY)) || [];
  if (honey.length > 0) {
    const dbHoney = honey.map(h => ({ ...mapHoneyToDB(h), user_id: userId }));
    const { error } = await supabase.from('honey_harvests').upsert(dbHoney);
    if (error) console.error('Error syncing honey:', error);
  }

  // Clean local storage entries after successful sync
  localStorage.removeItem(KEYS.HIVES);
  localStorage.removeItem(KEYS.INSPECTIONS);
  localStorage.removeItem(KEYS.FINANCES);
  localStorage.removeItem(KEYS.HONEY);

  return true;
}

// Export/Import JSON Backup (for local backup/restore)
export async function exportData() {
  const data = {
    hives: await getHives(),
    inspections: await getInspections(),
    finances: await getFinances(),
    honey: await getHoneyHarvests(),
    exportedAt: new Date().toISOString()
  };
  return JSON.stringify(data, null, 2);
}

export async function importData(jsonString) {
  try {
    const data = JSON.parse(jsonString);
    const isRemote = await useRemote();

    if (isRemote) {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session.user.id;

      if (data.hives && Array.isArray(data.hives)) {
        const dbHives = data.hives.map(h => ({ ...mapHiveToDB(h), user_id: userId }));
        await supabase.from('hives').upsert(dbHives);
      }
      if (data.inspections && Array.isArray(data.inspections)) {
        const dbInspections = data.inspections.map(i => ({ ...mapInspectionToDB(i), user_id: userId }));
        await supabase.from('inspections').upsert(dbInspections);
      }
      if (data.finances && Array.isArray(data.finances)) {
        const dbFinances = data.finances.map(f => ({ ...mapFinanceToDB(f), user_id: userId }));
        await supabase.from('finances').upsert(dbFinances);
      }
      if (data.honey && Array.isArray(data.honey)) {
        const dbHoney = data.honey.map(h => ({ ...mapHoneyToDB(h), user_id: userId }));
        await supabase.from('honey_harvests').upsert(dbHoney);
      }
    } else {
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
