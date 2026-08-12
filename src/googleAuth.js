/**
 * Google Sign-In via Supabase OAuth (web + native Capacitor).
 * @see https://supabase.com/docs/guides/auth/social-login/auth-google
 */

import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { supabase } from './supabase.js';

const DEFAULT_NATIVE_ORIGIN = 'https://hivelyy.netlify.app';
export const NATIVE_APP_SCHEME = 'ch.hively.app';
const PENDING_GOOGLE_AUTH_KEY = 'hively_google_auth_pending';

/** Google OAuth is available whenever Supabase auth is configured. */
export function isGoogleSignInAvailable() {
  return Boolean(supabase);
}

function nativeApiOrigin() {
  if (!Capacitor.isNativePlatform()) return '';
  return (
    import.meta.env.VITE_STRIPE_API_ORIGIN ||
    import.meta.env.VITE_NATIVE_ORIGIN ||
    DEFAULT_NATIVE_ORIGIN
  );
}

/**
 * OAuth redirect target for Supabase.
 * Native uses an HTTPS bridge page that bounces into the app scheme.
 * @param {{ link?: boolean }} [options]
 */
export function getGoogleOAuthRedirectUrl({ link = false } = {}) {
  const mode = link ? 'link' : 'sign-in';
  if (Capacitor.isNativePlatform()) {
    const origin = nativeApiOrigin().replace(/\/$/, '');
    return `${origin}/auth-return.html?native=1&mode=${encodeURIComponent(mode)}`;
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/`;
  }
  return '/';
}

/**
 * Parse OAuth callback URLs (native deep link or hosted bridge).
 * @param {string} urlOrSearch
 */
export function parseAuthReturnUrl(urlOrSearch) {
  try {
    const raw = String(urlOrSearch || '');
    const url = raw.includes('://')
      ? new URL(raw)
      : new URL(raw.startsWith('?') ? `https://local.invalid/${raw}` : `https://local.invalid/${raw}`);

    const isNativeAuthHost =
      url.protocol === `${NATIVE_APP_SCHEME}:` && (url.host === 'auth' || url.pathname === '/auth');
    const isBridgePage = (url.pathname || '').includes('auth-return');

    if (!isNativeAuthHost && !isBridgePage) {
      return { isAuth: false, code: null, error: null, errorDescription: null, mode: null };
    }

    const params = new URLSearchParams(url.search);
    if (!params.get('code') && url.hash) {
      const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''));
      for (const [key, value] of hashParams.entries()) {
        if (!params.has(key)) params.set(key, value);
      }
    }

    return {
      isAuth: true,
      code: params.get('code'),
      error: params.get('error'),
      errorDescription: params.get('error_description'),
      mode: params.get('mode')
    };
  } catch {
    return { isAuth: false, code: null, error: null, errorDescription: null, mode: null };
  }
}

/** @param {'sign-in' | 'link'} mode */
export function markGoogleAuthPending(mode = 'sign-in') {
  try {
    sessionStorage.setItem(
      PENDING_GOOGLE_AUTH_KEY,
      JSON.stringify({ mode, at: Date.now() })
    );
  } catch {
    /* ignore */
  }
}

export function clearGoogleAuthPending() {
  try {
    sessionStorage.removeItem(PENDING_GOOGLE_AUTH_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * @returns {{ mode: 'sign-in' | 'link' } | null}
 */
export function consumeGoogleAuthPending({ maxAgeMs = 30 * 60 * 1000 } = {}) {
  try {
    const raw = sessionStorage.getItem(PENDING_GOOGLE_AUTH_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(PENDING_GOOGLE_AUTH_KEY);
    const parsed = JSON.parse(raw);
    if (!parsed?.at || Date.now() - parsed.at > maxAgeMs) return null;
    return { mode: parsed.mode === 'link' ? 'link' : 'sign-in' };
  } catch {
    return null;
  }
}

export async function closeGoogleAuthBrowser() {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await Browser.close();
  } catch {
    /* already closed */
  }
}

/**
 * Exchange an OAuth authorization code for a Supabase session.
 * @param {string} url
 */
export async function createSessionFromOAuthUrl(url) {
  const parsed = parseAuthReturnUrl(url);
  if (!parsed.isAuth) return { handled: false };

  if (parsed.error) {
    clearGoogleAuthPending();
    const err = new Error(parsed.errorDescription || parsed.error);
    err.code = parsed.error;
    throw err;
  }

  if (!parsed.code) {
    return { handled: false };
  }

  if (!supabase) {
    throw new Error('Supabase is not configured');
  }

  const { data, error } = await supabase.auth.exchangeCodeForSession(parsed.code);
  if (error) throw error;

  const pending = consumeGoogleAuthPending();

  return {
    handled: true,
    session: data.session,
    mode: parsed.mode || pending?.mode || 'sign-in'
  };
}

async function startGoogleOAuth({ link = false } = {}) {
  if (!supabase) {
    throw new Error('Supabase is not configured');
  }

  const redirectTo = getGoogleOAuthRedirectUrl({ link });
  const isNative = Capacitor.isNativePlatform();
  const options = {
    redirectTo,
    skipBrowserRedirect: isNative,
    queryParams: {
      access_type: 'offline',
      prompt: 'consent'
    }
  };

  markGoogleAuthPending(link ? 'link' : 'sign-in');

  let data;
  let error;

  if (link) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      clearGoogleAuthPending();
      throw new Error('Must be signed in to link Google');
    }
    ({ data, error } = await supabase.auth.linkIdentity({ provider: 'google', options }));
  } else {
    ({ data, error } = await supabase.auth.signInWithOAuth({ provider: 'google', options }));
  }

  if (error) {
    clearGoogleAuthPending();
    throw error;
  }

  if (isNative) {
    if (!data?.url) {
      clearGoogleAuthPending();
      throw new Error('Google OAuth URL missing');
    }
    await Browser.open({ url: data.url, presentationStyle: 'fullscreen' });
    return { openedBrowser: true, redirected: false, mode: link ? 'link' : 'sign-in' };
  }

  // Web: Supabase navigates away; completion arrives via detectSessionInUrl / onAuthStateChange.
  clearGoogleAuthPending();
  return { openedBrowser: false, redirected: true, mode: link ? 'link' : 'sign-in' };
}

/** Start Google OAuth sign-in (web redirect or native in-app browser). */
export async function signInWithGoogle() {
  return startGoogleOAuth({ link: false });
}

/** Link Google identity to the signed-in account. */
export async function linkGoogleIdentity() {
  return startGoogleOAuth({ link: true });
}

/** @param {Array<{ provider?: string }>|null|undefined} identities */
export function hasGoogleIdentityLinked(identities) {
  return (identities || []).some((identity) => identity?.provider === 'google');
}

/** @returns {Promise<boolean>} */
export async function isGoogleIdentityLinked() {
  if (!supabase) return false;
  const { data, error } = await supabase.auth.getUserIdentities();
  if (error) {
    console.warn('Google identity lookup failed:', error);
    return false;
  }
  return hasGoogleIdentityLinked(data?.identities);
}

/** True when the user denied OAuth or closed the flow without completing it. */
export function isGoogleSignInCancelled(err) {
  const code = String(err?.code || err?.error || '').toLowerCase();
  if (code === 'access_denied') return true;
  const msg = String(err?.message || err || '').toLowerCase();
  return (
    msg.includes('access_denied') ||
    /\bcancell?ed?\b/.test(msg) ||
    msg.includes('user closed') ||
    msg.includes('browser closed')
  );
}

/**
 * Handle native deep-link / launch URL for Google OAuth return.
 * @param {string} url
 * @param {{
 *   onAuthComplete?: (result: { mode: 'sign-in' | 'link', session: object|null }) => void | Promise<void>,
 *   onAppResume?: () => void | Promise<void>
 * }} handlers
 */
export async function handleNativeAuthOpenUrl(url, handlers = {}) {
  const parsed = parseAuthReturnUrl(url);
  if (!parsed.isAuth) {
    if (handlers.onAppResume) await handlers.onAppResume();
    return { handled: false };
  }

  await closeGoogleAuthBrowser();

  try {
    const result = await createSessionFromOAuthUrl(url);
    if (result.handled && handlers.onAuthComplete) {
      await handlers.onAuthComplete({
        mode: result.mode === 'link' ? 'link' : 'sign-in',
        session: result.session || null
      });
    }
    return { handled: result.handled, ...result };
  } catch (err) {
    clearGoogleAuthPending();
    throw err;
  }
}

/**
 * Cold-start deep link for OAuth (appUrlOpen does not fire on launch-by-URL).
 * @param {Parameters<typeof handleNativeAuthOpenUrl>[1]} handlers
 */
export async function consumeNativeAuthLaunchUrl(handlers = {}) {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const launch = await App.getLaunchUrl();
    if (!launch?.url) return null;
    return handleNativeAuthOpenUrl(launch.url, handlers);
  } catch {
    return null;
  }
}

/**
 * Wire Capacitor deep-link hooks for Google OAuth return.
 * @param {Parameters<typeof handleNativeAuthOpenUrl>[1]} handlers
 */
export async function setupNativeAuthLifecycle(handlers = {}) {
  if (!Capacitor.isNativePlatform()) return () => {};

  const unsubscribers = [];

  const appUrlSub = await App.addListener('appUrlOpen', async ({ url }) => {
    try {
      await handleNativeAuthOpenUrl(url, handlers);
    } catch (err) {
      console.warn('Native Google auth return failed:', err);
      if (handlers.onAuthError) {
        try {
          await handlers.onAuthError(err);
        } catch {
          /* ignore handler errors */
        }
      }
    }
  });
  unsubscribers.push(() => appUrlSub.remove());

  const browserSub = await Browser.addListener('browserFinished', async () => {
    // Peek only — appUrlOpen may still exchange the code after the sheet closes.
    try {
      const raw = sessionStorage.getItem(PENDING_GOOGLE_AUTH_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed?.at || Date.now() - parsed.at > 30 * 60 * 1000) {
        clearGoogleAuthPending();
        return;
      }
    } catch {
      return;
    }
    // Give the deep-link handler a moment before treating this as cancel.
    setTimeout(() => {
      const pending = consumeGoogleAuthPending();
      if (!pending) return;
      if (handlers.onAuthCancelled) {
        void handlers.onAuthCancelled(pending.mode);
      }
    }, 750);
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
