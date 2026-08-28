/** UTM capture + persistence for marketing attribution (PWA + static landing pages). */

export const UTM_STORAGE_KEY = 'hively_utm';
export const UTM_PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
export const PENDING_MARKETING_VIEW_KEY = 'hively_pending_marketing_view';
export const PENDING_MARKETING_CTA_KEY = 'hively_pending_marketing_cta';

/**
 * @param {string | URLSearchParams} search
 * @returns {Record<string, string> | null}
 */
export function parseUtmFromSearch(search = '') {
  const params =
    search instanceof URLSearchParams
      ? search
      : new URLSearchParams(String(search).replace(/^\?/, ''));
  /** @type {Record<string, string>} */
  const utm = {};
  for (const key of UTM_PARAMS) {
    const value = params.get(key);
    if (value) utm[key] = value.trim().slice(0, 200);
  }
  return Object.keys(utm).length ? utm : null;
}

/**
 * @returns {Record<string, string> | null}
 */
export function loadStoredUtm() {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(UTM_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    /** @type {Record<string, string>} */
    const utm = {};
    for (const key of UTM_PARAMS) {
      if (parsed[key]) utm[key] = String(parsed[key]).slice(0, 200);
    }
    return Object.keys(utm).length ? utm : null;
  } catch {
    return null;
  }
}

/**
 * @param {Record<string, string>} utm
 * @param {{ merge?: boolean }} [opts]
 * @returns {Record<string, string> | null}
 */
export function saveStoredUtm(utm, opts = {}) {
  if (!utm || typeof utm !== 'object' || typeof localStorage === 'undefined') return null;
  const merged = opts.merge === false ? { ...utm } : { ...loadStoredUtm(), ...utm };
  /** @type {Record<string, string>} */
  const filtered = {};
  for (const key of UTM_PARAMS) {
    if (merged[key]) filtered[key] = String(merged[key]).slice(0, 200);
  }
  if (!Object.keys(filtered).length) return null;
  try {
    localStorage.setItem(UTM_STORAGE_KEY, JSON.stringify(filtered));
  } catch {
    /* ignore quota / private mode */
  }
  return filtered;
}

/**
 * @param {string} [search]
 * @returns {Record<string, string> | null}
 */
export function captureUtmFromSearch(search = '') {
  const fromUrl = parseUtmFromSearch(search);
  if (fromUrl) return saveStoredUtm(fromUrl, { merge: false });
  return loadStoredUtm();
}

/**
 * @param {string} baseUrl
 * @param {Record<string, string> | null} [utm]
 * @returns {string}
 */
export function appendUtmToUrl(baseUrl, utm = loadStoredUtm()) {
  if (!utm) return baseUrl;
  try {
    const url = new URL(
      baseUrl,
      typeof window !== 'undefined' ? window.location.origin : 'https://hivelyy.netlify.app'
    );
    for (const [key, value] of Object.entries(utm)) {
      if (UTM_PARAMS.includes(key) && value) url.searchParams.set(key, value);
    }
    return url.toString();
  } catch {
    return baseUrl;
  }
}

/**
 * @param {string} page
 * @param {Record<string, string> | null} [utm]
 */
export function markPendingMarketingView(page, utm = loadStoredUtm()) {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(
      PENDING_MARKETING_VIEW_KEY,
      JSON.stringify({ page, utm, ts: Date.now() })
    );
  } catch {
    /* ignore */
  }
}

/**
 * @param {string} cta
 * @param {Record<string, string> | null} [utm]
 */
export function markPendingMarketingCta(cta, utm = loadStoredUtm()) {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(
      PENDING_MARKETING_CTA_KEY,
      JSON.stringify({ cta, utm, ts: Date.now() })
    );
  } catch {
    /* ignore */
  }
}

/** @returns {{ page: string, utm: Record<string, string> | null, ts: number } | null} */
export function consumePendingMarketingView() {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(PENDING_MARKETING_VIEW_KEY);
    sessionStorage.removeItem(PENDING_MARKETING_VIEW_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** @returns {{ cta: string, utm: Record<string, string> | null, ts: number } | null} */
export function consumePendingMarketingCta() {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(PENDING_MARKETING_CTA_KEY);
    sessionStorage.removeItem(PENDING_MARKETING_CTA_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
