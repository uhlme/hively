/**
 * Optional PostHog analytics (client-side).
 * Absent `VITE_POSTHOG_KEY` → all helpers no-op (local-first friendly).
 *
 * Privacy defaults for CH/EU:
 * - EU ingest host by default
 * - no autocapture / automatic pageviews
 * - no session replay unless explicitly enabled
 * - identify only with stable user id (no email in person props)
 */

import posthog from 'posthog-js';
import {
  captureUtmFromSearch,
  consumePendingMarketingCta,
  consumePendingMarketingView,
  parseUtmFromSearch
} from './utm.js';

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY || '';
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST || 'https://eu.i.posthog.com';
const SESSION_REPLAY =
  String(import.meta.env.VITE_POSTHOG_SESSION_REPLAY || '').toLowerCase() === 'true';
const PENDING_AUTH_PROVIDER_KEY = 'hively_pending_auth_provider';

/** @typedef {'email' | 'google' | 'apple' | 'unknown'} AuthProvider */

let ready = false;

export function isAnalyticsEnabled() {
  return Boolean(POSTHOG_KEY);
}

/**
 * Init once at app start. Safe to call when key is missing.
 */
export function initAnalytics() {
  if (!POSTHOG_KEY || ready) return;

  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    person_profiles: 'identified_only',
    capture_pageview: false,
    capture_pageleave: true,
    autocapture: false,
    persistence: 'localStorage+',
    disable_session_recording: !SESSION_REPLAY,
    session_recording: SESSION_REPLAY
      ? { maskAllInputs: true, maskTextSelector: '*' }
      : undefined,
    loaded: (ph) => {
      // Avoid noisy debug in production builds
      if (import.meta.env.DEV) ph.debug(false);
    }
  });

  ready = true;

  // Lightweight context for all subsequent events
  const utm =
    typeof window !== 'undefined'
      ? captureUtmFromSearch(window.location.search)
      : null;

  posthog.register({
    app: 'hively',
    platform: detectPlatform(),
    environment: detectTestTraffic() ? 'development' : 'production',
    ...(detectTestTraffic() ? { is_test_traffic: true } : {}),
    ...(utm || {})
  });

  flushPendingMarketingEvents(utm);
}

function flushPendingMarketingEvents(utm) {
  const pendingView = consumePendingMarketingView();
  if (pendingView) {
    posthog.capture('marketing_landing_view', {
      page: pendingView.page || 'unknown',
      ...(pendingView.utm || utm || {})
    });
  }

  const pendingCta = consumePendingMarketingCta();
  if (pendingCta) {
    posthog.capture('marketing_cta_click', {
      cta: pendingCta.cta || 'unknown',
      ...(pendingCta.utm || utm || {})
    });
  }

  if (
    !pendingView &&
    utm &&
    typeof window !== 'undefined' &&
    parseUtmFromSearch(window.location.search)
  ) {
    posthog.capture('marketing_attribution', { entry: 'app', ...utm });
  }
}

function detectTestTraffic() {
  if (import.meta.env.DEV) return true;
  if (String(import.meta.env.VITE_POSTHOG_TEST_MODE || '').toLowerCase() === 'true') {
    return true;
  }
  try {
    const host = window.location?.hostname || '';
    if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local')) {
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

function detectPlatform() {
  try {
    if (window.Capacitor?.isNativePlatform?.()) return 'ios';
  } catch {
    /* ignore */
  }
  try {
    if (window.matchMedia?.('(display-mode: standalone)')?.matches) return 'pwa';
  } catch {
    /* ignore */
  }
  return 'web';
}

/**
 * SPA view change → PostHog $pageview
 * @param {string} viewName
 */
export function trackPageView(viewName) {
  if (!ready) return;
  const path = `/${viewName || 'dashboard'}`;
  posthog.capture('$pageview', {
    view: viewName || 'dashboard',
    $current_url: typeof window !== 'undefined' ? `${window.location.origin}${path}` : path,
    path
  });
}

/**
 * @param {string} event
 * @param {Record<string, unknown>} [properties]
 */
export function trackEvent(event, properties = {}) {
  if (!ready || !event) return;
  posthog.capture(event, properties);
}

/**
 * Remember auth method before redirect/password sign-in (consumed on SIGNED_IN).
 * @param {AuthProvider | string} provider
 */
export function markPendingAuthProvider(provider) {
  if (!provider || typeof sessionStorage === 'undefined') return;
  sessionStorage.setItem(PENDING_AUTH_PROVIDER_KEY, provider);
}

/** Clear stale pending provider after failed or cancelled auth attempts. */
export function clearPendingAuthProvider() {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.removeItem(PENDING_AUTH_PROVIDER_KEY);
}

/** @returns {string | null} */
export function consumePendingAuthProvider() {
  if (typeof sessionStorage === 'undefined') return null;
  const provider = sessionStorage.getItem(PENDING_AUTH_PROVIDER_KEY);
  sessionStorage.removeItem(PENDING_AUTH_PROVIDER_KEY);
  return provider;
}

/**
 * Resolve Supabase auth provider for analytics (no PII).
 * @param {{ identities?: Array<{ provider?: string }> } | null | undefined} user
 * @param {string | null | undefined} pendingProvider
 * @returns {AuthProvider | string}
 */
export function resolveAuthProvider(user, pendingProvider) {
  if (pendingProvider) return pendingProvider;
  const identityProvider = user?.identities?.find((identity) => identity?.provider)?.provider;
  if (identityProvider === 'google') return 'google';
  if (identityProvider === 'apple') return 'apple';
  if (identityProvider === 'email') return 'email';
  return identityProvider || 'unknown';
}

/**
 * @param {AuthProvider | string} provider
 */
export function trackAuthSignedIn(provider = 'unknown') {
  trackEvent('auth_signed_in', { provider });
}

/**
 * Link analytics identity to Supabase user id (no email).
 * @param {{ id: string } | null | undefined} user
 */
export function identifyUser(user) {
  if (!ready) return;
  if (user?.id) {
    posthog.identify(user.id);
  }
}

export function resetAnalyticsUser() {
  if (!ready) return;
  posthog.reset();
}

/**
 * Capture an uncaught / unexpected error (PostHog exception event).
 * @param {unknown} error
 * @param {Record<string, unknown>} [properties]
 */
export function captureException(error, properties = {}) {
  if (!ready) return;
  const message =
    error instanceof Error
      ? error.message || error.name || 'Error'
      : String(error || 'Unknown error');
  const stack = error instanceof Error ? error.stack || '' : '';
  posthog.capture('$exception', {
    $exception_message: message,
    $exception_type: error instanceof Error ? error.name || 'Error' : 'Error',
    $exception_stack_trace_raw: stack,
    ...properties
  });
}

/**
 * Remember + forward window errors / unhandled rejections to PostHog.
 * Safe no-op when analytics is disabled (still records last error via onError).
 * @param {{ onError?: (error: unknown) => void }} [opts]
 */
export function installGlobalErrorHandlers(opts = {}) {
  if (typeof window === 'undefined') return;
  if (window.__hivelyErrorHandlersInstalled) return;
  window.__hivelyErrorHandlersInstalled = true;

  window.addEventListener('error', (event) => {
    const err = event.error || event.message || 'window.error';
    try {
      opts.onError?.(err);
    } catch {
      /* ignore */
    }
    captureException(err, { source: 'window.error' });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const err = event.reason || 'unhandledrejection';
    try {
      opts.onError?.(err);
    } catch {
      /* ignore */
    }
    captureException(err, { source: 'unhandledrejection' });
  });
}
