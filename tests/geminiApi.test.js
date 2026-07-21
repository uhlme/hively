import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('callGemini', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ text: 'ok' })
      }))
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('posts action payload to /api/gemini', async () => {
    const { callGemini } = await import('../src/geminiApi.js');
    const result = await callGemini('weather_insight', { weatherData: { temperature: 20 } });

    expect(result).toEqual({ text: 'ok' });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe('/api/gemini');
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toEqual({
      action: 'weather_insight',
      weatherData: { temperature: 20 }
    });
  });

  it('throws proxy error message on failure', async () => {
    fetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => ({ error: 'Gemini API ist serverseitig nicht konfiguriert (GEMINI_API_KEY).' })
    });

    const { callGemini } = await import('../src/geminiApi.js');
    await expect(callGemini('parse_audio', { data: 'x' })).rejects.toThrow(
      /serverseitig nicht konfiguriert/
    );
  });
});
