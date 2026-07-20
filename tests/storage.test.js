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

  it('rejects malformed backup imports', async () => {
    expect(await storage.importData('not-json')).toBe(false);
    expect(await storage.importData(JSON.stringify({ foo: 1 }))).toBe(false);
  });

  it('exports and imports local backup data', async () => {
    supabaseMock.auth.getSession.mockResolvedValue({ data: { session: null } });
    mockNavigatorNetwork({ onLine: false });

    await storage.saveHive({ name: 'Backup Volk', status: 'Gesund' });
    const exported = await storage.exportData();
    const parsed = JSON.parse(exported);
    expect(parsed.hives).toHaveLength(1);

    localStorage.clear();
    const ok = await storage.importData(exported);
    expect(ok).toBe(true);
    expect(await storage.getHives()).toHaveLength(1);
    expect((await storage.getHives())[0].name).toBe('Backup Volk');
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
});
