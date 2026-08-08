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

/**
 * Allow production Netlify site and its deploy previews only
 * (https://site.netlify.app and https://*--site.netlify.app) — not any *.netlify.app.
 */
function isAllowedNetlifyOrigin(origin, env = process.env) {
  if (!/^https:\/\//i.test(origin)) return false;

  const candidates = [env.URL, env.APP_ORIGIN, env.DEPLOY_PRIME_URL, 'https://hivelyy.netlify.app']
    .map(stripTrailingSlash)
    .filter(Boolean);

  for (const site of candidates) {
    if (origin === site) return true;
    const m = site.match(/^https:\/\/([a-z0-9-]+)\.netlify\.app$/i);
    if (!m) continue;
    const siteName = m[1];
    const preview = new RegExp(`^https://[a-z0-9-]+--${siteName}\\.netlify\\.app$`, 'i');
    if (preview.test(origin)) return true;
  }
  return false;
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
  if (origin && isAllowedNetlifyOrigin(origin, env)) return origin;
  // Literal "null" — deny reflection for unknown Origins (not the JS null value).
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
