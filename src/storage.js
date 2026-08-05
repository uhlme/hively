// Data storage utility for Bee-Tracker using localStorage or Supabase DB
import { supabase } from './supabase.js';
import { safeJsonParse, makeId } from './utils.js';
import { getNetworkPrefs, shouldUseBackgroundNetwork } from './network.js';
import { getActiveOperationId, isOperationOwner, canEditOperation } from './operations.js';

const KEYS = {
  HIVES: 'bee_tracker_hives',
  INSPECTIONS: 'bee_tracker_inspections',
  FINANCES: 'bee_tracker_finances',
  HONEY: 'bee_tracker_honey',
  APIARIES: 'bee_tracker_apiaries',
  TREATMENTS: 'bee_tracker_treatments',
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

/** Clear entity caches when switching Bienenbetrieb. */
export function clearLocalEntityCache() {
  localStorage.removeItem(KEYS.HIVES);
  localStorage.removeItem(KEYS.INSPECTIONS);
  localStorage.removeItem(KEYS.FINANCES);
  localStorage.removeItem(KEYS.HONEY);
  localStorage.removeItem(KEYS.APIARIES);
  localStorage.removeItem(KEYS.TREATMENTS);
  localStorage.removeItem(KEYS.LAST_PULL);
  // Keep sync queue – items carry operationId and will sync when due
}

async function useRemote() {
  if (!supabase) return false;
  const { data: { session } } = await supabase.auth.getSession();
  return !!session;
}

async function getRemoteContext() {
  if (!supabase) return null;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;
  const operationId = getActiveOperationId();
  if (!operationId) return null;
  return { session, userId: session.user.id, operationId };
}

function stampOperationFields(entity, ctx) {
  if (!ctx) return entity;
  if (!entity.operationId) entity.operationId = ctx.operationId;
  if (!entity.createdBy) entity.createdBy = ctx.userId;
  return entity;
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
    apiary_id: h.apiaryId || null,
    operation_id: h.operationId || null,
    created_by: h.createdBy || null,
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
    apiaryId: h.apiary_id || null,
    operationId: h.operation_id || null,
    createdBy: h.created_by || h.user_id || null,
    createdAt: h.created_at,
    updatedAt: h.updated_at
  };
}

function normalizeChecklist(c) {
  if (!c || typeof c !== 'object') return null;
  return {
    queenSeen: c.queenSeen ?? c.queen_seen ?? null,
    eggs: c.eggs ?? null,
    openBrood: c.openBrood ?? c.open_brood ?? null,
    cappedBrood: c.cappedBrood ?? c.capped_brood ?? null,
    playCups: c.playCups ?? c.play_cups ?? null,
    queenCells: c.queenCells ?? c.queen_cells ?? null,
    strength: c.strength ?? null,
    varroaLevel: c.varroaLevel ?? c.varroa_level ?? null
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
    checklist: normalizeChecklist(i.checklist),
    operation_id: i.operationId || null,
    created_by: i.createdBy || null,
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
    checklist: normalizeChecklist(i.checklist),
    operationId: i.operation_id || null,
    createdBy: i.created_by || i.user_id || null,
    createdAt: i.created_at,
    updatedAt: i.updated_at
  };
}

function mapApiaryToDB(a) {
  return {
    id: a.id,
    name: a.name,
    notes: a.notes || null,
    operation_id: a.operationId || null,
    created_by: a.createdBy || null,
    created_at: a.createdAt || new Date().toISOString(),
    updated_at: a.updatedAt || new Date().toISOString()
  };
}

function mapApiaryFromDB(a) {
  return {
    id: a.id,
    name: a.name,
    notes: a.notes,
    operationId: a.operation_id || null,
    createdBy: a.created_by || a.user_id || null,
    createdAt: a.created_at,
    updatedAt: a.updated_at
  };
}

function mapTreatmentToDB(t) {
  const hiveIds = Array.isArray(t.hiveIds) ? t.hiveIds : (t.hive_ids || []);
  return {
    id: t.id,
    hive_ids: hiveIds,
    apiary_id: t.apiaryId || null,
    date_start: t.dateStart || t.date_start,
    date_end: t.dateEnd || t.date_end || null,
    disease: t.disease || 'varroa',
    product_id: t.productId || null,
    product_label: t.productLabel || null,
    dose: t.dose || null,
    phi_days: t.phiDays !== undefined && t.phiDays !== null && t.phiDays !== ''
      ? Number(t.phiDays)
      : null,
    harvest_blocked_until: t.harvestBlockedUntil || null,
    status: t.status || 'active',
    notes: t.notes || null,
    operation_id: t.operationId || null,
    created_by: t.createdBy || null,
    created_at: t.createdAt || new Date().toISOString(),
    updated_at: t.updatedAt || new Date().toISOString()
  };
}

function mapTreatmentFromDB(t) {
  return {
    id: t.id,
    hiveIds: Array.isArray(t.hive_ids) ? t.hive_ids : (t.hiveIds || []),
    apiaryId: t.apiary_id || null,
    dateStart: t.date_start,
    dateEnd: t.date_end || null,
    disease: t.disease || 'varroa',
    productId: t.product_id || null,
    productLabel: t.product_label || null,
    dose: t.dose || null,
    phiDays: t.phi_days ?? null,
    harvestBlockedUntil: t.harvest_blocked_until || null,
    status: t.status || 'active',
    notes: t.notes || null,
    operationId: t.operation_id || null,
    createdBy: t.created_by || t.user_id || null,
    createdAt: t.created_at,
    updatedAt: t.updated_at
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
    operation_id: f.operationId || null,
    created_by: f.createdBy || null,
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
    operationId: f.operation_id || null,
    createdBy: f.created_by || f.user_id || null,
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
    operation_id: h.operationId || null,
    created_by: h.createdBy || null,
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
    operationId: h.operation_id || null,
    createdBy: h.created_by || h.user_id || null,
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
  await ensureDefaultApiary();
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
    queue = queue.filter(item => {
      const itemRecordId = item.payload.id || item.payload;
      return !(itemRecordId === recordId && item.type === type);
    });
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

function mapPayloadToDB(type, payload, userId, operationId) {
  const opId = operationId || payload.operationId || null;
  const createdBy = payload.createdBy || userId;
  if (type === 'hives') {
    return { ...mapHiveToDB(payload), user_id: userId, operation_id: opId, created_by: createdBy };
  }
  if (type === 'inspections') {
    return { ...mapInspectionToDB(payload), user_id: userId, operation_id: opId, created_by: createdBy };
  }
  if (type === 'finances') {
    return { ...mapFinanceToDB(payload), user_id: userId, operation_id: opId, created_by: createdBy };
  }
  if (type === 'honey_harvests') {
    return { ...mapHoneyToDB(payload), user_id: userId, operation_id: opId, created_by: createdBy };
  }
  if (type === 'apiaries') {
    return { ...mapApiaryToDB(payload), user_id: userId, operation_id: opId, created_by: createdBy };
  }
  if (type === 'treatments') {
    return { ...mapTreatmentToDB(payload), user_id: userId, operation_id: opId, created_by: createdBy };
  }
  return null;
}

function makeLocalId(prefix) {
  return makeId(prefix);
}

function requireNonNegativeNumber(value, fieldLabel) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`${fieldLabel} muss eine nicht-negative Zahl sein.`);
  }
  return number;
}

function nextRetryAt(now, attemptCount) {
  return now + Math.min(30 * 60 * 1000, 5000 * 2 ** Math.min(attemptCount, 5));
}

function upsertLocal(storageKey, entity) {
  const items = readLocalArray(storageKey);
  const idx = items.findIndex(item => item.id === entity.id);
  if (idx !== -1) {
    items[idx] = { ...items[idx], ...entity };
  } else {
    items.push(entity);
  }
  localStorage.setItem(storageKey, JSON.stringify(items));
}

function removeLocalById(storageKey, id) {
  const items = readLocalArray(storageKey).filter(item => item.id !== id);
  localStorage.setItem(storageKey, JSON.stringify(items));
}

async function pullEntity({ pullKey, storageKey, table, mapFrom, order, warnMsg }) {
  const isRemote = await useRemote();
  const ctx = isRemote ? await getRemoteContext() : null;
  if (!ctx || !shouldPullRemote(pullKey)) return null;
  try {
    let query = supabase
      .from(table)
      .select('*')
      .eq('operation_id', ctx.operationId);
    if (typeof order === 'string') {
      query = query.order(order);
    } else {
      query = query.order(order.column, { ascending: order.ascending });
    }
    const { data, error } = await query;
    if (error) throw error;
    const entities = data.map(mapFrom);
    localStorage.setItem(storageKey, JSON.stringify(entities));
    setLastPull(pullKey);
    return entities;
  } catch (err) {
    console.warn(warnMsg, err);
    return null;
  }
}

async function remoteUpsert(table, entity) {
  const remote = await getRemoteContext();
  if (!remote) throw new Error('Kein aktiver Betrieb');
  const dbData = mapPayloadToDB(
    table,
    entity,
    remote.userId,
    entity.operationId || remote.operationId
  );
  const { error } = await supabase.from(table).upsert(dbData);
  if (error) throw error;
}

function prepareEntity(entity, idPrefix, ctx) {
  if (!entity.id) {
    entity.id = makeLocalId(idPrefix);
    entity.createdAt = new Date().toISOString();
  }
  entity.updatedAt = new Date().toISOString();
  stampOperationFields(entity, ctx);
  return entity;
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
  const activeOp = getActiveOperationId();
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
          nextRetryAt: nextRetryAt(now, item.attemptCount || 0)
        });
      }
      continue;
    }

    const upserts = items.filter(i => i.action === 'upsert');
    const deletes = items.filter(i => i.action === 'delete');

    if (upserts.length > 0) {
      try {
        const rows = upserts
          .map(i => mapPayloadToDB(type, i.payload, userId, i.payload.operationId || activeOp))
          .filter(Boolean);
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
            nextRetryAt: nextRetryAt(now, attempts)
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
            nextRetryAt: nextRetryAt(now, attempts)
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
      getHoneyHarvests(),
      getApiaries(),
      getTreatments()
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

function sortByDateDesc(items) {
  return items.sort((a, b) => new Date(b.date) - new Date(a.date));
}

// --- Hives CRUD ---

export async function getHives() {
  const pulled = await pullEntity({
    pullKey: 'hives',
    storageKey: KEYS.HIVES,
    table: 'hives',
    mapFrom: mapHiveFromDB,
    order: 'name',
    warnMsg: 'Failed to fetch hives from Supabase, loading from local cache:'
  });
  if (pulled) return pulled;
  return readLocalArray(KEYS.HIVES);
}

export async function getHiveById(id) {
  const hives = await getHives();
  return hives.find(h => h.id === id);
}

export async function saveHive(hive) {
  if (await useRemote() && !canEditOperation()) {
    throw new Error('Nur Inhaber und Mitarbeiter dürfen Völker bearbeiten.');
  }
  const ctx = await getRemoteContext();
  prepareEntity(hive, 'hive_', ctx);
  upsertLocal(KEYS.HIVES, hive);
  await syncOrQueue('upsert', 'hives', hive, () => remoteUpsert('hives', hive));
  return hive;
}

export async function deleteHive(id) {
  if (await useRemote() && !isOperationOwner()) {
    throw new Error('Nur Betriebsinhaber dürfen Völker löschen.');
  }

  removeLocalById(KEYS.HIVES, id);

  // Cascade delete inspections and honey harvests locally
  localStorage.setItem(
    KEYS.INSPECTIONS,
    JSON.stringify(readLocalArray(KEYS.INSPECTIONS).filter(i => i.hiveId !== id))
  );
  localStorage.setItem(
    KEYS.HONEY,
    JSON.stringify(readLocalArray(KEYS.HONEY).filter(h => h.hiveId !== id))
  );

  // Cascade: remove hive from treatments, or delete treatment if no hives left
  const treatments = readLocalArray(KEYS.TREATMENTS);
  const nextTreatments = [];
  for (const t of treatments) {
    const hiveIds = Array.isArray(t.hiveIds) ? t.hiveIds : [];
    if (!hiveIds.includes(id)) {
      nextTreatments.push(t);
      continue;
    }
    const remaining = hiveIds.filter(hid => hid !== id);
    if (remaining.length === 0) continue;
    nextTreatments.push({ ...t, hiveIds: remaining, updatedAt: new Date().toISOString() });
  }
  localStorage.setItem(KEYS.TREATMENTS, JSON.stringify(nextTreatments));

  await syncOrQueue('delete', 'hives', id, async () => {
    const { error } = await supabase.from('hives').delete().eq('id', id);
    if (error) throw error;
  });
}

// --- Inspections CRUD ---

export async function getInspections(hiveId = null) {
  await pullEntity({
    pullKey: 'inspections',
    storageKey: KEYS.INSPECTIONS,
    table: 'inspections',
    mapFrom: mapInspectionFromDB,
    order: { column: 'date', ascending: false },
    warnMsg: 'Failed to fetch inspections from remote, using local cache:'
  });

  const inspections = readLocalArray(KEYS.INSPECTIONS);
  if (hiveId) {
    return sortByDateDesc(inspections.filter(i => i.hiveId === hiveId));
  }
  return sortByDateDesc(inspections);
}

export async function saveInspection(inspection) {
  if (await useRemote() && !canEditOperation()) {
    throw new Error('Nur Inhaber und Mitarbeiter dürfen Durchsichten erfassen.');
  }
  const ctx = await getRemoteContext();
  prepareEntity(inspection, 'insp_', ctx);
  upsertLocal(KEYS.INSPECTIONS, inspection);
  await syncOrQueue('upsert', 'inspections', inspection, () => remoteUpsert('inspections', inspection));
  return inspection;
}

export async function deleteInspection(id) {
  if (await useRemote() && !canEditOperation()) {
    throw new Error('Nur Inhaber und Mitarbeiter dürfen Durchsichten löschen.');
  }
  removeLocalById(KEYS.INSPECTIONS, id);

  await syncOrQueue('delete', 'inspections', id, async () => {
    const { error } = await supabase.from('inspections').delete().eq('id', id);
    if (error) throw error;
  });
}

// --- Finances CRUD ---

export async function getFinances() {
  if (await useRemote() && !isOperationOwner()) {
    return [];
  }
  await pullEntity({
    pullKey: 'finances',
    storageKey: KEYS.FINANCES,
    table: 'finances',
    mapFrom: mapFinanceFromDB,
    order: { column: 'date', ascending: false },
    warnMsg: 'Failed to fetch finances from remote, using local cache:'
  });

  return sortByDateDesc(readLocalArray(KEYS.FINANCES));
}

export async function saveFinance(item) {
  if (await useRemote() && !isOperationOwner()) {
    throw new Error('Nur Betriebsinhaber dürfen Finanzen bearbeiten.');
  }
  item.price = requireNonNegativeNumber(item.price, 'Betrag');
  const ctx = await getRemoteContext();
  prepareEntity(item, 'fin_', ctx);
  upsertLocal(KEYS.FINANCES, item);
  await syncOrQueue('upsert', 'finances', item, () => remoteUpsert('finances', item));
  return item;
}

export async function deleteFinance(id) {
  if (await useRemote() && !isOperationOwner()) {
    throw new Error('Nur Betriebsinhaber dürfen Finanzen löschen.');
  }
  removeLocalById(KEYS.FINANCES, id);

  await syncOrQueue('delete', 'finances', id, async () => {
    const { error } = await supabase.from('finances').delete().eq('id', id);
    if (error) throw error;
  });
}

// --- Honey Harvests CRUD ---

export async function getHoneyHarvests() {
  await pullEntity({
    pullKey: 'honey',
    storageKey: KEYS.HONEY,
    table: 'honey_harvests',
    mapFrom: mapHoneyFromDB,
    order: { column: 'date', ascending: false },
    warnMsg: 'Failed to fetch honey harvests from remote, using local cache:'
  });

  return sortByDateDesc(readLocalArray(KEYS.HONEY));
}

export async function saveHoneyHarvest(harvest) {
  if (await useRemote() && !canEditOperation()) {
    throw new Error('Nur Inhaber und Mitarbeiter dürfen Honigernten erfassen.');
  }
  harvest.amount = requireNonNegativeNumber(harvest.amount, 'Erntemenge');
  const ctx = await getRemoteContext();
  prepareEntity(harvest, 'honey_', ctx);
  upsertLocal(KEYS.HONEY, harvest);
  await syncOrQueue('upsert', 'honey_harvests', harvest, () => remoteUpsert('honey_harvests', harvest));
  return harvest;
}

export async function deleteHoneyHarvest(id) {
  if (await useRemote() && !canEditOperation()) {
    throw new Error('Nur Inhaber und Mitarbeiter dürfen Honigernten löschen.');
  }
  removeLocalById(KEYS.HONEY, id);

  await syncOrQueue('delete', 'honey_harvests', id, async () => {
    const { error } = await supabase.from('honey_harvests').delete().eq('id', id);
    if (error) throw error;
  });
}

// --- Apiaries CRUD ---

export async function getApiaries() {
  const pulled = await pullEntity({
    pullKey: 'apiaries',
    storageKey: KEYS.APIARIES,
    table: 'apiaries',
    mapFrom: mapApiaryFromDB,
    order: 'name',
    warnMsg: 'Failed to fetch apiaries from Supabase, loading from local cache:'
  });
  if (pulled) return pulled;
  return readLocalArray(KEYS.APIARIES);
}

export async function getApiaryById(id) {
  const apiaries = await getApiaries();
  return apiaries.find(a => a.id === id);
}

export async function saveApiary(apiary) {
  if (await useRemote() && !canEditOperation()) {
    throw new Error('Nur Inhaber und Mitarbeiter dürfen Stände bearbeiten.');
  }
  const ctx = await getRemoteContext();
  prepareEntity(apiary, 'apiary_', ctx);
  upsertLocal(KEYS.APIARIES, apiary);
  await syncOrQueue('upsert', 'apiaries', apiary, () => remoteUpsert('apiaries', apiary));
  return apiary;
}

export async function deleteApiary(id) {
  if (await useRemote() && !isOperationOwner()) {
    throw new Error('Nur Betriebsinhaber dürfen Stände löschen.');
  }

  removeLocalById(KEYS.APIARIES, id);

  // Unassign hives that belonged to this apiary (local)
  const hives = readLocalArray(KEYS.HIVES);
  let changed = false;
  const nextHives = hives.map(h => {
    if (h.apiaryId === id) {
      changed = true;
      return { ...h, apiaryId: null, updatedAt: new Date().toISOString() };
    }
    return h;
  });
  if (changed) {
    localStorage.setItem(KEYS.HIVES, JSON.stringify(nextHives));
  }

  await syncOrQueue('delete', 'apiaries', id, async () => {
    const { error } = await supabase.from('apiaries').delete().eq('id', id);
    if (error) throw error;
  });
}

/**
 * Ensure at least one apiary exists; assign orphan hives to it.
 * Called from initStorage after demo seed (local-first).
 */
export async function ensureDefaultApiary() {
  const apiaries = readLocalArray(KEYS.APIARIES);
  if (apiaries.length > 0) return apiaries[0];

  const apiary = {
    id: makeLocalId('apiary_'),
    name: 'Hauptstand',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  upsertLocal(KEYS.APIARIES, apiary);

  const hives = readLocalArray(KEYS.HIVES);
  const nextHives = hives.map(h => {
    if (h.apiaryId) return h;
    return { ...h, apiaryId: apiary.id, updatedAt: new Date().toISOString() };
  });
  localStorage.setItem(KEYS.HIVES, JSON.stringify(nextHives));

  return apiary;
}

// --- Treatments CRUD ---

export async function getTreatments(filters = {}) {
  await pullEntity({
    pullKey: 'treatments',
    storageKey: KEYS.TREATMENTS,
    table: 'treatments',
    mapFrom: mapTreatmentFromDB,
    order: { column: 'date_start', ascending: false },
    warnMsg: 'Failed to fetch treatments from remote, using local cache:'
  });

  let treatments = readLocalArray(KEYS.TREATMENTS);
  const { hiveId, status } = filters || {};
  if (hiveId) {
    treatments = treatments.filter(t => Array.isArray(t.hiveIds) && t.hiveIds.includes(hiveId));
  }
  if (status) {
    treatments = treatments.filter(t => t.status === status);
  }
  return treatments.sort((a, b) => new Date(b.dateStart) - new Date(a.dateStart));
}

export async function getActiveTreatmentsForHive(hiveId) {
  return getTreatments({ hiveId, status: 'active' });
}

export async function saveTreatment(treatment) {
  if (await useRemote() && !canEditOperation()) {
    throw new Error('Nur Inhaber und Mitarbeiter dürfen Behandlungen erfassen.');
  }
  if (!Array.isArray(treatment.hiveIds)) {
    treatment.hiveIds = treatment.hiveIds ? [treatment.hiveIds] : [];
  }
  const ctx = await getRemoteContext();
  prepareEntity(treatment, 'treat_', ctx);
  // Do not auto-change hive.status — UI owns that decision
  upsertLocal(KEYS.TREATMENTS, treatment);
  await syncOrQueue('upsert', 'treatments', treatment, () => remoteUpsert('treatments', treatment));
  return treatment;
}

export async function deleteTreatment(id) {
  if (await useRemote() && !canEditOperation()) {
    throw new Error('Nur Inhaber und Mitarbeiter dürfen Behandlungen löschen.');
  }
  removeLocalById(KEYS.TREATMENTS, id);

  await syncOrQueue('delete', 'treatments', id, async () => {
    const { error } = await supabase.from('treatments').delete().eq('id', id);
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

function buildRemoteEntityConfigs(sources, { skipEmpty }) {
  const configs = [
    { label: 'Stände', table: 'apiaries', mapTo: mapApiaryToDB, data: sources.apiaries, logName: 'apiaries' },
    { label: 'Völker', table: 'hives', mapTo: mapHiveToDB, data: sources.hives, logName: 'hives' },
    { label: 'Durchsichten', table: 'inspections', mapTo: mapInspectionToDB, data: sources.inspections, logName: 'inspections' }
  ];
  if (isOperationOwner()) {
    configs.push({
      label: 'Finanzen',
      table: 'finances',
      mapTo: mapFinanceToDB,
      data: sources.finances,
      logName: 'finances'
    });
  }
  configs.push({
    label: 'Honig',
    table: 'honey_harvests',
    mapTo: mapHoneyToDB,
    data: sources.honey,
    logName: 'honey'
  });
  configs.push({
    label: 'Behandlungen',
    table: 'treatments',
    mapTo: mapTreatmentToDB,
    data: sources.treatments,
    logName: 'treatments'
  });

  return configs.filter(cfg => {
    if (!cfg.data || !Array.isArray(cfg.data)) return false;
    if (skipEmpty) return cfg.data.length > 0;
    return true;
  });
}

async function upsertRemoteEntityConfigs(configs, { userId, operationId }, onError) {
  for (const { label, table, mapTo, data, logName } of configs) {
    const rows = data.map(item => ({
      ...mapTo({
        ...item,
        operationId: item.operationId || operationId,
        createdBy: item.createdBy || userId
      }),
      user_id: userId
    }));
    const { error } = await supabase.from(table).upsert(rows);
    if (error) onError(error, { label, logName });
  }
}

// Sync Local Data to Supabase (manual migration trigger)
export async function syncLocalToRemote() {
  if (!supabase) return false;
  const ctx = await getRemoteContext();
  if (!ctx) return false;

  const errors = [];
  const configs = buildRemoteEntityConfigs(
    {
      apiaries: readLocalArray(KEYS.APIARIES),
      hives: readLocalArray(KEYS.HIVES),
      inspections: readLocalArray(KEYS.INSPECTIONS),
      finances: readLocalArray(KEYS.FINANCES),
      honey: readLocalArray(KEYS.HONEY),
      treatments: readLocalArray(KEYS.TREATMENTS)
    },
    { skipEmpty: true }
  );

  await upsertRemoteEntityConfigs(configs, ctx, (error, { label, logName }) => {
    console.error(`Error syncing ${logName}:`, error);
    errors.push(label);
  });

  if (errors.length > 0) {
    throw new Error('Sync fehlgeschlagen für: ' + errors.join(', '));
  }
  return true;
}

// Export/Import JSON Backup (for local backup/restore)
export async function exportData() {
  const data = {
    apiaries: await getApiaries(),
    hives: await getHives(),
    inspections: await getInspections(),
    finances: await getFinances(),
    honey: await getHoneyHarvests(),
    treatments: await getTreatments(),
    exportedAt: new Date().toISOString()
  };
  return JSON.stringify(data, null, 2);
}

function isBackupShape(data) {
  if (!data || typeof data !== 'object') return false;
  const keys = ['apiaries', 'hives', 'inspections', 'finances', 'honey', 'treatments'];
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
      const ctx = await getRemoteContext();
      if (!ctx) {
        console.error('Import rejected: kein aktiver Betrieb');
        return false;
      }
      const errors = [];
      const configs = buildRemoteEntityConfigs(
        {
          apiaries: data.apiaries,
          hives: data.hives,
          inspections: data.inspections,
          finances: data.finances,
          honey: data.honey,
          treatments: data.treatments
        },
        { skipEmpty: false }
      );

      await upsertRemoteEntityConfigs(configs, ctx, (error) => {
        errors.push(error);
      });

      if (errors.length > 0) {
        console.error('Import had Supabase errors:', errors);
        return false;
      }
      invalidatePullCache();
    } else {
      if (data.apiaries && Array.isArray(data.apiaries)) {
        localStorage.setItem(KEYS.APIARIES, JSON.stringify(data.apiaries));
      }
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
      if (data.treatments && Array.isArray(data.treatments)) {
        localStorage.setItem(KEYS.TREATMENTS, JSON.stringify(data.treatments));
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
  const demoApiaries = [
    {
      id: 'apiary_demo_1',
      name: 'Apfelwiese',
      notes: 'Sonneniger Stand am Obstgarten.',
      createdAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
    },
    {
      id: 'apiary_demo_2',
      name: 'Waldrand',
      notes: 'Halbschatten, guter Windschutz.',
      createdAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
    }
  ];

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
      apiaryId: 'apiary_demo_1',
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
      apiaryId: 'apiary_demo_2',
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
      checklist: {
        queenSeen: 'yes',
        eggs: true,
        openBrood: true,
        cappedBrood: true,
        playCups: false,
        queenCells: false,
        strength: 'strong',
        varroaLevel: 'low'
      },
      notes: 'Schwarmstimmung kontrolliert, keine Spielnäpfchen bestiftet. Honigräume gut gefüllt.'
    },
    {
      id: 'insp_demo_2',
      hiveId: 'hive_demo_2',
      date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      feeding: '1:1 Zuckerwasser (3 Liter)',
      varroa: 'Ameisensäure (60% ad us. vet.)',
      broodStatus: 'Stifte, offene und verdeckelte Brut vorhanden',
      honeySuper: 'Kein Honigraum',
      temperament: '3',
      checklist: {
        queenSeen: 'yes',
        eggs: true,
        openBrood: true,
        cappedBrood: true,
        playCups: false,
        queenCells: false,
        strength: 'mid',
        varroaLevel: 'high'
      },
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

  const treatStart = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const treatEnd = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const demoTreatments = [
    {
      id: 'treat_demo_1',
      hiveIds: ['hive_demo_2'],
      apiaryId: 'apiary_demo_2',
      dateStart: treatStart,
      dateEnd: treatEnd,
      disease: 'varroa',
      productId: 'formic_60',
      productLabel: 'Ameisensäure 60%',
      dose: '2 × 50 ml',
      phiDays: 0,
      harvestBlockedUntil: null,
      status: 'active',
      notes: 'Ameisensäure-Verdunster (Liebig) eingesetzt.',
      createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
    }
  ];

  localStorage.setItem(KEYS.APIARIES, JSON.stringify(demoApiaries));
  localStorage.setItem(KEYS.HIVES, JSON.stringify(demoHives));
  localStorage.setItem(KEYS.INSPECTIONS, JSON.stringify(demoInspections));
  localStorage.setItem(KEYS.FINANCES, JSON.stringify(demoFinances));
  localStorage.setItem(KEYS.HONEY, JSON.stringify(demoHoney));
  localStorage.setItem(KEYS.TREATMENTS, JSON.stringify(demoTreatments));
}
