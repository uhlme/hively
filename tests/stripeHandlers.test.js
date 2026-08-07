import { describe, expect, it } from 'vitest';
import { STRIPE_JSON_HEADERS, stripeLambdaResponse } from '../server/stripeHandlers.js';

describe('stripe Lambda CORS headers', () => {
  it('allows Capacitor/WebKit cross-origin preflight like the Gemini proxy', () => {
    expect(STRIPE_JSON_HEADERS['Access-Control-Allow-Origin']).toBe('*');
    expect(STRIPE_JSON_HEADERS['Access-Control-Allow-Methods']).toContain('POST');
    expect(STRIPE_JSON_HEADERS['Access-Control-Allow-Methods']).toContain('OPTIONS');
    expect(STRIPE_JSON_HEADERS['Access-Control-Allow-Headers']).toMatch(/Authorization/i);
  });

  it('includes CORS headers on OPTIONS and JSON responses', () => {
    const options = stripeLambdaResponse(204, '');
    expect(options.statusCode).toBe(204);
    expect(options.headers['Access-Control-Allow-Origin']).toBe('*');
    expect(options.body).toBe('');

    const json = stripeLambdaResponse(200, { url: 'https://checkout.stripe.com/c/pay/cs_test' });
    expect(json.statusCode).toBe(200);
    expect(json.headers['Access-Control-Allow-Origin']).toBe('*');
    expect(JSON.parse(json.body).url).toContain('checkout.stripe.com');
  });
});
