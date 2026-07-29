import { afterEach, describe, expect, it, vi } from 'vitest';

const VALID_AUTH = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test-token';

describe('handleGeminiRequest', () => {
  afterEach(() => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.VITE_GEMINI_API_KEY;
    vi.resetModules();
  });

  it('returns 401 when no auth header is provided', async () => {
    const { handleGeminiRequest } = await import('../server/geminiProxy.js');
    const result = await handleGeminiRequest({ action: 'weather_insight' });
    expect(result.status).toBe(401);
  });

  it('returns 503 when no API key is configured', async () => {
    const { handleGeminiRequest } = await import('../server/geminiProxy.js');
    const result = await handleGeminiRequest({ action: 'weather_insight', weatherData: {} }, VALID_AUTH);
    expect(result.status).toBe(503);
    expect(result.body.error).toMatch(/GEMINI_API_KEY/);
  });

  it('returns 400 for missing or unknown action', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    const { handleGeminiRequest } = await import('../server/geminiProxy.js');

    const missing = await handleGeminiRequest({}, VALID_AUTH);
    expect(missing.status).toBe(400);

    const unknown = await handleGeminiRequest({ action: 'nope' }, VALID_AUTH);
    expect(unknown.status).toBe(400);
    expect(unknown.body.error).toMatch(/Unbekannte Aktion/);
  });
});
