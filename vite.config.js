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

function sendJson(res, statusCode, body) {
  res.statusCode = statusCode;
  for (const [key, value] of Object.entries(GEMINI_JSON_HEADERS)) {
    res.setHeader(key, value);
  }
  res.end(body == null ? '' : JSON.stringify(body));
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
            body = JSON.parse((await readRequestBody(req)) || '{}');
          } catch {
            sendJson(res, 400, { error: 'Ungültiges JSON.' });
            return;
          }

          const result = await handleGeminiRequest(body);
          sendJson(res, result.status, result.body);
        } catch (err) {
          console.error('[vite gemini middleware]', err);
          sendJson(res, 500, { error: 'Interner Proxy-Fehler.' });
        }
      });
    }
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  process.env.GEMINI_API_KEY =
    env.GEMINI_API_KEY || env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';

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
