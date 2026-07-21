/**
 * Network helpers for flaky / low-signal field use.
 */
import { safeJsonParse } from './utils.js';

const PREFS_KEY = 'hively_network_prefs';
const DEFAULT_PREFS = {
  /** Prefer local data; sync manually or on good connections */
  fieldMode: true,
  /** Do not auto-upload AI media (voice/receipts) on reconnect */
  wifiOnlyMedia: true,
  /** Cache TTL for remote data pulls (ms) */
  remotePullTtlMs: 15 * 60 * 1000
};

function getNavigatorConnection() {
  return navigator.connection || navigator.mozConnection || navigator.webkitConnection || null;
}

export function getNetworkPrefs() {
  const stored = safeJsonParse(localStorage.getItem(PREFS_KEY), null);
  if (!stored || typeof stored !== 'object') return { ...DEFAULT_PREFS };
  return { ...DEFAULT_PREFS, ...stored };
}

export function saveNetworkPrefs(partial) {
  const next = { ...getNetworkPrefs(), ...partial };
  localStorage.setItem(PREFS_KEY, JSON.stringify(next));
  return next;
}

/** Effective connection type when available (4g/3g/2g/slow-2g). */
export function getConnectionType() {
  return getNavigatorConnection()?.effectiveType || null;
}

export function isSaveDataEnabled() {
  const conn = getNavigatorConnection();
  return !!(conn && conn.saveData);
}

/** True when the link looks expensive or weak. */
export function isConstrainedConnection() {
  if (isSaveDataEnabled()) return true;
  const type = getConnectionType();
  return type === 'slow-2g' || type === '2g' || type === '3g';
}

/** Should we attempt background network work (pulls, weather, AI)? */
export function shouldUseBackgroundNetwork() {
  if (!navigator.onLine) return false;
  const prefs = getNetworkPrefs();
  if (prefs.fieldMode && isConstrainedConnection()) return false;
  return true;
}

/** AI media uploads (large payloads) — only when allowed. */
export function shouldAutoProcessMedia() {
  if (!navigator.onLine) return false;
  const prefs = getNetworkPrefs();
  if (prefs.wifiOnlyMedia && isConstrainedConnection()) return false;
  return true;
}

/** fetch with AbortController timeout — fails fast on dead connections. */
export async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export function isNetworkError(err) {
  if (!err) return false;
  const msg = String(err.message || err.name || err).toLowerCase();
  return (
    err.name === 'AbortError' ||
    msg.includes('abort') ||
    msg.includes('network') ||
    msg.includes('failed to fetch') ||
    msg.includes('timeout') ||
    msg.includes('offline')
  );
}
