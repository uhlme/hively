import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: vi.fn(() => false),
    getPlatform: vi.fn(() => 'web')
  }
}));

vi.mock('@capacitor/app', () => ({
  App: {
    getLaunchUrl: vi.fn(async () => ({ url: null })),
    addListener: vi.fn(async () => ({ remove: vi.fn() }))
  }
}));

vi.mock('@capacitor/browser', () => ({
  Browser: {
    open: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    addListener: vi.fn(async () => ({ remove: vi.fn() }))
  }
}));

vi.mock('../src/supabase.js', () => ({
  supabase: {
    auth: {
      signInWithOAuth: vi.fn(),
      linkIdentity: vi.fn(),
      exchangeCodeForSession: vi.fn(),
      getSession: vi.fn(async () => ({ data: { session: { access_token: 'sess' } } })),
      getUserIdentities: vi.fn(async () => ({ data: { identities: [] }, error: null }))
    }
  }
}));

import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { supabase } from '../src/supabase.js';
import {
  clearGoogleAuthPending,
  consumeGoogleAuthPending,
  createSessionFromOAuthUrl,
  getGoogleOAuthRedirectUrl,
  hasGoogleIdentityLinked,
  isGoogleIdentityLinked,
  isGoogleSignInAvailable,
  isGoogleSignInCancelled,
  linkGoogleIdentity,
  markGoogleAuthPending,
  parseAuthReturnUrl,
  signInWithGoogle
} from '../src/googleAuth.js';

describe('googleAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Capacitor.isNativePlatform.mockReturnValue(false);
    sessionStorage.clear();
  });

  it('is available when Supabase is configured', () => {
    expect(isGoogleSignInAvailable()).toBe(true);
  });

  it('builds web redirect URL from window origin', () => {
    expect(getGoogleOAuthRedirectUrl()).toBe(`${window.location.origin}/`);
    expect(getGoogleOAuthRedirectUrl({ link: true })).toBe(`${window.location.origin}/`);
  });

  it('builds native redirect URL via HTTPS bridge', () => {
    Capacitor.isNativePlatform.mockReturnValue(true);
    expect(getGoogleOAuthRedirectUrl()).toContain('/auth-return.html?native=1&mode=sign-in');
    expect(getGoogleOAuthRedirectUrl({ link: true })).toContain('mode=link');
  });

  it('parses native auth deep links', () => {
    const parsed = parseAuthReturnUrl('ch.hively.app://auth?code=abc123&mode=sign-in');
    expect(parsed.isAuth).toBe(true);
    expect(parsed.code).toBe('abc123');
    expect(parsed.mode).toBe('sign-in');
  });

  it('parses hosted auth-return bridge URLs', () => {
    const parsed = parseAuthReturnUrl(
      'https://hivelyy.netlify.app/auth-return.html?code=xyz&mode=link'
    );
    expect(parsed.isAuth).toBe(true);
    expect(parsed.code).toBe('xyz');
    expect(parsed.mode).toBe('link');
  });

  it('ignores unrelated URLs', () => {
    expect(parseAuthReturnUrl('ch.hively.app://billing?billing=success').isAuth).toBe(false);
    expect(parseAuthReturnUrl('https://example.com/').isAuth).toBe(false);
  });

  it('tracks pending native OAuth state', () => {
    markGoogleAuthPending('link');
    expect(consumeGoogleAuthPending()).toEqual({ mode: 'link' });
    expect(consumeGoogleAuthPending()).toBeNull();
  });

  it('starts web OAuth sign-in without opening browser', async () => {
    supabase.auth.signInWithOAuth.mockResolvedValue({ data: { url: 'https://google.test' }, error: null });

    const result = await signInWithGoogle();
    expect(result.openedBrowser).toBe(false);
    expect(result.redirected).toBe(true);
    expect(supabase.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: expect.objectContaining({
        redirectTo: `${window.location.origin}/`,
        skipBrowserRedirect: false
      })
    });
    expect(Browser.open).not.toHaveBeenCalled();
  });

  it('opens in-app browser for native OAuth sign-in', async () => {
    Capacitor.isNativePlatform.mockReturnValue(true);
    supabase.auth.signInWithOAuth.mockResolvedValue({
      data: { url: 'https://accounts.google.com/o/oauth2/v2/auth' },
      error: null
    });

    const result = await signInWithGoogle();
    expect(result.openedBrowser).toBe(true);
    expect(result.redirected).toBe(false);
    expect(Browser.open).toHaveBeenCalledWith({
      url: 'https://accounts.google.com/o/oauth2/v2/auth',
      presentationStyle: 'fullscreen'
    });
  });

  it('links Google identity when session exists', async () => {
    supabase.auth.linkIdentity.mockResolvedValue({ data: { url: 'https://google.test' }, error: null });

    await linkGoogleIdentity();
    expect(supabase.auth.linkIdentity).toHaveBeenCalledWith({
      provider: 'google',
      options: expect.objectContaining({
        skipBrowserRedirect: false
      })
    });
  });

  it('rejects linking without active session', async () => {
    supabase.auth.getSession.mockResolvedValueOnce({ data: { session: null } });
    await expect(linkGoogleIdentity()).rejects.toThrow(/signed in/i);
  });

  it('exchanges OAuth code for session', async () => {
    supabase.auth.exchangeCodeForSession.mockResolvedValue({
      data: { session: { access_token: 'new' } },
      error: null
    });
    markGoogleAuthPending('sign-in');

    const result = await createSessionFromOAuthUrl('ch.hively.app://auth?code=oauth-code&mode=sign-in');
    expect(result.handled).toBe(true);
    expect(result.session.access_token).toBe('new');
    expect(supabase.auth.exchangeCodeForSession).toHaveBeenCalledWith('oauth-code');
  });

  it('detects linked Google identities', () => {
    expect(hasGoogleIdentityLinked([])).toBe(false);
    expect(hasGoogleIdentityLinked([{ provider: 'email' }])).toBe(false);
    expect(hasGoogleIdentityLinked([{ provider: 'google' }])).toBe(true);
  });

  it('checks linked Google identity via Supabase', async () => {
    supabase.auth.getUserIdentities.mockResolvedValue({
      data: { identities: [{ provider: 'google' }] },
      error: null
    });
    await expect(isGoogleIdentityLinked()).resolves.toBe(true);
  });

  it('detects user cancellation', () => {
    expect(isGoogleSignInCancelled({ code: 'access_denied' })).toBe(true);
    expect(isGoogleSignInCancelled({ message: 'User cancelled login' })).toBe(true);
    expect(isGoogleSignInCancelled({ message: 'network error' })).toBe(false);
  });

  it('clears pending state explicitly', () => {
    markGoogleAuthPending('sign-in');
    clearGoogleAuthPending();
    expect(consumeGoogleAuthPending()).toBeNull();
  });
});
