import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_LOCALE,
  detectBrowserLocale,
  formatDate,
  getLocale,
  initI18n,
  legalUrl,
  normalizeLocale,
  setLocale,
  t
} from '../src/i18n/index.js';
import {
  financeCategoryLabel,
  financeCategorySelectValue,
  normalizeFinanceCategoryId
} from '../src/financeCategories.js';

describe('i18n', () => {
  beforeEach(() => {
    localStorage.clear();
    setLocale('de', { persist: false });
  });

  it('normalizes locale codes', () => {
    expect(normalizeLocale('de-CH')).toBe('de');
    expect(normalizeLocale('fr_FR')).toBe('fr');
    expect(normalizeLocale('it')).toBe('it');
    expect(normalizeLocale('en-US')).toBe('en');
    expect(normalizeLocale('xx')).toBe(DEFAULT_LOCALE);
  });

  it('translates nested keys with interpolation', () => {
    setLocale('de', { persist: false });
    expect(t('nav.hives')).toBe('Kästen');
    expect(t('common.version', { version: '1.2.3' })).toContain('1.2.3');
    setLocale('en', { persist: false });
    expect(t('nav.hives')).toBe('Hives');
    expect(t('calendar.tasks.jan-ruhe.title')).toBeTruthy();
  });

  it('falls back to German for missing keys', () => {
    setLocale('en', { persist: false });
    expect(t('___missing.key___')).toBe('___missing.key___');
  });

  it('persists locale and builds legal URLs', () => {
    setLocale('fr');
    expect(getLocale()).toBe('fr');
    expect(localStorage.getItem('hively_locale')).toBe('fr');
    expect(legalUrl('privacy')).toContain('/fr/privacy/');
    setLocale('de');
    expect(legalUrl('agb')).toContain('/agb/');
    expect(legalUrl('agb')).not.toContain('/de/');
  });

  it('formats dates with locale tag', () => {
    setLocale('de', { persist: false });
    expect(formatDate('2026-08-08')).toMatch(/08/);
  });

  it('initI18n reads stored locale', () => {
    localStorage.setItem('hively_locale', 'it');
    expect(initI18n()).toBe('it');
    expect(getLocale()).toBe('it');
  });

  it('detectBrowserLocale returns a supported locale', () => {
    expect(['de', 'fr', 'it', 'en']).toContain(detectBrowserLocale());
  });
});

describe('financeCategories', () => {
  beforeEach(() => {
    setLocale('de', { persist: false });
  });

  it('maps legacy German labels and ids', () => {
    expect(normalizeFinanceCategoryId('Hardware')).toBe('hardware');
    expect(normalizeFinanceCategoryId('Futter')).toBe('feed');
    expect(normalizeFinanceCategoryId('feed')).toBe('feed');
    expect(financeCategorySelectValue('Imkereibedarf')).toBe('equipment');
  });

  it('localizes category labels', () => {
    setLocale('en', { persist: false });
    expect(financeCategoryLabel('hardware')).toMatch(/Hardware|hive/i);
    setLocale('de', { persist: false });
    expect(financeCategoryLabel('Patenschaft')).toMatch(/Patenschaft/);
  });
});
