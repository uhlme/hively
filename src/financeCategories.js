/**
 * Stable finance category ids with legacy German label compatibility.
 */
import { t } from './i18n/index.js';

export const FINANCE_CATEGORY_IDS = [
  'hardware',
  'feed',
  'bees',
  'equipment',
  'other'
];

const LEGACY_TO_ID = {
  Hardware: 'hardware',
  Futter: 'feed',
  Bienen: 'bees',
  Imkereibedarf: 'equipment',
  Sonstiges: 'other',
  Patenschaft: 'sponsorship',
  hardware: 'hardware',
  feed: 'feed',
  bees: 'bees',
  equipment: 'equipment',
  other: 'other',
  sponsorship: 'sponsorship'
};

const ID_TO_LEGACY = {
  hardware: 'Hardware',
  feed: 'Futter',
  bees: 'Bienen',
  equipment: 'Imkereibedarf',
  other: 'Sonstiges',
  sponsorship: 'Patenschaft'
};

export function normalizeFinanceCategoryId(raw) {
  if (raw == null || raw === '') return 'other';
  const s = String(raw).trim();
  if (LEGACY_TO_ID[s]) return LEGACY_TO_ID[s];
  const lower = s.toLowerCase();
  if (FINANCE_CATEGORY_IDS.includes(lower)) return lower;
  if (lower === 'sponsorship' || lower === 'patenschaft') return 'sponsorship';
  return 'other';
}

/** Localized label for display (expense cats + sponsorship). */
export function financeCategoryLabel(raw) {
  const id = normalizeFinanceCategoryId(raw);
  const key = `finances.categories.${id}`;
  const label = t(key);
  return label === key ? ID_TO_LEGACY[id] || String(raw || '') : label;
}

/** Value for <select> options (ids). Maps legacy stored values. */
export function financeCategorySelectValue(raw) {
  const id = normalizeFinanceCategoryId(raw);
  return FINANCE_CATEGORY_IDS.includes(id) ? id : 'other';
}

/** Prefer storing stable ids; keep sponsorship as dedicated id. */
export function financeCategoryStorageValue(raw) {
  return normalizeFinanceCategoryId(raw);
}

export function legacyFinanceCategory(raw) {
  const id = normalizeFinanceCategoryId(raw);
  return ID_TO_LEGACY[id] || 'Sonstiges';
}
