/**
 * Google Sign-In via Supabase OAuth (web + native Capacitor).
 * @see https://supabase.com/docs/guides/auth/social-login/auth-google
 */

import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { supabase } from './supabase.js';
import { markPendingAuthProvider, clearPendingAuthProvider } from './analytics.js';

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

/** @returns {string} */
export function createGoogleOAuthHandoffId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `h-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * OAuth redirect target for Supabase.
 * Native uses an HTTPS bridge that stores the code server-side (handoff) and
 * best-effort bounces into the app scheme — Custom Tabs often block deep links.
 * @param {{ link?: boolean, handoffId?: string|null }} [options]
 */
export function getGoogleOAuthRedirectUrl({ link = false, handoffId = null } = {}) {
  const mode = link ? 'link' : 'sign-in';
  if (Capacitor.isNativePlatform()) {
    const origin = nativeApiOrigin().replace(/\/$/, '');
    const params = new URLSearchParams({
      native: '1',
      mode
    });
    if (handoffId) params.set('h', handoffId);
    return `${origin}/auth-return.html?${params.toString()}`;
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
      return { isAuth: false, code: null, error: null, errorDescription: null, mode: null, handoffId: null };
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
      mode: params.get('mode'),
      handoffId: params.get('h')
    };
  } catch {
    return { isAuth: false, code: null, error: null, errorDescription: null, mode: null, handoffId: null };
  }
}

/**
 * @param {'sign-in' | 'link'} mode
 * @param {{ handoffId?: string|null }} [extra]
 */
export function markGoogleAuthPending(mode = 'sign-in', { handoffId = null } = {}) {
  try {
    sessionStorage.setItem(
      PENDING_GOOGLE_AUTH_KEY,
      JSON.stringify({ mode, at: Date.now(), handoffId: handoffId || null })
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
 * @returns {{ mode: 'sign-in' | 'link', handoffId: string|null } | null}
 */
export function peekGoogleAuthPending({ maxAgeMs = 30 * 60 * 1000 } = {}) {
  try {
    const raw = sessionStorage.getItem(PENDING_GOOGLE_AUTH_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.at || Date.now() - parsed.at > maxAgeMs) return null;
    return {
      mode: parsed.mode === 'link' ? 'link' : 'sign-in',
      handoffId: typeof parsed.handoffId === 'string' ? parsed.handoffId : null
    };
  } catch {
    return null;
  }
}

/**
 * @returns {{ mode: 'sign-in' | 'link', handoffId: string|null } | null}
 */
export function consumeGoogleAuthPending({ maxAgeMs = 30 * 60 * 1000 } = {}) {
  const pending = peekGoogleAuthPending({ maxAgeMs });
  clearGoogleAuthPending();
  return pending;
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
 * Claim a code stored by auth-return.html when the deep link bounce failed.
 * @param {string} handoffId
 * @returns {Promise<{ code: string, mode: 'sign-in'|'link' }|null>}
 */
export async function claimGoogleOAuthHandoff(handoffId) {
  const id = String(handoffId || '').trim();
  if (!id) return null;
  const origin = (nativeApiOrigin() || DEFAULT_NATIVE_ORIGIN).replace(/\/$/, '');
  const url = `${origin}/api/oauth-handoff?id=${encodeURIComponent(id)}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store'
  });
  if (!res.ok) return null;
  const body = await res.json().catch(() => null);
  const code = typeof body?.code === 'string' ? body.code.trim() : '';
  if (!code) return null;
  return { code, mode: body?.mode === 'link' ? 'link' : 'sign-in' };
}

/**
 * @param {string} code
 * @param {'sign-in'|'link'|null} [mode]
 */
async function exchangeOAuthCode(code, mode = null) {
  if (!supabase) {
    throw new Error('Supabase is not configured');
  }
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) throw error;
  const pending = consumeGoogleAuthPending();
  return {
    handled: true,
    session: data.session,
    mode: mode === 'link' || mode === 'sign-in' ? mode : pending?.mode || 'sign-in'
  };
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

  return exchangeOAuthCode(parsed.code, parsed.mode === 'link' ? 'link' : parsed.mode === 'sign-in' ? 'sign-in' : null);
}

/**
 * After Custom Tabs closes: claim server handoff if deep link never arrived.
 * @param {Parameters<typeof handleNativeAuthOpenUrl>[1]} handlers
 */
export async function completeGoogleAuthFromHandoff(handlers = {}) {
  const pending = peekGoogleAuthPending();
  if (!pending?.handoffId) return { handled: false };

  const claimed = await claimGoogleOAuthHandoff(pending.handoffId);
  if (!claimed?.code) return { handled: false };

  try {
    const result = await exchangeOAuthCode(claimed.code, claimed.mode);
    if (result.handled && handlers.onAuthComplete) {
      await handlers.onAuthComplete({
        mode: result.mode === 'link' ? 'link' : 'sign-in',
        session: result.session || null
      });
    }
    return result;
  } catch (err) {
    clearGoogleAuthPending();
    clearPendingAuthProvider();
    throw err;
  }
}

async function startGoogleOAuth({ link = false } = {}) {
  if (!supabase) {
    throw new Error('Supabase is not configured');
  }

  const isNative = Capacitor.isNativePlatform();
  const handoffId = isNative ? createGoogleOAuthHandoffId() : null;
  const redirectTo = getGoogleOAuthRedirectUrl({ link, handoffId });
  const options = {
    redirectTo,
    skipBrowserRedirect: isNative,
    queryParams: {
      access_type: 'offline',
      prompt: 'consent'
    }
  };

  markGoogleAuthPending(link ? 'link' : 'sign-in', { handoffId });
  if (!link) {
    markPendingAuthProvider('google');
  }

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
    clearPendingAuthProvider();
    throw error;
  }

  if (isNative) {
    if (!data?.url) {
      clearGoogleAuthPending();
      clearPendingAuthProvider();
      throw new Error('Google OAuth URL missing');
    }
    await Browser.open({ url: data.url, presentationStyle: 'fullscreen' });
    return { openedBrowser: true, redirected: false, mode: link ? 'link' : 'sign-in', handoffId };
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
 *   onAuthError?: (err: Error) => void | Promise<void>,
 *   onAuthCancelled?: (mode: 'sign-in'|'link') => void | Promise<void>,
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
    clearPendingAuthProvider();
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
  let handoffAttempted = false;

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
    const pending = peekGoogleAuthPending();
    if (!pending) return;

    // Prefer server handoff: Custom Tabs often never deliver the deep link.
    setTimeout(async () => {
      if (!peekGoogleAuthPending()) return;
      if (handoffAttempted) return;
      handoffAttempted = true;
      try {
        const result = await completeGoogleAuthFromHandoff(handlers);
        if (result.handled) return;
      } catch (err) {
        console.warn('Google OAuth handoff claim failed:', err);
        if (handlers.onAuthError) {
          try {
            await handlers.onAuthError(err);
          } catch {
            /* ignore */
          }
        }
        return;
      }

      // Still pending and no handoff → user cancelled / closed early.
      const leftover = consumeGoogleAuthPending();
      if (!leftover) return;
      if (handlers.onAuthCancelled) {
        clearPendingAuthProvider();
        void handlers.onAuthCancelled(leftover.mode);
      }
    }, 900);
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
