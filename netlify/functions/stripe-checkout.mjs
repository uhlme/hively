import {
  handleCreateCheckout,
  stripeLambdaResponse
} from '../../server/stripeHandlers.js';

function requestOrigin(headers = {}) {
  const h = headers || {};
  return h.origin || h.Origin || '';
}

export async function handler(event) {
  const origin = requestOrigin(event.headers);

  if (event.httpMethod === 'OPTIONS') {
    return stripeLambdaResponse(204, '', origin);
  }
  if (event.httpMethod !== 'POST') {
    return stripeLambdaResponse(405, { error: 'Method Not Allowed' }, origin);
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return stripeLambdaResponse(400, { error: 'Ungültiges JSON.' }, origin);
  }

  const result = await handleCreateCheckout(body, { headers: event.headers || {} });
  return stripeLambdaResponse(result.status, result.body, origin);
}
