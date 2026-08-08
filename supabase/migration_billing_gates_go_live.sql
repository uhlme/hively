-- GO-LIVE ONLY: enable Pro RLS gates when Stripe billing is live.
-- Apply manually after Stripe price IDs + BILLING_ENABLED are configured:
--   psql / Supabase SQL editor → run this file
--
-- Revert:
--   update public.app_settings set value = 'false' where key = 'billing_gates_enabled';

update public.app_settings
set value = 'true',
    updated_at = timezone('utc'::text, now())
where key = 'billing_gates_enabled';

insert into public.app_settings (key, value)
values ('billing_gates_enabled', 'true')
on conflict (key) do update
  set value = 'true',
      updated_at = timezone('utc'::text, now());
