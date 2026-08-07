import { beforeEach, describe, expect, it, vi } from 'vitest';

const { callGeminiMock } = vi.hoisted(() => ({
  callGeminiMock: vi.fn()
}));

vi.mock('../src/geminiApi.js', () => ({
  callGemini: callGeminiMock
}));

describe('getWeatherInsightFromGemini', () => {
  beforeEach(() => {
    callGeminiMock.mockReset();
  });

  it('returns trimmed insight text from Gemini', async () => {
    callGeminiMock.mockResolvedValueOnce({ text: '  Gutes Flugwetter.  ' });
    const { getWeatherInsightFromGemini } = await import('../src/aiHelper.js');

    const weatherData = { temperature: 22, condition: 'Sonnig' };
    const text = await getWeatherInsightFromGemini(weatherData);

    expect(text).toBe('Gutes Flugwetter.');
    expect(callGeminiMock).toHaveBeenCalledWith(
      'weather_insight',
      { weatherData },
      20000
    );
  });

  it('returns unavailable when text is empty', async () => {
    callGeminiMock.mockResolvedValueOnce({ text: '  ' });
    const { getWeatherInsightFromGemini } = await import('../src/aiHelper.js');
    const text = await getWeatherInsightFromGemini({ temperature: 10 });
    expect(text).toBe('KI-Einschätzung derzeit nicht verfügbar.');
  });

  it('surfaces the real server error message instead of a generic one', async () => {
    callGeminiMock.mockRejectedValueOnce(new Error('Login erforderlich für KI-Anfragen.'));
    const { getWeatherInsightFromGemini } = await import('../src/aiHelper.js');
    const text = await getWeatherInsightFromGemini({ temperature: 10 });
    expect(text).toBe('Login erforderlich für KI-Anfragen.');
  });

  it('falls back to the generic unavailable text when the error has no message', async () => {
    const err = new Error();
    err.message = '';
    callGeminiMock.mockRejectedValueOnce(err);
    const { getWeatherInsightFromGemini } = await import('../src/aiHelper.js');
    const text = await getWeatherInsightFromGemini({ temperature: 10 });
    expect(text).toBe('KI-Einschätzung derzeit nicht verfügbar.');
  });
});
