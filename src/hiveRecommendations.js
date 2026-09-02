import { callGemini } from './geminiApi.js';
import { isNetworkError } from './network.js';
import { getLocale, t } from './i18n/index.js';
import { safeJsonParse } from './utils.js';

const REC_CACHE_KEY = 'hively_hive_ai_recs';
/** Cache AI tips until inspections change, or at most this long. */
export const HIVE_REC_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

/** Fields the proxy needs — avoid shipping unrelated localStorage noise. */
export function slimHiveForAi(hive) {
  if (!hive || typeof hive !== 'object') return hive;
  return {
    id: hive.id,
    name: hive.name,
    queenName: hive.queenName,
    queenYear: hive.queenYear,
    queenColor: hive.queenColor,
    breed: hive.breed,
    status: hive.status,
    broodFrames: hive.broodFrames,
    honeyFrames1: hive.honeyFrames1,
    honeyFrames2: hive.honeyFrames2,
    notes: hive.notes
  };
}

/** Keep checklist; drop creator ids / timestamps that bloat the request. */
export function slimInspectionForAi(insp) {
  if (!insp || typeof insp !== 'object') return insp;
  return {
    date: insp.date,
    feeding: insp.feeding,
    varroa: insp.varroa,
    broodStatus: insp.broodStatus,
    honeySuper: insp.honeySuper,
    temperament: insp.temperament,
    weatherTemp: insp.weatherTemp,
    weatherCondition: insp.weatherCondition,
    notes: insp.notes,
    checklist: insp.checklist || null
  };
}

/**
 * Stable fingerprint so cache invalidates when hive data, recent inspections,
 * or UI locale change — without hashing the whole localStorage blob.
 */
export function buildHiveRecommendationFingerprint(hive, inspections, locale = getLocale()) {
  const slimHive = slimHiveForAi(hive);
  const recent = [...(inspections || [])]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 10)
    .map(slimInspectionForAi);
  return JSON.stringify({ locale, hive: slimHive, inspections: recent });
}

function readRecCacheStore() {
  const store = safeJsonParse(localStorage.getItem(REC_CACHE_KEY), null);
  return store && typeof store === 'object' && !Array.isArray(store) ? store : {};
}

function writeRecCacheStore(store) {
  try {
    localStorage.setItem(REC_CACHE_KEY, JSON.stringify(store));
  } catch (err) {
    console.warn('[hiveRecommendations] cache write failed:', err);
  }
}

/**
 * @returns {{ recommendation: string, cachedAt: number, fingerprint: string } | null}
 */
export function readHiveRecommendationCache(hiveId, fingerprint) {
  if (!hiveId || !fingerprint) return null;
  const entry = readRecCacheStore()[hiveId];
  if (!entry || typeof entry !== 'object') return null;
  if (entry.fingerprint !== fingerprint) return null;
  if (typeof entry.recommendation !== 'string' || !entry.recommendation.trim()) return null;
  const age = Date.now() - Number(entry.cachedAt || 0);
  if (!Number.isFinite(age) || age < 0 || age > HIVE_REC_CACHE_TTL_MS) return null;
  return entry;
}

export function writeHiveRecommendationCache(hiveId, fingerprint, recommendation) {
  if (!hiveId || !fingerprint || typeof recommendation !== 'string') return;
  const text = recommendation.trim();
  if (!text) return;
  const store = readRecCacheStore();
  store[hiveId] = {
    fingerprint,
    recommendation: text,
    cachedAt: Date.now()
  };
  writeRecCacheStore(store);
}

/** Drop one hive or the whole AI recommendation cache (logout / clear data). */
export function clearHiveRecommendationCache(hiveId = null) {
  if (!hiveId) {
    localStorage.removeItem(REC_CACHE_KEY);
    return;
  }
  const store = readRecCacheStore();
  if (!(hiveId in store)) return;
  delete store[hiveId];
  writeRecCacheStore(store);
}

/**
 * Generiere KI-basierte Empfehlungen für ein Volk basierend auf seinen Durchsichten.
 * @param {Object} hive - Das Volk-Objekt
 * @param {Array} inspections - Array der Durchsichten für dieses Volk
 * @param {{ forceRefresh?: boolean }} [options]
 * @returns {Promise<{ text: string, fromCache: boolean, durationMs: number }>}
 */
export async function getHiveRecommendation(hive, inspections, options = {}) {
  const forceRefresh = Boolean(options.forceRefresh);

  if (!hive || !Array.isArray(inspections) || inspections.length === 0) {
    return {
      text: t('ai.recommendationNoInspections'),
      fromCache: false,
      durationMs: 0
    };
  }

  const locale = getLocale();
  const fingerprint = buildHiveRecommendationFingerprint(hive, inspections, locale);

  if (!forceRefresh) {
    const cached = readHiveRecommendationCache(hive.id, fingerprint);
    if (cached) {
      return {
        text: cached.recommendation,
        fromCache: true,
        durationMs: 0
      };
    }
  }

  const started = performance.now();
  try {
    const recent = [...inspections]
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 10)
      .map(slimInspectionForAi);

    const result = await callGemini(
      'hive_recommendation',
      { hive: slimHiveForAi(hive), inspections: recent },
      45000
    );
    const text = typeof result?.recommendation === 'string' ? result.recommendation.trim() : '';
    const recommendation = text || t('ai.recommendationUnavailable');
    const durationMs = Math.round(performance.now() - started);

    if (text) {
      writeHiveRecommendationCache(hive.id, fingerprint, text);
    }

    return { text: recommendation, fromCache: false, durationMs };
  } catch (e) {
    console.error('Fehler bei Gemini Empfehlung:', e);
    // CORS / offline / proxy unreachable → soft message (never raw "Failed to fetch")
    if (isNetworkError(e)) {
      return {
        text: t('ai.recommendationUnavailable'),
        fromCache: false,
        durationMs: Math.round(performance.now() - started)
      };
    }
    // Auth / Pro / rate-limit / proxy errors → let UI show danger + ok:false analytics
    throw e;
  }
}

/**
 * Generiere KI-basierte Empfehlungen für alle Völker.
 * @param {Array} hives - Array aller Völker
 * @param {Array} allInspections - Array aller Durchsichten
 * @returns {Promise<Object>} - Map von hiveId zu Empfehlungstext
 */
export async function getRecommendationsForAllHives(hives, allInspections) {
  const recommendations = {};

  for (const hive of hives) {
    const hiveInspections = allInspections.filter((i) => i.hiveId === hive.id);
    try {
      const result = await getHiveRecommendation(hive, hiveInspections);
      recommendations[hive.id] = result.text;
    } catch (e) {
      console.error(`Fehler bei Empfehlung für Volk ${hive.name}:`, e);
      recommendations[hive.id] = t('ai.recommendationUnavailable');
    }
  }

  return recommendations;
}
