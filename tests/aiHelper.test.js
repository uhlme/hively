import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setLocale } from '../src/i18n/index.js';

const { callGeminiMock } = vi.hoisted(() => ({
  callGeminiMock: vi.fn()
}));

vi.mock('../src/geminiApi.js', () => ({
  callGemini: callGeminiMock
}));

describe('getWeatherInsightFromGemini', () => {
  beforeEach(() => {
    callGeminiMock.mockReset();
    setLocale('de', { persist: false });
  });

  it('returns trimmed insight text from Gemini', async () => {
    callGeminiMock.mockResolvedValueOnce({ text: '  Gutes Flugwetter.  ' });
    const { getWeatherInsightFromGemini } = await import('../src/aiHelper.js');

    const weatherData = {
      temperature: 22,
      code: 0,
      conditionText: 'Sonnig',
      windSpeed: 4,
      dominantPollen: { name: 'Erle', nameKey: 'weather.pollen.alder', value: 12 }
    };
    const text = await getWeatherInsightFromGemini(weatherData);

    expect(text).toBe('Gutes Flugwetter.');
    expect(callGeminiMock).toHaveBeenCalledWith(
      'weather_insight',
      {
        weatherData: expect.objectContaining({
          temperature: 22,
          conditionText: 'Sonnig',
          dominantPollen: expect.objectContaining({ name: 'Erle', value: 12 })
        })
      },
      20000
    );
  });

  it('localizes weather labels to the active UI locale before calling Gemini', async () => {
    setLocale('en', { persist: false });
    callGeminiMock.mockResolvedValueOnce({ text: 'Great flying weather.' });
    const { getWeatherInsightFromGemini, localizeWeatherForAi } = await import(
      '../src/aiHelper.js'
    );

    const weatherData = {
      temperature: 22,
      code: 0,
      conditionText: 'Sonnig',
      windSpeed: 4,
      dominantPollen: { name: 'Erle', nameKey: 'weather.pollen.alder', value: 12 }
    };

    expect(localizeWeatherForAi(weatherData, 'en')).toMatchObject({
      conditionText: 'Sunny',
      dominantPollen: { name: 'Alder', value: 12 }
    });

    await getWeatherInsightFromGemini(weatherData);
    const payload = callGeminiMock.mock.calls[0][1];
    expect(payload.weatherData.conditionText).toBe('Sunny');
    expect(payload.weatherData.dominantPollen.name).toBe('Alder');
  });

  it('returns unavailable when text is empty', async () => {
    callGeminiMock.mockResolvedValueOnce({ text: '  ' });
    const { getWeatherInsightFromGemini } = await import('../src/aiHelper.js');
    const text = await getWeatherInsightFromGemini({ temperature: 10 });
    expect(text).toBe('Wetter-Einschätzung derzeit nicht verfügbar.');
  });

  it('surfaces the real server error message instead of a generic one', async () => {
    callGeminiMock.mockRejectedValueOnce(new Error('Login erforderlich für KI-Anfragen.'));
    const { getWeatherInsightFromGemini } = await import('../src/aiHelper.js');
    const text = await getWeatherInsightFromGemini({ temperature: 10 });
    expect(text).toBe('Login erforderlich für KI-Anfragen.');
  });

  it('maps network/CORS failures to the unavailable text instead of Failed to fetch', async () => {
    callGeminiMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const { getWeatherInsightFromGemini } = await import('../src/aiHelper.js');
    const text = await getWeatherInsightFromGemini({ temperature: 10 });
    expect(text).toBe('Wetter-Einschätzung derzeit nicht verfügbar.');
  });

  it('falls back to the generic unavailable text when the error has no message', async () => {
    const err = new Error();
    err.message = '';
    callGeminiMock.mockRejectedValueOnce(err);
    const { getWeatherInsightFromGemini } = await import('../src/aiHelper.js');
    const text = await getWeatherInsightFromGemini({ temperature: 10 });
    expect(text).toBe('Wetter-Einschätzung derzeit nicht verfügbar.');
  });
});
