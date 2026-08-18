import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: vi.fn(() => false)
  }
}));

vi.mock('@capacitor/app', () => ({
  App: {
    addListener: vi.fn(async () => ({ remove: vi.fn() })),
    getLaunchUrl: vi.fn(async () => undefined)
  }
}));

import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import {
  setActiveOperation,
  clearActiveOperation,
  getActiveOperationId,
  getActiveOperationRole,
  isOperationOwner,
  canEditOperation,
  isOperationViewer,
  roleLabel,
  buildInviteLink,
  buildNativeJoinDeepLink,
  getPublicAppOrigin,
  parseJoinCodeFromUrl,
  resolveInviteCode,
  handleNativeJoinOpenUrl,
  getNativeLaunchJoinCode
} from '../src/operations.js';

describe('operations local active state', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('stores and clears the active Betrieb', () => {
    setActiveOperation({
      id: 'op-1',
      name: 'Imkerei Test',
      address_line: 'Weg 1',
      postal_code: '8000',
      city: 'Zürich'
    }, 'owner');

    expect(getActiveOperationId()).toBe('op-1');
    expect(getActiveOperationRole()).toBe('owner');
    expect(isOperationOwner()).toBe(true);

    clearActiveOperation();
    expect(getActiveOperationId()).toBeNull();
    expect(isOperationOwner()).toBe(false);
  });

  it('treats owner and editor as editable, viewer as read-only', () => {
    setActiveOperation({ id: 'op-1', name: 'Home' }, 'owner');
    expect(canEditOperation()).toBe(true);
    expect(isOperationViewer()).toBe(false);
    expect(roleLabel('owner')).toBe('Inhaber');

    setActiveOperation({ id: 'op-1', name: 'Home' }, 'editor');
    expect(canEditOperation()).toBe(true);
    expect(isOperationViewer()).toBe(false);
    expect(roleLabel('editor')).toBe('Mitarbeiter');

    setActiveOperation({ id: 'op-1', name: 'Home' }, 'viewer');
    expect(canEditOperation()).toBe(false);
    expect(isOperationViewer()).toBe(true);
    expect(roleLabel('viewer')).toBe('Betrachter');
  });
});

describe('invite links', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Capacitor.isNativePlatform.mockReturnValue(false);
    App.getLaunchUrl.mockResolvedValue(undefined);
  });

  it('builds a public https join page, not capacitor://localhost', () => {
    const link = buildInviteLink('ABCD2345', { href: 'capacitor://localhost/index.html' });
    expect(link).toBe('https://hivelyy.netlify.app/join.html?join=ABCD2345');
    expect(link).not.toMatch(/^capacitor:/);
  });

  it('builds a public https join page on Android Capacitor https://localhost', () => {
    const link = buildInviteLink('baadmgb34uua', { href: 'https://localhost/' });
    expect(link).toBe('https://hivelyy.netlify.app/join.html?join=BAADMGB34UUA');
  });

  it('keeps the current public https origin', () => {
    expect(getPublicAppOrigin({ href: 'https://hivelyy.netlify.app/settings' })).toBe(
      'https://hivelyy.netlify.app'
    );
    expect(buildInviteLink('ABCD2345', { href: 'https://hivelyy.netlify.app/?view=settings' })).toBe(
      'https://hivelyy.netlify.app/join.html?join=ABCD2345'
    );
  });

  it('builds a native custom-scheme deep link', () => {
    expect(buildNativeJoinDeepLink('ABCD2345')).toBe('ch.hively.app://join?join=ABCD2345');
  });

  it('parses join codes from web, native, and legacy capacitor URLs', () => {
    expect(parseJoinCodeFromUrl('https://hivelyy.netlify.app/join.html?join=BAADMGB34UUA')).toBe(
      'BAADMGB34UUA'
    );
    expect(parseJoinCodeFromUrl('https://hivelyy.netlify.app/?join=BAADMGB34UUA')).toBe('BAADMGB34UUA');
    expect(parseJoinCodeFromUrl('ch.hively.app://join?join=BAADMGB34UUA')).toBe('BAADMGB34UUA');
    expect(parseJoinCodeFromUrl('capacitor://localhost?join=BAADMGB34UUA')).toBe('BAADMGB34UUA');
    expect(parseJoinCodeFromUrl('?join=ABCD2345')).toBe('ABCD2345');
    expect(parseJoinCodeFromUrl('/join.html?join=ABCD2345')).toBe('ABCD2345');
    expect(parseJoinCodeFromUrl('/?join=ABCD2345')).toBe('ABCD2345');
    expect(parseJoinCodeFromUrl('ch.hively.app://join?code=BAADMGB34UUA')).toBe('BAADMGB34UUA');
    expect(parseJoinCodeFromUrl('ch.hively.app://auth?code=oauth-token')).toBeNull();
    expect(parseJoinCodeFromUrl('ch.hively.app://auth?code=BAADMGB34UUA')).toBeNull();
    expect(parseJoinCodeFromUrl('ch.hively.app://auth?join=BAADMGB34UUA')).toBeNull();
    expect(parseJoinCodeFromUrl('ch.hively.app://billing?billing=success')).toBeNull();
    expect(parseJoinCodeFromUrl('/notjoin.html?code=ABCD2345')).toBeNull();
  });

  it('rejects invalid codes instead of baking them into links', () => {
    expect(() => buildInviteLink('not-a-code')).toThrow('Einladungscode ungültig');
    expect(() => buildNativeJoinDeepLink('???')).toThrow('Einladungscode ungültig');
  });

  it('resolves pasted codes and full invite URLs', () => {
    expect(resolveInviteCode('baad-mgb34uua')).toBe('BAADMGB34UUA');
    expect(resolveInviteCode('capacitor://localhost?join=BAADMGB34UUA')).toBe('BAADMGB34UUA');
    expect(resolveInviteCode('https://hivelyy.netlify.app/join.html?join=ABCD2345')).toBe('ABCD2345');
    expect(resolveInviteCode('not-a-code')).toBeNull();
  });

  it('handles native join deep links and launch URLs', async () => {
    const onJoinCode = vi.fn(async () => {});
    const parsed = await handleNativeJoinOpenUrl('ch.hively.app://join?join=ABCD2345', { onJoinCode });
    expect(parsed).toEqual({ handled: true, joinCode: 'ABCD2345' });
    expect(onJoinCode).toHaveBeenCalledWith('ABCD2345');

    const ignored = await handleNativeJoinOpenUrl('ch.hively.app://billing?billing=success', {
      onJoinCode
    });
    expect(ignored).toEqual({ handled: false, joinCode: null });

    Capacitor.isNativePlatform.mockReturnValue(true);
    App.getLaunchUrl.mockResolvedValue({ url: 'ch.hively.app://join?join=ABCD2345' });
    expect(await getNativeLaunchJoinCode()).toBe('ABCD2345');
  });
});
