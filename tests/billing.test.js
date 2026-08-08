import { describe, expect, it } from 'vitest';
import {
  getBillingReturnUrls,
  getNativeAppUrlScheme,
  isBillingEnforced,
  isProEntitlement,
  isTrialEligible,
  formatBillingPlanSummary,
  mapSubscriptionToBilling,
  pickOperationIdForSubscription,
  publicBillingError,
  resolvePriceId,
  TRIAL_DAYS
} from '../server/billing.js';

describe('billing helpers', () => {
  it('exposes a 14-day trial constant', () => {
    expect(TRIAL_DAYS).toBe(14);
  });

  it('requires BILLING_ENABLED plus Stripe keys for enforcement', () => {
    expect(isBillingEnforced({})).toBe(false);
    expect(
      isBillingEnforced({
        STRIPE_SECRET_KEY: 'sk_test',
        STRIPE_PRICE_MONTHLY: 'price_m'
      })
    ).toBe(false);
    expect(
      isBillingEnforced({
        VITE_BILLING_ENABLED: 'true',
        STRIPE_SECRET_KEY: 'sk_test',
        STRIPE_PRICE_MONTHLY: 'price_m'
      })
    ).toBe(true);
    expect(
      isBillingEnforced({
        BILLING_ENABLED: '1',
        STRIPE_SECRET_KEY: 'sk_test',
        STRIPE_PRICE_YEARLY: 'price_y'
      })
    ).toBe(true);
  });

  it('recognizes active / trialing / past_due Pro entitlements', () => {
    expect(isProEntitlement({ plan: 'pro', plan_status: 'active' })).toBe(true);
    expect(isProEntitlement({ plan: 'pro', plan_status: 'trialing' })).toBe(true);
    expect(
      isProEntitlement({
        plan: 'pro',
        plan_status: 'past_due',
        plan_period_end: new Date(Date.now() + 86400000).toISOString()
      })
    ).toBe(true);
    expect(isProEntitlement({ plan: 'free', plan_status: 'none' })).toBe(false);
    expect(isProEntitlement({ plan: 'free', plan_status: 'paused' })).toBe(false);
    expect(
      isProEntitlement({
        plan: 'pro',
        plan_status: 'active',
        plan_period_end: new Date(Date.now() - 1000).toISOString()
      })
    ).toBe(false);
  });

  it('maps Stripe subscriptions to operation billing columns', () => {
    const mapped = mapSubscriptionToBilling({
      id: 'sub_1',
      status: 'trialing',
      current_period_end: 2000000000,
      cancel_at_period_end: false,
      items: { data: [{ price: { recurring: { interval: 'year' } } }] }
    });
    expect(mapped.plan).toBe('pro');
    expect(mapped.plan_status).toBe('trialing');
    expect(mapped.plan_interval).toBe('year');
    expect(mapped.plan_cancel_at_period_end).toBe(false);
    expect(mapped.stripe_subscription_id).toBe('sub_1');
  });

  it('maps cancel_at_period_end from Stripe subscriptions', () => {
    const mapped = mapSubscriptionToBilling({
      id: 'sub_cancel',
      status: 'active',
      current_period_end: 2000000000,
      cancel_at_period_end: true,
      items: { data: [{ price: { recurring: { interval: 'month' } } }] }
    });
    expect(mapped.plan).toBe('pro');
    expect(mapped.plan_status).toBe('active');
    expect(mapped.plan_cancel_at_period_end).toBe(true);
  });

  it('maps null subscription to free without throwing', () => {
    expect(mapSubscriptionToBilling(null)).toEqual({
      plan: 'free',
      plan_status: 'none',
      plan_interval: null,
      plan_period_end: null,
      plan_cancel_at_period_end: false,
      stripe_subscription_id: null
    });
  });

  it('maps paused subscriptions to free with paused status (not canceled)', () => {
    const mapped = mapSubscriptionToBilling({
      id: 'sub_paused',
      status: 'paused',
      current_period_end: 2000000000,
      items: { data: [{ price: { recurring: { interval: 'month' } } }] }
    });
    expect(mapped.plan).toBe('free');
    expect(mapped.plan_status).toBe('paused');
    expect(mapped.stripe_subscription_id).toBe('sub_paused');
  });

  it('maps deleted/canceled subscription payload used by webhook', () => {
    const mapped = mapSubscriptionToBilling({
      id: 'sub_gone',
      status: 'canceled',
      current_period_end: 2000000000,
      items: { data: [] }
    });
    expect(mapped.plan).toBe('free');
    expect(mapped.plan_status).toBe('canceled');
  });

  it('prefers Stripe ID bindings over metadata for operation resolve', () => {
    expect(
      pickOperationIdForSubscription({
        metadataOperationId: 'op-meta',
        bySubscriptionId: 'op-sub',
        byCustomerId: 'op-cust'
      })
    ).toEqual({ operationId: 'op-sub', conflict: true });

    expect(
      pickOperationIdForSubscription({
        metadataOperationId: 'op-meta',
        bySubscriptionId: null,
        byCustomerId: 'op-cust'
      })
    ).toEqual({ operationId: 'op-cust', conflict: true });

    expect(
      pickOperationIdForSubscription({
        metadataOperationId: 'op-meta',
        bySubscriptionId: null,
        byCustomerId: null
      })
    ).toEqual({ operationId: 'op-meta' });

    expect(
      pickOperationIdForSubscription({
        metadataOperationId: 'op-same',
        bySubscriptionId: 'op-same',
        byCustomerId: null
      })
    ).toEqual({ operationId: 'op-same', conflict: false });
  });

  it('grants trial only to Betriebe without prior subscription', () => {
    expect(isTrialEligible({ plan_status: 'none' })).toBe(true);
    expect(isTrialEligible({})).toBe(true);
    expect(isTrialEligible({ stripe_subscription_id: 'sub_x' })).toBe(false);
    expect(isTrialEligible({ plan_status: 'canceled' })).toBe(false);
    expect(isTrialEligible({ plan_status: 'trialing' })).toBe(false);
    expect(isTrialEligible({ plan_status: 'paused' })).toBe(false);
  });

  it('formats Settings subscription status copy', () => {
    const end = '2030-08-22T15:03:08.000Z';
    expect(
      formatBillingPlanSummary({
        plan: 'pro',
        planStatus: 'trialing',
        planInterval: 'year',
        planPeriodEnd: end,
        hasPro: true
      })
    ).toMatch(/Testphase/);
    expect(
      formatBillingPlanSummary({
        plan: 'pro',
        planStatus: 'active',
        planInterval: 'year',
        planPeriodEnd: end,
        planCancelAtPeriodEnd: true,
        hasPro: true
      })
    ).toMatch(/gekündigt/i);
    expect(
      formatBillingPlanSummary({
        plan: 'pro',
        planStatus: 'active',
        planInterval: 'month',
        planPeriodEnd: end,
        hasPro: true
      })
    ).toMatch(/verlängert sich/);
    expect(
      formatBillingPlanSummary({
        plan: 'free',
        planStatus: 'canceled',
        planPeriodEnd: end,
        hasPro: false
      })
    ).toMatch(/gekündigt/i);
    expect(formatBillingPlanSummary({ plan: 'free', planStatus: 'none', hasPro: false })).toMatch(
      /Aktuell Free/
    );
  });

  it('exposes safe public billing errors', () => {
    const clientErr = new Error('Nur der Betriebsinhaber kann das Abo verwalten.');
    clientErr.status = 403;
    expect(publicBillingError(clientErr, 'fallback')).toBe(clientErr.message);
    expect(publicBillingError(new Error('Stripe raw boom'), 'Checkout fehlgeschlagen.')).toBe(
      'Checkout fehlgeschlagen.'
    );
  });

  it('resolves price ids by interval', () => {
    const env = { STRIPE_PRICE_MONTHLY: 'price_m', STRIPE_PRICE_YEARLY: 'price_y' };
    expect(resolvePriceId('month', env)).toBe('price_m');
    expect(resolvePriceId('year', env)).toBe('price_y');
    expect(() => resolvePriceId('week', env)).toThrow(/Intervall/);
  });

  it('builds web vs native Stripe return URLs', () => {
    expect(getNativeAppUrlScheme({})).toBe('ch.hively.app');
    const web = getBillingReturnUrls({ APP_ORIGIN: 'https://hivelyy.netlify.app/' });
    expect(web.success).toBe('https://hivelyy.netlify.app/?view=settings&billing=success');
    expect(web.cancel).toContain('billing=cancel');
    expect(web.portalReturn).toBe('https://hivelyy.netlify.app/?view=settings');

    // Native must stay on HTTPS — SFSafariViewController cannot open custom schemes.
    const native = getBillingReturnUrls(
      { APP_ORIGIN: 'https://hivelyy.netlify.app' },
      { native: true }
    );
    expect(native.success).toBe(
      'https://hivelyy.netlify.app/billing-return.html?view=settings&billing=success&native=1'
    );
    expect(native.cancel).toContain('/billing-return.html?');
    expect(native.cancel).toContain('billing=cancel');
    expect(native.portalReturn).toContain('/billing-return.html?');
    expect(native.portalReturn).toContain('native=1');
  });
});
