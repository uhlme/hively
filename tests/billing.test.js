import { describe, expect, it } from 'vitest';
import {
  isBillingEnforced,
  isProEntitlement,
  isTrialEligible,
  mapSubscriptionToBilling,
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
        BILLING_ENABLED: 'true',
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
      items: { data: [{ price: { recurring: { interval: 'year' } } }] }
    });
    expect(mapped.plan).toBe('pro');
    expect(mapped.plan_status).toBe('trialing');
    expect(mapped.plan_interval).toBe('year');
    expect(mapped.stripe_subscription_id).toBe('sub_1');
  });

  it('maps null subscription to free without throwing', () => {
    expect(mapSubscriptionToBilling(null)).toEqual({
      plan: 'free',
      plan_status: 'none',
      plan_interval: null,
      plan_period_end: null,
      stripe_subscription_id: null
    });
  });

  it('grants trial only to Betriebe without prior subscription', () => {
    expect(isTrialEligible({ plan_status: 'none' })).toBe(true);
    expect(isTrialEligible({})).toBe(true);
    expect(isTrialEligible({ stripe_subscription_id: 'sub_x' })).toBe(false);
    expect(isTrialEligible({ plan_status: 'canceled' })).toBe(false);
    expect(isTrialEligible({ plan_status: 'trialing' })).toBe(false);
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
});
