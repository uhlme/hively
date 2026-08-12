import { Capacitor } from '@capacitor/core';
import { SignInWithApple } from '@capacitor-community/apple-sign-in';
import { supabase } from './supabase.js';

/** Bundle ID — must match Apple App ID + Supabase Apple Client IDs. */
export const APPLE_CLIENT_ID = 'ch.hively.app';

function supabaseAuthCallbackUrl() {
  const base = String(import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  return base ? `${base}/auth/v1/callback` : 'https://xvxqjkkhmybvimslylmf.supabase.co/auth/v1/callback';
}

/**
 * Native Sign in with Apple is only available on iOS (Capacitor).
 * Web OAuth would need a separate Services ID + secret rotation.
 */
export function isAppleSignInAvailable() {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
  } catch {
    return false;
  }
}

/** @param {string} value */
export async function sha256Hex(value) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function createAppleNoncePair() {
  if (typeof crypto === 'undefined' || !crypto.randomUUID || !crypto.subtle) {
    throw new Error('Secure nonce unavailable');
  }
  const rawNonce = `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, '');
  const hashedNonce = await sha256Hex(rawNonce);
  return { rawNonce, hashedNonce };
}

/**
 * Build a display name from Apple's first-login name fields.
 * @param {{ givenName?: string|null, familyName?: string|null }} parts
 */
export function appleDisplayName(parts = {}) {
  const given = (parts.givenName || '').trim();
  const family = (parts.familyName || '').trim();
  const full = [given, family].filter(Boolean).join(' ').trim();
  return full || null;
}

/**
 * Run native Apple auth and exchange the identity token with Supabase.
 * @returns {Promise<{ session: object, user: object, displayName: string|null }>}
 */
export async function signInWithAppleNative() {
  if (!supabase) {
    throw new Error('Supabase is not configured');
  }
  if (!isAppleSignInAvailable()) {
    throw new Error('Sign in with Apple is only available on iOS');
  }

  const { rawNonce, hashedNonce } = await createAppleNoncePair();

  const { response } = await SignInWithApple.authorize({
    clientId: APPLE_CLIENT_ID,
    // Required by the plugin types; unused for native ASAuthorization on iOS.
    redirectURI: supabaseAuthCallbackUrl(),
    scopes: 'email name',
    nonce: hashedNonce
  });

  if (!response?.identityToken) {
    throw new Error('Apple did not return an identity token');
  }

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: response.identityToken,
    nonce: rawNonce
  });
  if (error) throw error;
  if (!data?.user) {
    throw new Error('Apple sign-in returned no user');
  }

  const displayName = appleDisplayName({
    givenName: response.givenName,
    familyName: response.familyName
  });

  if (displayName) {
    const { error: metaErr } = await supabase.auth.updateUser({
      data: {
        display_name: displayName,
        full_name: displayName,
        given_name: response.givenName || undefined,
        family_name: response.familyName || undefined
      }
    });
    if (metaErr) console.warn('Apple display name update failed:', metaErr);
    else {
      const { error: upsertErr } = await supabase.from('profiles').upsert({
        id: data.user.id,
        display_name: displayName,
        email: data.user.email || response.email || null
      });
      if (upsertErr) console.warn('Apple profile upsert failed:', upsertErr);
    }
  }

  return { session: data.session, user: data.user, displayName };
}

/** True when the user cancelled the Apple sheet (not a real failure). */
export function isAppleSignInCancelled(err) {
  const code = err?.code ?? err?.errorCode;
  if (code === '1001' || code === 1001) return true;
  const msg = String(err?.message || err || '').toLowerCase();
  return (
    msg.includes('error 1001') ||
    /\bcancell?ed?\b/.test(msg) ||
    msg.includes('user canceled') ||
    msg.includes('user cancelled')
  );
}
