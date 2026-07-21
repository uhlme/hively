import { callGemini } from './geminiApi.js';

const UNAVAILABLE = 'KI-Einschätzung derzeit nicht verfügbar.';

export async function getWeatherInsightFromGemini(weatherData) {
  try {
    const result = await callGemini('weather_insight', { weatherData }, 20000);
    const text = typeof result?.text === 'string' ? result.text.trim() : '';
    return text || UNAVAILABLE;
  } catch (e) {
    console.error('Fehler bei Gemini Insight:', e);
    return UNAVAILABLE;
  }
}
