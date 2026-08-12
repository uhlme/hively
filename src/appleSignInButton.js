/**
 * Apple HIG-compliant Sign in with Apple buttons (custom layout using approved titles + logo rules).
 * @see https://developer.apple.com/design/human-interface-guidelines/sign-in-with-apple
 */

import { escapeHtml } from './utils.js';
import { getLocale, onLocaleChange } from './i18n/index.js';

const BORDER_RADIUS = 12;
const BUTTON_HEIGHT = 44;

/** Approved button titles per Apple HIG (localized). */
const APPLE_BUTTON_TITLES = {
  'sign-in': {
    de: 'Mit Apple anmelden',
    en: 'Sign in with Apple',
    fr: 'Se connecter avec Apple',
    it: 'Accedi con Apple'
  },
  continue: {
    de: 'Mit Apple fortfahren',
    en: 'Continue with Apple',
    fr: 'Continuer avec Apple',
    it: 'Continua con Apple'
  },
  'sign-up': {
    de: 'Mit Apple registrieren',
    en: 'Sign up with Apple',
    fr: 'S’inscrire avec Apple',
    it: 'Iscriviti con Apple'
  }
};

/** @type {Map<HTMLElement, { cleanup: () => void }>} */
const mounts = new Map();
let globalListenersRegistered = false;

function appleButtonTitle(type) {
  const labels = APPLE_BUTTON_TITLES[type] || APPLE_BUTTON_TITLES['sign-in'];
  return labels[getLocale()] || labels.en;
}

/** Black on light surfaces, white (+outline) on dark surfaces. */
export function appleButtonColorScheme() {
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'black' : 'white';
}

function appleLogoSvg() {
  return `<svg class="siwa-button__logo-mark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path fill="currentColor" d="M16.365 1.43c0 1.14-.493 2.27-1.177 3.08-.744.9-1.99 1.57-2.987 1.48-.152-1.08.46-2.21 1.085-2.98.75-.89 2.066-1.56 3.08-1.58zM20.8 17.19c-.64 1.47-1.42 2.93-2.57 2.93-1.15 0-1.46-.75-2.72-.75-1.27 0-1.66.77-2.71.8-1.09.04-1.92-1.1-2.56-2.56-1.39-3.19-1.54-6.94-.68-8.95.61-1.4 1.58-2.27 2.68-2.27 1.25 0 2.03.81 3.11.81 1.05 0 1.68-.81 3.13-.81 1.12 0 2.3.77 2.91 1.99-2.55 1.39-2.14 5.01.43 5.91z"/>
  </svg>`;
}

function renderAppleButtonMarkup(type) {
  const scheme = appleButtonColorScheme();
  const title = appleButtonTitle(type);
  const outlined = scheme === 'white';
  return `
    <button type="button" class="siwa-button siwa-button--${scheme}${outlined ? ' siwa-button--outlined' : ''}">
      <span class="siwa-button__logo">${appleLogoSvg()}</span>
      <span class="siwa-button__label">${escapeHtml(title)}</span>
    </button>
  `;
}

function registerGlobalListeners() {
  if (globalListenersRegistered) return;
  globalListenersRegistered = true;

  const remountAll = () => {
    for (const [host, entry] of mounts.entries()) {
      const { type, onClick } = entry;
      void mountAppleSignInButton(host, { type, onClick });
    }
  };

  onLocaleChange(remountAll);
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', remountAll);
}

/**
 * @param {HTMLElement} host
 * @param {{ type?: 'sign-in'|'sign-up'|'continue', onClick?: () => (void|Promise<void>) }} options
 * @returns {Promise<() => void>}
 */
export async function mountAppleSignInButton(host, options = {}) {
  if (!host) return () => {};

  const { type = 'sign-in', onClick } = options;
  registerGlobalListeners();

  if (mounts.has(host)) mounts.get(host).cleanup();

  host.innerHTML = renderAppleButtonMarkup(type);
  host.classList.add('apple-sign-in-host');
  host.dataset.appleButtonType = type;

  const button = host.querySelector('.siwa-button');
  const handleClick = () => {
    if (host.classList.contains('is-loading')) return;
    void onClick?.();
  };

  button?.addEventListener('click', handleClick);

  const cleanup = () => {
    button?.removeEventListener('click', handleClick);
    host.replaceChildren();
    host.classList.remove('apple-sign-in-host', 'is-loading');
    host.removeAttribute('aria-busy');
    host.style.pointerEvents = '';
    delete host.dataset.appleButtonType;
    mounts.delete(host);
  };

  mounts.set(host, { cleanup, type, onClick });
  return cleanup;
}

export function unmountAppleSignInButton(host) {
  mounts.get(host)?.cleanup();
}

export function setAppleSignInButtonLoading(host, isLoading) {
  if (!host) return;
  host.classList.toggle('is-loading', isLoading);
  host.toggleAttribute('aria-busy', isLoading);
  const button = host.querySelector('.siwa-button');
  if (button) button.disabled = isLoading;
}

export async function withAppleSignInButtonLoading(host, asyncFn) {
  setAppleSignInButtonLoading(host, true);
  try {
    return await asyncFn();
  } finally {
    setAppleSignInButtonLoading(host, false);
  }
}
