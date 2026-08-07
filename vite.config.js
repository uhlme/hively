import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
import { handleGeminiRequest, GEMINI_JSON_HEADERS } from './server/geminiProxy.js';
import {
  handleCreateCheckout,
  handleCreatePortal,
  STRIPE_JSON_HEADERS
} from './server/stripeHandlers.js';

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, body, headers = GEMINI_JSON_HEADERS) {
  res.statusCode = statusCode;
  for (const [key, value] of Object.entries(headers)) {
    res.setHeader(key, value);
  }
  res.end(body == null || body === '' ? '' : JSON.stringify(body));
}

function geminiApiPlugin() {
  return {
    name: 'gemini-api-dev',
    configureServer(server) {
      server.middlewares.use('/api/gemini', async (req, res, next) => {
        if (req.method === 'OPTIONS') {
          sendJson(res, 204, null);
          return;
        }
        if (req.method !== 'POST') {
          next();
          return;
        }

        try {
          let body;
          try {
            const raw = await readRequestBody(req);
            if (raw.length > 10 * 1024 * 1024) {
              sendJson(res, 413, { error: 'Payload zu gross (max. 10 MB).' });
              return;
            }
            body = JSON.parse(raw || '{}');
          } catch (parseErr) {
            if (parseErr instanceof SyntaxError) {
              sendJson(res, 400, { error: 'Ungültiges JSON.' });
              return;
            }
            throw parseErr;
          }

          const result = await handleGeminiRequest(body, { headers: req.headers || {} });
          sendJson(res, result.status, result.body);
        } catch (err) {
          console.error('[vite gemini middleware]', err);
          sendJson(res, 500, { error: 'Interner Proxy-Fehler.' });
        }
      });
    }
  };
}

function stripeApiPlugin() {
  return {
    name: 'stripe-api-dev',
    configureServer(server) {
      const mount = (path, handler) => {
        server.middlewares.use(path, async (req, res, next) => {
          if (req.method === 'OPTIONS') {
            sendJson(res, 204, null, STRIPE_JSON_HEADERS);
            return;
          }
          if (req.method !== 'POST') {
            next();
            return;
          }
          try {
            const raw = await readRequestBody(req);
            const body = JSON.parse(raw || '{}');
            const result = await handler(body, { headers: req.headers || {} });
            sendJson(res, result.status, result.body, STRIPE_JSON_HEADERS);
          } catch (err) {
            console.error('[vite stripe middleware]', err);
            sendJson(res, 500, { error: 'Interner Billing-Fehler.' }, STRIPE_JSON_HEADERS);
          }
        });
      };

      mount('/api/stripe/checkout', handleCreateCheckout);
      mount('/api/stripe/portal', handleCreatePortal);
    }
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  process.env.GEMINI_API_KEY =
    env.GEMINI_API_KEY || env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';
  for (const key of [
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'STRIPE_PRICE_MONTHLY',
    'STRIPE_PRICE_YEARLY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'VITE_SUPABASE_URL',
    'VITE_SUPABASE_ANON_KEY',
    'APP_ORIGIN',
    'VITE_BILLING_ENABLED',
    'BILLING_ENABLED'
  ]) {
    if (env[key]) process.env[key] = env[key];
  }

  return {
    plugins: [geminiApiPlugin(), stripeApiPlugin()],
    test: {
      environment: 'jsdom',
      setupFiles: ['./tests/setup.js'],
      include: ['tests/**/*.test.js'],
      clearMocks: true,
      restoreMocks: true
    }
  };
});
