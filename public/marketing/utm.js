/**
 * UTM helpers for static marketing pages (landing, flyer preview).
 * Keep in sync with src/utm.js storage keys and param names.
 */
(function initHivelyUtm(global) {
  const UTM_STORAGE_KEY = 'hively_utm';
  const UTM_PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
  const PENDING_MARKETING_VIEW_KEY = 'hively_pending_marketing_view';
  const PENDING_MARKETING_CTA_KEY = 'hively_pending_marketing_cta';

  function parseUtmFromSearch(search) {
    const params = new URLSearchParams(String(search || '').replace(/^\?/, ''));
    const utm = {};
    for (const key of UTM_PARAMS) {
      const value = params.get(key);
      if (value) utm[key] = value.trim().slice(0, 200);
    }
    return Object.keys(utm).length ? utm : null;
  }

  function loadStoredUtm() {
    try {
      const raw = localStorage.getItem(UTM_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      const utm = {};
      for (const key of UTM_PARAMS) {
        if (parsed[key]) utm[key] = String(parsed[key]).slice(0, 200);
      }
      return Object.keys(utm).length ? utm : null;
    } catch {
      return null;
    }
  }

  function saveStoredUtm(utm, merge) {
    if (!utm || typeof utm !== 'object') return null;
    const merged = merge === false ? { ...utm } : { ...loadStoredUtm(), ...utm };
    const filtered = {};
    for (const key of UTM_PARAMS) {
      if (merged[key]) filtered[key] = String(merged[key]).slice(0, 200);
    }
    if (!Object.keys(filtered).length) return null;
    try {
      localStorage.setItem(UTM_STORAGE_KEY, JSON.stringify(filtered));
    } catch {
      /* ignore */
    }
    return filtered;
  }

  function captureUtmFromSearch(search) {
    const fromUrl = parseUtmFromSearch(search);
    if (fromUrl) return saveStoredUtm(fromUrl);
    return loadStoredUtm();
  }

  function appendUtmToUrl(baseUrl, utm) {
    const data = utm || loadStoredUtm();
    if (!data) return baseUrl;
    try {
      const url = new URL(baseUrl, window.location.origin);
      for (const [key, value] of Object.entries(data)) {
        if (UTM_PARAMS.includes(key) && value) url.searchParams.set(key, value);
      }
      return url.toString();
    } catch {
      return baseUrl;
    }
  }

  function markPendingMarketingView(page, utm) {
    try {
      sessionStorage.setItem(
        PENDING_MARKETING_VIEW_KEY,
        JSON.stringify({ page, utm: utm || loadStoredUtm(), ts: Date.now() })
      );
    } catch {
      /* ignore */
    }
  }

  function markPendingMarketingCta(cta, utm) {
    try {
      sessionStorage.setItem(
        PENDING_MARKETING_CTA_KEY,
        JSON.stringify({ cta, utm: utm || loadStoredUtm(), ts: Date.now() })
      );
    } catch {
      /* ignore */
    }
  }

  global.HivelyUtm = {
    UTM_STORAGE_KEY,
    UTM_PARAMS,
    parseUtmFromSearch,
    loadStoredUtm,
    saveStoredUtm,
    captureUtmFromSearch,
    appendUtmToUrl,
    markPendingMarketingView,
    markPendingMarketingCta
  };
})(window);
