// Demo/UITest seed: fills localStorage with realistic sample data so App Store
// screenshots (and manual QA) show a populated app instead of an empty state.
//
// Trigger (any of):
//   - localStorage 'hively_uitest_seed' === '1'  (set by the iOS UITest hook)
//   - URL query   ?hively_seed=demo   (dev builds only)
//   - URL hash    #hively_seed=demo   (dev builds only)
//
// The seed replaces the domain entities so the result is stable across runs.
// Dates are computed relative to the capture day (so nothing ever looks stale),
// so screenshots differ by the shown dates between runs but not by content.
// It only runs when explicitly asked.
//
// All enum-like values below use the same keys the app itself stores (see
// src/financeCategories.js, src/healthCatalog.js) — not display labels — so the
// UI renders them exactly as if a user had entered them.

const KEYS = {
  HIVES: 'bee_tracker_hives',
  INSPECTIONS: 'bee_tracker_inspections',
  FINANCES: 'bee_tracker_finances',
  HONEY: 'bee_tracker_honey',
  APIARIES: 'bee_tracker_apiaries',
  TREATMENTS: 'bee_tracker_treatments'
};
const LOCALE_KEY = 'hively_locale';
const SEED_FLAG = 'hively_uitest_seed';

export function shouldSeedDemoData() {
  try {
    // Native UITest hook sets this flag via a document-start script. localStorage
    // is origin-scoped, so only the app itself (or the test) can set it.
    if (localStorage.getItem(SEED_FLAG) === '1') return true;
    // URL triggers are dev-only to avoid a production footgun that would wipe a
    // visitor's local data via a crafted link.
    if (import.meta.env?.DEV) {
      const search = new URLSearchParams(window.location.search);
      if (search.get('hively_seed') === 'demo') return true;
      if ((window.location.hash || '').includes('hively_seed=demo')) return true;
    }
  } catch (err) {
    // localStorage / URL access can throw in locked-down contexts — ignore.
    console.warn('[devSeed] trigger check failed:', err);
  }
  return false;
}

/** Date `days` before today as an ISO `YYYY-MM-DD` string. */
function daysAgo(days) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function nowIso() {
  return new Date().toISOString();
}

function buildSeed() {
  const stamp = nowIso();
  const meta = { createdAt: stamp, updatedAt: stamp };

  const apiaries = [
    { id: 'seed-apiary-1', name: 'Hauptstand Talwiese', notes: 'Hausbienenstand am Waldrand', ...meta },
    { id: 'seed-apiary-2', name: 'Wanderstand Obstgarten', notes: 'Frühtracht Kirsche & Apfel', ...meta }
  ];

  // queenColor is derived from queenYear by the app (getQueenColorInfo); the
  // stored value is never displayed. Kept here only for readability.
  const hives = [
    { id: 'seed-hive-1', name: 'Volk 1', queenName: 'Berta', queenYear: '2025', queenColor: 'Blau', breed: 'Carnica', status: 'Gesund', notes: 'Sanftmütig, starke Frühjahrsentwicklung', broodFrames: 8, honeyFrames1: 10, honeyFrames2: 0, apiaryId: 'seed-apiary-1', ...meta },
    { id: 'seed-hive-2', name: 'Volk 2', queenName: 'Clara', queenYear: '2024', queenColor: 'Grün', breed: 'Buckfast', status: 'Gesund', notes: 'Guter Honigertrag', broodFrames: 7, honeyFrames1: 10, honeyFrames2: 10, apiaryId: 'seed-apiary-1', ...meta },
    { id: 'seed-hive-3', name: 'Volk 3', queenName: 'Doris', queenYear: '2025', queenColor: 'Blau', breed: 'Carnica', status: 'Schwarmstimmung', notes: 'Weiselzellen kontrollieren', broodFrames: 9, honeyFrames1: 10, honeyFrames2: 5, apiaryId: 'seed-apiary-1', ...meta },
    { id: 'seed-hive-4', name: 'Volk 4', queenName: 'Emma', queenYear: '2024', queenColor: 'Grün', breed: 'Carnica', status: 'Varroa-Behandlung', notes: 'Ameisensäure-Behandlung läuft', broodFrames: 6, honeyFrames1: 0, honeyFrames2: 0, apiaryId: 'seed-apiary-2', ...meta },
    { id: 'seed-hive-5', name: 'Volk 5', queenName: 'Frieda', queenYear: '2026', queenColor: 'Weiss', breed: 'Buckfast', status: 'Gesund', notes: 'Junges Volk aus Ableger', broodFrames: 5, honeyFrames1: 0, honeyFrames2: 0, apiaryId: 'seed-apiary-2', ...meta }
  ];

  // Checklist keys match the inspection form (src/healthCatalog.js):
  //   strength    '' | weak | mid | strong | na
  //   varroaLevel '' | low  | mid | high   | na
  const baseChecklist = {
    queenSeen: true,
    broodNotInspected: false,
    eggs: true,
    openBrood: true,
    cappedBrood: true,
    playCups: false,
    queenCells: false,
    strength: 'strong',
    varroaLevel: 'low'
  };

  // honeySuper is a legacy select: '' (none) | '1' | '2+'.
  // varroa / broodStatus are NOT stored by the seed — the app derives them from
  // the checklist on save, so setting them here would create a second, diverging
  // source of truth.
  const inspections = [
    { id: 'seed-insp-1', hiveId: 'seed-hive-1', date: daysAgo(3), feeding: null, honeySuper: '1', temperament: 5, weatherTemp: 21, weatherCondition: 'Sonnig', notes: 'Königin gesehen, Stifte vorhanden, ruhiges Volk.', checklist: { ...baseChecklist }, ...meta },
    { id: 'seed-insp-2', hiveId: 'seed-hive-2', date: daysAgo(5), feeding: null, honeySuper: '2+', temperament: 4, weatherTemp: 19, weatherCondition: 'Leicht bewölkt', notes: 'Honigraum fast voll, zweiter aufgesetzt.', checklist: { ...baseChecklist }, ...meta },
    { id: 'seed-insp-3', hiveId: 'seed-hive-3', date: daysAgo(2), feeding: null, honeySuper: '1', temperament: 3, weatherTemp: 22, weatherCondition: 'Sonnig', notes: 'Spielnäpfchen und erste Weiselzellen – Schwarmkontrolle nötig.', checklist: { ...baseChecklist, playCups: true, queenCells: true }, ...meta },
    { id: 'seed-insp-4', hiveId: 'seed-hive-4', date: daysAgo(8), feeding: null, honeySuper: '', temperament: 4, weatherTemp: 18, weatherCondition: 'Bewölkt', notes: 'Varroa-Befall erhöht, Ameisensäure gestartet.', checklist: { ...baseChecklist, strength: 'mid', varroaLevel: 'mid' }, ...meta }
  ];

  // Finance categories are stable ids (src/financeCategories.js):
  //   expense: hardware | feed | bees | equipment | other
  //   income:  type 'sponsorship' (the only income the finance view lists)
  const finances = [
    { id: 'seed-fin-1', date: daysAgo(40), description: 'Mittelwände & Rähmchen', category: 'hardware', price: 84.5, type: 'expense', hiveId: null, sponsorName: null, notes: null, ...meta },
    { id: 'seed-fin-2', date: daysAgo(25), description: 'Ameisensäure 60 %', category: 'equipment', price: 32.9, type: 'expense', hiveId: null, sponsorName: null, notes: null, ...meta },
    { id: 'seed-fin-3', date: daysAgo(18), description: 'Zuckerwasser / Futtersirup', category: 'feed', price: 46.2, type: 'expense', hiveId: null, sponsorName: null, notes: null, ...meta },
    { id: 'seed-fin-4', date: daysAgo(9), description: 'Ableger-Königin Buckfast', category: 'bees', price: 38, type: 'expense', hiveId: 'seed-hive-5', sponsorName: null, notes: null, ...meta },
    { id: 'seed-fin-5', date: daysAgo(30), description: 'Smoker & Stockmeissel', category: 'hardware', price: 61.5, type: 'expense', hiveId: null, sponsorName: null, notes: null, ...meta },
    { id: 'seed-fin-6', date: daysAgo(6), description: 'Bienenpatenschaft Familie Meier', category: 'sponsorship', price: 120, type: 'sponsorship', hiveId: 'seed-hive-1', sponsorName: 'Familie Meier', notes: null, ...meta }
  ];

  const honey = [
    { id: 'seed-honey-1', hiveId: 'seed-hive-1', date: daysAgo(14), amount: 18.5, type: 'Blütenhonig', ...meta },
    { id: 'seed-honey-2', hiveId: 'seed-hive-2', date: daysAgo(14), amount: 22, type: 'Blütenhonig', ...meta },
    { id: 'seed-honey-3', hiveId: 'seed-hive-3', date: daysAgo(13), amount: 15, type: 'Waldhonig', ...meta }
  ];

  // One active treatment so the dashboard "Aktive Behandlungen" card and the
  // Volk-4 status badge line up. Fields match src/main.js treatment form output.
  const treatments = [
    {
      id: 'seed-treat-1',
      hiveIds: ['seed-hive-4'],
      dateStart: daysAgo(4),
      dateEnd: null,
      disease: 'varroa',
      productId: 'formic_60',
      productLabel: 'Ameisensäure 60%',
      dose: '40 ml',
      phiDays: 0,
      harvestBlockedUntil: daysAgo(-10),
      status: 'active',
      notes: 'Langzeitbehandlung, Wetter beobachten.',
      ...meta
    }
  ];

  return { apiaries, hives, inspections, finances, honey, treatments };
}

/**
 * Write the demo dataset to localStorage and force German locale.
 * Returns true when data was written.
 */
export function seedDemoData() {
  try {
    const { apiaries, hives, inspections, finances, honey, treatments } = buildSeed();
    localStorage.setItem(KEYS.APIARIES, JSON.stringify(apiaries));
    localStorage.setItem(KEYS.HIVES, JSON.stringify(hives));
    localStorage.setItem(KEYS.INSPECTIONS, JSON.stringify(inspections));
    localStorage.setItem(KEYS.FINANCES, JSON.stringify(finances));
    localStorage.setItem(KEYS.HONEY, JSON.stringify(honey));
    localStorage.setItem(KEYS.TREATMENTS, JSON.stringify(treatments));
    if (!localStorage.getItem(LOCALE_KEY)) {
      localStorage.setItem(LOCALE_KEY, 'de');
    }
    // Clear the trigger so a manual reload in the web app (or a dev who set the
    // flag by hand) doesn't wipe data added on top of the seed. In the UITest
    // the native document-start script re-sets it on every launch, which is the
    // wanted behaviour there: a fresh, identical starting state per screen.
    localStorage.removeItem(SEED_FLAG);
    return true;
  } catch (err) {
    console.warn('[devSeed] Seeding demo data failed:', err);
    return false;
  }
}

/** Seed only when explicitly requested. Safe to call unconditionally on boot. */
export function maybeSeedDemoData() {
  if (!shouldSeedDemoData()) return false;
  return seedDemoData();
}
