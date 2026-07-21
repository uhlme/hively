import { callGemini } from './geminiApi.js';

export async function getWeatherInsightFromGemini(weatherData) {
  try {
    const result = await callGemini('weather_insight', { weatherData }, 20000);
    return typeof result?.text === 'string' && result.text.trim()
      ? result.text.trim()
      : 'KI-Einschätzung derzeit nicht verfügbar.';
  } catch (e) {
    console.error('Fehler bei Gemini Insight:', e);
    return 'KI-Einschätzung derzeit nicht verfügbar.';
  }
}
