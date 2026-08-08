import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockNavigatorNetwork } from './setup.js';

const { supabaseMock, createQueryBuilder, session } = vi.hoisted(() => {
  const session = {
    user: { id: 'user-1', email: 'imker@example.com' }
  };

  function createQueryBuilder({ data = [], error = null } = {}) {
    const builder = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      order: vi.fn(async () => ({ data, error })),
      upsert: vi.fn(async () => ({ data: null, error })),
      delete: vi.fn(() => builder),
      in: vi.fn(async () => ({ data: null, error }))
    };
    // delete().eq() path used by deletes
    builder.eq = vi.fn((...args) => {
      // When chained after delete(), resolve; when after select(), keep chaining
      if (builder._deleted) {
        return Promise.resolve({ data: null, error });
      }
      return builder;
    });
    const originalDelete = builder.delete;
    builder.delete = vi.fn(() => {
      builder._deleted = true;
      return builder;
    });
    return builder;
  }

  const supabaseMock = {
    auth: {
      getSession: vi.fn(async () => ({ data: { session } }))
    },
    from: vi.fn()
  };

  return { supabaseMock, createQueryBuilder, session };
});

vi.mock('../src/supabase.js', () => ({
  supabase: supabaseMock
}));

const storage = await import('../src/storage.js');

describe('storage local-first + sync queue', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('hively_active_operation_id', 'op-test-1');
    localStorage.setItem('hively_active_operation_role', 'owner');
    vi.clearAllMocks();
    supabaseMock.auth.getSession.mockResolvedValue({ data: { session } });
    supabaseMock.from.mockImplementation(() => createQueryBuilder());
    mockNavigatorNetwork({ onLine: true, effectiveType: '4g' });
  });

  it('saves hives locally immediately and queues when offline', async () => {
    mockNavigatorNetwork({ onLine: false });

    const hive = await storage.saveHive({
      name: 'Kasten 1',
      status: 'Gesund',
      broodFrames: 10
    });

    expect(hive.id).toMatch(/^hive_/);
    const local = JSON.parse(localStorage.getItem('bee_tracker_hives'));
    expect(local).toHaveLength(1);
    expect(local[0].name).toBe('Kasten 1');

    expect(storage.getSyncQueueLength()).toBe(1);
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });

  it('writes remotely on good connections without leaving a queue item', async () => {
    const builder = createQueryBuilder();
    supabaseMock.from.mockReturnValue(builder);

    await storage.saveHive({ name: 'Online Volk', status: 'Gesund' });

    expect(builder.upsert).toHaveBeenCalledTimes(1);
    expect(storage.getSyncQueueLength()).toBe(0);
  });

  it('queues remote write failures instead of losing data', async () => {
    const builder = createQueryBuilder({ error: new Error('network down') });
    supabaseMock.from.mockReturnValue(builder);

    await storage.saveHive({ name: 'Retry Volk', status: 'Gesund' });

    expect(storage.getSyncQueueLength()).toBe(1);
    const hives = await storage.getHives();
    expect(hives.some((h) => h.name === 'Retry Volk')).toBe(true);
  });

  it('cascades local hive deletes to inspections and honey', async () => {
    mockNavigatorNetwork({ onLine: false });

    const hive = await storage.saveHive({ name: 'Löschen', status: 'Gesund' });
    await storage.saveInspection({
      hiveId: hive.id,
      date: '2026-07-01',
      notes: 'Test'
    });
    await storage.saveHoneyHarvest({
      hiveId: hive.id,
      date: '2026-07-01',
      amount: 5,
      type: 'Sommer'
    });

    await storage.deleteHive(hive.id);

    expect(await storage.getHives()).toHaveLength(0);
    expect(await storage.getInspections()).toHaveLength(0);
    expect(await storage.getHoneyHarvests()).toHaveLength(0);
  });

  it('batches sync queue upserts and clears successful items', async () => {
    mockNavigatorNetwork({ onLine: false });
    await storage.saveHive({ name: 'A', status: 'Gesund' });
    await storage.saveHive({ name: 'B', status: 'Gesund' });
    expect(storage.getSyncQueueLength()).toBe(2);

    const builder = createQueryBuilder();
    supabaseMock.from.mockReturnValue(builder);
    mockNavigatorNetwork({ onLine: true, effectiveType: '4g' });

    const result = await storage.processSyncQueue();

    expect(result.synced).toBe(2);
    expect(result.pending).toBe(0);
    expect(builder.upsert).toHaveBeenCalledTimes(1);
    const rows = builder.upsert.mock.calls[0][0];
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.user_id === 'user-1')).toBe(true);
    expect(rows.every((r) => r.operation_id === 'op-test-1')).toBe(true);
    expect(rows.every((r) => r.created_by === 'user-1')).toBe(true);
  });

  it('applies backoff after sync failures and keeps pending items', async () => {
    mockNavigatorNetwork({ onLine: false });
    await storage.saveHive({ name: 'Backoff', status: 'Gesund' });

    const builder = createQueryBuilder({ error: new Error('timeout') });
    supabaseMock.from.mockReturnValue(builder);
    mockNavigatorNetwork({ onLine: true, effectiveType: '4g' });

    const result = await storage.processSyncQueue();
    expect(result.synced).toBe(0);
    expect(result.pending).toBe(1);

    const queue = JSON.parse(localStorage.getItem('bee_tracker_sync_queue'));
    expect(queue[0].attemptCount).toBe(1);
    expect(queue[0].nextRetryAt).toBeGreaterThan(Date.now());

    // Not due yet — should no-op
    const second = await storage.processSyncQueue();
    expect(second.synced).toBe(0);
    expect(second.pending).toBe(1);
  });

  it('skips remote pulls when sync queue has pending items', async () => {
    mockNavigatorNetwork({ onLine: false });
    await storage.saveHive({ name: 'Lokal', status: 'Gesund' });

    const builder = createQueryBuilder({
      data: [{
        id: 'remote-1',
        name: 'Remote',
        status: 'Gesund',
        queen_name: null,
        queen_year: null,
        queen_color: null,
        breed: null,
        notes: null,
        brood_frames: 0,
        honey_frames_1: 0,
        honey_frames_2: 0,
        created_at: '2026-01-01',
        updated_at: '2026-01-01'
      }]
    });
    supabaseMock.from.mockReturnValue(builder);
    mockNavigatorNetwork({ onLine: true, effectiveType: '4g' });

    const hives = await storage.getHives();
    expect(hives.map((h) => h.name)).toContain('Lokal');
    expect(hives.map((h) => h.name)).not.toContain('Remote');
    expect(builder.select).not.toHaveBeenCalled();
  });

  it('rejects negative finance amounts', async () => {
    await expect(storage.saveFinance({
      date: '2026-07-01',
      description: 'Manipulierte Ausgabe',
      price: -10,
      type: 'expense'
    })).rejects.toThrow(/nicht-negative Zahl/);
  });

  it('rejects negative honey harvest amounts', async () => {
    await expect(storage.saveHoneyHarvest({
      hiveId: 'hive-1',
      date: '2026-07-01',
      amount: -2,
      type: 'Sommer'
    })).rejects.toThrow(/nicht-negative Zahl/);
  });

  it('syncNow processes the outbox and reports summary', async () => {
    mockNavigatorNetwork({ onLine: false });
    await storage.saveHive({ name: 'SyncNow', status: 'Gesund' });

    const builder = createQueryBuilder({ data: [] });
    supabaseMock.from.mockReturnValue(builder);
    mockNavigatorNetwork({ onLine: true, effectiveType: '4g' });

    const summary = await storage.syncNow();
    expect(summary.pending).toBe(0);
    expect(storage.getSyncQueueLength()).toBe(0);
  });

  it('merges outbox items added while processSyncQueue is in flight', async () => {
    mockNavigatorNetwork({ onLine: false });
    await storage.saveHive({ name: 'First', status: 'Gesund' });

    let releaseUpsert;
    const upsertGate = new Promise((resolve) => {
      releaseUpsert = resolve;
    });

    const builder = createQueryBuilder();
    builder.upsert = vi.fn(async () => {
      await upsertGate;
      return { data: null, error: null };
    });
    supabaseMock.from.mockReturnValue(builder);
    mockNavigatorNetwork({ onLine: true, effectiveType: '4g' });

    const processing = storage.processSyncQueue();
    await vi.waitFor(() => expect(builder.upsert).toHaveBeenCalled());

    // Concurrent enqueue while remote upsert is still awaiting
    const queue = JSON.parse(localStorage.getItem('bee_tracker_sync_queue'));
    queue.push({
      id: 'sq_manual_second',
      action: 'upsert',
      type: 'hives',
      payload: {
        id: 'hive_second',
        name: 'Second',
        status: 'Gesund',
        operationId: 'op-test-1'
      },
      operationId: 'op-test-1',
      timestamp: Date.now(),
      attemptCount: 0,
      nextRetryAt: 0
    });
    localStorage.setItem('bee_tracker_sync_queue', JSON.stringify(queue));

    releaseUpsert();
    await processing;

    expect(storage.getSyncQueueLength()).toBe(1);
    const remaining = JSON.parse(localStorage.getItem('bee_tracker_sync_queue'));
    expect(remaining[0].payload.name).toBe('Second');
  });

  it('dead-letters permanent RLS errors instead of infinite backoff', async () => {
    mockNavigatorNetwork({ onLine: false });
    await storage.saveHive({ name: 'Poison', status: 'Gesund' });

    const err = new Error('new row violates row-level security policy');
    err.code = '42501';
    const builder = createQueryBuilder({ error: err });
    supabaseMock.from.mockReturnValue(builder);
    mockNavigatorNetwork({ onLine: true, effectiveType: '4g' });

    const result = await storage.processSyncQueue();
    expect(result.synced).toBe(0);
    expect(result.pending).toBe(0);
    expect(result.deadLetter).toBe(1);
    expect(storage.getSyncQueueLength()).toBe(0);
    const dead = JSON.parse(localStorage.getItem('bee_tracker_sync_dead_letter'));
    expect(dead).toHaveLength(1);
  });

  it('retries auth/JWT and foreign-key errors instead of dead-lettering', async () => {
    mockNavigatorNetwork({ onLine: false });
    await storage.saveHive({ name: 'AuthRetry', status: 'Gesund' });

    const err = new Error('JWT expired');
    err.code = 'PGRST301';
    const builder = createQueryBuilder({ error: err });
    supabaseMock.from.mockReturnValue(builder);
    mockNavigatorNetwork({ onLine: true, effectiveType: '4g' });

    const result = await storage.processSyncQueue();
    expect(result.deadLetter).toBe(0);
    expect(result.pending).toBe(1);
    expect(storage.getSyncQueueLength()).toBe(1);

    localStorage.clear();
    localStorage.setItem('hively_active_operation_id', 'op-test-1');
    localStorage.setItem('hively_active_operation_role', 'owner');
    mockNavigatorNetwork({ onLine: false });
    await storage.saveHive({ name: 'FkRetry', status: 'Gesund' });
    const fkErr = new Error('violates foreign key constraint');
    fkErr.code = '23503';
    supabaseMock.from.mockReturnValue(createQueryBuilder({ error: fkErr }));
    mockNavigatorNetwork({ onLine: true, effectiveType: '4g' });
    const fkResult = await storage.processSyncQueue();
    expect(fkResult.deadLetter).toBe(0);
    expect(fkResult.pending).toBe(1);
  });

  it('clearCloudSessionData removes entities, outbox and tasks', () => {
    localStorage.setItem('bee_tracker_hives', JSON.stringify([{ id: 'h1' }]));
    localStorage.setItem('bee_tracker_sync_queue', JSON.stringify([{ id: 'q1' }]));
    localStorage.setItem('bee_tracker_tasks', JSON.stringify({ '2026-08': {} }));
    storage.clearCloudSessionData();
    expect(localStorage.getItem('bee_tracker_hives')).toBeNull();
    expect(localStorage.getItem('bee_tracker_sync_queue')).toBeNull();
    expect(localStorage.getItem('bee_tracker_tasks')).toBeNull();
  });

  it('scopes pull blocking to the active operation outbox', async () => {
    mockNavigatorNetwork({ onLine: false });
    await storage.saveHive({ name: 'Op1', status: 'Gesund' });
    // Simulate pending item for another Betrieb
    const queue = JSON.parse(localStorage.getItem('bee_tracker_sync_queue'));
    queue[0].operationId = 'other-op';
    if (queue[0].payload && typeof queue[0].payload === 'object') {
      queue[0].payload.operationId = 'other-op';
    }
    localStorage.setItem('bee_tracker_sync_queue', JSON.stringify(queue));

    expect(storage.hasPendingSyncForOperation('op-test-1')).toBe(false);
    expect(storage.hasPendingSyncForOperation('other-op')).toBe(true);

    const builder = createQueryBuilder({
      data: [{
        id: 'remote-1',
        name: 'Remote',
        status: 'Gesund',
        queen_name: null,
        queen_year: null,
        queen_color: null,
        breed: null,
        notes: null,
        brood_frames: 0,
        honey_frames_1: 0,
        honey_frames_2: 0,
        created_at: '2026-01-01',
        updated_at: '2026-01-01'
      }]
    });
    supabaseMock.from.mockReturnValue(builder);
    mockNavigatorNetwork({ onLine: true, effectiveType: '4g' });

    const hives = await storage.getHives();
    expect(hives.map((h) => h.name)).toContain('Remote');
    expect(builder.select).toHaveBeenCalled();
  });

  it('queues treatment updates when a hive is deleted offline', async () => {
    mockNavigatorNetwork({ onLine: false });
    const hive = await storage.saveHive({ name: 'TreatHive', status: 'Gesund' });
    await storage.saveTreatment({
      hiveIds: [hive.id, 'other-hive'],
      dateStart: '2026-08-01',
      dateEnd: '2026-08-08',
      disease: 'varroa',
      productId: 'formic_60',
      productLabel: 'Ameisensäure 60%',
      status: 'active'
    });

    await storage.deleteHive(hive.id);

    const queue = JSON.parse(localStorage.getItem('bee_tracker_sync_queue'));
    const treatmentUpsert = queue.find(
      (q) => q.type === 'treatments' && q.action === 'upsert'
    );
    expect(treatmentUpsert).toBeTruthy();
    expect(treatmentUpsert.payload.hiveIds).toEqual(['other-hive']);
  });
});
