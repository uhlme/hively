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
      plan_cancel_at_period_end: false,
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
    plan_cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
    stripe_subscription_id: subscription.id || null
  };
}

/** Format plan_period_end for Swiss/German UI copy. */
export function formatPlanPeriodEnd(iso, locale = 'de-CH') {
  if (!iso) return null;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function planIntervalLabel(interval) {
  if (interval === 'year') return 'jährlich';
  if (interval === 'month') return 'monatlich';
  return '';
}

/**
 * Human-readable Pro/Free status for Settings.
 * @param {{
 *   plan?: string,
 *   planStatus?: string,
 *   plan_status?: string,
 *   planInterval?: string | null,
 *   plan_interval?: string | null,
 *   planPeriodEnd?: string | null,
 *   plan_period_end?: string | null,
 *   planCancelAtPeriodEnd?: boolean,
 *   plan_cancel_at_period_end?: boolean,
 *   hasPro?: boolean
 * }} plan
 * @param {{ trialDays?: number, now?: number }} [opts]
 */
export function formatBillingPlanSummary(plan = {}, opts = {}) {
  const trialDays = opts.trialDays ?? TRIAL_DAYS;
  const status = String(plan.planStatus || plan.plan_status || 'none');
  const interval = plan.planInterval || plan.plan_interval || null;
  const periodEnd = plan.planPeriodEnd || plan.plan_period_end || null;
  const cancelAtPeriodEnd = Boolean(
    plan.planCancelAtPeriodEnd ?? plan.plan_cancel_at_period_end
  );
  const intervalLabel = planIntervalLabel(interval);
  const endLabel = formatPlanPeriodEnd(periodEnd);
  const hasPro =
    typeof plan.hasPro === 'boolean'
      ? plan.hasPro
      : isProEntitlement({
          plan: plan.plan,
          plan_status: status,
          plan_period_end: periodEnd
        });

  if (hasPro) {
    const bits = [];
    if (status === 'trialing') {
      bits.push('Pro Testphase');
      if (endLabel) bits.push(`endet am ${endLabel}`);
    } else if (status === 'past_due') {
      bits.push('Pro – Zahlung ausstehend');
      if (endLabel) bits.push(`Zugang bis ${endLabel}`);
    } else if (cancelAtPeriodEnd) {
      bits.push('Pro gekündigt');
      if (endLabel) bits.push(`Zugang bleibt bis ${endLabel}`);
      else bits.push('endet nach der laufenden Periode');
    } else {
      bits.push('Pro aktiv');
      if (intervalLabel) bits.push(intervalLabel);
      if (endLabel) bits.push(`verlängert sich am ${endLabel}`);
    }
    return `${bits.join(' · ')}.`;
  }

  if (status === 'canceled') {
    return endLabel
      ? `Free – Abo gekündigt (lief bis ${endLabel}).`
      : 'Free – Abo wurde gekündigt.';
  }
  if (status === 'paused') {
    return 'Free – Abo pausiert. Über «Abo verwalten» fortsetzen.';
  }
  if (status === 'unpaid' || status === 'incomplete') {
    return 'Free – Zahlung unvollständig. Bitte Abo im Kundenportal prüfen.';
  }

  return `Aktuell Free. Pro: KI + Cloud-Sync – ${trialDays} Tage testen (CHF 1.99/Mt oder CHF 10/Jahr).`;
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
 *
 * Native must use HTTPS: SFSafariViewController cannot open custom-scheme
 * success_urls (shows «server can't be found»). The hosted return page then
 * bounces into ch.hively.app:// and asks the user to close the sheet.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @param {{ native?: boolean }} [options]
 */
export function getBillingReturnUrls(env = process.env, { native = false } = {}) {
  const origin = getAppOrigin(env);
  if (native) {
    // Static page under /public — works inside Capacitor Browser (HTTPS).
    return {
      success: `${origin}/billing-return.html?view=settings&billing=success&native=1`,
      cancel: `${origin}/billing-return.html?view=settings&billing=cancel&native=1`,
      portalReturn: `${origin}/billing-return.html?view=settings&native=1`
    };
  }
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
