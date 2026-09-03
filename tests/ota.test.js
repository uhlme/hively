import { beforeEach, describe, expect, it, vi } from 'vitest';

const notifyAppReady = vi.fn(async () => ({ bundle: { version: '0.6.12' } }));
const setChannel = vi.fn(async () => ({}));
const addListener = vi.fn(async () => ({ remove: vi.fn() }));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: vi.fn(() => true)
  }
}));

vi.mock('@capgo/capacitor-updater', () => ({
  CapacitorUpdater: {
    notifyAppReady,
    setChannel,
    addListener
  }
}));

vi.mock('../src/analytics.js', () => ({
  trackEvent: vi.fn()
}));

describe('initOtaUpdates', () => {
  beforeEach(() => {
    notifyAppReady.mockClear();
    setChannel.mockClear();
    addListener.mockClear();
    vi.stubEnv('VITE_OTA_CHANNEL', 'staging');
  });

  it('notifies Capgo on native platforms', async () => {
    const { initOtaUpdates, getOtaChannel } = await import('../src/ota.js');
    expect(getOtaChannel()).toBe('staging');
    await initOtaUpdates();
    expect(setChannel).toHaveBeenCalledWith({ channel: 'staging', triggerAutoUpdate: false });
    expect(notifyAppReady).toHaveBeenCalledTimes(1);
    expect(addListener).toHaveBeenCalled();
  });

  it('no-ops on web', async () => {
    const { Capacitor } = await import('@capacitor/core');
    Capacitor.isNativePlatform.mockReturnValueOnce(false);
    vi.resetModules();
    const { initOtaUpdates } = await import('../src/ota.js');
    await initOtaUpdates();
    expect(notifyAppReady).not.toHaveBeenCalled();
  });
});
