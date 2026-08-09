import { beforeEach, describe, expect, it } from 'vitest';
import {
  TREATMENT_PRODUCTS,
  getTreatmentProduct,
  computeHarvestBlockedUntil,
  summarizeChecklist,
  formatChecklistChips,
  VARROA_LEVEL_LABELS
} from '../src/healthCatalog.js';
import { setLocale } from '../src/i18n/index.js';

describe('healthCatalog', () => {
  beforeEach(() => {
    setLocale('de', { persist: false });
  });

  it('exposes CH treatment products including formic acid', () => {
    expect(TREATMENT_PRODUCTS.length).toBeGreaterThanOrEqual(4);
    expect(getTreatmentProduct('formic_60')?.label).toMatch(/Ameisensäure/);
    expect(getTreatmentProduct('missing')).toBeNull();
  });

  it('computes harvest blocked-until from end date + PHI', () => {
    expect(computeHarvestBlockedUntil('2026-08-01', '2026-08-07', 0)).toBe('2026-08-07');
    expect(computeHarvestBlockedUntil('2026-08-01', null, 3)).toBe('2026-08-04');
    expect(computeHarvestBlockedUntil('2026-08-01', '2026-08-07', null)).toBeNull();
  });

  it('summarizes brood checklist into legacy German text', () => {
    expect(
      summarizeChecklist({ eggs: true, openBrood: true, cappedBrood: true })
    ).toMatch(/Stifte/);
    expect(summarizeChecklist({})).toBe('');
  });

  it('builds checklist chips for UI', () => {
    const chips = formatChecklistChips({
      checklist: {
        queenSeen: 'yes',
        eggs: true,
        varroaLevel: 'low',
        strength: 'strong'
      }
    });
    expect(chips.some((c) => c.includes('Königin'))).toBe(true);
    expect(chips).toContain('Stifte');
    expect(chips.some((c) => c.includes(VARROA_LEVEL_LABELS.low))).toBe(true);
  });
});
