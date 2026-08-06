/**
 * weather.js - Handles fetching weather data based on geolocation.
 */
import { Geolocation } from '@capacitor/geolocation';
import { Capacitor } from '@capacitor/core';
import { fetchWithTimeout } from './network.js';
import { safeJsonParse } from './utils.js';

const WMO_CODES = {
  0: { label: 'Sonnig' },
  1: { label: 'Heiter' },
  2: { label: 'Wolkig' },
  3: { label: 'Bedeckt' },
  45: { label: 'Nebel' },
  48: { label: 'Rauhreifnebel' },
  51: { label: 'Leichter Nieselregen' },
  53: { label: 'Nieselregen' },
  55: { label: 'Dichter Nieselregen' },
  56: { label: 'Leichter gefrierender Nieselregen' },
  57: { label: 'Dichter gefrierender Nieselregen' },
  61: { label: 'Leichter Regen' },
  63: { label: 'Regen' },
  65: { label: 'Starker Regen' },
  66: { label: 'Leichter gefrierender Regen' },
  67: { label: 'Starker gefrierender Regen' },
  71: { label: 'Leichter Schneefall' },
  73: { label: 'Schneefall' },
  75: { label: 'Starker Schneefall' },
  77: { label: 'Schneegriesel' },
  80: { label: 'Leichte Regenschauer' },
  81: { label: 'Regenschauer' },
  82: { label: 'Starke Regenschauer' },
  85: { label: 'Leichte Schneeschauer' },
  86: { label: 'Starke Schneeschauer' },
  95: { label: 'Gewitter' },
  96: { label: 'Gewitter mit leichtem Hagel' },
  99: { label: 'Gewitter mit starkem Hagel' }
};

const GEO_OPTIONS = { timeout: 10000, maximumAge: 60000 };
const WEATHER_CACHE_KEY = 'hively_weather_cache';
/** Allow stale inspection weather for up to 7 days when offline. */
const WEATHER_STALE_OK_MS = 7 * 24 * 60 * 60 * 1000;

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

function conditionFromCode(code) {
  return WMO_CODES[code] || { label: 'Unbekannt' };
}

async function resolveUserCoords(forceRefresh) {
  if (!forceRefresh) {
    const cached = getCachedLocation();
    if (cached?.lat != null && cached?.lon != null) return cached;
  }

  if (Capacitor.isNativePlatform()) {
    try {
      const position = await Geolocation.getCurrentPosition(GEO_OPTIONS);
      const coords = {
        lat: position.coords.latitude,
        lon: position.coords.longitude
      };
      saveCachedLocation(coords.lat, coords.lon);
      return coords;
    } catch (error) {
      console.warn('Standortabfrage fehlgeschlagen oder abgelehnt:', error.message);
      throw error;
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

  const conditionData = conditionFromCode(weatherData.current?.weather_code);
  const p = pollenData.current || {};
  const pollenLevels = [
    { name: 'Erle', value: p.alder_pollen || 0 },
    { name: 'Birke', value: p.birch_pollen || 0 },
    { name: 'Gräser', value: p.grass_pollen || 0 },
    { name: 'Beifuß', value: p.mugwort_pollen || 0 },
    { name: 'Olive', value: p.olive_pollen || 0 },
    { name: 'Traubenkraut', value: p.ragweed_pollen || 0 }
  ].sort((a, b) => b.value - a.value);

  return {
    temperature: weatherData.current?.temperature_2m,
    conditionText: conditionData.label,
    conditionEmoji: '',
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
    conditionEmoji: '',
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
        conditionEmoji: cached.conditionEmoji,
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
