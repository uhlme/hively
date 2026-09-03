/**
 * Netlify Blobs helpers for Capgo OTA manifests and ZIP bundles.
 * Used by Netlify Functions (auto context) and CI (siteID + token).
 */

import { getStore } from '@netlify/blobs';

export const OTA_APP_ID = 'ch.hively.app';
export const OTA_CHANNELS = Object.freeze(['staging', 'production']);
export const MANIFEST_STORE = 'ota-manifests';
export const BUNDLE_STORE = 'ota-bundles';

/**
 * @param {string} channel
 * @returns {boolean}
 */
export function isOtaChannel(channel) {
  return OTA_CHANNELS.includes(String(channel || ''));
}

/**
 * @param {string} channel
 * @param {string} version
 * @returns {string}
 */
export function bundleKeyFor(channel, version) {
  return `${channel}/${version}.zip`;
}

/**
 * Semver-ish compare: returns negative if a < b, 0 if equal, positive if a > b.
 * Non-numeric segments compare lexicographically.
 * @param {string} a
 * @param {string} b
 */
export function compareVersions(a, b) {
  const pa = String(a || '')
    .split('.')
    .map((p) => (/^\d+$/.test(p) ? Number(p) : p));
  const pb = String(b || '')
    .split('.')
    .map((p) => (/^\d+$/.test(p) ? Number(p) : p));
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (typeof x === 'number' && typeof y === 'number') {
      if (x !== y) return x - y;
      continue;
    }
    const xs = String(x);
    const ys = String(y);
    if (xs !== ys) return xs < ys ? -1 : 1;
  }
  return 0;
}

/**
 * @param {string} version
 * @returns {boolean}
 */
export function isValidOtaVersion(version) {
  return /^[0-9]+(\.[0-9]+){0,2}$/.test(String(version || ''));
}

/**
 * Options for getStore when running outside Netlify Functions (CI).
 * @returns {{ siteID?: string, token?: string } | undefined}
 */
export function getCiBlobCredentials(env = process.env) {
  const siteID = env.NETLIFY_SITE_ID || env.SITE_ID || '';
  const token = env.NETLIFY_AUTH_TOKEN || env.NETLIFY_BLOBS_TOKEN || '';
  if (siteID && token) return { siteID, token };
  return undefined;
}

/**
 * @param {string} storeName
 * @param {{ siteID?: string, token?: string } | undefined} [creds]
 */
export function openOtaStore(storeName, creds = getCiBlobCredentials()) {
  if (creds?.siteID && creds?.token) {
    return getStore({ name: storeName, siteID: creds.siteID, token: creds.token, consistency: 'strong' });
  }
  // Inside Netlify Functions the runtime injects context automatically.
  return getStore({ name: storeName, consistency: 'strong' });
}

/**
 * @typedef {{ version: string, checksum: string, bundleKey: string, publishedAt: string }} OtaManifest
 */

/**
 * @param {unknown} raw
 * @returns {OtaManifest | null}
 */
export function parseManifest(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const version = String(/** @type {Record<string, unknown>} */ (raw).version || '');
  const checksum = String(/** @type {Record<string, unknown>} */ (raw).checksum || '');
  const bundleKey = String(/** @type {Record<string, unknown>} */ (raw).bundleKey || '');
  const publishedAt = String(/** @type {Record<string, unknown>} */ (raw).publishedAt || '');
  if (!isValidOtaVersion(version) || !checksum || !bundleKey) return null;
  return { version, checksum, bundleKey, publishedAt };
}

/**
 * @param {string} channel
 * @param {{ siteID?: string, token?: string } | undefined} [creds]
 * @returns {Promise<OtaManifest | null>}
 */
export async function readManifest(channel, creds) {
  if (!isOtaChannel(channel)) return null;
  const store = openOtaStore(MANIFEST_STORE, creds);
  try {
    const raw = await store.get(channel, { type: 'json' });
    return parseManifest(raw);
  } catch (err) {
    console.warn('[otaBlobs] readManifest failed:', err?.message || err);
    return null;
  }
}

/**
 * @param {string} channel
 * @param {OtaManifest} manifest
 * @param {{ siteID?: string, token?: string } | undefined} [creds]
 */
export async function writeManifest(channel, manifest, creds) {
  if (!isOtaChannel(channel)) throw new Error(`Invalid OTA channel: ${channel}`);
  const parsed = parseManifest(manifest);
  if (!parsed) throw new Error('Invalid OTA manifest');
  const store = openOtaStore(MANIFEST_STORE, creds);
  await store.setJSON(channel, parsed);
  return parsed;
}

/**
 * @param {string} key
 * @param {Buffer | Uint8Array | ArrayBuffer | Blob | string} data
 * @param {{ siteID?: string, token?: string } | undefined} [creds]
 */
export async function writeBundle(key, data, creds) {
  if (!/^(staging|production)\/[0-9]+(\.[0-9]+){0,2}\.zip$/.test(key)) {
    throw new Error(`Invalid OTA bundle key: ${key}`);
  }
  const store = openOtaStore(BUNDLE_STORE, creds);
  await store.set(key, data, {
    metadata: { contentType: 'application/zip' }
  });
}

/**
 * @param {string} key
 * @param {{ siteID?: string, token?: string } | undefined} [creds]
 * @returns {Promise<ArrayBuffer | null>}
 */
export async function readBundle(key, creds) {
  if (!/^(staging|production)\/[0-9]+(\.[0-9]+){0,2}\.zip$/.test(key)) {
    return null;
  }
  const store = openOtaStore(BUNDLE_STORE, creds);
  try {
    const data = await store.get(key, { type: 'arrayBuffer' });
    return data || null;
  } catch (err) {
    console.warn('[otaBlobs] readBundle failed:', err?.message || err);
    return null;
  }
}
