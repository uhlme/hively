import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  UTM_STORAGE_KEY,
  appendUtmToUrl,
  captureUtmFromSearch,
  consumePendingMarketingCta,
  consumePendingMarketingView,
  loadStoredUtm,
  markPendingMarketingCta,
  markPendingMarketingView,
  parseUtmFromSearch,
  saveStoredUtm
} from '../src/utm.js';

describe('utm', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('parses UTM params from search string', () => {
    expect(
      parseUtmFromSearch('?utm_source=flyer&utm_campaign=ch-2026&utm_medium=print')
    ).toEqual({
      utm_source: 'flyer',
      utm_campaign: 'ch-2026',
      utm_medium: 'print'
    });
    expect(parseUtmFromSearch('?foo=bar')).toBeNull();
  });

  it('persists and merges UTM in localStorage', () => {
    saveStoredUtm({ utm_source: 'flyer', utm_campaign: 'ch-2026' });
    saveStoredUtm({ utm_medium: 'print' });
    expect(loadStoredUtm()).toEqual({
      utm_source: 'flyer',
      utm_campaign: 'ch-2026',
      utm_medium: 'print'
    });
    expect(localStorage.getItem(UTM_STORAGE_KEY)).toBeTruthy();
  });

  it('captures UTM from URL search over stored values', () => {
    saveStoredUtm({ utm_source: 'old', utm_medium: 'print', utm_campaign: 'old-campaign' });
    const utm = captureUtmFromSearch('?utm_source=facebook&utm_campaign=ch-2026');
    expect(utm).toEqual({ utm_source: 'facebook', utm_campaign: 'ch-2026' });
    expect(loadStoredUtm()).toEqual({ utm_source: 'facebook', utm_campaign: 'ch-2026' });
  });

  it('appends stored UTM to target URL', () => {
    saveStoredUtm({ utm_source: 'verein', utm_campaign: 'ch-2026' });
    const url = appendUtmToUrl('https://hivelyy.netlify.app/');
    expect(url).toContain('utm_source=verein');
    expect(url).toContain('utm_campaign=ch-2026');
  });

  it('stores and consumes pending marketing events', () => {
    markPendingMarketingView('start', { utm_source: 'flyer' });
    markPendingMarketingCta('open_app', { utm_source: 'flyer' });
    expect(consumePendingMarketingView()).toEqual(
      expect.objectContaining({ page: 'start', utm: { utm_source: 'flyer' } })
    );
    expect(consumePendingMarketingCta()).toEqual(
      expect.objectContaining({ cta: 'open_app', utm: { utm_source: 'flyer' } })
    );
    expect(consumePendingMarketingView()).toBeNull();
    expect(consumePendingMarketingCta()).toBeNull();
  });
});
