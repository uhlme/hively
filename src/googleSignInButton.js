/**
 * Sign in with Google button — custom HTML per Google branding guidelines.
 * @see https://developers.google.com/identity/branding-guidelines
 */

import { escapeHtml } from './utils.js';
import { getLocale, onLocaleChange } from './i18n/index.js';

/**
 * Approved call-to-action titles (localized).
 * Only: Sign in / Sign up / Continue with Google.
 */
const GOOGLE_BUTTON_TITLES = {
  'sign-in': {
    de: 'Mit Google anmelden',
    en: 'Sign in with Google',
    fr: 'Se connecter avec Google',
    it: 'Accedi con Google'
  },
  continue: {
    de: 'Mit Google fortfahren',
    en: 'Continue with Google',
    fr: 'Continuer avec Google',
    it: 'Continua con Google'
  },
  'sign-up': {
    de: 'Mit Google registrieren',
    en: 'Sign up with Google',
    fr: 'S’inscrire avec Google',
    it: 'Registrati con Google'
  }
};

/** Official multicolor “G” on white (required by branding guidelines). */
const GOOGLE_G_LOGO = `
<svg class="gsi-button__logo" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="20" height="20" aria-hidden="true" focusable="false">
  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
  <path fill="none" d="M0 0h48v48H0z"/>
</svg>
`.trim();

/** @type {Map<HTMLElement, { cleanup: () => void, type: string, onClick?: Function }>} */
const mounts = new Map();
let globalListenersRegistered = false;

function googleButtonTitle(type) {
  const labels = GOOGLE_BUTTON_TITLES[type] || GOOGLE_BUTTON_TITLES['sign-in'];
  return labels[getLocale()] || labels.en;
}

/**
 * Light button on dark surfaces, dark button on light surfaces —
 * equal prominence with Sign in with Apple.
 */
export function googleButtonColorScheme() {
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'dark' : 'light';
}

function renderGoogleButtonMarkup(type) {
  const scheme = googleButtonColorScheme();
  const title = googleButtonTitle(type);
  // G + title as one centered group (logo_alignment=center / Google branding guidelines).
  return `
    <button type="button" class="gsi-button gsi-button--${scheme}">
      <span class="gsi-button__content">
        <span class="gsi-button__icon" aria-hidden="true">
          <span class="gsi-button__icon-bg">${GOOGLE_G_LOGO}</span>
        </span>
        <span class="gsi-button__label">${escapeHtml(title)}</span>
      </span>
    </button>
  `;
}

function registerGlobalListeners() {
  if (globalListenersRegistered) return;
  globalListenersRegistered = true;

  const remountAll = () => {
    for (const [host, entry] of mounts.entries()) {
      const { type, onClick } = entry;
      void mountGoogleSignInButton(host, { type, onClick });
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
export async function mountGoogleSignInButton(host, options = {}) {
  if (!host) return () => {};

  const { type = 'sign-in', onClick } = options;
  registerGlobalListeners();

  if (mounts.has(host)) mounts.get(host).cleanup();

  host.innerHTML = renderGoogleButtonMarkup(type);
  host.classList.add('google-sign-in-host');
  host.dataset.googleButtonType = type;
  host.hidden = false;

  const button = host.querySelector('.gsi-button');
  const handleClick = () => {
    if (host.classList.contains('is-loading')) return;
    void onClick?.();
  };

  button?.addEventListener('click', handleClick);

  const cleanup = () => {
    button?.removeEventListener('click', handleClick);
    host.replaceChildren();
    host.classList.remove('google-sign-in-host', 'is-loading');
    host.removeAttribute('aria-busy');
    delete host.dataset.googleButtonType;
    mounts.delete(host);
  };

  mounts.set(host, { cleanup, type, onClick });
  return cleanup;
}

export function unmountGoogleSignInButton(host) {
  mounts.get(host)?.cleanup();
}

export function setGoogleSignInButtonLoading(host, isLoading) {
  if (!host) return;
  host.classList.toggle('is-loading', isLoading);
  host.toggleAttribute('aria-busy', isLoading);
  const button = host.querySelector('.gsi-button');
  if (button) button.disabled = isLoading;
}

export async function withGoogleSignInButtonLoading(host, asyncFn) {
  setGoogleSignInButtonLoading(host, true);
  try {
    return await asyncFn();
  } finally {
    setGoogleSignInButtonLoading(host, false);
  }
}
