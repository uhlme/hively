/**
 * Shared Stripe / Pro entitlement helpers (server + testable pure logic).
 */

export const PRO_STATUSES = new Set(['active', 'trialing', 'past_due']);
export const TRIAL_DAYS = 14;

const KNOWN_PLAN_STATUSES = new Set([
  'active',
  'trialing',
  'past_due',
  'canceled',
  'unpaid',
  'incomplete',
  'paused'
]);

/**
 * Whether Stripe Pro enforcement is configured on the server.
 * Requires explicit BILLING_ENABLED / VITE_BILLING_ENABLED=true plus Stripe keys,
 * so client soft-locks and server hard-gates stay in sync.
 */
export function isBillingEnforced(env = process.env) {
  const flag = String(env.BILLING_ENABLED || env.VITE_BILLING_ENABLED || '').toLowerCase();
  if (flag !== 'true' && flag !== '1') return false;
  return Boolean(
    env.STRIPE_SECRET_KEY &&
      (env.STRIPE_PRICE_MONTHLY || env.STRIPE_PRICE_YEARLY)
  );
}

/**
 * @param {{ plan?: string, plan_status?: string, plan_period_end?: string | Date | null }} row
 */
export function isProEntitlement(row = {}) {
  if (!row || row.plan !== 'pro') return false;
  if (!PRO_STATUSES.has(String(row.plan_status || ''))) return false;
  if (row.plan_period_end) {
    const end = new Date(row.plan_period_end).getTime();
    if (Number.isFinite(end) && end < Date.now()) return false;
  }
  return true;
}

/**
 * True when this Betrieb already used a Stripe subscription (no second trial).
 * @param {{ stripe_subscription_id?: string | null, plan_status?: string | null }} operation
 */
export function isTrialEligible(operation = {}) {
  if (operation?.stripe_subscription_id) return false;
  const status = String(operation?.plan_status || 'none');
  if (['trialing', 'active', 'past_due', 'canceled', 'unpaid', 'incomplete', 'paused'].includes(status)) {
    return false;
  }
  return true;
}

/**
 * Prefer Stripe ID bindings over metadata (metadata can be tampered in Dashboard).
 * @param {{
 *   metadataOperationId?: string | null,
 *   bySubscriptionId?: string | null,
 *   byCustomerId?: string | null
 * }} lookups
 * @returns {{ operationId: string | null, conflict?: boolean }}
 */
export function pickOperationIdForSubscription(lookups = {}) {
  const meta = lookups.metadataOperationId || null;
  const bySub = lookups.bySubscriptionId || null;
  const byCust = lookups.byCustomerId || null;

  if (bySub) {
    return {
      operationId: bySub,
      conflict: Boolean(meta && meta !== bySub)
    };
  }
  if (byCust) {
    return {
      operationId: byCust,
      conflict: Boolean(meta && meta !== byCust)
    };
  }
  if (meta) return { operationId: meta };
  return { operationId: null };
}

/**
 * Map Stripe subscription → operations billing columns.
 * @param {import('stripe').Stripe.Subscription | null | undefined} subscription
 */
export function mapSubscriptionToBilling(subscription) {
  if (!subscription) {
    return {
      plan: 'free',
      plan_status: 'none',
      plan_interval: null,
      plan_period_end: null,
      stripe_subscription_id: null
    };
  }

  const status = String(subscription.status || 'none');
  const item = subscription.items?.data?.[0];
  const interval = item?.price?.recurring?.interval || null;
  const periodEndSec = subscription.current_period_end;
  const planStatus = KNOWN_PLAN_STATUSES.has(status) ? status : 'none';
  const isPro = PRO_STATUSES.has(planStatus);

  return {
    plan: isPro ? 'pro' : 'free',
    plan_status: planStatus === 'none' ? 'canceled' : planStatus,
    plan_interval: interval === 'year' || interval === 'month' ? interval : null,
    plan_period_end: periodEndSec
      ? new Date(periodEndSec * 1000).toISOString()
      : null,
    stripe_subscription_id: subscription.id || null
  };
}

/**
 * @param {'month' | 'year'} interval
 * @param {NodeJS.ProcessEnv} [env]
 */
export function resolvePriceId(interval, env = process.env) {
  if (interval === 'year') {
    const id = env.STRIPE_PRICE_YEARLY || '';
    if (!id) throw new Error('STRIPE_PRICE_YEARLY fehlt.');
    return id;
  }
  if (interval === 'month') {
    const id = env.STRIPE_PRICE_MONTHLY || '';
    if (!id) throw new Error('STRIPE_PRICE_MONTHLY fehlt.');
    return id;
  }
  throw new Error('Ungültiges Abo-Intervall.');
}

export function getAppOrigin(env = process.env, fallback = 'https://hivelyy.netlify.app') {
  return (
    env.APP_ORIGIN ||
    env.URL ||
    env.DEPLOY_PRIME_URL ||
    fallback
  ).replace(/\/$/, '');
}

/** Custom URL scheme for Capacitor deep links (must match iOS/Android config). */
export function getNativeAppUrlScheme(env = process.env) {
  return String(env.NATIVE_APP_URL_SCHEME || 'ch.hively.app').replace(/:\/\/.*$/, '');
}

/**
 * Stripe Checkout / Portal return URLs.
 * Native uses the app URL scheme so Stripe redirects back into Capacitor
 * instead of the public website.
 * @param {NodeJS.ProcessEnv} [env]
 * @param {{ native?: boolean }} [options]
 */
export function getBillingReturnUrls(env = process.env, { native = false } = {}) {
  if (native) {
    const scheme = getNativeAppUrlScheme(env);
    return {
      success: `${scheme}://billing?view=settings&billing=success`,
      cancel: `${scheme}://billing?view=settings&billing=cancel`,
      portalReturn: `${scheme}://billing?view=settings`
    };
  }
  const origin = getAppOrigin(env);
  return {
    success: `${origin}/?view=settings&billing=success`,
    cancel: `${origin}/?view=settings&billing=cancel`,
    portalReturn: `${origin}/?view=settings`
  };
}

/** Safe client-facing error (avoid leaking Stripe/internal details). */
export function publicBillingError(err, fallback) {
  if (err?.status && err.status >= 400 && err.status < 500 && err.message) {
    return err.message;
  }
  return fallback;
}
