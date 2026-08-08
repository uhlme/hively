import { describe, expect, it } from 'vitest';
import { buildCorsJsonHeaders, resolveAllowedOrigin } from '../server/corsHeaders.js';

describe('corsHeaders allowlist', () => {
  it('allows Capacitor and local Vite origins', () => {
    expect(resolveAllowedOrigin('capacitor://localhost')).toBe('capacitor://localhost');
    expect(resolveAllowedOrigin('http://localhost:5173')).toBe('http://localhost:5173');
  });

  it('allows APP_ORIGIN / site URL and matching deploy previews only', () => {
    const env = { APP_ORIGIN: 'https://hivelyy.netlify.app', URL: 'https://hivelyy.netlify.app' };
    expect(resolveAllowedOrigin('https://hivelyy.netlify.app', env)).toBe(
      'https://hivelyy.netlify.app'
    );
    expect(resolveAllowedOrigin('https://deploy-preview-12--hivelyy.netlify.app', env)).toBe(
      'https://deploy-preview-12--hivelyy.netlify.app'
    );
  });

  it('does not reflect arbitrary origins or foreign Netlify sites', () => {
    const env = { APP_ORIGIN: 'https://hivelyy.netlify.app' };
    expect(resolveAllowedOrigin('https://evil.example', env)).toBe('https://hivelyy.netlify.app');
    expect(resolveAllowedOrigin('https://evil.netlify.app', env)).toBe(
      'https://hivelyy.netlify.app'
    );
    expect(resolveAllowedOrigin('https://deploy-preview-1--other.netlify.app', env)).toBe(
      'https://hivelyy.netlify.app'
    );
  });

  it('sets Vary: Origin on JSON CORS headers', () => {
    const headers = buildCorsJsonHeaders('http://localhost:5173');
    expect(headers['Access-Control-Allow-Origin']).toBe('http://localhost:5173');
    expect(headers.Vary).toBe('Origin');
    expect(headers['Access-Control-Allow-Headers']).toMatch(/Authorization/i);
  });
});
