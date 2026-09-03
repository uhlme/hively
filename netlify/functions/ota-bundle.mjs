import { readBundle } from '../../server/otaBlobs.js';
import { parseBundlePath } from '../../server/otaUpdates.js';

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      },
      body: ''
    };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method Not Allowed' })
    };
  }

  // Path after redirect: /api/ota-bundle/:splat → function receives path params
  // Prefer splat from redirect rewrite; fall back to raw path parsing.
  const splat =
    event.pathParameters?.splat ||
    event.pathParameters?.['0'] ||
    String(event.path || '')
      .replace(/^\/\.netlify\/functions\/ota-bundle\/?/, '')
      .replace(/^\/api\/ota-bundle\/?/, '');

  const parsed = parseBundlePath(splat);
  if (!parsed) {
    return {
      statusCode: 404,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Bundle not found' })
    };
  }

  const data = await readBundle(parsed.key);
  if (!data) {
    return {
      statusCode: 404,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Bundle not found' })
    };
  }

  const bytes = Buffer.from(data);
  return {
    statusCode: 200,
    isBase64Encoded: true,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Length': String(bytes.length),
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Access-Control-Allow-Origin': '*'
    },
    body: bytes.toString('base64')
  };
}
