/**
 * Capgo self-hosted update endpoint logic (shared by Netlify function + tests).
 */

import {
  OTA_APP_ID,
  bundleKeyFor,
  compareVersions,
  isOtaChannel,
  isValidOtaVersion,
  readManifest
} from './otaBlobs.js';
import { buildCorsJsonHeaders } from './corsHeaders.js';

/**
 * Public site origin for bundle download URLs.
 * @param {NodeJS.ProcessEnv} [env]
 */
export function getOtaPublicOrigin(env = process.env) {
  const raw =
    env.OTA_PUBLIC_ORIGIN ||
    env.APP_ORIGIN ||
    env.URL ||
    'https://hivelyy.netlify.app';
  return String(raw).replace(/\/$/, '');
}

/**
 * Resolve channel from Capgo POST body (defaultChannel) or query/custom fields.
 * @param {Record<string, unknown>} body
 * @param {URLSearchParams} [query]
 */
export function resolveOtaChannel(body = {}, query = new URLSearchParams()) {
  const candidates = [
    body.defaultChannel,
    body.channel,
    query.get('channel')
  ];
  for (const c of candidates) {
    const channel = String(c || '').trim();
    if (isOtaChannel(channel)) return channel;
  }
  return 'production';
}

/**
 * Capgo sends version_name (current JS bundle) and version_build (native).
 * Prefer the JS bundle version for OTA comparison.
 * @param {Record<string, unknown>} body
 */
export function resolveClientVersion(body = {}) {
  const name = String(body.version_name || '').trim();
  if (name && name !== 'builtin' && isValidOtaVersion(name.split('-')[0])) {
    return name.split('-')[0];
  }
  const build = String(body.version_build || '').trim();
  if (build && isValidOtaVersion(build.split('-')[0])) {
    return build.split('-')[0];
  }
  return name || build || '0.0.0';
}

/**
 * @param {Record<string, unknown>} body
 * @param {{ origin?: string, query?: URLSearchParams, env?: NodeJS.ProcessEnv }} [opts]
 * @returns {Promise<{ status: number, body: Record<string, unknown> }>}
 */
export async function handleOtaUpdateRequest(body = {}, opts = {}) {
  const env = opts.env || process.env;
  const query = opts.query || new URLSearchParams();
  const appId = String(body.app_id || body.appId || '').trim();

  if (appId && appId !== OTA_APP_ID) {
    return {
      status: 200,
      body: {
        error: 'no_new_version_available',
        message: `Unknown app_id: ${appId}`
      }
    };
  }

  const channel = resolveOtaChannel(body, query);
  const clientVersion = resolveClientVersion(body);
  const manifest = await readManifest(channel);

  if (!manifest) {
    return {
      status: 200,
      body: {
        error: 'no_new_version_available',
        message: `No OTA release for channel ${channel}`
      }
    };
  }

  if (compareVersions(manifest.version, clientVersion) <= 0) {
    return {
      status: 200,
      body: {
        error: 'no_new_version_available',
        message: `Already on ${clientVersion} (latest ${manifest.version})`
      }
    };
  }

  const origin = getOtaPublicOrigin(env);
  const url = `${origin}/api/ota-bundle/${manifest.bundleKey}`;

  return {
    status: 200,
    body: {
      version: manifest.version,
      url,
      checksum: manifest.checksum
    }
  };
}

/**
 * Netlify-style JSON response helper for the update endpoint.
 * @param {number} statusCode
 * @param {object | string} body
 * @param {string} [requestOrigin]
 */
export function otaLambdaResponse(statusCode, body, requestOrigin = '') {
  const headers = buildCorsJsonHeaders(requestOrigin);
  // Capgo update checks are POST; allow GET only for health/debug if needed later.
  headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
  return {
    statusCode,
    headers,
    body: body == null || body === '' ? '' : JSON.stringify(body)
  };
}

/**
 * Parse Capgo-compatible bundle path: staging/0.6.12.zip
 * @param {string} splat
 * @returns {{ channel: string, version: string, key: string } | null}
 */
export function parseBundlePath(splat) {
  const raw = String(splat || '').replace(/^\/+/, '');
  const m = raw.match(/^(staging|production)\/([0-9]+\.[0-9]+\.[0-9]+)\.zip$/);
  if (!m) return null;
  return {
    channel: m[1],
    version: m[2],
    key: bundleKeyFor(m[1], m[2])
  };
}
