import { describe, expect, it } from 'vitest';
import { stripeLambdaResponse } from '../server/stripeHandlers.js';
import { resolveAllowedOrigin } from '../server/corsHeaders.js';

describe('stripe Lambda CORS headers', () => {
  it('allows Capacitor/WebKit cross-origin preflight via allowlist', () => {
    expect(resolveAllowedOrigin('capacitor://localhost')).toBe('capacitor://localhost');
    expect(resolveAllowedOrigin('https://localhost')).toBe('https://localhost');
    const options = stripeLambdaResponse(204, '', 'capacitor://localhost');
    expect(options.statusCode).toBe(204);
    expect(options.headers['Access-Control-Allow-Origin']).toBe('capacitor://localhost');
    expect(options.headers['Access-Control-Allow-Methods']).toContain('POST');
    expect(options.headers['Access-Control-Allow-Methods']).toContain('OPTIONS');
    expect(options.headers['Access-Control-Allow-Headers']).toMatch(/Authorization/i);
    expect(options.body).toBe('');

    const android = stripeLambdaResponse(204, '', 'https://localhost');
    expect(android.headers['Access-Control-Allow-Origin']).toBe('https://localhost');
  });

  it('includes CORS headers on JSON responses for Vite origin', () => {
    const json = stripeLambdaResponse(
      200,
      { url: 'https://checkout.stripe.com/c/pay/cs_test' },
      'http://localhost:5173'
    );
    expect(json.statusCode).toBe(200);
    expect(json.headers['Access-Control-Allow-Origin']).toBe('http://localhost:5173');
    expect(JSON.parse(json.body).url).toContain('checkout.stripe.com');
  });
});
