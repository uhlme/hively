import { fetchWithTimeout } from './network.js';

const GEMINI_ENDPOINT = '/api/gemini';

/**
 * Call the server-side Gemini proxy (Netlify function / Vite middleware).
 * The API key never ships in the client bundle.
 */
export async function callGemini(action, payload = {}, timeoutMs = 60000) {
  const response = await fetchWithTimeout(
    GEMINI_ENDPOINT,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...payload })
    },
    timeoutMs
  );

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const message = data?.error || `KI-Proxy-Fehler (${response.status})`;
    throw new Error(message);
  }

  return data;
}
