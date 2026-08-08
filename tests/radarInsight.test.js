import { describe, it, expect } from 'vitest';
import { PRO_UPSELL_INSIGHT, isProUpsellInsight } from '../src/radarInsight.js';

describe('radarInsight', () => {
  it('erkennt den Pro-Upsell-Text', () => {
    expect(isProUpsellInsight(PRO_UPSELL_INSIGHT)).toBe(true);
    expect(isProUpsellInsight(`${PRO_UPSELL_INSIGHT} (Cache)`)).toBe(true);
  });

  it('erkennt echte KI-Texte nicht als Upsell', () => {
    expect(isProUpsellInsight('Gutes Flugwetter, Völker können aktiv sein.')).toBe(false);
    expect(isProUpsellInsight('')).toBe(false);
    expect(isProUpsellInsight(null)).toBe(false);
  });
});
