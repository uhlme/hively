import { createClient } from '@supabase/supabase-js';
import { fetchWithTimeout } from './network.js';

// Environment variables configured in Vite (.env file or hosting settings)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

async function supabaseFetch(url, options = {}) {
  // Fail fast on dead/slow links instead of hanging the UI
  return fetchWithTimeout(url, options, 12000);
}

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
      global: { fetch: supabaseFetch },
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    })
  : null;

if (!supabase) {
  console.warn('Supabase credentials missing. App is running in Local-Only mode.');
}
