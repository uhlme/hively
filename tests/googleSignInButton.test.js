import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/i18n/index.js', () => ({
  getLocale: vi.fn(() => 'de'),
  onLocaleChange: vi.fn()
}));

import { getLocale } from '../src/i18n/index.js';
import {
  googleButtonColorScheme,
  mountGoogleSignInButton,
  unmountGoogleSignInButton
} from '../src/googleSignInButton.js';

describe('googleSignInButton', () => {
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

  it('renders light themed button with approved German sign-in title on dark surfaces', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);

    await mountGoogleSignInButton(host, { type: 'sign-in' });

    const btn = host.querySelector('.gsi-button');
    expect(btn).toBeTruthy();
    expect(btn.classList.contains('gsi-button--light')).toBe(true);
    expect(host.querySelector('.gsi-button__label')?.textContent).toBe('Mit Google anmelden');
    expect(host.querySelector('.gsi-button__logo')).toBeTruthy();
    expect(host.querySelector('.gsi-button__icon-bg')).toBeTruthy();
  });

  it('renders dark themed button with Continue title on light surfaces', async () => {
    mockColorScheme(true);
    const host = document.createElement('div');
    document.body.appendChild(host);

    await mountGoogleSignInButton(host, { type: 'continue' });

    const btn = host.querySelector('.gsi-button');
    expect(btn.classList.contains('gsi-button--dark')).toBe(true);
    expect(host.querySelector('.gsi-button__label')?.textContent).toBe('Mit Google fortfahren');
  });

  it('uses English approved titles', async () => {
    getLocale.mockReturnValue('en');
    const host = document.createElement('div');
    document.body.appendChild(host);

    await mountGoogleSignInButton(host, { type: 'sign-in' });
    expect(host.querySelector('.gsi-button__label')?.textContent).toBe('Sign in with Google');
  });

  it('keeps multicolor Google G paths', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    await mountGoogleSignInButton(host, { type: 'sign-in' });

    const fills = [...host.querySelectorAll('.gsi-button__logo path')]
      .map((p) => p.getAttribute('fill'))
      .filter((f) => f && f !== 'none');
    expect(fills).toEqual(expect.arrayContaining(['#EA4335', '#4285F4', '#FBBC05', '#34A853']));
  });

  it('invokes onClick handler', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const onClick = vi.fn();

    await mountGoogleSignInButton(host, { type: 'sign-in', onClick });
    host.querySelector('.gsi-button')?.click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('unmount clears host', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    await mountGoogleSignInButton(host, { type: 'sign-in' });
    unmountGoogleSignInButton(host);
    expect(host.innerHTML).toBe('');
  });

  it('exposes color scheme helper', () => {
    mockColorScheme(false);
    expect(googleButtonColorScheme()).toBe('light');
    mockColorScheme(true);
    expect(googleButtonColorScheme()).toBe('dark');
  });
});
