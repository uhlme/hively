import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/i18n/index.js', () => ({
  getLocale: vi.fn(() => 'de'),
  onLocaleChange: vi.fn()
}));

import { getLocale } from '../src/i18n/index.js';
import {
  appleButtonColorScheme,
  mountAppleSignInButton,
  unmountAppleSignInButton
} from '../src/appleSignInButton.js';

describe('appleSignInButton', () => {
  function mockColorScheme(isLight) {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: vi.fn(() => ({
        matches: isLight,
        addEventListener: vi.fn()
      }))
    });
  }

  beforeEach(() => {
    document.body.innerHTML = '';
    getLocale.mockReturnValue('de');
    mockColorScheme(false);
  });

  it('renders approved German sign-in title on dark theme (white button)', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);

    await mountAppleSignInButton(host, { type: 'sign-in' });

    const btn = host.querySelector('.siwa-button');
    expect(btn).toBeTruthy();
    expect(btn.classList.contains('siwa-button--white')).toBe(true);
    expect(btn.classList.contains('siwa-button--outlined')).toBe(true);
    expect(host.querySelector('.siwa-button__label')?.textContent).toBe('Mit Apple anmelden');
    expect(host.querySelector('.siwa-button__logo-asset')).toBeTruthy();
    expect(host.querySelector('.siwa-button__logo-asset')?.getAttribute('src')).toContain('logo-left-black-medium.svg');
  });

  it('renders black button on light theme', async () => {
    mockColorScheme(true);
    const host = document.createElement('div');
    document.body.appendChild(host);

    await mountAppleSignInButton(host, { type: 'continue' });

    const btn = host.querySelector('.siwa-button');
    expect(btn.classList.contains('siwa-button--black')).toBe(true);
    expect(host.querySelector('.siwa-button__label')?.textContent).toBe('Mit Apple fortfahren');
    expect(host.querySelector('.siwa-button__logo-asset')?.getAttribute('src')).toContain('logo-left-white-medium.svg');
  });

  it('uses English approved titles', async () => {
    getLocale.mockReturnValue('en');
    const host = document.createElement('div');
    document.body.appendChild(host);

    await mountAppleSignInButton(host, { type: 'sign-in' });
    expect(host.querySelector('.siwa-button__label')?.textContent).toBe('Sign in with Apple');
  });

  it('invokes onClick handler', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const onClick = vi.fn();

    await mountAppleSignInButton(host, { type: 'sign-in', onClick });
    host.querySelector('.siwa-button')?.click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('unmount clears host', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    await mountAppleSignInButton(host, { type: 'sign-in' });
    unmountAppleSignInButton(host);
    expect(host.innerHTML).toBe('');
  });

  it('exposes color scheme helper', () => {
    mockColorScheme(false);
    expect(appleButtonColorScheme()).toBe('white');
    mockColorScheme(true);
    expect(appleButtonColorScheme()).toBe('black');
  });
});
