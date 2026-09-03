import { afterEach, describe, expect, it, vi } from 'vitest';

const { readManifestMock } = vi.hoisted(() => ({
  readManifestMock: vi.fn()
}));

vi.mock('../server/otaBlobs.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    readManifest: readManifestMock
  };
});

describe('otaUpdates', () => {
  afterEach(() => {
    readManifestMock.mockReset();
    delete process.env.OTA_PUBLIC_ORIGIN;
  });

  it('parses bundle paths safely', async () => {
    const { parseBundlePath } = await import('../server/otaUpdates.js');
    expect(parseBundlePath('staging/0.6.12.zip')).toEqual({
      channel: 'staging',
      version: '0.6.12',
      key: 'staging/0.6.12.zip'
    });
    expect(parseBundlePath('../staging/0.6.12.zip')).toBeNull();
    expect(parseBundlePath('staging/evil.zip')).toBeNull();
    expect(parseBundlePath('prod/0.6.12.zip')).toBeNull();
  });

  it('resolves channel from Capgo defaultChannel', async () => {
    const { resolveOtaChannel } = await import('../server/otaUpdates.js');
    expect(resolveOtaChannel({ defaultChannel: 'staging' })).toBe('staging');
    expect(resolveOtaChannel({}, new URLSearchParams('channel=production'))).toBe('production');
    expect(resolveOtaChannel({})).toBe('production');
  });

  it('returns no_new_version when already up to date', async () => {
    readManifestMock.mockResolvedValueOnce({
      version: '0.6.12',
      checksum: 'abc',
      bundleKey: 'staging/0.6.12.zip',
      publishedAt: '2026-09-03T00:00:00.000Z'
    });
    const { handleOtaUpdateRequest } = await import('../server/otaUpdates.js');
    const result = await handleOtaUpdateRequest({
      app_id: 'ch.hively.app',
      version_name: '0.6.12',
      defaultChannel: 'staging'
    });
    expect(result.status).toBe(200);
    expect(result.body.error).toBe('no_new_version_available');
    expect(result.body.url).toBeUndefined();
  });

  it('returns Capgo payload when a newer bundle exists', async () => {
    process.env.OTA_PUBLIC_ORIGIN = 'https://hivelyy.netlify.app';
    readManifestMock.mockResolvedValueOnce({
      version: '0.6.13',
      checksum: 'deadbeef',
      bundleKey: 'staging/0.6.13.zip',
      publishedAt: '2026-09-03T00:00:00.000Z'
    });
    const { handleOtaUpdateRequest } = await import('../server/otaUpdates.js');
    const result = await handleOtaUpdateRequest({
      app_id: 'ch.hively.app',
      version_name: '0.6.12',
      defaultChannel: 'staging'
    });
    expect(result).toEqual({
      status: 200,
      body: {
        version: '0.6.13',
        checksum: 'deadbeef',
        url: 'https://hivelyy.netlify.app/api/ota-bundle/staging/0.6.13.zip'
      }
    });
  });

  it('ignores unknown app ids', async () => {
    const { handleOtaUpdateRequest } = await import('../server/otaUpdates.js');
    const result = await handleOtaUpdateRequest({
      app_id: 'com.other.app',
      version_name: '0.1.0',
      defaultChannel: 'production'
    });
    expect(result.body.error).toBe('no_new_version_available');
    expect(readManifestMock).not.toHaveBeenCalled();
  });
});
