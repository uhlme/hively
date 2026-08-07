import {
  handleStripeWebhook,
  stripeLambdaResponse
} from '../../server/stripeHandlers.js';

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return stripeLambdaResponse(405, { error: 'Method Not Allowed' });
  }

  const signature =
    event.headers?.['stripe-signature'] ||
    event.headers?.['Stripe-Signature'] ||
    '';

  let rawBody = event.body || '';
  if (event.isBase64Encoded) {
    rawBody = Buffer.from(rawBody, 'base64').toString('utf8');
  }

  const result = await handleStripeWebhook(rawBody, signature);
  return stripeLambdaResponse(result.status, result.body);
}
