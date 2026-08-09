import { Capacitor } from '@capacitor/core';
import { fetchWithTimeout } from './network.js';
import { supabase } from './supabase.js';
import { getActiveOperationId } from './operations.js';
import { getLocale } from './i18n/index.js';

// In der nativen App lädt die WebView lokale Dateien (capacitor://localhost),
// ein relativer Pfad trifft dort keinen Server — deshalb absolut auf die
// Proxy-URL zeigen (env oder Produktions-Default).
const DEFAULT_NATIVE_GEMINI_PROXY = 'https://hivelyy.netlify.app/api/gemini';
const GEMINI_ENDPOINT = Capacitor.isNativePlatform()
  ? (import.meta.env.VITE_GEMINI_PROXY_URL || DEFAULT_NATIVE_GEMINI_PROXY)
  : '/api/gemini';

/** Exposed for tests / diagnostics. */
export function getGeminiEndpoint() {
  return GEMINI_ENDPOINT;
}

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
      body: JSON.stringify({
        action,
        ...payload,
        // Force client locale / active Betrieb (payload must not override).
        locale: getLocale(),
        operationId: getActiveOperationId()
      })
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
