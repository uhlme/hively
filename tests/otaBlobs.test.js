import { describe, expect, it } from 'vitest';
import {
  bundleKeyFor,
  compareVersions,
  isOtaChannel,
  isValidOtaVersion,
  parseManifest
} from '../server/otaBlobs.js';

describe('otaBlobs helpers', () => {
  it('validates channels and versions', () => {
    expect(isOtaChannel('staging')).toBe(true);
    expect(isOtaChannel('production')).toBe(true);
    expect(isOtaChannel('beta')).toBe(false);
    expect(isValidOtaVersion('0.6.12')).toBe(true);
    expect(isValidOtaVersion('0.6.9.2')).toBe(false);
    expect(isValidOtaVersion('v0.6.12')).toBe(false);
  });

  it('builds bundle keys', () => {
    expect(bundleKeyFor('staging', '0.6.12')).toBe('staging/0.6.12.zip');
  });

  it('compares semver-like versions', () => {
    expect(compareVersions('0.6.12', '0.6.11')).toBeGreaterThan(0);
    expect(compareVersions('0.6.10', '0.6.10')).toBe(0);
    expect(compareVersions('0.5.0', '0.6.0')).toBeLessThan(0);
  });

  it('parses manifests and rejects junk', () => {
    expect(
      parseManifest({
        version: '0.6.12',
        checksum: 'abc',
        bundleKey: 'production/0.6.12.zip',
        publishedAt: '2026-01-01T00:00:00.000Z'
      })
    ).toMatchObject({ version: '0.6.12', checksum: 'abc' });
    expect(parseManifest({ version: 'bad', checksum: 'x', bundleKey: 'y' })).toBeNull();
    expect(parseManifest(null)).toBeNull();
  });
});
