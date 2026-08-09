/**
 * weather.js - Handles fetching weather data based on geolocation.
 */
import { Geolocation } from '@capacitor/geolocation';
import { Capacitor } from '@capacitor/core';
import { fetchWithTimeout } from './network.js';
import { safeJsonParse } from './utils.js';

/** WMO weather codes → DE fallback label + icon + i18n key. */
const WMO_CODES = {
  0: { label: 'Sonnig', icon: 'sun', labelKey: 'weather.sunny' },
  1: { label: 'Heiter', icon: 'sun', labelKey: 'weather.clear' },
  2: { label: 'Wolkig', icon: 'partly-cloudy', labelKey: 'weather.partlyCloudy' },
  3: { label: 'Bedeckt', icon: 'cloudy', labelKey: 'weather.cloudy' },
  45: { label: 'Nebel', icon: 'fog', labelKey: 'weather.fog' },
  48: { label: 'Rauhreifnebel', icon: 'fog', labelKey: 'weather.fog' },
  51: { label: 'Leichter Nieselregen', icon: 'drizzle', labelKey: 'weather.drizzle' },
  53: { label: 'Nieselregen', icon: 'drizzle', labelKey: 'weather.drizzle' },
  55: { label: 'Dichter Nieselregen', icon: 'drizzle', labelKey: 'weather.drizzle' },
  56: { label: 'Leichter gefrierender Nieselregen', icon: 'drizzle', labelKey: 'weather.drizzle' },
  57: { label: 'Dichter gefrierender Nieselregen', icon: 'drizzle', labelKey: 'weather.drizzle' },
  61: { label: 'Leichter Regen', icon: 'rain', labelKey: 'weather.rain' },
  63: { label: 'Regen', icon: 'rain', labelKey: 'weather.rain' },
  65: { label: 'Starker Regen', icon: 'rain', labelKey: 'weather.rain' },
  66: { label: 'Leichter gefrierender Regen', icon: 'rain', labelKey: 'weather.rain' },
  67: { label: 'Starker gefrierender Regen', icon: 'rain', labelKey: 'weather.rain' },
  71: { label: 'Leichter Schneefall', icon: 'snow', labelKey: 'weather.snow' },
  73: { label: 'Schneefall', icon: 'snow', labelKey: 'weather.snow' },
  75: { label: 'Starker Schneefall', icon: 'snow', labelKey: 'weather.snow' },
  77: { label: 'Schneegriesel', icon: 'snow', labelKey: 'weather.snow' },
  80: { label: 'Leichte Regenschauer', icon: 'showers', labelKey: 'weather.showers' },
  81: { label: 'Regenschauer', icon: 'showers', labelKey: 'weather.showers' },
  82: { label: 'Starke Regenschauer', icon: 'showers', labelKey: 'weather.showers' },
  85: { label: 'Leichte Schneeschauer', icon: 'snow', labelKey: 'weather.snow' },
  86: { label: 'Starke Schneeschauer', icon: 'snow', labelKey: 'weather.snow' },
  95: { label: 'Gewitter', icon: 'thunderstorm', labelKey: 'weather.thunderstorm' },
  96: { label: 'Gewitter mit leichtem Hagel', icon: 'thunderstorm', labelKey: 'weather.thunderstorm' },
  99: { label: 'Gewitter mit starkem Hagel', icon: 'thunderstorm', labelKey: 'weather.thunderstorm' }
};

const SVG_ATTRS =
  'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';

/** Stroke icons aligned with the Field-Tool nav / dash-action style. */
const WEATHER_ICON_PATHS = {
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  'partly-cloudy':
    '<circle cx="9" cy="9" r="3.2"/><path d="M9 3.2v1.3M3.2 9H4.5M5.1 5.1l.9.9"/><path d="M8.5 16.5h7.2a3.3 3.3 0 0 0 .4-6.6 4.2 4.2 0 0 0-7.8 1.4A2.7 2.7 0 0 0 8.5 16.5z"/>',
  cloudy:
    '<path d="M7.5 17.5h9.2a3.5 3.5 0 0 0 .5-7 4.6 4.6 0 0 0-8.6 1.5A3 3 0 0 0 7.5 17.5z"/>',
  fog: '<path d="M4 9h16M5 13h14M7 17h10"/>',
  drizzle:
    '<path d="M7.5 14.5h9.2a3.5 3.5 0 0 0 .5-7 4.6 4.6 0 0 0-8.6 1.5A3 3 0 0 0 7.5 14.5z"/><path d="M9 17.5v1.5M12 18v2M15 17.5v1.5"/>',
  rain: '<path d="M7.5 14h9.2a3.5 3.5 0 0 0 .5-7 4.6 4.6 0 0 0-8.6 1.5A3 3 0 0 0 7.5 14z"/><path d="M8.5 17l-1 3M12 17.5l-1 3.5M15.5 17l-1 3"/>',
  showers:
    '<path d="M7.5 13.5h9.2a3.5 3.5 0 0 0 .5-7 4.6 4.6 0 0 0-8.6 1.5A3 3 0 0 0 7.5 13.5z"/><path d="M9 16.5l-1.5 3M12.2 17l-1.5 3.5M15.5 16.5l-1.5 3"/>',
  snow: '<path d="M7.5 13.5h9.2a3.5 3.5 0 0 0 .5-7 4.6 4.6 0 0 0-8.6 1.5A3 3 0 0 0 7.5 13.5z"/><path d="M9 17v3M7.5 18.5h3M12.2 16.5v3.5M10.7 18.2h3M15.5 17v3M14 18.5h3"/>',
  thunderstorm:
    '<path d="M7.5 13h9.2a3.5 3.5 0 0 0 .5-7 4.6 4.6 0 0 0-8.6 1.5A3 3 0 0 0 7.5 13z"/><path d="M11 14l-2 4h3l-1.5 4"/>',
  unknown: '<circle cx="12" cy="12" r="8"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.6 2.2c-.7.5-1.1 1-1.1 1.8M12 17h.01"/>'
};

const GEO_OPTIONS = {
  enableHighAccuracy: true,
  timeout: 20000,
  maximumAge: 60000,
  enableLocationFallback: true
};
const WEATHER_CACHE_KEY = 'hively_weather_cache';
/** Allow stale inspection weather for up to 7 days when offline. */
const WEATHER_STALE_OK_MS = 7 * 24 * 60 * 60 * 1000;

/** @typedef {'denied' | 'disabled' | 'unavailable'} LocationErrorCode */

export class LocationPermissionError extends Error {
  /** @param {LocationErrorCode} code */
  constructor(code, message = code) {
    super(message);
    this.name = 'LocationPermissionError';
    this.code = code;
  }
}

function isLocationServicesDisabledError(err) {
  const msg = String(err?.message || err || '');
  const code = String(err?.code || '');
  return (
    /OS-PLUG-GLOC-0007/i.test(msg) ||
    /OS-PLUG-GLOC-0007/i.test(code) ||
    /location services are not enabled/i.test(msg) ||
    /location(?:\s+services)?\s+(?:are\s+)?(?:not enabled|disabled)/i.test(msg)
  );
}

function isLocationDeniedError(err) {
  const msg = String(err?.message || err || '');
  const code = String(err?.code || '');
  return (
    /OS-PLUG-GLOC-0003/i.test(msg) ||
    /OS-PLUG-GLOC-0003/i.test(code) ||
    /permission .*denied/i.test(msg) ||
    /location permission/i.test(msg)
  );
}

/**
 * Ensure Android/iOS runtime location permission is granted.
 * Explicitly calls requestPermissions so the system dialog is shown
 * (getCurrentPosition alone can fail without a prompt on some devices).
 */
export async function ensureNativeLocationPermission() {
  if (!Capacitor.isNativePlatform()) return 'granted';

  let status;
  try {
    status = await Geolocation.checkPermissions();
  } catch (err) {
    if (isLocationServicesDisabledError(err)) {
      throw new LocationPermissionError('disabled', String(err?.message || err));
    }
    status = { location: 'prompt', coarseLocation: 'prompt' };
  }

  const current = status?.location || status?.coarseLocation;
  if (current === 'granted') return 'granted';

  let requested;
  try {
    requested = await Geolocation.requestPermissions({
      permissions: ['location', 'coarseLocation']
    });
  } catch (err) {
    if (isLocationServicesDisabledError(err)) {
      throw new LocationPermissionError('disabled', String(err?.message || err));
    }
    if (isLocationDeniedError(err)) {
      throw new LocationPermissionError('denied', String(err?.message || err));
    }
    throw new LocationPermissionError('unavailable', String(err?.message || err));
  }

  const next = requested?.location || requested?.coarseLocation;
  if (next === 'granted') return 'granted';
  throw new LocationPermissionError('denied', 'Location permission denied');
}

export function getCachedLocation() {
  return safeJsonParse(localStorage.getItem('hively_user_location'), null);
}

export function saveCachedLocation(lat, lon) {
  try {
    localStorage.setItem('hively_user_location', JSON.stringify({ lat, lon }));
  } catch (e) {
    console.error('Fehler beim Speichern des Standorts:', e);
  }
}

export function readWeatherCache() {
  return safeJsonParse(localStorage.getItem(WEATHER_CACHE_KEY), null);
}

export function writeWeatherCache(data) {
  try {
    localStorage.setItem(
      WEATHER_CACHE_KEY,
      JSON.stringify({ ...data, timestamp: data.timestamp ?? Date.now() })
    );
  } catch (e) {
    console.warn('Wetter-Cache konnte nicht gespeichert werden:', e);
  }
}

export function conditionFromCode(code) {
  return WMO_CODES[code] || { label: 'Unbekannt', icon: 'unknown', labelKey: 'weather.unknown' };
}

/** Resolve icon kind from WMO code or legacy condition text (cached radar). */
export function weatherIconKind(codeOrLabel) {
  if (typeof codeOrLabel === 'number' && Number.isFinite(codeOrLabel)) {
    return conditionFromCode(codeOrLabel).icon;
  }
  const key = String(codeOrLabel || '').trim().toLowerCase();
  if (!key) return 'unknown';
  if (WMO_CODES[codeOrLabel]?.icon) return WMO_CODES[codeOrLabel].icon;
  if (key.includes('gewitter') || key.includes('hagel')) return 'thunderstorm';
  if (key.includes('schnee')) return 'snow';
  if (key.includes('schauer')) return 'showers';
  if (key.includes('niesel')) return 'drizzle';
  if (key.includes('regen')) return 'rain';
  if (key.includes('nebel')) return 'fog';
  if (key.includes('bedeckt')) return 'cloudy';
  if (key.includes('wolkig')) return 'partly-cloudy';
  if (key.includes('sonnig') || key.includes('heiter')) return 'sun';
  return 'unknown';
}

/**
 * Inline SVG markup for Bienen-Radar (safe: fixed paths only).
 * @param {number|string} codeOrKind WMO code, icon kind, or condition label
 * @param {{ size?: number }} [opts]
 */
export function weatherIconSvg(codeOrKind, { size = 40 } = {}) {
  let kind = 'unknown';
  if (typeof codeOrKind === 'number') {
    kind = weatherIconKind(codeOrKind);
  } else if (WEATHER_ICON_PATHS[codeOrKind]) {
    kind = codeOrKind;
  } else {
    kind = weatherIconKind(codeOrKind);
  }
  const paths = WEATHER_ICON_PATHS[kind] || WEATHER_ICON_PATHS.unknown;
  const px = Number.isFinite(size) ? size : 40;
  return `<svg ${SVG_ATTRS} width="${px}" height="${px}">${paths}</svg>`;
}

async function resolveUserCoords(forceRefresh) {
  if (!forceRefresh) {
    const cached = getCachedLocation();
    if (cached?.lat != null && cached?.lon != null) return cached;
  }

  if (Capacitor.isNativePlatform()) {
    try {
      await ensureNativeLocationPermission();
      const position = await Geolocation.getCurrentPosition(GEO_OPTIONS);
      const coords = {
        lat: position.coords.latitude,
        lon: position.coords.longitude
      };
      saveCachedLocation(coords.lat, coords.lon);
      return coords;
    } catch (error) {
      console.warn('Standortabfrage fehlgeschlagen oder abgelehnt:', error?.message || error);
      if (error instanceof LocationPermissionError) throw error;
      if (isLocationServicesDisabledError(error)) {
        throw new LocationPermissionError('disabled', String(error?.message || error));
      }
      if (isLocationDeniedError(error)) {
        throw new LocationPermissionError('denied', String(error?.message || error));
      }
      throw new LocationPermissionError(
        'unavailable',
        String(error?.message || error || 'location unavailable')
      );
    }
  }

  if (!navigator.geolocation) {
    throw new Error('Geolocation wird von diesem Browser nicht unterstützt.');
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords = {
          lat: position.coords.latitude,
          lon: position.coords.longitude
        };
        saveCachedLocation(coords.lat, coords.lon);
        resolve(coords);
      },
      (error) => {
        console.warn('Standortabfrage fehlgeschlagen oder abgelehnt:', error.message);
        reject(error);
      },
      GEO_OPTIONS
    );
  });
}

async function withUserLocation(forceRefresh, fetchByCoords) {
  const { lat, lon } = await resolveUserCoords(forceRefresh);
  return fetchByCoords(lat, lon);
}

async function fetchWeatherAndPollenByCoords(lat, lon) {
  const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,wind_speed_10m`;
  const pollenUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=alder_pollen,birch_pollen,grass_pollen,mugwort_pollen,olive_pollen,ragweed_pollen`;

  const [weatherSettled, pollenSettled] = await Promise.allSettled([
    fetchWithTimeout(weatherUrl, {}, 8000),
    fetchWithTimeout(pollenUrl, {}, 8000)
  ]);

  if (weatherSettled.status !== 'fulfilled' || !weatherSettled.value.ok) {
    throw new Error('Fehler beim Abrufen der Wetterdaten');
  }

  const weatherData = await weatherSettled.value.json();
  let pollenData = { current: {} };

  if (pollenSettled.status === 'fulfilled' && pollenSettled.value.ok) {
    try {
      pollenData = await pollenSettled.value.json();
    } catch (e) {
      console.warn('Pollen-Daten konnten nicht gelesen werden:', e);
    }
  } else {
    console.warn('Pollen-API nicht erreichbar – Wetter wird ohne Pollen angezeigt.');
  }

  const weatherCode = weatherData.current?.weather_code;
  const conditionData = conditionFromCode(weatherCode);
  const p = pollenData.current || {};
  const pollenLevels = [
    { name: 'Erle', nameKey: 'weather.pollen.alder', value: p.alder_pollen || 0 },
    { name: 'Birke', nameKey: 'weather.pollen.birch', value: p.birch_pollen || 0 },
    { name: 'Gräser', nameKey: 'weather.pollen.grass', value: p.grass_pollen || 0 },
    { name: 'Beifuß', nameKey: 'weather.pollen.mugwort', value: p.mugwort_pollen || 0 },
    { name: 'Olive', nameKey: 'weather.pollen.olive', value: p.olive_pollen || 0 },
    { name: 'Traubenkraut', nameKey: 'weather.pollen.ragweed', value: p.ragweed_pollen || 0 }
  ].sort((a, b) => b.value - a.value);

  return {
    temperature: weatherData.current?.temperature_2m,
    conditionText: conditionData.label,
    conditionIcon: conditionData.icon,
    code: weatherCode,
    windSpeed: weatherData.current?.wind_speed_10m,
    dominantPollen: pollenLevels[0].value > 1 ? pollenLevels[0] : null,
    allPollen: p,
    latitude: lat,
    longitude: lon
  };
}

async function fetchCurrentWeatherByCoords(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code`;
  const response = await fetchWithTimeout(url, {}, 8000);

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data = await response.json();
  const current = data.current;
  if (!current) {
    throw new Error('Keine aktuellen Wetterdaten in der Antwort gefunden.');
  }

  const conditionData = conditionFromCode(current.weather_code);
  return {
    temperature: current.temperature_2m,
    conditionText: conditionData.label,
    conditionIcon: conditionData.icon,
    code: current.weather_code,
    latitude: lat,
    longitude: lon
  };
}

export async function fetchCurrentWeather(forceRefresh = false) {
  try {
    const data = await withUserLocation(forceRefresh, fetchCurrentWeatherByCoords);
    writeWeatherCache({ ...data, timestamp: Date.now() });
    return { ...data, fromCache: false };
  } catch (err) {
    const cached = readWeatherCache();
    const age = cached?.timestamp != null ? Date.now() - cached.timestamp : Infinity;
    if (cached && age <= WEATHER_STALE_OK_MS && cached.temperature != null) {
      console.warn('Live-Wetter nicht erreichbar – verwende Cache:', err?.message || err);
      return {
        temperature: cached.temperature,
        conditionText: cached.conditionText,
        conditionIcon: cached.conditionIcon || weatherIconKind(cached.code ?? cached.conditionText),
        code: cached.code,
        latitude: cached.latitude,
        longitude: cached.longitude,
        fromCache: true,
        cacheAgeMs: age
      };
    }
    throw err;
  }
}

export async function fetchDashboardWeatherAndPollen(forceRefresh = false) {
  return withUserLocation(forceRefresh, fetchWeatherAndPollenByCoords);
}
