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

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY || '';
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST || 'https://eu.i.posthog.com';
const SESSION_REPLAY =
  String(import.meta.env.VITE_POSTHOG_SESSION_REPLAY || '').toLowerCase() === 'true';

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
  posthog.register({
    app: 'hively',
    platform: detectPlatform()
  });
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
