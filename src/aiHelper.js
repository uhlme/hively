import { callGemini } from './geminiApi.js';
import { isNetworkError } from './network.js';
import { t } from './i18n/index.js';

export async function getWeatherInsightFromGemini(weatherData) {
  try {
    const result = await callGemini('weather_insight', { weatherData }, 20000);
    const text = typeof result?.text === 'string' ? result.text.trim() : '';
    return text || t('ai.weatherUnavailable');
  } catch (e) {
    console.error('Fehler bei Gemini Insight:', e);
    // CORS / offline / proxy unreachable → never surface raw "Failed to fetch"
    if (isNetworkError(e)) return t('ai.weatherUnavailable');
    return e?.message || t('ai.weatherUnavailable');
  }
}
