import { describe, expect, it } from 'vitest';
import {
  buildAudioPrompt,
  buildHiveRecommendationPrompt,
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
    const weatherDe = buildWeatherInsightPrompt('de', {
      temperature: 20,
      conditionText: 'Sonnig',
      windSpeed: 5,
      dominantPollen: null
    });
    expect(weatherDe).toMatch(/German|Hochdeutsch|Schweiz/i);

    const weatherEn = buildWeatherInsightPrompt('en', {
      temperature: 20,
      conditionText: 'Sunny',
      windSpeed: 5,
      dominantPollen: null
    });
    expect(weatherEn).toMatch(/Write the entire answer in English/i);
    expect(weatherEn).toMatch(/Do not use German/i);

    const hiveDe = buildHiveRecommendationPrompt('de', {
      hiveInfo: 'Hive: Kasten 1',
      inspectionsSummary: 'Inspection 1',
      todayLabel: '09.08.2026'
    });
    expect(hiveDe).toMatch(/Plain text only/i);
    expect(hiveDe).toMatch(/checklist/i);
  });

  it('normalizes finance categories to stable ids', () => {
    expect(normalizeFinanceCategory('Hardware')).toBe('hardware');
    expect(normalizeFinanceCategory('feed')).toBe('feed');
    expect(normalizeFinanceCategory('Imkereibedarf')).toBe('equipment');
    expect(normalizeFinanceCategory('unknown')).toBe('other');
  });
});
