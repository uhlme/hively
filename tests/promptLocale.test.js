import { describe, expect, it } from 'vitest';
import {
  buildAudioPrompt,
  buildReceiptPrompt,
  buildWeatherInsightPrompt,
  normalizeFinanceCategory,
  normalizePromptLocale
} from '../server/i18n/promptLocale.js';

describe('promptLocale', () => {
  it('normalizes locales', () => {
    expect(normalizePromptLocale('fr-CH')).toBe('fr');
    expect(normalizePromptLocale('xx')).toBe('de');
  });

  it('builds locale-aware prompts', () => {
    expect(buildAudioPrompt('en')).toMatch(/English/);
    expect(buildAudioPrompt('fr')).toMatch(/French/);
    expect(buildReceiptPrompt('it')).toMatch(/Italian|italiano|hardware/i);
    const weather = buildWeatherInsightPrompt('de', {
      temperature: 20,
      conditionText: 'Sonnig',
      windSpeed: 5,
      dominantPollen: null
    });
    expect(weather).toMatch(/German|Hochdeutsch|Schweiz/i);
  });

  it('normalizes finance categories to stable ids', () => {
    expect(normalizeFinanceCategory('Hardware')).toBe('hardware');
    expect(normalizeFinanceCategory('feed')).toBe('feed');
    expect(normalizeFinanceCategory('Imkereibedarf')).toBe('equipment');
    expect(normalizeFinanceCategory('unknown')).toBe('other');
  });
});
