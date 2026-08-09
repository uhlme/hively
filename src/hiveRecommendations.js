import { callGemini } from './geminiApi.js';
import { isNetworkError } from './network.js';
import { t } from './i18n/index.js';

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
 * Generiere KI-basierte Empfehlungen für ein Volk basierend auf seinen Durchsichten.
 * @param {Object} hive - Das Volk-Objekt
 * @param {Array} inspections - Array der Durchsichten für dieses Volk
 * @returns {Promise<string>} - Die Empfehlung als Text
 */
export async function getHiveRecommendation(hive, inspections) {
  if (!hive || !Array.isArray(inspections) || inspections.length === 0) {
    return t('ai.recommendationNoInspections');
  }

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
    return text || t('ai.recommendationUnavailable');
  } catch (e) {
    console.error('Fehler bei Gemini Empfehlung:', e);
    // CORS / offline / proxy unreachable → soft message (never raw "Failed to fetch")
    if (isNetworkError(e)) return t('ai.recommendationUnavailable');
    // Auth / Pro / rate-limit / proxy errors → let UI show danger + ok:false analytics
    throw e;
  }
}

/**
 * Generiere KI-basierte Empfehlungen für alle Völker.
 * @param {Array} hives - Array aller Völker
 * @param {Array} allInspections - Array aller Durchsichten
 * @returns {Promise<Object>} - Map von hiveId zu Empfehlung
 */
export async function getRecommendationsForAllHives(hives, allInspections) {
  const recommendations = {};

  for (const hive of hives) {
    const hiveInspections = allInspections.filter((i) => i.hiveId === hive.id);
    try {
      recommendations[hive.id] = await getHiveRecommendation(hive, hiveInspections);
    } catch (e) {
      console.error(`Fehler bei Empfehlung für Volk ${hive.name}:`, e);
      recommendations[hive.id] = t('ai.recommendationUnavailable');
    }
  }

  return recommendations;
}
