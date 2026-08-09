/**
 * Client-side Pro / Stripe helpers (soft gates + checkout).
 * Hard enforcement lives on the server (Gemini proxy + Stripe webhooks).
 */

import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { supabase } from './supabase.js';
import { getActiveOperationId, getActiveOperationMeta, isOperationOwner } from './operations.js';
import { isNetworkError } from './network.js';
import {
  formatBillingPlanSummary,
  formatPlanPeriodEnd,
  isProEntitlement,
  TRIAL_DAYS
} from '../server/billing.js';
import { formatDate, getLocaleTag, t } from './i18n/index.js';

const DEFAULT_NATIVE_ORIGIN = 'https://hivelyy.netlify.app';
const PENDING_CHECKOUT_KEY = 'hively_billing_checkout_pending';

/** Public flag — set VITE_BILLING_ENABLED=true when Stripe is live. */
export function isBillingEnabled() {
  const flag = String(import.meta.env.VITE_BILLING_ENABLED || '').toLowerCase();
  return flag === 'true' || flag === '1';
}

export { TRIAL_DAYS, isProEntitlement, formatBillingPlanSummary };

/** Localized Settings summary (client). Server helper stays German for unit tests. */
export function formatLocalizedBillingSummary(plan = {}) {
  const status = String(plan.planStatus || 'none');
  const interval = plan.planInterval || null;
  const endLabel = plan.planPeriodEnd
    ? formatDate(plan.planPeriodEnd) || formatPlanPeriodEnd(plan.planPeriodEnd, getLocaleTag())
    : null;
  const cancelAtPeriodEnd = Boolean(plan.planCancelAtPeriodEnd);
  const sep = t('billing.separator');
  const intervalLabel =
    interval === 'year'
      ? t('billing.intervalYear')
      : interval === 'month'
        ? t('billing.intervalMonth')
        : '';

  if (plan.hasPro) {
    const bits = [];
    if (cancelAtPeriodEnd) {
      if (status === 'trialing') bits.push(t('billing.proTrialCanceled'));
      else if (status === 'past_due') bits.push(t('billing.proCanceledPastDue'));
      else bits.push(t('billing.proCanceled'));
      if (endLabel) bits.push(t('billing.accessUntil', { date: endLabel }));
      else bits.push(t('billing.endsAfterPeriod'));
    } else if (status === 'trialing') {
      bits.push(t('billing.proTrial'));
      if (endLabel) bits.push(t('billing.endsOn', { date: endLabel }));
    } else if (status === 'past_due') {
      bits.push(t('billing.proPastDue'));
      if (endLabel) bits.push(t('billing.accessUntilShort', { date: endLabel }));
    } else {
      bits.push(t('billing.proActive'));
      if (intervalLabel) bits.push(intervalLabel);
      if (endLabel) bits.push(t('billing.renewsOn', { date: endLabel }));
    }
    return `${bits.join(sep)}.`;
  }

  if (status === 'canceled') {
    return endLabel
      ? t('billing.freeCanceledWithDate', { date: endLabel })
      : t('billing.freeCanceled');
  }
  if (status === 'paused') return t('billing.freePaused');
  if (status === 'unpaid' || status === 'incomplete') return t('billing.freeUnpaid');
  return t('billing.freeDefault', { trialDays: TRIAL_DAYS });
}

export function getActivePlanMeta() {
  const meta = getActiveOperationMeta();
  if (!meta) {
    return {
      plan: 'free',
      planStatus: 'none',
      planInterval: null,
      planPeriodEnd: null,
      planCancelAtPeriodEnd: false,
      hasPro: false
    };
  }
  const row = {
    plan: meta.plan || 'free',
    plan_status: meta.planStatus || meta.plan_status || 'none',
    plan_period_end: meta.planPeriodEnd || meta.plan_period_end || null
  };
  return {
    plan: row.plan,
    planStatus: row.plan_status,
    planInterval: meta.planInterval || meta.plan_interval || null,
    planPeriodEnd: row.plan_period_end,
    planCancelAtPeriodEnd: Boolean(
      meta.planCancelAtPeriodEnd ?? meta.plan_cancel_at_period_end
    ),
    hasPro: isProEntitlement(row)
  };
}

/**
 * Soft gate: when billing is disabled (dev), treat as unlocked.
 */
export function hasProAccess() {
  if (!isBillingEnabled()) return true;
  return getActivePlanMeta().hasPro;
}

function stripeApiBase() {
  if (Capacitor.isNativePlatform()) {
    return import.meta.env.VITE_STRIPE_API_ORIGIN || DEFAULT_NATIVE_ORIGIN;
  }
  return '';
}

function billingReturnTarget() {
  return Capacitor.isNativePlatform() ? 'native' : 'web';
}

/** Mark that native Checkout/Portal was opened — used when the Browser sheet closes. */
export function markBillingCheckoutPending(kind = 'checkout') {
  try {
    sessionStorage.setItem(
      PENDING_CHECKOUT_KEY,
      JSON.stringify({ kind, at: Date.now() })
    );
  } catch {
    /* ignore */
  }
}

export function clearBillingCheckoutPending() {
  try {
    sessionStorage.removeItem(PENDING_CHECKOUT_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * @returns {'checkout' | 'portal' | null}
 */
export function consumeBillingCheckoutPending({ maxAgeMs = 30 * 60 * 1000 } = {}) {
  try {
    const raw = sessionStorage.getItem(PENDING_CHECKOUT_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(PENDING_CHECKOUT_KEY);
    const parsed = JSON.parse(raw);
    if (!parsed?.at || Date.now() - parsed.at > maxAgeMs) return null;
    return parsed.kind === 'portal' ? 'portal' : 'checkout';
  } catch {
    return null;
  }
}

async function authHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (!supabase) return headers;
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) {
    headers.Authorization = `Bearer ${session.access_token}`;
  }
  return headers;
}

function billingNetworkError(fallback) {
  return new Error(
    `${fallback} Bitte Internet prüfen und erneut versuchen.`
  );
}

/**
 * Open Stripe Checkout / Portal without navigating the Capacitor WebView away.
 * Web keeps a full-page redirect; native uses SFSafariViewController / Custom Tabs.
 * @param {string} url
 */
export async function openBillingUrl(url) {
  if (!url) throw new Error('Keine URL erhalten.');
  if (Capacitor.isNativePlatform()) {
    await Browser.open({ url, presentationStyle: 'fullscreen' });
    return;
  }
  window.location.href = url;
}

/** Close the in-app browser after a deep-link return (no-op on web). */
export async function closeBillingBrowser() {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await Browser.close();
  } catch {
    /* already closed */
  }
}

/**
 * @param {'month' | 'year'} interval
 */
export async function startProCheckout(interval = 'year') {
  const operationId = getActiveOperationId();
  if (!operationId) {
    throw new Error('Bitte zuerst einen Betrieb anlegen.');
  }
  if (!isOperationOwner()) {
    throw new Error('Nur der Betriebsinhaber kann Pro aktivieren.');
  }

  let response;
  try {
    response = await fetch(`${stripeApiBase()}/api/stripe/checkout`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({
        operationId,
        interval,
        returnTarget: billingReturnTarget()
      })
    });
  } catch (err) {
    if (isNetworkError(err)) {
      throw billingNetworkError('Checkout konnte nicht gestartet werden.');
    }
    throw err;
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || `Checkout fehlgeschlagen (${response.status})`);
  }
  if (!data?.url) throw new Error('Keine Checkout-URL erhalten.');
  markBillingCheckoutPending('checkout');
  await openBillingUrl(data.url);
}

export async function openBillingPortal() {
  const operationId = getActiveOperationId();
  if (!operationId) throw new Error('Kein aktiver Betrieb.');
  if (!isOperationOwner()) {
    throw new Error('Nur der Betriebsinhaber kann das Abo verwalten.');
  }

  let response;
  try {
    response = await fetch(`${stripeApiBase()}/api/stripe/portal`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({
        operationId,
        returnTarget: billingReturnTarget()
      })
    });
  } catch (err) {
    if (isNetworkError(err)) {
      throw billingNetworkError('Abo-Verwaltung konnte nicht geöffnet werden.');
    }
    throw err;
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || `Portal fehlgeschlagen (${response.status})`);
  }
  if (!data?.url) throw new Error('Keine Portal-URL erhalten.');
  markBillingCheckoutPending('portal');
  await openBillingUrl(data.url);
}

/**
 * Parse Stripe return deep links / query params.
 * @param {string} urlOrSearch
 * @returns {{ billing: 'success' | 'cancel' | null, view: string | null }}
 */
export function parseBillingReturnUrl(urlOrSearch) {
  try {
    const raw = String(urlOrSearch || '');
    const url = raw.includes('://')
      ? new URL(raw)
      : new URL(raw.startsWith('?') ? `https://local.invalid/${raw}` : `https://local.invalid/${raw}`);
    const billing = url.searchParams.get('billing');
    const view = url.searchParams.get('view');
    return {
      billing: billing === 'success' || billing === 'cancel' ? billing : null,
      view: view || null
    };
  } catch {
    return { billing: null, view: null };
  }
}

/**
 * Handle a deep-link / launch URL for billing return.
 * @param {string} url
 * @param {{
 *   onBillingReturn?: (result: 'success' | 'cancel') => void | Promise<void>,
 *   onAppResume?: () => void | Promise<void>
 * }} handlers
 */
export async function handleNativeBillingOpenUrl(url, handlers = {}) {
  const parsed = parseBillingReturnUrl(url);
  await closeBillingBrowser();
  if (parsed.billing && handlers.onBillingReturn) {
    await handlers.onBillingReturn(parsed.billing);
    return parsed;
  }
  if (handlers.onAppResume) {
    await handlers.onAppResume();
  }
  return parsed;
}

/**
 * Cold-start deep link (appUrlOpen does not fire when the app is launched by URL).
 * Call after auth/Betrieb bootstrap so billing refresh has a session.
 * @param {{
 *   onBillingReturn?: (result: 'success' | 'cancel') => void | Promise<void>,
 *   onAppResume?: () => void | Promise<void>
 * }} handlers
 */
export async function consumeNativeBillingLaunchUrl(handlers = {}) {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const launch = await App.getLaunchUrl();
    if (!launch?.url) return null;
    return handleNativeBillingOpenUrl(launch.url, handlers);
  } catch {
    return null;
  }
}

/**
 * Wire Capacitor deep-link + resume hooks for Pro entitlement refresh.
 * @param {{
 *   onBillingReturn: (result: 'success' | 'cancel') => void | Promise<void>,
 *   onAppResume: () => void | Promise<void>,
 *   onBrowserFinished?: () => void | Promise<void>
 * }} handlers
 */
export async function setupNativeBillingLifecycle(handlers = {}) {
  if (!Capacitor.isNativePlatform()) return () => {};

  const unsubscribers = [];

  const appUrlSub = await App.addListener('appUrlOpen', async ({ url }) => {
    await handleNativeBillingOpenUrl(url, handlers);
  });
  unsubscribers.push(() => appUrlSub.remove());

  const stateSub = await App.addListener('appStateChange', async ({ isActive }) => {
    if (isActive && handlers.onAppResume) {
      await handlers.onAppResume();
    }
  });
  unsubscribers.push(() => stateSub.remove());

  const browserSub = await Browser.addListener('browserFinished', async () => {
    // Prefer pending-checkout handling (HTTPS return page + user closed sheet)
    // over a soft resume refresh when we just came back from Stripe.
    if (handlers.onBrowserFinished) {
      await handlers.onBrowserFinished();
    } else if (handlers.onAppResume) {
      await handlers.onAppResume();
    }
  });
  unsubscribers.push(() => browserSub.remove());

  return () => {
    for (const off of unsubscribers) {
      try {
        off();
      } catch {
        /* ignore */
      }
    }
  };
}
