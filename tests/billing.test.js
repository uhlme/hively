import { describe, expect, it } from 'vitest';
import {
  isBillingEnforced,
  isProEntitlement,
  mapSubscriptionToBilling,
  resolvePriceId,
  TRIAL_DAYS
} from '../server/billing.js';

describe('billing helpers', () => {
  it('exposes a 14-day trial constant', () => {
    expect(TRIAL_DAYS).toBe(14);
  });

  it('detects billing enforcement from env', () => {
    expect(isBillingEnforced({})).toBe(false);
    expect(
      isBillingEnforced({
        STRIPE_SECRET_KEY: 'sk_test',
        STRIPE_PRICE_MONTHLY: 'price_m'
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

  it('resolves price ids by interval', () => {
    const env = { STRIPE_PRICE_MONTHLY: 'price_m', STRIPE_PRICE_YEARLY: 'price_y' };
    expect(resolvePriceId('month', env)).toBe('price_m');
    expect(resolvePriceId('year', env)).toBe('price_y');
    expect(() => resolvePriceId('week', env)).toThrow(/Intervall/);
  });
});
