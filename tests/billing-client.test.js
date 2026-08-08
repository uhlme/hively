import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: vi.fn(() => false)
  }
}));

vi.mock('@capacitor/app', () => ({
  App: {
    addListener: vi.fn(async () => ({ remove: vi.fn() })),
    getLaunchUrl: vi.fn(async () => undefined)
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
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import {
  openBillingUrl,
  parseBillingReturnUrl,
  consumeNativeBillingLaunchUrl
} from '../src/billing.js';

describe('billing client helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Capacitor.isNativePlatform.mockReturnValue(false);
    App.getLaunchUrl.mockResolvedValue(undefined);
    App.addListener.mockResolvedValue({ remove: vi.fn() });
    Browser.addListener.mockResolvedValue({ remove: vi.fn() });
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
    const assign = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { href: '', set href(v) { assign(v); }, get href() { return ''; } }
    });
    await openBillingUrl('https://checkout.stripe.com/c/pay/cs_test');
    expect(Browser.open).not.toHaveBeenCalled();
    expect(assign).toHaveBeenCalledWith('https://checkout.stripe.com/c/pay/cs_test');
  });

  it('handles cold-start launch URLs for billing return', async () => {
    Capacitor.isNativePlatform.mockReturnValue(true);
    App.getLaunchUrl.mockResolvedValue({
      url: 'ch.hively.app://billing?view=settings&billing=success'
    });
    const onBillingReturn = vi.fn(async () => {});
    const onAppResume = vi.fn(async () => {});

    const parsed = await consumeNativeBillingLaunchUrl({ onBillingReturn, onAppResume });

    expect(parsed).toEqual({ billing: 'success', view: 'settings' });
    expect(onBillingReturn).toHaveBeenCalledWith('success');
    expect(Browser.close).toHaveBeenCalled();
    expect(onAppResume).not.toHaveBeenCalled();
  });
});
