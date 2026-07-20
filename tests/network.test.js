import { describe, expect, it, vi, beforeEach } from 'vitest';
import { mockNavigatorNetwork } from './setup.js';
import {
  getNetworkPrefs,
  saveNetworkPrefs,
  isConstrainedConnection,
  shouldUseBackgroundNetwork,
  shouldAutoProcessMedia,
  fetchWithTimeout,
  isNetworkError
} from '../src/network.js';

describe('network prefs', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns defaults when nothing is stored', () => {
    expect(getNetworkPrefs()).toEqual({
      fieldMode: true,
      wifiOnlyMedia: true,
      remotePullTtlMs: 15 * 60 * 1000
    });
  });

  it('returns defaults when stored JSON is corrupt', () => {
    localStorage.setItem('hively_network_prefs', '{not-json');
    expect(getNetworkPrefs().fieldMode).toBe(true);
  });

  it('merges partial updates without wiping other prefs', () => {
    saveNetworkPrefs({ fieldMode: false });
    const prefs = saveNetworkPrefs({ wifiOnlyMedia: false });
    expect(prefs).toMatchObject({
      fieldMode: false,
      wifiOnlyMedia: false,
      remotePullTtlMs: 15 * 60 * 1000
    });
  });
});

describe('connection policy', () => {
  beforeEach(() => {
    localStorage.clear();
    saveNetworkPrefs({ fieldMode: true, wifiOnlyMedia: true });
  });

  it('detects constrained connections', () => {
    mockNavigatorNetwork({ onLine: true, effectiveType: '3g' });
    expect(isConstrainedConnection()).toBe(true);

    mockNavigatorNetwork({ onLine: true, effectiveType: '4g', saveData: true });
    expect(isConstrainedConnection()).toBe(true);

    mockNavigatorNetwork({ onLine: true, effectiveType: '4g', saveData: false });
    expect(isConstrainedConnection()).toBe(false);
  });

  it('blocks background network when offline or in field mode on weak links', () => {
    mockNavigatorNetwork({ onLine: false, effectiveType: '4g' });
    expect(shouldUseBackgroundNetwork()).toBe(false);

    mockNavigatorNetwork({ onLine: true, effectiveType: '2g' });
    expect(shouldUseBackgroundNetwork()).toBe(false);

    mockNavigatorNetwork({ onLine: true, effectiveType: '4g' });
    expect(shouldUseBackgroundNetwork()).toBe(true);
  });

  it('allows background network on weak links when field mode is off', () => {
    saveNetworkPrefs({ fieldMode: false });
    mockNavigatorNetwork({ onLine: true, effectiveType: '3g' });
    expect(shouldUseBackgroundNetwork()).toBe(true);
  });

  it('blocks AI media auto-processing on weak links when wifiOnlyMedia is on', () => {
    mockNavigatorNetwork({ onLine: false });
    expect(shouldAutoProcessMedia()).toBe(false);

    mockNavigatorNetwork({ onLine: true, effectiveType: '3g' });
    expect(shouldAutoProcessMedia()).toBe(false);

    mockNavigatorNetwork({ onLine: true, effectiveType: '4g' });
    expect(shouldAutoProcessMedia()).toBe(true);
  });

  it('allows AI media on constrained links when wifiOnlyMedia is off', () => {
    saveNetworkPrefs({ wifiOnlyMedia: false });
    mockNavigatorNetwork({ onLine: true, effectiveType: '3g' });
    expect(shouldAutoProcessMedia()).toBe(true);
  });
});

describe('fetchWithTimeout / isNetworkError', () => {
  it('aborts hanging fetches', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((_url, options) => {
      return new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => {
          const err = new Error('Aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const promise = fetchWithTimeout('https://example.test', {}, 1000);
    const expectation = expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    await vi.advanceTimersByTimeAsync(1000);
    await expectation;
    vi.useRealTimers();
  });

  it('classifies common network failures', () => {
    const abortErr = new Error('Aborted');
    abortErr.name = 'AbortError';
    expect(isNetworkError(abortErr)).toBe(true);
    expect(isNetworkError(new Error('Failed to fetch'))).toBe(true);
    expect(isNetworkError(new Error('timeout'))).toBe(true);
    expect(isNetworkError(new Error('offline'))).toBe(true);
    expect(isNetworkError(new Error('invalid api key'))).toBe(false);
    expect(isNetworkError(null)).toBe(false);
  });
});
