/**
 * Short-lived OAuth code handoff for native Google Sign-In.
 * Chrome Custom Tabs often fail to bounce custom-scheme deep links; the HTTPS
 * bridge stores the PKCE code here so the app can claim it after Browser.close.
 */

import { connectLambda, getStore } from '@netlify/blobs';
import { buildCorsJsonHeaders, resolveAllowedOrigin } from './corsHeaders.js';

export const HANDOFF_STORE = 'oauth-handoff';
export const HANDOFF_TTL_MS = 5 * 60 * 1000;
// UUID preferred; also accept opaque client ids (crypto-ish, 16–128 chars).
const HANDOFF_ID_RE =
  /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|[A-Za-z0-9._-]{16,128})$/i;
const MAX_CODE_LEN = 2048;

/**
 * @param {unknown} event
 */
export function ensureHandoffBlobsContext(event) {
  if (!event || typeof event !== 'object') return;
  try {
    connectLambda(event);
  } catch (err) {
    console.warn('[oauthHandoff] connectLambda skipped:', err?.message || err);
  }
}

function handoffStore() {
  return getStore({ name: HANDOFF_STORE, consistency: 'strong' });
}

/**
 * @param {unknown} id
 * @returns {string|null}
 */
export function normalizeHandoffId(id) {
  const raw = String(id || '').trim();
  if (!HANDOFF_ID_RE.test(raw)) return null;
  return raw.toLowerCase();
}

/**
 * @param {unknown} code
 * @returns {string|null}
 */
export function normalizeOAuthCode(code) {
  const raw = String(code || '').trim();
  if (!raw || raw.length > MAX_CODE_LEN) return null;
  if (!/^[A-Za-z0-9._~+/-]+$/.test(raw)) return null;
  return raw;
}

/**
 * @param {unknown} mode
 * @returns {'sign-in'|'link'}
 */
export function normalizeOAuthMode(mode) {
  return mode === 'link' ? 'link' : 'sign-in';
}

/**
 * @param {{ id: string, code: string, mode?: string }} payload
 */
export async function storeOAuthHandoff(payload) {
  const id = normalizeHandoffId(payload?.id);
  const code = normalizeOAuthCode(payload?.code);
  if (!id || !code) {
    return { ok: false, status: 400, body: { error: 'invalid_handoff' } };
  }

  const mode = normalizeOAuthMode(payload?.mode);
  const expiresAt = Date.now() + HANDOFF_TTL_MS;
  const store = handoffStore();
  await store.setJSON(id, { code, mode, expiresAt });
  return { ok: true, status: 204, body: '' };
}

/**
 * Claim (read + delete) a handoff payload.
 * @param {string} idRaw
 */
export async function claimOAuthHandoff(idRaw) {
  const id = normalizeHandoffId(idRaw);
  if (!id) {
    return { ok: false, status: 400, body: { error: 'invalid_handoff' } };
  }

  const store = handoffStore();
  const data = await store.get(id, { type: 'json' });
  if (!data?.code) {
    return { ok: false, status: 404, body: { error: 'not_found' } };
  }

  await store.delete(id);

  if (!data.expiresAt || Date.now() > Number(data.expiresAt)) {
    return { ok: false, status: 410, body: { error: 'expired' } };
  }

  const code = normalizeOAuthCode(data.code);
  if (!code) {
    return { ok: false, status: 410, body: { error: 'invalid_code' } };
  }

  return {
    ok: true,
    status: 200,
    body: { code, mode: normalizeOAuthMode(data.mode) }
  };
}

/**
 * @param {number} status
 * @param {unknown} body
 * @param {string} [requestOrigin]
 */
export function handoffLambdaResponse(status, body, requestOrigin) {
  const headers = buildCorsJsonHeaders(requestOrigin);
  headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
  if (status === 204) {
    return { statusCode: 204, headers, body: '' };
  }
  return {
    statusCode: status,
    headers: {
      ...headers,
      'Access-Control-Allow-Origin': resolveAllowedOrigin(requestOrigin)
    },
    body: typeof body === 'string' ? body : JSON.stringify(body ?? {})
  };
}
