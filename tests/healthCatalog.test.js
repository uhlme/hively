import { beforeEach, describe, expect, it } from 'vitest';
import {
  TREATMENT_PRODUCTS,
  getTreatmentProduct,
  getGroupedTreatmentProducts,
  getTreatmentProductLabel,
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

  it('exposes CH treatment products including Formivar 70%', () => {
    expect(TREATMENT_PRODUCTS.length).toBeGreaterThanOrEqual(15);
    expect(getTreatmentProduct('formic_60')?.label).toMatch(/Ameisensäure/);
    expect(getTreatmentProduct('formivar_70')?.label).toBe('Formivar 70%');
    expect(getTreatmentProduct('apiguard')?.label).toBe('Apiguard');
    expect(getTreatmentProduct('apivar')?.label).toBe('Apivar');
    expect(getTreatmentProduct('missing')).toBeNull();

    const groups = getGroupedTreatmentProducts();
    expect(groups.map((g) => g.id)).toEqual([
      'formic',
      'oxalic',
      'thymol',
      'combined',
      'synthetic',
      'other'
    ]);
    expect(groups.find((g) => g.id === 'formic')?.products.map((p) => p.id)).toContain(
      'formivar_70'
    );
    expect(getTreatmentProductLabel('formivar_70')).toBe('Formivar 70%');

    expect(getTreatmentProduct('formic_60')?.defaultDurationDays).toBe(7);
    expect(getTreatmentProduct('formic_60')?.phiDays).toBe(0);
    expect(getTreatmentProduct('formivar_70')?.phiDays).toBe(0);
    expect(getTreatmentProduct('apivar')?.phiDays).toBeNull();
    expect(getTreatmentProduct('bayvarol')?.phiDays).toBeNull();
    expect(getTreatmentProduct('polyvar')?.phiDays).toBeNull();
    expect(getTreatmentProduct('other')?.phiDays).toBeNull();

    const ids = TREATMENT_PRODUCTS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(getTreatmentProductLabel(id)).not.toBe(`treatments.products.${id}`);
    }
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
    expect(summarizeChecklist({ broodNotInspected: true, eggs: true })).toBe(
      'Keine Brutkontrolle'
    );
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

    const skipped = formatChecklistChips({
      checklist: { broodNotInspected: true, eggs: true, varroaLevel: 'mid' }
    });
    expect(skipped).toContain('Keine Brutkontrolle');
    expect(skipped).not.toContain('Stifte');
  });
});
