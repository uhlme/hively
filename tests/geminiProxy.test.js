import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: vi.fn(() => ({
    getGenerativeModel: vi.fn(() => ({
      generateContent: vi.fn(async () => ({
        response: { text: () => '{"text":"ok"}' }
      }))
    }))
  }))
}));

describe('handleGeminiRequest', () => {
  afterEach(() => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.VITE_GEMINI_API_KEY;
    delete process.env.VITE_SUPABASE_URL;
    delete process.env.VITE_SUPABASE_ANON_KEY;
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('returns 401 when no auth header is provided', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    process.env.VITE_SUPABASE_URL = 'https://example.supabase.co';
    process.env.VITE_SUPABASE_ANON_KEY = 'anon-key';
    const { handleGeminiRequest } = await import('../server/geminiProxy.js');
    const result = await handleGeminiRequest({ action: 'weather_insight' });
    expect(result.status).toBe(401);
  });

  it('returns 503 when no API key is configured', async () => {
    const { handleGeminiRequest } = await import('../server/geminiProxy.js');
    const result = await handleGeminiRequest(
      { action: 'weather_insight', weatherData: {} },
      { headers: { authorization: 'Bearer test-token' } }
    );
    expect(result.status).toBe(503);
    expect(result.body.error).toMatch(/GEMINI_API_KEY/);
  });

  it('returns 400 for missing or unknown action', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    process.env.VITE_SUPABASE_URL = 'https://example.supabase.co';
    process.env.VITE_SUPABASE_ANON_KEY = 'anon-key';
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ id: 'user-1', email: 'imker@example.com' })
    })));
    const { handleGeminiRequest } = await import('../server/geminiProxy.js');

    const missing = await handleGeminiRequest({}, { headers: { authorization: 'Bearer ok-token' } });
    expect(missing.status).toBe(400);

    const unknown = await handleGeminiRequest({ action: 'nope' }, { headers: { authorization: 'Bearer ok-token' } });
    expect(unknown.status).toBe(400);
    expect(unknown.body.error).toMatch(/Unbekannte Aktion/);
  });

  it('rejects KI requests without auth token', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    process.env.VITE_SUPABASE_URL = 'https://example.supabase.co';
    process.env.VITE_SUPABASE_ANON_KEY = 'anon-key';
    const { handleGeminiRequest } = await import('../server/geminiProxy.js');

    const result = await handleGeminiRequest(
      { action: 'weather_insight', weatherData: { temperature: 20 } },
      { headers: {} }
    );

    expect(result.status).toBe(401);
    expect(result.body.error).toMatch(/Login erforderlich/);
  });

  it('rejects malformed or expired tokens', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    process.env.VITE_SUPABASE_URL = 'https://example.supabase.co';
    process.env.VITE_SUPABASE_ANON_KEY = 'anon-key';
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      json: async () => ({})
    })));
    const { handleGeminiRequest } = await import('../server/geminiProxy.js');

    const result = await handleGeminiRequest(
      { action: 'weather_insight', weatherData: { temperature: 20 } },
      { headers: { authorization: 'Bearer bad-token' } }
    );

    expect(result.status).toBe(401);
    expect(result.body.error).toMatch(/Ungültiger oder abgelaufener Login/);
  });
});
