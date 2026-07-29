import { fetchWithTimeout } from './network.js';
import { supabase } from './supabase.js';

const GEMINI_ENDPOINT = '/api/gemini';

/**
 * Call the server-side Gemini proxy (Netlify function / Vite middleware).
 * The API key never ships in the client bundle.
 */
export async function callGemini(action, payload = {}, timeoutMs = 60000) {
  const headers = { 'Content-Type': 'application/json' };
  if (supabase) {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`;
    }
  }

  const response = await fetchWithTimeout(
    GEMINI_ENDPOINT,
    {
      method: 'POST',
      headers,
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
