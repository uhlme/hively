import { describe, expect, it } from 'vitest';
import { getCachedLocation, saveCachedLocation } from '../src/weather.js';

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
