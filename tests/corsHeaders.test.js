import { describe, expect, it } from 'vitest';
import { buildCorsJsonHeaders, resolveAllowedOrigin } from '../server/corsHeaders.js';

describe('corsHeaders allowlist', () => {
  it('allows Capacitor and local Vite origins', () => {
    expect(resolveAllowedOrigin('capacitor://localhost')).toBe('capacitor://localhost');
    expect(resolveAllowedOrigin('http://localhost:5173')).toBe('http://localhost:5173');
  });

  it('allows APP_ORIGIN and Netlify deploy hosts', () => {
    const env = { APP_ORIGIN: 'https://hivelyy.netlify.app' };
    expect(resolveAllowedOrigin('https://hivelyy.netlify.app', env)).toBe(
      'https://hivelyy.netlify.app'
    );
    expect(resolveAllowedOrigin('https://deploy-preview-12--hivelyy.netlify.app', env)).toBe(
      'https://deploy-preview-12--hivelyy.netlify.app'
    );
  });

  it('does not reflect arbitrary origins', () => {
    const env = { APP_ORIGIN: 'https://hivelyy.netlify.app' };
    const resolved = resolveAllowedOrigin('https://evil.example', env);
    expect(resolved).toBe('https://hivelyy.netlify.app');
    expect(resolved).not.toBe('https://evil.example');
  });

  it('sets Vary: Origin on JSON CORS headers', () => {
    const headers = buildCorsJsonHeaders('http://localhost:5173');
    expect(headers['Access-Control-Allow-Origin']).toBe('http://localhost:5173');
    expect(headers.Vary).toBe('Origin');
    expect(headers['Access-Control-Allow-Headers']).toMatch(/Authorization/i);
  });
});
