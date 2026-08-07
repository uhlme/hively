/**
 * Client-side Pro / Stripe helpers (soft gates + checkout).
 * Hard enforcement lives on the server (Gemini proxy + Stripe webhooks).
 */

import { Capacitor } from '@capacitor/core';
import { supabase } from './supabase.js';
import { getActiveOperationId, getActiveOperationMeta, isOperationOwner } from './operations.js';
import { isNetworkError } from './network.js';
import { isProEntitlement, TRIAL_DAYS } from '../server/billing.js';

const DEFAULT_NATIVE_ORIGIN = 'https://hivelyy.netlify.app';

/** Public flag — set VITE_BILLING_ENABLED=true when Stripe is live. */
export function isBillingEnabled() {
  const flag = String(import.meta.env.VITE_BILLING_ENABLED || '').toLowerCase();
  return flag === 'true' || flag === '1';
}

export { TRIAL_DAYS, isProEntitlement };

export function getActivePlanMeta() {
  const meta = getActiveOperationMeta();
  if (!meta) {
    return { plan: 'free', planStatus: 'none', planInterval: null, planPeriodEnd: null, hasPro: false };
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

async function authHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (!supabase) return headers;
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) {
    headers.Authorization = `Bearer ${session.access_token}`;
  }
  return headers;
}

/**
 * @param {'month' | 'year'} interval
 */
function billingNetworkError(fallback) {
  return new Error(
    `${fallback} Bitte Internet prüfen und erneut versuchen.`
  );
}

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
      body: JSON.stringify({ operationId, interval })
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
  window.location.href = data.url;
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
      body: JSON.stringify({ operationId })
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
  window.location.href = data.url;
}

export function planStatusLabel(status) {
  switch (status) {
    case 'trialing':
      return 'Testphase';
    case 'active':
      return 'Aktiv';
    case 'past_due':
      return 'Zahlung ausstehend';
    case 'canceled':
      return 'Gekündigt';
    case 'unpaid':
      return 'Unbezahlt';
    default:
      return 'Free';
  }
}
