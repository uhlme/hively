import { fetchWithTimeout } from './network.js';
import { supabase } from './supabase.js';

const GEMINI_ENDPOINT = '/api/gemini';

/**
 * Call the server-side Gemini proxy (Netlify function / Vite middleware).
 * The API key never ships in the client bundle.
 */
export async function callGemini(action, payload = {}, timeoutMs = 60000) {
  let authorization = '';
  if (supabase) {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      authorization = `Bearer ${session.access_token}`;
    }
  }

  const response = await fetchWithTimeout(
    GEMINI_ENDPOINT,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authorization ? { Authorization: authorization } : {})
      },
      body: JSON.stringify({ action, ...payload })
    },
    timeoutMs
  );

  let data = null;
  try {
    data = await response.json();
  } catch {
    // Non-JSON error bodies are fine; message falls back below.
  }

  if (!response.ok) {
    throw new Error(data?.error || `KI-Proxy-Fehler (${response.status})`);
  }

  return data;
}
