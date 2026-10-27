import {
  claimOAuthHandoff,
  ensureHandoffBlobsContext,
  handoffLambdaResponse,
  storeOAuthHandoff
} from '../../server/oauthHandoff.js';

function requestOrigin(headers = {}) {
  const h = headers || {};
  return h.origin || h.Origin || '';
}

export async function handler(event) {
  ensureHandoffBlobsContext(event);
  const origin = requestOrigin(event.headers);

  if (event.httpMethod === 'OPTIONS') {
    return handoffLambdaResponse(204, '', origin);
  }

  if (event.httpMethod === 'POST') {
    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return handoffLambdaResponse(400, { error: 'invalid_json' }, origin);
    }
    const result = await storeOAuthHandoff(body);
    return handoffLambdaResponse(result.status, result.body, origin);
  }

  if (event.httpMethod === 'GET') {
    const id = event.queryStringParameters?.id || '';
    const result = await claimOAuthHandoff(id);
    return handoffLambdaResponse(result.status, result.body, origin);
  }

  return handoffLambdaResponse(405, { error: 'method_not_allowed' }, origin);
}
