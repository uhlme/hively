import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: vi.fn(() => false)
  }
}));

vi.mock('@capacitor/app', () => ({
  App: {
    addListener: vi.fn(async () => ({ remove: vi.fn() }))
  }
}));

vi.mock('@capacitor/browser', () => ({
  Browser: {
    open: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    addListener: vi.fn(async () => ({ remove: vi.fn() }))
  }
}));

vi.mock('../src/supabase.js', () => ({ supabase: null }));
vi.mock('../src/operations.js', () => ({
  getActiveOperationId: vi.fn(() => null),
  getActiveOperationMeta: vi.fn(() => null),
  isOperationOwner: vi.fn(() => false)
}));

import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { openBillingUrl, parseBillingReturnUrl } from '../src/billing.js';

describe('billing client helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Capacitor.isNativePlatform.mockReturnValue(false);
  });

  it('parses Stripe return deep links and query strings', () => {
    expect(
      parseBillingReturnUrl('ch.hively.app://billing?view=settings&billing=success')
    ).toEqual({ billing: 'success', view: 'settings' });
    expect(parseBillingReturnUrl('?view=settings&billing=cancel')).toEqual({
      billing: 'cancel',
      view: 'settings'
    });
    expect(parseBillingReturnUrl('https://hivelyy.netlify.app/?billing=success')).toEqual({
      billing: 'success',
      view: null
    });
    expect(parseBillingReturnUrl('not a url')).toEqual({ billing: null, view: null });
  });

  it('opens Stripe URLs in the system browser on native platforms', async () => {
    Capacitor.isNativePlatform.mockReturnValue(true);
    await openBillingUrl('https://checkout.stripe.com/c/pay/cs_test');
    expect(Browser.open).toHaveBeenCalledWith({
      url: 'https://checkout.stripe.com/c/pay/cs_test',
      presentationStyle: 'fullscreen'
    });
  });

  it('navigates the page on web', async () => {
    const hrefSpy = vi.spyOn(window, 'location', 'get').mockReturnValue({ href: '' });
    // jsdom location.href assignment can be tricky — stub via delete/define
    const assign = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { href: '', set href(v) { assign(v); }, get href() { return ''; } }
    });
    await openBillingUrl('https://checkout.stripe.com/c/pay/cs_test');
    expect(Browser.open).not.toHaveBeenCalled();
    expect(assign).toHaveBeenCalledWith('https://checkout.stripe.com/c/pay/cs_test');
    hrefSpy.mockRestore();
  });
});
