import {
  handleOtaUpdateRequest,
  otaLambdaResponse
} from '../../server/otaUpdates.js';

function requestOrigin(headers = {}) {
  const h = headers || {};
  return h.origin || h.Origin || '';
}

export async function handler(event) {
  const origin = requestOrigin(event.headers);

  if (event.httpMethod === 'OPTIONS') {
    return otaLambdaResponse(204, '', origin);
  }

  if (event.httpMethod !== 'POST') {
    return otaLambdaResponse(405, { error: 'Method Not Allowed' }, origin);
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return otaLambdaResponse(400, { error: 'Ungültiges JSON.' }, origin);
  }

  const query = new URLSearchParams(event.queryStringParameters || {});
  const result = await handleOtaUpdateRequest(body, { query });
  return otaLambdaResponse(result.status, result.body, origin);
}
