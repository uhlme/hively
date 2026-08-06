import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getCachedLocation, saveCachedLocation } from '../src/weather.js';

vi.mock('@capacitor/geolocation', () => ({
  Geolocation: { getCurrentPosition: vi.fn() }
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => false }
}));

describe('weather location cache', () => {
  it('round-trips lat/lon through localStorage', () => {
    saveCachedLocation(47.3769, 8.5417);
    expect(getCachedLocation()).toEqual({ lat: 47.3769, lon: 8.5417 });
  });

  it('returns null for missing or corrupt cache', () => {
    expect(getCachedLocation()).toBeNull();
    localStorage.setItem('hively_user_location', '{not-json');
    expect(getCachedLocation()).toBeNull();
  });
});

describe('weather inspection cache', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('round-trips weather cache through localStorage', async () => {
    const { writeWeatherCache, readWeatherCache } = await import('../src/weather.js');
    writeWeatherCache({
      temperature: 18.5,
      conditionText: 'Sonnig',
      timestamp: 1000
    });
    expect(readWeatherCache()).toMatchObject({
      temperature: 18.5,
      conditionText: 'Sonnig',
      timestamp: 1000
    });
  });

  it('returns stale cache from fetchCurrentWeather when network fails', async () => {
    const { writeWeatherCache, saveCachedLocation, fetchCurrentWeather } = await import(
      '../src/weather.js'
    );
    saveCachedLocation(47.3, 8.5);
    writeWeatherCache({
      temperature: 12,
      conditionText: 'Wolkig',
      code: 2,
      timestamp: Date.now() - 60_000
    });

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      })
    );

    const result = await fetchCurrentWeather(false);
    expect(result.fromCache).toBe(true);
    expect(result.temperature).toBe(12);
    expect(result.conditionText).toBe('Wolkig');
  });

  it('throws when offline and no usable cache exists', async () => {
    const { saveCachedLocation, fetchCurrentWeather } = await import('../src/weather.js');
    saveCachedLocation(47.3, 8.5);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      })
    );
    await expect(fetchCurrentWeather(false)).rejects.toThrow();
  });
});
