/**
 * Apple HIG-compliant Sign in with Apple buttons (custom layout using approved titles + logo rules).
 * @see https://developer.apple.com/design/human-interface-guidelines/sign-in-with-apple
 */

import { escapeHtml } from './utils.js';
import { getLocale, onLocaleChange } from './i18n/index.js';

/** Official left-aligned logo files (Apple Design Resources, 44pt medium). */
const APPLE_LOGO_ASSETS = {
  black: '/assets/sign-in-with-apple/logo-left-white-medium.svg',
  white: '/assets/sign-in-with-apple/logo-left-black-medium.svg'
};

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

function appleLogoMarkup(scheme) {
  const src = APPLE_LOGO_ASSETS[scheme] || APPLE_LOGO_ASSETS.black;
  return `<img class="siwa-button__logo-asset" src="${src}" width="31" height="44" alt="" aria-hidden="true" decoding="async">`;
}

function renderAppleButtonMarkup(type) {
  const scheme = appleButtonColorScheme();
  const title = appleButtonTitle(type);
  const outlined = scheme === 'white';
  return `
    <button type="button" class="siwa-button siwa-button--${scheme}${outlined ? ' siwa-button--outlined' : ''}">
      <span class="siwa-button__logo">${appleLogoMarkup(scheme)}</span>
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
