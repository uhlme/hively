import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
import fs from 'node:fs';
import path from 'node:path';
import { handleGeminiRequest } from './server/geminiProxy.js';
import {
  handleCreateCheckout,
  handleCreatePortal
} from './server/stripeHandlers.js';
import { buildCorsJsonHeaders } from './server/corsHeaders.js';

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function requestOrigin(req) {
  return req.headers?.origin || req.headers?.Origin || '';
}

function sendJson(res, statusCode, body, headers) {
  res.statusCode = statusCode;
  for (const [key, value] of Object.entries(headers || {})) {
    res.setHeader(key, value);
  }
  res.end(body == null || body === '' ? '' : JSON.stringify(body));
}

function publicMarketingPagesDevPlugin() {
  return {
    name: 'public-marketing-pages-dev',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') return next();
        const pathname = (req.url || '').split('?')[0];
        if (pathname !== '/start' && pathname !== '/start/') return next();
        const file = path.join(process.cwd(), 'public', 'start', 'index.html');
        if (!fs.existsSync(file)) return next();
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(fs.readFileSync(file, 'utf8'));
      });
    }
  };
}

function geminiApiPlugin() {
  return {
    name: 'gemini-api-dev',
    configureServer(server) {
      server.middlewares.use('/api/gemini', async (req, res, next) => {
        const cors = buildCorsJsonHeaders(requestOrigin(req));
        if (req.method === 'OPTIONS') {
          sendJson(res, 204, null, cors);
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
              sendJson(res, 413, { error: 'Payload zu gross (max. 10 MB).' }, cors);
              return;
            }
            body = JSON.parse(raw || '{}');
          } catch (parseErr) {
            if (parseErr instanceof SyntaxError) {
              sendJson(res, 400, { error: 'Ungültiges JSON.' }, cors);
              return;
            }
            throw parseErr;
          }

          const result = await handleGeminiRequest(body, { headers: req.headers || {} });
          sendJson(res, result.status, result.body, cors);
        } catch (err) {
          console.error('[vite gemini middleware]', err);
          sendJson(res, 500, { error: 'Interner Proxy-Fehler.' }, cors);
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
          const cors = buildCorsJsonHeaders(requestOrigin(req));
          if (req.method === 'OPTIONS') {
            sendJson(res, 204, null, cors);
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
            sendJson(res, result.status, result.body, cors);
          } catch (err) {
            console.error('[vite stripe middleware]', err);
            sendJson(res, 500, { error: 'Interner Billing-Fehler.' }, cors);
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
  process.env.GEMINI_API_KEY = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';
  for (const key of [
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'STRIPE_PRICE_MONTHLY',
    'STRIPE_PRICE_YEARLY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'VITE_SUPABASE_URL',
    'VITE_SUPABASE_ANON_KEY',
    'APP_ORIGIN',
    'URL',
    'VITE_BILLING_ENABLED',
    'BILLING_ENABLED'
  ]) {
    if (env[key]) process.env[key] = env[key];
  }

  return {
    plugins: [publicMarketingPagesDevPlugin(), geminiApiPlugin(), stripeApiPlugin()],
    test: {
      environment: 'jsdom',
      setupFiles: ['./tests/setup.js'],
      include: ['tests/**/*.test.js'],
      clearMocks: true,
      restoreMocks: true
    }
  };
});
