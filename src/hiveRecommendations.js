import { callGemini } from './geminiApi.js';

const UNAVAILABLE = 'KI-Empfehlung derzeit nicht verfügbar.';

/**
 * Generiere KI-basierte Empfehlungen für ein Volk basierend auf seinen Durchsichten.
 * @param {Object} hive - Das Volk-Objekt
 * @param {Array} inspections - Array der Durchsichten für dieses Volk
 * @returns {Promise<string>} - Die Empfehlung als Text
 */
export async function getHiveRecommendation(hive, inspections) {
  if (!hive || !Array.isArray(inspections) || inspections.length === 0) {
    return 'Noch keine Durchsichten vorhanden. Erstelle eine erste Durchsicht, um Empfehlungen zu erhalten.';
  }

  try {
    const result = await callGemini('hive_recommendation', { hive, inspections }, 30000);
    const text = typeof result?.recommendation === 'string' ? result.recommendation.trim() : '';
    return text || UNAVAILABLE;
  } catch (e) {
    console.error('Fehler bei Gemini Empfehlung:', e);
    return UNAVAILABLE;
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
    const hiveInspections = allInspections.filter(i => i.hiveId === hive.id);
    try {
      recommendations[hive.id] = await getHiveRecommendation(hive, hiveInspections);
    } catch (e) {
      console.error(`Fehler bei Empfehlung für Volk ${hive.name}:`, e);
      recommendations[hive.id] = UNAVAILABLE;
    }
  }
  
  return recommendations;
}
