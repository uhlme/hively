import {
  handleCreateCheckout,
  stripeLambdaResponse
} from '../../server/stripeHandlers.js';

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return stripeLambdaResponse(204, '');
  }
  if (event.httpMethod !== 'POST') {
    return stripeLambdaResponse(405, { error: 'Method Not Allowed' });
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return stripeLambdaResponse(400, { error: 'Ungültiges JSON.' });
  }

  const result = await handleCreateCheckout(body, { headers: event.headers || {} });
  return stripeLambdaResponse(result.status, result.body);
}
