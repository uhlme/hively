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
    process.env.VITE_GEMINI_API_KEY = 'should-not-be-used';
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

  it('extracts Gemini text from parts when response.text throws', async () => {
    const { extractGeminiText } = await import('../server/geminiProxy.js');
    const text = extractGeminiText({
      text: () => {
        throw new Error('no text');
      },
      candidates: [{ content: { parts: [{ text: '  Nächste Schritte: Varroa.  ' }] } }]
    });
    expect(text).toBe('Nächste Schritte: Varroa.');
  });

  it('formats checklist-aware inspection summaries', async () => {
    const { formatInspectionForPrompt, formatChecklistForPrompt } = await import(
      '../server/geminiProxy.js'
    );
    expect(formatChecklistForPrompt({ varroaLevel: 'high', queenSeen: 'yes' })).toBe(
      'queenSeen=yes, varroaLevel=high'
    );
    expect(
      formatChecklistForPrompt({
        broodNotInspected: true,
        eggs: true,
        openBrood: false,
        varroaLevel: 'low'
      })
    ).toBe('broodNotInspected=true, varroaLevel=low');
    const summary = formatInspectionForPrompt(
      {
        date: '2026-09-06',
        checklist: { varroaLevel: 'mid', eggs: 'yes' },
        weatherTemp: 17.7,
        weatherCondition: 'Heiter',
        notes: 'Jungvolk'
      },
      1
    );
    expect(summary).toMatch(/Varroa: level:mid/);
    expect(summary).toMatch(/Checklist: eggs=yes, varroaLevel=mid/);
    expect(summary).toMatch(/Jungvolk/);

    const skipped = formatInspectionForPrompt(
      {
        date: '2026-09-07',
        checklist: { broodNotInspected: true, eggs: false },
        notes: 'Nur Flugloch'
      },
      2
    );
    expect(skipped).toMatch(/broodNotInspected=true/);
    expect(skipped).toMatch(/do not infer missing brood/);
  });

  it('uses low-latency thinking levels for short AI tips', async () => {
    const { buildModelGenerationConfig } = await import('../server/geminiProxy.js');
    expect(buildModelGenerationConfig({ thinkingLevel: 'minimal', maxOutputTokens: 256 })).toEqual({
      maxOutputTokens: 256,
      thinkingConfig: { thinkingLevel: 'minimal' }
    });
    expect(buildModelGenerationConfig({ thinkingLevel: 'low', maxOutputTokens: 1024 })).toEqual({
      maxOutputTokens: 1024,
      thinkingConfig: { thinkingLevel: 'low' }
    });
    // Default path (audio/receipt JSON) also stays on minimal thinking.
    expect(buildModelGenerationConfig()).toEqual({
      maxOutputTokens: 1024,
      thinkingConfig: { thinkingLevel: 'minimal' }
    });
  });
});
