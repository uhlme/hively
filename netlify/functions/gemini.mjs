import {
  handleGeminiRequest,
  geminiLambdaResponse
} from '../../server/geminiProxy.js';

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return geminiLambdaResponse(204, '');
  }

  if (event.httpMethod !== 'POST') {
    return geminiLambdaResponse(405, { error: 'Method Not Allowed' });
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return geminiLambdaResponse(400, { error: 'Ungültiges JSON.' });
  }

  const result = await handleGeminiRequest(body);
  return geminiLambdaResponse(result.status, result.body);
}
