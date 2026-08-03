import { beforeEach, describe, expect, it, vi } from 'vitest';

const { callGeminiMock } = vi.hoisted(() => ({
  callGeminiMock: vi.fn()
}));

vi.mock('../src/geminiApi.js', () => ({
  callGemini: callGeminiMock
}));

describe('hiveRecommendations', () => {
  beforeEach(() => {
    callGeminiMock.mockReset();
  });

  describe('getHiveRecommendation', () => {
    it('returns a guidance message when there are no inspections', async () => {
      const { getHiveRecommendation } = await import('../src/hiveRecommendations.js');
      const text = await getHiveRecommendation({ id: 'h1', name: 'Kasten 1' }, []);
      expect(text).toMatch(/Noch keine Durchsichten/);
      expect(callGeminiMock).not.toHaveBeenCalled();
    });

    it('returns trimmed recommendation from Gemini', async () => {
      callGeminiMock.mockResolvedValueOnce({ recommendation: '  Varroa kontrollieren.  ' });
      const { getHiveRecommendation } = await import('../src/hiveRecommendations.js');
      const hive = { id: 'h1', name: 'Kasten 1' };
      const inspections = [{ id: 'i1', hiveId: 'h1', notes: 'ok' }];

      const text = await getHiveRecommendation(hive, inspections);

      expect(text).toBe('Varroa kontrollieren.');
      expect(callGeminiMock).toHaveBeenCalledWith(
        'hive_recommendation',
        { hive, inspections },
        30000
      );
    });

    it('returns unavailable when recommendation is empty', async () => {
      callGeminiMock.mockResolvedValueOnce({ recommendation: '   ' });
      const { getHiveRecommendation } = await import('../src/hiveRecommendations.js');
      const text = await getHiveRecommendation(
        { id: 'h1' },
        [{ id: 'i1', hiveId: 'h1' }]
      );
      expect(text).toBe('KI-Empfehlung derzeit nicht verfügbar.');
    });

    it('returns unavailable when Gemini fails', async () => {
      callGeminiMock.mockRejectedValueOnce(new Error('network'));
      const { getHiveRecommendation } = await import('../src/hiveRecommendations.js');
      const text = await getHiveRecommendation(
        { id: 'h1' },
        [{ id: 'i1', hiveId: 'h1' }]
      );
      expect(text).toBe('KI-Empfehlung derzeit nicht verfügbar.');
    });
  });

  describe('getRecommendationsForAllHives', () => {
    it('maps recommendations per hive and filters inspections', async () => {
      callGeminiMock
        .mockResolvedValueOnce({ recommendation: 'Empfehlung A' })
        .mockResolvedValueOnce({ recommendation: 'Empfehlung B' });

      const { getRecommendationsForAllHives } = await import('../src/hiveRecommendations.js');
      const hives = [
        { id: 'h1', name: 'A' },
        { id: 'h2', name: 'B' }
      ];
      const inspections = [
        { id: 'i1', hiveId: 'h1' },
        { id: 'i2', hiveId: 'h2' },
        { id: 'i3', hiveId: 'h1' }
      ];

      const map = await getRecommendationsForAllHives(hives, inspections);

      expect(map).toEqual({
        h1: 'Empfehlung A',
        h2: 'Empfehlung B'
      });
      expect(callGeminiMock.mock.calls[0][1].inspections).toHaveLength(2);
      expect(callGeminiMock.mock.calls[1][1].inspections).toHaveLength(1);
    });
  });
});
