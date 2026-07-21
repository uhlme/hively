import { handleGeminiRequest, GEMINI_JSON_HEADERS } from '../../server/geminiProxy.js';

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: GEMINI_JSON_HEADERS, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: GEMINI_JSON_HEADERS,
      body: JSON.stringify({ error: 'Method Not Allowed' })
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return {
      statusCode: 400,
      headers: GEMINI_JSON_HEADERS,
      body: JSON.stringify({ error: 'Ungültiges JSON.' })
    };
  }

  const result = await handleGeminiRequest(body);
  return {
    statusCode: result.status,
    headers: GEMINI_JSON_HEADERS,
    body: JSON.stringify(result.body)
  };
}
