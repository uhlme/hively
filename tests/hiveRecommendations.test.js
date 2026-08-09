import { beforeEach, describe, expect, it, vi } from 'vitest';

const { callGeminiMock } = vi.hoisted(() => ({
  callGeminiMock: vi.fn()
}));

vi.mock('../src/geminiApi.js', () => ({
  callGemini: callGeminiMock
}));

vi.mock('../src/network.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    isNetworkError: vi.fn((err) => {
      const msg = String(err?.message || '').toLowerCase();
      return msg.includes('failed to fetch') || msg.includes('network');
    })
  };
});

describe('hiveRecommendations', () => {
  beforeEach(() => {
    callGeminiMock.mockReset();
  });

  describe('slim helpers', () => {
    it('slims hive and inspection payloads', async () => {
      const { slimHiveForAi, slimInspectionForAi } = await import('../src/hiveRecommendations.js');
      expect(
        slimHiveForAi({
          id: 'h1',
          name: 'Kasten 1',
          notes: 'Jungvolk',
          createdBy: 'u1',
          operationId: 'op1',
          extra: 'drop-me'
        })
      ).toEqual({
        id: 'h1',
        name: 'Kasten 1',
        queenName: undefined,
        queenYear: undefined,
        queenColor: undefined,
        breed: undefined,
        status: undefined,
        broodFrames: undefined,
        honeyFrames1: undefined,
        honeyFrames2: undefined,
        notes: 'Jungvolk'
      });

      expect(
        slimInspectionForAi({
          id: 'i1',
          hiveId: 'h1',
          date: '2026-09-06',
          notes: 'ok',
          checklist: { varroaLevel: 'low' },
          createdBy: 'u1'
        })
      ).toEqual({
        date: '2026-09-06',
        feeding: undefined,
        varroa: undefined,
        broodStatus: undefined,
        honeySuper: undefined,
        temperament: undefined,
        weatherTemp: undefined,
        weatherCondition: undefined,
        notes: 'ok',
        checklist: { varroaLevel: 'low' }
      });
    });
  });

  describe('getHiveRecommendation', () => {
    it('returns a guidance message when there are no inspections', async () => {
      const { getHiveRecommendation } = await import('../src/hiveRecommendations.js');
      const text = await getHiveRecommendation({ id: 'h1', name: 'Kasten 1' }, []);
      expect(text).toMatch(/Noch keine Durchsichten/);
      expect(callGeminiMock).not.toHaveBeenCalled();
    });

    it('returns trimmed recommendation from Gemini with slim payload', async () => {
      callGeminiMock.mockResolvedValueOnce({ recommendation: '  Varroa kontrollieren.  ' });
      const { getHiveRecommendation } = await import('../src/hiveRecommendations.js');
      const hive = { id: 'h1', name: 'Kasten 1', notes: 'Buckfast', createdBy: 'x' };
      const inspections = [
        { id: 'i1', hiveId: 'h1', date: '2026-09-06', notes: 'ok', createdBy: 'x' }
      ];

      const text = await getHiveRecommendation(hive, inspections);

      expect(text).toBe('Varroa kontrollieren.');
      expect(callGeminiMock).toHaveBeenCalledWith(
        'hive_recommendation',
        {
          hive: expect.objectContaining({ id: 'h1', name: 'Kasten 1', notes: 'Buckfast' }),
          inspections: [expect.objectContaining({ date: '2026-09-06', notes: 'ok' })]
        },
        45000
      );
      expect(callGeminiMock.mock.calls[0][1].hive.createdBy).toBeUndefined();
    });

    it('returns unavailable when recommendation is empty', async () => {
      callGeminiMock.mockResolvedValueOnce({ recommendation: '   ' });
      const { getHiveRecommendation } = await import('../src/hiveRecommendations.js');
      const text = await getHiveRecommendation(
        { id: 'h1' },
        [{ id: 'i1', hiveId: 'h1', date: '2026-01-01' }]
      );
      expect(text).toBe('Empfehlung gerade nicht verfügbar.');
    });

    it('returns unavailable on network errors', async () => {
      callGeminiMock.mockRejectedValueOnce(new Error('Failed to fetch'));
      const { getHiveRecommendation } = await import('../src/hiveRecommendations.js');
      const text = await getHiveRecommendation(
        { id: 'h1' },
        [{ id: 'i1', hiveId: 'h1', date: '2026-01-01' }]
      );
      expect(text).toBe('Empfehlung gerade nicht verfügbar.');
    });

    it('rethrows proxy/auth errors for the UI', async () => {
      callGeminiMock.mockRejectedValueOnce(new Error('Login erforderlich für KI-Anfragen.'));
      const { getHiveRecommendation } = await import('../src/hiveRecommendations.js');
      await expect(
        getHiveRecommendation({ id: 'h1' }, [{ id: 'i1', hiveId: 'h1', date: '2026-01-01' }])
      ).rejects.toThrow(/Login erforderlich/);
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
        { id: 'i1', hiveId: 'h1', date: '2026-01-02' },
        { id: 'i2', hiveId: 'h2', date: '2026-01-01' },
        { id: 'i3', hiveId: 'h1', date: '2026-01-01' }
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
