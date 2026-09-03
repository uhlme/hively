import { beforeEach, describe, expect, it } from 'vitest';
import {
  shouldSeedDemoData,
  seedDemoData,
  maybeSeedDemoData
} from '../src/devSeed.js';

const KEYS = {
  HIVES: 'bee_tracker_hives',
  INSPECTIONS: 'bee_tracker_inspections',
  FINANCES: 'bee_tracker_finances',
  HONEY: 'bee_tracker_honey',
  APIARIES: 'bee_tracker_apiaries'
};

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

  it('seeds valid domain data and forces German locale', () => {
    seedDemoData();

    const apiaries = read(KEYS.APIARIES);
    const hives = read(KEYS.HIVES);
    const inspections = read(KEYS.INSPECTIONS);
    const finances = read(KEYS.FINANCES);
    const honey = read(KEYS.HONEY);

    expect(apiaries.length).toBeGreaterThanOrEqual(2);
    expect(hives.length).toBeGreaterThanOrEqual(5);
    expect(inspections.length).toBeGreaterThanOrEqual(3);
    expect(finances.length).toBeGreaterThanOrEqual(3);
    expect(honey.length).toBeGreaterThanOrEqual(2);
    expect(localStorage.getItem('hively_locale')).toBe('de');

    // Every hive references an existing apiary.
    const apiaryIds = new Set(apiaries.map((a) => a.id));
    for (const hive of hives) {
      expect(apiaryIds.has(hive.apiaryId)).toBe(true);
    }

    // Every inspection references an existing hive.
    const hiveIds = new Set(hives.map((h) => h.id));
    for (const insp of inspections) {
      expect(hiveIds.has(insp.hiveId)).toBe(true);
    }

    // Finances carry both income and expense entries.
    const types = new Set(finances.map((f) => f.type));
    expect(types.has('income')).toBe(true);
    expect(types.has('expense')).toBe(true);
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
