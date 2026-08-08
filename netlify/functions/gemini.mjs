import {
  handleGeminiRequest,
  geminiLambdaResponse
} from '../../server/geminiProxy.js';

function requestOrigin(headers = {}) {
  const h = headers || {};
  return h.origin || h.Origin || '';
}

export async function handler(event) {
  const origin = requestOrigin(event.headers);

  if (event.httpMethod === 'OPTIONS') {
    return geminiLambdaResponse(204, '', origin);
  }

  if (event.httpMethod !== 'POST') {
    return geminiLambdaResponse(405, { error: 'Method Not Allowed' }, origin);
  }

  if (event.body && event.body.length > 10 * 1024 * 1024) {
    return geminiLambdaResponse(413, { error: 'Payload zu gross (max. 10 MB).' }, origin);
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return geminiLambdaResponse(400, { error: 'Ungültiges JSON.' }, origin);
  }

  const result = await handleGeminiRequest(body, { headers: event.headers || {} });
  return geminiLambdaResponse(result.status, result.body, origin);
}
