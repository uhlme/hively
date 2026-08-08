/**
 * Shared CORS allowlist for Gemini + Stripe Netlify functions / Vite middleware.
 * Bearer-token APIs — reflect Origin only when allowlisted (Capacitor + app hosts).
 */

const LOCAL_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  'capacitor://localhost',
  'http://localhost',
  'ionic://localhost'
];

function stripTrailingSlash(url) {
  return String(url || '').trim().replace(/\/$/, '');
}

function configuredOrigins(env = process.env) {
  return [
    env.APP_ORIGIN,
    env.URL,
    env.DEPLOY_PRIME_URL,
    env.VITE_APP_ORIGIN,
    ...LOCAL_ORIGINS
  ]
    .map(stripTrailingSlash)
    .filter(Boolean);
}

function isNetlifyDeployOrigin(origin) {
  return /^https:\/\/([a-z0-9-]+\.)*netlify\.app$/i.test(origin);
}

/**
 * @param {string} [requestOrigin]
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string}
 */
export function resolveAllowedOrigin(requestOrigin, env = process.env) {
  const origin = stripTrailingSlash(requestOrigin);
  const allowed = configuredOrigins(env);
  if (origin && allowed.includes(origin)) return origin;
  if (origin && isNetlifyDeployOrigin(origin)) return origin;
  return allowed.find((o) => o.startsWith('https://')) || allowed[0] || 'null';
}

/**
 * @param {string} [requestOrigin]
 * @param {NodeJS.ProcessEnv} [env]
 */
export function buildCorsJsonHeaders(requestOrigin, env = process.env) {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': resolveAllowedOrigin(requestOrigin, env),
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    Vary: 'Origin'
  };
}
