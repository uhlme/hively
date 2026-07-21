import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
import { handleGeminiRequest, GEMINI_JSON_HEADERS } from './server/geminiProxy.js';

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function geminiApiPlugin() {
  return {
    name: 'gemini-api-dev',
    configureServer(server) {
      server.middlewares.use('/api/gemini', async (req, res, next) => {
        if (req.method === 'OPTIONS') {
          res.statusCode = 204;
          Object.entries(GEMINI_JSON_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
          res.end();
          return;
        }
        if (req.method !== 'POST') {
          next();
          return;
        }

        try {
          const raw = await readRequestBody(req);
          let body;
          try {
            body = JSON.parse(raw || '{}');
          } catch {
            res.statusCode = 400;
            Object.entries(GEMINI_JSON_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
            res.end(JSON.stringify({ error: 'Ungültiges JSON.' }));
            return;
          }

          const result = await handleGeminiRequest(body);
          res.statusCode = result.status;
          Object.entries(GEMINI_JSON_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
          res.end(JSON.stringify(result.body));
        } catch (err) {
          console.error('[vite gemini middleware]', err);
          res.statusCode = 500;
          Object.entries(GEMINI_JSON_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
          res.end(JSON.stringify({ error: 'Interner Proxy-Fehler.' }));
        }
      });
    }
  };
}

export default defineConfig(({ mode }) => {
  // Load all .env keys (including non-VITE_) into process.env for the Gemini proxy
  const env = loadEnv(mode, process.cwd(), '');
  if (env.GEMINI_API_KEY) process.env.GEMINI_API_KEY = env.GEMINI_API_KEY;
  // Legacy fallback while migrating local .env files
  if (!process.env.GEMINI_API_KEY && env.VITE_GEMINI_API_KEY) {
    process.env.GEMINI_API_KEY = env.VITE_GEMINI_API_KEY;
  }

  return {
    plugins: [geminiApiPlugin()],
    test: {
      environment: 'jsdom',
      setupFiles: ['./tests/setup.js'],
      include: ['tests/**/*.test.js'],
      clearMocks: true,
      restoreMocks: true
    }
  };
});
