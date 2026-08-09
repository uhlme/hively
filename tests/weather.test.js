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
  fetchCurrentWeather,
  fetchDashboardWeatherAndPollen,
  getCachedLocation,
  hasGrantedLocationPermission,
  LocationPermissionError,
  saveCachedLocation,
  weatherIconKind,
  weatherIconSvg
} from '../src/weather.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const weatherSrcPath = join(dirname(fileURLToPath(import.meta.url)), '../src/weather.js');

function stubOpenMeteoOk() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      json: async () => ({
        current: {
          temperature_2m: 18,
          weather_code: 0,
          wind_speed_10m: 4,
          alder_pollen: 0,
          birch_pollen: 0,
          grass_pollen: 0,
          mugwort_pollen: 0,
          olive_pollen: 0,
          ragweed_pollen: 0
        }
      })
    }))
  );
}

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

  it('treats coarse-only grant as granted on Android 12+', async () => {
    expect(
      hasGrantedLocationPermission({ location: 'denied', coarseLocation: 'granted' })
    ).toBe(true);

    checkPermissions.mockResolvedValueOnce({
      location: 'denied',
      coarseLocation: 'granted'
    });
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

  /**
   * Regression: Android showed "Standort-Fehler" without a system permission
   * dialog when getCurrentPosition ran without an explicit requestPermissions.
   * Radar/weather must request permission before reading GPS.
   */
  it('requests permission before GPS when radar/weather refreshes location on native', async () => {
    const order = [];
    checkPermissions.mockImplementation(async () => {
      order.push('check');
      return { location: 'prompt', coarseLocation: 'prompt' };
    });
    requestPermissions.mockImplementation(async () => {
      order.push('request');
      return { location: 'granted', coarseLocation: 'granted' };
    });
    getCurrentPosition.mockImplementation(async () => {
      order.push('gps');
      return { coords: { latitude: 47.05, longitude: 8.3 } };
    });
    stubOpenMeteoOk();

    const data = await fetchDashboardWeatherAndPollen(true);

    expect(data.temperature).toBe(18);
    expect(order).toEqual(['check', 'request', 'gps']);
    expect(requestPermissions.mock.invocationCallOrder[0]).toBeLessThan(
      getCurrentPosition.mock.invocationCallOrder[0]
    );
    expect(getCachedLocation()).toEqual({ lat: 47.05, lon: 8.3 });
  });

  it('does not call GPS when native permission is denied (shows prompt path)', async () => {
    checkPermissions.mockResolvedValueOnce({ location: 'denied' });
    requestPermissions.mockResolvedValueOnce({ location: 'denied' });
    stubOpenMeteoOk();

    await expect(fetchCurrentWeather(true)).rejects.toMatchObject({
      name: 'LocationPermissionError',
      code: 'denied'
    });
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it('rethrows GPS timeout as normal Error so stale radar cache can show', async () => {
    checkPermissions.mockResolvedValueOnce({ location: 'granted' });
    getCurrentPosition.mockRejectedValueOnce(new Error('Location timeout'));
    stubOpenMeteoOk();

    let caught;
    try {
      await fetchCurrentWeather(true);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(caught).not.toBeInstanceOf(LocationPermissionError);
    expect(caught.message).toBe('Location timeout');
  });

  it('keeps ensureNativeLocationPermission ahead of getCurrentPosition in source', () => {
    const src = readFileSync(weatherSrcPath, 'utf8');
    const nativeBlock = src.match(
      /if \(Capacitor\.isNativePlatform\(\)\) \{([\s\S]*?)if \(!navigator\.geolocation\)/
    )?.[1];
    expect(nativeBlock, 'native resolveUserCoords block missing').toBeTruthy();
    const permIdx = nativeBlock.indexOf('ensureNativeLocationPermission(');
    const gpsIdx = nativeBlock.indexOf('Geolocation.getCurrentPosition(');
    expect(permIdx).toBeGreaterThanOrEqual(0);
    expect(gpsIdx).toBeGreaterThan(permIdx);
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
