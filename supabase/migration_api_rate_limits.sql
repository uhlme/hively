-- Durable Gemini API rate-limit buckets (service_role only).
-- Used by server/geminiProxy.js when SUPABASE_SERVICE_ROLE_KEY is configured.

create table if not exists public.api_rate_limits (
  bucket_key text primary key,
  window_start timestamptz not null,
  hit_count integer not null default 0
    check (hit_count >= 0),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

alter table public.api_rate_limits enable row level security;

revoke all on table public.api_rate_limits from public, anon, authenticated;
-- service_role bypasses RLS by default; no policies for clients.
