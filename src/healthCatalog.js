/**
 * Health / treatment catalog helpers for Tier-1 inspections & Varroa treatments.
 * Swiss (CH) product presets and German UI labels.
 */

export const TREATMENT_PRODUCTS = [
  {
    id: 'formic_60',
    label: 'Ameisensäure 60%',
    defaultDurationDays: 7,
    phiDays: 0,
    disease: 'varroa'
  },
  {
    id: 'oxalic_trickle',
    label: 'Oxalsäure träufeln',
    defaultDurationDays: 1,
    phiDays: 0,
    disease: 'varroa'
  },
  {
    id: 'oxalic_sublim',
    label: 'Oxalsäure verdampfen',
    defaultDurationDays: 1,
    phiDays: 0,
    disease: 'varroa'
  },
  {
    id: 'thymol',
    label: 'Thymol / Apiguard-ähnlich',
    defaultDurationDays: 14,
    phiDays: 0,
    disease: 'varroa'
  },
  {
    id: 'other',
    label: 'Sonstiges',
    defaultDurationDays: null,
    phiDays: null,
    disease: 'varroa'
  }
];

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

export const VARROA_LEVEL_LABELS = {
  low: 'niedrig',
  mid: 'mittel',
  high: 'hoch',
  na: 'n.b.'
};

export const QUEEN_SEEN_LABELS = {
  yes: 'gesehen',
  no: 'nicht gesehen',
  unsure: 'unsicher',
  na: 'n.b.'
};

export const STRENGTH_LABELS = {
  weak: 'schwach',
  mid: 'mittel',
  strong: 'stark',
  na: 'n.b.'
};

/**
 * Short German brood_status string for the legacy inspection.broodStatus field.
 */
export function summarizeChecklist(checklist) {
  if (!checklist || typeof checklist !== 'object') return '';

  const parts = [];
  if (checklist.eggs) parts.push('Stifte');
  if (checklist.openBrood) parts.push('offene Brut');
  if (checklist.cappedBrood) parts.push('verdeckelte Brut');

  if (parts.length === 0) {
    if (checklist.queenCells) return 'Weiselzellen vorhanden';
    if (checklist.playCups) return 'Spielnäpfchen vorhanden';
    return '';
  }
  if (parts.length === 1) return `${parts[0]} vorhanden`;
  if (parts.length === 2) return `${parts[0]} und ${parts[1]} vorhanden`;
  return `${parts[0]}, ${parts[1]} und ${parts[2]} vorhanden`;
}

/**
 * Short chip labels for UI from an inspection's checklist (and legacy fallbacks).
 */
export function formatChecklistChips(inspection) {
  if (!inspection) return [];
  const c = inspection.checklist;
  if (!c || typeof c !== 'object') return [];

  const chips = [];

  if (c.queenSeen && QUEEN_SEEN_LABELS[c.queenSeen]) {
    chips.push(`Königin: ${QUEEN_SEEN_LABELS[c.queenSeen]}`);
  }
  if (c.eggs) chips.push('Stifte');
  if (c.openBrood) chips.push('offene Brut');
  if (c.cappedBrood) chips.push('verdeckelte Brut');
  if (c.playCups) chips.push('Spielnäpfchen');
  if (c.queenCells) chips.push('Weiselzellen');
  if (c.strength && STRENGTH_LABELS[c.strength]) {
    chips.push(`Stärke: ${STRENGTH_LABELS[c.strength]}`);
  }
  if (c.varroaLevel && VARROA_LEVEL_LABELS[c.varroaLevel]) {
    chips.push(`Varroa: ${VARROA_LEVEL_LABELS[c.varroaLevel]}`);
  }

  return chips;
}
