/**
 * Lightweight i18n for Hively (de / fr / it / en).
 * Nested keys: t('settings.title'); interpolation: t('x', { n: 2 }) → "{n}" replaced.
 */
import de from './locales/de.json' with { type: 'json' };
import fr from './locales/fr.json' with { type: 'json' };
import it from './locales/it.json' with { type: 'json' };
import en from './locales/en.json' with { type: 'json' };

export const SUPPORTED_LOCALES = ['de', 'fr', 'it', 'en'];
export const DEFAULT_LOCALE = 'de';
export const LOCALE_STORAGE_KEY = 'hively_locale';

const CATALOGS = { de, fr, it, en };

const LOCALE_TAGS = {
  de: 'de-CH',
  fr: 'fr-CH',
  it: 'it-CH',
  en: 'en-CH'
};

const LANGUAGE_NAMES = {
  de: 'Deutsch',
  fr: 'Français',
  it: 'Italiano',
  en: 'English'
};

let currentLocale = DEFAULT_LOCALE;
const listeners = new Set();

function lookup(catalog, key) {
  if (!key) return undefined;
  const parts = String(key).split('.');
  let node = catalog;
  for (const part of parts) {
    if (node == null || typeof node !== 'object') return undefined;
    node = node[part];
  }
  return typeof node === 'string' ? node : undefined;
}

export function normalizeLocale(raw) {
  const s = String(raw || '')
    .trim()
    .toLowerCase()
    .replace('_', '-');
  if (SUPPORTED_LOCALES.includes(s)) return s;
  const base = s.split('-')[0];
  if (SUPPORTED_LOCALES.includes(base)) return base;
  return DEFAULT_LOCALE;
}

export function detectBrowserLocale() {
  const list =
    typeof navigator !== 'undefined'
      ? navigator.languages || [navigator.language]
      : [];
  for (const lang of list) {
    const n = normalizeLocale(lang);
    if (n !== DEFAULT_LOCALE || String(lang).toLowerCase().startsWith('de')) {
      if (SUPPORTED_LOCALES.includes(normalizeLocale(lang))) {
        return normalizeLocale(lang);
      }
    }
  }
  for (const lang of list) {
    const n = normalizeLocale(lang);
    if (SUPPORTED_LOCALES.includes(n)) return n;
  }
  return DEFAULT_LOCALE;
}

export function getLocale() {
  return currentLocale;
}

export function getLocaleTag(locale = currentLocale) {
  return LOCALE_TAGS[normalizeLocale(locale)] || LOCALE_TAGS.de;
}

export function getLanguageName(locale = currentLocale) {
  return LANGUAGE_NAMES[normalizeLocale(locale)] || LANGUAGE_NAMES.de;
}

export function t(key, params = {}, locale = currentLocale) {
  const loc = normalizeLocale(locale);
  let text = lookup(CATALOGS[loc], key);
  if (text == null && loc !== DEFAULT_LOCALE) {
    text = lookup(CATALOGS[DEFAULT_LOCALE], key);
  }
  if (text == null) text = key;
  return String(text).replace(/\{(\w+)\}/g, (_, name) =>
    params[name] != null ? String(params[name]) : `{${name}}`
  );
}

export function formatDate(isoOrDate, options = {}) {
  if (isoOrDate == null || isoOrDate === '') return '';
  const d =
    isoOrDate instanceof Date
      ? isoOrDate
      : new Date(
          String(isoOrDate).includes('T')
            ? isoOrDate
            : `${isoOrDate}T12:00:00`
        );
  if (Number.isNaN(d.getTime())) return String(isoOrDate);
  return d.toLocaleDateString(getLocaleTag(), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...options
  });
}

export function formatDateTime(isoOrDate) {
  if (isoOrDate == null || isoOrDate === '') return '';
  const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) return String(isoOrDate);
  return d.toLocaleString(getLocaleTag(), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function onLocaleChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function persistLocale(locale) {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    /* ignore */
  }
}

export function setLocale(next, { persist = true } = {}) {
  const locale = normalizeLocale(next);
  if (locale === currentLocale) {
    applyDomI18n(document);
    return locale;
  }
  currentLocale = locale;
  if (persist) persistLocale(locale);
  if (typeof document !== 'undefined') {
    document.documentElement.lang = locale;
    applyDomI18n(document);
  }
  for (const fn of listeners) {
    try {
      fn(locale);
    } catch (err) {
      console.warn('[i18n] locale listener failed', err);
    }
  }
  return locale;
}

export function initI18n() {
  let stored = null;
  try {
    stored = localStorage.getItem(LOCALE_STORAGE_KEY);
  } catch {
    /* ignore */
  }
  const locale = stored ? normalizeLocale(stored) : detectBrowserLocale();
  currentLocale = locale;
  if (!stored) persistLocale(locale);
  if (typeof document !== 'undefined') {
    document.documentElement.lang = locale;
    applyDomI18n(document);
  }
  return locale;
}

/**
 * Apply data-i18n / data-i18n-placeholder / data-i18n-title / data-i18n-aria-label
 * and data-i18n-html (trusted catalog strings only).
 */
export function applyDomI18n(root = document) {
  if (!root?.querySelectorAll) return;
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (!key) return;
    el.textContent = t(key);
  });
  root.querySelectorAll('[data-i18n-html]').forEach((el) => {
    const key = el.getAttribute('data-i18n-html');
    if (!key) return;
    el.innerHTML = t(key);
  });
  root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (!key) return;
    el.setAttribute('placeholder', t(key));
  });
  root.querySelectorAll('[data-i18n-title]').forEach((el) => {
    const key = el.getAttribute('data-i18n-title');
    if (!key) return;
    el.setAttribute('title', t(key));
  });
  root.querySelectorAll('[data-i18n-aria-label]').forEach((el) => {
    const key = el.getAttribute('data-i18n-aria-label');
    if (!key) return;
    el.setAttribute('aria-label', t(key));
  });
  root.querySelectorAll('[data-i18n-value]').forEach((el) => {
    const key = el.getAttribute('data-i18n-value');
    if (!key) return;
    el.value = t(key);
  });
}

/** Absolute legal URL for current (or given) locale. */
export function legalUrl(page, locale = currentLocale) {
  const loc = normalizeLocale(locale);
  const base = 'https://hivelyy.netlify.app';
  const path = loc === 'de' ? `/${page}/` : `/${loc}/${page}/`;
  return `${base}${path}`;
}

export function localeOptions() {
  return SUPPORTED_LOCALES.map((code) => ({
    code,
    label: LANGUAGE_NAMES[code]
  }));
}
