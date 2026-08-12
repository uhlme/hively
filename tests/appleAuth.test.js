import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: vi.fn(() => false),
    getPlatform: vi.fn(() => 'web')
  }
}));

vi.mock('@capacitor-community/apple-sign-in', () => ({
  SignInWithApple: {
    authorize: vi.fn()
  }
}));

vi.mock('../src/supabase.js', () => ({
  supabase: {
    auth: {
      signInWithIdToken: vi.fn(),
      updateUser: vi.fn()
    },
    from: vi.fn(() => ({
      upsert: vi.fn(async () => ({ error: null }))
    }))
  }
}));

import { Capacitor } from '@capacitor/core';
import { SignInWithApple } from '@capacitor-community/apple-sign-in';
import { supabase } from '../src/supabase.js';
import {
  appleDisplayName,
  createAppleNoncePair,
  isAppleSignInAvailable,
  isAppleSignInCancelled,
  sha256Hex,
  signInWithAppleNative
} from '../src/appleAuth.js';

describe('appleAuth helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Capacitor.isNativePlatform.mockReturnValue(false);
    Capacitor.getPlatform.mockReturnValue('web');
  });

  it('reports availability only on native iOS', () => {
    expect(isAppleSignInAvailable()).toBe(false);
    Capacitor.isNativePlatform.mockReturnValue(true);
    Capacitor.getPlatform.mockReturnValue('android');
    expect(isAppleSignInAvailable()).toBe(false);
    Capacitor.getPlatform.mockReturnValue('ios');
    expect(isAppleSignInAvailable()).toBe(true);
  });

  it('builds display names from Apple given/family name', () => {
    expect(appleDisplayName({ givenName: 'Ada', familyName: 'Lovelace' })).toBe('Ada Lovelace');
    expect(appleDisplayName({ givenName: 'Ada', familyName: null })).toBe('Ada');
    expect(appleDisplayName({})).toBeNull();
  });

  it('detects user cancellation', () => {
    expect(isAppleSignInCancelled({ message: 'User cancelled Apple Sign In.' })).toBe(true);
    expect(isAppleSignInCancelled({ code: 1001 })).toBe(true);
    expect(isAppleSignInCancelled({ errorCode: '1001' })).toBe(true);
    expect(isAppleSignInCancelled({ message: 'network error' })).toBe(false);
  });

  it('creates matching raw/hashed nonce pair', async () => {
    const { rawNonce, hashedNonce } = await createAppleNoncePair();
    expect(rawNonce.length).toBeGreaterThan(10);
    expect(hashedNonce).toBe(await sha256Hex(rawNonce));
    expect(hashedNonce).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rejects Apple sign-in outside native iOS', async () => {
    await expect(signInWithAppleNative()).rejects.toThrow(/only available on iOS/i);
  });

  it('exchanges Apple identity token with Supabase', async () => {
    Capacitor.isNativePlatform.mockReturnValue(true);
    Capacitor.getPlatform.mockReturnValue('ios');
    const upsert = vi.fn(async () => ({ error: null }));
    supabase.from.mockReturnValue({ upsert });
    SignInWithApple.authorize.mockResolvedValue({
      response: {
        identityToken: 'apple.jwt.token',
        givenName: 'Ada',
        familyName: 'Lovelace',
        email: 'ada@privaterelay.appleid.com',
        user: 'apple-user',
        authorizationCode: 'code'
      }
    });
    supabase.auth.signInWithIdToken.mockResolvedValue({
      data: { session: { access_token: 'x' }, user: { id: 'u1', email: 'ada@privaterelay.appleid.com' } },
      error: null
    });
    supabase.auth.updateUser.mockResolvedValue({ data: {}, error: null });

    const result = await signInWithAppleNative();
    expect(SignInWithApple.authorize).toHaveBeenCalled();
    const authorizeArgs = SignInWithApple.authorize.mock.calls[0][0];
    expect(authorizeArgs.clientId).toBe('ch.hively.app');
    expect(authorizeArgs.nonce).toMatch(/^[0-9a-f]{64}$/);

    expect(supabase.auth.signInWithIdToken).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'apple',
        token: 'apple.jwt.token',
        nonce: expect.any(String)
      })
    );
    const idTokenNonce = supabase.auth.signInWithIdToken.mock.calls[0][0].nonce;
    expect(await sha256Hex(idTokenNonce)).toBe(authorizeArgs.nonce);

    expect(supabase.auth.updateUser).toHaveBeenCalled();
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'u1', display_name: 'Ada Lovelace' })
    );
    expect(result.displayName).toBe('Ada Lovelace');
  });

  it('propagates missing identity token and auth errors', async () => {
    Capacitor.isNativePlatform.mockReturnValue(true);
    Capacitor.getPlatform.mockReturnValue('ios');
    SignInWithApple.authorize.mockResolvedValue({ response: {} });
    await expect(signInWithAppleNative()).rejects.toThrow(/identity token/i);

    SignInWithApple.authorize.mockResolvedValue({
      response: { identityToken: 'tok' }
    });
    supabase.auth.signInWithIdToken.mockResolvedValue({
      data: {},
      error: new Error('invalid_grant')
    });
    await expect(signInWithAppleNative()).rejects.toThrow(/invalid_grant/i);
  });
});
