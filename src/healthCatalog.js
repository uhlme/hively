/**
 * Health / treatment catalog helpers for Tier-1 inspections & Varroa treatments.
 * Product ids are stable; UI labels come from i18n.
 */
import { t } from './i18n/index.js';

export const TREATMENT_PRODUCTS = [
  {
    id: 'formic_60',
    labelKey: 'treatments.products.formic_60',
    /** @deprecated use getTreatmentProductLabel(id) */
    get label() {
      return getTreatmentProductLabel(this.id);
    },
    defaultDurationDays: 7,
    phiDays: 0,
    disease: 'varroa'
  },
  {
    id: 'oxalic_trickle',
    labelKey: 'treatments.products.oxalic_trickle',
    get label() {
      return getTreatmentProductLabel(this.id);
    },
    defaultDurationDays: 1,
    phiDays: 0,
    disease: 'varroa'
  },
  {
    id: 'oxalic_sublim',
    labelKey: 'treatments.products.oxalic_sublim',
    get label() {
      return getTreatmentProductLabel(this.id);
    },
    defaultDurationDays: 1,
    phiDays: 0,
    disease: 'varroa'
  },
  {
    id: 'thymol',
    labelKey: 'treatments.products.thymol',
    get label() {
      return getTreatmentProductLabel(this.id);
    },
    defaultDurationDays: 14,
    phiDays: 0,
    disease: 'varroa'
  },
  {
    id: 'other',
    labelKey: 'treatments.products.other',
    get label() {
      return getTreatmentProductLabel(this.id);
    },
    defaultDurationDays: null,
    phiDays: null,
    disease: 'varroa'
  }
];

const FALLBACK_PRODUCT_LABELS = {
  formic_60: 'Ameisensäure 60%',
  oxalic_trickle: 'Oxalsäure träufeln',
  oxalic_sublim: 'Oxalsäure verdampfen',
  thymol: 'Thymol / Apiguard-ähnlich',
  other: 'Sonstiges'
};

export function getTreatmentProductLabel(id) {
  if (!id) return t('treatments.fallbackLabel');
  const key = `treatments.products.${id}`;
  const label = t(key);
  if (label !== key) return label;
  return FALLBACK_PRODUCT_LABELS[id] || t('treatments.fallbackLabel');
}

export function getTreatmentProduct(id) {
  if (!id) return null;
  return TREATMENT_PRODUCTS.find((p) => p.id === id) || null;
}

/**
 * Harvest blocked until (inclusive) = treatment end (or start) + PHI days.
 * Returns YYYY-MM-DD or null when PHI/date is missing.
 */
export function computeHarvestBlockedUntil(dateStart, dateEnd, phiDays) {
  if (phiDays === null || phiDays === undefined || phiDays === '') return null;
  const days = Number(phiDays);
  if (!Number.isFinite(days) || days < 0) return null;

  const base = dateEnd || dateStart;
  if (!base) return null;

  const raw = String(base);
  const d = new Date(raw.includes('T') ? raw : `${raw}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;

  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

export function getVarroaLevelLabel(level) {
  const map = {
    low: 'inspections.levels.varroaLow',
    mid: 'inspections.levels.varroaMid',
    high: 'inspections.levels.varroaHigh',
    na: 'inspections.levels.varroaNa'
  };
  return map[level] ? t(map[level]) : '';
}

export function getQueenSeenLabel(level) {
  const map = {
    yes: 'inspections.levels.queenYes',
    no: 'inspections.levels.queenNo',
    unsure: 'inspections.levels.queenUnsure',
    na: 'inspections.levels.queenNa'
  };
  return map[level] ? t(map[level]) : '';
}

export function getStrengthLabel(level) {
  const map = {
    weak: 'inspections.levels.strengthWeak',
    mid: 'inspections.levels.strengthMid',
    strong: 'inspections.levels.strengthStrong',
    na: 'inspections.levels.strengthNa'
  };
  return map[level] ? t(map[level]) : '';
}

/** @deprecated use getVarroaLevelLabel */
export const VARROA_LEVEL_LABELS = {
  get low() {
    return getVarroaLevelLabel('low');
  },
  get mid() {
    return getVarroaLevelLabel('mid');
  },
  get high() {
    return getVarroaLevelLabel('high');
  },
  get na() {
    return getVarroaLevelLabel('na');
  }
};

/** @deprecated use getQueenSeenLabel */
export const QUEEN_SEEN_LABELS = {
  get yes() {
    return getQueenSeenLabel('yes');
  },
  get no() {
    return getQueenSeenLabel('no');
  },
  get unsure() {
    return getQueenSeenLabel('unsure');
  },
  get na() {
    return getQueenSeenLabel('na');
  }
};

/** @deprecated use getStrengthLabel */
export const STRENGTH_LABELS = {
  get weak() {
    return getStrengthLabel('weak');
  },
  get mid() {
    return getStrengthLabel('mid');
  },
  get strong() {
    return getStrengthLabel('strong');
  },
  get na() {
    return getStrengthLabel('na');
  }
};

/**
 * Short brood_status string for the legacy inspection.broodStatus field.
 */
export function summarizeChecklist(checklist) {
  if (!checklist || typeof checklist !== 'object') return '';
  if (checklist.broodNotInspected) return t('inspections.summary.broodNotInspected');

  const parts = [];
  if (checklist.eggs) parts.push(t('inspections.summary.eggs'));
  if (checklist.openBrood) parts.push(t('inspections.summary.openBrood'));
  if (checklist.cappedBrood) parts.push(t('inspections.summary.cappedBrood'));

  if (parts.length === 0) {
    if (checklist.queenCells) return t('inspections.summary.queenCells');
    if (checklist.playCups) return t('inspections.summary.playCups');
    return '';
  }
  if (parts.length === 1) return t('inspections.summary.presentOne', { a: parts[0] });
  if (parts.length === 2) {
    return t('inspections.summary.presentTwo', { a: parts[0], b: parts[1] });
  }
  return t('inspections.summary.presentThree', {
    a: parts[0],
    b: parts[1],
    c: parts[2]
  });
}

/**
 * Short chip labels for UI from an inspection's checklist (and legacy fallbacks).
 */
export function formatChecklistChips(inspection) {
  if (!inspection) return [];
  const c = inspection.checklist;
  if (!c || typeof c !== 'object') return [];

  const chips = [];

  if (c.queenSeen) {
    const value = getQueenSeenLabel(c.queenSeen);
    if (value) chips.push(t('inspections.chips.queen', { value }));
  }
  if (c.broodNotInspected) {
    chips.push(t('inspections.chips.broodNotInspected'));
  } else {
    if (c.eggs) chips.push(t('inspections.chips.eggs'));
    if (c.openBrood) chips.push(t('inspections.chips.openBrood'));
    if (c.cappedBrood) chips.push(t('inspections.chips.cappedBrood'));
    if (c.playCups) chips.push(t('inspections.chips.playCups'));
    if (c.queenCells) chips.push(t('inspections.chips.queenCells'));
  }
  if (c.strength) {
    const value = getStrengthLabel(c.strength);
    if (value) chips.push(t('inspections.chips.strength', { value }));
  }
  if (c.varroaLevel) {
    const value = getVarroaLevelLabel(c.varroaLevel);
    if (value) chips.push(t('inspections.chips.varroa', { value }));
  }

  return chips;
}
