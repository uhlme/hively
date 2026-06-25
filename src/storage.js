// Data storage utility for Bee-Tracker using localStorage or Supabase DB
import { supabase } from './supabase.js';

const KEYS = {
  HIVES: 'bee_tracker_hives',
  INSPECTIONS: 'bee_tracker_inspections',
  FINANCES: 'bee_tracker_finances',
  HONEY: 'bee_tracker_honey',
  TASKS: 'bee_tracker_tasks',
  SYNC_QUEUE: 'bee_tracker_sync_queue'
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
    brood_frames: h.broodFrames ? parseInt(h.broodFrames) : 0,
    honey_frames_1: h.honeyFrames1 ? parseInt(h.honeyFrames1) : 0,
    honey_frames_2: h.honeyFrames2 ? parseInt(h.honeyFrames2) : 0,
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
    broodFrames: h.brood_frames || 0,
    honeyFrames1: h.honey_frames_1 || 0,
    honeyFrames2: h.honey_frames_2 || 0,
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
    weather_temp: i.weatherTemp !== undefined && i.weatherTemp !== '' ? parseFloat(i.weatherTemp) : null,
    weather_condition: i.weatherCondition || null,
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
    weatherTemp: i.weather_temp,
    weatherCondition: i.weather_condition,
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

// --- Sync Queue (Outbox) Helpers ---

function addToSyncQueue(action, type, payload) {
  const queue = JSON.parse(localStorage.getItem(KEYS.SYNC_QUEUE)) || [];
  const recordId = payload.id || payload;
  
  // Deduplicate upsert events to prevent flooding the database on sync
  const filteredQueue = queue.filter(item => {
    const itemRecordId = item.payload.id || item.payload;
    return !(itemRecordId === recordId && item.type === type && action === 'upsert' && item.action === 'upsert');
  });

  filteredQueue.push({
    id: 'sq_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
    action,
    type,
    payload,
    timestamp: Date.now()
  });
  
  localStorage.setItem(KEYS.SYNC_QUEUE, JSON.stringify(filteredQueue));
  console.log(`[Sync Queue] Added ${action} on ${type} (${recordId}). Total pending: ${filteredQueue.length}`);
}

export async function processSyncQueue() {
  if (!supabase) return;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;
  const userId = session.user.id;

  const queue = JSON.parse(localStorage.getItem(KEYS.SYNC_QUEUE)) || [];
  if (queue.length === 0) return;

  console.log(`[Sync Queue] Processing ${queue.length} pending offline operations...`);
  const failedItems = [];

  for (const item of queue) {
    try {
      if (item.action === 'upsert') {
        let dbData;
        let table;
        if (item.type === 'hives') {
          dbData = { ...mapHiveToDB(item.payload), user_id: userId };
          table = 'hives';
        } else if (item.type === 'inspections') {
          dbData = { ...mapInspectionToDB(item.payload), user_id: userId };
          table = 'inspections';
        } else if (item.type === 'finances') {
          dbData = { ...mapFinanceToDB(item.payload), user_id: userId };
          table = 'finances';
        } else if (item.type === 'honey_harvests') {
          dbData = { ...mapHoneyToDB(item.payload), user_id: userId };
          table = 'honey_harvests';
        }
        
        if (table && dbData) {
          const { error } = await supabase.from(table).upsert(dbData);
          if (error) throw error;
        }
      } else if (item.action === 'delete') {
        let table;
        if (item.type === 'hives') table = 'hives';
        else if (item.type === 'inspections') table = 'inspections';
        else if (item.type === 'finances') table = 'finances';
        else if (item.type === 'honey_harvests') table = 'honey_harvests';

        if (table) {
          const { error } = await supabase.from(table).delete().eq('id', item.payload);
          if (error) throw error;
        }
      }
    } catch (err) {
      console.error(`[Sync Queue] Failed to sync item ${item.id}:`, err);
      failedItems.push(item);
    }
  }

  localStorage.setItem(KEYS.SYNC_QUEUE, JSON.stringify(failedItems));
  console.log(`[Sync Queue] Processing complete. Pending left: ${failedItems.length}`);
}

export function getSyncQueueLength() {
  const queue = JSON.parse(localStorage.getItem(KEYS.SYNC_QUEUE)) || [];
  return queue.length;
}

// --- Hives CRUD ---

export async function getHives() {
  const isRemote = await useRemote();
  if (isRemote && navigator.onLine) {
    try {
      const { data, error } = await supabase.from('hives').select('*').order('name');
      if (error) throw error;
      const hives = data.map(mapHiveFromDB);
      localStorage.setItem(KEYS.HIVES, JSON.stringify(hives));
      return hives;
    } catch (err) {
      console.warn('Failed to fetch hives from Supabase, loading from local cache:', err);
    }
  }
  return JSON.parse(localStorage.getItem(KEYS.HIVES)) || [];
}

export async function getHiveById(id) {
  const hives = await getHives();
  return hives.find(h => h.id === id);
}

export async function saveHive(hive) {
  const isRemote = await useRemote();
  if (!hive.id) {
    hive.id = 'hive_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    hive.createdAt = new Date().toISOString();
  }
  hive.updatedAt = new Date().toISOString();

  // 1. Save to local storage first
  const hives = await getHives();
  const idx = hives.findIndex(h => h.id === hive.id);
  if (idx !== -1) {
    hives[idx] = { ...hives[idx], ...hive };
  } else {
    hives.push(hive);
  }
  localStorage.setItem(KEYS.HIVES, JSON.stringify(hives));

  // 2. Sync to Supabase or queue
  if (isRemote) {
    if (navigator.onLine) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const dbData = { ...mapHiveToDB(hive), user_id: session.user.id };
        const { error } = await supabase.from('hives').upsert(dbData);
        if (error) throw error;
      } catch (err) {
        console.warn('Failed to save hive to remote, queueing for sync:', err);
        addToSyncQueue('upsert', 'hives', hive);
      }
    } else {
      addToSyncQueue('upsert', 'hives', hive);
    }
  }
  return hive;
}

export async function deleteHive(id) {
  const isRemote = await useRemote();
  
  // 1. Delete locally first
  let hives = await getHives();
  hives = hives.filter(h => h.id !== id);
  localStorage.setItem(KEYS.HIVES, JSON.stringify(hives));

  // Cascade delete inspections and honey harvests locally
  let inspections = await getInspections();
  inspections = inspections.filter(i => i.hiveId !== id);
  localStorage.setItem(KEYS.INSPECTIONS, JSON.stringify(inspections));

  let honey = await getHoneyHarvests();
  honey = honey.filter(h => h.hiveId !== id);
  localStorage.setItem(KEYS.HONEY, JSON.stringify(honey));

  // 2. Delete remotely or queue
  if (isRemote) {
    if (navigator.onLine) {
      try {
        const { error } = await supabase.from('hives').delete().eq('id', id);
        if (error) throw error;
      } catch (err) {
        console.warn('Failed to delete hive from remote, queueing:', err);
        addToSyncQueue('delete', 'hives', id);
      }
    } else {
      addToSyncQueue('delete', 'hives', id);
    }
  }
}

// --- Inspections CRUD ---

export async function getInspections(hiveId = null) {
  const isRemote = await useRemote();
  if (isRemote && navigator.onLine) {
    try {
      const { data, error } = await supabase.from('inspections').select('*').order('date', { ascending: false });
      if (error) throw error;
      const inspections = data.map(mapInspectionFromDB);
      localStorage.setItem(KEYS.INSPECTIONS, JSON.stringify(inspections));
    } catch (err) {
      console.warn('Failed to fetch inspections from remote, using local cache:', err);
    }
  }

  const inspections = JSON.parse(localStorage.getItem(KEYS.INSPECTIONS)) || [];
  if (hiveId) {
    return inspections
      .filter(i => i.hiveId === hiveId)
      .sort((a, b) => new Date(b.date) - new Date(a.date));
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

  // 1. Save locally
  const inspections = JSON.parse(localStorage.getItem(KEYS.INSPECTIONS)) || [];
  const idx = inspections.findIndex(i => i.id === inspection.id);
  if (idx !== -1) {
    inspections[idx] = { ...inspections[idx], ...inspection };
  } else {
    inspections.push(inspection);
  }
  localStorage.setItem(KEYS.INSPECTIONS, JSON.stringify(inspections));

  // 2. Sync or queue
  if (isRemote) {
    if (navigator.onLine) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const dbData = { ...mapInspectionToDB(inspection), user_id: session.user.id };
        const { error } = await supabase.from('inspections').upsert(dbData);
        if (error) throw error;
      } catch (err) {
        console.warn('Failed to save inspection to remote, queueing:', err);
        addToSyncQueue('upsert', 'inspections', inspection);
      }
    } else {
      addToSyncQueue('upsert', 'inspections', inspection);
    }
  }
  return inspection;
}

export async function deleteInspection(id) {
  const isRemote = await useRemote();

  // 1. Delete locally
  let inspections = JSON.parse(localStorage.getItem(KEYS.INSPECTIONS)) || [];
  inspections = inspections.filter(i => i.id !== id);
  localStorage.setItem(KEYS.INSPECTIONS, JSON.stringify(inspections));

  // 2. Sync or queue
  if (isRemote) {
    if (navigator.onLine) {
      try {
        const { error } = await supabase.from('inspections').delete().eq('id', id);
        if (error) throw error;
      } catch (err) {
        console.warn('Failed to delete inspection from remote, queueing:', err);
        addToSyncQueue('delete', 'inspections', id);
      }
    } else {
      addToSyncQueue('delete', 'inspections', id);
    }
  }
}

// --- Finances CRUD ---

export async function getFinances() {
  const isRemote = await useRemote();
  if (isRemote && navigator.onLine) {
    try {
      const { data, error } = await supabase.from('finances').select('*').order('date', { ascending: false });
      if (error) throw error;
      const finances = data.map(mapFinanceFromDB);
      localStorage.setItem(KEYS.FINANCES, JSON.stringify(finances));
    } catch (err) {
      console.warn('Failed to fetch finances from remote, using local cache:', err);
    }
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

  // 1. Save locally
  const finances = JSON.parse(localStorage.getItem(KEYS.FINANCES)) || [];
  const idx = finances.findIndex(f => f.id === item.id);
  if (idx !== -1) {
    finances[idx] = { ...finances[idx], ...item };
  } else {
    finances.push(item);
  }
  localStorage.setItem(KEYS.FINANCES, JSON.stringify(finances));

  // 2. Sync or queue
  if (isRemote) {
    if (navigator.onLine) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const dbData = { ...mapFinanceToDB(item), user_id: session.user.id };
        const { error } = await supabase.from('finances').upsert(dbData);
        if (error) throw error;
      } catch (err) {
        console.warn('Failed to save finance to remote, queueing:', err);
        addToSyncQueue('upsert', 'finances', item);
      }
    } else {
      addToSyncQueue('upsert', 'finances', item);
    }
  }
  return item;
}

export async function deleteFinance(id) {
  const isRemote = await useRemote();

  // 1. Delete locally
  let finances = JSON.parse(localStorage.getItem(KEYS.FINANCES)) || [];
  finances = finances.filter(f => f.id !== id);
  localStorage.setItem(KEYS.FINANCES, JSON.stringify(finances));

  // 2. Sync or queue
  if (isRemote) {
    if (navigator.onLine) {
      try {
        const { error } = await supabase.from('finances').delete().eq('id', id);
        if (error) throw error;
      } catch (err) {
        console.warn('Failed to delete finance from remote, queueing:', err);
        addToSyncQueue('delete', 'finances', id);
      }
    } else {
      addToSyncQueue('delete', 'finances', id);
    }
  }
}

// --- Honey Harvests CRUD ---

export async function getHoneyHarvests() {
  const isRemote = await useRemote();
  if (isRemote && navigator.onLine) {
    try {
      const { data, error } = await supabase.from('honey_harvests').select('*').order('date', { ascending: false });
      if (error) throw error;
      const honey = data.map(mapHoneyFromDB);
      localStorage.setItem(KEYS.HONEY, JSON.stringify(honey));
    } catch (err) {
      console.warn('Failed to fetch honey harvests from remote, using local cache:', err);
    }
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

  // 1. Save locally
  const honey = JSON.parse(localStorage.getItem(KEYS.HONEY)) || [];
  const idx = honey.findIndex(h => h.id === harvest.id);
  if (idx !== -1) {
    honey[idx] = { ...honey[idx], ...harvest };
  } else {
    honey.push(harvest);
  }
  localStorage.setItem(KEYS.HONEY, JSON.stringify(honey));

  // 2. Sync or queue
  if (isRemote) {
    if (navigator.onLine) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const dbData = { ...mapHoneyToDB(harvest), user_id: session.user.id };
        const { error } = await supabase.from('honey_harvests').upsert(dbData);
        if (error) throw error;
      } catch (err) {
        console.warn('Failed to save honey harvest to remote, queueing:', err);
        addToSyncQueue('upsert', 'honey_harvests', harvest);
      }
    } else {
      addToSyncQueue('upsert', 'honey_harvests', harvest);
    }
  }
  return harvest;
}

export async function deleteHoneyHarvest(id) {
  const isRemote = await useRemote();

  // 1. Delete locally
  let honey = JSON.parse(localStorage.getItem(KEYS.HONEY)) || [];
  honey = honey.filter(h => h.id !== id);
  localStorage.setItem(KEYS.HONEY, JSON.stringify(honey));

  // 2. Sync or queue
  if (isRemote) {
    if (navigator.onLine) {
      try {
        const { error } = await supabase.from('honey_harvests').delete().eq('id', id);
        if (error) throw error;
      } catch (err) {
        console.warn('Failed to delete honey harvest from remote, queueing:', err);
        addToSyncQueue('delete', 'honey_harvests', id);
      }
    } else {
      addToSyncQueue('delete', 'honey_harvests', id);
    }
  }
}

// --- Tasks State (Calendar) ---

export async function getTasksState() {
  return JSON.parse(localStorage.getItem(KEYS.TASKS)) || {};
}

export async function saveTaskState(month, taskId, isChecked) {
  const tasks = JSON.parse(localStorage.getItem(KEYS.TASKS)) || {};
  if (!tasks[month]) tasks[month] = {};
  tasks[month][taskId] = isChecked;
  localStorage.setItem(KEYS.TASKS, JSON.stringify(tasks));
  return true;
}

// Sync Local Data to Supabase (manual migration trigger)
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
      broodFrames: 10,
      honeyFrames1: 8,
      honeyFrames2: 0,
      createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
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
      broodFrames: 10,
      honeyFrames1: 0,
      honeyFrames2: 0,
      createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()
    }
  ];

  const demoInspections = [
    {
      id: 'insp_demo_1',
      hiveId: 'hive_demo_1',
      date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      feeding: 'Nein',
      varroa: 'Keine Behandlung',
      broodStatus: 'Stifte, offene und verdeckelte Brut vorhanden',
      honeySuper: '2 Honigräume aufgesetzt',
      temperament: '5',
      notes: 'Schwarmstimmung kontrolliert, keine Spielnäpfchen bestiftet. Honigräume gut gefüllt.'
    },
    {
      id: 'insp_demo_2',
      hiveId: 'hive_demo_2',
      date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      feeding: '1:1 Zuckerwasser (3 Liter)',
      varroa: 'Ameisensäure (60% ad us. vet.)',
      broodStatus: 'Brutnest verkleinert, aber Brut in allen Stadien vorhanden',
      honeySuper: 'Kein Honigraum',
      temperament: '3',
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
