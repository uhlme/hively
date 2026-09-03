// Demo/UITest seed: fills localStorage with realistic sample data so App Store
// screenshots (and manual QA) show a populated app instead of an empty state.
//
// Trigger (any of):
//   - localStorage 'hively_uitest_seed' === '1'  (set by the iOS UITest hook)
//   - URL query   ?hively_seed=demo
//   - URL hash    #hively_seed=demo
//
// The seed is intentionally destructive for the domain entities (it replaces
// them) so screenshots are deterministic. It only runs when explicitly asked.

const KEYS = {
  HIVES: 'bee_tracker_hives',
  INSPECTIONS: 'bee_tracker_inspections',
  FINANCES: 'bee_tracker_finances',
  HONEY: 'bee_tracker_honey',
  APIARIES: 'bee_tracker_apiaries'
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
  } catch {
    // localStorage / URL access can throw in locked-down contexts — ignore.
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

  const hives = [
    { id: 'seed-hive-1', name: 'Volk 1', queenName: 'Berta', queenYear: '2025', queenColor: 'Blau', breed: 'Carnica', status: 'Gesund', notes: 'Sanftmütig, starke Frühjahrsentwicklung', broodFrames: 8, honeyFrames1: 10, honeyFrames2: 0, apiaryId: 'seed-apiary-1', ...meta },
    { id: 'seed-hive-2', name: 'Volk 2', queenName: 'Clara', queenYear: '2024', queenColor: 'Grün', breed: 'Buckfast', status: 'Gesund', notes: 'Guter Honigertrag', broodFrames: 7, honeyFrames1: 10, honeyFrames2: 10, apiaryId: 'seed-apiary-1', ...meta },
    { id: 'seed-hive-3', name: 'Volk 3', queenName: 'Doris', queenYear: '2025', queenColor: 'Blau', breed: 'Carnica', status: 'Schwarmstimmung', notes: 'Weiselzellen kontrollieren', broodFrames: 9, honeyFrames1: 10, honeyFrames2: 5, apiaryId: 'seed-apiary-1', ...meta },
    { id: 'seed-hive-4', name: 'Volk 4', queenName: 'Emma', queenYear: '2024', queenColor: 'Grün', breed: 'Carnica', status: 'Varroa-Behandlung', notes: 'Ameisensäure-Behandlung läuft', broodFrames: 6, honeyFrames1: 0, honeyFrames2: 0, apiaryId: 'seed-apiary-2', ...meta },
    { id: 'seed-hive-5', name: 'Volk 5', queenName: 'Frieda', queenYear: '2026', queenColor: 'Weiß', breed: 'Buckfast', status: 'Gesund', notes: 'Junges Volk aus Ableger', broodFrames: 5, honeyFrames1: 0, honeyFrames2: 0, apiaryId: 'seed-apiary-2', ...meta }
  ];

  const checklist = {
    queenSeen: true,
    broodNotInspected: false,
    eggs: true,
    openBrood: true,
    cappedBrood: true,
    playCups: false,
    queenCells: false,
    strength: 'stark',
    varroaLevel: 'niedrig'
  };

  const inspections = [
    { id: 'seed-insp-1', hiveId: 'seed-hive-1', date: daysAgo(3), feeding: null, varroa: 'niedrig', broodStatus: 'gut', honeySuper: 'ja', temperament: 5, weatherTemp: 21, weatherCondition: 'Sonnig', notes: 'Königin gesehen, Stifte vorhanden, ruhiges Volk.', checklist, ...meta },
    { id: 'seed-insp-2', hiveId: 'seed-hive-2', date: daysAgo(5), feeding: null, varroa: 'niedrig', broodStatus: 'gut', honeySuper: 'ja', temperament: 4, weatherTemp: 19, weatherCondition: 'Leicht bewölkt', notes: 'Honigraum fast voll, zweiter aufgesetzt.', checklist, ...meta },
    { id: 'seed-insp-3', hiveId: 'seed-hive-3', date: daysAgo(2), feeding: null, varroa: 'niedrig', broodStatus: 'gut', honeySuper: 'ja', temperament: 3, weatherTemp: 22, weatherCondition: 'Sonnig', notes: 'Spielnäpfchen und erste Weiselzellen – Schwarmkontrolle nötig.', checklist: { ...checklist, playCups: true, queenCells: true }, ...meta },
    { id: 'seed-insp-4', hiveId: 'seed-hive-4', date: daysAgo(8), feeding: null, varroa: 'mittel', broodStatus: 'mittel', honeySuper: 'nein', temperament: 4, weatherTemp: 18, weatherCondition: 'Bewölkt', notes: 'Varroa-Befall erhöht, Ameisensäure gestartet.', checklist: { ...checklist, varroaLevel: 'mittel' }, ...meta }
  ];

  const finances = [
    { id: 'seed-fin-1', date: daysAgo(40), description: 'Mittelwände & Rähmchen', category: 'hardware', price: 84.5, type: 'expense', hiveId: null, sponsorName: null, notes: null, ...meta },
    { id: 'seed-fin-2', date: daysAgo(25), description: 'Ameisensäure 60 %', category: 'equipment', price: 32.9, type: 'expense', hiveId: null, sponsorName: null, notes: null, ...meta },
    { id: 'seed-fin-3', date: daysAgo(18), description: 'Zuckerwasser / Futtersirup', category: 'feed', price: 46.2, type: 'expense', hiveId: null, sponsorName: null, notes: null, ...meta },
    { id: 'seed-fin-4', date: daysAgo(9), description: 'Ableger-Königin Buckfast', category: 'bees', price: 38, type: 'expense', hiveId: 'seed-hive-5', sponsorName: null, notes: null, ...meta },
    { id: 'seed-fin-5', date: daysAgo(30), description: 'Smoker & Stockmeissel', category: 'hardware', price: 61.5, type: 'expense', hiveId: null, sponsorName: null, notes: null, ...meta },
    { id: 'seed-fin-6', date: daysAgo(6), description: 'Bienenpatenschaft Familie Meier', category: 'sponsorship', price: 120, type: 'income', hiveId: 'seed-hive-1', sponsorName: 'Familie Meier', notes: null, ...meta }
  ];

  const honey = [
    { id: 'seed-honey-1', hiveId: 'seed-hive-1', date: daysAgo(14), amount: 18.5, type: 'Blütenhonig', ...meta },
    { id: 'seed-honey-2', hiveId: 'seed-hive-2', date: daysAgo(14), amount: 22, type: 'Blütenhonig', ...meta },
    { id: 'seed-honey-3', hiveId: 'seed-hive-3', date: daysAgo(13), amount: 15, type: 'Waldhonig', ...meta }
  ];

  return { apiaries, hives, inspections, finances, honey };
}

/**
 * Write the demo dataset to localStorage and force German locale.
 * Returns true when data was written.
 */
export function seedDemoData() {
  try {
    const { apiaries, hives, inspections, finances, honey } = buildSeed();
    localStorage.setItem(KEYS.APIARIES, JSON.stringify(apiaries));
    localStorage.setItem(KEYS.HIVES, JSON.stringify(hives));
    localStorage.setItem(KEYS.INSPECTIONS, JSON.stringify(inspections));
    localStorage.setItem(KEYS.FINANCES, JSON.stringify(finances));
    localStorage.setItem(KEYS.HONEY, JSON.stringify(honey));
    if (!localStorage.getItem(LOCALE_KEY)) {
      localStorage.setItem(LOCALE_KEY, 'de');
    }
    // Consume the one-shot trigger so a later reload doesn't wipe data the
    // user (or a screenshot reviewer) added on top of the seed.
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
