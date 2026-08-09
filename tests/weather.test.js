import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getCurrentPosition,
  checkPermissions,
  requestPermissions,
  capacitorState
} = vi.hoisted(() => ({
  getCurrentPosition: vi.fn(),
  checkPermissions: vi.fn(),
  requestPermissions: vi.fn(),
  capacitorState: { native: false }
}));

vi.mock('@capacitor/geolocation', () => ({
  Geolocation: {
    getCurrentPosition,
    checkPermissions,
    requestPermissions
  }
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => capacitorState.native }
}));

import {
  conditionFromCode,
  ensureNativeLocationPermission,
  getCachedLocation,
  LocationPermissionError,
  saveCachedLocation,
  weatherIconKind,
  weatherIconSvg
} from '../src/weather.js';

describe('weather icons', () => {
  it('maps WMO codes to labels and icon kinds', () => {
    expect(conditionFromCode(0)).toEqual({ label: 'Sonnig', icon: 'sun', labelKey: 'weather.sunny' });
    expect(conditionFromCode(3)).toEqual({ label: 'Bedeckt', icon: 'cloudy', labelKey: 'weather.cloudy' });
    expect(conditionFromCode(95)).toEqual({
      label: 'Gewitter',
      icon: 'thunderstorm',
      labelKey: 'weather.thunderstorm'
    });
    expect(conditionFromCode(999)).toEqual({
      label: 'Unbekannt',
      icon: 'unknown',
      labelKey: 'weather.unknown'
    });
  });

  it('resolves icon kind from code or German condition text', () => {
    expect(weatherIconKind(61)).toBe('rain');
    expect(weatherIconKind('Leichter Regen')).toBe('rain');
    expect(weatherIconKind('Sonnig')).toBe('sun');
    expect(weatherIconKind('')).toBe('unknown');
  });

  it('returns SVG markup without emoji characters', () => {
    const svg = weatherIconSvg(0);
    expect(svg).toContain('<svg');
    expect(svg).toContain('viewBox="0 0 24 24"');
    expect(svg).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
    expect(weatherIconSvg('partly-cloudy')).toContain('<circle');
  });
});

describe('weather location cache', () => {
  beforeEach(() => {
    localStorage.clear();
    capacitorState.native = false;
  });

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

describe('native location permission', () => {
  beforeEach(() => {
    localStorage.clear();
    capacitorState.native = true;
    getCurrentPosition.mockReset();
    checkPermissions.mockReset();
    requestPermissions.mockReset();
  });

  it('requests runtime permission when not yet granted', async () => {
    checkPermissions.mockResolvedValueOnce({ location: 'prompt' });
    requestPermissions.mockResolvedValueOnce({ location: 'granted' });

    await expect(ensureNativeLocationPermission()).resolves.toBe('granted');
    expect(requestPermissions).toHaveBeenCalledWith({
      permissions: ['location', 'coarseLocation']
    });
  });

  it('skips request when already granted', async () => {
    checkPermissions.mockResolvedValueOnce({ location: 'granted' });
    await expect(ensureNativeLocationPermission()).resolves.toBe('granted');
    expect(requestPermissions).not.toHaveBeenCalled();
  });

  it('maps denied permission to LocationPermissionError', async () => {
    checkPermissions.mockResolvedValueOnce({ location: 'denied' });
    requestPermissions.mockResolvedValueOnce({ location: 'denied' });

    await expect(ensureNativeLocationPermission()).rejects.toMatchObject({
      name: 'LocationPermissionError',
      code: 'denied'
    });
    expect(LocationPermissionError).toBeTruthy();
  });

  it('maps disabled location services to LocationPermissionError', async () => {
    checkPermissions.mockRejectedValueOnce(
      Object.assign(new Error('Location services are not enabled'), {
        code: 'OS-PLUG-GLOC-0007'
      })
    );

    await expect(ensureNativeLocationPermission()).rejects.toMatchObject({
      code: 'disabled'
    });
  });
});

describe('weather inspection cache', () => {
  beforeEach(() => {
    localStorage.clear();
    capacitorState.native = false;
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
