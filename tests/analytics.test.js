import { beforeEach, describe, expect, it, vi } from 'vitest';

const posthogMock = {
  init: vi.fn(),
  capture: vi.fn(),
  identify: vi.fn(),
  reset: vi.fn(),
  register: vi.fn(),
  debug: vi.fn()
};

vi.mock('posthog-js', () => ({
  default: posthogMock
}));

describe('analytics', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete window.__hivelyErrorHandlersInstalled;
    posthogMock.init.mockImplementation((_key, opts) => {
      opts?.loaded?.(posthogMock);
    });
  });

  it('no-ops when VITE_POSTHOG_KEY is missing', async () => {
    vi.stubEnv('VITE_POSTHOG_KEY', '');
    const analytics = await import('../src/analytics.js');
    expect(analytics.isAnalyticsEnabled()).toBe(false);
    analytics.initAnalytics();
    analytics.trackPageView('dashboard');
    analytics.trackEvent('hive_created');
    analytics.identifyUser({ id: 'u1' });
    expect(posthogMock.init).not.toHaveBeenCalled();
    expect(posthogMock.capture).not.toHaveBeenCalled();
  });

  it('initializes and tracks when key is set', async () => {
    vi.stubEnv('VITE_POSTHOG_KEY', 'phc_test');
    vi.stubEnv('VITE_POSTHOG_HOST', 'https://eu.i.posthog.com');
    const analytics = await import('../src/analytics.js');
    expect(analytics.isAnalyticsEnabled()).toBe(true);
    analytics.initAnalytics();
    expect(posthogMock.init).toHaveBeenCalledTimes(1);
    expect(posthogMock.init.mock.calls[0][0]).toBe('phc_test');
    expect(posthogMock.init.mock.calls[0][1].api_host).toBe('https://eu.i.posthog.com');
    expect(posthogMock.init.mock.calls[0][1].autocapture).toBe(false);
    expect(posthogMock.init.mock.calls[0][1].capture_pageview).toBe(false);
    expect(posthogMock.register).toHaveBeenCalledWith(
      expect.objectContaining({ app: 'hively', environment: 'development', is_test_traffic: true })
    );

    analytics.trackPageView('hives');
    expect(posthogMock.capture).toHaveBeenCalledWith(
      '$pageview',
      expect.objectContaining({ view: 'hives' })
    );

    analytics.trackEvent('hive_created', { x: 1 });
    expect(posthogMock.capture).toHaveBeenCalledWith('hive_created', { x: 1 });

    analytics.trackAuthSignedIn('google');
    expect(posthogMock.capture).toHaveBeenCalledWith(
      'auth_signed_in',
      expect.objectContaining({ provider: 'google' })
    );

    analytics.identifyUser({ id: 'user-123' });
    expect(posthogMock.identify).toHaveBeenCalledWith('user-123');

    analytics.resetAnalyticsUser();
    expect(posthogMock.reset).toHaveBeenCalled();
  });

  it('resolves auth provider from Supabase user identities', async () => {
    vi.stubEnv('VITE_POSTHOG_KEY', 'phc_test');
    const analytics = await import('../src/analytics.js');
    expect(analytics.resolveAuthProvider(null, 'email')).toBe('email');
    expect(
      analytics.resolveAuthProvider({ identities: [{ provider: 'google' }] }, null)
    ).toBe('google');
    expect(
      analytics.resolveAuthProvider({ identities: [{ provider: 'apple' }] }, null)
    ).toBe('apple');
  });

  it('stores and consumes pending auth provider in sessionStorage', async () => {
    vi.stubEnv('VITE_POSTHOG_KEY', 'phc_test');
    const analytics = await import('../src/analytics.js');
    analytics.markPendingAuthProvider('google');
    expect(sessionStorage.getItem('hively_pending_auth_provider')).toBe('google');
    expect(analytics.consumePendingAuthProvider()).toBe('google');
    expect(sessionStorage.getItem('hively_pending_auth_provider')).toBeNull();
  });

  it('captures exceptions and installs global handlers once', async () => {
    vi.stubEnv('VITE_POSTHOG_KEY', 'phc_test');
    const onError = vi.fn();
    const analytics = await import('../src/analytics.js');
    analytics.initAnalytics();

    analytics.captureException(new Error('boom'), { source: 'test' });
    expect(posthogMock.capture).toHaveBeenCalledWith(
      '$exception',
      expect.objectContaining({
        $exception_message: 'boom',
        source: 'test'
      })
    );

    analytics.installGlobalErrorHandlers({ onError });
    analytics.installGlobalErrorHandlers({ onError }); // idempotent
    window.dispatchEvent(new ErrorEvent('error', { message: 'window boom', error: new Error('window boom') }));
    expect(onError).toHaveBeenCalled();
    expect(posthogMock.capture).toHaveBeenCalledWith(
      '$exception',
      expect.objectContaining({ source: 'window.error' })
    );
  });
});
