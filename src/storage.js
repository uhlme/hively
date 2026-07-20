// Data storage utility for Bee-Tracker using localStorage or Supabase DB
import { supabase } from './supabase.js';
import { safeJsonParse } from './utils.js';
import { getNetworkPrefs, shouldUseBackgroundNetwork } from './network.js';

const KEYS = {
  HIVES: 'bee_tracker_hives',
  INSPECTIONS: 'bee_tracker_inspections',
  FINANCES: 'bee_tracker_finances',
  HONEY: 'bee_tracker_honey',
  TASKS: 'bee_tracker_tasks',
  SYNC_QUEUE: 'bee_tracker_sync_queue',
  LAST_PULL: 'bee_tracker_last_pull'
};

function readLocalArray(key) {
  return safeJsonParse(localStorage.getItem(key), []) || [];
}

function readLocalObject(key) {
  return safeJsonParse(localStorage.getItem(key), {}) || {};
}

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
    hive_id: f.hiveId || null,
    sponsor_name: f.sponsorName || null,
    notes: f.notes || null,
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
    hiveId: f.hive_id,
    sponsorName: f.sponsor_name,
    notes: f.notes,
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

function getLastPullMap() {
  return readLocalObject(KEYS.LAST_PULL);
}

function setLastPull(entity) {
  const map = getLastPullMap();
  map[entity] = Date.now();
  localStorage.setItem(KEYS.LAST_PULL, JSON.stringify(map));
}

function isPullFresh(entity) {
  const map = getLastPullMap();
  const ts = map[entity];
  if (!ts) return false;
  const ttl = getNetworkPrefs().remotePullTtlMs || 15 * 60 * 1000;
  return Date.now() - ts < ttl;
}

/** Prefer local cache; only pull remote when online, fresh TTL expired, and no pending outbox. */
function shouldPullRemote(entity) {
  if (!navigator.onLine) return false;
  if (getSyncQueueLength() > 0) return false;
  if (!shouldUseBackgroundNetwork()) return false;
  if (isPullFresh(entity)) return false;
  return true;
}

function addToSyncQueue(action, type, payload) {
  let queue = readLocalArray(KEYS.SYNC_QUEUE);
  const recordId = payload.id || payload;

  // Coalesce: drop prior upsert for same record; drop upsert if later deleted before sync
  if (action === 'upsert') {
    queue = queue.filter(item => {
      const itemRecordId = item.payload.id || item.payload;
      return !(itemRecordId === recordId && item.type === type && item.action === 'upsert');
    });
  } else if (action === 'delete') {
    const hadOnlyLocalUpserts = queue.some(item => {
      const itemRecordId = item.payload.id || item.payload;
      return itemRecordId === recordId && item.type === type && item.action === 'upsert';
    });
    queue = queue.filter(item => {
      const itemRecordId = item.payload.id || item.payload;
      return !(itemRecordId === recordId && item.type === type);
    });
    // If the record never reached remote (only local upserts), skip delete too
    if (hadOnlyLocalUpserts && String(recordId).includes('_')) {
      // Keep delete for safety if id looks persisted; still push delete below
    }
  }

  queue.push({
    id: 'sq_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
    action,
    type,
    payload,
    timestamp: Date.now(),
    attemptCount: 0,
    nextRetryAt: 0
  });

  localStorage.setItem(KEYS.SYNC_QUEUE, JSON.stringify(queue));
  console.log(`[Sync Queue] Added ${action} on ${type} (${recordId}). Total pending: ${queue.length}`);
}

function mapPayloadToDB(type, payload, userId) {
  if (type === 'hives') return { ...mapHiveToDB(payload), user_id: userId };
  if (type === 'inspections') return { ...mapInspectionToDB(payload), user_id: userId };
  if (type === 'finances') return { ...mapFinanceToDB(payload), user_id: userId };
  if (type === 'honey_harvests') return { ...mapHoneyToDB(payload), user_id: userId };
  return null;
}

/**
 * Process outbox in batches per table — fewer round-trips on weak links.
 * Stops early after repeated network failures (backoff).
 */
export async function processSyncQueue() {
  if (!supabase) return { synced: 0, pending: getSyncQueueLength() };
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { synced: 0, pending: getSyncQueueLength() };
  if (!navigator.onLine) return { synced: 0, pending: getSyncQueueLength() };

  const userId = session.user.id;
  const now = Date.now();
  let queue = readLocalArray(KEYS.SYNC_QUEUE);
  if (queue.length === 0) return { synced: 0, pending: 0 };

  // Skip items still in backoff
  const due = queue.filter(item => !item.nextRetryAt || item.nextRetryAt <= now);
  const deferred = queue.filter(item => item.nextRetryAt && item.nextRetryAt > now);
  if (due.length === 0) return { synced: 0, pending: queue.length };

  console.log(`[Sync Queue] Processing ${due.length} ops (${deferred.length} deferred)...`);

  const byType = {};
  for (const item of due) {
    if (!byType[item.type]) byType[item.type] = [];
    byType[item.type].push(item);
  }

  const failedItems = [...deferred];
  let synced = 0;
  let networkFailures = 0;

  for (const [type, items] of Object.entries(byType)) {
    if (networkFailures >= 2) {
      // Stop hammering a dead link — defer the rest
      for (const item of items) {
        failedItems.push({
          ...item,
          attemptCount: (item.attemptCount || 0) + 1,
          nextRetryAt: now + Math.min(30 * 60 * 1000, 5000 * 2 ** Math.min(item.attemptCount || 0, 5))
        });
      }
      continue;
    }

    const upserts = items.filter(i => i.action === 'upsert');
    const deletes = items.filter(i => i.action === 'delete');

    if (upserts.length > 0) {
      try {
        const rows = upserts.map(i => mapPayloadToDB(type, i.payload, userId)).filter(Boolean);
        const { error } = await supabase.from(type).upsert(rows);
        if (error) throw error;
        synced += upserts.length;
      } catch (err) {
        console.error(`[Sync Queue] Batch upsert failed for ${type}:`, err);
        networkFailures += 1;
        for (const item of upserts) {
          const attempts = (item.attemptCount || 0) + 1;
          failedItems.push({
            ...item,
            attemptCount: attempts,
            lastError: String(err.message || err),
            nextRetryAt: now + Math.min(30 * 60 * 1000, 5000 * 2 ** Math.min(attempts, 5))
          });
        }
      }
    }

    if (deletes.length > 0 && networkFailures < 2) {
      try {
        const ids = deletes.map(i => i.payload);
        const { error } = await supabase.from(type).delete().in('id', ids);
        if (error) throw error;
        synced += deletes.length;
      } catch (err) {
        console.error(`[Sync Queue] Batch delete failed for ${type}:`, err);
        networkFailures += 1;
        for (const item of deletes) {
          const attempts = (item.attemptCount || 0) + 1;
          failedItems.push({
            ...item,
            attemptCount: attempts,
            lastError: String(err.message || err),
            nextRetryAt: now + Math.min(30 * 60 * 1000, 5000 * 2 ** Math.min(attempts, 5))
          });
        }
      }
    }
  }

  localStorage.setItem(KEYS.SYNC_QUEUE, JSON.stringify(failedItems));
  console.log(`[Sync Queue] Done. Synced ${synced}, pending ${failedItems.length}`);
  return { synced, pending: failedItems.length };
}

export function getSyncQueueLength() {
  return readLocalArray(KEYS.SYNC_QUEUE).length;
}

export function getLastSyncSummary() {
  const map = getLastPullMap();
  const times = Object.values(map).filter(Boolean);
  return {
    pending: getSyncQueueLength(),
    lastPullAt: times.length ? Math.max(...times) : null
  };
}

/** Clear pull TTL so the next reads fetch from Supabase (manual sync). */
export function invalidatePullCache() {
  localStorage.removeItem(KEYS.LAST_PULL);
}

/** Push outbox, then refresh each entity from remote (best-effort). */
export async function syncNow() {
  const queueResult = await processSyncQueue();
  invalidatePullCache();
  if (await useRemote()) {
    await Promise.allSettled([
      getHives(),
      getInspections(),
      getFinances(),
      getHoneyHarvests()
    ]);
  }
  return { ...queueResult, pending: getSyncQueueLength(), ...getLastSyncSummary() };
}

/** Immediate remote write only on usable connections; otherwise queue locally. */
async function syncOrQueue(action, type, payload, remoteCall) {
  if (!(await useRemote())) return;
  if (navigator.onLine && shouldUseBackgroundNetwork()) {
    try {
      await remoteCall();
    } catch (err) {
      console.warn(`Failed to ${action} ${type} remotely, queueing:`, err);
      addToSyncQueue(action, type, payload);
    }
  } else {
    addToSyncQueue(action, type, payload);
  }
}

// --- Hives CRUD ---

export async function getHives() {
  const isRemote = await useRemote();
  if (isRemote && shouldPullRemote('hives')) {
    try {
      const { data, error } = await supabase.from('hives').select('*').order('name');
      if (error) throw error;
      const hives = data.map(mapHiveFromDB);
      localStorage.setItem(KEYS.HIVES, JSON.stringify(hives));
      setLastPull('hives');
      return hives;
    } catch (err) {
      console.warn('Failed to fetch hives from Supabase, loading from local cache:', err);
    }
  }
  return readLocalArray(KEYS.HIVES);
}

export async function getHiveById(id) {
  const hives = await getHives();
  return hives.find(h => h.id === id);
}

export async function saveHive(hive) {
  if (!hive.id) {
    hive.id = 'hive_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    hive.createdAt = new Date().toISOString();
  }
  hive.updatedAt = new Date().toISOString();

  // 1. Save to local storage first (never block on network)
  const hives = readLocalArray(KEYS.HIVES);
  const idx = hives.findIndex(h => h.id === hive.id);
  if (idx !== -1) {
    hives[idx] = { ...hives[idx], ...hive };
  } else {
    hives.push(hive);
  }
  localStorage.setItem(KEYS.HIVES, JSON.stringify(hives));

  // 2. Sync to Supabase or queue (skips weak connections)
  await syncOrQueue('upsert', 'hives', hive, async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const dbData = { ...mapHiveToDB(hive), user_id: session.user.id };
    const { error } = await supabase.from('hives').upsert(dbData);
    if (error) throw error;
  });
  return hive;
}

export async function deleteHive(id) {
  // 1. Delete locally first
  let hives = readLocalArray(KEYS.HIVES);
  hives = hives.filter(h => h.id !== id);
  localStorage.setItem(KEYS.HIVES, JSON.stringify(hives));

  // Cascade delete inspections and honey harvests locally
  let inspections = readLocalArray(KEYS.INSPECTIONS).filter(i => i.hiveId !== id);
  localStorage.setItem(KEYS.INSPECTIONS, JSON.stringify(inspections));

  let honey = readLocalArray(KEYS.HONEY).filter(h => h.hiveId !== id);
  localStorage.setItem(KEYS.HONEY, JSON.stringify(honey));

  await syncOrQueue('delete', 'hives', id, async () => {
    const { error } = await supabase.from('hives').delete().eq('id', id);
    if (error) throw error;
  });
}

// --- Inspections CRUD ---

export async function getInspections(hiveId = null) {
  const isRemote = await useRemote();
  if (isRemote && shouldPullRemote('inspections')) {
    try {
      const { data, error } = await supabase.from('inspections').select('*').order('date', { ascending: false });
      if (error) throw error;
      const inspections = data.map(mapInspectionFromDB);
      localStorage.setItem(KEYS.INSPECTIONS, JSON.stringify(inspections));
      setLastPull('inspections');
    } catch (err) {
      console.warn('Failed to fetch inspections from remote, using local cache:', err);
    }
  }

  const inspections = readLocalArray(KEYS.INSPECTIONS);
  if (hiveId) {
    return inspections
      .filter(i => i.hiveId === hiveId)
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  }
  return inspections.sort((a, b) => new Date(b.date) - new Date(a.date));
}

export async function saveInspection(inspection) {
  if (!inspection.id) {
    inspection.id = 'insp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    inspection.createdAt = new Date().toISOString();
  }
  inspection.updatedAt = new Date().toISOString();

  // 1. Save locally
  const inspections = readLocalArray(KEYS.INSPECTIONS);
  const idx = inspections.findIndex(i => i.id === inspection.id);
  if (idx !== -1) {
    inspections[idx] = { ...inspections[idx], ...inspection };
  } else {
    inspections.push(inspection);
  }
  localStorage.setItem(KEYS.INSPECTIONS, JSON.stringify(inspections));

  await syncOrQueue('upsert', 'inspections', inspection, async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const dbData = { ...mapInspectionToDB(inspection), user_id: session.user.id };
    const { error } = await supabase.from('inspections').upsert(dbData);
    if (error) throw error;
  });
  return inspection;
}

export async function deleteInspection(id) {
  let inspections = readLocalArray(KEYS.INSPECTIONS);
  inspections = inspections.filter(i => i.id !== id);
  localStorage.setItem(KEYS.INSPECTIONS, JSON.stringify(inspections));

  await syncOrQueue('delete', 'inspections', id, async () => {
    const { error } = await supabase.from('inspections').delete().eq('id', id);
    if (error) throw error;
  });
}

// --- Finances CRUD ---

export async function getFinances() {
  const isRemote = await useRemote();
  if (isRemote && shouldPullRemote('finances')) {
    try {
      const { data, error } = await supabase.from('finances').select('*').order('date', { ascending: false });
      if (error) throw error;
      const finances = data.map(mapFinanceFromDB);
      localStorage.setItem(KEYS.FINANCES, JSON.stringify(finances));
      setLastPull('finances');
    } catch (err) {
      console.warn('Failed to fetch finances from remote, using local cache:', err);
    }
  }

  const finances = readLocalArray(KEYS.FINANCES);
  return finances.sort((a, b) => new Date(b.date) - new Date(a.date));
}

export async function saveFinance(item) {
  if (!item.id) {
    item.id = 'fin_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    item.createdAt = new Date().toISOString();
  }
  item.updatedAt = new Date().toISOString();

  // 1. Save locally
  const finances = readLocalArray(KEYS.FINANCES);
  const idx = finances.findIndex(f => f.id === item.id);
  if (idx !== -1) {
    finances[idx] = { ...finances[idx], ...item };
  } else {
    finances.push(item);
  }
  localStorage.setItem(KEYS.FINANCES, JSON.stringify(finances));

  await syncOrQueue('upsert', 'finances', item, async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const dbData = { ...mapFinanceToDB(item), user_id: session.user.id };
    const { error } = await supabase.from('finances').upsert(dbData);
    if (error) throw error;
  });
  return item;
}

export async function deleteFinance(id) {
  let finances = readLocalArray(KEYS.FINANCES);
  finances = finances.filter(f => f.id !== id);
  localStorage.setItem(KEYS.FINANCES, JSON.stringify(finances));

  await syncOrQueue('delete', 'finances', id, async () => {
    const { error } = await supabase.from('finances').delete().eq('id', id);
    if (error) throw error;
  });
}

// --- Honey Harvests CRUD ---

export async function getHoneyHarvests() {
  const isRemote = await useRemote();
  if (isRemote && shouldPullRemote('honey')) {
    try {
      const { data, error } = await supabase.from('honey_harvests').select('*').order('date', { ascending: false });
      if (error) throw error;
      const honey = data.map(mapHoneyFromDB);
      localStorage.setItem(KEYS.HONEY, JSON.stringify(honey));
      setLastPull('honey');
    } catch (err) {
      console.warn('Failed to fetch honey harvests from remote, using local cache:', err);
    }
  }

  const honey = readLocalArray(KEYS.HONEY);
  return honey.sort((a, b) => new Date(b.date) - new Date(a.date));
}

export async function saveHoneyHarvest(harvest) {
  if (!harvest.id) {
    harvest.id = 'honey_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    harvest.createdAt = new Date().toISOString();
  }
  harvest.updatedAt = new Date().toISOString();

  // 1. Save locally
  const honey = readLocalArray(KEYS.HONEY);
  const idx = honey.findIndex(h => h.id === harvest.id);
  if (idx !== -1) {
    honey[idx] = { ...honey[idx], ...harvest };
  } else {
    honey.push(harvest);
  }
  localStorage.setItem(KEYS.HONEY, JSON.stringify(honey));

  await syncOrQueue('upsert', 'honey_harvests', harvest, async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const dbData = { ...mapHoneyToDB(harvest), user_id: session.user.id };
    const { error } = await supabase.from('honey_harvests').upsert(dbData);
    if (error) throw error;
  });
  return harvest;
}

export async function deleteHoneyHarvest(id) {
  let honey = readLocalArray(KEYS.HONEY);
  honey = honey.filter(h => h.id !== id);
  localStorage.setItem(KEYS.HONEY, JSON.stringify(honey));

  await syncOrQueue('delete', 'honey_harvests', id, async () => {
    const { error } = await supabase.from('honey_harvests').delete().eq('id', id);
    if (error) throw error;
  });
}

// --- Tasks State (Calendar) ---

export async function getTasksState() {
  return readLocalObject(KEYS.TASKS);
}

export async function saveTaskState(month, taskId, isChecked) {
  const tasks = readLocalObject(KEYS.TASKS);
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
  const errors = [];

  // Sync hives
  const hives = readLocalArray(KEYS.HIVES);
  if (hives.length > 0) {
    const dbHives = hives.map(h => ({ ...mapHiveToDB(h), user_id: userId }));
    const { error } = await supabase.from('hives').upsert(dbHives);
    if (error) {
      console.error('Error syncing hives:', error);
      errors.push('Völker');
    }
  }

  // Sync inspections
  const inspections = readLocalArray(KEYS.INSPECTIONS);
  if (inspections.length > 0) {
    const dbInspections = inspections.map(i => ({ ...mapInspectionToDB(i), user_id: userId }));
    const { error } = await supabase.from('inspections').upsert(dbInspections);
    if (error) {
      console.error('Error syncing inspections:', error);
      errors.push('Durchsichten');
    }
  }

  // Sync finances
  const finances = readLocalArray(KEYS.FINANCES);
  if (finances.length > 0) {
    const dbFinances = finances.map(f => ({ ...mapFinanceToDB(f), user_id: userId }));
    const { error } = await supabase.from('finances').upsert(dbFinances);
    if (error) {
      console.error('Error syncing finances:', error);
      errors.push('Finanzen');
    }
  }

  // Sync honey
  const honey = readLocalArray(KEYS.HONEY);
  if (honey.length > 0) {
    const dbHoney = honey.map(h => ({ ...mapHoneyToDB(h), user_id: userId }));
    const { error } = await supabase.from('honey_harvests').upsert(dbHoney);
    if (error) {
      console.error('Error syncing honey:', error);
      errors.push('Honig');
    }
  }

  if (errors.length > 0) {
    throw new Error('Sync fehlgeschlagen für: ' + errors.join(', '));
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

function isBackupShape(data) {
  if (!data || typeof data !== 'object') return false;
  const keys = ['hives', 'inspections', 'finances', 'honey'];
  return keys.some((k) => Array.isArray(data[k]));
}

export async function importData(jsonString) {
  try {
    const data = JSON.parse(jsonString);
    if (!isBackupShape(data)) {
      console.error('Import rejected: unrecognized backup format');
      return false;
    }

    const isRemote = await useRemote();

    if (isRemote) {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session.user.id;
      const errors = [];

      if (data.hives && Array.isArray(data.hives)) {
        const dbHives = data.hives.map(h => ({ ...mapHiveToDB(h), user_id: userId }));
        const { error } = await supabase.from('hives').upsert(dbHives);
        if (error) errors.push(error);
      }
      if (data.inspections && Array.isArray(data.inspections)) {
        const dbInspections = data.inspections.map(i => ({ ...mapInspectionToDB(i), user_id: userId }));
        const { error } = await supabase.from('inspections').upsert(dbInspections);
        if (error) errors.push(error);
      }
      if (data.finances && Array.isArray(data.finances)) {
        const dbFinances = data.finances.map(f => ({ ...mapFinanceToDB(f), user_id: userId }));
        const { error } = await supabase.from('finances').upsert(dbFinances);
        if (error) errors.push(error);
      }
      if (data.honey && Array.isArray(data.honey)) {
        const dbHoney = data.honey.map(h => ({ ...mapHoneyToDB(h), user_id: userId }));
        const { error } = await supabase.from('honey_harvests').upsert(dbHoney);
        if (error) errors.push(error);
      }

      if (errors.length > 0) {
        console.error('Import had Supabase errors:', errors);
        return false;
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
