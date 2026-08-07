import { beforeEach, describe, expect, it } from 'vitest';
import {
  initStorage,
  getApiaries,
  saveApiary,
  getHives,
  saveHive,
  saveInspection,
  getInspections,
  saveTreatment,
  getActiveTreatmentsForHive,
  deleteApiary
} from '../src/storage.js';

describe('apiaries and treatments (local)', () => {
  beforeEach(async () => {
    localStorage.clear();
    await initStorage();
  });

  it('creates a default apiary when empty', async () => {
    const apiaries = await getApiaries();
    expect(apiaries.length).toBe(1);
    expect(apiaries[0].name).toBe('Hauptstand');
  });

  it('saves structured inspection checklist', async () => {
    const apiary = (await getApiaries())[0];
    const hive = await saveHive({
      name: 'Testvolk',
      status: 'Gesund',
      apiaryId: apiary.id
    });
    await saveInspection({
      hiveId: hive.id,
      date: '2026-08-05',
      notes: 'Test',
      temperament: 4,
      feeding: 'Nein',
      honeySuper: '1 Honigraum',
      broodStatus: 'Stifte und offene Brut vorhanden',
      varroa: 'niedrig',
      checklist: {
        queenSeen: 'yes',
        eggs: true,
        openBrood: true,
        cappedBrood: false,
        playCups: false,
        queenCells: false,
        strength: 'strong',
        varroaLevel: 'low'
      }
    });
    const list = await getInspections(hive.id);
    expect(list[0].checklist.eggs).toBe(true);
    expect(list[0].checklist.queenSeen).toBe('yes');
  });

  it('saves active treatment for hive ids', async () => {
    const apiary = (await getApiaries())[0];
    const hive = await saveHive({
      name: 'Behandlungsvolk',
      status: 'Gesund',
      apiaryId: apiary.id
    });
    await saveTreatment({
      hiveIds: [hive.id],
      dateStart: '2026-08-01',
      dateEnd: '2026-08-08',
      disease: 'varroa',
      productId: 'formic_60',
      productLabel: 'Ameisensäure 60%',
      phiDays: 0,
      harvestBlockedUntil: '2026-08-08',
      status: 'active',
      notes: ''
    });
    const active = await getActiveTreatmentsForHive(hive.id);
    expect(active.length).toBeGreaterThanOrEqual(1);
    expect(active[0].productId).toBe('formic_60');
  });

  it('clears hive apiaryId when apiary is deleted', async () => {
    const created = await saveApiary({ name: 'Temp-Stand' });
    const hive = await saveHive({
      name: 'Stand-Volk',
      status: 'Gesund',
      apiaryId: created.id
    });
    await deleteApiary(created.id);
    const updated = (await getHives()).find((h) => h.id === hive.id);
    expect(updated.apiaryId == null || updated.apiaryId !== created.id).toBe(true);
  });
});
