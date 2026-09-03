import { beforeEach, describe, expect, it } from 'vitest';
import {
  shouldSeedDemoData,
  seedDemoData,
  maybeSeedDemoData
} from '../src/devSeed.js';
import { normalizeFinanceCategoryId } from '../src/financeCategories.js';

const KEYS = {
  HIVES: 'bee_tracker_hives',
  INSPECTIONS: 'bee_tracker_inspections',
  FINANCES: 'bee_tracker_finances',
  HONEY: 'bee_tracker_honey',
  APIARIES: 'bee_tracker_apiaries',
  TREATMENTS: 'bee_tracker_treatments'
};

// Enum keys the inspection form / storage accept (src/healthCatalog.js, index.html).
const STRENGTH_VALUES = new Set(['', 'weak', 'mid', 'strong', 'na']);
const VARROA_VALUES = new Set(['', 'low', 'mid', 'high', 'na']);
const HONEY_SUPER_VALUES = new Set(['', '1', '2+']);
// Finance types the finance view actually lists (src/main.js).
const FINANCE_TYPES = new Set(['expense', 'sponsorship']);

function read(key) {
  return JSON.parse(localStorage.getItem(key) || '[]');
}

describe('devSeed', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState({}, '', '/');
  });

  it('does not seed without a trigger', () => {
    expect(shouldSeedDemoData()).toBe(false);
    expect(maybeSeedDemoData()).toBe(false);
    expect(localStorage.getItem(KEYS.HIVES)).toBeNull();
  });

  it('detects the localStorage flag', () => {
    localStorage.setItem('hively_uitest_seed', '1');
    expect(shouldSeedDemoData()).toBe(true);
  });

  it('detects the URL query trigger', () => {
    window.history.replaceState({}, '', '/?hively_seed=demo');
    expect(shouldSeedDemoData()).toBe(true);
  });

  it('seeds a referentially consistent dataset and forces German locale', () => {
    seedDemoData();

    const apiaries = read(KEYS.APIARIES);
    const hives = read(KEYS.HIVES);
    const inspections = read(KEYS.INSPECTIONS);
    const finances = read(KEYS.FINANCES);
    const honey = read(KEYS.HONEY);
    const treatments = read(KEYS.TREATMENTS);

    expect(apiaries.length).toBeGreaterThanOrEqual(2);
    expect(hives.length).toBeGreaterThanOrEqual(5);
    expect(inspections.length).toBeGreaterThanOrEqual(3);
    expect(finances.length).toBeGreaterThanOrEqual(3);
    expect(honey.length).toBeGreaterThanOrEqual(2);
    expect(treatments.length).toBeGreaterThanOrEqual(1);
    expect(localStorage.getItem('hively_locale')).toBe('de');

    const apiaryIds = new Set(apiaries.map((a) => a.id));
    for (const hive of hives) {
      expect(apiaryIds.has(hive.apiaryId)).toBe(true);
    }

    const hiveIds = new Set(hives.map((h) => h.id));
    for (const insp of inspections) {
      expect(hiveIds.has(insp.hiveId)).toBe(true);
    }
    for (const tx of treatments) {
      for (const id of tx.hiveIds) expect(hiveIds.has(id)).toBe(true);
    }
    for (const f of finances) {
      if (f.hiveId) expect(hiveIds.has(f.hiveId)).toBe(true);
    }
  });

  it('only uses finance categories/types the app can render', () => {
    seedDemoData();
    const finances = read(KEYS.FINANCES);

    // At least one real expense and the sponsorship income.
    expect(finances.some((f) => f.type === 'expense')).toBe(true);
    expect(finances.some((f) => f.type === 'sponsorship')).toBe(true);

    for (const f of finances) {
      expect(FINANCE_TYPES.has(f.type)).toBe(true);
      // Unknown categories silently normalise to 'other' — a seed entry that
      // does that is a bug, unless it is genuinely a sponsorship row.
      if (f.type === 'expense') {
        expect(normalizeFinanceCategoryId(f.category)).not.toBe('other');
      }
    }
  });

  it('only uses checklist / honeySuper values the inspection form can select', () => {
    seedDemoData();
    for (const insp of read(KEYS.INSPECTIONS)) {
      expect(STRENGTH_VALUES.has(insp.checklist.strength)).toBe(true);
      expect(VARROA_VALUES.has(insp.checklist.varroaLevel)).toBe(true);
      expect(HONEY_SUPER_VALUES.has(insp.honeySuper ?? '')).toBe(true);
      // Derived display fields must not be baked into the seed.
      expect(insp.varroa).toBeUndefined();
      expect(insp.broodStatus).toBeUndefined();
    }
  });

  it('gives each inspection its own checklist object', () => {
    seedDemoData();
    const lists = read(KEYS.INSPECTIONS).map((i) => i.checklist);
    const unique = new Set(lists.map((c) => JSON.stringify(c)));
    // insp-3 and insp-4 differ; the shared-reference bug would collapse these.
    expect(unique.size).toBeGreaterThanOrEqual(3);
  });

  it('consumes the one-shot seed flag so reloads do not re-wipe data', () => {
    localStorage.setItem('hively_uitest_seed', '1');
    expect(maybeSeedDemoData()).toBe(true);
    expect(localStorage.getItem('hively_uitest_seed')).toBeNull();
    expect(shouldSeedDemoData()).toBe(false);
  });

  it('does not overwrite an existing locale', () => {
    localStorage.setItem('hively_locale', 'fr');
    seedDemoData();
    expect(localStorage.getItem('hively_locale')).toBe('fr');
  });
});
