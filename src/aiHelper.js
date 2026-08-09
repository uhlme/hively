import { callGemini } from './geminiApi.js';
import { isNetworkError } from './network.js';
import { getLocale, t } from './i18n/index.js';
import { conditionFromCode } from './weather.js';

/**
 * Localize weather labels sent to Gemini so the model is not biased by
 * German fallback strings (WMO labels / pollen names) when the UI locale
 * is fr/it/en.
 */
export function localizeWeatherForAi(weatherData, locale = getLocale()) {
  if (!weatherData || typeof weatherData !== 'object') return weatherData;

  const code = weatherData.code;
  const cond = typeof code === 'number' && Number.isFinite(code) ? conditionFromCode(code) : null;
  const conditionText = cond?.labelKey
    ? t(cond.labelKey, {}, locale)
    : String(weatherData.conditionText || '');

  let dominantPollen = weatherData.dominantPollen ?? null;
  if (dominantPollen && typeof dominantPollen === 'object') {
    const name = dominantPollen.nameKey
      ? t(dominantPollen.nameKey, {}, locale)
      : dominantPollen.name;
    dominantPollen = { ...dominantPollen, name };
  }

  return {
    ...weatherData,
    conditionText,
    dominantPollen
  };
}

export async function getWeatherInsightFromGemini(weatherData) {
  try {
    const localized = localizeWeatherForAi(weatherData);
    const result = await callGemini('weather_insight', { weatherData: localized }, 20000);
    const text = typeof result?.text === 'string' ? result.text.trim() : '';
    return text || t('ai.weatherUnavailable');
  } catch (e) {
    console.error('Fehler bei Gemini Insight:', e);
    // CORS / offline / proxy unreachable → never surface raw "Failed to fetch"
    if (isNetworkError(e)) return t('ai.weatherUnavailable');
    return e?.message || t('ai.weatherUnavailable');
  }
}
